import type { RegisterRequest } from "@newcord/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountStore } from "../src/accounts/account-store.js";
import { createLogin, type Login } from "../src/accounts/login.js";
import { createSignUp } from "../src/accounts/sign-up.js";
import { openDatabase } from "../src/database/open-database.js";
import { createDeviceStore } from "../src/devices/device-store.js";
import { createRefreshTokenStore } from "../src/sessions/refresh-token-store.js";
import type { SessionTokenIssuer } from "../src/sessions/session-tokens.js";
import {
  countRefreshTokensOf,
  countRows,
  createIdentityKey,
  fastFakeHasher,
  validRegisterRequest,
} from "./support/server-test-kit.js";

const PASSWORD = "correct horse battery staple";

let database: Database.Database;
let alice: RegisterRequest;

beforeEach(async () => {
  database = openDatabase(":memory:");
  alice = validRegisterRequest({ username: "alice", password: PASSWORD });
  await createSignUp({
    database,
    accountStore: createAccountStore(database),
    sessionTokens: { issue: () => ({ accessToken: "a", refreshToken: "r" }) },
    passwordHasher: fastFakeHasher,
    clock: () => 0,
  })(alice);
});

afterEach(() => {
  database.close();
});

const failingTokens: SessionTokenIssuer = {
  issue: () => {
    throw new Error("disk full");
  },
};

function createFailingLogin(): Login {
  return createLogin({
    database,
    accountStore: createAccountStore(database),
    deviceStore: createDeviceStore(database),
    refreshTokenStore: createRefreshTokenStore(database),
    sessionTokens: failingTokens,
    passwordHasher: fastFakeHasher,
    clock: () => 0,
  });
}

describe("createLogin", () => {
  it("does not keep a new Device when issuing its tokens fails", async () => {
    await expect(
      createFailingLogin()({
        username: "alice",
        password: PASSWORD,
        identityKey: createIdentityKey(),
      }),
    ).rejects.toThrow("disk full");
    expect(countRows(database)).toEqual({
      users: 1,
      devices: 1,
      refresh_tokens: 0,
    });
  });

  it("keeps the Device's existing refresh tokens when issuing the new one fails (D81)", async () => {
    const deviceId = database
      .prepare("SELECT id FROM devices")
      .pluck()
      .get() as string;
    createRefreshTokenStore(database).insert({
      tokenHash: Buffer.alloc(32, 1),
      deviceId,
      expiresAt: Number.MAX_SAFE_INTEGER,
    });

    await expect(
      createFailingLogin()({
        username: "alice",
        password: PASSWORD,
        identityKey: alice.identityKey,
      }),
    ).rejects.toThrow("disk full");
    expect(countRefreshTokensOf(database, deviceId)).toBe(1);
  });
});
