import {
  ApiErrorCode,
  LoginResponse,
  type LoginRequest,
  type RegisterResponse,
} from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DUMMY_PASSWORD_HASH } from "../src/accounts/password-hasher.js";
import {
  countRefreshTokensOf,
  countRows,
  createIdentityKey,
  fastFakeHasher,
  login,
  refresh,
  refreshTokenRow,
  signUp,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD = "correct horse battery staple";

let server: TestServer;

afterEach(async () => {
  await server.close();
});

function loginRequest(overrides: Partial<LoginRequest> = {}): LoginRequest {
  return {
    username: "alice",
    password: PASSWORD,
    identityKey: createIdentityKey(),
    ...overrides,
  };
}

describe("POST /login with the right password", () => {
  let alice: { request: LoginRequest; body: RegisterResponse };

  beforeEach(async () => {
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      clock: () => NOW,
    });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  });

  const deviceRow = (deviceId: string): unknown =>
    server.database
      .prepare("SELECT user_id, identity_key FROM devices WHERE id = ?")
      .get(deviceId);
  const aliceUserId = (): unknown =>
    server.database
      .prepare("SELECT id FROM users WHERE username = 'alice'")
      .pluck()
      .get();

  it("answers 200 with the existing device ID for a key this Account already has (D59)", async () => {
    const response = await login(
      server.app,
      loginRequest({ identityKey: alice.request.identityKey }),
    );
    const body = response.json<LoginResponse>();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "accessToken",
      "deviceId",
      "refreshToken",
    ]);
    expect(Value.Check(LoginResponse, body)).toBe(true);
    expect(body.deviceId).toBe(alice.body.deviceId);
    expect(countRows(server.database).devices).toBe(1);
  });

  it("creates a Device for a new key and answers with its new device ID (D59)", async () => {
    const identityKey = createIdentityKey();

    const response = await login(server.app, loginRequest({ identityKey }));
    const body = response.json<LoginResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.deviceId).not.toBe(alice.body.deviceId);
    expect(countRows(server.database).devices).toBe(2);
    expect(deviceRow(body.deviceId)).toEqual({
      user_id: aliceUserId(),
      identity_key: Buffer.from(identityKey, "base64"),
    });
  });

  it("stores the new refresh token's hash for that Device, unused, expiring 30 days ahead", async () => {
    const response = await login(
      server.app,
      loginRequest({ identityKey: alice.request.identityKey }),
    );
    const body = response.json<LoginResponse>();

    expect(refreshTokenRow(server.database, body.refreshToken)).toMatchObject({
      device_id: alice.body.deviceId,
      expires_at: NOW + THIRTY_DAYS_MS,
      used_at: null,
    });
  });

  it("issues an access token naming the Account and the Device", async () => {
    const identityKey = createIdentityKey();

    const response = await login(server.app, loginRequest({ identityKey }));
    const body = response.json<LoginResponse>();

    expect(server.app.jwt.verify(body.accessToken)).toMatchObject({
      sub: String(aliceUserId()),
      deviceId: body.deviceId,
    });
  });
});

