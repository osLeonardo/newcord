import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  ClientEnvelope,
  MlsProposalDeliveryEnvelope,
  MlsProposalEnvelope,
  ServerEnvelope,
} from "../src/index.js";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";
const deviceId = "mJMEbgts33NWbvGmNqkuEw";
const payload = "AAECAwQFBgcICQ==";

describe("prompts", () => {
  it.each([
    { v: 1, type: "invite.accepted", groupId, username: "bruno" },
    { v: 1, type: "device.new", groupId, username: "bruno", deviceId },
    { v: 1, type: "resync", groupId, username: "bruno", deviceId },
  ])("are server Envelopes: %j", (prompt) => {
    expect(Value.Check(ServerEnvelope, prompt)).toBe(true);
  });

  it("rejects a device.new without a Device", () => {
    expect(
      Value.Check(ServerEnvelope, {
        v: 1,
        type: "device.new",
        groupId,
        username: "bruno",
      }),
    ).toBe(false);
  });
});

describe("the leave request", () => {
  it("is sent as an MLS proposal and delivered with its sender", () => {
    const request = {
      v: 1,
      type: "mls.proposal",
      requestId: "r-1",
      groupId,
      proposal: payload,
    };
    const delivered = {
      v: 1,
      type: "mls.proposal",
      groupId,
      seq: 3,
      sender: { username: "bruno", deviceId },
      proposal: payload,
    };

    expect(Value.Check(MlsProposalEnvelope, request)).toBe(true);
    expect(Value.Check(ClientEnvelope, request)).toBe(true);
    expect(Value.Check(MlsProposalDeliveryEnvelope, delivered)).toBe(true);
    expect(Value.Check(ServerEnvelope, delivered)).toBe(true);
  });
});
