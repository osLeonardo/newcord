import { randomBytes } from "node:crypto";
import { ServerEnvelope, type RegisterResponse } from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  doneReply,
  refusedReply,
  replyTo,
  sendRequest,
  settleRequests,
} from "./support/hub-request-kit.js";
import {
  fastFakeHasher,
  shareGroup,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  connectWithHello,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

let server: TestServer;
let alice: RegisterResponse;
let bruno: RegisterResponse;
let carla: RegisterResponse;
const clients: TestSocketClient[] = [];

beforeEach(async () => {
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => 1_000,
  });
  alice = await signUpAs(server.app, "alice");
  bruno = await signUpAs(server.app, "bruno");
  carla = await signUpAs(server.app, "carla");
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

/** Opaque bytes standing in for an MLS payload, in base64. */
function opaque(): string {
  return randomBytes(48).toString("base64");
}

function groupRow(groupId: string): { epoch: number; last_seq: number } {
  return server.database
    .prepare("SELECT epoch, last_seq FROM groups WHERE id = ?")
    .get(Buffer.from(groupId, "base64url")) as {
    epoch: number;
    last_seq: number;
  };
}

function membersOf(groupId: string): string[] {
  return server.database
    .prepare(
      "SELECT device_id FROM group_members WHERE group_id = ? ORDER BY device_id",
    )
    .pluck()
    .all(Buffer.from(groupId, "base64url")) as string[];
}

function acceptedInvitation(groupId: string, username: string): void {
  server.database
    .prepare(
      "INSERT INTO invitations (id, group_id, from_user, to_user, status, created_at) SELECT ?, ?, 1, id, 'accepted', 0 FROM users WHERE username = ?",
    )
    .run(
      randomBytes(16).toString("base64url"),
      Buffer.from(groupId, "base64url"),
      username,
    );
}

function countRows(table: string): number {
  return server.database
    .prepare(`SELECT count(*) FROM ${table}`)
    .pluck()
    .get() as number;
}

function commit(
  groupId: string,
  change: {
    epoch: number;
    added?: string[];
    removed?: string[];
    welcome?: string;
  },
): object {
  return {
    type: "mls.commit",
    groupId,
    epoch: change.epoch,
    added: change.added ?? [],
    removed: change.removed ?? [],
    commit: opaque(),
    ...(change.welcome === undefined ? {} : { welcome: change.welcome }),
  };
}

describe("mls.commit", () => {
  it("accepts a commit for the current epoch, adds the Devices it declares and closes the Invitation", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    acceptedInvitation(groupId, "bruno");
    const aliceSocket = await online(alice.accessToken);

    const requestId = sendRequest(
      aliceSocket,
      commit(groupId, { epoch: 0, added: [bruno.deviceId], welcome: opaque() }),
    );

    expect(await aliceSocket.nextEnvelope()).toEqual(
      doneReply(requestId, { seq: 1, epoch: 1 }),
    );
    expect(groupRow(groupId)).toEqual({ epoch: 1, last_seq: 2 });
    expect(membersOf(groupId)).toEqual([alice.deviceId, bruno.deviceId].sort());
    expect(countRows("invitations")).toBe(0);
  });

  it("delivers the welcome right after the commit to the added Device, with the Group's name", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    acceptedInvitation(groupId, "bruno");
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);
    const welcome = opaque();

    sendRequest(
      aliceSocket,
      commit(groupId, { epoch: 0, added: [bruno.deviceId], welcome }),
    );

    const delivered = await brunoSocket.nextEnvelope();
    expect(delivered).toEqual({
      v: 1,
      type: "mls.welcome",
      groupId,
      seq: 2,
      sender: { username: "alice", deviceId: alice.deviceId },
      groupName: "friends",
      welcome,
    });
    expect(Value.Check(ServerEnvelope, delivered)).toBe(true);
  });

  it("replays the welcome to an added Device that was offline", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    acceptedInvitation(groupId, "bruno");
    const aliceSocket = await online(alice.accessToken);
    const requestId = sendRequest(
      aliceSocket,
      commit(groupId, { epoch: 0, added: [bruno.deviceId], welcome: opaque() }),
    );
    await replyTo(aliceSocket, requestId);

    const brunoSocket = await online(bruno.accessToken);

    expect(await brunoSocket.nextEnvelope()).toMatchObject({
      type: "mls.welcome",
      seq: 2,
    });
  });

  it("sends fresh presence to everyone in the Group after a commit changes its Members", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    acceptedInvitation(groupId, "bruno");
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);

    const requestId = sendRequest(
      aliceSocket,
      commit(groupId, { epoch: 0, added: [bruno.deviceId], welcome: opaque() }),
    );

    expect((await replyTo(aliceSocket, requestId)).reply).toMatchObject({
      ok: true,
    });
    expect(await aliceSocket.nextEnvelope()).toEqual({
      v: 1,
      type: "presence",
      kind: "snapshot",
      usernames: ["alice", "bruno"],
    });
    await brunoSocket.nextEnvelope();
    expect(await brunoSocket.nextEnvelope()).toMatchObject({
      kind: "snapshot",
      usernames: ["alice", "bruno"],
    });
  });

  it("queues the commit, with its declared change, for every earlier Member Device but the sender, removed ones included", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
      carla.deviceId,
    ]);
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);
    const carlaSocket = await online(carla.accessToken);
    await aliceSocket.nextEnvelope();
    await aliceSocket.nextEnvelope();
    await brunoSocket.nextEnvelope();
    const change = commit(groupId, { epoch: 0, removed: [carla.deviceId] });

    sendRequest(aliceSocket, change);

    const expected = {
      v: 1,
      type: "mls.commit",
      groupId,
      seq: 1,
      sender: { username: "alice", deviceId: alice.deviceId },
      epoch: 0,
      added: [],
      removed: [carla.deviceId],
      commit: (change as { commit: string }).commit,
    };
    expect(await brunoSocket.nextEnvelope()).toEqual(expected);
    expect(await carlaSocket.nextEnvelope()).toEqual(expected);
    expect(membersOf(groupId)).toEqual([alice.deviceId, bruno.deviceId].sort());
  });

  it("refuses a second commit for the same epoch and leaves the Group as the first left it", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
    ]);
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);
    sendRequest(aliceSocket, commit(groupId, { epoch: 0 }));
    await aliceSocket.nextEnvelope();
    await aliceSocket.nextEnvelope();

    const late = sendRequest(brunoSocket, commit(groupId, { epoch: 0 }));

    expect((await replyTo(brunoSocket, late)).reply).toEqual(
      refusedReply(late, "WRONG_EPOCH"),
    );
    expect(groupRow(groupId)).toEqual({ epoch: 1, last_seq: 1 });
    expect(countRows("messages")).toBe(1);
  });

  it("refuses adding a Device with no reason to join", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    const aliceSocket = await online(alice.accessToken);

    const requestId = sendRequest(
      aliceSocket,
      commit(groupId, { epoch: 0, added: [bruno.deviceId], welcome: opaque() }),
    );

    expect(await aliceSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "INVALID_CHANGE"),
    );
    expect(groupRow(groupId)).toEqual({ epoch: 0, last_seq: 0 });
  });

  it("refuses a sender outside the Group", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    const brunoSocket = await online(bruno.accessToken);

    const requestId = sendRequest(brunoSocket, commit(groupId, { epoch: 0 }));

    expect(await brunoSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "NOT_A_MEMBER"),
    );
  });
});

