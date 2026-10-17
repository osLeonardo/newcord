import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountStore } from "../src/accounts/account-store.js";
import { createSignUp } from "../src/accounts/sign-up.js";
import { openDatabase } from "../src/database/open-database.js";
import type { SessionTokenIssuer } from "../src/sessions/session-tokens.js";
import {
  countRows,
  fastFakeHasher,
  validRegisterRequest,
} from "./support/server-test-kit.js";

let database: Database.Database;

beforeEach(() => {
  database = openDatabase(":memory:");
});

afterEach(() => {
  database.close();
});

describe("createSignUp", () => {
  it("rolls back the Account and its Device when issuing the tokens fails", async () => {
    const failingTokens: SessionTokenIssuer = {
      issue: () => {
        throw new Error("disk full");
      },
    };
    const signUp = createSignUp({
      database,
      accountStore: createAccountStore(database),
      sessionTokens: failingTokens,
      passwordHasher: fastFakeHasher,
      clock: () => 0,
    });

    await expect(signUp(validRegisterRequest())).rejects.toThrow("disk full");
    expect(countRows(database)).toEqual({
      users: 0,
      devices: 0,
      refresh_tokens: 0,
    });
  });

  it("reports a taken username before checking the identity key", async () => {
    const signUp = createSignUp({
      database,
      accountStore: createAccountStore(database),
      sessionTokens: { issue: () => ({ accessToken: "a", refreshToken: "r" }) },
      passwordHasher: fastFakeHasher,
      clock: () => 0,
    });
    const first = validRegisterRequest();
    await signUp(first);

    const result = await signUp(
      validRegisterRequest({ identityKey: first.identityKey }),
    );

    expect(result).toEqual({ created: false, conflict: "username-taken" });
  });
});
