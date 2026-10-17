import { RefreshToken } from "@newcord/shared";
import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import {
  REFRESH_TOKEN_LIFETIME_MS,
  generateRefreshToken,
  hashRefreshToken,
} from "../src/sessions/refresh-tokens.js";

describe("generateRefreshToken", () => {
  it("is 32 random bytes in base64url", () => {
    const token = generateRefreshToken();

    expect(Value.Check(RefreshToken, token)).toBe(true);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("encodes the 32 bytes it is given", () => {
    const randomBytes = vi.fn(() => Buffer.from([...Array(32).keys()]));

    expect(generateRefreshToken(randomBytes)).toBe(
      "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
    );
    expect(randomBytes).toHaveBeenCalledExactlyOnceWith(32);
  });

  it("differs every time", () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });
});

describe("hashRefreshToken", () => {
  it("is the SHA-256 digest of the token text", () => {
    expect(hashRefreshToken("abc").toString("hex")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("REFRESH_TOKEN_LIFETIME_MS", () => {
  it("is 30 days", () => {
    expect(REFRESH_TOKEN_LIFETIME_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
