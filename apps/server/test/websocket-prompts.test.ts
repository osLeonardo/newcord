import { randomBytes } from "node:crypto";
import type { RegisterResponse } from "@newcord/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUEUE_CLEANUP_INTERVAL_MS } from "../src/queue/queue-cleanup.js";
import {
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
  logInOnNewDevice,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

const START = Date.UTC(2026, 9, 16, 12, 0, 0);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let server: TestServer;
let now: number;
let alice: RegisterResponse;
let bruno: RegisterResponse;
let carla: RegisterResponse;
const clients: TestSocketClient[] = [];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  now = START;
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => now,
  });
  alice = await signUpAs(server.app, "alice");
  bruno = await signUpAs(server.app, "bruno");
  carla = await signUpAs(server.app, "carla");
  await server.app.ready();
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await server.close();
  vi.useRealTimers();
});

async function online(accessToken: string): Promise<TestSocketClient> {
  const { client } = await connectWithHello(server.app, accessToken);
  clients.push(client);
  return client;
}

function opaque(): string {
  return randomBytes(48).toString("base64");
}

function userIdOf(username: string): number {
  return server.database
    .prepare("SELECT id FROM users WHERE username = ?")
    .pluck()
    .get(username) as number;
}

function insertInvitation(
  groupId: string,
  username: string,
  status: string,
): void {
  server.database
    .prepare(
      "INSERT INTO invitations (id, group_id, from_user, to_user, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      randomBytes(16).toString("base64url"),
      Buffer.from(groupId, "base64url"),
      userIdOf("alice"),
      userIdOf(username),
      status,
      now,
    );
}

async function commitAndWait(
  client: TestSocketClient,
  envelope: object,
): Promise<unknown> {
  const requestId = sendRequest(client, envelope);
  return (await replyTo(client, requestId)).reply;
}

function addCommit(
  groupId: string,
  epoch: number,
  deviceIds: string[],
): object {
  return {
    type: "mls.commit",
    groupId,
    epoch,
    added: deviceIds,
    removed: [],
    commit: opaque(),
    welcome: opaque(),
  };
}

describe("accepted Invitations", () => {
  it("prompt the first Member to connect, and stop once a commit adds the invitee", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    insertInvitation(groupId, "bruno", "accepted");

    const aliceSocket = await online(alice.accessToken);
    expect(await aliceSocket.nextEnvelope()).toEqual({
      v: 1,
      type: "invite.accepted",
      groupId,
      username: "bruno",
    });
    await commitAndWait(aliceSocket, addCommit(groupId, 0, [bruno.deviceId]));
    aliceSocket.terminate();

    const again = await online(alice.accessToken);
    expect(await settleRequests(again)).toEqual([]);
  });

  it("prompt the online Members at once when the invitee accepts", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    insertInvitation(groupId, "bruno", "pending");
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);
    const { invitationId } = (await brunoSocket.nextEnvelope()) as {
      invitationId: string;
    };

    sendRequest(brunoSocket, {
      type: "invite.reply",
      invitationId,
      accept: true,
    });

    expect(await aliceSocket.nextEnvelope()).toMatchObject({
      type: "invite.accepted",
      username: "bruno",
    });
  });
});

describe("new Devices (D56)", () => {
  it("prompt the online Members of each of the Account's Groups, and again on hello until added", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
    ]);
    const brunoSocket = await online(bruno.accessToken);

    const laptop = await logInOnNewDevice(server.app, "alice");

    const prompt = {
      v: 1,
      type: "device.new",
      groupId,
      username: "alice",
      deviceId: laptop.deviceId,
    };
    expect(await brunoSocket.nextEnvelope()).toEqual(prompt);
    const aliceSocket = await online(alice.accessToken);
    expect(await aliceSocket.nextEnvelope()).toEqual(prompt);
    await commitAndWait(aliceSocket, addCommit(groupId, 0, [laptop.deviceId]));
    brunoSocket.terminate();
    const later = await online(bruno.accessToken);
    expect(
      (await settleRequests(later)).filter(
        (envelope) => (envelope as { type: string }).type === "device.new",
      ),
    ).toEqual([]);
  });
});

