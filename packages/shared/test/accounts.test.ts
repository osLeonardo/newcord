import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  DeviceId,
  IdentityKey,
  Password,
  RefreshToken,
  RegisterRequest,
  RegisterResponse,
  Username,
} from "../src/index.js";

const RFC_8032_TEST_PUBLIC_KEY = "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=";

describe("Username", () => {
  it.each(["abc", "a_1", "user_name_2026", "z".repeat(32)])(
    "accepts %s",
    (username) => {
      expect(Value.Check(Username, username)).toBe(true);
    },
  );

  it.each([
    ["2 characters", "ab"],
    ["33 characters", "z".repeat(33)],
    ["capital letters", "Alice"],
    ["a dash", "al-ice"],
    ["a space", "al ice"],
    ["a dot", "al.ice"],
    ["a letter outside ASCII", "álice"],
    ["a trailing newline", "alice\n"],
    ["the empty string", ""],
  ])("rejects %s", (_case, username) => {
    expect(Value.Check(Username, username)).toBe(false);
  });
});

describe("Password", () => {
  it("accepts 12 and 256 characters", () => {
    expect(Value.Check(Password, "p".repeat(12))).toBe(true);
    expect(Value.Check(Password, "p".repeat(256))).toBe(true);
  });

  it("rejects 11 and 257 characters", () => {
    expect(Value.Check(Password, "p".repeat(11))).toBe(false);
    expect(Value.Check(Password, "p".repeat(257))).toBe(false);
  });
});

describe("IdentityKey", () => {
  it("accepts 32 bytes in padded base64", () => {
    expect(Value.Check(IdentityKey, RFC_8032_TEST_PUBLIC_KEY)).toBe(true);
    expect(Value.Check(IdentityKey, `${"A".repeat(43)}=`)).toBe(true);
    expect(Value.Check(IdentityKey, `${"/".repeat(42)}8=`)).toBe(true);
  });

  it.each([
    ["31 bytes", `${"A".repeat(42)}==`],
    ["33 bytes", "A".repeat(44)],
    ["32 bytes without padding", "A".repeat(43)],
    ["a non-canonical last symbol", `${"A".repeat(42)}B=`],
    ["base64url symbols", `${"-".repeat(42)}A=`],
    ["a character outside base64", `${"A".repeat(41)}*A=`],
    ["whitespace", ` ${"A".repeat(42)}A=`],
    ["the empty string", ""],
  ])("rejects %s", (_case, identityKey) => {
    expect(Value.Check(IdentityKey, identityKey)).toBe(false);
  });
});

describe("DeviceId", () => {
  it("accepts 16 bytes in base64url", () => {
    expect(Value.Check(DeviceId, "AbCd-_0123456789xyzXYZ")).toBe(true);
  });

  it("rejects a colon, so it fits in <username>:<deviceId> (D70)", () => {
    expect(Value.Check(DeviceId, "AbCd-_0123456789xyzXY:")).toBe(false);
  });
});

describe("RefreshToken", () => {
  it("accepts 32 bytes in base64url", () => {
    expect(Value.Check(RefreshToken, "a".repeat(43))).toBe(true);
  });

  it("rejects other lengths and padding", () => {
    expect(Value.Check(RefreshToken, "a".repeat(42))).toBe(false);
    expect(Value.Check(RefreshToken, `${"a".repeat(43)}=`)).toBe(false);
  });
});

describe("RegisterRequest", () => {
  const request = {
    username: "alice",
    password: "correct horse battery",
    identityKey: RFC_8032_TEST_PUBLIC_KEY,
  };

  it("accepts a username, a password and an identity key", () => {
    expect(Value.Check(RegisterRequest, request)).toBe(true);
  });

  it("rejects a field not in the schema", () => {
    expect(Value.Check(RegisterRequest, { ...request, admin: true })).toBe(
      false,
    );
  });

  it("rejects a missing field", () => {
    const withoutKey = {
      username: request.username,
      password: request.password,
    };

    expect(Value.Check(RegisterRequest, withoutKey)).toBe(false);
  });
});

describe("RegisterResponse", () => {
  it("rejects a field not in the schema", () => {
    const response = {
      accessToken: "header.payload.signature",
      refreshToken: "a".repeat(43),
      deviceId: "a".repeat(22),
      recoveryCode: "0".repeat(24),
    };

    expect(Value.Check(RegisterResponse, response)).toBe(true);
    expect(Value.Check(RegisterResponse, { ...response, userId: 1 })).toBe(
      false,
    );
  });
});
