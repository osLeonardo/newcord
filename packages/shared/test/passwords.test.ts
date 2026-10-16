import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  PasswordChangeRequest,
  PasswordRecoveryRequest,
  PasswordRecoveryResponse,
} from "../src/index.js";

describe("PasswordChangeRequest", () => {
  it("accepts a new password alone, without the old one (D55)", () => {
    expect(
      Value.Check(PasswordChangeRequest, { newPassword: "p".repeat(12) }),
    ).toBe(true);
  });

  it.each([
    ["a password of 11 characters", { newPassword: "p".repeat(11) }],
    ["a password of 257 characters", { newPassword: "p".repeat(257) }],
    ["no new password", {}],
    [
      "the old password as an extra field",
      { newPassword: "p".repeat(12), oldPassword: "o".repeat(12) },
    ],
  ])("rejects %s", (_case, request) => {
    expect(Value.Check(PasswordChangeRequest, request)).toBe(false);
  });
});

describe("PasswordRecoveryRequest", () => {
  const request = {
    username: "alice",
    recoveryCode: "0123-4567-89ab-cdef-ghjk-mnpq",
    newPassword: "p".repeat(12),
  };

  it("accepts a username, a Recovery code as typed and a new password", () => {
    expect(Value.Check(PasswordRecoveryRequest, request)).toBe(true);
  });

  it.each([
    ["a username breaking the rules", { username: "Alice" }],
    ["a Recovery code of 23 symbols", { recoveryCode: "0".repeat(23) }],
    [
      "a Recovery code with the letter U",
      { recoveryCode: `U${"0".repeat(23)}` },
    ],
    ["a new password of 11 characters", { newPassword: "p".repeat(11) }],
    ["a field not in the schema", { identityKey: "A".repeat(44) }],
  ])("rejects %s", (_case, change) => {
    expect(
      Value.Check(PasswordRecoveryRequest, { ...request, ...change }),
    ).toBe(false);
  });

  it.each(["username", "recoveryCode", "newPassword"])(
    "rejects a request without %s",
    (field) => {
      const incomplete = Object.fromEntries(
        Object.entries(request).filter(([name]) => name !== field),
      );

      expect(Value.Check(PasswordRecoveryRequest, incomplete)).toBe(false);
    },
  );
});

describe("PasswordRecoveryResponse", () => {
  it("accepts a new Recovery code as the server issues it", () => {
    expect(
      Value.Check(PasswordRecoveryResponse, {
        recoveryCode: "0123456789ABCDEFGHJKMNPQ",
      }),
    ).toBe(true);
  });

  it.each([
    [
      "a code in groups of four",
      { recoveryCode: "0123-4567-89AB-CDEF-GHJK-MNPQ" },
    ],
    ["a code in lower case", { recoveryCode: "0123456789abcdefghjkmnpq" }],
    [
      "tokens, which recovery never returns",
      { recoveryCode: "0".repeat(24), accessToken: "header.payload.signature" },
    ],
  ])("rejects %s", (_case, response) => {
    expect(Value.Check(PasswordRecoveryResponse, response)).toBe(false);
  });
});
