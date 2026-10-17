import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  QUEUE_RETENTION_MS,
  createQueueCleanup,
} from "../src/queue/queue-cleanup.js";
import {
  createMessageQueue,
  type MessageKind,
  type MessageQueue,
} from "../src/queue/message-queue.js";
import {
  GROUP_TEST_ACCOUNTS as accounts,
  insertGroup,
  openGroupTestDatabase,
} from "./support/group-test-database.js";

let database: Database.Database;
let queue: MessageQueue;
let groupId: Buffer;
let now: number;

beforeEach(() => {
  database = openGroupTestDatabase();
  queue = createMessageQueue(database);
  groupId = insertGroup(database, [
    "alice-phone",
    "bruno-phone",
    "carla-phone",
  ]);
  now = 100 * QUEUE_RETENTION_MS;
});

afterEach(() => {
  database.close();
});

function queueAt(
  createdAt: number,
  kind: MessageKind,
  recipients: string[],
): void {
  queue.enqueue({
    groupId,
    kind,
    senderDeviceId: "alice-phone",
    payload: Buffer.from([1]),
    recipients,
    createdAt,
    ...(kind === "commit"
      ? { declared: { epoch: 0, added: [], removed: [] } }
      : {}),
  });
}

function needingResync(): string[] {
  return database
    .prepare(
      "SELECT device_id FROM group_members WHERE needs_resync = 1 ORDER BY device_id",
    )
    .pluck()
    .all() as string[];
}

const cleanUp = (): ReturnType<ReturnType<typeof createQueueCleanup>> =>
  createQueueCleanup(database, () => now)();

describe("createQueueCleanup", () => {
  it("keeps copies up to 30 days old", () => {
    queueAt(now - QUEUE_RETENTION_MS, "commit", ["bruno-phone"]);

    expect(cleanUp()).toEqual({ resyncGroupIds: [] });
    expect(queue.pendingFor("bruno-phone")).toHaveLength(1);
  });

  it("marks a resync for a Device whose expired copy was a commit or a welcome, not a message", () => {
    const old = now - QUEUE_RETENTION_MS - 1;
    queueAt(old, "commit", ["bruno-phone"]);
    queueAt(old, "welcome", ["carla-phone"]);
    queueAt(old, "message", ["alice-phone"]);

    const { resyncGroupIds } = cleanUp();

    expect(resyncGroupIds).toEqual([groupId]);
    expect(needingResync()).toEqual(["bruno-phone", "carla-phone"]);
    expect(
      ["alice-phone", "bruno-phone", "carla-phone"].flatMap((deviceId) =>
        queue.pendingFor(deviceId),
      ),
    ).toEqual([]);
  });

  it("does not ask to resync a Device that is leaving", () => {
    database
      .prepare(
        "UPDATE group_members SET leaving = 1 WHERE device_id = 'bruno-phone'",
      )
      .run();
    queueAt(now - QUEUE_RETENTION_MS - 1, "commit", ["bruno-phone"]);

    expect(cleanUp()).toEqual({ resyncGroupIds: [] });
    expect(needingResync()).toEqual([]);
  });

  it("expires only pending Invitations older than 30 days", () => {
    const insert = database.prepare(
      "INSERT INTO invitations (id, group_id, from_user, to_user, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const old = now - QUEUE_RETENTION_MS - 1;
    insert.run(
      "old-pending",
      groupId,
      accounts.alice.userId,
      accounts.dora.userId,
      "pending",
      old,
    );
    insert.run(
      "old-accepted",
      groupId,
      accounts.alice.userId,
      accounts.dora.userId,
      "accepted",
      old,
    );
    insert.run(
      "new-pending",
      groupId,
      accounts.alice.userId,
      accounts.dora.userId,
      "pending",
      now,
    );

    cleanUp();

    expect(
      database.prepare("SELECT id, status FROM invitations ORDER BY id").all(),
    ).toEqual([
      { id: "new-pending", status: "pending" },
      { id: "old-accepted", status: "accepted" },
      { id: "old-pending", status: "expired" },
    ]);
  });
});
