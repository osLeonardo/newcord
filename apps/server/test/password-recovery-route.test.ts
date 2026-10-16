import {
  ApiErrorCode,
  PasswordRecoveryResponse,
  type LoginResponse,
  type PasswordRecoveryRequest,
  type RegisterRequest,
  type RegisterResponse,
} from "@newcord/shared";
import argon2 from "argon2";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countRefreshTokensOf,
  createIdentityKey,
  describeArgon2Hash,
  fastFakeHasher,
  login,
  recoverPassword,
  refresh,
  signUp,
  startTestServer,
  storedHashesOf,
  type TestServer,
} from "./support/server-test-kit.js";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new password";
const KNOWN_CODE = "0123456789ABCDEFGHJKMNPQ";
const WRONG_CODE = "ZZZZZZZZZZZZZZZZZZZZZZZZ";

let server: TestServer;
let alice: { request: RegisterRequest; body: RegisterResponse };

afterEach(async () => {
  await server.close();
});

function recoveryRequest(
  overrides: Partial<PasswordRecoveryRequest> = {},
): PasswordRecoveryRequest {
  return {
    username: "alice",
    recoveryCode: alice.body.recoveryCode,
    newPassword: NEW_PASSWORD,
    ...overrides,
  };
}

const recover = (
  overrides: Partial<PasswordRecoveryRequest> = {},
  remoteAddress?: string,
): ReturnType<typeof recoverPassword> =>
  recoverPassword(server.app, recoveryRequest(overrides), remoteAddress);

async function logIn(
  password: string,
  identityKey = alice.request.identityKey,
): Promise<number> {
  const response = await login(server.app, {
    username: "alice",
    password,
    identityKey,
  });
  return response.statusCode;
}

describe("POST /password/recover with the right username and code", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  });

  it("answers 200 with only a new 24-symbol Recovery code (D55)", async () => {
    const response = await recover();
    const body = response.json<PasswordRecoveryResponse>();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body)).toEqual(["recoveryCode"]);
    expect(Value.Check(PasswordRecoveryResponse, body)).toBe(true);
    expect(body.recoveryCode).not.toBe(alice.body.recoveryCode);
  });

  it("makes the new password the one that logs in", async () => {
    await recover();

    expect(await logIn(PASSWORD)).toBe(401);
    expect(await logIn(NEW_PASSWORD)).toBe(200);
  });

  it("refuses the old code afterwards and accepts the new one", async () => {
    const { recoveryCode } = (await recover()).json<PasswordRecoveryResponse>();

    const withOld = await recover({ newPassword: "yet another password" });
    const withNew = await recover({
      recoveryCode,
      newPassword: "yet another password",
    });

    expect(withOld.statusCode).toBe(401);
    expect(withOld.json()).toMatchObject({
      code: ApiErrorCode.InvalidCredentials,
    });
    expect(withNew.statusCode).toBe(200);
  });

  it("deletes every refresh token of the Account, so every Device must log in again (D66)", async () => {
    const laptop = (
      await login(server.app, {
        username: "alice",
        password: PASSWORD,
        identityKey: createIdentityKey(),
      })
    ).json<LoginResponse>();

    await recover();

    for (const device of [alice.body, laptop]) {
      expect(countRefreshTokensOf(server.database, device.deviceId)).toBe(0);
      expect((await refresh(server.app, device.refreshToken)).statusCode).toBe(
        401,
      );
    }
  });

  it("leaves other Accounts' refresh tokens alone", async () => {
    const bruno = await signUp(server.app, { username: "bruno" });

    await recover();

    expect(
      (await refresh(server.app, bruno.body.refreshToken)).statusCode,
    ).toBe(200);
  });
});

describe("POST /password/recover reading a typed code", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
    server.database
      .prepare("UPDATE users SET recovery_hash = ? WHERE username = 'alice'")
      .run(await fastFakeHasher.hash(KNOWN_CODE));
  });

  it.each([
    ["as issued", KNOWN_CODE],
    ["in lower case", KNOWN_CODE.toLowerCase()],
    ["in groups of four with dashes", "0123-4567-89AB-CDEF-GHJK-MNPQ"],
    ["in groups of four with spaces", "0123 4567 89ab cdef ghjk mnpq"],
    ["with O for 0 and I for 1", "OI23456789ABCDEFGHJKMNPQ"],
    ["with o for 0 and L for 1", "oL23456789ABCDEFGHJKMNPQ"],
    ["with l for 1", "0l23-4567-89ab-cdef-ghjk-mnpq"],
  ])("accepts the code %s", async (_case, recoveryCode) => {
    const response = await recover({ recoveryCode });

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["with the letter U", `U${KNOWN_CODE.slice(1)}`],
    ["of 23 symbols", KNOWN_CODE.slice(1)],
    ["with underscores", "0123_4567_89AB_CDEF_GHJK_MNPQ"],
  ])("answers 400 to a code %s", async (_case, recoveryCode) => {
    const response = await recover({ recoveryCode });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "FST_ERR_VALIDATION" });
  });
});

describe("POST /password/recover hashing", () => {
  it("stores the new password and the new code only as Argon2id hashes with 19 MiB, 2 iterations and 1 thread", async () => {
    server = await startTestServer();
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });

    const { recoveryCode } = (await recover()).json<PasswordRecoveryResponse>();

    const hashes = storedHashesOf(server.database, "alice");
    for (const hash of [hashes?.password_hash, hashes?.recovery_hash]) {
      expect(describeArgon2Hash(hash ?? "")).toEqual({
        algorithm: "argon2id",
        cost: { m: 19 * 1024, t: 2, p: 1 },
      });
    }
    expect(await argon2.verify(hashes?.password_hash ?? "", NEW_PASSWORD)).toBe(
      true,
    );
    expect(await argon2.verify(hashes?.recovery_hash ?? "", recoveryCode)).toBe(
      true,
    );
  });
});

