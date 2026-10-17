import { CALL_PARTICIPANT_LIMIT } from "@newcord/shared";
import type { CallSummary } from "../../preload/call-api";
import { parseCredentialIdentity } from "../mls/credential-identity";

/** A Device heard in a Call. */
export interface CallParticipant {
  readonly username: string;
  readonly deviceId: string;
}

/**
 * Who is in each Group's Call as far as this Device heard, and which Call it is in itself. Kept in
 * memory only: the server never knows (D18), and stale Call messages are ignored anyway.
 */
export interface CallState {
  activeGroup(): string | undefined;
  setActiveGroup(groupId: string | undefined): void;
  /** The other Devices in the Group's Call, in the order they were heard joining. */
  othersIn(groupId: string): CallParticipant[];
  /** True when the Device was not listed yet. */
  joined(groupId: string, participant: CallParticipant): boolean;
  /** True when the Device was listed. */
  left(groupId: string, deviceId: string): boolean;
  /** Drops the Devices of Accounts that went offline; returns the Groups whose Call changed. */
  keepOnly(onlineUsernames: readonly string[]): string[];
  /** Forgets the Group's Call, this Device's place in it included. True when anything was known. */
  forgetGroup(groupId: string): boolean;
}

/**
 * Creates an empty Call state.
 * @example const calls = createCallState(); calls.joined(groupId, { username: "bruno", deviceId });
 */
export function createCallState(): CallState {
  const calls = new Map<string, CallParticipant[]>();
  let active: string | undefined;
  const othersIn = (groupId: string): CallParticipant[] => [
    ...(calls.get(groupId) ?? []),
  ];
  return {
    activeGroup: (): string | undefined => active,
    setActiveGroup: (groupId): void => {
      active = groupId;
    },
    othersIn,
    joined: (groupId, participant): boolean => {
      const others = othersIn(groupId);
      if (others.some((other) => other.deviceId === participant.deviceId)) {
        return false;
      }
      calls.set(groupId, [...others, participant]);
      return true;
    },
    left: (groupId, deviceId): boolean => {
      const others = othersIn(groupId);
      const remaining = others.filter((other) => other.deviceId !== deviceId);
      calls.set(groupId, remaining);
      return remaining.length !== others.length;
    },
    keepOnly: (onlineUsernames): string[] => {
      const online = new Set(onlineUsernames);
      const changed: string[] = [];
      for (const [groupId, others] of calls) {
        const remaining = others.filter((other) => online.has(other.username));
        if (remaining.length === others.length) continue;
        calls.set(groupId, remaining);
        changed.push(groupId);
      }
      return changed;
    },
    forgetGroup: (groupId): boolean => {
      const known = calls.has(groupId) || active === groupId;
      calls.delete(groupId);
      if (active === groupId) active = undefined;
      return known;
    },
  };
}

/**
 * The Group's Call as the window shows it.
 * @example callSummaryOf(calls, groupId, { username: "alice", deviceId })
 */
export function callSummaryOf(
  state: CallState,
  groupId: string,
  self: CallParticipant,
): CallSummary {
  const joined = state.activeGroup() === groupId;
  const others = state
    .othersIn(groupId)
    .map((other) => ({ ...other, self: false }));
  const participants = joined ? [{ ...self, self: true }, ...others] : others;
  return {
    groupId,
    ownDeviceId: self.deviceId,
    joined,
    participants,
    full: participants.length >= CALL_PARTICIPANT_LIMIT,
  };
}

/**
 * This Device as a Call Participant, from its credential identity (D70).
 * @example callSelfOf("alice:mJMEbgts33NWbvGmNqkuEw") // { username: "alice", deviceId: "mJME…" }
 */
export function callSelfOf(ownIdentity: string): CallParticipant {
  const own = parseCredentialIdentity(ownIdentity);
  if (own === undefined) {
    throw new Error(
      `This Device's credential identity "${ownIdentity}" is not <username>:<deviceId>`,
    );
  }
  return { username: own.username, deviceId: own.deviceId };
}
