import type Database from "better-sqlite3";

/** Reads the Key directory: the identity keys of each Account's Devices (D64). */
export interface KeyDirectory {
  /**
   * The identity keys of the Devices of the Account named `username`, oldest Device first;
   * undefined if no Account has that name or the caller may not look it up.
   */
  identityKeysVisibleTo(
    callerUserId: number,
    username: string,
  ): Buffer[] | undefined;
}

/** Whom an Account may look up: itself, and Accounts sharing a Group or an open Invitation with it (D64). */
export interface KeyDirectoryAudience {
  mayLookUp(callerUserId: number, targetUserId: number): boolean;
}

/**
 * Creates the Key directory on an open database.
 * Example: `const identityKeys = createKeyDirectory(database, audience).identityKeysVisibleTo(aliceId, "bruno");`
 */
export function createKeyDirectory(
  database: Database.Database,
  audience: KeyDirectoryAudience,
): KeyDirectory {
  const findUserId = database
    .prepare<[string], number>("SELECT id FROM users WHERE username = ?")
    .pluck();
  const listIdentityKeys = database
    .prepare<[number], Buffer>(
      "SELECT identity_key FROM devices WHERE user_id = ? ORDER BY created_at, id",
    )
    .pluck();
  return {
    identityKeysVisibleTo: (callerUserId, username): Buffer[] | undefined => {
      const userId = findUserId.get(username);
      if (userId === undefined || !audience.mayLookUp(callerUserId, userId)) {
        return undefined;
      }
      return listIdentityKeys.all(userId);
    },
  };
}

/**
 * The Key directory's audience from the Group and Invitation stores.
 * Example: `createKeyDirectory(database, keyDirectoryAudience(groupStore, invitationStore));`
 */
export function keyDirectoryAudience(
  groupStore: { coMemberUserIdsOf(userId: number): readonly number[] },
  invitationStore: {
    isOpenBetween(firstUser: number, secondUser: number): boolean;
  },
): KeyDirectoryAudience {
  return {
    mayLookUp: (callerUserId, targetUserId): boolean =>
      callerUserId === targetUserId ||
      groupStore.coMemberUserIdsOf(callerUserId).includes(targetUserId) ||
      invitationStore.isOpenBetween(callerUserId, targetUserId),
  };
}
