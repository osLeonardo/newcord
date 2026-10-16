import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import type { RegisterRequest, RegisterResponse } from "@newcord/shared";
import type Database from "better-sqlite3";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { PasswordHasher } from "../../src/accounts/password-hasher.js";
import { buildServerApp, type ServerAppOptions } from "../../src/app.js";
import { openDatabase } from "../../src/database/open-database.js";

export const TEST_JWT_SECRET = "a test-only JWT secret, longer than 32 bytes";

/** The relay every test server hands out credentials for. */
export const TEST_RELAY = {
  secret: "a test-only relay secret, longer than 32 bytes",
  urls: ["stun:relay.test:3478", "turn:relay.test:3478"],
} as const;

export interface TestServer {
  app: FastifyInstance;
  database: Database.Database;
  close(): Promise<void>;
}

/** Builds the server app on a fresh in-memory database. */
export async function startTestServer(
  overrides: Partial<ServerAppOptions> = {},
): Promise<TestServer> {
  const database = openDatabase(":memory:");
  const app = await buildServerApp({
    jwtSecret: TEST_JWT_SECRET,
    database,
    relay: TEST_RELAY,
    ...overrides,
  });
  return {
    app,
    database,
    close: async (): Promise<void> => {
      await app.close();
      database.close();
    },
  };
}

/** A fresh Ed25519 public key in the form the app sends: raw 32 bytes, base64. */
export function createIdentityKey(): string {
  const spki = generateKeyPairSync("ed25519").publicKey.export({
    format: "der",
    type: "spki",
  });
  return spki.subarray(-32).toString("base64");
}

/** A valid sign-up body with a fresh identity key, changed by `overrides`. */
export function validRegisterRequest(
  overrides: Partial<RegisterRequest> = {},
): RegisterRequest {
  return {
    username: "alice",
    password: "correct horse battery staple",
    identityKey: createIdentityKey(),
    ...overrides,
  };
}

/** Sends `POST /register` with `payload`, from `remoteAddress` when given. */
export function register(
  app: FastifyInstance,
  payload: object | string,
  remoteAddress = "127.0.0.1",
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/register",
    payload,
    remoteAddress,
  });
}

/** Counts the rows of each table created at start. */
export function countRows(database: Database.Database): Record<string, number> {
  const count = (table: string): number =>
    database.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
  return {
    users: count("users"),
    devices: count("devices"),
    refresh_tokens: count("refresh_tokens"),
  };
}

export interface Argon2HashDescription {
  algorithm: string;
  cost: Record<string, number>;
}

/** Reads an Argon2 PHC string, e.g. `{ algorithm: "argon2id", cost: { m: 19456, t: 2, p: 1 } }`. */
export function describeArgon2Hash(hash: string): Argon2HashDescription {
  const [, algorithm = "", , parameters = ""] = hash.split("$");
  const cost = Object.fromEntries(
    parameters.split(",").map((pair) => {
      const [name = "", value] = pair.split("=");
      return [name, Number(value)];
    }),
  );
  return { algorithm, cost };
}

const fakeHashOf = (secret: string): string =>
  `fake-sha256:${createHash("sha256").update(secret).digest("hex")}`;

/** A password hasher that skips Argon2id, for tests where hashing is not under test. */
export const fastFakeHasher = {
  hash: (secret: string): Promise<string> =>
    Promise.resolve(fakeHashOf(secret)),
  verify: (hash: string, secret: string): Promise<boolean> =>
    Promise.resolve(hash === fakeHashOf(secret)),
} satisfies PasswordHasher;

/** Signs up through `POST /register` and returns the request and its `201` body. */
export async function signUp(
  app: FastifyInstance,
  overrides: Partial<RegisterRequest> = {},
): Promise<{ request: RegisterRequest; body: RegisterResponse }> {
  const request = validRegisterRequest(overrides);
  const response = await register(app, request);
  if (response.statusCode !== 201) {
    throw new Error(
      `sign-up of "${request.username}" answered ${response.statusCode}, expected 201: ${response.body}`,
    );
  }
  return { request, body: response.json<RegisterResponse>() };
}

