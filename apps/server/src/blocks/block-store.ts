import type Database from "better-sqlite3";

/** Who blocks whom (D57); blocking twice or unblocking someone not blocked changes nothing. */
export interface BlockStore {
  block(blocker: number, blocked: number): void;
  unblock(blocker: number, blocked: number): void;
  isBlocked(blocker: number, blocked: number): boolean;
  /** The usernames the Account blocks, sorted. */
  blockedUsernamesOf(blocker: number): string[];
}

/**
 * Creates the block store on an open database.
 * Example: `createBlockStore(database).block(aliceId, brunoId);`
 */
export function createBlockStore(database: Database.Database): BlockStore {
  const insertBlock = database.prepare<[number, number]>(
    "INSERT OR IGNORE INTO blocks (blocker, blocked) VALUES (?, ?)",
  );
  const deleteBlock = database.prepare<[number, number]>(
    "DELETE FROM blocks WHERE blocker = ? AND blocked = ?",
  );
  const findBlock = database
    .prepare<[number, number], number>(
      "SELECT 1 FROM blocks WHERE blocker = ? AND blocked = ?",
    )
    .pluck();
  const listBlocked = database
    .prepare<[number], string>(
      "SELECT users.username FROM blocks JOIN users ON users.id = blocks.blocked WHERE blocks.blocker = ? ORDER BY users.username",
    )
    .pluck();
  return {
    block: (blocker, blocked): void => {
      insertBlock.run(blocker, blocked);
    },
    unblock: (blocker, blocked): void => {
      deleteBlock.run(blocker, blocked);
    },
    isBlocked: (blocker, blocked): boolean =>
      findBlock.get(blocker, blocked) !== undefined,
    blockedUsernamesOf: (blocker): string[] => listBlocked.all(blocker),
  };
}
