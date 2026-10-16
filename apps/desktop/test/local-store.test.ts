import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createIdentityKeyPair } from "../src/main/identity/identity-key";
import {
  createSqliteLocalStore,
  type LocalStore,
  type SessionTokens,
  type StoredAccount,
} from "../src/main/local-store/local-store";

const account: StoredAccount = {
  username: "alice",
  deviceId: "AAAAAAAAAAAAAAAAAAAAAA",
};
const tokens: SessionTokens = {
  accessToken: "header.claims.signature",
  refreshToken: "r".repeat(43),
};

const openDatabases: Database.Database[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const database of openDatabases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function openDatabase(filename = ":memory:"): Database.Database {
  const database = new Database(filename);
  openDatabases.push(database);
  return database;
}

function memoryStore(): { store: LocalStore; database: Database.Database } {
  const database = openDatabase();
  return { store: createSqliteLocalStore(database), database };
}

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "newcord-local-store-"));
  temporaryDirectories.push(directory);
  return join(directory, "device.db");
}

describe("a new local store", () => {
  it("holds no identity key, Account or tokens", () => {
    const { store } = memoryStore();

    expect(store.readIdentityKey()).toBeUndefined();
    expect(store.readAccount()).toBeUndefined();
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("turns on SQLite's secure_delete, so deleted rows are overwritten", () => {
    const { database } = memoryStore();

    expect(database.pragma("secure_delete", { simple: true })).toBe(1);
  });

  it("can be opened again on a database that already has its tables", () => {
    const database = openDatabase();
    createSqliteLocalStore(database);

    expect(() => createSqliteLocalStore(database)).not.toThrow();
  });
});

describe("the identity key", () => {
  it("is read back byte for byte", () => {
    const { store } = memoryStore();
    const keyPair = createIdentityKeyPair();

    store.saveIdentityKey(keyPair);

    expect(store.readIdentityKey()).toEqual(keyPair);
  });

  it("is never silently replaced by another key", () => {
    const { store } = memoryStore();
    const keyPair = createIdentityKeyPair();
    store.saveIdentityKey(keyPair);

    expect(() => {
      store.saveIdentityKey(createIdentityKeyPair());
    }).toThrow();
    expect(store.readIdentityKey()).toEqual(keyPair);
  });

  it.each([
    { publicKey: Buffer.alloc(31), privateKey: Buffer.alloc(32) },
    { publicKey: Buffer.alloc(32), privateKey: Buffer.alloc(33) },
  ])("refuses keys that are not 32 raw bytes", (keyPair) => {
    const { store } = memoryStore();

    expect(() => {
      store.saveIdentityKey(keyPair);
    }).toThrow();
  });
});

describe("a login", () => {
  it("stores the Account's username, the deviceId and the tokens", () => {
    const { store } = memoryStore();

    store.saveLogin(account, tokens);

    expect(store.readAccount()).toEqual(account);
    expect(store.readSessionTokens()).toEqual(tokens);
  });

  it("replaces the tokens of an earlier login", () => {
    const { store } = memoryStore();
    store.saveLogin(account, tokens);
    const newTokens = {
      accessToken: "new.access.token",
      refreshToken: "n".repeat(43),
    };

    store.saveLogin(account, newTokens);

    expect(store.readSessionTokens()).toEqual(newTokens);
  });
});

describe("replacing renewed tokens", () => {
  const renewed: SessionTokens = {
    accessToken: "renewed.claims.signature",
    refreshToken: "n".repeat(43),
  };

  it("stores the new tokens when the renewed refresh token is still stored", () => {
    const { store } = memoryStore();
    store.saveLogin(account, tokens);

    expect(store.replaceSessionTokens(tokens.refreshToken, renewed)).toBe(true);
    expect(store.readSessionTokens()).toEqual(renewed);
  });

  it("changes nothing after the tokens were deleted", () => {
    const { store } = memoryStore();
    store.saveLogin(account, tokens);
    store.deleteSessionTokens();

    expect(store.replaceSessionTokens(tokens.refreshToken, renewed)).toBe(
      false,
    );
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("changes nothing when another login stored other tokens meanwhile", () => {
    const { store } = memoryStore();
    store.saveLogin(account, renewed);

    expect(store.replaceSessionTokens(tokens.refreshToken, tokens)).toBe(false);
    expect(store.readSessionTokens()).toEqual(renewed);
  });
});

describe("deleting the session tokens", () => {
  it("keeps the identity key, the username and the deviceId", () => {
    const { store } = memoryStore();
    const keyPair = createIdentityKeyPair();
    store.saveIdentityKey(keyPair);
    store.saveLogin(account, tokens);

    store.deleteSessionTokens();

    expect(store.readSessionTokens()).toBeUndefined();
    expect(store.readAccount()).toEqual(account);
    expect(store.readIdentityKey()).toEqual(keyPair);
  });

  it("does nothing when no tokens are stored", () => {
    const { store } = memoryStore();

    expect(() => {
      store.deleteSessionTokens();
    }).not.toThrow();
  });
});

describe("a database file", () => {
  it("keeps everything across a restart of the app", () => {
    const path = temporaryDatabasePath();
    const keyPair = createIdentityKeyPair();
    const firstRun = openDatabase(path);
    const firstStore = createSqliteLocalStore(firstRun);
    firstStore.saveIdentityKey(keyPair);
    firstStore.saveLogin(account, tokens);
    firstRun.close();

    const restartedStore = createSqliteLocalStore(openDatabase(path));

    expect(restartedStore.readIdentityKey()).toEqual(keyPair);
    expect(restartedStore.readAccount()).toEqual(account);
    expect(restartedStore.readSessionTokens()).toEqual(tokens);
  });
});
