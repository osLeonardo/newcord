import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { openDatabase } from "../../src/database/open-database.js";

/** The Accounts of the Group test database, by username, with their IDs and Devices. */
export const GROUP_TEST_ACCOUNTS = {
  alice: { userId: 1, deviceIds: ["alice-phone", "alice-laptop"] },
  bruno: { userId: 2, deviceIds: ["bruno-phone"] },
  carla: { userId: 3, deviceIds: ["carla-phone"] },
  dora: { userId: 4, deviceIds: ["dora-phone"] },
} as const;

/** Opens an in-memory database holding the Group test Accounts and their Devices. */
export function openGroupTestDatabase(): Database.Database {
  const database = openDatabase(":memory:");
  for (const [username, account] of Object.entries(GROUP_TEST_ACCOUNTS)) {
    database
      .prepare(
        "INSERT INTO users (id, username, password_hash, recovery_hash, created_at) VALUES (?, ?, 'p', 'r', 0)",
      )
      .run(account.userId, username);
    for (const deviceId of account.deviceIds) {
      database
        .prepare(
          "INSERT INTO devices (id, user_id, identity_key, created_at) VALUES (?, ?, ?, 0)",
        )
        .run(deviceId, account.userId, randomBytes(32));
    }
  }
  return database;
}

/** A fresh 16-byte Group ID. */
export function newGroupId(): Buffer {
  return randomBytes(16);
}

/** Adds Devices to a Group directly, as an accepted commit would. */
export function addMembers(
  database: Database.Database,
  groupId: Buffer,
  deviceIds: readonly string[],
): void {
  const insert = database.prepare(
    "INSERT INTO group_members (group_id, device_id) VALUES (?, ?)",
  );
  for (const deviceId of deviceIds) insert.run(groupId, deviceId);
}

/** Creates a Group directly, at epoch 0, with the given Member Devices. */
export function insertGroup(
  database: Database.Database,
  deviceIds: readonly string[],
  name = "friends",
): Buffer {
  const groupId = newGroupId();
  database
    .prepare(
      "INSERT INTO groups (id, name, epoch, created_at) VALUES (?, ?, 0, 0)",
    )
    .run(groupId, name);
  addMembers(database, groupId, deviceIds);
  return groupId;
}
