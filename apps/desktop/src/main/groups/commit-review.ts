import { GROUP_PEOPLE_LIMIT } from "@newcord/shared";
import type { GroupNotice } from "../../preload/group-api";
import { parseCredentialIdentity } from "../mls/credential-identity";

/** What a commit declared (Device IDs, D41) and what it really did (credential identities, D70). */
export interface CommitFacts {
  /** The sender's credential identity. */
  readonly sender: string;
  readonly declaredAdded: readonly string[];
  readonly declaredRemoved: readonly string[];
  readonly realAdded: readonly string[];
  readonly realRemoved: readonly string[];
  /** Every Member identity after the commit. */
  readonly membersAfter: readonly string[];
}

/**
 * The notices a commit earns in its Group: a change other than the declared one, more than 10
 * people afterwards (D71), and a Member's new Device (D56). The commit is applied either way.
 * @example noticesForCommit(facts) // [{ type: "new-device", username: "bruno" }]
 */
export function noticesForCommit(facts: CommitFacts): GroupNotice[] {
  const sender = usernameOf(facts.sender);
  return [
    ...mismatchNotices(facts, sender),
    ...overLimitNotices(facts, sender),
    ...newDeviceNotices(facts),
  ];
}

function mismatchNotices(facts: CommitFacts, sender: string): GroupNotice[] {
  const matches =
    sameDevices(facts.declaredAdded, facts.realAdded) &&
    sameDevices(facts.declaredRemoved, facts.realRemoved);
  if (matches) return [];
  return [
    {
      type: "commit-mismatch",
      sender,
      added: [...facts.realAdded],
      removed: [...facts.realRemoved],
    },
  ];
}

/** Device IDs must match exactly; an identity that is not `<username>:<deviceId>` never matches. */
function sameDevices(
  declared: readonly string[],
  identities: readonly string[],
): boolean {
  const real = identities.map(
    (identity) => parseCredentialIdentity(identity)?.deviceId,
  );
  if (real.some((deviceId) => deviceId === undefined)) return false;
  const declaredSet = new Set(declared);
  return (
    declaredSet.size === declared.length &&
    real.length === declaredSet.size &&
    real.every(
      (deviceId) => deviceId !== undefined && declaredSet.has(deviceId),
    )
  );
}

function overLimitNotices(facts: CommitFacts, sender: string): GroupNotice[] {
  const people = new Set(facts.membersAfter.map(usernameOf)).size;
  return people > GROUP_PEOPLE_LIMIT
    ? [{ type: "group-over-limit", sender, people }]
    : [];
}

/** A Device re-added in the same commit (a resync, D24) is not new. */
function newDeviceNotices(facts: CommitFacts): GroupNotice[] {
  const before = facts.membersAfter
    .filter((identity) => !facts.realAdded.includes(identity))
    .concat(facts.realRemoved);
  const peopleBefore = new Set(before.map(usernameOf));
  const usernames = facts.realAdded
    .filter((identity) => !facts.realRemoved.includes(identity))
    .map(usernameOf)
    .filter((username) => peopleBefore.has(username));
  return [...new Set(usernames)].map((username) => ({
    type: "new-device",
    username,
  }));
}

/** The Account part of an identity, or the whole identity when it is malformed. */
function usernameOf(identity: string): string {
  return parseCredentialIdentity(identity)?.username ?? identity;
}
