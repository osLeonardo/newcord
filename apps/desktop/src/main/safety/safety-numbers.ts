import type {
  GroupActionResult,
  SafetyNumberResult,
} from "../../preload/group-api";
import { groupIdFromText, type GroupContext } from "../groups/group-context";
import { parseCredentialIdentity } from "../mls/credential-identity";
import {
  safetyNumberHalf,
  safetyNumberOf,
  type PersonKeys,
} from "./safety-number";

/** Halves already computed; each costs 5,200 SHA-512 rounds. */
const HALF_CACHE_SIZE = 256;

/** Remembers each person's half for the set of keys it was computed from. */
export interface SafetyHalves {
  halfOf(person: PersonKeys): string;
}

/**
 * Creates an empty cache of halves.
 * @example const halves = createSafetyHalves(); halves.halfOf({ username, deviceKeys });
 */
export function createSafetyHalves(): SafetyHalves {
  const halves = new Map<string, string>();
  return {
    halfOf: (person): string => {
      const key = [
        person.username,
        ...person.deviceKeys
          .map((deviceKey) => Buffer.from(deviceKey).toString("hex"))
          .sort(),
      ].join(" ");
      const known = halves.get(key);
      if (known !== undefined) return known;
      if (halves.size >= HALF_CACHE_SIZE) halves.clear();
      const half = safetyNumberHalf(person);
      halves.set(key, half);
      return half;
    },
  };
}

/**
 * The Safety number between this Account and a Member, read from the shared Group's MLS
 * credentials (D70), never from the server's Key directory, and whether it is the verified one.
 * @example readSafetyNumber(context, groupId, "bruno") // { outcome: "found", safetyNumber, verified: false }
 */
export function readSafetyNumber(
  context: GroupContext,
  groupId: string,
  username: string,
): SafetyNumberResult {
  const current = currentSafetyNumber(context, groupId, username);
  if (current.outcome === "refused") return current;
  return {
    outcome: "found",
    safetyNumber: current.safetyNumber,
    verified: context.verifiedMarks.numberOf(username) === current.safetyNumber,
  };
}

/**
 * Marks a person verified for the number the screen showed; refuses if it changed meanwhile.
 * @example markVerified(context, groupId, "bruno", shownNumber) // { outcome: "done" }
 */
export function markVerified(
  context: GroupContext,
  groupId: string,
  username: string,
  shownNumber: string,
): GroupActionResult {
  const current = currentSafetyNumber(context, groupId, username);
  if (current.outcome === "refused") return current;
  if (current.safetyNumber !== shownNumber) {
    return { outcome: "refused", refusal: "SAFETY_NUMBER_CHANGED" };
  }
  context.verifiedMarks.mark(username, shownNumber);
  return { outcome: "done" };
}

/**
 * Whether the person's current number in the Group is the one they were verified for. Computes
 * only for people who have a mark.
 * @example isVerified(context, groupId, "bruno") // false
 */
export function isVerified(
  context: GroupContext,
  groupId: string,
  username: string,
): boolean {
  const marked = context.verifiedMarks.numberOf(username);
  if (marked === undefined) return false;
  const current = currentSafetyNumber(context, groupId, username);
  return current.outcome === "found" && current.safetyNumber === marked;
}

type CurrentNumber =
  | { readonly outcome: "found"; readonly safetyNumber: string }
  | Extract<SafetyNumberResult, { outcome: "refused" }>;

function currentSafetyNumber(
  context: GroupContext,
  groupId: string,
  username: string,
): CurrentNumber {
  const id = groupIdFromText(groupId);
  if (!context.localGroups.has(id)) {
    return { outcome: "refused", refusal: "NOT_IN_GROUP" };
  }
  const own = parseCredentialIdentity(context.ownIdentity)?.username;
  if (own === undefined || own === username) {
    return { outcome: "refused", refusal: "CANNOT_VERIFY_SELF" };
  }
  const keys = personKeysOf(context, id);
  const ownKeys = keys.get(own);
  const theirKeys = keys.get(username);
  if (ownKeys === undefined || theirKeys === undefined) {
    return { outcome: "refused", refusal: "PERSON_NOT_IN_GROUP" };
  }
  return {
    outcome: "found",
    safetyNumber: safetyNumberOf(
      context.safetyHalves.halfOf({ username: own, deviceKeys: ownKeys }),
      context.safetyHalves.halfOf({ username, deviceKeys: theirKeys }),
    ),
  };
}

/** Each Member's Device keys by username; malformed identities are left out. */
function personKeysOf(
  context: GroupContext,
  groupId: Uint8Array,
): Map<string, Uint8Array[]> {
  const keys = new Map<string, Uint8Array[]>();
  const members = context.mls.read((engine) => engine.groupMemberKeys(groupId));
  for (const member of members) {
    const username = parseCredentialIdentity(member.identity)?.username;
    if (username === undefined) continue;
    keys.set(username, [...(keys.get(username) ?? []), member.signatureKey]);
  }
  return keys;
}
