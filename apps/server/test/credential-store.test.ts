import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCredentialStore,
  type CredentialStore,
} from "../src/accounts/credential-store.js";
import { openDatabase } from "../src/database/open-database.js";
import { storedHashesOf } from "./support/server-test-kit.js";

let database: Database.Database;
let store: CredentialStore;

beforeEach(() => {
  database = openDatabase(":memory:");
  store = createCredentialStore(database);
  for (const [userId, username] of [
    [7, "alice"],
    [8, "bruno"],
  ] as const) {
    database
      .prepare(
        "INSERT INTO users (id, username, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, 0)",
      )
      .run(userId, username, `${username}-password`, `${username}-recovery`);
  }
});

afterEach(() => {
  database.close();
});

describe("CredentialStore.findRecoverable", () => {
  it("returns the Account's ID and Recovery code hash", () => {
    expect(store.findRecoverable("alice")).toEqual({
      userId: 7,
      recoveryHash: "alice-recovery",
    });
  });

  it("returns undefined for an unknown username", () => {
    expect(store.findRecoverable("nobody_here")).toBeUndefined();
  });
});

describe("CredentialStore.replacePasswordHash", () => {
  it("replaces only that Account's password hash and keeps its Recovery code hash", () => {
    store.replacePasswordHash(7, "alice-new-password");

    expect(storedHashesOf(database, "alice")).toEqual({
      password_hash: "alice-new-password",
      recovery_hash: "alice-recovery",
    });
    expect(storedHashesOf(database, "bruno")).toEqual({
      password_hash: "bruno-password",
      recovery_hash: "bruno-recovery",
    });
  });
});

describe("CredentialStore.replaceCredentialHashes", () => {
  it("replaces both hashes when the Recovery code hash is still the one checked, and says so", () => {
    const replaced = store.replaceCredentialHashes({
      userId: 7,
      checkedRecoveryHash: "alice-recovery",
      passwordHash: "alice-new-password",
      recoveryHash: "alice-new-recovery",
    });

    expect(replaced).toBe(true);
    expect(storedHashesOf(database, "alice")).toEqual({
      password_hash: "alice-new-password",
      recovery_hash: "alice-new-recovery",
    });
    expect(storedHashesOf(database, "bruno")).toMatchObject({
      password_hash: "bruno-password",
    });
  });

  it("changes nothing and says so when the Recovery code hash changed since it was checked", () => {
    const replaced = store.replaceCredentialHashes({
      userId: 7,
      checkedRecoveryHash: "an-older-recovery",
      passwordHash: "alice-new-password",
      recoveryHash: "alice-new-recovery",
    });

    expect(replaced).toBe(false);
    expect(storedHashesOf(database, "alice")).toEqual({
      password_hash: "alice-password",
      recovery_hash: "alice-recovery",
    });
  });
});
