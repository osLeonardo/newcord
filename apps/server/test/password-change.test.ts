import { WebSocketCloseCode } from "@newcord/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCredentialStore } from "../src/accounts/credential-store.js";
import {
  createPasswordChange,
  type PasswordChange,
  type PasswordChangeDependencies,
} from "../src/accounts/password-change.js";
import { createDeviceStore } from "../src/devices/device-store.js";
import { createRefreshTokenStore } from "../src/sessions/refresh-token-store.js";
import {
  ALICE_ID,
  OLD_PASSWORD,
  openCredentialTestDatabase,
  refreshTokenCounts,
} from "./support/credential-test-database.js";
import { fastFakeHasher, storedHashesOf } from "./support/server-test-kit.js";

const NEW_PASSWORD = "a brand new password";
const ALICE_PHONE = { userId: ALICE_ID, deviceId: "alice-phone" };

let database: Database.Database;
const closeDeviceSockets = vi.fn();

beforeEach(async () => {
  closeDeviceSockets.mockClear();
  database = await openCredentialTestDatabase();
});

afterEach(() => {
  database.close();
});

function createChange(
  overrides: Partial<PasswordChangeDependencies> = {},
): PasswordChange {
  return createPasswordChange({
    database,
    credentialStore: createCredentialStore(database),
    deviceStore: createDeviceStore(database),
    refreshTokenStore: createRefreshTokenStore(database),
    sessionSockets: { closeDeviceSockets },
    passwordHasher: fastFakeHasher,
    ...overrides,
  });
}

describe("createPasswordChange", () => {
  it("stores the new password's hash and keeps the Recovery code hash", async () => {
    const before = storedHashesOf(database, "alice");

    await createChange()(ALICE_PHONE, NEW_PASSWORD);

    expect(storedHashesOf(database, "alice")).toEqual({
      password_hash: await fastFakeHasher.hash(NEW_PASSWORD),
      recovery_hash: before?.recovery_hash,
    });
  });

  it("deletes the refresh tokens of the Account's other Devices, not the caller's nor another Account's (D66)", async () => {
    await createChange()(ALICE_PHONE, NEW_PASSWORD);

    expect(refreshTokenCounts(database)).toEqual({
      "alice-phone": 1,
      "alice-laptop": 0,
      "alice-desktop": 0,
      "bruno-phone": 1,
    });
  });

  it("closes the sockets of each other Device with the session-ended code, not the caller's (D66)", async () => {
    await createChange()(ALICE_PHONE, NEW_PASSWORD);

    expect(closeDeviceSockets.mock.calls.sort()).toEqual([
      ["alice-desktop", WebSocketCloseCode.SessionEnded],
      ["alice-laptop", WebSocketCloseCode.SessionEnded],
    ]);
  });

  it("keeps the old hash and every token, and closes no socket, when deleting a token fails", async () => {
    const before = storedHashesOf(database, "alice");
    const change = createChange({
      refreshTokenStore: {
        deleteForDevice: (): void => {
          throw new Error("disk full");
        },
      },
    });

    await expect(change(ALICE_PHONE, NEW_PASSWORD)).rejects.toThrow(
      "disk full",
    );

    expect(storedHashesOf(database, "alice")).toEqual(before);
    expect(refreshTokenCounts(database)).toMatchObject({ "alice-laptop": 1 });
    expect(closeDeviceSockets).not.toHaveBeenCalled();
  });

  it("changes nothing when hashing the new password fails", async () => {
    const change = createChange({
      passwordHasher: {
        hash: (): Promise<string> => Promise.reject(new Error("out of memory")),
        verify: fastFakeHasher.verify,
      },
    });

    await expect(change(ALICE_PHONE, NEW_PASSWORD)).rejects.toThrow(
      "out of memory",
    );

    expect(storedHashesOf(database, "alice")).toMatchObject({
      password_hash: await fastFakeHasher.hash(OLD_PASSWORD),
    });
    expect(refreshTokenCounts(database)).toMatchObject({ "alice-laptop": 1 });
    expect(closeDeviceSockets).not.toHaveBeenCalled();
  });
});