describe("POST /login on a Device that already has refresh tokens (D81)", () => {
  let alice: { request: LoginRequest; body: RegisterResponse };

  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  });

  const logInAgain = async (identityKey: string): Promise<LoginResponse> =>
    (await login(server.app, loginRequest({ identityKey }))).json();

  it("refuses the Device's previous refresh token and accepts the new one", async () => {
    const again = await logInAgain(alice.request.identityKey);

    expect(
      (await refresh(server.app, alice.body.refreshToken)).statusCode,
    ).toBe(401);
    expect((await refresh(server.app, again.refreshToken)).statusCode).toBe(
      200,
    );
  });

  it("leaves the Device holding only the new token, its used ones deleted too", async () => {
    await refresh(server.app, alice.body.refreshToken);
    expect(countRefreshTokensOf(server.database, alice.body.deviceId)).toBe(2);

    const again = await logInAgain(alice.request.identityKey);

    expect(countRefreshTokensOf(server.database, alice.body.deviceId)).toBe(1);
    expect(refreshTokenRow(server.database, again.refreshToken)).toMatchObject({
      device_id: alice.body.deviceId,
      used_at: null,
    });
  });

  it("keeps the refresh tokens of the Account's other Devices", async () => {
    const laptop = await logInAgain(createIdentityKey());

    await logInAgain(alice.request.identityKey);

    expect((await refresh(server.app, laptop.refreshToken)).statusCode).toBe(
      200,
    );
  });

  it("deletes nothing when a refused login names another Account's key", async () => {
    await signUp(server.app, { username: "bruno", password: PASSWORD });

    const response = await login(
      server.app,
      loginRequest({
        username: "bruno",
        identityKey: alice.request.identityKey,
      }),
    );

    expect(response.statusCode).toBe(409);
    expect(
      (await refresh(server.app, alice.body.refreshToken)).statusCode,
    ).toBe(200);
  });
});

