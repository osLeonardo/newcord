import { Type } from "typebox";

/** Crockford Base32: the digits and capital letters without I, L, O and U (08-m1-build Settings). */
export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A Recovery code has 24 symbols of 5 bits each: 120 bits of randomness (D55). */
export const RECOVERY_CODE_LENGTH = 24;

/** A Recovery code as the server issues it: 24 Crockford Base32 symbols, not grouped. */
export const RecoveryCode = Type.String({
  pattern: `^[${CROCKFORD_BASE32_ALPHABET}]{${RECOVERY_CODE_LENGTH}}$`,
});
