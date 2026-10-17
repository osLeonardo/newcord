import type Database from "better-sqlite3";
import type { GroupNotice } from "../../preload/group-api";

/** A Chat message as this Device keeps it after the server deleted its copy (D9). */
export interface StoredChatMessage {
  readonly groupId: Uint8Array;
  /** The server's sequence number: every Device shows a Group's messages in this order. */
  readonly seq: number;
  readonly messageId: string;
  readonly senderUsername: string;
  readonly senderDeviceId: string;
  readonly text: string;
  /** The sender's clock when it was sent, in milliseconds. */
  readonly sentAt: number;
}

/** A notice kept at the position of the commit that caused it. */
export interface StoredNotice {
  readonly groupId: Uint8Array;
  readonly seq: number;
  readonly notice: GroupNotice;
}

/** A stored line of a Group's chat. */
export type StoredChatEntry =
  | ({ readonly kind: "text" } & StoredChatMessage)
  | ({ readonly kind: "notice" } & StoredNotice);

/** The Device's Chat history and notices, kept until it leaves the Group (#6's spec). */
export interface LocalMessages {
  /** Stores a message once; a second message with the same sequence number is ignored. */
  add(message: StoredChatMessage): void;
  /** Stores the notices a commit earned, once. */
  addNotices(
    groupId: Uint8Array,
    seq: number,
    notices: readonly GroupNotice[],
  ): void;
  /** The Group's messages and notices in sequence order. */
  listOf(groupId: Uint8Array): StoredChatEntry[];
  /** Deletes the Group's whole history, when the Device leaves it or is removed. */
  removeGroup(groupId: Uint8Array): void;
}

const CREATE_MESSAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chat_messages (
  group_id         BLOB NOT NULL,
  seq              INTEGER NOT NULL,
  message_id       TEXT NOT NULL,
  sender_username  TEXT NOT NULL,
  sender_device_id TEXT NOT NULL,
  text             TEXT NOT NULL,
  sent_at          INTEGER NOT NULL,
  PRIMARY KEY (group_id, seq)
);

CREATE TABLE IF NOT EXISTS chat_notices (
  group_id BLOB NOT NULL,
  seq      INTEGER NOT NULL,
  position INTEGER NOT NULL,
  notice   TEXT NOT NULL,
  PRIMARY KEY (group_id, seq, position)
);
`;

interface MessageRow {
  groupId: Buffer;
  seq: number;
  messageId: string;
  senderUsername: string;
  senderDeviceId: string;
  text: string;
  sentAt: number;
}

/**
 * Creates the Chat history store on the local database, creating its table if needed.
 * @example const messages = createLocalMessages(database);
 */
export function createLocalMessages(
  database: Database.Database,
): LocalMessages {
  database.exec(CREATE_MESSAGES_TABLE_SQL);
  const insert = database.prepare<
    [Buffer, number, string, string, string, string, number]
  >(
    `INSERT OR IGNORE INTO chat_messages
       (group_id, seq, message_id, sender_username, sender_device_id, text, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const list = database.prepare<[Buffer], MessageRow>(
    `SELECT group_id AS groupId, seq, message_id AS messageId, sender_username AS senderUsername,
            sender_device_id AS senderDeviceId, text, sent_at AS sentAt
       FROM chat_messages WHERE group_id = ? ORDER BY seq`,
  );
  const remove = database.prepare<[Buffer]>(
    "DELETE FROM chat_messages WHERE group_id = ?",
  );
  const notices = createNoticeQueries(database);
  return {
    add: (message): void => {
      insert.run(
        Buffer.from(message.groupId),
        message.seq,
        message.messageId,
        message.senderUsername,
        message.senderDeviceId,
        message.text,
        message.sentAt,
      );
    },
    addNotices: (groupId, seq, entries): void => {
      notices.add(groupId, seq, entries);
    },
    listOf: (groupId): StoredChatEntry[] =>
      mergeBySeq(
        list.all(Buffer.from(groupId)).map((row) => ({ kind: "text", ...row })),
        notices.listOf(groupId),
      ),
    removeGroup: (groupId): void => {
      remove.run(Buffer.from(groupId));
      notices.removeGroup(groupId);
    },
  };
}

interface NoticeQueries {
  add(groupId: Uint8Array, seq: number, notices: readonly GroupNotice[]): void;
  listOf(groupId: Uint8Array): StoredChatEntry[];
  removeGroup(groupId: Uint8Array): void;
}

function createNoticeQueries(database: Database.Database): NoticeQueries {
  const insert = database.prepare<[Buffer, number, number, string]>(
    "INSERT OR IGNORE INTO chat_notices (group_id, seq, position, notice) VALUES (?, ?, ?, ?)",
  );
  const list = database.prepare<[Buffer], { seq: number; notice: string }>(
    "SELECT seq, notice FROM chat_notices WHERE group_id = ? ORDER BY seq, position",
  );
  const remove = database.prepare<[Buffer]>(
    "DELETE FROM chat_notices WHERE group_id = ?",
  );
  return {
    add: (groupId, seq, notices): void => {
      notices.forEach((notice, position) => {
        insert.run(Buffer.from(groupId), seq, position, JSON.stringify(notice));
      });
    },
    listOf: (groupId): StoredChatEntry[] =>
      list.all(Buffer.from(groupId)).map((row) => ({
        kind: "notice",
        groupId,
        seq: row.seq,
        notice: JSON.parse(row.notice) as GroupNotice,
      })),
    removeGroup: (groupId): void => {
      remove.run(Buffer.from(groupId));
    },
  };
}

/** Both lists are in sequence order; a message and a notice never share a sequence number. */
function mergeBySeq(
  texts: StoredChatEntry[],
  notices: StoredChatEntry[],
): StoredChatEntry[] {
  return [...texts, ...notices].sort((first, second) => first.seq - second.seq);
}
