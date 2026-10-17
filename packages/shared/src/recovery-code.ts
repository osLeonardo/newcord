import { Type } from "typebox";

/** Crockford Base32: the digits and capital letters without I, L, O and U (08-m1-build Settings). */
export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A Recovery code has 24 symbols of 5 bits each: 120 bits of randomness (D55). */
export const RECOVERY_CODE_LENGTH = 24;

/** A Recovery code as the server issues it: 24 Crockford Base32 symbols, not grouped. */
export const RecoveryCode = Type.String({
  pattern: `^[${CROCKFORD_BASE32_ALPHABET}]{${RECOVERY_CODE_LENGTH}}$`,
});

const TYPED_RECOVERY_CODE_MAX_LENGTH = 64;

/**
 * A Recovery code as a person types it: the 24 symbols in any letter case, with dashes or
 * spaces anywhere, and O, I or L standing for 0, 1 and 1 (08-m1-build Settings). U is never
 * a symbol. `normalizeRecoveryCode` turns it into the form the server issued.
 */
export const TypedRecoveryCode = Type.String({
  maxLength: TYPED_RECOVERY_CODE_MAX_LENGTH,
  pattern: `^[ -]*(?:[0-9A-TV-Za-tv-z][ -]*){${RECOVERY_CODE_LENGTH}}$`,
});

/**
 * Turns a typed Recovery code into the form the server issued: no dashes or spaces, capital
 * letters, 0 for O and 1 for I or L. Only text that passes `TypedRecoveryCode` becomes a valid code.
 * Example: `normalizeRecoveryCode("oi23-4567-89ab-cdef-ghjk-mnpq") === "0123456789ABCDEFGHJKMNPQ"`
 */
export function normalizeRecoveryCode(typedCode: string): string {
  return typedCode
    .replaceAll(/[ -]/g, "")
    .toUpperCase()
    .replaceAll("O", "0")
    .replaceAll(/[IL]/g, "1");
}
