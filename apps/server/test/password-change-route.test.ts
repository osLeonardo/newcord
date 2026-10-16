import {
  ApiErrorCode,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from "@newcord/shared";
import argon2 from "argon2";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changePassword,
  countRefreshTokensOf,
  createIdentityKey,
  describeArgon2Hash,
  fastFakeHasher,
  login,
  refresh,
  signUp,
  startTestServer,
  storedHashesOf,
  type TestServer,
} from "./support/server-test-kit.js";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new password";
const CHANGES_PER_HOUR = 5;

let server: TestServer;
let alice: { request: RegisterRequest; body: RegisterResponse };

afterEach(async () => {
  await server.close();
});

const bearer = (accessToken: string): string => `Bearer ${accessToken}`;

async function logIn(
  username: string,
  identityKey = createIdentityKey(),
): Promise<LoginResponse> {
  const response = await login(server.app, {
    username,
    password: PASSWORD,
    identityKey,
  });
  return response.json<LoginResponse>();
}

const changeAsAlice = (
  payload: object = { newPassword: NEW_PASSWORD },
): Promise<LightMyRequestResponse> =>
  changePassword(server.app, payload, bearer(alice.body.accessToken));

describe("POST /password/change with a valid access token", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  });

  it("answers 204 with no body", async () => {
    const response = await changeAsAlice();

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });

  it("makes the new password the one that logs in, without asking for the old one (D55)", async () => {
    await changeAsAlice();

    const withOld = await login(server.app, {
      username: "alice",
      password: PASSWORD,
      identityKey: alice.request.identityKey,
    });
    const withNew = await login(server.app, {
      username: "alice",
      password: NEW_PASSWORD,
      identityKey: alice.request.identityKey,
    });

    expect(withOld.statusCode).toBe(401);
    expect(withNew.statusCode).toBe(200);
  });

  it("keeps the Recovery code working: its hash is not touched", async () => {
    const before = storedHashesOf(server.database, "alice");

    await changeAsAlice();

    expect(storedHashesOf(server.database, "alice")?.recovery_hash).toBe(
      before?.recovery_hash,
    );
  });

  it("deletes the refresh tokens of the Account's other Devices, so they must log in again (D66)", async () => {
    const laptop = await logIn("alice");
    const desktop = await logIn("alice");

    await changeAsAlice();

    for (const device of [laptop, desktop]) {
      expect(countRefreshTokensOf(server.database, device.deviceId)).toBe(0);
      expect((await refresh(server.app, device.refreshToken)).statusCode).toBe(
        401,
      );
    }
  });

  it("keeps the calling Device logged in: its refresh token still works", async () => {
    await logIn("alice");

    await changeAsAlice();

    expect(
      (await refresh(server.app, alice.body.refreshToken)).statusCode,
    ).toBe(200);
  });

  it("leaves other Accounts' refresh tokens alone", async () => {
    const bruno = await signUp(server.app, { username: "bruno" });

    await changeAsAlice();

    expect(
      (await refresh(server.app, bruno.body.refreshToken)).statusCode,
    ).toBe(200);
  });
});

describe("POST /password/change hashing", () => {
  it("stores the new password only as an Argon2id hash with 19 MiB, 2 iterations and 1 thread", async () => {
    server = await startTestServer();
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });

    await changeAsAlice();

    const passwordHash = storedHashesOf(
      server.database,
      "alice",
    )?.password_hash;
    expect(describeArgon2Hash(passwordHash ?? "")).toEqual({
      algorithm: "argon2id",
      cost: { m: 19 * 1024, t: 2, p: 1 },
    });
    expect(await argon2.verify(passwordHash ?? "", NEW_PASSWORD)).toBe(true);
  });
});

