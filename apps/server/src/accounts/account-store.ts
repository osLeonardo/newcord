import type Database from "better-sqlite3";

export interface NewAccount {
  username: string;
  passwordHash: string;
  recoveryHash: string;
  deviceId: string;
  identityKey: Buffer;
  createdAt: number;
}

export type SignUpConflict = "username-taken" | "identity-key-taken";

export type CreateAccountOutcome =
  | { created: true; userId: number }
  | { created: false; conflict: SignUpConflict };

/** Creates Accounts together with their first Device. */
export interface AccountStore {
  createAccount(account: NewAccount): CreateAccountOutcome;
}

interface AccountStatements {
  findUsername: Database.Statement<[string]>;
  findIdentityKey: Database.Statement<[Buffer]>;
  insertUser: Database.Statement<NewAccount>;
  insertDevice: Database.Statement<NewAccount & { userId: number }>;
}

/**
 * Creates the Account store on an open database.
 * Example: `const outcome = createAccountStore(database).createAccount(newAccount);`
 */
export function createAccountStore(database: Database.Database): AccountStore {
  const statements = prepareAccountStatements(database);
  return {
    createAccount: database.transaction(
      (account: NewAccount): CreateAccountOutcome =>
        insertAccountWithDevice(statements, account),
    ),
  };
}

function prepareAccountStatements(
  database: Database.Database,
): AccountStatements {
  return {
    findUsername: database.prepare("SELECT 1 FROM users WHERE username = ?"),
    findIdentityKey: database.prepare(
      "SELECT 1 FROM devices WHERE identity_key = ?",
    ),
    insertUser: database.prepare(
      "INSERT INTO users (username, password_hash, recovery_hash, created_at) VALUES (@username, @passwordHash, @recoveryHash, @createdAt)",
    ),
    insertDevice: database.prepare(
      "INSERT INTO devices (id, user_id, identity_key, created_at) VALUES (@deviceId, @userId, @identityKey, @createdAt)",
    ),
  };
}

function insertAccountWithDevice(
  statements: AccountStatements,
  account: NewAccount,
): CreateAccountOutcome {
  if (statements.findUsername.get(account.username) !== undefined) {
    return { created: false, conflict: "username-taken" };
  }
  if (statements.findIdentityKey.get(account.identityKey) !== undefined) {
    return { created: false, conflict: "identity-key-taken" };
  }
  const userId = Number(statements.insertUser.run(account).lastInsertRowid);
  statements.insertDevice.run({ ...account, userId });
  return { created: true, userId };
}