describe("leaving (D57)", () => {
  async function threeMembers(): Promise<{
    groupId: string;
    aliceSocket: TestSocketClient;
    brunoSocket: TestSocketClient;
  }> {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
      carla.deviceId,
    ]);
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);
    await settleRequests(aliceSocket);
    return { groupId, aliceSocket, brunoSocket };
  }

  it("queues the leave request for the other Members and stops delivering to the leaver at once", async () => {
    const { groupId, aliceSocket, brunoSocket } = await threeMembers();
    const proposal = opaque();
    sendRequest(aliceSocket, {
      type: "mls.message",
      groupId,
      message: opaque(),
    });
    await settleRequests(aliceSocket);

    const leave = sendRequest(brunoSocket, {
      type: "mls.proposal",
      groupId,
      proposal,
    });
    const { reply } = await replyTo(brunoSocket, leave);
    sendRequest(aliceSocket, {
      type: "mls.message",
      groupId,
      message: opaque(),
    });
    const aliceSaw = await settleRequests(aliceSocket);

    expect(reply).toMatchObject({ ok: true, seq: 2 });
    expect(aliceSaw).toContainEqual({
      v: 1,
      type: "mls.proposal",
      groupId,
      seq: 2,
      sender: { username: "bruno", deviceId: bruno.deviceId },
      proposal,
    });
    const brunoWaiting = server.database
      .prepare("SELECT count(*) FROM deliveries WHERE device_id = ?")
      .pluck()
      .get(bruno.deviceId);
    expect(brunoWaiting).toBe(0);
    expect(
      (await settleRequests(brunoSocket)).map(
        (e) => (e as { type: string }).type,
      ),
    ).not.toContain("mls.message");
  });

  it("drops the leaver out of the Group's presence", async () => {
    const { groupId, aliceSocket, brunoSocket } = await threeMembers();

    await commitAndWait(brunoSocket, {
      type: "mls.proposal",
      groupId,
      proposal: opaque(),
    });

    expect(await settleRequests(aliceSocket)).toContainEqual({
      v: 1,
      type: "presence",
      kind: "snapshot",
      usernames: ["alice"],
    });
  });

  it("lets the next Member commit the leaver's removal", async () => {
    const { groupId, aliceSocket, brunoSocket } = await threeMembers();
    await commitAndWait(brunoSocket, {
      type: "mls.proposal",
      groupId,
      proposal: opaque(),
    });

    const reply = await commitAndWait(aliceSocket, {
      type: "mls.commit",
      groupId,
      epoch: 0,
      added: [],
      removed: [bruno.deviceId],
      commit: opaque(),
    });

    expect(reply).toMatchObject({ ok: true, epoch: 1 });
  });

  it("delivers to the leaver only the commit that removes it", async () => {
    const { groupId, aliceSocket, brunoSocket } = await threeMembers();
    await commitAndWait(brunoSocket, {
      type: "mls.proposal",
      groupId,
      proposal: opaque(),
    });
    await commitAndWait(aliceSocket, {
      type: "mls.commit",
      groupId,
      epoch: 0,
      added: [],
      removed: [],
      commit: opaque(),
    });

    await commitAndWait(aliceSocket, {
      type: "mls.commit",
      groupId,
      epoch: 1,
      added: [],
      removed: [bruno.deviceId],
      commit: opaque(),
    });

    const brunoSaw = (await settleRequests(brunoSocket)).filter(
      (envelope) => (envelope as { type: string }).type === "mls.commit",
    );
    expect(brunoSaw).toEqual([
      expect.objectContaining({ epoch: 1, removed: [bruno.deviceId] }),
    ]);
  });

  it("refuses a leave request from outside the Group", async () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    const brunoSocket = await online(bruno.accessToken);

    const reply = await commitAndWait(brunoSocket, {
      type: "mls.proposal",
      groupId,
      proposal: opaque(),
    });

    expect(reply).toMatchObject({ ok: false, code: "NOT_A_MEMBER" });
  });
});

describe("the hourly cleanup (D24)", () => {
  /** Moves time on; connected apps renew their tokens meanwhile, so the session check keeps them. */
  function runCleanupAfter(days: number): void {
    now += days * ONE_DAY_MS;
    server.database
      .prepare("UPDATE refresh_tokens SET expires_at = ?")
      .run(now + 30 * ONE_DAY_MS);
    vi.advanceTimersByTime(QUEUE_CLEANUP_INTERVAL_MS);
  }

  function countRows(table: string): number {
    return server.database
      .prepare(`SELECT count(*) FROM ${table}`)
      .pluck()
      .get() as number;
  }

  it("deletes copies older than 30 days and asks for a resync of a Device that missed a commit", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
      carla.deviceId,
    ]);
    const aliceSocket = await online(alice.accessToken);
    await commitAndWait(aliceSocket, {
      type: "mls.commit",
      groupId,
      epoch: 0,
      added: [],
      removed: [],
      commit: opaque(),
    });
    await commitAndWait(aliceSocket, {
      type: "mls.message",
      groupId,
      message: opaque(),
    });

    runCleanupAfter(30);
    expect(countRows("messages")).toBe(2);
    runCleanupAfter(1);

    expect(countRows("messages")).toBe(0);
    expect(countRows("deliveries")).toBe(0);
    const resync = (await settleRequests(aliceSocket)).filter(
      (envelope) => (envelope as { type: string }).type === "resync",
    );
    expect(
      resync.map((prompt) => (prompt as { deviceId: string }).deviceId).sort(),
    ).toEqual([bruno.deviceId, carla.deviceId].sort());
  });

  it("re-sends the resync prompt on hello until a commit re-adds the Device", async () => {
    const groupId = shareGroup(server.database, [
      alice.deviceId,
      bruno.deviceId,
    ]);
    const aliceSocket = await online(alice.accessToken);
    await commitAndWait(aliceSocket, {
      type: "mls.commit",
      groupId,
      epoch: 0,
      added: [],
      removed: [],
      commit: opaque(),
    });
    runCleanupAfter(31);
    aliceSocket.terminate();

    const later = await online(alice.accessToken);
    expect(await later.nextEnvelope()).toMatchObject({
      type: "resync",
      deviceId: bruno.deviceId,
    });
    await commitAndWait(later, {
      type: "mls.commit",
      groupId,
      epoch: 1,
      added: [bruno.deviceId],
      removed: [bruno.deviceId],
      commit: opaque(),
      welcome: opaque(),
    });
    later.terminate();
    const last = await online(alice.accessToken);

    expect(await settleRequests(last)).toEqual([]);
  });

  it("expires pending Invitations older than 30 days", () => {
    const groupId = shareGroup(server.database, [alice.deviceId]);
    insertInvitation(groupId, "bruno", "pending");

    runCleanupAfter(31);

    expect(
      server.database.prepare("SELECT status FROM invitations").pluck().all(),
    ).toEqual(["expired"]);
  });
});
