import { HubErrorCode } from "@newcord/shared";
import { describe, expect, it } from "vitest";
import type { GroupRefusal } from "../src/preload/group-api";
import {
  groupLeftMessage,
  groupNameProblem,
  groupRefusalMessage,
  inviteUsernameProblem,
  memberDevicesLabel,
  noticeText,
} from "../src/renderer/src/groups/group-text";

const everyRefusal: GroupRefusal[] = [
  ...Object.values(HubErrorCode),
  "NOT_CONNECTED",
  "CONNECTION_LOST",
  "TIMED_OUT",
  "INVALID_NAME",
  "INVALID_USERNAME",
  "INVALID_TEXT",
  "PERSON_NOT_IN_GROUP",
  "CANNOT_REMOVE_SELF",
  "NOT_IN_GROUP",
  "UNAVAILABLE",
];

describe("groupRefusalMessage", () => {
  it("has its own sentence for every refusal", () => {
    const messages = everyRefusal.map(groupRefusalMessage);

    for (const message of messages) expect(message).toMatch(/^[A-Z].*\.$/);
    expect(new Set(messages).size).toBe(everyRefusal.length);
  });
});

describe("groupNameProblem", () => {
  it.each(["a", "Friends & family", "n".repeat(64)])("accepts %j", (name) => {
    expect(groupNameProblem(name)).toBeUndefined();
  });

  it.each(["", "n".repeat(65)])("explains why %j is refused", (name) => {
    expect(groupNameProblem(name)).toBe("Group names have 1 to 64 characters.");
  });
});

describe("inviteUsernameProblem", () => {
  it("accepts a valid username and explains an invalid one", () => {
    expect(inviteUsernameProblem("bruno_2")).toBeUndefined();
    expect(inviteUsernameProblem("Bruno")).toMatch(/^Usernames have 3 to 32/);
  });
});

describe("groupLeftMessage", () => {
  const groupId = "MgZoqEdt4EEfhsMd_7xNqw";

  it("says whether the person left or was removed", () => {
    expect(
      groupLeftMessage({ groupId, name: "friends", reason: "removed" }),
    ).toBe("You were removed from friends.");
    expect(groupLeftMessage({ groupId, name: "friends", reason: "left" })).toBe(
      "You left friends.",
    );
  });

  it("copes with a Group whose name was never known here", () => {
    expect(groupLeftMessage({ groupId, name: "", reason: "removed" })).toBe(
      "You were removed from a Group.",
    );
  });
});

describe("memberDevicesLabel", () => {
  it("counts Devices in words", () => {
    expect(
      memberDevicesLabel({
        username: "a",
        deviceCount: 1,
        self: false,
        verified: false,
      }),
    ).toBe("1 Device");
    expect(
      memberDevicesLabel({
        username: "a",
        deviceCount: 3,
        self: false,
        verified: false,
      }),
    ).toBe("3 Devices");
  });
});

describe("noticeText", () => {
  const device = "mJMEbgts33NWbvGmNqkuEw";

  it.each([
    [
      { type: "new-device", username: "bruno" } as const,
      "bruno has a new Device in this Group.",
    ],
    [
      { type: "safety-number-changed", username: "bruno" } as const,
      "bruno's safety number changed.",
    ],
    [
      { type: "group-over-limit", sender: "alice", people: 11 } as const,
      "alice's change brought this Group to 11 people, over the limit of 10.",
    ],
    [
      {
        type: "commit-mismatch",
        sender: "alice",
        added: [`eve:${device}`],
        removed: [],
      } as const,
      "alice's change did not match what it declared. It really added a Device of eve and removed no Device.",
    ],
    [
      {
        type: "commit-mismatch",
        sender: "alice",
        added: ["not an identity"],
        removed: [`carla:${device}`],
      } as const,
      "alice's change did not match what it declared. It really added not an identity and removed a Device of carla.",
    ],
  ])("words %j", (notice, text) => {
    expect(noticeText(notice)).toBe(text);
  });
});
