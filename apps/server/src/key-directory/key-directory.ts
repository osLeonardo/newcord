import type Database from "better-sqlite3";

/** Reads the Key directory: the identity keys of each Account's Devices (D64). */
export interface KeyDirectory {
  /** The identity keys of the Devices of the Account named `username`, oldest Device first; undefined if no Account has that name. */
  identityKeysOf(username: string): Buffer[] | undefined;
}

/**
 * Creates the Key directory on an open database.
 * Example: `const identityKeys = createKeyDirectory(database).identityKeysOf("bruno");`
 */
export function createKeyDirectory(database: Database.Database): KeyDirectory {
  const findUserId = database
    .prepare<[string], number>("SELECT id FROM users WHERE username = ?")
    .pluck();
  const listIdentityKeys = database
    .prepare<[number], Buffer>(
      "SELECT identity_key FROM devices WHERE user_id = ? ORDER BY created_at, id",
    )
    .pluck();
  return {
    identityKeysOf: (username: string): Buffer[] | undefined => {
      const userId = findUserId.get(username);
      return userId === undefined ? undefined : listIdentityKeys.all(userId);
    },
  };
}
