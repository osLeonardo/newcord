import { describe, expect, it, vi } from "vitest";
import type { AccessTokenSubject } from "../src/sessions/access-tokens.js";
import {
  authenticateHello,
  type HelloDependencies,
} from "../src/websocket/hello.js";

const VALID_TOKEN = "header.claims.signature";
const subject: AccessTokenSubject = { userId: 7, deviceId: "a".repeat(22) };

function dependencies(usernames = new Map([[7, "alice"]])): HelloDependencies {
  return {
    accessTokenVerifier: {
      verify: (token: string): AccessTokenSubject | undefined =>
        token === VALID_TOKEN ? subject : undefined,
    },
    accountStore: {
      usernameOf: (userId: number): string | undefined => usernames.get(userId),
    },
  };
}

const helloText = (fields: object = {}): string =>
  JSON.stringify({ v: 1, type: "hello", accessToken: VALID_TOKEN, ...fields });

describe("authenticateHello", () => {
  it("returns the Account, Device and username a valid hello speaks for", () => {
    expect(authenticateHello(helloText(), dependencies())).toEqual({
      userId: 7,
      deviceId: subject.deviceId,
      username: "alice",
    });
  });

  it("refuses a token the verifier rejects", () => {
    expect(
      authenticateHello(helloText({ accessToken: "forged" }), dependencies()),
    ).toBeUndefined();
  });

  it("refuses a token whose Account no longer exists", () => {
    expect(
      authenticateHello(helloText(), dependencies(new Map())),
    ).toBeUndefined();
  });

  it.each([
    ["text that is not JSON", "{not json"],
    ["JSON that is not an object", "[1,2]"],
    ["the JSON null", "null"],
    ["another Envelope type", helloText({ type: "presence" })],
    ["an unknown type", helloText({ type: "group.create" })],
    ["another protocol version", helloText({ v: 2 })],
    ["a field not in the schema", helloText({ deviceId: subject.deviceId })],
    ["a missing access token", JSON.stringify({ v: 1, type: "hello" })],
  ])("refuses %s without checking any token", (_case, text) => {
    const checked = dependencies();
    const verify = vi.spyOn(checked.accessTokenVerifier, "verify");

    expect(authenticateHello(text, checked)).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });
});
