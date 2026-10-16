import type Database from "better-sqlite3";
import { openDatabase } from "../../src/database/open-database.js";
import { countRefreshTokensOf, fastFakeHasher } from "./server-test-kit.js";

/** Alice's Account ID in the credential test database. */
export const ALICE_ID = 7;
/** Bruno's Account ID in the credential test database. */
export const BRUNO_ID = 8;
/** The password both Accounts start with. */
export const OLD_PASSWORD = "correct horse battery staple";
/** The Recovery code both Accounts start with. */
export const OLD_RECOVERY_CODE = "0123456789ABCDEFGHJKMNPQ";

/** Each test Device and the Account it belongs to; each starts with one refresh token. */
export const TEST_DEVICES = {
  "alice-phone": ALICE_ID,
  "alice-laptop": ALICE_ID,
  "alice-desktop": ALICE_ID,
  "bruno-phone": BRUNO_ID,
} as const;

export type TestDeviceId = keyof typeof TEST_DEVICES;

/**
 * Opens an in-memory database with Alice (three Devices) and Bruno (one Device), whose
 * hashes come from `fastFakeHasher`, for unit tests of password change and recovery.
 */
export async function openCredentialTestDatabase(): Promise<Database.Database> {
  const database = openDatabase(":memory:");
  const passwordHash = await fastFakeHasher.hash(OLD_PASSWORD);
  const recoveryHash = await fastFakeHasher.hash(OLD_RECOVERY_CODE);
  for (const [userId, username] of [
    [ALICE_ID, "alice"],
    [BRUNO_ID, "bruno"],
  ] as const) {
    database
      .prepare(
        "INSERT INTO users (id, username, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, 0)",
      )
      .run(userId, username, passwordHash, recoveryHash);
  }
  for (const [deviceId, userId] of Object.entries(TEST_DEVICES)) {
    insertDeviceWithToken(database, deviceId, userId);
  }
  return database;
}

function insertDeviceWithToken(
  database: Database.Database,
  deviceId: string,
  userId: number,
): void {
  database
    .prepare(
      "INSERT INTO devices (id, user_id, identity_key, created_at) VALUES (?, ?, ?, 0)",
    )
    .run(deviceId, userId, Buffer.from(deviceId));
  database
    .prepare(
      "INSERT INTO refresh_tokens (token_hash, device_id, expires_at) VALUES (?, ?, ?)",
    )
    .run(Buffer.from(deviceId), deviceId, Number.MAX_SAFE_INTEGER);
}

/** Counts the refresh tokens of every test Device. */
export function refreshTokenCounts(
  database: Database.Database,
): Record<TestDeviceId, number> {
  const count = (deviceId: TestDeviceId): number =>
    countRefreshTokensOf(database, deviceId);
  return {
    "alice-phone": count("alice-phone"),
    "alice-laptop": count("alice-laptop"),
    "alice-desktop": count("alice-desktop"),
    "bruno-phone": count("bruno-phone"),
  };
}
