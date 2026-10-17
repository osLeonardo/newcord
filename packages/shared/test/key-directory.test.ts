import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { KeyDirectoryParams, KeyDirectoryResponse } from "../src/index.js";

const RFC_8032_TEST_PUBLIC_KEY = "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=";

describe("KeyDirectoryParams", () => {
  it("accepts a username", () => {
    expect(Value.Check(KeyDirectoryParams, { username: "bruno" })).toBe(true);
  });

  it.each([
    ["capital letters", "Bruno"],
    ["2 characters", "br"],
    ["33 characters", "b".repeat(33)],
    ["a dash", "br-uno"],
  ])("applies the username rules, rejecting %s", (_case, username) => {
    expect(Value.Check(KeyDirectoryParams, { username })).toBe(false);
  });

  it("rejects a field not in the schema", () => {
    expect(
      Value.Check(KeyDirectoryParams, { username: "bruno", deviceId: "x" }),
    ).toBe(false);
  });
});

describe("KeyDirectoryResponse", () => {
  it("accepts a list of identity keys", () => {
    const response = {
      identityKeys: [RFC_8032_TEST_PUBLIC_KEY, `${"A".repeat(43)}=`],
    };

    expect(Value.Check(KeyDirectoryResponse, response)).toBe(true);
  });

  it("rejects a key that is not 32 bytes in padded base64", () => {
    const response = { identityKeys: ["A".repeat(44)] };

    expect(Value.Check(KeyDirectoryResponse, response)).toBe(false);
  });

  it("rejects a field not in the schema", () => {
    const response = {
      identityKeys: [RFC_8032_TEST_PUBLIC_KEY],
      deviceIds: ["a".repeat(22)],
    };

    expect(Value.Check(KeyDirectoryResponse, response)).toBe(false);
  });
});
