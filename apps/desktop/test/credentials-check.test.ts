import { describe, expect, it } from "vitest";
import {
  credentialsProblem,
  passwordLimits,
  usernameLimits,
} from "../src/renderer/src/account/credentials-check";
import type { Credentials } from "../src/preload/desktop-api";

const valid: Credentials = {
  username: "alice_01",
  password: "correct horse battery staple",
};

describe("the limits read from the shared schemas", () => {
  it("are the Settings of 08-m1-build", () => {
    expect(usernameLimits).toEqual({ minLength: 3, maxLength: 32 });
    expect(passwordLimits).toEqual({ minLength: 12, maxLength: 256 });
  });
});

describe("credentialsProblem", () => {
  it.each([
    valid,
    { ...valid, username: "abc" },
    { ...valid, username: "a".repeat(32) },
    { ...valid, password: "twelve chars" },
    { ...valid, password: "p".repeat(256) },
  ])("finds nothing wrong with %j", (credentials) => {
    expect(credentialsProblem(credentials)).toBeUndefined();
  });

  it.each([
    "Alice",
    "al",
    "a".repeat(33),
    "alice smith",
    "alice-01",
    "",
    "álice",
  ])("refuses the username %j", (username) => {
    expect(credentialsProblem({ ...valid, username })).toBe("INVALID_USERNAME");
  });

  it.each(["", "eleven char", "😀".repeat(11)])(
    "finds the password %j too short",
    (password) => {
      expect(credentialsProblem({ ...valid, password })).toBe(
        "PASSWORD_TOO_SHORT",
      );
    },
  );

  it("counts characters, not UTF-16 units, as the server does", () => {
    expect(
      credentialsProblem({ ...valid, password: "😀".repeat(12) }),
    ).toBeUndefined();
  });

  it("finds a password over 256 characters too long", () => {
    expect(credentialsProblem({ ...valid, password: "p".repeat(257) })).toBe(
      "PASSWORD_TOO_LONG",
    );
  });

  it("reports the username before the password", () => {
    expect(credentialsProblem({ username: "A", password: "short" })).toBe(
      "INVALID_USERNAME",
    );
  });
});
