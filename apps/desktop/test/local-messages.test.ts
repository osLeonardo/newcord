import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteLocalStore } from "../src/main/local-store/local-store";
import {
  createLocalMessages,
  type LocalMessages,
  type StoredChatMessage,
} from "../src/main/local-store/local-messages";

const friends = new Uint8Array(16).fill(1);
const family = new Uint8Array(16).fill(2);

let database: Database.Database;
let messages: LocalMessages;

beforeEach(() => {
  database = new Database(":memory:");
  messages = createLocalMessages(database);
});

afterEach(() => {
  database.close();
});

function message(seq: number, groupId = friends): StoredChatMessage {
  return {
    groupId,
    seq,
    messageId: `message-${seq}`,
    senderUsername: "alice",
    senderDeviceId: "mJMEbgts33NWbvGmNqkuEw",
    text: `text ${seq}`,
    sentAt: 1_000 + seq,
  };
}

describe("the local Chat history", () => {
  it("lists a Group's messages in sequence order, whatever order they were stored in", () => {
    messages.add(message(3));
    messages.add(message(1));
    messages.add(message(2, family));

    expect(messages.listOf(friends).map((stored) => stored.seq)).toEqual([
      1, 3,
    ]);
  });

  it("keeps the first message stored under a sequence number", () => {
    messages.add(message(1));
    messages.add({ ...message(1), text: "again" });

    const texts = messages
      .listOf(friends)
      .flatMap((stored) => (stored.kind === "text" ? [stored.text] : []));
    expect(texts).toEqual(["text 1"]);
  });

  it("deletes one Group's history only", () => {
    messages.add(message(1));
    messages.add(message(1, family));

    messages.removeGroup(friends);

    expect(messages.listOf(friends)).toEqual([]);
    expect(messages.listOf(family)).toHaveLength(1);
  });

  it("is erased with the rest of the local data (D60)", () => {
    messages.add(message(1));

    createSqliteLocalStore(database).eraseEverything();

    expect(messages.listOf(friends)).toEqual([]);
  });
});

describe("notices", () => {
  it("are listed with the messages, at the position of the commit that caused them", () => {
    messages.add(message(1));
    messages.addNotices(friends, 2, [
      { type: "new-device", username: "bruno" },
      { type: "group-over-limit", sender: "alice", people: 11 },
    ]);
    messages.add(message(3));

    expect(
      messages.listOf(friends).map((entry) => [entry.kind, entry.seq]),
    ).toEqual([
      ["text", 1],
      ["notice", 2],
      ["notice", 2],
      ["text", 3],
    ]);
  });

  it("are stored once and deleted with the Group's history", () => {
    const notice = { type: "new-device", username: "bruno" } as const;
    messages.addNotices(friends, 2, [notice]);
    messages.addNotices(friends, 2, [notice]);
    expect(messages.listOf(friends)).toHaveLength(1);

    messages.removeGroup(friends);

    expect(messages.listOf(friends)).toEqual([]);
  });
});
