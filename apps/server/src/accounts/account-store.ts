import type Database from "better-sqlite3";
import {
  createDeviceStore,
  type DeviceStore,
} from "../devices/device-store.js";

export interface NewAccount {
  username: string;
  passwordHash: string;
  recoveryHash: string;
  deviceId: string;
  identityKey: Buffer;
  createdAt: number;
}

/** An Account as login needs it: its ID and password hash. */
export interface StoredAccount {
  userId: number;
  passwordHash: string;
}

export type SignUpConflict = "username-taken" | "identity-key-taken";

export type CreateAccountOutcome =
  | { created: true; userId: number }
  | { created: false; conflict: SignUpConflict };

/** Creates Accounts together with their first Device, finds them by username and names them by ID. */
export interface AccountStore {
  createAccount(account: NewAccount): CreateAccountOutcome;
  findByUsername(username: string): StoredAccount | undefined;
  usernameOf(userId: number): string | undefined;
}

interface AccountStatements {
  findAccount: Database.Statement<[string], StoredAccount>;
  insertUser: Database.Statement<NewAccount>;
  devices: DeviceStore;
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
    findByUsername: (username: string): StoredAccount | undefined =>
      statements.findAccount.get(username),
    usernameOf: createUsernameLookup(database),
  };
}

function createUsernameLookup(
  database: Database.Database,
): AccountStore["usernameOf"] {
  const findUsername = database
    .prepare<[number], string>("SELECT username FROM users WHERE id = ?")
    .pluck();
  return (userId: number): string | undefined => findUsername.get(userId);
}

function prepareAccountStatements(
  database: Database.Database,
): AccountStatements {
  return {
    findAccount: database.prepare(
      "SELECT id AS userId, password_hash AS passwordHash FROM users WHERE username = ?",
    ),
    insertUser: database.prepare(
      "INSERT INTO users (username, password_hash, recovery_hash, created_at) VALUES (@username, @passwordHash, @recoveryHash, @createdAt)",
    ),
    devices: createDeviceStore(database),
  };
}

function insertAccountWithDevice(
  statements: AccountStatements,
  account: NewAccount,
): CreateAccountOutcome {
  if (statements.findAccount.get(account.username) !== undefined) {
    return { created: false, conflict: "username-taken" };
  }
  if (statements.devices.findByIdentityKey(account.identityKey) !== undefined) {
    return { created: false, conflict: "identity-key-taken" };
  }
  const userId = Number(statements.insertUser.run(account).lastInsertRowid);
  statements.devices.insert({ ...account, userId });
  return { created: true, userId };
}