describe("POST /password/change refusals", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  });

  it.each([
    ["without an Authorization header", (): undefined => undefined],
    ["with a token that is not a JWT", (): string => "Bearer not-a-jwt"],
    [
      "with the refresh token instead of the access token",
      (): string => bearer(alice.body.refreshToken),
    ],
  ])("answers 401 %s and changes nothing", async (_case, authorization) => {
    const before = storedHashesOf(server.database, "alice");

    const response = await changePassword(
      server.app,
      { newPassword: NEW_PASSWORD },
      authorization(),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.InvalidAccessToken,
    });
    expect(storedHashesOf(server.database, "alice")).toEqual(before);
  });

  it.each([
    ["a new password of 11 characters", { newPassword: "p".repeat(11) }],
    ["a new password of 257 characters", { newPassword: "p".repeat(257) }],
    ["no new password", {}],
    [
      "the old password as an extra field",
      { newPassword: NEW_PASSWORD, oldPassword: PASSWORD },
    ],
  ])("answers 400 to %s and changes nothing", async (_case, payload) => {
    const laptop = await logIn("alice");
    const before = storedHashesOf(server.database, "alice");

    const response = await changeAsAlice(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "FST_ERR_VALIDATION" });
    expect(storedHashesOf(server.database, "alice")).toEqual(before);
    expect(countRefreshTokensOf(server.database, laptop.deviceId)).toBe(1);
  });
});

describe("POST /password/change rate limit", () => {
  const hash = vi.fn(fastFakeHasher.hash);

  beforeEach(async () => {
    server = await startTestServer({
      passwordHasher: { hash, verify: fastFakeHasher.verify },
    });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });
    hash.mockClear();
  });

  async function statusesOf(
    count: number,
    changeOne: (index: number) => Promise<LightMyRequestResponse>,
  ): Promise<number[]> {
    const statuses: number[] = [];
    for (let index = 0; index < count; index++) {
      statuses.push((await changeOne(index)).statusCode);
    }
    return statuses;
  }

  it("answers 429 with RATE_LIMITED and a retry-after header to the sixth change by one Account within an hour", async () => {
    const allowed = await statusesOf(CHANGES_PER_HOUR, () => changeAsAlice());

    const sixth = await changeAsAlice();

    expect(allowed).toEqual([204, 204, 204, 204, 204]);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({ code: ApiErrorCode.RateLimited });
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not hash the new password of a refused change", async () => {
    await statusesOf(CHANGES_PER_HOUR + 1, () => changeAsAlice());

    expect(hash).toHaveBeenCalledTimes(CHANGES_PER_HOUR);
  });

  it("counts the changes of all the Account's Devices together", async () => {
    const laptop = await logIn("alice");
    const changeAsLaptop = (): Promise<LightMyRequestResponse> =>
      changePassword(
        server.app,
        { newPassword: NEW_PASSWORD },
        bearer(laptop.accessToken),
      );
    await statusesOf(3, () => changeAsAlice());
    await statusesOf(2, changeAsLaptop);

    expect((await changeAsLaptop()).statusCode).toBe(429);
    expect((await changeAsAlice()).statusCode).toBe(429);
  });

  it("limits the Account, not the IP address: changing address does not help", async () => {
    const statuses = await statusesOf(CHANGES_PER_HOUR + 1, (index) =>
      changePassword(
        server.app,
        { newPassword: NEW_PASSWORD },
        bearer(alice.body.accessToken),
        `198.51.100.${index}`,
      ),
    );

    expect(statuses.at(-1)).toBe(429);
  });

  it("counts each Account separately", async () => {
    const bruno = await signUp(server.app, { username: "bruno" });
    await statusesOf(CHANGES_PER_HOUR + 1, () => changeAsAlice());

    const byBruno = await changePassword(
      server.app,
      { newPassword: NEW_PASSWORD },
      bearer(bruno.body.accessToken),
    );

    expect(byBruno.statusCode).toBe(204);
  });

  it("counts every authenticated attempt, even one refused by validation", async () => {
    await statusesOf(CHANGES_PER_HOUR, () =>
      changeAsAlice({ newPassword: "short" }),
    );

    expect((await changeAsAlice()).statusCode).toBe(429);
  });
});

describe("POST /password/change logging", () => {
  it("never writes the new password or the access token to the log", async () => {
    const lines: string[] = [];
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      log: {
        level: "trace",
        stream: { write: (line: string): number => lines.push(line) },
      },
    });
    alice = await signUp(server.app, { username: "alice", password: PASSWORD });

    const response = await changeAsAlice();
    await changeAsAlice({ newPassword: NEW_PASSWORD, oldPassword: PASSWORD });

    const output = lines.join("");
    expect(response.statusCode).toBe(204);
    expect(output).toContain("request completed");
    for (const secret of [NEW_PASSWORD, PASSWORD, alice.body.accessToken]) {
      expect(output).not.toContain(secret);
    }
  });
});
