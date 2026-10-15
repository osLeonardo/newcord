import type { RegisterRequest, RegisterResponse } from "@newcord/shared";
import type Database from "better-sqlite3";
import { generateDeviceId } from "../devices/device-ids.js";
import type {
  SessionTokenIssuer,
  SessionTokens,
} from "../sessions/session-tokens.js";
import type {
  AccountStore,
  NewAccount,
  SignUpConflict,
} from "./account-store.js";
import type { PasswordHasher } from "./password-hasher.js";
import { generateRecoveryCode } from "./recovery-codes.js";

export type SignUpResult =
  | { created: true; response: RegisterResponse }
  | { created: false; conflict: SignUpConflict };

export type SignUp = (request: RegisterRequest) => Promise<SignUpResult>;

export interface SignUpDependencies {
  database: Database.Database;
  accountStore: AccountStore;
  sessionTokens: SessionTokenIssuer;
  passwordHasher: PasswordHasher;
  clock: () => number;
}

type StoredSignUp =
  | { created: true; tokens: SessionTokens }
  | { created: false; conflict: SignUpConflict };

/**
 * Creates the sign-up action: hashes the password and a new Recovery code, then stores the
 * Account, its first Device and its refresh token in one transaction.
 * Example: `const result = await createSignUp(dependencies)({ username, password, identityKey });`
 */
export function createSignUp(dependencies: SignUpDependencies): SignUp {
  const storeAccountWithTokens = createStoreTransaction(dependencies);
  return async (request: RegisterRequest): Promise<SignUpResult> => {
    const recoveryCode = generateRecoveryCode();
    const account = await prepareNewAccount(
      request,
      recoveryCode,
      dependencies,
    );
    const stored = storeAccountWithTokens(account);
    if (!stored.created) return stored;
    const response = {
      ...stored.tokens,
      deviceId: account.deviceId,
      recoveryCode,
    };
    return { created: true, response };
  };
}

function createStoreTransaction(
  dependencies: SignUpDependencies,
): (account: NewAccount) => StoredSignUp {
  return dependencies.database.transaction(
    (account: NewAccount): StoredSignUp => {
      const outcome = dependencies.accountStore.createAccount(account);
      if (!outcome.created) return outcome;
      const subject = { userId: outcome.userId, deviceId: account.deviceId };
      return {
        created: true,
        tokens: dependencies.sessionTokens.issue(subject),
      };
    },
  );
}

async function prepareNewAccount(
  request: RegisterRequest,
  recoveryCode: string,
  dependencies: SignUpDependencies,
): Promise<NewAccount> {
  const [passwordHash, recoveryHash] = await Promise.all([
    dependencies.passwordHasher.hash(request.password),
    dependencies.passwordHasher.hash(recoveryCode),
  ]);
  return {
    username: request.username,
    passwordHash,
    recoveryHash,
    deviceId: generateDeviceId(),
    identityKey: Buffer.from(request.identityKey, "base64"),
    createdAt: dependencies.clock(),
  };
}
