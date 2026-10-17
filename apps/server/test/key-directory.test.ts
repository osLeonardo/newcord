import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountStore } from "../src/accounts/account-store.js";
import { openDatabase } from "../src/database/open-database.js";
import { createDeviceStore } from "../src/devices/device-store.js";
import {
  createKeyDirectory,
  keyDirectoryAudience,
  type KeyDirectory,
} from "../src/key-directory/key-directory.js";

/** The caller in these tests; the audience lets it look up everyone unless a test says otherwise. */
const CALLER = 1_000;
const everyone = { mayLookUp: (): boolean => true };

let database: Database.Database;
let keyDirectory: KeyDirectory;

beforeEach(() => {
  database = openDatabase(":memory:");
  keyDirectory = createKeyDirectory(database, everyone);
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
    expect(
      keyDirectory.identityKeysVisibleTo(CALLER, "nobody_here"),
    ).toBeUndefined();
  });

  it("returns the identity key of an Account's only Device", () => {
    const identityKey = randomBytes(32);
    createAccount("bruno", identityKey);

    expect(keyDirectory.identityKeysVisibleTo(CALLER, "bruno")).toEqual([
      identityKey,
    ]);
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

    expect(keyDirectory.identityKeysVisibleTo(CALLER, "bruno")).toEqual([
      first,
      second,
      third,
    ]);
  });

  it("returns only the named Account's keys", () => {
    const brunoKey = randomBytes(32);
    createAccount("alice", randomBytes(32));
    createAccount("bruno", brunoKey);

    expect(keyDirectory.identityKeysVisibleTo(CALLER, "bruno")).toEqual([
      brunoKey,
    ]);
  });

  it("returns an empty list for an Account without Devices", () => {
    database
      .prepare(
        "INSERT INTO users (username, password_hash, recovery_hash, created_at) VALUES ('carla', 'p', 'r', 0)",
      )
      .run();

    expect(keyDirectory.identityKeysVisibleTo(CALLER, "carla")).toEqual([]);
  });
});

describe("KeyDirectory.identityKeysVisibleTo with a narrowed audience (D64)", () => {
  it("answers about an Account the audience allows, and like an unknown username otherwise", () => {
    const bruno = createAccount("bruno", randomBytes(32));
    createAccount("carla", randomBytes(32));
    const narrowed = createKeyDirectory(database, {
      mayLookUp: (caller, target): boolean =>
        caller === CALLER && target === bruno,
    });

    expect(narrowed.identityKeysVisibleTo(CALLER, "bruno")).toHaveLength(1);
    expect(narrowed.identityKeysVisibleTo(CALLER, "carla")).toBeUndefined();
  });
});

describe("keyDirectoryAudience", () => {
  const groups = {
    coMemberUserIdsOf: (userId: number): number[] => (userId === 1 ? [2] : []),
  };
  const invitations = {
    isOpenBetween: (first: number, second: number): boolean =>
      (first === 1 && second === 3) || (first === 3 && second === 1),
  };
  const audience = keyDirectoryAudience(groups, invitations);

  it("lets an Account look up itself, its co-Members and Accounts with an open Invitation either way", () => {
    expect(audience.mayLookUp(1, 1)).toBe(true);
    expect(audience.mayLookUp(1, 2)).toBe(true);
    expect(audience.mayLookUp(1, 3)).toBe(true);
    expect(audience.mayLookUp(3, 1)).toBe(true);
  });

  it("refuses anyone else", () => {
    expect(audience.mayLookUp(1, 4)).toBe(false);
    expect(audience.mayLookUp(2, 3)).toBe(false);
  });
});
