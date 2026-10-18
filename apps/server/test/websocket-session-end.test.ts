import {
  WebSocketCloseCode,
  type LoginResponse,
  type RefreshResponse,
  type RegisterResponse,
} from "@newcord/shared";
import { nextBesidesPrompts } from "./support/hub-request-kit.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changePassword,
  fastFakeHasher,
  login,
  logout,
  recoverPassword,
  refresh,
  refreshTokenRow,
  shareGroup,
  signUp,
  SLOW_HEARTBEAT_MS,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  SOCKET_TEST_PASSWORD,
  connectWithHello,
  logInOnNewDevice,
  presenceChange,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const NEW_PASSWORD = "a brand new password";

let server: TestServer;
let now: number;
/** Every Account these tests sign up joins this Group, so they all see each other online. */
let sharedGroupId: Buffer;
const clients: TestSocketClient[] = [];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  now = NOW;
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => now,
    heartbeatIntervalMs: SLOW_HEARTBEAT_MS,
  });
  sharedGroupId = Buffer.from(shareGroup(server.database, []), "base64url");
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await server.close();
  vi.useRealTimers();
});

/** Signs `username` up and puts its Device in the shared Group. */
async function memberSignUp(username: string): Promise<RegisterResponse> {
  const body = await signUpAs(server.app, username);
  joinSharedGroup(body.deviceId);
  return body;
}

function joinSharedGroup(deviceId: string): void {
  server.database
    .prepare("INSERT INTO group_members (group_id, device_id) VALUES (?, ?)")
    .run(sharedGroupId, deviceId);
}

async function online(accessToken: string): Promise<TestSocketClient> {
  const { client } = await connectWithHello(server.app, accessToken);
  clients.push(client);
  return client;
}

const bearer = (accessToken: string): string => `Bearer ${accessToken}`;
const sessionEnded = { code: WebSocketCloseCode.SessionEnded };

describe("POST /logout", () => {
  it("closes every socket of that Device at once with the session-ended close code", async () => {
    const alice = await memberSignUp("alice");
    const first = await online(alice.accessToken);
    const second = await online(alice.accessToken);

    const response = await logout(server.app, bearer(alice.accessToken));

    expect(response.statusCode).toBe(204);
    expect(await first.closed).toMatchObject(sessionEnded);
    expect(await second.closed).toMatchObject(sessionEnded);
  });

  it("leaves other Accounts' sockets open and tells them the Account went offline", async () => {
    const alice = await memberSignUp("alice");
    const aliceSocket = await online(alice.accessToken);
    const bobSocket = await online((await memberSignUp("bob")).accessToken);

    await logout(server.app, bearer(alice.accessToken));
    await aliceSocket.closed;

    expect(await nextBesidesPrompts(bobSocket)).toEqual(
      presenceChange("offline", "alice"),
    );
    expect(bobSocket.isOpen()).toBe(true);
  });

  it("closes only that Device's sockets when the Account has two Devices online, and sends no offline change", async () => {
    const alice = await memberSignUp("alice");
    const phone = await online(alice.accessToken);
    const laptop = await online(
      (await logInOnNewDevice(server.app, "alice")).accessToken,
    );
    const bobSocket = await online((await memberSignUp("bob")).accessToken);

    await logout(server.app, bearer(alice.accessToken));
    expect(await phone.closed).toMatchObject(sessionEnded);
    await online((await memberSignUp("carol")).accessToken);

    expect(await nextBesidesPrompts(bobSocket)).toEqual(
      presenceChange("online", "carol"),
    );
    expect(await nextBesidesPrompts(laptop)).toMatchObject(
      presenceChange("online", "bob"),
    );
    expect(await nextBesidesPrompts(laptop)).toEqual(
      presenceChange("online", "carol"),
    );
  });
});

describe("POST /refresh with a used refresh token (D62)", () => {
  it("closes every socket of that Device at once with the session-ended close code", async () => {
    const alice = await memberSignUp("alice");
    const aliceSocket = await online(alice.accessToken);
    const bobSocket = await online((await memberSignUp("bob")).accessToken);
    await nextBesidesPrompts(aliceSocket);
    expect((await refresh(server.app, alice.refreshToken)).statusCode).toBe(
      200,
    );

    const reuse = await refresh(server.app, alice.refreshToken);

    expect(reuse.statusCode).toBe(401);
    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
    expect(bobSocket.isOpen()).toBe(true);
  });

  it("leaves the socket open on a normal refresh", async () => {
    const alice = await memberSignUp("alice");
    const aliceSocket = await online(alice.accessToken);

    const fresh = (
      await refresh(server.app, alice.refreshToken)
    ).json<RefreshResponse>();
    await online((await memberSignUp("bob")).accessToken);

    expect(fresh.refreshToken).toBeDefined();
    expect(await nextBesidesPrompts(aliceSocket)).toEqual(
      presenceChange("online", "bob"),
    );
  });
});

