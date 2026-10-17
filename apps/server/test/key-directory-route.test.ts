import {
  ApiErrorCode,
  KeyDirectoryResponse,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from "@newcord/shared";
import type { LightMyRequestResponse } from "fastify";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TEST_JWT_SECRET,
  buildTestJwt,
  createIdentityKey,
  fastFakeHasher,
  hmacSignature,
  login,
  nowInSeconds,
  shareGroup,
  signUp,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";

const PASSWORD = "correct horse battery staple";
const LOOKUPS_PER_MINUTE = 60;

let server: TestServer;
let alice: { request: RegisterRequest; body: RegisterResponse };
let bruno: { request: RegisterRequest; body: RegisterResponse };

beforeEach(async () => {
  server = await startTestServer({ passwordHasher: fastFakeHasher });
  alice = await signUp(server.app, { username: "alice", password: PASSWORD });
  bruno = await signUp(server.app, { username: "bruno", password: PASSWORD });
  shareGroup(server.database, [alice.body.deviceId, bruno.body.deviceId]);
});

afterEach(async () => {
  await server.close();
});

const bearer = (accessToken: string): string => `Bearer ${accessToken}`;

function lookUpKeys(
  username: string,
  authorization?: string,
  remoteAddress = "127.0.0.1",
): Promise<LightMyRequestResponse> {
  return server.app.inject({
    method: "GET",
    url: `/users/${encodeURIComponent(username)}/keys`,
    headers: authorization === undefined ? {} : { authorization },
    remoteAddress,
  });
}

const lookUpAsAlice = (username: string): Promise<LightMyRequestResponse> =>
  lookUpKeys(username, bearer(alice.body.accessToken));

async function logIn(
  username: string,
  identityKey: string,
): Promise<LoginResponse> {
  const response = await login(server.app, {
    username,
    password: PASSWORD,
    identityKey,
  });
  return response.json<LoginResponse>();
}

describe("GET /users/:username/keys with a valid access token", () => {
  it("answers 200 with the identity key of the Account's only Device", async () => {
    const response = await lookUpAsAlice("bruno");
    const body = response.json<KeyDirectoryResponse>();

    expect(response.statusCode).toBe(200);
    expect(Value.Check(KeyDirectoryResponse, body)).toBe(true);
    expect(body).toEqual({ identityKeys: [bruno.request.identityKey] });
  });

  it("lists the base64 identity keys of every Device of the Account, oldest first", async () => {
    const laptopKey = createIdentityKey();
    const desktopKey = createIdentityKey();
    await logIn("bruno", laptopKey);
    await logIn("bruno", desktopKey);

    const response = await lookUpAsAlice("bruno");

    expect(response.json()).toEqual({
      identityKeys: [bruno.request.identityKey, laptopKey, desktopKey],
    });
  });

  it("lets an Account look up its own Devices' keys", async () => {
    const response = await lookUpAsAlice("alice");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      identityKeys: [alice.request.identityKey],
    });
  });

  it("answers 404 with ACCOUNT_NOT_FOUND for a username no Account has", async () => {
    const response = await lookUpAsAlice("nobody_here");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.AccountNotFound,
    });
  });

  it.each([
    ["capital letters", "Bruno"],
    ["2 characters", "br"],
    ["33 characters", "b".repeat(33)],
    ["a dash", "br-uno"],
    ["a space", "br uno"],
    ["a slash", "br/uno"],
    ["a letter outside ASCII", "brúno"],
    ["no characters at all", ""],
  ])(
    "answers 400 to a username with %s, breaking the username rules",
    async (_case, username) => {
      const response = await lookUpAsAlice(username);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "FST_ERR_VALIDATION" });
    },
  );

  it("answers 414 to a username past the router's 100-character parameter limit, before any check runs", async () => {
    const response = await lookUpKeys("b".repeat(101), undefined);

    expect(response.statusCode).toBe(414);
    expect(response.json()).toMatchObject({ code: "FST_ERR_MAX_PARAM_LENGTH" });
  });
});

