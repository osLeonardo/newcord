import type Database from "better-sqlite3";

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

/** The Device's Chat history, kept until it leaves the Group (#6's spec). */
export interface LocalMessages {
  /** Stores a message once; a second message with the same sequence number is ignored. */
  add(message: StoredChatMessage): void;
  /** The Group's messages in sequence order. */
  listOf(groupId: Uint8Array): StoredChatMessage[];
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
    listOf: (groupId): StoredChatMessage[] => list.all(Buffer.from(groupId)),
    removeGroup: (groupId): void => {
      remove.run(Buffer.from(groupId));
    },
  };
}
