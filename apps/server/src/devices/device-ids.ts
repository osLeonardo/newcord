import { randomBytes as cryptoRandomBytes } from "node:crypto";
import type { RandomBytes } from "../random-bytes.js";

const DEVICE_ID_BYTES = 16;

/**
 * Creates a Device ID: 16 random bytes in base64url, which never contains ":" (D59, D70).
 * Example: `const deviceId = generateDeviceId();`
 */
export function generateDeviceId(
  randomBytes: RandomBytes = cryptoRandomBytes,
): string {
  return randomBytes(DEVICE_ID_BYTES).toString("base64url");
}
