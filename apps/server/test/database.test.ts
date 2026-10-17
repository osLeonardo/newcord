import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/database/open-database.js";
import { createTables } from "../src/database/schema.js";

let database: Database.Database;

beforeEach(() => {
  database = openDatabase(":memory:");
});

afterEach(() => {
  database.close();
});

function columnsOf(table: string): string[] {
  return database
    .prepare("SELECT name FROM pragma_table_info(?) ORDER BY cid")
    .pluck()
    .all(table) as string[];
}

function insertUser(username: string): number {
  const result = database
    .prepare(
      "INSERT INTO users (username, password_hash, recovery_hash, created_at) VALUES (?, 'p', 'r', 0)",
    )
    .run(username);
  return Number(result.lastInsertRowid);
}

function insertDevice(id: string, userId: number, identityKey: Buffer): void {
  database
    .prepare(
      "INSERT INTO devices (id, user_id, identity_key, created_at) VALUES (?, ?, ?, 0)",
    )
    .run(id, userId, identityKey);
}

describe("openDatabase", () => {
  it("creates M1's and M2's tables", () => {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
      )
      .pluck()
      .all();

    expect(tables).toEqual([
      "blocks",
      "deliveries",
      "devices",
      "group_members",
      "groups",
      "invitations",
      "key_packages",
      "messages",
      "refresh_tokens",
      "users",
    ]);
  });

  it("gives M2's tables the guide's columns plus #5's additions", () => {
    expect(columnsOf("groups")).toEqual([
      "id",
      "name",
      "epoch",
      "last_seq",
      "created_at",
    ]);
    expect(columnsOf("group_members")).toEqual([
      "group_id",
      "device_id",
      "leaving",
      "needs_resync",
    ]);
    expect(columnsOf("invitations")).toEqual([
      "id",
      "group_id",
      "from_user",
      "to_user",
      "status",
      "hidden",
      "created_at",
    ]);
    expect(columnsOf("key_packages")).toEqual([
      "id",
      "device_id",
      "data",
      "last_resort",
    ]);
    expect(columnsOf("messages")).toEqual([
      "group_id",
      "seq",
      "sender",
      "kind",
      "payload",
      "declared",
      "created_at",
    ]);
    expect(columnsOf("deliveries")).toEqual(["group_id", "seq", "device_id"]);
    expect(columnsOf("blocks")).toEqual(["blocker", "blocked"]);
  });

  it("accepts only the four Invitation statuses", () => {
    const userId = insertUser("alice");
    database
      .prepare(
        "INSERT INTO groups (id, name, epoch, created_at) VALUES (?, 'g', 0, 0)",
      )
      .run(Buffer.alloc(16));
    const insertInvitation = (status: string): unknown =>
      database
        .prepare(
          "INSERT INTO invitations (id, group_id, from_user, to_user, status, created_at) VALUES (?, ?, ?, ?, ?, 0)",
        )
        .run(status, Buffer.alloc(16), userId, userId, status);

    for (const status of ["pending", "accepted", "declined", "expired"]) {
      expect(() => insertInvitation(status)).not.toThrow();
    }
    expect(() => insertInvitation("joined")).toThrow(/CHECK/);
  });

  it("refuses a block of oneself", () => {
    const userId = insertUser("alice");

    expect(() =>
      database
        .prepare("INSERT INTO blocks (blocker, blocked) VALUES (?, ?)")
        .run(userId, userId),
    ).toThrow(/CHECK/);
  });

  it("gives each table the columns of the PRD's Schema Changes", () => {
    expect(columnsOf("users")).toEqual([
      "id",
      "username",
      "password_hash",
      "recovery_hash",
      "created_at",
    ]);
    expect(columnsOf("devices")).toEqual([
      "id",
      "user_id",
      "identity_key",
      "created_at",
    ]);
    expect(columnsOf("refresh_tokens")).toEqual([
      "token_hash",
      "device_id",
      "expires_at",
      "used_at",
    ]);
  });

  it("turns foreign keys on", () => {
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("refuses a device whose user does not exist", () => {
    expect(() => insertDevice("device-1", 999, Buffer.alloc(32))).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it("refuses a refresh token whose device does not exist", () => {
    const insertToken = (): unknown =>
      database
        .prepare(
          "INSERT INTO refresh_tokens (token_hash, device_id, expires_at) VALUES (?, 'missing', 0)",
        )
        .run(Buffer.alloc(32));

    expect(insertToken).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("refuses a second user with the same username", () => {
    insertUser("alice");

    expect(() => insertUser("alice")).toThrow(
      /UNIQUE constraint failed: users.username/,
    );
  });

  it("refuses an identity key already held by any Account's device (D60)", () => {
    const key = Buffer.alloc(32, 7);
    insertDevice("device-1", insertUser("alice"), key);

    expect(() => insertDevice("device-2", insertUser("bruno"), key)).toThrow(
      /UNIQUE constraint failed: devices.identity_key/,
    );
  });

  it("keeps the existing tables and rows when the tables are created again", () => {
    insertUser("alice");

    createTables(database);

    expect(
      database.prepare("SELECT username FROM users").pluck().all(),
    ).toEqual(["alice"]);
  });
});
