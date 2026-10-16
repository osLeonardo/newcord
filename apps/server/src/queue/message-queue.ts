import type Database from "better-sqlite3";

export type MessageKind = "commit" | "welcome" | "message" | "proposal";

/** A commit's declared epoch, additions and removals (D41), kept so every recipient sees them. */
export interface DeclaredChange {
  epoch: number;
  added: string[];
  removed: string[];
}

export interface NewQueuedMessage {
  groupId: Buffer;
  kind: MessageKind;
  senderDeviceId: string;
  payload: Buffer;
  declared?: DeclaredChange;
  recipients: readonly string[];
  createdAt: number;
}

/** A queued message as its recipients get it. */
export interface QueuedMessage {
  groupId: Buffer;
  seq: number;
  kind: MessageKind;
  payload: Buffer;
  declared: DeclaredChange | undefined;
  sender: { username: string; deviceId: string };
  groupName: string;
}

/** The queue: each message stored once, with a delivery row per recipient Device, deleted on ack (D9). */
export interface MessageQueue {
  /** Gives the message the Group's next sequence number and a delivery row per recipient; returns the number. */
  enqueue(message: NewQueuedMessage): number;
  /** Deletes the Device's copy, and the message once no copies remain. */
  acknowledge(groupId: Buffer, seq: number, deviceId: string): void;
  /** Deletes every copy of the Group's messages waiting for these Devices, and messages left with none. */
  dropDeliveriesTo(groupId: Buffer, deviceIds: readonly string[]): void;
  /** Everything waiting for the Device, in sequence order per Group. */
  pendingFor(deviceId: string): QueuedMessage[];
  queued(groupId: Buffer, seq: number): QueuedMessage | undefined;
}

interface QueuedMessageRow {
  groupId: Buffer;
  seq: number;
  kind: MessageKind;
  payload: Buffer;
  declared: string | null;
  senderDeviceId: string;
  senderUsername: string;
  groupName: string;
}

const SELECT_QUEUED = `
SELECT messages.group_id AS groupId, messages.seq, messages.kind, messages.payload,
       messages.declared, messages.sender AS senderDeviceId,
       users.username AS senderUsername, groups.name AS groupName
  FROM messages
  JOIN devices ON devices.id = messages.sender
  JOIN users ON users.id = devices.user_id
  JOIN groups ON groups.id = messages.group_id`;

/**
 * Creates the message queue on an open database.
 * Example: `const seq = createMessageQueue(database).enqueue({ groupId, kind: "message", senderDeviceId, payload, recipients, createdAt });`
 */
export function createMessageQueue(database: Database.Database): MessageQueue {
  return {
    enqueue: createEnqueue(database),
    acknowledge: createAcknowledge(database),
    dropDeliveriesTo: createDeliveryDrop(database),
    pendingFor: createPendingList(database),
    queued: createQueuedLookup(database),
  };
}

function createEnqueue(database: Database.Database): MessageQueue["enqueue"] {
  const nextSeq = database
    .prepare<[Buffer], number>(
      "UPDATE groups SET last_seq = last_seq + 1 WHERE id = ? RETURNING last_seq",
    )
    .pluck();
  const insertMessage = database.prepare<
    [Buffer, number, string, string, Buffer, string | null, number]
  >(
    "INSERT INTO messages (group_id, seq, sender, kind, payload, declared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertDelivery = database.prepare<[Buffer, number, string]>(
    "INSERT INTO deliveries (group_id, seq, device_id) VALUES (?, ?, ?)",
  );
  return database.transaction((message: NewQueuedMessage): number => {
    const seq = nextSeq.get(message.groupId);
    if (seq === undefined) {
      throw new Error(
        `Cannot queue a ${message.kind} for Group ${message.groupId.toString("base64url")}: no such Group`,
      );
    }
    insertMessage.run(
      message.groupId,
      seq,
      message.senderDeviceId,
      message.kind,
      message.payload,
      message.declared === undefined ? null : JSON.stringify(message.declared),
      message.createdAt,
    );
    for (const deviceId of new Set(message.recipients)) {
      insertDelivery.run(message.groupId, seq, deviceId);
    }
    return seq;
  });
}

function createAcknowledge(
  database: Database.Database,
): MessageQueue["acknowledge"] {
  const deleteDelivery = database.prepare<[Buffer, number, string]>(
    "DELETE FROM deliveries WHERE group_id = ? AND seq = ? AND device_id = ?",
  );
  const deleteUndeliveredMessage = database.prepare<
    [Buffer, number, Buffer, number]
  >(
    "DELETE FROM messages WHERE group_id = ? AND seq = ? AND NOT EXISTS (SELECT 1 FROM deliveries WHERE group_id = ? AND seq = ?)",
  );
  return database.transaction(
    (groupId: Buffer, seq: number, deviceId: string): void => {
      deleteDelivery.run(groupId, seq, deviceId);
      deleteUndeliveredMessage.run(groupId, seq, groupId, seq);
    },
  );
}

function createDeliveryDrop(
  database: Database.Database,
): MessageQueue["dropDeliveriesTo"] {
  const deleteDeliveries = database.prepare<[Buffer, string]>(
    "DELETE FROM deliveries WHERE group_id = ? AND device_id = ?",
  );
  const deleteUndelivered = database.prepare<[Buffer]>(
    `DELETE FROM messages WHERE group_id = ?
       AND NOT EXISTS (SELECT 1 FROM deliveries WHERE deliveries.group_id = messages.group_id AND deliveries.seq = messages.seq)`,
  );
  return database.transaction(
    (groupId: Buffer, deviceIds: readonly string[]): void => {
      for (const deviceId of deviceIds) deleteDeliveries.run(groupId, deviceId);
      deleteUndelivered.run(groupId);
    },
  );
}

function createPendingList(
  database: Database.Database,
): MessageQueue["pendingFor"] {
  const list = database.prepare<[string], QueuedMessageRow>(
    `${SELECT_QUEUED}
      JOIN deliveries ON deliveries.group_id = messages.group_id AND deliveries.seq = messages.seq
     WHERE deliveries.device_id = ?
     ORDER BY messages.group_id, messages.seq`,
  );
  return (deviceId): QueuedMessage[] => list.all(deviceId).map(queuedMessage);
}

function createQueuedLookup(
  database: Database.Database,
): MessageQueue["queued"] {
  const find = database.prepare<[Buffer, number], QueuedMessageRow>(
    `${SELECT_QUEUED} WHERE messages.group_id = ? AND messages.seq = ?`,
  );
  return (groupId, seq): QueuedMessage | undefined => {
    const row = find.get(groupId, seq);
    return row && queuedMessage(row);
  };
}

function queuedMessage(row: QueuedMessageRow): QueuedMessage {
  return {
    groupId: row.groupId,
    seq: row.seq,
    kind: row.kind,
    payload: row.payload,
    declared:
      row.declared === null
        ? undefined
        : (JSON.parse(row.declared) as DeclaredChange),
    sender: { username: row.senderUsername, deviceId: row.senderDeviceId },
    groupName: row.groupName,
  };
}
