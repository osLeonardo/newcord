import { randomBytes } from "node:crypto";
import {
  ApiErrorCode,
  RefreshResponse,
  type LoginResponse,
  type RegisterResponse,
} from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
let now: number;
let alice: RegisterResponse;
const onDeviceSessionEnded = vi.fn();

beforeEach(async () => {
  now = NOW;
  onDeviceSessionEnded.mockClear();
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => now,
    onDeviceSessionEnded,
  });
  alice = (await signUp(server.app, { username: "alice", password: PASSWORD }))
    .body;
});

afterEach(async () => {
  await server.close();
});

const refreshTokenJson = async (token: string): Promise<RefreshResponse> =>
  (await refresh(server.app, token)).json<RefreshResponse>();

describe("POST /refresh with a valid refresh token", () => {
  it("answers 200 with exactly a new access token and a new refresh token", async () => {
    now = NOW + 60_000;

    const response = await refresh(server.app, alice.refreshToken);
    const body = response.json<RefreshResponse>();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["accessToken", "refreshToken"]);
    expect(Value.Check(RefreshResponse, body)).toBe(true);
    expect(body.refreshToken).not.toBe(alice.refreshToken);
  });

  it("marks the old token as used rather than deleting it (D62)", async () => {
    now = NOW + 60_000;

    await refresh(server.app, alice.refreshToken);

    expect(refreshTokenRow(server.database, alice.refreshToken)).toMatchObject({
      device_id: alice.deviceId,
      used_at: NOW + 60_000,
    });
  });

  it("stores the new token for the same Device, unused, expiring 30 days from now", async () => {
    now = NOW + 60_000;

    const body = await refreshTokenJson(alice.refreshToken);

    expect(refreshTokenRow(server.database, body.refreshToken)).toEqual({
      token_hash: expect.any(Buffer) as Buffer,
      device_id: alice.deviceId,
      expires_at: NOW + 60_000 + THIRTY_DAYS_MS,
      used_at: null,
    });
  });

  it("issues an access token naming the same Account and Device", async () => {
    const body = await refreshTokenJson(alice.refreshToken);

    expect(server.app.jwt.verify(body.accessToken)).toMatchObject({
      sub: server.app.jwt.verify<{ sub: string }>(alice.accessToken).sub,
      deviceId: alice.deviceId,
    });
  });

  it("lets the new refresh token be swapped in turn", async () => {
    const first = await refreshTokenJson(alice.refreshToken);

    const second = await refresh(server.app, first.refreshToken);

    expect(second.statusCode).toBe(200);
  });

  it("does not end the Device's session", async () => {
    await refresh(server.app, alice.refreshToken);

    expect(onDeviceSessionEnded).not.toHaveBeenCalled();
  });
});

describe("POST /refresh with a used refresh token (D62)", () => {
  it("answers 401 and deletes every refresh token of that Device, so the newest stops working too", async () => {
    const newest = await refreshTokenJson(alice.refreshToken);

    const reuse = await refresh(server.app, alice.refreshToken);

    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toMatchObject({
      code: ApiErrorCode.InvalidRefreshToken,
    });
    expect(countRefreshTokensOf(server.database, alice.deviceId)).toBe(0);
    expect((await refresh(server.app, newest.refreshToken)).statusCode).toBe(
      401,
    );
  });

  it("tells the session listener that the Device's session ended", async () => {
    await refresh(server.app, alice.refreshToken);

    await refresh(server.app, alice.refreshToken);

    expect(onDeviceSessionEnded).toHaveBeenCalledExactlyOnceWith(
      alice.deviceId,
    );
  });

  it("leaves the Account's other Devices logged in", async () => {
    const laptop = (
      await login(server.app, {
        username: "alice",
        password: PASSWORD,
        identityKey: createIdentityKey(),
      })
    ).json<LoginResponse>();
    await refresh(server.app, alice.refreshToken);

    await refresh(server.app, alice.refreshToken);

    expect((await refresh(server.app, laptop.refreshToken)).statusCode).toBe(
      200,
    );
  });

  it("treats a used token as reused even after it expires, until it is cleaned up", async () => {
    const newest = await refreshTokenJson(alice.refreshToken);
    now = NOW + THIRTY_DAYS_MS;

    const reuse = await refresh(server.app, alice.refreshToken);

    expect(reuse.statusCode).toBe(401);
    expect(countRefreshTokensOf(server.database, alice.deviceId)).toBe(0);
    expect(refreshTokenRow(server.database, newest.refreshToken)).toBe(
      undefined,
    );
  });

  it("lets only one of two simultaneous refreshes with the same token succeed", async () => {
    const [first, second] = await Promise.all([
      refresh(server.app, alice.refreshToken),
      refresh(server.app, alice.refreshToken),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 401]);
  });
});

