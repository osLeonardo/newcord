import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMessageQueue,
  type MessageQueue,
  type NewQueuedMessage,
} from "../src/queue/message-queue.js";
import {
  insertGroup,
  newGroupId,
  openGroupTestDatabase,
} from "./support/group-test-database.js";

let database: Database.Database;
let queue: MessageQueue;
let groupId: Buffer;

beforeEach(() => {
  database = openGroupTestDatabase();
  queue = createMessageQueue(database);
  groupId = insertGroup(database, [
    "alice-phone",
    "bruno-phone",
    "carla-phone",
  ]);
});

afterEach(() => {
  database.close();
});

function message(overrides: Partial<NewQueuedMessage> = {}): NewQueuedMessage {
  return {
    groupId,
    kind: "message",
    senderDeviceId: "alice-phone",
    payload: Buffer.from([1, 2, 3]),
    recipients: ["bruno-phone", "carla-phone"],
    createdAt: 50,
    ...overrides,
  };
}

function rowCounts(): { messages: number; deliveries: number } {
  const count = (table: string): number =>
    database.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
  return { messages: count("messages"), deliveries: count("deliveries") };
}

describe("enqueue", () => {
  it("gives each message of a Group the next sequence number", () => {
    expect(queue.enqueue(message())).toBe(1);
    expect(queue.enqueue(message())).toBe(2);
    expect(queue.enqueue(message({ groupId: insertGroup(database, []) }))).toBe(
      1,
    );
  });

  it("stores the message once with a delivery row per recipient", () => {
    queue.enqueue(
      message({ recipients: ["bruno-phone", "carla-phone", "bruno-phone"] }),
    );

    expect(rowCounts()).toEqual({ messages: 1, deliveries: 2 });
  });

  it("keeps counting after delivered messages are deleted", () => {
    queue.enqueue(message({ recipients: ["bruno-phone"] }));
    queue.acknowledge(groupId, 1, "bruno-phone");

    expect(queue.enqueue(message())).toBe(2);
  });

  it("refuses a Group that does not exist, naming it", () => {
    const unknown = newGroupId();

    expect(() => queue.enqueue(message({ groupId: unknown }))).toThrow(
      unknown.toString("base64url"),
    );
  });
});

describe("acknowledge", () => {
  it("deletes only that Device's copy, then the message once no copies remain", () => {
    queue.enqueue(message());

    queue.acknowledge(groupId, 1, "bruno-phone");
    expect(rowCounts()).toEqual({ messages: 1, deliveries: 1 });
    queue.acknowledge(groupId, 1, "carla-phone");
    expect(rowCounts()).toEqual({ messages: 0, deliveries: 0 });
  });

  it("ignores a Device that had no copy", () => {
    queue.enqueue(message());

    queue.acknowledge(groupId, 1, "alice-phone");
    queue.acknowledge(groupId, 9, "bruno-phone");

    expect(rowCounts()).toEqual({ messages: 1, deliveries: 2 });
  });
});

describe("pendingFor and queued", () => {
  it("list what waits for a Device in sequence order per Group, with sender and Group name", () => {
    const other = insertGroup(
      database,
      ["alice-phone", "bruno-phone"],
      "family",
    );
    queue.enqueue(message());
    queue.enqueue(message({ groupId: other, recipients: ["bruno-phone"] }));
    queue.enqueue(
      message({
        kind: "commit",
        declared: { epoch: 0, added: [], removed: ["carla-phone"] },
      }),
    );

    const pending = queue.pendingFor("bruno-phone");

    expect(pending).toHaveLength(3);
    expect(
      pending
        .filter((entry) => entry.groupId.equals(groupId))
        .map((entry) => entry.seq),
    ).toEqual([1, 2]);
    expect(pending.find((entry) => entry.kind === "commit")).toMatchObject({
      sender: { username: "alice", deviceId: "alice-phone" },
      groupName: "friends",
      declared: { epoch: 0, added: [], removed: ["carla-phone"] },
      payload: Buffer.from([1, 2, 3]),
    });
    expect(queue.queued(groupId, 1)?.declared).toBeUndefined();
    expect(queue.queued(groupId, 7)).toBeUndefined();
  });
});
