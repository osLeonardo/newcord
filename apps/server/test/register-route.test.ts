import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  ApiErrorCode,
  RecoveryCode,
  RegisterResponse,
  type RegisterRequest,
} from "@newcord/shared";
import argon2 from "argon2";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_JWT_SECRET,
  countRows,
  createIdentityKey,
  describeArgon2Hash,
  fastFakeHasher,
  register,
  startTestServer,
  validRegisterRequest,
  type TestServer,
} from "./support/server-test-kit.js";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ARGON2ID_SETTINGS = {
  algorithm: "argon2id",
  cost: { m: 19 * 1024, t: 2, p: 1 },
};
const NOTHING_CREATED = { users: 0, devices: 0, refresh_tokens: 0 };

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  recovery_hash: string;
  created_at: number;
}

interface DeviceRow {
  id: string;
  user_id: number;
  identity_key: Buffer;
  created_at: number;
}

interface RefreshTokenRow {
  token_hash: Buffer;
  device_id: string;
  expires_at: number;
  used_at: number | null;
}

interface JwtParts {
  header: unknown;
  claims: { sub: string; deviceId: string; iat: number; exp: number };
  signedPart: string;
  signature: string;
}

function decodeJwt(token: string): JwtParts {
  const [header = "", claims = "", signature = ""] = token.split(".");
  const decode = (part: string): string =>
    Buffer.from(part, "base64url").toString();
  return {
    header: JSON.parse(decode(header)) as unknown,
    claims: JSON.parse(decode(claims)) as JwtParts["claims"],
    signedPart: `${header}.${claims}`,
    signature,
  };
}

let server: TestServer;

afterEach(async () => {
  await server.close();
});

