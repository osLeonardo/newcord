import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  CROCKFORD_BASE32_ALPHABET,
  RECOVERY_CODE_LENGTH,
  RecoveryCode,
  TypedRecoveryCode,
  normalizeRecoveryCode,
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

describe("TypedRecoveryCode", () => {
  it.each([
    ["the code as issued", "0123456789ABCDEFGHJKMNPQ"],
    ["lower case", "0123456789abcdefghjkmnpq"],
    ["groups of four with dashes", "0123-4567-89AB-CDEF-GHJK-MNPQ"],
    ["groups of four with spaces", "0123 4567 89ab cdef ghjk mnpq"],
    [
      "dashes and spaces around and between",
      " - 0123 - 4567-89AB CDEF GHJK MNPQ - ",
    ],
    ["O, I and L standing for 0 and 1", "OI23456789ABCDEFGHJKMNPQ"],
    ["o, i and l in lower case", "oi23456789abcdefghjkmnpl"],
  ])("accepts %s", (_case, typedCode) => {
    expect(Value.Check(TypedRecoveryCode, typedCode)).toBe(true);
  });

  it.each([
    ["23 symbols", "0123-4567-89AB-CDEF-GHJK-MNP"],
    ["25 symbols", "0123-4567-89AB-CDEF-GHJK-MNPQR"],
    ["the letter U", "U123456789ABCDEFGHJKMNPQ"],
    ["the letter u", "u123456789ABCDEFGHJKMNPQ"],
    ["an underscore", "0123_4567_89AB_CDEF_GHJK_MNPQ"],
    ["a dot", "0123.4567.89AB.CDEF.GHJK.MNPQ"],
    ["a tab", "0123\t4567-89AB-CDEF-GHJK-MNPQ"],
    ["a letter outside ASCII", "Á123456789ABCDEFGHJKMNPQ"],
    ["only separators", "- - -"],
    ["the empty string", ""],
    ["more than 64 characters", `0123456789ABCDEFGHJKMNPQ${" ".repeat(41)}`],
  ])("rejects %s", (_case, typedCode) => {
    expect(Value.Check(TypedRecoveryCode, typedCode)).toBe(false);
  });

  it("accepts exactly 64 characters", () => {
    expect(
      Value.Check(
        TypedRecoveryCode,
        `0123456789ABCDEFGHJKMNPQ${" ".repeat(40)}`,
      ),
    ).toBe(true);
  });
});

describe("normalizeRecoveryCode", () => {
  it("leaves a code as issued unchanged", () => {
    expect(normalizeRecoveryCode("0123456789ABCDEFGHJKMNPQ")).toBe(
      "0123456789ABCDEFGHJKMNPQ",
    );
  });

  it("drops dashes and spaces and capitalises letters", () => {
    expect(normalizeRecoveryCode(" 0123-4567 89ab-cdef ghjk-mnpq ")).toBe(
      "0123456789ABCDEFGHJKMNPQ",
    );
  });

  it("reads O as 0 and I or L as 1, in either letter case", () => {
    expect(normalizeRecoveryCode("OoIiLl6789ABCDEFGHJKMNPQ")).toBe(
      "0011116789ABCDEFGHJKMNPQ",
    );
  });

  it("returns a valid RecoveryCode for every typed form TypedRecoveryCode accepts", () => {
    const typedCodes = [
      "0123-4567-89ab-cdef-ghjk-mnpq",
      "oi23 4567 89AB CDEF GHJK MNPL",
    ];

    for (const typedCode of typedCodes) {
      expect(Value.Check(TypedRecoveryCode, typedCode)).toBe(true);
      expect(Value.Check(RecoveryCode, normalizeRecoveryCode(typedCode))).toBe(
        true,
      );
    }
  });
});
