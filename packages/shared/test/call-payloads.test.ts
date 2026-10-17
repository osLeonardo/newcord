import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  CALL_SDP_MAX_LENGTH,
  CallPayload,
  CallSignalPayload,
  isStaleCallMessage,
} from "../src/index.js";

const sentAt = 1_760_000_000_000;
const to = "mJMEbgts33NWbvGmNqkuEw";
const offer = { kind: "description", type: "offer", sdp: "v=0\r\n" };
const candidate = {
  kind: "candidate",
  candidate: "candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host",
  sdpMid: "0",
  sdpMLineIndex: 0,
  usernameFragment: "abcd",
};

describe("CallPayload", () => {
  it.each([
    ["a join", { type: "call.join", sentAt }],
    ["a leave", { type: "call.leave", sentAt }],
    ["an offer", { type: "call.signal", to, signal: offer, sentAt }],
    [
      "an answer",
      { type: "call.signal", to, signal: { ...offer, type: "answer" }, sentAt },
    ],
    ["a candidate", { type: "call.signal", to, signal: candidate, sentAt }],
    [
      "a candidate without a media line",
      {
        type: "call.signal",
        to,
        signal: {
          kind: "candidate",
          candidate: "",
          sdpMid: null,
          sdpMLineIndex: null,
        },
        sentAt,
      },
    ],
  ])("accepts %s", (_case, payload) => {
    expect(Value.Check(CallPayload, payload)).toBe(true);
  });

  it.each([
    [
      "a join with more than its type and time",
      { type: "call.join", sentAt, who: "alice" },
    ],
    ["a join without a time", { type: "call.join" }],
    [
      "a signal for a malformed Device",
      { type: "call.signal", to: "x", signal: offer, sentAt },
    ],
    [
      "a description of another type",
      {
        type: "call.signal",
        to,
        signal: { ...offer, type: "pranswer" },
        sentAt,
      },
    ],
    [
      "a session description over the limit",
      {
        type: "call.signal",
        to,
        signal: { ...offer, sdp: "x".repeat(CALL_SDP_MAX_LENGTH + 1) },
        sentAt,
      },
    ],
    [
      "a signal with a field not in the schema",
      { type: "call.signal", to, signal: { ...candidate, extra: 1 }, sentAt },
    ],
  ])("rejects %s", (_case, payload) => {
    expect(Value.Check(CallPayload, payload)).toBe(false);
  });

  it("is told apart from a Chat message", () => {
    expect(
      Value.Check(CallSignalPayload, {
        type: "chat.text",
        id: to,
        text: "hi",
        sentAt,
      }),
    ).toBe(false);
  });
});

describe("isStaleCallMessage", () => {
  it("ignores messages more than 60 seconds old by the sender's clock", () => {
    expect(isStaleCallMessage(sentAt, sentAt + 60_000)).toBe(false);
    expect(isStaleCallMessage(sentAt, sentAt + 60_001)).toBe(true);
  });

  it("does not drop a message from a sender whose clock is ahead", () => {
    expect(isStaleCallMessage(sentAt + 5_000, sentAt)).toBe(false);
  });
});
