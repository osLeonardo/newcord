import { GROUP_PEOPLE_LIMIT, HubErrorCode } from "@newcord/shared";
import type { GroupMember } from "../groups/group-store.js";

/** A commit's declared change, as the sender sent it (D41). */
export interface DeclaredCommit {
  epoch: number;
  added: readonly string[];
  removed: readonly string[];
  hasWelcome: boolean;
}

/** What the check needs to know about the Group and the Devices a commit adds. */
export interface CommitCheckFacts {
  epoch: number;
  members: readonly GroupMember[];
  /** The Account of each Device, or undefined for a Device that does not exist. */
  ownerOf(deviceId: string): number | undefined;
  hasAcceptedInvitation(userId: number): boolean;
}

/**
 * Why the server must refuse a commit, or undefined to accept it: a wrong epoch, a declared change
 * that breaks the rules, or more than 10 people afterwards (09-m2-build step 7, D17).
 * Example: `const refusal = commitRefusal(declared, { epoch, members, ownerOf, hasAcceptedInvitation });`
 */
export function commitRefusal(
  declared: DeclaredCommit,
  facts: CommitCheckFacts,
): HubErrorCode | undefined {
  if (declared.epoch !== facts.epoch) return HubErrorCode.WrongEpoch;
  if (!changeIsValid(declared, facts)) return HubErrorCode.InvalidChange;
  return peopleAfter(declared, facts) > GROUP_PEOPLE_LIMIT
    ? HubErrorCode.GroupFull
    : undefined;
}

function changeIsValid(
  declared: DeclaredCommit,
  facts: CommitCheckFacts,
): boolean {
  const memberIds = new Set(facts.members.map((member) => member.deviceId));
  if (!declared.removed.every((deviceId) => memberIds.has(deviceId))) {
    return false;
  }
  if (declared.hasWelcome !== declared.added.length > 0) return false;
  return declared.added.every((deviceId) =>
    mayBeAdded(deviceId, declared, facts, memberIds),
  );
}

/**
 * A Device may join if it is outside the Group after the removals, and its Account accepted an
 * Invitation (D13), already has an active Device in the Group (D56), or it is being re-added (D24).
 */
function mayBeAdded(
  deviceId: string,
  declared: DeclaredCommit,
  facts: CommitCheckFacts,
  memberIds: ReadonlySet<string>,
): boolean {
  const reAdded = declared.removed.includes(deviceId);
  if (memberIds.has(deviceId) && !reAdded) return false;
  const owner = facts.ownerOf(deviceId);
  if (owner === undefined) return false;
  return (
    reAdded ||
    facts.hasAcceptedInvitation(owner) ||
    activeAccountsAfterRemovals(declared, facts).has(owner)
  );
}

function activeAccountsAfterRemovals(
  declared: DeclaredCommit,
  facts: CommitCheckFacts,
): Set<number> {
  return new Set(
    facts.members
      .filter(
        (member) =>
          !member.leaving && !declared.removed.includes(member.deviceId),
      )
      .map((member) => member.userId),
  );
}

/** Leaving Members are already gone for the count (D57). */
function peopleAfter(
  declared: DeclaredCommit,
  facts: CommitCheckFacts,
): number {
  const people = activeAccountsAfterRemovals(declared, facts);
  for (const deviceId of declared.added) {
    const owner = facts.ownerOf(deviceId);
    if (owner !== undefined) people.add(owner);
  }
  return people.size;
}
