import { RecoveryCode } from "@newcord/shared";
import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import { generateRecoveryCode } from "../src/accounts/recovery-codes.js";

describe("generateRecoveryCode", () => {
  it("is 24 symbols of Crockford Base32", () => {
    const code = generateRecoveryCode();

    expect(code).toHaveLength(24);
    expect(Value.Check(RecoveryCode, code)).toBe(true);
  });

  it("asks for exactly 24 random bytes", () => {
    const randomBytes = vi.fn((size: number) => Buffer.alloc(size));

    generateRecoveryCode(randomBytes);

    expect(randomBytes).toHaveBeenCalledExactlyOnceWith(24);
  });

  it("maps each byte to the symbol of its low 5 bits", () => {
    const bytes = Buffer.from([...Array(24).keys()]);

    expect(generateRecoveryCode(() => bytes)).toBe("0123456789ABCDEFGHJKMNPQ");
  });

  it("wraps bytes of 32 and above around the alphabet", () => {
    const bytes = Buffer.from([
      32,
      63,
      64 + 10,
      255,
      ...Array<number>(20).fill(31),
    ]);

    expect(generateRecoveryCode(() => bytes)).toBe(`0ZAZ${"Z".repeat(20)}`);
  });

  it("differs every time", () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });
});
