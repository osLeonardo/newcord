import { generateKeyPairSync, sign } from "node:crypto";
import {
  ApiErrorCode,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from "@newcord/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_JWT_SECRET,
  buildTestJwt,
  countRefreshTokensOf,
  countRows,
  createIdentityKey,
  fastFakeHasher,
  hmacSignature,
  login,
  logout,
  nowInSeconds,
  refresh,
  signUp,
  startTestServer,
  type TestJwt,
  type TestServer,
} from "./support/server-test-kit.js";

const PASSWORD = "correct horse battery staple";

let server: TestServer;
let alice: { request: RegisterRequest; body: RegisterResponse };
const onDeviceSessionEnded = vi.fn();

beforeEach(async () => {
  onDeviceSessionEnded.mockClear();
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    onDeviceSessionEnded,
  });
  alice = await signUp(server.app, { username: "alice", password: PASSWORD });
});

afterEach(async () => {
  await server.close();
});

const bearer = (accessToken: string): string => `Bearer ${accessToken}`;

async function logInAlice(identityKey: string): Promise<LoginResponse> {
  const response = await login(server.app, {
    username: "alice",
    password: PASSWORD,
    identityKey,
  });
  return response.json<LoginResponse>();
}

describe("POST /logout with a valid access token", () => {
  it("answers 204 with no body", async () => {
    const response = await logout(server.app, bearer(alice.body.accessToken));

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });

  it("deletes every refresh token of that Device", async () => {
    const again = await logInAlice(alice.request.identityKey);
    expect(countRefreshTokensOf(server.database, alice.body.deviceId)).toBe(2);

    await logout(server.app, bearer(again.accessToken));

    expect(countRefreshTokensOf(server.database, alice.body.deviceId)).toBe(0);
    for (const token of [alice.body.refreshToken, again.refreshToken]) {
      expect((await refresh(server.app, token)).statusCode).toBe(401);
    }
  });

  it("leaves the Account's other Devices logged in", async () => {
    const laptop = await logInAlice(createIdentityKey());

    await logout(server.app, bearer(alice.body.accessToken));

    expect((await refresh(server.app, laptop.refreshToken)).statusCode).toBe(
      200,
    );
  });

  it("tells the session listener that the Device's session ended", async () => {
    await logout(server.app, bearer(alice.body.accessToken));

    expect(onDeviceSessionEnded).toHaveBeenCalledExactlyOnceWith(
      alice.body.deviceId,
    );
  });

  it("keeps the same device ID when the Device logs back in with its key (D59)", async () => {
    await logout(server.app, bearer(alice.body.accessToken));

    const back = await logInAlice(alice.request.identityKey);

    expect(back.deviceId).toBe(alice.body.deviceId);
    expect(countRows(server.database).devices).toBe(1);
  });
});

describe("POST /logout without a valid access token", () => {
  const claimsFor = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    sub: "1",
    deviceId: alice.body.deviceId,
    iat: nowInSeconds(),
    exp: nowInSeconds() + 900,
    ...overrides,
  });

  const hs256 = (claims: Record<string, unknown>): string =>
    buildTestJwt({
      header: { alg: "HS256", typ: "JWT" },
      claims,
      sign: hmacSignature(TEST_JWT_SECRET),
    });

  const signedWith = (
    alg: string,
    signature: TestJwt["sign"],
  ): (() => string) => {
    return (): string =>
      buildTestJwt({
        header: { alg, typ: "JWT" },
        claims: claimsFor(),
        sign: signature,
      });
  };

  const ed25519PrivateKey = generateKeyPairSync("ed25519").privateKey;

  async function expectRefused(authorization?: string): Promise<void> {
    const response = await logout(server.app, authorization);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.InvalidAccessToken,
    });
    expect(countRefreshTokensOf(server.database, alice.body.deviceId)).toBe(1);
    expect(onDeviceSessionEnded).not.toHaveBeenCalled();
  }

  it("accepts a hand-built HS256 token, so the refusals below test only what they change", async () => {
    const response = await logout(server.app, bearer(hs256(claimsFor())));

    expect(response.statusCode).toBe(204);
  });

  it("answers 401 without an Authorization header", async () => {
    await expectRefused(undefined);
  });

  it.each([
    ["HS384", signedWith("HS384", hmacSignature(TEST_JWT_SECRET, "sha384"))],
    ["HS512", signedWith("HS512", hmacSignature(TEST_JWT_SECRET, "sha512"))],
    ["none", signedWith("none", () => Buffer.alloc(0))],
    [
      "EdDSA",
      signedWith("EdDSA", (signedPart) =>
        sign(null, Buffer.from(signedPart), ed25519PrivateKey),
      ),
    ],
  ])(
    "answers 401 to a token signed with %s instead of HS256 (D37c)",
    async (_alg, token) => {
      await expectRefused(bearer(token()));
    },
  );

  it("answers 401 to a token signed with another secret", async () => {
    const forged = buildTestJwt({
      header: { alg: "HS256", typ: "JWT" },
      claims: claimsFor(),
      sign: hmacSignature("another secret, also longer than 32 bytes"),
    });

    await expectRefused(bearer(forged));
  });

  it("answers 401 to an expired token", async () => {
    const expired = hs256(
      claimsFor({ iat: nowInSeconds() - 901, exp: nowInSeconds() - 1 }),
    );

    await expectRefused(bearer(expired));
  });

  it.each([
    ["no expiry", { exp: undefined }],
    ["no Device", { deviceId: undefined }],
    ["an Account ID that is not a number", { sub: "alice" }],
    ["a Device ID that is not one", { deviceId: "not:a:device" }],
  ])(
    "answers 401 to a correctly signed token with %s",
    async (_case, claims) => {
      await expectRefused(bearer(hs256(claimsFor(claims))));
    },
  );

  it.each([
    ["a scheme other than Bearer", "Basic YWxpY2U6cGFzc3dvcmQ="],
    ["Bearer without a token", "Bearer "],
    ["a token that is not a JWT", "Bearer not-a-jwt"],
  ])("answers 401 to %s", async (_case, authorization) => {
    await expectRefused(authorization);
  });

  it("answers 401 to the access token itself without the Bearer scheme", async () => {
    await expectRefused(alice.body.accessToken);
  });
});

describe("POST /logout logging", () => {
  it("never writes the access token to the log", async () => {
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

    const response = await logout(server.app, bearer(body.accessToken));
    await logout(server.app, `Basic ${body.accessToken}`);

    expect(response.statusCode).toBe(204);
    expect(lines.join("")).not.toContain(body.accessToken);
  });
});
