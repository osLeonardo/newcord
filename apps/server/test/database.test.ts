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
  it("creates the users, devices and refresh_tokens tables", () => {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
      )
      .pluck()
      .all();

    expect(tables).toEqual(["devices", "refresh_tokens", "users"]);
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
