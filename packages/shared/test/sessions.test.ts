import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { RefreshRequest, RefreshResponse, RefreshToken } from "../src/index.js";

const REFRESH_TOKEN = "a".repeat(43);

describe("RefreshToken", () => {
  it("accepts 32 bytes in base64url", () => {
    expect(Value.Check(RefreshToken, REFRESH_TOKEN)).toBe(true);
  });

  it("rejects other lengths and padding", () => {
    expect(Value.Check(RefreshToken, "a".repeat(42))).toBe(false);
    expect(Value.Check(RefreshToken, `${"a".repeat(43)}=`)).toBe(false);
  });
});

describe("RefreshRequest", () => {
  it("accepts a refresh token", () => {
    expect(Value.Check(RefreshRequest, { refreshToken: REFRESH_TOKEN })).toBe(
      true,
    );
  });

  it("rejects a field not in the schema", () => {
    const request = { refreshToken: REFRESH_TOKEN, deviceId: "a".repeat(22) };

    expect(Value.Check(RefreshRequest, request)).toBe(false);
  });

  it("rejects a missing or malformed refresh token", () => {
    expect(Value.Check(RefreshRequest, {})).toBe(false);
    expect(Value.Check(RefreshRequest, { refreshToken: "a".repeat(42) })).toBe(
      false,
    );
  });
});

describe("RefreshResponse", () => {
  const response = {
    accessToken: "header.payload.signature",
    refreshToken: REFRESH_TOKEN,
  };

  it("accepts an access token and a refresh token", () => {
    expect(Value.Check(RefreshResponse, response)).toBe(true);
  });

  it("rejects a field not in the schema", () => {
    expect(
      Value.Check(RefreshResponse, { ...response, deviceId: "a".repeat(22) }),
    ).toBe(false);
  });
});
