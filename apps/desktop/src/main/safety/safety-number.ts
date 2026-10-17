import { createHash } from "node:crypto";

/** The SHA-512 rounds of each half, as Signal's numbers use (11-m4-build step 9). */
export const SAFETY_NUMBER_ROUNDS = 5200;

/** A person as their Safety number sees them: their username and every Device's identity key. */
export interface PersonKeys {
  readonly username: string;
  readonly deviceKeys: readonly Uint8Array[];
}

/**
 * One person's 30 digits: their username and sorted Device keys, hashed 5,200 times (D45).
 * @example safetyNumberHalf({ username: "alice", deviceKeys: [key] }) // "123450987612345…"
 */
export function safetyNumberHalf(person: PersonKeys): string {
  const keys = Buffer.concat(
    person.deviceKeys
      .map((key) => Buffer.from(key))
      .sort((first, second) => Buffer.compare(first, second)),
  );
  let hash = Buffer.concat([Buffer.from(person.username), keys]);
  for (let round = 0; round < SAFETY_NUMBER_ROUNDS; round++) {
    hash = createHash("sha512").update(hash).update(keys).digest();
  }
  let digits = "";
  for (let chunk = 0; chunk < 6; chunk++) {
    digits += (hash.readUIntBE(chunk * 5, 5) % 100000)
      .toString()
      .padStart(5, "0");
  }
  return digits;
}

/**
 * The 60 digits two people share: both halves in a fixed order, so each side sees the same number.
 * @example safetyNumberOf(halfOfAlice, halfOfBruno) === safetyNumberOf(halfOfBruno, halfOfAlice)
 */
export function safetyNumberOf(ownHalf: string, theirHalf: string): string {
  return [ownHalf, theirHalf].sort().join("");
}