/** Sends `POST /login` with `payload`, from `remoteAddress` when given. */
export function login(
  app: FastifyInstance,
  payload: object,
  remoteAddress = "127.0.0.1",
): Promise<LightMyRequestResponse> {
  return app.inject({ method: "POST", url: "/login", payload, remoteAddress });
}

/** Sends `POST /refresh` with `{ refreshToken }`, from `remoteAddress` when given. */
export function refresh(
  app: FastifyInstance,
  refreshToken: string,
  remoteAddress = "127.0.0.1",
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/refresh",
    payload: { refreshToken },
    remoteAddress,
  });
}

/** Sends `POST /logout` with `authorization` as the Authorization header, when given. */
export function logout(
  app: FastifyInstance,
  authorization?: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/logout",
    headers: authorization === undefined ? {} : { authorization },
  });
}

/** Sends `POST /password/change` with `payload` and `authorization` as the Authorization header, when given. */
export function changePassword(
  app: FastifyInstance,
  payload: object,
  authorization?: string,
  remoteAddress = "127.0.0.1",
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/password/change",
    payload,
    headers: authorization === undefined ? {} : { authorization },
    remoteAddress,
  });
}

/** Sends `POST /password/recover` with `payload`, from `remoteAddress` when given. */
export function recoverPassword(
  app: FastifyInstance,
  payload: object,
  remoteAddress = "127.0.0.1",
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/password/recover",
    payload,
    remoteAddress,
  });
}

export interface StoredCredentialHashes {
  password_hash: string;
  recovery_hash: string;
}

/** Reads the password and Recovery code hashes stored for `username`. */
export function storedHashesOf(
  database: Database.Database,
  username: string,
): StoredCredentialHashes | undefined {
  return database
    .prepare(
      "SELECT password_hash, recovery_hash FROM users WHERE username = ?",
    )
    .get(username) as StoredCredentialHashes | undefined;
}

export interface RefreshTokenRow {
  token_hash: Buffer;
  device_id: string;
  expires_at: number;
  used_at: number | null;
}

/** Reads the refresh_tokens row of `refreshToken`, found by its SHA-256 hash. */
export function refreshTokenRow(
  database: Database.Database,
  refreshToken: string,
): RefreshTokenRow | undefined {
  const tokenHash = createHash("sha256").update(refreshToken).digest();
  return database
    .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?")
    .get(tokenHash) as RefreshTokenRow | undefined;
}

/** Counts the refresh_tokens rows of one Device. */
export function countRefreshTokensOf(
  database: Database.Database,
  deviceId: string,
): number {
  return database
    .prepare("SELECT count(*) FROM refresh_tokens WHERE device_id = ?")
    .pluck()
    .get(deviceId) as number;
}

export interface TestJwt {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
  sign: (signedPart: string) => Buffer;
}

/** Builds a JWT by hand, so tests can forge the algorithm, signature and claims. */
export function buildTestJwt(jwt: TestJwt): string {
  const encode = (part: object): string =>
    Buffer.from(JSON.stringify(part)).toString("base64url");
  const signedPart = `${encode(jwt.header)}.${encode(jwt.claims)}`;
  return `${signedPart}.${jwt.sign(signedPart).toString("base64url")}`;
}

/** Signs with HMAC over `hashAlgorithm` (sha256 for HS256), as an HS-family JWT does. */
export function hmacSignature(
  secret: string,
  hashAlgorithm = "sha256",
): TestJwt["sign"] {
  return (signedPart: string): Buffer =>
    createHmac(hashAlgorithm, secret).update(signedPart).digest();
}

/** Seconds since the epoch, as JWT claims count time. */
export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Puts Devices in one new Group directly, as Group creation and accepted commits would, so
 * their Accounts see each other online. Returns the Group's ID in base64url.
 */
export function shareGroup(
  database: Database.Database,
  deviceIds: readonly string[],
): string {
  const groupId = randomBytes(16);
  database
    .prepare(
      "INSERT INTO groups (id, name, epoch, created_at) VALUES (?, 'friends', 0, 0)",
    )
    .run(groupId);
  const addMember = database.prepare(
    "INSERT INTO group_members (group_id, device_id) VALUES (?, ?)",
  );
  for (const deviceId of deviceIds) addMember.run(groupId, deviceId);
  return groupId.toString("base64url");
}
