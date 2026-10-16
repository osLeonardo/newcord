import { randomBytes } from "node:crypto";
import type { LoginResponse, RegisterResponse } from "@newcord/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  doneReply,
  nextBesidesPrompts,
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
  logInOnNewDevice,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

/** About the size of an OpenMLS Key package for suite 1 with a basic credential. */
const REALISTIC_KEY_PACKAGE_BYTES = 400;

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

function keyPackage(): string {
  return randomBytes(REALISTIC_KEY_PACKAGE_BYTES).toString("base64");
}

function upload(
  accessToken: string | undefined,
  body: object,
): Promise<LightMyRequestResponse> {
  return server.app.inject({
    method: "POST",
    url: "/keypackages",
    payload: body,
    headers:
      accessToken === undefined
        ? {}
        : { authorization: `Bearer ${accessToken}` },
  });
}

async function uploadPackages(
  accessToken: string,
  ordinary: string[],
  lastResort?: string,
): Promise<void> {
  const response = await upload(accessToken, {
    keyPackages: ordinary,
    ...(lastResort === undefined ? {} : { lastResort }),
  });
  if (response.statusCode !== 200) throw new Error(response.body);
}

function acceptedInvitation(invitee: number): void {
  server.database
    .prepare(
      "INSERT INTO invitations (id, group_id, from_user, to_user, status, created_at) VALUES (?, ?, 1, ?, 'accepted', 0)",
    )
    .run(
      randomBytes(16).toString("base64url"),
      Buffer.from(groupId, "base64url"),
      invitee,
    );
}

function userIdOf(username: string): number {
  return server.database
    .prepare("SELECT id FROM users WHERE username = ?")
    .pluck()
    .get(username) as number;
}

function getKeyPackages(client: TestSocketClient, username: string): string {
  return sendRequest(client, { type: "keypackage.get", groupId, username });
}

