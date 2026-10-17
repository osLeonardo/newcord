import { describe, expect, it } from "vitest";
import {
  accessTokenExpiresAt,
  renewalDelayMs,
} from "../src/main/session/access-token-expiry";
import {
  accessTokenExpiringAt,
  accessTokenWithClaims as tokenWithClaims,
} from "./support/test-access-token";

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

function tokenExpiringIn(milliseconds: number): string {
  return accessTokenExpiringAt(NOW + milliseconds);
}

describe("accessTokenExpiresAt", () => {
  it("reads the exp claim in milliseconds", () => {
    expect(accessTokenExpiresAt(tokenWithClaims({ exp: 1_700_000_000 }))).toBe(
      1_700_000_000_000,
    );
  });

  it.each([
    ["no exp claim", tokenWithClaims({ sub: "1" })],
    ["a text exp claim", tokenWithClaims({ exp: "1700000000" })],
    ["no payload", "header-only"],
    ["a payload that is not JSON", "aGVhZGVy.bm90IGpzb24.c2ln"],
    ["a payload that is JSON but not an object", tokenWithClaims([1, 2])],
  ])("is undefined for a token with %s", (_, token) => {
    expect(accessTokenExpiresAt(token)).toBeUndefined();
  });
});

describe("renewalDelayMs", () => {
  it("waits until 1 minute before a fresh 15-minute token expires", () => {
    expect(renewalDelayMs(tokenExpiringIn(15 * 60 * 1000), NOW)).toBe(
      14 * 60 * 1000,
    );
  });

  it("renews at once when less than 1 minute is left", () => {
    expect(renewalDelayMs(tokenExpiringIn(30 * 1000), NOW)).toBe(0);
  });

  it("renews at once when the token has already expired", () => {
    expect(renewalDelayMs(tokenExpiringIn(-60 * 1000), NOW)).toBe(0);
  });

  it("renews at once when the expiry cannot be read", () => {
    expect(renewalDelayMs("not a jwt", NOW)).toBe(0);
  });
});
