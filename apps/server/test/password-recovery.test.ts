import {
  RecoveryCode,
  WebSocketCloseCode,
  type PasswordRecoveryRequest,
} from "@newcord/shared";
import type Database from "better-sqlite3";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCredentialStore } from "../src/accounts/credential-store.js";
import { DUMMY_PASSWORD_HASH } from "../src/accounts/password-hasher.js";
import {
  createPasswordRecovery,
  type PasswordRecovery,
  type PasswordRecoveryDependencies,
  type PasswordRecoveryResult,
} from "../src/accounts/password-recovery.js";
import { createDeviceStore } from "../src/devices/device-store.js";
import { createRefreshTokenStore } from "../src/sessions/refresh-token-store.js";
import {
  ALICE_ID,
  OLD_RECOVERY_CODE,
  openCredentialTestDatabase,
  refreshTokenCounts,
} from "./support/credential-test-database.js";
import { fastFakeHasher, storedHashesOf } from "./support/server-test-kit.js";

const NEW_PASSWORD = "a brand new password";

let database: Database.Database;
const closeAccountSockets = vi.fn();
const verify = vi.fn(fastFakeHasher.verify);

beforeEach(async () => {
  closeAccountSockets.mockClear();
  verify.mockClear();
  database = await openCredentialTestDatabase();
});

afterEach(() => {
  database.close();
});

function createRecovery(
  overrides: Partial<PasswordRecoveryDependencies> = {},
): PasswordRecovery {
  return createPasswordRecovery({
    database,
    credentialStore: createCredentialStore(database),
    deviceStore: createDeviceStore(database),
    refreshTokenStore: createRefreshTokenStore(database),
    sessionSockets: { closeAccountSockets },
    passwordHasher: { hash: fastFakeHasher.hash, verify },
    ...overrides,
  });
}

function recoveryRequest(
  overrides: Partial<PasswordRecoveryRequest> = {},
): PasswordRecoveryRequest {
  return {
    username: "alice",
    recoveryCode: OLD_RECOVERY_CODE,
    newPassword: NEW_PASSWORD,
    ...overrides,
  };
}

function newCodeOf(result: PasswordRecoveryResult): string {
  if (!result.recovered) throw new Error("recovery was refused");
  return result.response.recoveryCode;
}

describe("createPasswordRecovery with the right code", () => {
  it("returns a new Recovery code and stores its hash and the new password's (D55)", async () => {
    const result = await createRecovery()(recoveryRequest());
    const newCode = newCodeOf(result);

    expect(Value.Check(RecoveryCode, newCode)).toBe(true);
    expect(newCode).not.toBe(OLD_RECOVERY_CODE);
    expect(storedHashesOf(database, "alice")).toEqual({
      password_hash: await fastFakeHasher.hash(NEW_PASSWORD),
      recovery_hash: await fastFakeHasher.hash(newCode),
    });
  });

  it("deletes every refresh token of the Account and none of another Account's (D66)", async () => {
    await createRecovery()(recoveryRequest());

    expect(refreshTokenCounts(database)).toEqual({
      "alice-phone": 0,
      "alice-laptop": 0,
      "alice-desktop": 0,
      "bruno-phone": 1,
    });
  });

  it("closes every socket of the Account once, with the session-ended code (D66)", async () => {
    await createRecovery()(recoveryRequest());

    expect(closeAccountSockets).toHaveBeenCalledExactlyOnceWith(
      ALICE_ID,
      WebSocketCloseCode.SessionEnded,
    );
  });

  it("checks the code as issued when it was typed in lower case with dashes, O for 0 and I for 1", async () => {
    const typedCode = "oi23-4567-89ab-cdef-ghjk-mnpq";
    const oldHash = storedHashesOf(database, "alice")?.recovery_hash;

    const result = await createRecovery()(
      recoveryRequest({ recoveryCode: typedCode }),
    );

    expect(result.recovered).toBe(true);
    expect(verify).toHaveBeenCalledExactlyOnceWith(oldHash, OLD_RECOVERY_CODE);
  });

  it("lets only one of two recoveries racing with the same code succeed, and keeps the code it returned", async () => {
    const recover = createRecovery();

    const results = await Promise.all([
      recover(recoveryRequest()),
      recover(recoveryRequest({ newPassword: "another new password" })),
    ]);

    const winners = results.filter((result) => result.recovered);
    expect(winners).toHaveLength(1);
    expect(storedHashesOf(database, "alice")?.recovery_hash).toBe(
      await fastFakeHasher.hash(newCodeOf(winners[0] ?? results[0])),
    );
    expect(closeAccountSockets).toHaveBeenCalledOnce();
  });
});

describe("createPasswordRecovery refusals", () => {
  it("refuses a wrong code and changes nothing", async () => {
    const before = storedHashesOf(database, "alice");

    const result = await createRecovery()(
      recoveryRequest({ recoveryCode: "Z".repeat(24) }),
    );

    expect(result).toEqual({ recovered: false });
    expect(storedHashesOf(database, "alice")).toEqual(before);
    expect(refreshTokenCounts(database)).toMatchObject({ "alice-phone": 1 });
    expect(closeAccountSockets).not.toHaveBeenCalled();
  });

  it("refuses an unknown username after checking the code against the fixed dummy hash", async () => {
    const result = await createRecovery()(
      recoveryRequest({ username: "nobody_here" }),
    );

    expect(result).toEqual({ recovered: false });
    expect(verify).toHaveBeenCalledExactlyOnceWith(
      DUMMY_PASSWORD_HASH,
      OLD_RECOVERY_CODE,
    );
  });

  it("keeps the old hashes and every token, and closes no socket, when deleting a token fails", async () => {
    const before = storedHashesOf(database, "alice");
    const recover = createRecovery({
      refreshTokenStore: {
        deleteForDevice: (): void => {
          throw new Error("disk full");
        },
      },
    });

    await expect(recover(recoveryRequest())).rejects.toThrow("disk full");

    expect(storedHashesOf(database, "alice")).toEqual(before);
    expect(refreshTokenCounts(database)).toMatchObject({ "alice-phone": 1 });
    expect(closeAccountSockets).not.toHaveBeenCalled();
  });
});
