import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAccountStore,
  type AccountStore,
} from "../src/accounts/account-store.js";
import { openDatabase } from "../src/database/open-database.js";

let database: Database.Database;
let store: AccountStore;

beforeEach(() => {
  database = openDatabase(":memory:");
  store = createAccountStore(database);
});

afterEach(() => {
  database.close();
});

describe("AccountStore.usernameOf", () => {
  it("returns the username of an Account found by its ID", () => {
    const outcome = store.createAccount({
      username: "alice",
      passwordHash: "p",
      recoveryHash: "r",
      deviceId: "a".repeat(22),
      identityKey: Buffer.alloc(32, 1),
      createdAt: 0,
    });
    if (!outcome.created)
      throw new Error(`sign-up refused: ${outcome.conflict}`);

    expect(store.usernameOf(outcome.userId)).toBe("alice");
  });

  it("returns undefined for an unknown ID", () => {
    expect(store.usernameOf(404)).toBeUndefined();
  });
});