describe("POST /register with a valid request", () => {
  let request: RegisterRequest;
  let body: RegisterResponse;

  beforeEach(async () => {
    server = await startTestServer({ clock: () => NOW });
    request = validRegisterRequest();
    const response = await register(server.app, request);
    expect(response.statusCode).toBe(201);
    body = response.json<RegisterResponse>();
  });

  const onlyUser = (): UserRow =>
    server.database.prepare("SELECT * FROM users").get() as UserRow;
  const onlyDevice = (): DeviceRow =>
    server.database.prepare("SELECT * FROM devices").get() as DeviceRow;
  const onlyRefreshToken = (): RefreshTokenRow =>
    server.database
      .prepare("SELECT * FROM refresh_tokens")
      .get() as RefreshTokenRow;

  it("answers with exactly an access token, a refresh token, a device ID and a Recovery code", () => {
    expect(Object.keys(body).sort()).toEqual([
      "accessToken",
      "deviceId",
      "recoveryCode",
      "refreshToken",
    ]);
    expect(Value.Check(RegisterResponse, body)).toBe(true);
  });

  it("creates one user and one device holding the identity key", () => {
    expect(countRows(server.database)).toEqual({
      users: 1,
      devices: 1,
      refresh_tokens: 1,
    });
    expect(onlyUser()).toMatchObject({ username: "alice", created_at: NOW });
    expect(onlyDevice()).toEqual({
      id: body.deviceId,
      user_id: onlyUser().id,
      identity_key: Buffer.from(request.identityKey, "base64"),
      created_at: NOW,
    });
  });

  it("stores the password only as an Argon2id hash with 19 MiB, 2 iterations and 1 thread", async () => {
    const { password_hash } = onlyUser();

    expect(describeArgon2Hash(password_hash)).toEqual(ARGON2ID_SETTINGS);
    expect(await argon2.verify(password_hash, request.password)).toBe(true);
  });

  it("returns a 24-symbol Crockford Base32 Recovery code and stores only its Argon2id hash", async () => {
    const { recovery_hash } = onlyUser();

    expect(Value.Check(RecoveryCode, body.recoveryCode)).toBe(true);
    expect(describeArgon2Hash(recovery_hash)).toEqual(ARGON2ID_SETTINGS);
    expect(await argon2.verify(recovery_hash, body.recoveryCode)).toBe(true);
  });

  it("stores only the SHA-256 hash of the refresh token, unused, expiring 30 days ahead", () => {
    expect(Buffer.from(body.refreshToken, "base64url")).toHaveLength(32);
    expect(onlyRefreshToken()).toEqual({
      token_hash: createHash("sha256").update(body.refreshToken).digest(),
      device_id: body.deviceId,
      expires_at: NOW + THIRTY_DAYS_MS,
      used_at: null,
    });
  });

  it("keeps no password, refresh token or Recovery code in plain form", () => {
    const everyRow = JSON.stringify([
      onlyUser(),
      onlyDevice(),
      onlyRefreshToken(),
    ]);

    expect(everyRow).not.toContain(request.password);
    expect(everyRow).not.toContain(body.refreshToken);
    expect(everyRow).not.toContain(body.recoveryCode);
  });

  it("issues an HS256 access token naming the Account and the Device, valid for 15 minutes", () => {
    const jwt = decodeJwt(body.accessToken);
    const expectedSignature = createHmac("sha256", TEST_JWT_SECRET)
      .update(jwt.signedPart)
      .digest("base64url");

    expect(jwt.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(jwt.claims).toMatchObject({
      sub: String(onlyUser().id),
      deviceId: body.deviceId,
    });
    expect(jwt.claims.exp - jwt.claims.iat).toBe(15 * 60);
    expect(jwt.signature).toBe(expectedSignature);
  });

  it("gives the next sign-up its own device ID, tokens and Recovery code", async () => {
    const next = await register(
      server.app,
      validRegisterRequest({ username: "bruno" }),
    );
    const nextBody = next.json<RegisterResponse>();

    expect(nextBody.deviceId).not.toBe(body.deviceId);
    expect(nextBody.accessToken).not.toBe(body.accessToken);
    expect(nextBody.refreshToken).not.toBe(body.refreshToken);
    expect(nextBody.recoveryCode).not.toBe(body.recoveryCode);
  });
});

describe("POST /register rejects with 400 and creates nothing", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
  });

  const withField = (
    field: Partial<Record<keyof RegisterRequest, unknown>>,
  ): object => ({
    ...validRegisterRequest(),
    ...field,
  });

  it.each([
    ["a username of 2 characters", (): object => withField({ username: "ab" })],
    [
      "a username of 33 characters",
      (): object => withField({ username: "a".repeat(33) }),
    ],
    [
      "a username with capital letters",
      (): object => withField({ username: "Alice" }),
    ],
    ["a username with a dash", (): object => withField({ username: "al-ice" })],
    [
      "a password of 11 characters",
      (): object => withField({ password: "p".repeat(11) }),
    ],
    [
      "a password of 257 characters",
      (): object => withField({ password: "p".repeat(257) }),
    ],
    [
      "a password sent as a number",
      (): object => withField({ password: 123456789012345 }),
    ],
    [
      "an identity key of 31 bytes",
      (): object =>
        withField({ identityKey: randomBytes(31).toString("base64") }),
    ],
    [
      "an identity key of 33 bytes",
      (): object =>
        withField({ identityKey: randomBytes(33).toString("base64") }),
    ],
    [
      "an identity key with a character outside base64",
      (): object =>
        withField({ identityKey: `*${createIdentityKey().slice(1)}` }),
    ],
    [
      "an identity key in base64url",
      (): object =>
        withField({
          identityKey: `${Buffer.alloc(32, 0xfb).toString("base64url")}=`,
        }),
    ],
    [
      "a field not in the schema",
      (): object => ({ ...validRegisterRequest(), isAdmin: true }),
    ],
    [
      "a missing identity key",
      (): object => ({
        username: "alice",
        password: "correct horse battery staple",
      }),
    ],
    ["a body that is not an object", (): object => ["alice"]],
  ])("%s", async (_case, buildBody) => {
    const response = await register(server.app, buildBody());

    expect(response.statusCode).toBe(400);
    expect(countRows(server.database)).toEqual(NOTHING_CREATED);
  });
});