describe("POST /password/recover refusals", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  });

  it("answers a wrong code and an unknown username with the same status and body, and changes nothing", async () => {
    const before = storedHashesOf(server.database, "alice");

    const wrongCode = await recover({ recoveryCode: WRONG_CODE });
    const unknownUsername = await recover({ username: "nobody_here" });

    expect(wrongCode.statusCode).toBe(401);
    expect(wrongCode.json()).toMatchObject({
      code: ApiErrorCode.InvalidCredentials,
    });
    expect(unknownUsername.statusCode).toBe(wrongCode.statusCode);
    expect(unknownUsername.body).toBe(wrongCode.body);
    expect(storedHashesOf(server.database, "alice")).toEqual(before);
    expect(countRefreshTokensOf(server.database, alice.body.deviceId)).toBe(1);
  });

  it.each([
    ["a username breaking the rules", { username: "Alice" }],
    ["a new password of 11 characters", { newPassword: "p".repeat(11) }],
    ["a new password of 257 characters", { newPassword: "p".repeat(257) }],
    ["a field not in the schema", { identityKey: createIdentityKey() }],
  ])("answers 400 to %s", async (_case, change) => {
    const response = await recoverPassword(server.app, {
      ...recoveryRequest(),
      ...change,
    });

    expect(response.statusCode).toBe(400);
    expect(storedHashesOf(server.database, "alice")).toMatchObject({
      password_hash: await fastFakeHasher.hash(PASSWORD),
    });
  });

  it("answers 400 to a request without a Recovery code", async () => {
    const response = await recoverPassword(server.app, {
      username: "alice",
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /password/recover rate limit", () => {
  const verify = vi.fn(fastFakeHasher.verify);

  beforeEach(async () => {
    verify.mockClear();
    server = await startTestServer({
      passwordHasher: { hash: fastFakeHasher.hash, verify },
    });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  });

  async function statusesOf(
    attempts: { username: string; remoteAddress: string }[],
  ): Promise<number[]> {
    const statuses: number[] = [];
    for (const { username, remoteAddress } of attempts) {
      const response = await recover(
        { username, recoveryCode: WRONG_CODE },
        remoteAddress,
      );
      statuses.push(response.statusCode);
    }
    return statuses;
  }

  const addresses = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => `198.51.100.${index}`);

  const forOneUsername = (username: string, count: number): Promise<number[]> =>
    statusesOf(
      addresses(count).map((remoteAddress) => ({ username, remoteAddress })),
    );

  it("answers 429 to the sixth attempt for one username within an hour, across IP addresses", async () => {
    expect(await forOneUsername("alice", 6)).toEqual([
      401, 401, 401, 401, 401, 429,
    ]);
  });

  it("answers 429 to the sixth attempt from one IP address within an hour, across usernames", async () => {
    const statuses = await statusesOf(
      ["user_1", "user_2", "user_3", "user_4", "user_5", "user_6"].map(
        (username) => ({ username, remoteAddress: "203.0.113.7" }),
      ),
    );

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("limits an unknown username the same way, so the limit reveals nothing", async () => {
    expect(await forOneUsername("nobody_here", 6)).toEqual([
      401, 401, 401, 401, 401, 429,
    ]);
  });

  it("answers 429 with RATE_LIMITED and a retry-after header, even to the right code", async () => {
    await forOneUsername("alice", 5);

    const sixth = await recover({}, "192.0.2.1");

    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({ code: ApiErrorCode.RateLimited });
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not check the code of a refused attempt", async () => {
    await forOneUsername("alice", 6);

    expect(verify).toHaveBeenCalledTimes(5);
  });

  it("counts other usernames separately", async () => {
    await forOneUsername("alice", 6);

    const otherUsername = await recover(
      { username: "bruno", recoveryCode: WRONG_CODE },
      "192.0.2.1",
    );

    expect(otherUsername.statusCode).toBe(401);
  });

  it("does not count a request refused by validation against the username", async () => {
    for (const remoteAddress of addresses(5)) {
      await recover({ newPassword: "short" }, remoteAddress);
    }

    const valid = await recover({ recoveryCode: WRONG_CODE }, "192.0.2.1");

    expect(valid.statusCode).toBe(401);
  });
});

describe("POST /password/recover logging", () => {
  it("never writes the new password or either Recovery code to the log", async () => {
    const lines: string[] = [];
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      log: {
        level: "trace",
        stream: { write: (line: string): number => lines.push(line) },
      },
    });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
    const oldCode = alice.body.recoveryCode;
    const typedOldCode = oldCode.toLowerCase().replace(/(.{4})(?!$)/g, "$1-");

    const response = await recover({ recoveryCode: typedOldCode });
    const { recoveryCode: newCode } = response.json<PasswordRecoveryResponse>();
    await recover({ recoveryCode: oldCode });
    await recover({ recoveryCode: `U${newCode.slice(1)}` });

    const output = lines.join("");
    expect(response.statusCode).toBe(200);
    expect(output).toContain("request completed");
    for (const secret of [NEW_PASSWORD, oldCode, typedOldCode, newCode]) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toContain(newCode.slice(1));
  });
});
