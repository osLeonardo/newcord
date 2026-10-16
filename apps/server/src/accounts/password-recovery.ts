import {
  WebSocketCloseCode,
  normalizeRecoveryCode,
  type PasswordRecoveryRequest,
  type PasswordRecoveryResponse,
} from "@newcord/shared";
import type Database from "better-sqlite3";
import type { DeviceStore } from "../devices/device-store.js";
import type { RefreshTokenStore } from "../sessions/refresh-token-store.js";
import type { SessionSockets } from "../websocket/session-sockets.js";
import type {
  CredentialReplacement,
  CredentialStore,
  RecoverableAccount,
} from "./credential-store.js";
import { DUMMY_PASSWORD_HASH, type PasswordHasher } from "./password-hasher.js";
import { generateRecoveryCode } from "./recovery-codes.js";

/** A refusal carries no reason, so a wrong code and an unknown username look the same. */
export type PasswordRecoveryResult =
  | { recovered: true; response: PasswordRecoveryResponse }
  | { recovered: false };

export type PasswordRecovery = (
  request: PasswordRecoveryRequest,
) => Promise<PasswordRecoveryResult>;

export interface PasswordRecoveryDependencies {
  database: Database.Database;
  credentialStore: CredentialStore;
  deviceStore: Pick<DeviceStore, "deviceIdsOf">;
  refreshTokenStore: Pick<RefreshTokenStore, "deleteForDevice">;
  sessionSockets: Pick<SessionSockets, "closeAccountSockets">;
  passwordHasher: PasswordHasher;
}

/**
 * Creates the password recovery: with the right Recovery code it stores the new password and
 * a new code, deletes every refresh token of the Account in one transaction, then closes all
 * its sockets (D55, D66). The new code is returned once; the old one stops working.
 * Example: `const result = await createPasswordRecovery(dependencies)({ username, recoveryCode, newPassword });`
 */
export function createPasswordRecovery(
  dependencies: PasswordRecoveryDependencies,
): PasswordRecovery {
  const storeRecovery = createRecoveryTransaction(dependencies);
  return async (
    request: PasswordRecoveryRequest,
  ): Promise<PasswordRecoveryResult> => {
    const account = await findVerifiedAccount(dependencies, request);
    if (account === undefined) return { recovered: false };
    const recoveryCode = generateRecoveryCode();
    const replacement = await hashNewCredentials(dependencies, account, {
      newPassword: request.newPassword,
      recoveryCode,
    });
    if (!storeRecovery(replacement)) return { recovered: false };
    dependencies.sessionSockets.closeAccountSockets(
      account.userId,
      WebSocketCloseCode.SessionEnded,
    );
    return { recovered: true, response: { recoveryCode } };
  };
}

async function findVerifiedAccount(
  dependencies: PasswordRecoveryDependencies,
  request: PasswordRecoveryRequest,
): Promise<RecoverableAccount | undefined> {
  const account = dependencies.credentialStore.findRecoverable(
    request.username,
  );
  const codeMatches = await dependencies.passwordHasher.verify(
    account?.recoveryHash ?? DUMMY_PASSWORD_HASH,
    normalizeRecoveryCode(request.recoveryCode),
  );
  return codeMatches ? account : undefined;
}

async function hashNewCredentials(
  dependencies: PasswordRecoveryDependencies,
  account: RecoverableAccount,
  secrets: { newPassword: string; recoveryCode: string },
): Promise<CredentialReplacement> {
  const [passwordHash, recoveryHash] = await Promise.all([
    dependencies.passwordHasher.hash(secrets.newPassword),
    dependencies.passwordHasher.hash(secrets.recoveryCode),
  ]);
  return {
    userId: account.userId,
    checkedRecoveryHash: account.recoveryHash,
    passwordHash,
    recoveryHash,
  };
}

/** Returns false, storing nothing, when another recovery used the same code first. */
function createRecoveryTransaction(
  dependencies: PasswordRecoveryDependencies,
): (replacement: CredentialReplacement) => boolean {
  return dependencies.database.transaction(
    (replacement: CredentialReplacement): boolean => {
      if (!dependencies.credentialStore.replaceCredentialHashes(replacement)) {
        return false;
      }
      const deviceIds = dependencies.deviceStore.deviceIdsOf(
        replacement.userId,
      );
      for (const deviceId of deviceIds) {
        dependencies.refreshTokenStore.deleteForDevice(deviceId);
      }
      return true;
    },
  );
}
