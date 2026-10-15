import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  ClientEnvelope,
  HelloEnvelope,
  PROTOCOL_VERSION,
  PresenceChangeEnvelope,
  PresenceSnapshotEnvelope,
  ServerEnvelope,
  WebSocketCloseCode,
} from "../src/index.js";

const hello = { v: 1, type: "hello", accessToken: "header.claims.signature" };
const snapshot = {
  v: 1,
  type: "presence",
  kind: "snapshot",
  usernames: ["alice", "bob"],
};
const online = { v: 1, type: "presence", kind: "online", username: "bob" };
const offline = { v: 1, type: "presence", kind: "offline", username: "bob" };

describe("PROTOCOL_VERSION", () => {
  it("is 1, the version every M1 Envelope carries", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe("HelloEnvelope", () => {
  it("accepts the protocol version, the type and an access token", () => {
    expect(Value.Check(HelloEnvelope, hello)).toBe(true);
  });

  it.each([
    ["another protocol version", { ...hello, v: 2 }],
    ["the version as text", { ...hello, v: "1" }],
    ["no version", { type: hello.type, accessToken: hello.accessToken }],
    ["another type", { ...hello, type: "presence" }],
    ["no access token", { v: 1, type: "hello" }],
    ["an access token that is not text", { ...hello, accessToken: 42 }],
    ["a field not in the schema", { ...hello, deviceId: "a".repeat(22) }],
  ])("rejects %s", (_case, envelope) => {
    expect(Value.Check(HelloEnvelope, envelope)).toBe(false);
  });
});

describe("PresenceSnapshotEnvelope", () => {
  it("accepts the usernames of the online Accounts", () => {
    expect(Value.Check(PresenceSnapshotEnvelope, snapshot)).toBe(true);
    expect(
      Value.Check(PresenceSnapshotEnvelope, { ...snapshot, usernames: [] }),
    ).toBe(true);
  });

  it.each([
    ["a username breaking the rules", { ...snapshot, usernames: ["Alice"] }],
    ["a field not in the schema", { ...snapshot, deviceIds: [] }],
    ["another protocol version", { ...snapshot, v: 2 }],
  ])("rejects %s", (_case, envelope) => {
    expect(Value.Check(PresenceSnapshotEnvelope, envelope)).toBe(false);
  });
});

describe("PresenceChangeEnvelope", () => {
  it("accepts an Account coming online or going offline", () => {
    expect(Value.Check(PresenceChangeEnvelope, online)).toBe(true);
    expect(Value.Check(PresenceChangeEnvelope, offline)).toBe(true);
  });

  it.each([
    ["an unknown kind", { ...online, kind: "away" }],
    ["a username breaking the rules", { ...online, username: "b" }],
    ["a field not in the schema", { ...online, deviceId: "a".repeat(22) }],
  ])("rejects %s", (_case, envelope) => {
    expect(Value.Check(PresenceChangeEnvelope, envelope)).toBe(false);
  });
});

describe("ClientEnvelope", () => {
  it("is only hello in M1", () => {
    expect(Value.Check(ClientEnvelope, hello)).toBe(true);
    expect(Value.Check(ClientEnvelope, online)).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(Value.Check(ClientEnvelope, { v: 1, type: "group.create" })).toBe(
      false,
    );
  });
});

describe("ServerEnvelope", () => {
  it("is a presence snapshot or change in M1", () => {
    for (const envelope of [snapshot, online, offline]) {
      expect(Value.Check(ServerEnvelope, envelope)).toBe(true);
    }
    expect(Value.Check(ServerEnvelope, hello)).toBe(false);
  });
});

describe("WebSocketCloseCode", () => {
  it("gives authentication and session end distinct application codes (4000 to 4999)", () => {
    const { AuthenticationFailed, SessionEnded } = WebSocketCloseCode;

    expect(AuthenticationFailed).not.toBe(SessionEnded);
    for (const code of [AuthenticationFailed, SessionEnded]) {
      expect(code).toBeGreaterThanOrEqual(4000);
      expect(code).toBeLessThanOrEqual(4999);
    }
  });

  it("rejects later Envelopes with the standard Policy Violation code", () => {
    expect(WebSocketCloseCode.EnvelopeRejected).toBe(1008);
  });
});