describe("POST /login refusals", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
  });

  it("refuses with 409 a key registered to another Account and creates nothing (D60)", async () => {
    const alice = await signUp(server.app, { username: "alice" });
    await signUp(server.app, { username: "bruno", password: PASSWORD });
    const before = countRows(server.database);

    const response = await login(
      server.app,
      loginRequest({
        username: "bruno",
        identityKey: alice.request.identityKey,
      }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.IdentityKeyTaken,
    });
    expect(countRows(server.database)).toEqual(before);
  });

  it("answers a wrong password and an unknown username with the same status and body", async () => {
    await signUp(server.app, { username: "alice", password: PASSWORD });
    const before = countRows(server.database);

    const wrongPassword = await login(
      server.app,
      loginRequest({ password: "not the right password" }),
    );
    const unknownUsername = await login(
      server.app,
      loginRequest({ username: "nobody_here" }),
    );

    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json()).toMatchObject({
      code: ApiErrorCode.InvalidCredentials,
    });
    expect(unknownUsername.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownUsername.body).toBe(wrongPassword.body);
    expect(countRows(server.database)).toEqual(before);
  });

  it("answers a wrong password with 401 even when the key belongs to another Account", async () => {
    const alice = await signUp(server.app, { username: "alice" });
    await signUp(server.app, { username: "bruno" });

    const response = await login(
      server.app,
      loginRequest({
        username: "bruno",
        password: "not the right password",
        identityKey: alice.request.identityKey,
      }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.InvalidCredentials,
    });
  });

  it.each([
    ["a username with capital letters", { username: "Alice" }],
    ["a password of 11 characters", { password: "p".repeat(11) }],
    ["an identity key of 33 bytes", { identityKey: "A".repeat(44) }],
    ["a field not in the schema", { deviceId: "a".repeat(22) }],
  ])("answers 400 to %s", async (_case, field) => {
    await signUp(server.app, { username: "alice", password: PASSWORD });
    const before = countRows(server.database);

    const response = await login(server.app, { ...loginRequest(), ...field });

    expect(response.statusCode).toBe(400);
    expect(countRows(server.database)).toEqual(before);
  });

  it("answers 400 to a request without an identity key (D59)", async () => {
    const response = await login(server.app, {
      username: "alice",
      password: PASSWORD,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /login password checks", () => {
  const verify = vi.fn(fastFakeHasher.verify);

  beforeEach(async () => {
    verify.mockClear();
    server = await startTestServer({
      passwordHasher: { hash: fastFakeHasher.hash, verify },
    });
  });

  it("still verifies against a fixed dummy hash for an unknown username", async () => {
    await login(server.app, loginRequest({ username: "nobody_here" }));

    expect(verify).toHaveBeenCalledExactlyOnceWith(
      DUMMY_PASSWORD_HASH,
      PASSWORD,
    );
  });

  it("verifies the password against the Account's stored hash", async () => {
    await signUp(server.app, { username: "alice", password: PASSWORD });
    const storedHash = server.database
      .prepare("SELECT password_hash FROM users WHERE username = 'alice'")
      .pluck()
      .get();

    await login(server.app, loginRequest());

    expect(verify).toHaveBeenCalledExactlyOnceWith(storedHash, PASSWORD);
  });
});

describe("POST /login rate limit", () => {
  const verify = vi.fn(fastFakeHasher.verify);

  beforeEach(async () => {
    verify.mockClear();
    server = await startTestServer({
      passwordHasher: { hash: fastFakeHasher.hash, verify },
    });
  });

  async function statusesOf(
    attempts: { username: string; remoteAddress: string }[],
  ): Promise<number[]> {
    const statuses: number[] = [];
    for (const { username, remoteAddress } of attempts) {
      const request = loginRequest({ username });
      statuses.push(
        (await login(server.app, request, remoteAddress)).statusCode,
      );
    }
    return statuses;
  }

  const fromOneAddress = (usernames: string[]): ReturnType<typeof statusesOf> =>
    statusesOf(
      usernames.map((username) => ({ username, remoteAddress: "203.0.113.7" })),
    );

  const forOneUsername = (addresses: string[]): ReturnType<typeof statusesOf> =>
    statusesOf(
      addresses.map((remoteAddress) => ({ username: "alice", remoteAddress })),
    );

  const addresses = (count: number, offset = 0): string[] =>
    Array.from({ length: count }, (_, index) => `198.51.100.${index + offset}`);

  it("answers 429 to the sixth attempt from one IP address within a minute, across usernames", async () => {
    const statuses = await fromOneAddress([
      "user_1",
      "user_2",
      "user_3",
      "user_4",
      "user_5",
      "user_6",
    ]);

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("answers 429 to the sixth attempt for one username within a minute, across IP addresses", async () => {
    await signUp(server.app, { username: "alice", password: PASSWORD });

    const statuses = await forOneUsername(addresses(6));

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("limits an unknown username the same way, so the limit reveals nothing", async () => {
    const statuses = await statusesOf(
      addresses(6).map((remoteAddress) => ({
        username: "nobody_here",
        remoteAddress,
      })),
    );

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("does not check the password of a refused attempt", async () => {
    await forOneUsername(addresses(6));

    expect(verify).toHaveBeenCalledTimes(5);
  });

  it("answers 429 with RATE_LIMITED and a retry-after header", async () => {
    await forOneUsername(addresses(5));

    const sixth = await login(server.app, loginRequest(), "192.0.2.1");

    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({ code: ApiErrorCode.RateLimited });
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("counts other usernames and IP addresses separately", async () => {
    await forOneUsername(addresses(6));

    const otherUsername = await login(
      server.app,
      loginRequest({ username: "bruno" }),
      "192.0.2.1",
    );

    expect(otherUsername.statusCode).toBe(401);
  });

  it("does not count a request refused by validation against the username", async () => {
    const invalid = { ...loginRequest(), password: "short" };
    for (const remoteAddress of addresses(5)) {
      await login(server.app, invalid, remoteAddress);
    }

    const valid = await login(server.app, loginRequest(), "192.0.2.1");

    expect(valid.statusCode).toBe(401);
  });
});

describe("POST /login logging", () => {
  it("never writes the password or the tokens to the log", async () => {
    const lines: string[] = [];
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      log: {
        level: "trace",
        stream: { write: (line: string): number => lines.push(line) },
      },
    });
    const alice = await signUp(server.app, { password: PASSWORD });

    const response = await login(
      server.app,
      loginRequest({ identityKey: alice.request.identityKey }),
    );
    const body = response.json<LoginResponse>();

    const output = lines.join("");
    expect(response.statusCode).toBe(200);
    expect(output).toContain("request completed");
    for (const secret of [PASSWORD, body.accessToken, body.refreshToken]) {
      expect(output).not.toContain(secret);
    }
  });
});
