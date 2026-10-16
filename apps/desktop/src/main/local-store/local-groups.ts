import type Database from "better-sqlite3";

/** A Group this Device is in, as the Group list shows it. */
export interface LocalGroup {
  readonly groupId: Uint8Array;
  readonly name: string;
}

/** A pending Invitation addressed to this Account. */
export interface LocalInvitation {
  readonly invitationId: string;
  readonly groupId: Uint8Array;
  readonly groupName: string;
  readonly from: string;
}

/** The Groups this Device is in, how far it got in each one's queue, and pending Invitations. */
export interface LocalGroups {
  list(): LocalGroup[];
  has(groupId: Uint8Array): boolean;
  /** Adds a Group the Device joined; the queue counts from `seq`, the welcome or creation. */
  add(group: LocalGroup, seq: number): void;
  rename(groupId: Uint8Array, name: string): void;
  /** Forgets a Group the Device left or was removed from, with everything stored for it. */
  remove(groupId: Uint8Array): void;
  /** The last sequence number processed in the Group, or undefined for an unknown Group. */
  lastSeq(groupId: Uint8Array): number | undefined;
  markProcessed(groupId: Uint8Array, seq: number): void;
  invitations(): LocalInvitation[];
  putInvitation(invitation: LocalInvitation): void;
  removeInvitation(invitationId: string): void;
}

const CREATE_GROUP_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS groups (
  id       BLOB PRIMARY KEY CHECK (length(id) = 16),
  name     TEXT NOT NULL,
  last_seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id         TEXT PRIMARY KEY,
  group_id   BLOB NOT NULL,
  group_name TEXT NOT NULL,
  from_user  TEXT NOT NULL
);
`;

/**
 * Creates the local Group store, creating its tables if needed (#6's spec).
 * @example const groups = createLocalGroups(database);
 */
export function createLocalGroups(database: Database.Database): LocalGroups {
  database.exec(CREATE_GROUP_TABLES_SQL);
  return {
    ...groupQueries(database),
    ...progressQueries(database),
    ...invitationQueries(database),
  };
}

function groupQueries(
  database: Database.Database,
): Pick<LocalGroups, "list" | "has" | "add" | "rename" | "remove"> {
  const list = database.prepare<[], { groupId: Buffer; name: string }>(
    "SELECT id AS groupId, name FROM groups ORDER BY name COLLATE NOCASE, id",
  );
  const find = database
    .prepare<[Buffer], number>("SELECT 1 FROM groups WHERE id = ?")
    .pluck();
  const insert = database.prepare<[Buffer, string, number]>(
    "INSERT OR REPLACE INTO groups (id, name, last_seq) VALUES (?, ?, ?)",
  );
  const rename = database.prepare<[string, Buffer]>(
    "UPDATE groups SET name = ? WHERE id = ?",
  );
  const remove = database.prepare<[Buffer]>("DELETE FROM groups WHERE id = ?");
  return {
    list: (): LocalGroup[] => list.all(),
    has: (groupId): boolean => find.get(Buffer.from(groupId)) !== undefined,
    add: (group, seq): void => {
      insert.run(Buffer.from(group.groupId), group.name, seq);
    },
    rename: (groupId, name): void => {
      rename.run(name, Buffer.from(groupId));
    },
    remove: (groupId): void => {
      remove.run(Buffer.from(groupId));
    },
  };
}

function progressQueries(
  database: Database.Database,
): Pick<LocalGroups, "lastSeq" | "markProcessed"> {
  const select = database
    .prepare<[Buffer], number>("SELECT last_seq FROM groups WHERE id = ?")
    .pluck();
  const update = database.prepare<[number, Buffer, number]>(
    "UPDATE groups SET last_seq = ? WHERE id = ? AND last_seq < ?",
  );
  return {
    lastSeq: (groupId): number | undefined => select.get(Buffer.from(groupId)),
    markProcessed: (groupId, seq): void => {
      update.run(seq, Buffer.from(groupId), seq);
    },
  };
}

function invitationQueries(
  database: Database.Database,
): Pick<LocalGroups, "invitations" | "putInvitation" | "removeInvitation"> {
  const list = database.prepare<[], LocalInvitation>(
    `SELECT id AS invitationId, group_id AS groupId, group_name AS groupName, from_user AS "from"
       FROM invitations ORDER BY rowid`,
  );
  const upsert = database.prepare<[string, Buffer, string, string]>(
    "INSERT OR REPLACE INTO invitations (id, group_id, group_name, from_user) VALUES (?, ?, ?, ?)",
  );
  const remove = database.prepare<[string]>(
    "DELETE FROM invitations WHERE id = ?",
  );
  return {
    invitations: (): LocalInvitation[] => list.all(),
    putInvitation: (invitation): void => {
      upsert.run(
        invitation.invitationId,
        Buffer.from(invitation.groupId),
        invitation.groupName,
        invitation.from,
      );
    },
    removeInvitation: (invitationId): void => {
      remove.run(invitationId);
    },
  };
}
