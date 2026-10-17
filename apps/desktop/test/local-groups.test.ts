import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalGroups,
  type LocalGroups,
} from "../src/main/local-store/local-groups";
import { createSqliteLocalStore } from "../src/main/local-store/local-store";

const friends = new Uint8Array(16).fill(1);
const family = new Uint8Array(16).fill(2);

let database: Database.Database;
let groups: LocalGroups;

beforeEach(() => {
  database = new Database(":memory:");
  groups = createLocalGroups(database);
});

afterEach(() => {
  database.close();
});

describe("local Groups", () => {
  it("lists Groups by name, regardless of case", () => {
    groups.add({ groupId: friends, name: "friends" }, 0);
    groups.add({ groupId: family, name: "Family" }, 3);

    expect(groups.list().map((group) => group.name)).toEqual([
      "Family",
      "friends",
    ]);
    expect(groups.has(friends)).toBe(true);
    expect(groups.has(new Uint8Array(16))).toBe(false);
  });

  it("keeps how far the Device got in each Group's queue, never going back", () => {
    groups.add({ groupId: friends, name: "friends" }, 2);

    groups.markProcessed(friends, 5);
    groups.markProcessed(friends, 4);

    expect(groups.lastSeq(friends)).toBe(5);
    expect(groups.lastSeq(family)).toBeUndefined();
  });

  it("renames and removes", () => {
    groups.add({ groupId: friends, name: "friends" }, 0);

    groups.rename(friends, "old friends");
    expect(groups.list()).toEqual([
      { groupId: Buffer.from(friends), name: "old friends", unread: 0 },
    ]);
    expect(groups.nameOf(friends)).toBe("old friends");
    groups.remove(friends);

    expect(groups.list()).toEqual([]);
    expect(groups.nameOf(friends)).toBeUndefined();
  });

  it("counts unread messages until cleared, and forgets them with the Group (#10's spec)", () => {
    groups.add({ groupId: friends, name: "friends" }, 0);

    groups.addUnread(friends);
    groups.addUnread(friends);
    expect(groups.list()[0]?.unread).toBe(2);

    expect(groups.clearUnread(friends)).toBe(true);
    expect(groups.clearUnread(friends)).toBe(false);
    expect(groups.list()[0]?.unread).toBe(0);

    groups.addUnread(friends);
    groups.remove(friends);
    groups.add({ groupId: friends, name: "friends" }, 0);
    expect(groups.list()[0]?.unread).toBe(0);
  });

  it("is erased with the rest of the local data (D60)", () => {
    groups.add({ groupId: friends, name: "friends" }, 0);

    createSqliteLocalStore(database).eraseEverything();

    expect(groups.list()).toEqual([]);
  });
});

describe("local Invitations", () => {
  it("keeps pending Invitations in arrival order until removed", () => {
    const invitation = {
      invitationId: "mJMEbgts33NWbvGmNqkuEw",
      groupId: friends,
      groupName: "friends",
      from: "alice",
    };
    groups.putInvitation(invitation);
    groups.putInvitation({ ...invitation, invitationId: "x", from: "carla" });

    expect(groups.invitations().map((entry) => entry.from)).toEqual([
      "alice",
      "carla",
    ]);
    groups.removeInvitation("x");
    expect(groups.invitations()).toEqual([
      { ...invitation, groupId: Buffer.from(friends) },
    ]);
  });
});
