import { beforeEach, describe, expect, it } from "vitest";
import {
  callSummaryOf,
  createCallState,
  type CallParticipant,
  type CallState,
} from "../src/main/calls/call-state";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";
const otherGroup = "mJMEbgts33NWbvGmNqkuEw";
const self: CallParticipant = { username: "alice", deviceId: "a".repeat(22) };

function participant(
  index: number,
  username = `person${index}`,
): CallParticipant {
  return { username, deviceId: String(index).padStart(22, "0") };
}

let calls: CallState;

beforeEach(() => {
  calls = createCallState();
});

describe("the Call state", () => {
  it("lists each Device once, in the order it joined", () => {
    expect(calls.joined(groupId, participant(2))).toBe(true);
    expect(calls.joined(groupId, participant(1))).toBe(true);
    expect(calls.joined(groupId, participant(2))).toBe(false);

    expect(calls.othersIn(groupId)).toEqual([participant(2), participant(1)]);
    expect(calls.othersIn(otherGroup)).toEqual([]);
  });

  it("drops a Device that left", () => {
    calls.joined(groupId, participant(1));

    expect(calls.left(groupId, participant(1).deviceId)).toBe(true);
    expect(calls.left(groupId, participant(1).deviceId)).toBe(false);
    expect(calls.othersIn(groupId)).toEqual([]);
  });

  it("drops the Devices of Accounts that went offline", () => {
    calls.joined(groupId, participant(1, "bruno"));
    calls.joined(groupId, participant(2, "carla"));
    calls.joined(otherGroup, participant(3, "carla"));

    expect(calls.keepOnly(["bruno"]).toSorted()).toEqual(
      [groupId, otherGroup].toSorted(),
    );
    expect(calls.othersIn(groupId)).toEqual([participant(1, "bruno")]);
    expect(calls.keepOnly(["bruno"])).toEqual([]);
  });

  it("forgets a Group's Call, this Device's place in it included", () => {
    calls.joined(groupId, participant(1));
    calls.setActiveGroup(groupId);

    expect(calls.forgetGroup(groupId)).toBe(true);
    expect(calls.activeGroup()).toBeUndefined();
    expect(calls.othersIn(groupId)).toEqual([]);
    expect(calls.forgetGroup(groupId)).toBe(false);
  });
});

describe("callSummaryOf", () => {
  it("lists this Device first once it joined", () => {
    calls.joined(groupId, participant(1));
    expect(callSummaryOf(calls, groupId, self).participants).toEqual([
      { ...participant(1), self: false },
    ]);

    calls.setActiveGroup(groupId);

    expect(callSummaryOf(calls, groupId, self)).toEqual({
      groupId,
      ownDeviceId: self.deviceId,
      joined: true,
      participants: [
        { ...self, self: true },
        { ...participant(1), self: false },
      ],
      full: false,
    });
  });

  it("is full with six Participants (D2)", () => {
    for (let index = 1; index <= 5; index++) {
      calls.joined(groupId, participant(index));
    }
    expect(callSummaryOf(calls, groupId, self).full).toBe(false);

    calls.joined(groupId, participant(6));
    expect(callSummaryOf(calls, groupId, self).full).toBe(true);
  });
});
