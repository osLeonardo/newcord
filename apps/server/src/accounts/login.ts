import type { LoginRequest, LoginResponse } from "@newcord/shared";
import type Database from "better-sqlite3";
import { generateDeviceId } from "../devices/device-ids.js";
import type { DeviceStore } from "../devices/device-store.js";
import type { RefreshTokenStore } from "../sessions/refresh-token-store.js";
import type { SessionTokenIssuer } from "../sessions/session-tokens.js";
import type { AccountStore, StoredAccount } from "./account-store.js";
import { DUMMY_PASSWORD_HASH, type PasswordHasher } from "./password-hasher.js";

export type LoginRefusal = "invalid-credentials" | "identity-key-taken";

export type LoginResult =
  | { loggedIn: true; response: LoginResponse }
  | { loggedIn: false; refusal: LoginRefusal };

export type Login = (request: LoginRequest) => Promise<LoginResult>;

export interface LoginDependencies {
  database: Database.Database;
  accountStore: AccountStore;
  deviceStore: DeviceStore;
  refreshTokenStore: Pick<RefreshTokenStore, "deleteForDevice">;
  sessionTokens: SessionTokenIssuer;
  passwordHasher: PasswordHasher;
  clock: () => number;
}

/**
 * Creates the login action: checks the password, then finds the Device by its identity key or
 * adds it to the Account (D59), refusing a key another Account holds (D60). The Device's
 * earlier refresh tokens are replaced by the new one, so it holds one at a time (D81); its
 * open sockets stay open, since the same Device is logging in again.
 * Example: `const result = await createLogin(dependencies)({ username, password, identityKey });`
 */
export function createLogin(dependencies: LoginDependencies): Login {
  const startSession = createSessionTransaction(dependencies);
  return async (request: LoginRequest): Promise<LoginResult> => {
    const account = await findVerifiedAccount(dependencies, request);
    if (account === undefined) {
      return { loggedIn: false, refusal: "invalid-credentials" };
    }
    return startSession(
      account.userId,
      Buffer.from(request.identityKey, "base64"),
    );
  };
}

async function findVerifiedAccount(
  dependencies: LoginDependencies,
  request: LoginRequest,
): Promise<StoredAccount | undefined> {
  const account = dependencies.accountStore.findByUsername(request.username);
  const passwordMatches = await dependencies.passwordHasher.verify(
    account?.passwordHash ?? DUMMY_PASSWORD_HASH,
    request.password,
  );
  return passwordMatches ? account : undefined;
}

function createSessionTransaction(
  dependencies: LoginDependencies,
): (userId: number, identityKey: Buffer) => LoginResult {
  return dependencies.database.transaction(
    (userId: number, identityKey: Buffer): LoginResult => {
      const deviceId = findOrAddDevice(dependencies, userId, identityKey);
      if (deviceId === undefined) {
        return { loggedIn: false, refusal: "identity-key-taken" };
      }
      dependencies.refreshTokenStore.deleteForDevice(deviceId);
      const tokens = dependencies.sessionTokens.issue({ userId, deviceId });
      return { loggedIn: true, response: { ...tokens, deviceId } };
    },
  );
}

function findOrAddDevice(
  dependencies: LoginDependencies,
  userId: number,
  identityKey: Buffer,
): string | undefined {
  const device = dependencies.deviceStore.findByIdentityKey(identityKey);
  if (device !== undefined) {
    return device.userId === userId ? device.deviceId : undefined;
  }
  const deviceId = generateDeviceId();
  const createdAt = dependencies.clock();
  dependencies.deviceStore.insert({ deviceId, userId, identityKey, createdAt });
  return deviceId;
}
