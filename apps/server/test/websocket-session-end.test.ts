import { WebSocketCloseCode, type RefreshResponse } from "@newcord/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fastFakeHasher,
  logout,
  refresh,
  refreshTokenRow,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  connectWithHello,
  logInOnNewDevice,
  presenceChange,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let server: TestServer;
let now: number;
const clients: TestSocketClient[] = [];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  now = NOW;
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => now,
  });
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

const bearer = (accessToken: string): string => `Bearer ${accessToken}`;
const sessionEnded = { code: WebSocketCloseCode.SessionEnded };

describe("POST /logout", () => {
  it("closes every socket of that Device at once with the session-ended close code", async () => {
    const alice = await signUpAs(server.app, "alice");
    const first = await online(alice.accessToken);
    const second = await online(alice.accessToken);

    const response = await logout(server.app, bearer(alice.accessToken));

    expect(response.statusCode).toBe(204);
    expect(await first.closed).toMatchObject(sessionEnded);
    expect(await second.closed).toMatchObject(sessionEnded);
  });

  it("leaves other Accounts' sockets open and tells them the Account went offline", async () => {
    const alice = await signUpAs(server.app, "alice");
    const aliceSocket = await online(alice.accessToken);
    const bobSocket = await online(
      (await signUpAs(server.app, "bob")).accessToken,
    );

    await logout(server.app, bearer(alice.accessToken));
    await aliceSocket.closed;

    expect(await bobSocket.nextEnvelope()).toEqual(
      presenceChange("offline", "alice"),
    );
    expect(bobSocket.isOpen()).toBe(true);
  });

  it("closes only that Device's sockets when the Account has two Devices online, and sends no offline change", async () => {
    const alice = await signUpAs(server.app, "alice");
    const phone = await online(alice.accessToken);
    const laptop = await online(
      (await logInOnNewDevice(server.app, "alice")).accessToken,
    );
    const bobSocket = await online(
      (await signUpAs(server.app, "bob")).accessToken,
    );

    await logout(server.app, bearer(alice.accessToken));
    expect(await phone.closed).toMatchObject(sessionEnded);
    await online((await signUpAs(server.app, "carol")).accessToken);

    expect(await bobSocket.nextEnvelope()).toEqual(
      presenceChange("online", "carol"),
    );
    expect(await laptop.nextEnvelope()).toMatchObject(
      presenceChange("online", "bob"),
    );
    expect(await laptop.nextEnvelope()).toEqual(
      presenceChange("online", "carol"),
    );
  });
});

describe("POST /refresh with a used refresh token (D62)", () => {
  it("closes every socket of that Device at once with the session-ended close code", async () => {
    const alice = await signUpAs(server.app, "alice");
    const aliceSocket = await online(alice.accessToken);
    const bobSocket = await online(
      (await signUpAs(server.app, "bob")).accessToken,
    );
    await aliceSocket.nextEnvelope();
    expect((await refresh(server.app, alice.refreshToken)).statusCode).toBe(
      200,
    );

    const reuse = await refresh(server.app, alice.refreshToken);

    expect(reuse.statusCode).toBe(401);
    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
    expect(bobSocket.isOpen()).toBe(true);
  });

  it("leaves the socket open on a normal refresh", async () => {
    const alice = await signUpAs(server.app, "alice");
    const aliceSocket = await online(alice.accessToken);

    const fresh = (
      await refresh(server.app, alice.refreshToken)
    ).json<RefreshResponse>();
    await online((await signUpAs(server.app, "bob")).accessToken);

    expect(fresh.refreshToken).toBeDefined();
    expect(await aliceSocket.nextEnvelope()).toEqual(
      presenceChange("online", "bob"),
    );
  });
});

describe("the 15-minute session check", () => {
  it("closes the sockets of a Device whose refresh tokens are all used", async () => {
    const alice = await signUpAs(server.app, "alice");
    const aliceSocket = await online(alice.accessToken);
    server.database.prepare("UPDATE refresh_tokens SET used_at = ?").run(NOW);

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);

    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
  });

  it("closes the sockets of a Device whose refresh token expired, and only those", async () => {
    const alice = await signUpAs(server.app, "alice");
    now = NOW + 20 * ONE_DAY_MS;
    const bob = await signUpAs(server.app, "bob");
    const aliceSocket = await online(alice.accessToken);
    const bobSocket = await online(bob.accessToken);
    await aliceSocket.nextEnvelope();
    now = NOW + 30 * ONE_DAY_MS;

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);

    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
    expect(await bobSocket.nextEnvelope()).toEqual(
      presenceChange("offline", "alice"),
    );
    expect(bobSocket.isOpen()).toBe(true);
  });

  it("waits the full 15 minutes before checking", async () => {
    const alice = await signUpAs(server.app, "alice");
    const aliceSocket = await online(alice.accessToken);
    server.database.prepare("DELETE FROM refresh_tokens").run();

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS - 1);
    await online((await signUpAs(server.app, "bob")).accessToken);
    expect(await aliceSocket.nextEnvelope()).toEqual(
      presenceChange("online", "bob"),
    );

    vi.advanceTimersByTime(1);
    expect(await aliceSocket.closed).toMatchObject(sessionEnded);
  });

  it("keeps the sockets of a Device that still has an unused, unexpired refresh token", async () => {
    const alice = await signUpAs(server.app, "alice");
    const aliceSocket = await online(alice.accessToken);
    await refresh(server.app, alice.refreshToken);

    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);
    await online((await signUpAs(server.app, "bob")).accessToken);

    expect(await aliceSocket.nextEnvelope()).toEqual(
      presenceChange("online", "bob"),
    );
    expect(refreshTokenRow(server.database, alice.refreshToken)).toMatchObject({
      used_at: NOW,
    });
  });
});
