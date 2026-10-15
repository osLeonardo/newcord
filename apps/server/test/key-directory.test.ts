import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountStore } from "../src/accounts/account-store.js";
import { openDatabase } from "../src/database/open-database.js";
import { createDeviceStore } from "../src/devices/device-store.js";
import {
  createKeyDirectory,
  type KeyDirectory,
} from "../src/key-directory/key-directory.js";

let database: Database.Database;
let keyDirectory: KeyDirectory;

beforeEach(() => {
  database = openDatabase(":memory:");
  keyDirectory = createKeyDirectory(database);
});

afterEach(() => {
  database.close();
});

function createAccount(username: string, identityKey: Buffer): number {
  const outcome = createAccountStore(database).createAccount({
    username,
    passwordHash: "password hash",
    recoveryHash: "recovery hash",
    deviceId: randomBytes(16).toString("base64url"),
    identityKey,
    createdAt: 1_000,
  });
  if (!outcome.created) {
    throw new Error(`creating "${username}" failed: ${outcome.conflict}`);
  }
  return outcome.userId;
}

function addDevice(
  userId: number,
  identityKey: Buffer,
  createdAt: number,
): void {
  createDeviceStore(database).insert({
    deviceId: randomBytes(16).toString("base64url"),
    userId,
    identityKey,
    createdAt,
  });
}

describe("KeyDirectory.identityKeysOf", () => {
  it("returns undefined for a username no Account has", () => {
    expect(keyDirectory.identityKeysOf("nobody_here")).toBeUndefined();
  });

  it("returns the identity key of an Account's only Device", () => {
    const identityKey = randomBytes(32);
    createAccount("bruno", identityKey);

    expect(keyDirectory.identityKeysOf("bruno")).toEqual([identityKey]);
  });

  it("returns the keys of every Device of the Account, oldest Device first", () => {
    const [first, second, third] = [
      randomBytes(32),
      randomBytes(32),
      randomBytes(32),
    ];
    const userId = createAccount("bruno", first);
    addDevice(userId, third, 3_000);
    addDevice(userId, second, 2_000);

    expect(keyDirectory.identityKeysOf("bruno")).toEqual([
      first,
      second,
      third,
    ]);
  });

  it("returns only the named Account's keys", () => {
    const brunoKey = randomBytes(32);
    createAccount("alice", randomBytes(32));
    createAccount("bruno", brunoKey);

    expect(keyDirectory.identityKeysOf("bruno")).toEqual([brunoKey]);
  });

  it("returns an empty list for an Account without Devices", () => {
    database
      .prepare(
        "INSERT INTO users (username, password_hash, recovery_hash, created_at) VALUES ('carla', 'p', 'r', 0)",
      )
      .run();

    expect(keyDirectory.identityKeysOf("carla")).toEqual([]);
  });
});
