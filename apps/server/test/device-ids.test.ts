import { DeviceId } from "@newcord/shared";
import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import { generateDeviceId } from "../src/devices/device-ids.js";

describe("generateDeviceId", () => {
  it("is 16 random bytes in base64url, without a colon (D70)", () => {
    const deviceId = generateDeviceId();

    expect(Value.Check(DeviceId, deviceId)).toBe(true);
    expect(Buffer.from(deviceId, "base64url")).toHaveLength(16);
    expect(deviceId).not.toContain(":");
  });

  it("encodes the 16 bytes it is given", () => {
    const randomBytes = vi.fn(() => Buffer.from([...Array(16).keys()]));

    expect(generateDeviceId(randomBytes)).toBe("AAECAwQFBgcICQoLDA0ODw");
    expect(randomBytes).toHaveBeenCalledExactlyOnceWith(16);
  });

  it("differs every time", () => {
    expect(generateDeviceId()).not.toBe(generateDeviceId());
  });
});
