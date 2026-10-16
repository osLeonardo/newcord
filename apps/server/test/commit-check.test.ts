import { describe, expect, it } from "vitest";
import {
  commitRefusal,
  type CommitCheckFacts,
  type DeclaredCommit,
} from "../src/commits/commit-check.js";
import type { GroupMember } from "../src/groups/group-store.js";

/** Device "<user>-<n>" belongs to Account <user>. */
const ownerOf = (deviceId: string): number | undefined => {
  const owner = Number(deviceId.split("-")[0]);
  return Number.isInteger(owner) ? owner : undefined;
};

function member(deviceId: string, leaving = false): GroupMember {
  return { deviceId, userId: ownerOf(deviceId) ?? -1, leaving };
}

function facts(overrides: Partial<CommitCheckFacts> = {}): CommitCheckFacts {
  return {
    epoch: 4,
    members: [member("1-a"), member("2-a")],
    ownerOf,
    hasAcceptedInvitation: (userId) => userId === 3,
    ...overrides,
  };
}

function commit(overrides: Partial<DeclaredCommit> = {}): DeclaredCommit {
  return {
    epoch: 4,
    added: [],
    removed: [],
    hasWelcome: false,
    ...overrides,
  };
}

describe("commitRefusal", () => {
  it.each([
    ["a key update with no change", commit()],
    [
      "adding an invitee who accepted",
      commit({ added: ["3-a", "3-b"], hasWelcome: true }),
    ],
    [
      "adding a Member's new Device (D56)",
      commit({ added: ["2-b"], hasWelcome: true }),
    ],
    ["removing a Member", commit({ removed: ["2-a"] })],
    [
      "removing and re-adding a Device (D24)",
      commit({ removed: ["2-a"], added: ["2-a"], hasWelcome: true }),
    ],
  ])("accepts %s", (_case, declared) => {
    expect(commitRefusal(declared, facts())).toBeUndefined();
  });

  it.each([3, 5])(
    "refuses a commit made in epoch %i when the Group is at 4",
    (epoch) => {
      expect(commitRefusal(commit({ epoch }), facts())).toBe("WRONG_EPOCH");
    },
  );

  it.each([
    [
      "adding a Device with no reason to join",
      commit({ added: ["4-a"], hasWelcome: true }),
    ],
    [
      "adding a Device already in the Group",
      commit({ added: ["2-a"], hasWelcome: true }),
    ],
    [
      "adding a Device that does not exist",
      commit({ added: ["nobody"], hasWelcome: true }),
    ],
    ["removing a Device not in the Group", commit({ removed: ["3-a"] })],
    ["adding without a welcome", commit({ added: ["3-a"] })],
    ["a welcome without additions", commit({ hasWelcome: true })],
    [
      "adding a new Device of an Account the same commit removes",
      commit({ removed: ["2-a"], added: ["2-b"], hasWelcome: true }),
    ],
  ])("refuses %s as an invalid change", (_case, declared) => {
    expect(commitRefusal(declared, facts())).toBe("INVALID_CHANGE");
  });

  it("does not count a leaving Account's Devices as a reason to add more of them", () => {
    const leaving = facts({ members: [member("1-a"), member("2-a", true)] });

    expect(
      commitRefusal(commit({ added: ["2-b"], hasWelcome: true }), leaving),
    ).toBe("INVALID_CHANGE");
  });

  describe("the 10-person limit (D17)", () => {
    const tenPeople = Array.from({ length: 10 }, (_, index) =>
      member(`${index + 10}-a`),
    );
    const everyoneAccepted = (): boolean => true;

    it("accepts a tenth person and a tenth person's second Device", () => {
      const ninePeople = facts({
        members: tenPeople.slice(0, 9),
        hasAcceptedInvitation: everyoneAccepted,
      });
      const full = facts({ members: tenPeople });

      expect(
        commitRefusal(
          commit({ added: ["30-a"], hasWelcome: true }),
          ninePeople,
        ),
      ).toBeUndefined();
      expect(
        commitRefusal(commit({ added: ["10-b"], hasWelcome: true }), full),
      ).toBeUndefined();
    });

    it("refuses an eleventh person", () => {
      const full = facts({
        members: tenPeople,
        hasAcceptedInvitation: everyoneAccepted,
      });

      expect(
        commitRefusal(commit({ added: ["30-a"], hasWelcome: true }), full),
      ).toBe("GROUP_FULL");
    });

    it("lets a commit that removes one person add another", () => {
      const full = facts({
        members: tenPeople,
        hasAcceptedInvitation: everyoneAccepted,
      });

      expect(
        commitRefusal(
          commit({ removed: ["10-a"], added: ["30-a"], hasWelcome: true }),
          full,
        ),
      ).toBeUndefined();
    });
  });
});