describe("mls.message", () => {
  it("is stored once, queued for every other Member Device and pushed at once", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
      carla.deviceId,
    ]);
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);
    await aliceSocket.nextEnvelope();
    const message = opaque();

    const requestId = sendRequest(aliceSocket, {
      type: "mls.message",
      groupId,
      message,
    });

    expect(await aliceSocket.nextEnvelope()).toEqual(
      doneReply(requestId, { seq: 1 }),
    );
    expect(await brunoSocket.nextEnvelope()).toEqual({
      v: 1,
      type: "mls.message",
      groupId,
      seq: 1,
      sender: { username: "alice", deviceId: alice.deviceId },
      message,
    });
    expect({
      messages: countRows("messages"),
      deliveries: countRows("deliveries"),
    }).toEqual({
      messages: 1,
      deliveries: 2,
    });
  });

  it("is refused from a Device outside the Group", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    const brunoSocket = await online(bruno.accessToken);

    const requestId = sendRequest(brunoSocket, {
      type: "mls.message",
      groupId,
      message: opaque(),
    });

    expect(await brunoSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "NOT_A_MEMBER"),
    );
    expect(countRows("messages")).toBe(0);
  });
});

describe("offline delivery and acks", () => {
  async function aliceSendsThree(groupId: string): Promise<string[]> {
    const aliceSocket = await online(alice.accessToken);
    const messages = [opaque(), opaque(), opaque()];
    for (const message of messages) {
      sendRequest(aliceSocket, { type: "mls.message", groupId, message });
      await aliceSocket.nextEnvelope();
    }
    return messages;
  }

  it("replays everything queued, in sequence order, after hello", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
    ]);
    const messages = await aliceSendsThree(groupId);

    const brunoSocket = await online(bruno.accessToken);

    const replayed = [
      await brunoSocket.nextEnvelope(),
      await brunoSocket.nextEnvelope(),
      await brunoSocket.nextEnvelope(),
    ];
    expect(replayed).toMatchObject(
      messages.map((message, index) => ({
        type: "mls.message",
        seq: index + 1,
        message,
      })),
    );
  });

  it("deletes a Device's copy on ack, and the message once every copy is gone", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
      carla.deviceId,
    ]);
    await aliceSendsThree(groupId);
    const brunoSocket = await online(bruno.accessToken);
    const carlaSocket = await online(carla.accessToken);

    brunoSocket.sendEnvelope({ v: 1, type: "ack", groupId, seq: 1 });
    await settleRequests(brunoSocket);
    expect({
      messages: countRows("messages"),
      deliveries: countRows("deliveries"),
    }).toEqual({
      messages: 3,
      deliveries: 5,
    });

    carlaSocket.sendEnvelope({ v: 1, type: "ack", groupId, seq: 1 });
    await settleRequests(carlaSocket);

    expect({
      messages: countRows("messages"),
      deliveries: countRows("deliveries"),
    }).toEqual({
      messages: 2,
      deliveries: 4,
    });
  });

  it("keeps only the opaque bytes it was sent, with no readable message text", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
    ]);
    const messages = await aliceSendsThree(groupId);

    const stored = server.database
      .prepare("SELECT kind, payload, declared FROM messages ORDER BY seq")
      .all() as { kind: string; payload: Buffer; declared: string | null }[];

    expect(stored).toEqual(
      messages.map((message) => ({
        kind: "message",
        payload: Buffer.from(message, "base64"),
        declared: null,
      })),
    );
  });
});
