import { ServerEnvelope, type RegisterResponse } from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  doneReply,
  refusedReply,
  sendRequest,
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
let now: number;
let alice: RegisterResponse;
let bruno: RegisterResponse;
let groupId: string;
const clients: TestSocketClient[] = [];

beforeEach(async () => {
  now = 1_000;
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => now,
  });
  alice = await signUpAs(server.app, "alice");
  bruno = await signUpAs(server.app, "bruno");
  groupId = shareGroup(server.database, [alice.deviceId]);
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

/** Adds an Account directly: sign-up is limited to 5 an hour per address. */
function insertAccount(username: string): void {
  server.database
    .prepare(
      "INSERT INTO users (username, password_hash, recovery_hash, created_at) VALUES (?, 'p', 'r', 0)",
    )
    .run(username);
}

function invitationRows(): unknown[] {
  return server.database
    .prepare("SELECT to_user, status, hidden FROM invitations ORDER BY rowid")
    .all();
}

function invitationIdOf(envelope: unknown): string {
  const { invitationId } = envelope as { invitationId: string };
  return invitationId;
}

async function inviteBruno(aliceSocket: TestSocketClient): Promise<unknown> {
  sendRequest(aliceSocket, { type: "invite", groupId, username: "bruno" });
  return aliceSocket.nextEnvelope();
}

describe("invite", () => {
  it("delivers the Invitation at once, with the Group's name and the inviter", async () => {
    const aliceSocket = await online(alice.accessToken);
    const brunoSocket = await online(bruno.accessToken);

    const requestId = sendRequest(aliceSocket, {
      type: "invite",
      groupId,
      username: "bruno",
    });

    expect(await aliceSocket.nextEnvelope()).toEqual(doneReply(requestId));
    const invitation = await brunoSocket.nextEnvelope();
    expect(invitation).toEqual({
      v: 1,
      type: "invitation",
      invitationId: expect.any(String) as string,
      groupId,
      groupName: "friends",
      from: "alice",
    });
    expect(Value.Check(ServerEnvelope, invitation)).toBe(true);
  });

  it("delivers a pending Invitation after the invitee's next hello", async () => {
    await inviteBruno(await online(alice.accessToken));

    const brunoSocket = await online(bruno.accessToken);

    expect(await brunoSocket.nextEnvelope()).toMatchObject({
      type: "invitation",
      from: "alice",
    });
  });

  it("stores an Invitation from a blocked inviter without delivering it, and answers the inviter alike", async () => {
    const brunoSocket = await online(bruno.accessToken);
    sendRequest(brunoSocket, { type: "block", username: "alice" });
    await brunoSocket.nextEnvelope();
    await brunoSocket.nextEnvelope();
    const aliceSocket = await online(alice.accessToken);

    const requestId = sendRequest(aliceSocket, {
      type: "invite",
      groupId,
      username: "bruno",
    });

    expect(await aliceSocket.nextEnvelope()).toEqual(doneReply(requestId));
    expect(invitationRows()).toEqual([
      { to_user: expect.any(Number) as number, status: "pending", hidden: 1 },
    ]);
    const later = (await connectWithHello(server.app, bruno.accessToken))
      .client;
    clients.push(later);
    sendRequest(later, { type: "unblock", username: "nobody" });
    expect(await later.nextEnvelope()).toMatchObject({ type: "reply" });
    expect(brunoSocket.unreadEnvelopes()).toEqual([]);
  });

  it.each([
    ["an unknown username", "nobody", "ACCOUNT_NOT_FOUND"],
    ["a current Member", "alice", "ALREADY_A_MEMBER"],
  ])("refuses %s", async (_case, username, code) => {
    const aliceSocket = await online(alice.accessToken);

    const requestId = sendRequest(aliceSocket, {
      type: "invite",
      groupId,
      username,
    });

    expect(await aliceSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, code),
    );
  });

  it("refuses a sender outside the Group", async () => {
    const brunoSocket = await online(bruno.accessToken);

    const requestId = sendRequest(brunoSocket, {
      type: "invite",
      groupId,
      username: "alice",
    });

    expect(await brunoSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "NOT_A_MEMBER"),
    );
  });

  it("refuses inviting someone already invited", async () => {
    const aliceSocket = await online(alice.accessToken);
    await inviteBruno(aliceSocket);

    expect(await inviteBruno(aliceSocket)).toMatchObject({
      ok: false,
      code: "ALREADY_INVITED",
    });
  });

  it("refuses an eleventh person, counting pending Invitations", async () => {
    const aliceSocket = await online(alice.accessToken);
    for (let person = 1; person <= 8; person += 1) {
      const username = `person_${person}`;
      insertAccount(username);
      sendRequest(aliceSocket, { type: "invite", groupId, username });
      expect(await aliceSocket.nextEnvelope()).toMatchObject({ ok: true });
    }
    expect(await inviteBruno(aliceSocket)).toMatchObject({ ok: true });
    insertAccount("eleventh");

    const requestId = sendRequest(aliceSocket, {
      type: "invite",
      groupId,
      username: "eleventh",
    });

    expect(await aliceSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "GROUP_FULL"),
    );
  });

  it("refuses the 21st Invitation within an hour, and allows more after it", async () => {
    const aliceSocket = await online(alice.accessToken);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      sendRequest(aliceSocket, { type: "invite", groupId, username: "nobody" });
      await aliceSocket.nextEnvelope();
    }

    expect(await inviteBruno(aliceSocket)).toMatchObject({
      code: "RATE_LIMITED",
    });
    now += 60 * 60 * 1000;
    expect(await inviteBruno(aliceSocket)).toMatchObject({ ok: true });
  });
});

