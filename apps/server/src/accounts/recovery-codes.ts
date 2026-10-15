import { randomBytes as cryptoRandomBytes } from "node:crypto";
import {
  CROCKFORD_BASE32_ALPHABET,
  RECOVERY_CODE_LENGTH,
} from "@newcord/shared";
import type { RandomBytes } from "../random-bytes.js";

const SYMBOL_BITS_MASK = 0b11111;

/**
 * Creates a Recovery code: 24 Crockford Base32 symbols, one per random byte (D55).
 * Example: `const recoveryCode = generateRecoveryCode();`
 */
export function generateRecoveryCode(
  randomBytes: RandomBytes = cryptoRandomBytes,
): string {
  // 256 is a multiple of the alphabet's 32 symbols, so the low 5 bits pick a symbol without bias.
  return Array.from(randomBytes(RECOVERY_CODE_LENGTH), (byte) =>
    CROCKFORD_BASE32_ALPHABET.charAt(byte & SYMBOL_BITS_MASK),
  ).join("");
}
