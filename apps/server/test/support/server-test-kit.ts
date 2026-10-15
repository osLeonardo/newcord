import { generateKeyPairSync } from "node:crypto";
import type { RegisterRequest } from "@newcord/shared";
import type Database from "better-sqlite3";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildServerApp, type ServerAppOptions } from "../../src/app.js";
import { openDatabase } from "../../src/database/open-database.js";

export const TEST_JWT_SECRET = "a test-only JWT secret, longer than 32 bytes";

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

/** A password hasher that skips Argon2id, for tests where hashing is not under test. */
export const fastFakeHasher = {
  hash: (secret: string): Promise<string> =>
    Promise.resolve(`fake-hash-of-${secret.length}-characters`),
};