describe("the 15-minute session check", () => {
  it("closes the sockets of a Device whose refresh tokens are all used", async () => {
    const alice = await memberSignUp("alice");
    const aliceSocket = await online(alice.accessToken);
    server.database.prepare("UPDATE refresh_tokens SET used_at = ?").run(NOW);

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);

    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
  });

  it("closes the sockets of a Device whose refresh token expired, and only those", async () => {
    const alice = await memberSignUp("alice");
    now = NOW + 20 * ONE_DAY_MS;
    const bob = await memberSignUp("bob");
    const aliceSocket = await online(alice.accessToken);
    const bobSocket = await online(bob.accessToken);
    await nextBesidesPrompts(aliceSocket);
    now = NOW + 30 * ONE_DAY_MS;

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);

    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
    expect(await nextBesidesPrompts(bobSocket)).toEqual(
      presenceChange("offline", "alice"),
    );
    expect(bobSocket.isOpen()).toBe(true);
  });

  it("waits the full 15 minutes before checking", async () => {
    const alice = await memberSignUp("alice");
    const aliceSocket = await online(alice.accessToken);
    server.database.prepare("DELETE FROM refresh_tokens").run();

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS - 1);
    await online((await memberSignUp("bob")).accessToken);
    expect(await nextBesidesPrompts(aliceSocket)).toEqual(
      presenceChange("online", "bob"),
    );

    vi.advanceTimersByTime(1);
    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
  });

  it("keeps the sockets of a Device that still has an unused, unexpired refresh token", async () => {
    const alice = await memberSignUp("alice");
    const aliceSocket = await online(alice.accessToken);
    await refresh(server.app, alice.refreshToken);

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);
    await online((await memberSignUp("bob")).accessToken);

    expect(await nextBesidesPrompts(aliceSocket)).toEqual(
      presenceChange("online", "bob"),
    );
    expect(refreshTokenRow(server.database, alice.refreshToken)).toMatchObject({
      used_at: NOW,
    });
  });
});

describe("POST /password/change (D66)", () => {
  it("closes the sockets of the Account's other Devices with the session-ended close code, and keeps the caller's open", async () => {
    const bobSocket = await online((await memberSignUp("bob")).accessToken);
    const alice = await memberSignUp("alice");
    const phone = await online(alice.accessToken);
    const laptop = await online(
      (await logInOnNewDevice(server.app, "alice")).accessToken,
    );
    const desktop = await online(
      (await logInOnNewDevice(server.app, "alice")).accessToken,
    );
    await nextBesidesPrompts(bobSocket);

    const response = await changePassword(
      server.app,
      { newPassword: NEW_PASSWORD },
      bearer(alice.accessToken),
    );

    expect(response.statusCode).toBe(204);
    expect(await laptop.closed).toMatchObject(sessionEnded);
    expect(await desktop.closed).toMatchObject(sessionEnded);
    await online((await memberSignUp("carol")).accessToken);
    expect(await nextBesidesPrompts(phone)).toEqual(
      presenceChange("online", "carol"),
    );
    expect(await nextBesidesPrompts(bobSocket)).toEqual(
      presenceChange("online", "carol"),
    );
  });
});

describe("POST /password/recover (D66)", () => {
  it("closes every socket of the Account with the session-ended close code and tells others it went offline", async () => {
    const bobSocket = await online((await memberSignUp("bob")).accessToken);
    const alice = await memberSignUp("alice");
    const phone = await online(alice.accessToken);
    const laptop = await online(
      (await logInOnNewDevice(server.app, "alice")).accessToken,
    );
    await nextBesidesPrompts(bobSocket);

    const response = await recoverPassword(server.app, {
      username: "alice",
      recoveryCode: alice.recoveryCode,
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(200);
    expect(await phone.closed).toMatchObject(sessionEnded);
    expect(await laptop.closed).toMatchObject(sessionEnded);
    expect(await nextBesidesPrompts(bobSocket)).toEqual(
      presenceChange("offline", "alice"),
    );
    expect(bobSocket.isOpen()).toBe(true);
  });

  it("leaves the sockets open when the code is wrong", async () => {
    const alice = await memberSignUp("alice");
    const phone = await online(alice.accessToken);

    const response = await recoverPassword(server.app, {
      username: "alice",
      recoveryCode: "Z".repeat(24),
      newPassword: NEW_PASSWORD,
    });
    await online((await memberSignUp("bob")).accessToken);

    expect(response.statusCode).toBe(401);
    expect(await nextBesidesPrompts(phone)).toEqual(
      presenceChange("online", "bob"),
    );
  });
});

describe("POST /login again on the same Device (D81)", () => {
  it("leaves that Device's open sockets alone: it is the same Device", async () => {
    const alice = await signUp(server.app, {
      username: "alice",
      password: SOCKET_TEST_PASSWORD,
    });
    joinSharedGroup(alice.body.deviceId);
    const phone = await online(alice.body.accessToken);

    const again = await login(server.app, {
      username: "alice",
      password: SOCKET_TEST_PASSWORD,
      identityKey: alice.request.identityKey,
    });
    await online((await memberSignUp("bob")).accessToken);

    expect(again.json<LoginResponse>().deviceId).toBe(alice.body.deviceId);
    expect(await nextBesidesPrompts(phone)).toEqual(
      presenceChange("online", "bob"),
    );
  });
});
