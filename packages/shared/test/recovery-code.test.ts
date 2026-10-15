import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  CROCKFORD_BASE32_ALPHABET,
  RECOVERY_CODE_LENGTH,
  RecoveryCode,
} from "../src/index.js";

describe("CROCKFORD_BASE32_ALPHABET", () => {
  it("has 32 distinct symbols", () => {
    expect(new Set(CROCKFORD_BASE32_ALPHABET).size).toBe(32);
    expect(CROCKFORD_BASE32_ALPHABET).toHaveLength(32);
  });

  it("is the digits and capital letters without I, L, O and U", () => {
    expect(CROCKFORD_BASE32_ALPHABET).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
  });
});

describe("RecoveryCode", () => {
  it("is 24 symbols long", () => {
    expect(RECOVERY_CODE_LENGTH).toBe(24);
  });

  it("accepts 24 symbols of the alphabet", () => {
    expect(Value.Check(RecoveryCode, "0123456789ABCDEFGHJKMNPQ")).toBe(true);
    expect(Value.Check(RecoveryCode, "RSTVWXYZ0123456789ABCDEF")).toBe(true);
  });

  it.each([
    ["23 symbols", "0123456789ABCDEFGHJKMNP"],
    ["25 symbols", "0123456789ABCDEFGHJKMNPQR"],
    ["lower case", "0123456789abcdefghjkmnpq"],
    ["the letter I", "I123456789ABCDEFGHJKMNPQ"],
    ["the letter L", "L123456789ABCDEFGHJKMNPQ"],
    ["the letter O", "O123456789ABCDEFGHJKMNPQ"],
    ["the letter U", "U123456789ABCDEFGHJKMNPQ"],
    ["groups of four", "0123-4567-89AB-CDEF-GHJK-MNPQ"],
  ])("rejects %s", (_case, code) => {
    expect(Value.Check(RecoveryCode, code)).toBe(false);
  });
});