describe("GET /users/:username/keys without a valid access token", () => {
  const claimsFor = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    sub: "1",
    deviceId: alice.body.deviceId,
    iat: nowInSeconds(),
    exp: nowInSeconds() + 900,
    ...overrides,
  });

  const tokenSignedWith = (
    alg: string,
    secret: string,
    claims: Record<string, unknown>,
  ): string =>
    buildTestJwt({
      header: { alg, typ: "JWT" },
      claims,
      sign: hmacSignature(secret),
    });

  async function expectRefused(
    username: string,
    authorization?: string,
  ): Promise<void> {
    const response = await lookUpKeys(username, authorization);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.InvalidAccessToken,
    });
    expect(response.body).not.toContain(bruno.request.identityKey);
  }

  it("accepts a hand-built HS256 token, so the refusals below test only what they change", async () => {
    const token = tokenSignedWith("HS256", TEST_JWT_SECRET, claimsFor());

    expect((await lookUpKeys("bruno", bearer(token))).statusCode).toBe(200);
  });

  it("answers 401 without an Authorization header (D64)", async () => {
    await expectRefused("bruno", undefined);
  });

  it("answers 401 to a token signed with another secret", async () => {
    const forged = tokenSignedWith(
      "HS256",
      "another secret, also longer than 32 bytes",
      claimsFor(),
    );

    await expectRefused("bruno", bearer(forged));
  });

  it("answers 401 to an expired token", async () => {
    const expired = tokenSignedWith(
      "HS256",
      TEST_JWT_SECRET,
      claimsFor({ iat: nowInSeconds() - 901, exp: nowInSeconds() - 1 }),
    );

    await expectRefused("bruno", bearer(expired));
  });

  it("answers 401 to a token with the none algorithm instead of HS256 (D37c)", async () => {
    const unsigned = buildTestJwt({
      header: { alg: "none", typ: "JWT" },
      claims: claimsFor(),
      sign: () => Buffer.alloc(0),
    });

    await expectRefused("bruno", bearer(unsigned));
  });

  it("answers 401 to a refresh token sent as the access token", async () => {
    await expectRefused("bruno", bearer(alice.body.refreshToken));
  });

  it("answers 401, not 404, for an unknown username, so strangers cannot list usernames (D64)", async () => {
    await expectRefused("nobody_here", undefined);
  });

  it("answers 401, not 400, for a username breaking the rules", async () => {
    await expectRefused("Not A Username", undefined);
  });
});

describe("GET /users/:username/keys rate limit", () => {
  async function statusesOf(
    count: number,
    lookUpOne: (index: number) => Promise<LightMyRequestResponse>,
  ): Promise<number[]> {
    const statuses: number[] = [];
    for (let index = 0; index < count; index++) {
      statuses.push((await lookUpOne(index)).statusCode);
    }
    return statuses;
  }

  const timesAnswering = (count: number, status: number): number[] =>
    Array.from({ length: count }, () => status);

  it("answers 429 with RATE_LIMITED and a retry-after header to the 61st lookup by one Account within a minute", async () => {
    const allowed = await statusesOf(LOOKUPS_PER_MINUTE, () =>
      lookUpAsAlice("bruno"),
    );

    const sixtyFirst = await lookUpAsAlice("bruno");

    expect(allowed).toEqual(timesAnswering(LOOKUPS_PER_MINUTE, 200));
    expect(sixtyFirst.statusCode).toBe(429);
    expect(sixtyFirst.json()).toMatchObject({ code: ApiErrorCode.RateLimited });
    expect(Number(sixtyFirst.headers["retry-after"])).toBeGreaterThan(0);
    expect(sixtyFirst.body).not.toContain(bruno.request.identityKey);
  });

  it("counts lookups answered 404 or 400 too, so probing for usernames is limited", async () => {
    const half = LOOKUPS_PER_MINUTE / 2;
    const unknown = await statusesOf(half, (index) =>
      lookUpAsAlice(`nobody_${index}`),
    );
    const invalid = await statusesOf(half, (index) =>
      lookUpAsAlice(`Invalid${index}`),
    );

    const sixtyFirst = await lookUpAsAlice("bruno");

    expect(unknown).toEqual(timesAnswering(half, 404));
    expect(invalid).toEqual(timesAnswering(half, 400));
    expect(sixtyFirst.statusCode).toBe(429);
  });

  it("counts the lookups of all the Account's Devices together", async () => {
    const laptop = await logIn("alice", createIdentityKey());
    const half = LOOKUPS_PER_MINUTE / 2;
    await statusesOf(half, () => lookUpAsAlice("bruno"));
    await statusesOf(half, () =>
      lookUpKeys("bruno", bearer(laptop.accessToken)),
    );

    const fromPhone = await lookUpAsAlice("bruno");
    const fromLaptop = await lookUpKeys("bruno", bearer(laptop.accessToken));

    expect(fromPhone.statusCode).toBe(429);
    expect(fromLaptop.statusCode).toBe(429);
  });

  it("limits the Account, not the IP address: changing address does not help", async () => {
    const statuses = await statusesOf(LOOKUPS_PER_MINUTE + 1, (index) =>
      lookUpKeys(
        "bruno",
        bearer(alice.body.accessToken),
        `198.51.100.${index}`,
      ),
    );

    expect(statuses.at(-1)).toBe(429);
  });

  it("counts each Account separately, even from the same IP address", async () => {
    await statusesOf(LOOKUPS_PER_MINUTE + 1, () => lookUpAsAlice("bruno"));

    const byBruno = await lookUpKeys("alice", bearer(bruno.body.accessToken));

    expect(byBruno.statusCode).toBe(200);
  });
});

describe("GET /users/:username/keys logging", () => {
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

    const response = await lookUpKeys("alice", bearer(body.accessToken));

    expect(response.statusCode).toBe(200);
    expect(lines.join("")).toContain("request completed");
    expect(lines.join("")).not.toContain(body.accessToken);
  });
});
