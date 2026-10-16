import { DeviceId, Username } from "@newcord/shared";
import { Value } from "typebox/value";

/** The Account and Device an MLS credential names (D70). */
export interface DeviceIdentity {
  readonly username: string;
  readonly deviceId: string;
}

/**
 * A Device's credential identity: `<username>:<deviceId>`. Neither part can contain ":".
 * @example credentialIdentity({ username: "alice", deviceId: "AAAAAAAAAAAAAAAAAAAAAA" }) // "alice:AAAAAAAAAAAAAAAAAAAAAA"
 */
export function credentialIdentity(device: DeviceIdentity): string {
  return `${device.username}:${device.deviceId}`;
}

/**
 * Reads a credential identity, or undefined for anything not shaped `<username>:<deviceId>` with
 * a valid username and Device ID, so a malformed credential is never trusted.
 * @example parseCredentialIdentity("alice:AAAAAAAAAAAAAAAAAAAAAA") // { username: "alice", deviceId: "AAAAAAAAAAAAAAAAAAAAAA" }
 */
export function parseCredentialIdentity(
  identity: string,
): DeviceIdentity | undefined {
  const parts = identity.split(":");
  if (parts.length !== 2) return undefined;
  const [username = "", deviceId = ""] = parts;
  if (!Value.Check(Username, username) || !Value.Check(DeviceId, deviceId)) {
    return undefined;
  }
  return { username, deviceId };
}