describe("POST /register conflicts", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
  });

  it("answers 409 USERNAME_TAKEN to a taken username and creates nothing", async () => {
    await register(server.app, validRegisterRequest({ username: "alice" }));

    const response = await register(
      server.app,
      validRegisterRequest({ username: "alice" }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ApiErrorCode.UsernameTaken });
    expect(countRows(server.database)).toEqual({
      users: 1,
      devices: 1,
      refresh_tokens: 1,
    });
  });

  it("answers 409 IDENTITY_KEY_TAKEN to a key another Account holds and creates nothing (D60)", async () => {
    const identityKey = createIdentityKey();
    await register(
      server.app,
      validRegisterRequest({ username: "alice", identityKey }),
    );

    const response = await register(
      server.app,
      validRegisterRequest({ username: "bruno", identityKey }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.IdentityKeyTaken,
    });
    expect(countRows(server.database)).toEqual({
      users: 1,
      devices: 1,
      refresh_tokens: 1,
    });
  });
});

describe("POST /register body size", () => {
  const hash = vi.fn(fastFakeHasher.hash);

  beforeEach(async () => {
    hash.mockClear();
    server = await startTestServer({ passwordHasher: { hash } });
  });

  function jsonOfExactly(bytes: number): string {
    const template = { ...validRegisterRequest(), password: "" };
    const padding = bytes - JSON.stringify(template).length;
    return JSON.stringify({ ...template, password: "p".repeat(padding) });
  }

  const postJson = (payload: string): ReturnType<typeof register> =>
    server.app.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "application/json" },
      payload,
    });

  it("answers 413 to a body over 64 KiB without reaching the handler", async () => {
    const response = await postJson(jsonOfExactly(64 * 1024 + 1));

    expect(response.statusCode).toBe(413);
    expect(hash).not.toHaveBeenCalled();
    expect(countRows(server.database)).toEqual(NOTHING_CREATED);
  });

  it("parses a body of exactly 64 KiB, then validates it", async () => {
    const response = await postJson(jsonOfExactly(64 * 1024));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "FST_ERR_VALIDATION" });
  });
});

describe("POST /register rate limit", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
  });

  async function signUpFiveTimes(remoteAddress: string): Promise<number[]> {
    const statuses: number[] = [];
    for (const username of ["user_1", "user_2", "user_3", "user_4", "user_5"]) {
      const request = validRegisterRequest({ username });
      statuses.push(
        (await register(server.app, request, remoteAddress)).statusCode,
      );
    }
    return statuses;
  }

  it("answers 429 to the sixth sign-up from one IP address within an hour", async () => {
    expect(await signUpFiveTimes("203.0.113.7")).toEqual([
      201, 201, 201, 201, 201,
    ]);

    const sixth = await register(
      server.app,
      validRegisterRequest({ username: "user_6" }),
      "203.0.113.7",
    );

    expect(sixth.statusCode).toBe(429);
    expect(countRows(server.database).users).toBe(5);
  });

  it("counts each IP address separately", async () => {
    await signUpFiveTimes("203.0.113.7");

    const fromElsewhere = await register(
      server.app,
      validRegisterRequest({ username: "user_6" }),
      "198.51.100.20",
    );

    expect(fromElsewhere.statusCode).toBe(201);
  });
});

describe("POST /register logging", () => {
  it("never writes the password, the tokens or the Recovery code to the log", async () => {
    const lines: string[] = [];
    server = await startTestServer({
      log: {
        level: "trace",
        stream: { write: (line: string): number => lines.push(line) },
      },
    });
    const request = validRegisterRequest();

    const response = await register(server.app, request);
    const body = response.json<RegisterResponse>();

    const output = lines.join("");
    expect(response.statusCode).toBe(201);
    expect(output).toContain("request completed");
    for (const secret of [
      request.password,
      body.accessToken,
      body.refreshToken,
      body.recoveryCode,
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
