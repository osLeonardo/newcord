import { WebSocketCloseCode } from "@newcord/shared";
import type Database from "better-sqlite3";
import type { DeviceStore } from "../devices/device-store.js";
import type { AccessTokenSubject } from "../sessions/access-tokens.js";
import type { RefreshTokenStore } from "../sessions/refresh-token-store.js";
import type { SessionSockets } from "../websocket/session-sockets.js";
import type { CredentialStore } from "./credential-store.js";
import type { PasswordHasher } from "./password-hasher.js";

/** Sets a new password for the Account of the Device named by the access token. */
export type PasswordChange = (
  caller: AccessTokenSubject,
  newPassword: string,
) => Promise<void>;

export interface PasswordChangeDependencies {
  database: Database.Database;
  credentialStore: Pick<CredentialStore, "replacePasswordHash">;
  deviceStore: Pick<DeviceStore, "deviceIdsOf">;
  refreshTokenStore: Pick<RefreshTokenStore, "deleteForDevice">;
  sessionSockets: Pick<SessionSockets, "closeDeviceSockets">;
  passwordHasher: PasswordHasher;
}

/**
 * Creates the password change: no old password needed (D55). It stores the new hash and
 * deletes the refresh tokens of the Account's other Devices in one transaction, then closes
 * their sockets (D66); the calling Device stays logged in.
 * Example: `await createPasswordChange(dependencies)({ userId, deviceId }, newPassword);`
 */
export function createPasswordChange(
  dependencies: PasswordChangeDependencies,
): PasswordChange {
  const storeChange = createChangeTransaction(dependencies);
  return async (
    caller: AccessTokenSubject,
    newPassword: string,
  ): Promise<void> => {
    const passwordHash = await dependencies.passwordHasher.hash(newPassword);
    for (const deviceId of storeChange(caller, passwordHash)) {
      dependencies.sessionSockets.closeDeviceSockets(
        deviceId,
        WebSocketCloseCode.SessionEnded,
      );
    }
  };
}

/** Returns the IDs of the Devices it logged out. */
function createChangeTransaction(
  dependencies: PasswordChangeDependencies,
): (caller: AccessTokenSubject, passwordHash: string) => string[] {
  return dependencies.database.transaction(
    (caller: AccessTokenSubject, passwordHash: string): string[] => {
      dependencies.credentialStore.replacePasswordHash(
        caller.userId,
        passwordHash,
      );
      const otherDeviceIds = dependencies.deviceStore
        .deviceIdsOf(caller.userId)
        .filter((deviceId) => deviceId !== caller.deviceId);
      for (const deviceId of otherDeviceIds) {
        dependencies.refreshTokenStore.deleteForDevice(deviceId);
      }
      return otherDeviceIds;
    },
  );
}
