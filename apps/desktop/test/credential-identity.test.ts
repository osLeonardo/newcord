import { describe, expect, it } from "vitest";
import {
  credentialIdentity,
  parseCredentialIdentity,
} from "../src/main/mls/credential-identity";

const deviceId = "mJMEbgts33NWbvGmNqkuEw";

describe("credential identities (D70)", () => {
  it("join the username and the Device ID with one colon, and read back", () => {
    const identity = credentialIdentity({ username: "alice_01", deviceId });

    expect(identity).toBe(`alice_01:${deviceId}`);
    expect(parseCredentialIdentity(identity)).toEqual({
      username: "alice_01",
      deviceId,
    });
  });

  it.each([
    ["no colon", `alice${deviceId}`],
    ["two colons", `alice:${deviceId}:x`],
    ["an invalid username", `Alice:${deviceId}`],
    ["an invalid Device ID", "alice:short"],
    ["an empty identity", ""],
    ["an empty username", `:${deviceId}`],
  ])("are refused with %s", (_case, identity) => {
    expect(parseCredentialIdentity(identity)).toBeUndefined();
  });
});
