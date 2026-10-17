import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  BlockEnvelope,
  BlockListEnvelope,
  HubErrorCode,
  ReplyEnvelope,
  ServerEnvelope,
  UnblockEnvelope,
} from "../src/index.js";

describe("ReplyEnvelope", () => {
  const done = { v: 1, type: "reply", requestId: "r-1", ok: true };

  it("accepts a done reply and a refusal with a known code", () => {
    expect(Value.Check(ReplyEnvelope, done)).toBe(true);
    expect(
      Value.Check(ReplyEnvelope, {
        ...done,
        ok: false,
        code: HubErrorCode.NotAMember,
      }),
    ).toBe(true);
    expect(Value.Check(ServerEnvelope, done)).toBe(true);
  });

  it.each([
    ["a refusal without a code", { ...done, ok: false }],
    ["a refusal with an unknown code", { ...done, ok: false, code: "OOPS" }],
    ["a done reply with a code", { ...done, code: HubErrorCode.NotAMember }],
  ])("rejects %s", (_case, envelope) => {
    expect(Value.Check(ReplyEnvelope, envelope)).toBe(false);
  });
});

describe("block, unblock and the block list", () => {
  it("name Accounts by username", () => {
    const block = { v: 1, type: "block", requestId: "r-2", username: "bruno" };

    expect(Value.Check(BlockEnvelope, block)).toBe(true);
    expect(Value.Check(UnblockEnvelope, { ...block, type: "unblock" })).toBe(
      true,
    );
    expect(
      Value.Check(BlockListEnvelope, {
        v: 1,
        type: "blocks",
        usernames: ["bruno"],
      }),
    ).toBe(true);
  });

  it("rejects a username breaking the rules", () => {
    expect(
      Value.Check(BlockEnvelope, {
        v: 1,
        type: "block",
        requestId: "r-2",
        username: "Bruno",
      }),
    ).toBe(false);
  });
});
