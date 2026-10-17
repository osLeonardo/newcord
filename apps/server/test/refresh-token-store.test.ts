import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/database/open-database.js";
import {
  createRefreshTokenStore,
  type RefreshTokenStore,
} from "../src/sessions/refresh-token-store.js";

let database: Database.Database;
let store: RefreshTokenStore;

beforeEach(() => {
  database = openDatabase(":memory:");
  store = createRefreshTokenStore(database);
  database
    .prepare(
      "INSERT INTO users (id, username, password_hash, recovery_hash, created_at) VALUES (7, 'alice', 'p', 'r', 0)",
    )
    .run();
  for (const deviceId of ["phone", "laptop"]) {
    database
      .prepare(
        "INSERT INTO devices (id, user_id, identity_key, created_at) VALUES (?, 7, ?, 0)",
      )
      .run(deviceId, Buffer.from(deviceId));
  }
});

afterEach(() => {
  database.close();
});

const tokenHash = (label: string): Buffer => Buffer.alloc(32, label);

function insertToken(label: string, deviceId: string, expiresAt: number): void {
  store.insert({ tokenHash: tokenHash(label), deviceId, expiresAt });
}

describe("RefreshTokenStore.find", () => {
  it("returns the token's Device, Account, expiry and use", () => {
    insertToken("a", "phone", 1000);

    expect(store.find(tokenHash("a"))).toEqual({
      deviceId: "phone",
      userId: 7,
      expiresAt: 1000,
      usedAt: null,
    });
  });

  it("returns undefined for an unknown hash", () => {
    expect(store.find(tokenHash("missing"))).toBeUndefined();
  });
});

describe("RefreshTokenStore.markUsed", () => {
  it("records when the token was used and keeps the row", () => {
    insertToken("a", "phone", 1000);

    store.markUsed(tokenHash("a"), 500);

    expect(store.find(tokenHash("a"))).toMatchObject({ usedAt: 500 });
  });
});

describe("RefreshTokenStore.deleteForDevice", () => {
  it("deletes every token of one Device and no other", () => {
    insertToken("a", "phone", 1000);
    insertToken("b", "phone", 2000);
    insertToken("c", "laptop", 1000);

    store.deleteForDevice("phone");

    expect(store.find(tokenHash("a"))).toBeUndefined();
    expect(store.find(tokenHash("b"))).toBeUndefined();
    expect(store.find(tokenHash("c"))).toBeDefined();
  });
});

describe("RefreshTokenStore.deleteExpired", () => {
  it("deletes used and unused tokens whose expiry has come, and counts them", () => {
    insertToken("used", "phone", 1000);
    store.markUsed(tokenHash("used"), 10);
    insertToken("unused", "laptop", 999);
    insertToken("later", "phone", 1001);

    expect(store.deleteExpired(1000)).toBe(2);
    expect(store.find(tokenHash("used"))).toBeUndefined();
    expect(store.find(tokenHash("unused"))).toBeUndefined();
    expect(store.find(tokenHash("later"))).toBeDefined();
  });

  it("keeps a used token until it expires, so its reuse is still recognised (D62)", () => {
    insertToken("used", "phone", 1000);
    store.markUsed(tokenHash("used"), 10);

    expect(store.deleteExpired(999)).toBe(0);
    expect(store.find(tokenHash("used"))).toMatchObject({ usedAt: 10 });
  });
});

describe("RefreshTokenStore.hasUsableToken", () => {
  it("is true while the Device has an unused token that has not expired", () => {
    insertToken("a", "phone", 1000);

    expect(store.hasUsableToken("phone", 999)).toBe(true);
  });

  it("is false once the only token expires", () => {
    insertToken("a", "phone", 1000);

    expect(store.hasUsableToken("phone", 1000)).toBe(false);
  });

  it("is false when the only token is used", () => {
    insertToken("a", "phone", 1000);
    store.markUsed(tokenHash("a"), 10);

    expect(store.hasUsableToken("phone", 500)).toBe(false);
  });

  it("looks only at that Device's tokens", () => {
    insertToken("a", "laptop", 1000);

    expect(store.hasUsableToken("phone", 500)).toBe(false);
  });

  it("is true when one of several tokens is still usable", () => {
    insertToken("used", "phone", 1000);
    store.markUsed(tokenHash("used"), 10);
    insertToken("expired", "phone", 400);
    insertToken("fresh", "phone", 2000);

    expect(store.hasUsableToken("phone", 500)).toBe(true);
  });
});
