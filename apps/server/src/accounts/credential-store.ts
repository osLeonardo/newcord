import type Database from "better-sqlite3";

/** An Account as recovery needs it: its ID and the hash of its current Recovery code. */
export interface RecoverableAccount {
  userId: number;
  recoveryHash: string;
}

/** New password and Recovery code hashes, stored only if the Recovery code hash checked is still current. */
export interface CredentialReplacement {
  userId: number;
  checkedRecoveryHash: string;
  passwordHash: string;
  recoveryHash: string;
}

/** Reads and replaces the password and Recovery code hashes of Accounts (D55). */
export interface CredentialStore {
  findRecoverable(username: string): RecoverableAccount | undefined;
  replacePasswordHash(userId: number, passwordHash: string): void;
  /**
   * Replaces both hashes and returns true, or returns false and changes nothing when the
   * Recovery code hash is no longer `checkedRecoveryHash`, because another recovery used the code first.
   */
  replaceCredentialHashes(replacement: CredentialReplacement): boolean;
}

/**
 * Creates the credential store on an open database.
 * Example: `createCredentialStore(database).replacePasswordHash(userId, passwordHash);`
 */
export function createCredentialStore(
  database: Database.Database,
): CredentialStore {
  const statements = prepareCredentialStatements(database);
  return {
    findRecoverable: (username: string): RecoverableAccount | undefined =>
      statements.findRecoverable.get(username),
    replacePasswordHash: (userId: number, passwordHash: string): void => {
      statements.replacePasswordHash.run({ userId, passwordHash });
    },
    replaceCredentialHashes: (replacement: CredentialReplacement): boolean =>
      statements.replaceCredentialHashes.run(replacement).changes === 1,
  };
}

function prepareCredentialStatements(database: Database.Database): {
  findRecoverable: Database.Statement<[string], RecoverableAccount>;
  replacePasswordHash: Database.Statement<{
    userId: number;
    passwordHash: string;
  }>;
  replaceCredentialHashes: Database.Statement<CredentialReplacement>;
} {
  return {
    findRecoverable: database.prepare(
      "SELECT id AS userId, recovery_hash AS recoveryHash FROM users WHERE username = ?",
    ),
    replacePasswordHash: database.prepare(
      "UPDATE users SET password_hash = @passwordHash WHERE id = @userId",
    ),
    replaceCredentialHashes: database.prepare(
      "UPDATE users SET password_hash = @passwordHash, recovery_hash = @recoveryHash WHERE id = @userId AND recovery_hash = @checkedRecoveryHash",
    ),
  };
}
