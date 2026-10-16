import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { ChatTextPayload } from "../src/index.js";

const message = {
  type: "chat.text",
  id: "mJMEbgts33NWbvGmNqkuEw",
  text: "hello <b>there</b>",
  sentAt: 1_760_000_000_000,
};

describe("ChatTextPayload", () => {
  it("accepts a message ID, text up to 4,000 characters and the time sent", () => {
    expect(Value.Check(ChatTextPayload, message)).toBe(true);
    expect(
      Value.Check(ChatTextPayload, { ...message, text: "x".repeat(4000) }),
    ).toBe(true);
  });

  it.each([
    ["empty text", { ...message, text: "" }],
    ["text over 4,000 characters", { ...message, text: "x".repeat(4001) }],
    ["a malformed ID", { ...message, id: "short" }],
    ["a fractional time", { ...message, sentAt: 1.5 }],
    ["another payload type", { ...message, type: "call.join" }],
    ["a field not in the schema", { ...message, html: "<b>x</b>" }],
  ])("rejects %s", (_case, payload) => {
    expect(Value.Check(ChatTextPayload, payload)).toBe(false);
  });
});
