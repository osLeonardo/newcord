import { createHash, randomBytes as cryptoRandomBytes } from "node:crypto";
import type { RandomBytes } from "../random-bytes.js";

const REFRESH_TOKEN_BYTES = 32;

/** A refresh token lasts 30 days (08-m1-build Settings). */
export const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Creates a refresh token: 32 random bytes in base64url (D37b).
 * Example: `const refreshToken = generateRefreshToken();`
 */
export function generateRefreshToken(
  randomBytes: RandomBytes = cryptoRandomBytes,
): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

/**
 * Hashes a refresh token's text with SHA-256; only this hash is stored.
 * Example: `const tokenHash = hashRefreshToken(refreshToken);`
 */
export function hashRefreshToken(refreshToken: string): Buffer {
  return createHash("sha256").update(refreshToken).digest();
}