describe("POST /refresh with a token that is not valid", () => {
  it("answers 401 to an unknown token and changes nothing", async () => {
    const before = countRows(server.database);

    const response = await refresh(
      server.app,
      randomBytes(32).toString("base64url"),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.InvalidRefreshToken,
    });
    expect(countRows(server.database)).toEqual(before);
    expect(onDeviceSessionEnded).not.toHaveBeenCalled();
  });

  it("answers 401 to an expired token and leaves it unused", async () => {
    now = NOW + THIRTY_DAYS_MS;

    const response = await refresh(server.app, alice.refreshToken);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.InvalidRefreshToken,
    });
    expect(refreshTokenRow(server.database, alice.refreshToken)).toMatchObject({
      used_at: null,
    });
  });

  it("still accepts a token one millisecond before it expires", async () => {
    now = NOW + THIRTY_DAYS_MS - 1;

    const response = await refresh(server.app, alice.refreshToken);

    expect(response.statusCode).toBe(200);
  });

  it.each([
    [
      "a token of 31 bytes",
      { refreshToken: randomBytes(31).toString("base64url") },
    ],
    ["a token in padded base64", { refreshToken: `${"a".repeat(43)}=` }],
    ["a missing token", {}],
    [
      "a field not in the schema",
      { refreshToken: "a".repeat(43), deviceId: "a".repeat(22) },
    ],
  ])("answers 400 to %s", async (_case, payload) => {
    const response = await server.app.inject({
      method: "POST",
      url: "/refresh",
      payload,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /refresh rate limit", () => {
  const unknownToken = (): string => randomBytes(32).toString("base64url");

  async function refreshTwentyTimes(remoteAddress: string): Promise<number[]> {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await refresh(server.app, unknownToken(), remoteAddress);
      statuses.push(response.statusCode);
    }
    return statuses;
  }

  it("answers 429 to the 21st refresh from one IP address within a minute", async () => {
    const statuses = await refreshTwentyTimes("203.0.113.7");

    const twentyFirst = await refresh(
      server.app,
      alice.refreshToken,
      "203.0.113.7",
    );

    expect(statuses.every((status) => status === 401)).toBe(true);
    expect(twentyFirst.statusCode).toBe(429);
    expect(twentyFirst.json()).toMatchObject({
      code: ApiErrorCode.RateLimited,
    });
    expect(refreshTokenRow(server.database, alice.refreshToken)).toMatchObject({
      used_at: null,
    });
  });

  it("counts each IP address separately", async () => {
    await refreshTwentyTimes("203.0.113.7");

    const fromElsewhere = await refresh(
      server.app,
      alice.refreshToken,
      "198.51.100.20",
    );

    expect(fromElsewhere.statusCode).toBe(200);
  });
});

describe("POST /refresh logging", () => {
  it("never writes the old or new tokens to the log", async () => {
    const lines: string[] = [];
    await server.close();
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      log: {
        level: "trace",
        stream: { write: (line: string): number => lines.push(line) },
      },
    });
    const { body } = await signUp(server.app);

    const fresh = await refreshTokenJson(body.refreshToken);
    await refresh(server.app, body.refreshToken);

    const output = lines.join("");
    expect(output).toContain("request completed");
    for (const secret of [
      body.refreshToken,
      fresh.accessToken,
      fresh.refreshToken,
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
