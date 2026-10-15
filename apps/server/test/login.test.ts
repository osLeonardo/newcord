import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountStore } from "../src/accounts/account-store.js";
import { createLogin } from "../src/accounts/login.js";
import { createSignUp } from "../src/accounts/sign-up.js";
import { openDatabase } from "../src/database/open-database.js";
import { createDeviceStore } from "../src/devices/device-store.js";
import type { SessionTokenIssuer } from "../src/sessions/session-tokens.js";
import {
  countRows,
  createIdentityKey,
  fastFakeHasher,
  validRegisterRequest,
} from "./support/server-test-kit.js";

const PASSWORD = "correct horse battery staple";

let database: Database.Database;

beforeEach(async () => {
  database = openDatabase(":memory:");
  await createSignUp({
    database,
    accountStore: createAccountStore(database),
    sessionTokens: { issue: () => ({ accessToken: "a", refreshToken: "r" }) },
    passwordHasher: fastFakeHasher,
    clock: () => 0,
  })(validRegisterRequest({ username: "alice", password: PASSWORD }));
});

afterEach(() => {
  database.close();
});

describe("createLogin", () => {
  it("does not keep a new Device when issuing its tokens fails", async () => {
    const failingTokens: SessionTokenIssuer = {
      issue: () => {
        throw new Error("disk full");
      },
    };
    const login = createLogin({
      database,
      accountStore: createAccountStore(database),
      deviceStore: createDeviceStore(database),
      sessionTokens: failingTokens,
      passwordHasher: fastFakeHasher,
      clock: () => 0,
    });

    await expect(
      login({
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
});
