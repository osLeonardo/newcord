import { randomBytes } from "node:crypto";
import {
  ServerEnvelope,
  WebSocketCloseCode,
  type RegisterResponse,
} from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fastFakeHasher,
  shareGroup,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  connectWithHello,
  logInOnNewDevice,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

let server: TestServer;
let alice: RegisterResponse;
let bruno: RegisterResponse;
const clients: TestSocketClient[] = [];
let nextRequest = 0;

beforeEach(async () => {
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => 1_000,
  });
  alice = await signUpAs(server.app, "alice");
  bruno = await signUpAs(server.app, "bruno");
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await server.close();
});

async function online(accessToken: string): Promise<TestSocketClient> {
  const { client } = await connectWithHello(server.app, accessToken);
  clients.push(client);
  return client;
}

/** Sends a request Envelope with a fresh request ID and returns the ID. */
function request(client: TestSocketClient, envelope: object): string {
  nextRequest += 1;
  const requestId = `r-${nextRequest}`;
  client.sendEnvelope({ v: 1, requestId, ...envelope });
  return requestId;
}

function done(requestId: string): object {
  return { v: 1, type: "reply", requestId, ok: true };
}

function refused(requestId: string, code: string): object {
  return { v: 1, type: "reply", requestId, ok: false, code };
}

function newGroupId(): string {
  return randomBytes(16).toString("base64url");
}

function groupRow(groupId: string): unknown {
  return server.database
    .prepare("SELECT name, epoch, created_at FROM groups WHERE id = ?")
    .get(Buffer.from(groupId, "base64url"));
}

function membersOf(groupId: string): string[] {
  return server.database
    .prepare("SELECT device_id FROM group_members WHERE group_id = ?")
    .pluck()
    .all(Buffer.from(groupId, "base64url")) as string[];
}

describe("group.create", () => {
  it("stores the Group at epoch 0 with the sender's Device as its only Member", async () => {
    const client = await online(alice.accessToken);
    const groupId = newGroupId();

    const requestId = request(client, {
      type: "group.create",
      groupId,
      name: "friends",
    });

    expect(await client.nextEnvelope()).toEqual(done(requestId));
    expect(groupRow(groupId)).toEqual({
      name: "friends",
      epoch: 0,
      created_at: 1_000,
    });
    expect(membersOf(groupId)).toEqual([alice.deviceId]);
  });

  it("refuses an ID already taken", async () => {
    const groupId = shareGroup(server.database, [bruno.deviceId]);
    const client = await online(alice.accessToken);

    const requestId = request(client, {
      type: "group.create",
      groupId,
      name: "mine",
    });

    const reply = await client.nextEnvelope();
    expect(reply).toEqual(refused(requestId, "GROUP_EXISTS"));
    expect(Value.Check(ServerEnvelope, reply)).toBe(true);
    expect(membersOf(groupId)).toEqual([bruno.deviceId]);
  });

  it.each([
    ["a 15-byte ID", { groupId: randomBytes(15).toString("base64url") }],
    ["an empty name", { name: "" }],
    ["a name of 65 characters", { name: "n".repeat(65) }],
  ])(
    "closes the socket with the rejection code for %s",
    async (_case, change) => {
      const client = await online(alice.accessToken);

      request(client, {
        type: "group.create",
        groupId: newGroupId(),
        name: "friends",
        ...change,
      });

      expect(await client.closed).toMatchObject({
        code: WebSocketCloseCode.EnvelopeRejected,
      });
    },
  );
});

describe("group.rename", () => {
  it("renames the Group and tells its other online Member Devices who did", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
    ]);
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);
    await aliceSocket.nextEnvelope();

    const requestId = request(aliceSocket, {
      type: "group.rename",
      groupId,
      name: "family",
    });

    expect(await aliceSocket.nextEnvelope()).toEqual(done(requestId));
    expect(await brunoSocket.nextEnvelope()).toEqual({
      v: 1,
      type: "group.renamed",
      groupId,
      name: "family",
      by: "alice",
    });
    expect(groupRow(groupId)).toMatchObject({ name: "family" });
  });

  it("refuses a Device outside the Group, and a Group that does not exist, alike", async () => {
    const groupId = shareGroup(server.database, [bruno.deviceId]);
    const client = await online(alice.accessToken);

    const outside = request(client, {
      type: "group.rename",
      groupId,
      name: "mine",
    });
    const unknown = request(client, {
      type: "group.rename",
      groupId: newGroupId(),
      name: "mine",
    });

    expect(await client.nextEnvelope()).toEqual(
      refused(outside, "NOT_A_MEMBER"),
    );
    expect(await client.nextEnvelope()).toEqual(
      refused(unknown, "NOT_A_MEMBER"),
    );
    expect(groupRow(groupId)).toMatchObject({ name: "friends" });
  });
});

describe("block and unblock", () => {
  it("sends the new block list to every connected Device of the Account", async () => {
    const phone = await online(alice.accessToken);
    const laptop = await online(
      (await logInOnNewDevice(server.app, "alice")).accessToken,
    );

    const requestId = request(phone, { type: "block", username: "bruno" });

    const blockList = { v: 1, type: "blocks", usernames: ["bruno"] };
    expect(await phone.nextEnvelope()).toEqual(done(requestId));
    expect(await phone.nextEnvelope()).toEqual(blockList);
    expect(await laptop.nextEnvelope()).toEqual(blockList);
  });

  it("sends the block list after hello", async () => {
    const phone = await online(alice.accessToken);
    request(phone, { type: "block", username: "bruno" });

    const { blockList } = await connectWithHello(
      server.app,
      (await logInOnNewDevice(server.app, "alice")).accessToken,
    );

    expect(blockList).toEqual({ v: 1, type: "blocks", usernames: ["bruno"] });
  });

  it("is harmless when repeated, and unblock removes the block", async () => {
    const phone = await online(alice.accessToken);
    request(phone, { type: "block", username: "bruno" });
    request(phone, { type: "block", username: "bruno" });
    const unblock = request(phone, { type: "unblock", username: "bruno" });

    const envelopes = await Promise.all(
      Array.from({ length: 6 }, () => phone.nextEnvelope()),
    );

    expect(envelopes.at(-2)).toEqual(done(unblock));
    expect(envelopes.at(-1)).toEqual({ v: 1, type: "blocks", usernames: [] });
  });

  it("refuses blocking oneself and an unknown username, sending no block list", async () => {
    const phone = await online(alice.accessToken);

    const self = request(phone, { type: "block", username: "alice" });
    const unknown = request(phone, { type: "unblock", username: "nobody" });
    const fine = request(phone, { type: "unblock", username: "bruno" });

    expect(await phone.nextEnvelope()).toEqual(
      refused(self, "CANNOT_BLOCK_SELF"),
    );
    expect(await phone.nextEnvelope()).toEqual(
      refused(unknown, "ACCOUNT_NOT_FOUND"),
    );
    expect(await phone.nextEnvelope()).toEqual(done(fine));
  });
});
