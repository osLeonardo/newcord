import { ApiErrorCode } from "@newcord/shared";
import { describe, expect, it } from "vitest";
import {
  accountRefusalMessage,
  credentialsProblemMessage,
} from "../src/renderer/src/account/account-messages";
import type { AccountRefusal } from "../src/preload/desktop-api";

const everyRefusal: readonly AccountRefusal[] = [
  ...Object.values(ApiErrorCode),
  "SERVER_UNREACHABLE",
  "UNEXPECTED_RESPONSE",
  "ANOTHER_ACCOUNT_STORED",
];

describe("accountRefusalMessage", () => {
  it.each([
    [ApiErrorCode.UsernameTaken, "That username is taken. Choose another one."],
    [ApiErrorCode.InvalidCredentials, "Wrong username or password."],
    [ApiErrorCode.RateLimited, "Too many attempts. Try again later."],
    [
      "SERVER_UNREACHABLE",
      "Cannot reach the server. Check your connection and try again.",
    ],
  ] as const)("explains %s", (refusal, message) => {
    expect(accountRefusalMessage(refusal)).toBe(message);
  });

  it("has a sentence for every refusal", () => {
    for (const refusal of everyRefusal) {
      expect(accountRefusalMessage(refusal)).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("gives every refusal its own message", () => {
    const messages = everyRefusal.map((refusal) =>
      accountRefusalMessage(refusal),
    );

    expect(new Set(messages).size).toBe(everyRefusal.length);
  });
});

describe("credentialsProblemMessage", () => {
  it.each([
    [
      "INVALID_USERNAME",
      "Usernames have 3 to 32 characters: lowercase letters, digits and underscores.",
    ],
    ["PASSWORD_TOO_SHORT", "Passwords need at least 12 characters."],
    ["PASSWORD_TOO_LONG", "Passwords can have at most 256 characters."],
  ] as const)("explains %s with the shared limits", (problem, message) => {
    expect(credentialsProblemMessage(problem)).toBe(message);
  });
});