describe("POST /keypackages", () => {
  it("stores a batch of 20 realistically sized packages and a last-resort one, returning the count", async () => {
    const response = await upload(bruno.accessToken, {
      keyPackages: Array.from({ length: 20 }, keyPackage),
      lastResort: keyPackage(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: 20 });
  });

  it("refuses an upload without an access token", async () => {
    expect((await upload(undefined, { keyPackages: [] })).statusCode).toBe(401);
  });

  it("refuses a batch of 21 ordinary packages", async () => {
    const response = await upload(bruno.accessToken, {
      keyPackages: Array.from({ length: 21 }, keyPackage),
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("the Key package count", () => {
  it("is sent after hello", async () => {
    await uploadPackages(bruno.accessToken, [keyPackage(), keyPackage()]);

    const { keyPackageCount } = await connectWithHello(
      server.app,
      bruno.accessToken,
    );

    expect(keyPackageCount).toEqual({
      v: 1,
      type: "keypackage.count",
      count: 2,
    });
  });

  it("is sent when a hand-out leaves fewer than 5 ordinary packages", async () => {
    await uploadPackages(
      bruno.accessToken,
      Array.from({ length: 5 }, keyPackage),
    );
    acceptedInvitation(userIdOf("bruno"));
    const brunoSocket = await online(bruno.accessToken);
    const aliceSocket = await online(alice.accessToken);

    getKeyPackages(aliceSocket, "bruno");

    expect(await brunoSocket.nextEnvelope()).toEqual({
      v: 1,
      type: "keypackage.count",
      count: 4,
    });
  });
});

describe("keypackage.get", () => {
  it("hands out one package per Device of an Account that accepted an Invitation, each once", async () => {
    now = 2_000;
    const laptop: LoginResponse = await logInOnNewDevice(server.app, "bruno");
    const phonePackages = [keyPackage(), keyPackage()];
    await uploadPackages(bruno.accessToken, phonePackages);
    await uploadPackages(laptop.accessToken, [keyPackage()], keyPackage());
    acceptedInvitation(userIdOf("bruno"));
    const aliceSocket = await online(alice.accessToken);

    const first = getKeyPackages(aliceSocket, "bruno");
    const reply = await nextBesidesPrompts(aliceSocket);
    const second = getKeyPackages(aliceSocket, "bruno");

    expect(reply).toEqual(
      doneReply(first, {
        keyPackages: [
          { deviceId: bruno.deviceId, keyPackage: phonePackages[0] },
          {
            deviceId: laptop.deviceId,
            keyPackage: expect.any(String) as string,
          },
        ],
      }),
    );
    expect(await nextBesidesPrompts(aliceSocket)).toMatchObject(
      doneReply(second, {
        keyPackages: [
          { deviceId: bruno.deviceId, keyPackage: phonePackages[1] },
          { deviceId: laptop.deviceId },
        ],
      }),
    );
  });

  it("hands out the last-resort package, and keeps it, when no ordinary one is left", async () => {
    const lastResort = keyPackage();
    await uploadPackages(bruno.accessToken, [], lastResort);
    acceptedInvitation(userIdOf("bruno"));
    const aliceSocket = await online(alice.accessToken);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestId = getKeyPackages(aliceSocket, "bruno");
      expect(await nextBesidesPrompts(aliceSocket)).toEqual(
        doneReply(requestId, {
          keyPackages: [{ deviceId: bruno.deviceId, keyPackage: lastResort }],
        }),
      );
    }
  });

  it("hands out a package of a co-Member's Device that is not in the Group yet (D56)", async () => {
    const laptop = await logInOnNewDevice(server.app, "alice");
    await uploadPackages(laptop.accessToken, [keyPackage()]);
    const aliceSocket = await online(alice.accessToken);

    const requestId = getKeyPackages(aliceSocket, "alice");

    expect(await nextBesidesPrompts(aliceSocket)).toMatchObject(
      doneReply(requestId, { keyPackages: [{ deviceId: laptop.deviceId }] }),
    );
  });

  it.each([
    ["an Account with only a pending Invitation", "pending"],
    ["an Account with no Invitation", undefined],
  ])("refuses %s", async (_case, status) => {
    await uploadPackages(bruno.accessToken, [keyPackage()]);
    if (status !== undefined) {
      server.database
        .prepare(
          "INSERT INTO invitations (id, group_id, from_user, to_user, status, created_at) VALUES ('i', ?, 1, ?, ?, 0)",
        )
        .run(Buffer.from(groupId, "base64url"), userIdOf("bruno"), status);
    }
    const aliceSocket = await online(alice.accessToken);

    const requestId = getKeyPackages(aliceSocket, "bruno");

    expect(await nextBesidesPrompts(aliceSocket)).toEqual(
      refusedReply(requestId, "NOTHING_TO_ADD"),
    );
  });

  it("refuses a co-Member whose Devices are all in the Group already", async () => {
    shareGroup(server.database, [bruno.deviceId]);
    server.database
      .prepare("INSERT INTO group_members (group_id, device_id) VALUES (?, ?)")
      .run(Buffer.from(groupId, "base64url"), bruno.deviceId);
    await uploadPackages(bruno.accessToken, [keyPackage()]);
    const aliceSocket = await online(alice.accessToken);

    const requestId = getKeyPackages(aliceSocket, "bruno");

    expect(await nextBesidesPrompts(aliceSocket)).toEqual(
      refusedReply(requestId, "NOTHING_TO_ADD"),
    );
  });

  it("refuses a caller outside the Group", async () => {
    const brunoSocket = await online(bruno.accessToken);

    const requestId = getKeyPackages(brunoSocket, "alice");

    expect(await brunoSocket.nextEnvelope()).toEqual(
      refusedReply(requestId, "NOT_A_MEMBER"),
    );
  });

  it("refuses the 61st request within an hour", async () => {
    const aliceSocket = await online(alice.accessToken);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      getKeyPackages(aliceSocket, "nobody");
      await nextBesidesPrompts(aliceSocket);
    }

    const requestId = getKeyPackages(aliceSocket, "bruno");

    expect(await nextBesidesPrompts(aliceSocket)).toEqual(
      refusedReply(requestId, "RATE_LIMITED"),
    );
  });
});
