import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGroupStore,
  type GroupStore,
} from "../src/groups/group-store.js";
import {
  GROUP_TEST_ACCOUNTS as accounts,
  insertGroup,
  newGroupId,
  openGroupTestDatabase,
} from "./support/group-test-database.js";

let database: Database.Database;
let groups: GroupStore;

beforeEach(() => {
  database = openGroupTestDatabase();
  groups = createGroupStore(database);
});

afterEach(() => {
  database.close();
});

function groupRow(groupId: Buffer): unknown {
  return database
    .prepare("SELECT name, epoch, last_seq FROM groups WHERE id = ?")
    .get(groupId);
}

function markLeaving(groupId: Buffer, deviceId: string): void {
  database
    .prepare(
      "UPDATE group_members SET leaving = 1 WHERE group_id = ? AND device_id = ?",
    )
    .run(groupId, deviceId);
}

describe("create", () => {
  it("stores the Group at epoch 0 with the creator's Device as its only Member", () => {
    const groupId = newGroupId();

    expect(
      groups.create({
        groupId,
        name: "friends",
        creatorDeviceId: "alice-phone",
        createdAt: 5,
      }),
    ).toBe(true);
    expect(groupRow(groupId)).toEqual({
      name: "friends",
      epoch: 0,
      last_seq: 0,
    });
    expect(groups.activeMemberDeviceIds(groupId)).toEqual(["alice-phone"]);
  });

  it("refuses a taken ID and leaves the first Group as it was", () => {
    const groupId = insertGroup(database, ["bruno-phone"], "first");

    expect(
      groups.create({
        groupId,
        name: "second",
        creatorDeviceId: "alice-phone",
        createdAt: 5,
      }),
    ).toBe(false);
    expect(groupRow(groupId)).toMatchObject({ name: "first" });
    expect(groups.activeMemberDeviceIds(groupId)).toEqual(["bruno-phone"]);
  });
});

describe("membership", () => {
  it("counts only Devices that have not asked to leave", () => {
    const groupId = insertGroup(database, ["alice-phone", "bruno-phone"]);
    markLeaving(groupId, "bruno-phone");

    expect(groups.isActiveMember(groupId, "alice-phone")).toBe(true);
    expect(groups.isActiveMember(groupId, "bruno-phone")).toBe(false);
    expect(groups.isActiveMember(groupId, "carla-phone")).toBe(false);
    expect(groups.activeMemberDeviceIds(groupId)).toEqual(["alice-phone"]);
  });

  it("finds no Member in a Group that does not exist", () => {
    expect(groups.isActiveMember(newGroupId(), "alice-phone")).toBe(false);
  });
});

describe("isAccountActiveMember and nameOf", () => {
  it("find an Account through any of its active Devices", () => {
    const groupId = insertGroup(database, ["alice-laptop"], "friends");

    expect(groups.isAccountActiveMember(groupId, accounts.alice.userId)).toBe(
      true,
    );
    expect(groups.isAccountActiveMember(groupId, accounts.bruno.userId)).toBe(
      false,
    );
    expect(groups.nameOf(groupId)).toBe("friends");
    expect(groups.nameOf(newGroupId())).toBeUndefined();
  });

  it("does not count an Account whose Devices asked to leave", () => {
    const groupId = insertGroup(database, ["alice-laptop", "bruno-phone"]);
    markLeaving(groupId, "alice-laptop");

    expect(groups.isAccountActiveMember(groupId, accounts.alice.userId)).toBe(
      false,
    );
  });
});

describe("rename", () => {
  it("changes the name only", () => {
    const groupId = insertGroup(database, ["alice-phone"], "friends");

    groups.rename(groupId, "family");

    expect(groupRow(groupId)).toEqual({
      name: "family",
      epoch: 0,
      last_seq: 0,
    });
  });
});

describe("coMemberUserIdsOf", () => {
  it("lists every other Account sharing a Group, once", () => {
    insertGroup(database, ["alice-phone", "bruno-phone"]);
    insertGroup(database, ["alice-laptop", "bruno-phone", "carla-phone"]);
    insertGroup(database, ["dora-phone"]);

    expect(groups.coMemberUserIdsOf(accounts.alice.userId)).toEqual([
      accounts.bruno.userId,
      accounts.carla.userId,
    ]);
    expect(groups.coMemberUserIdsOf(accounts.dora.userId)).toEqual([]);
  });

  it("leaves out Groups either side asked to leave", () => {
    const groupId = insertGroup(database, ["alice-phone", "bruno-phone"]);
    markLeaving(groupId, "bruno-phone");

    expect(groups.coMemberUserIdsOf(accounts.alice.userId)).toEqual([]);
    expect(groups.coMemberUserIdsOf(accounts.bruno.userId)).toEqual([]);
  });
});