describe("invite.reply", () => {
  async function pendingInvitation(): Promise<{
    brunoSocket: TestSocketClient;
    invitationId: string;
  }> {
    await inviteBruno(await online(alice.accessToken));
    const brunoSocket = await online(bruno.accessToken);
    return {
      brunoSocket,
      invitationId: invitationIdOf(await brunoSocket.nextEnvelope()),
    };
  }

  it.each([
    [true, "accepted"],
    [false, "declined"],
  ])("with accept %s sets the status to %s", async (accept, status) => {
    const { brunoSocket, invitationId } = await pendingInvitation();

    const requestId = sendRequest(brunoSocket, {
      type: "invite.reply",
      invitationId,
      accept,
    });

    expect(await brunoSocket.nextEnvelope()).toEqual(doneReply(requestId));
    expect(invitationRows()).toMatchObject([{ status }]);
  });

  it("refuses a reply to an Invitation no longer pending", async () => {
    const { brunoSocket, invitationId } = await pendingInvitation();
    sendRequest(brunoSocket, {
      type: "invite.reply",
      invitationId,
      accept: false,
    });
    await brunoSocket.nextEnvelope();

    const requestId = sendRequest(brunoSocket, {
      type: "invite.reply",
      invitationId,
      accept: true,
    });

    expect(await brunoSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "INVITATION_NOT_FOUND"),
    );
  });

  it("refuses a reply from anyone but the invitee", async () => {
    const { invitationId } = await pendingInvitation();
    const aliceSocket = clients[0];
    if (aliceSocket === undefined) throw new Error("Alice is not online");

    const requestId = sendRequest(aliceSocket, {
      type: "invite.reply",
      invitationId,
      accept: true,
    });

    expect(await aliceSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "INVITATION_NOT_FOUND"),
    );
    expect(invitationRows()).toMatchObject([{ status: "pending" }]);
  });
});

describe("the Key directory (D64)", () => {
  function lookUp(callerToken: string, username: string): Promise<number> {
    return server.app
      .inject({
        method: "GET",
        url: `/users/${username}/keys`,
        headers: { authorization: `Bearer ${callerToken}` },
      })
      .then((response) => response.statusCode);
  }

  it("answers a stranger's lookup like an unknown username", async () => {
    await expect(lookUp(alice.accessToken, "bruno")).resolves.toBe(404);
    await expect(lookUp(alice.accessToken, "alice")).resolves.toBe(200);
  });

  it("answers both ways once an Invitation is pending", async () => {
    await inviteBruno(await online(alice.accessToken));

    await expect(lookUp(alice.accessToken, "bruno")).resolves.toBe(200);
    await expect(lookUp(bruno.accessToken, "alice")).resolves.toBe(200);
  });
});
