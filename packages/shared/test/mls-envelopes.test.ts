import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  AckEnvelope,
  ClientEnvelope,
  MlsCommitDeliveryEnvelope,
  MlsCommitEnvelope,
  MlsMessageEnvelope,
  MlsWelcomeDeliveryEnvelope,
  ServerEnvelope,
} from "../src/index.js";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";
const bruno = "mJMEbgts33NWbvGmNqkuEw";
const carla = "pfDDyob7AL_qzztHbTuCoQ";
const payload = "AAECAwQFBgcICQ==";
const commit = {
  v: 1,
  type: "mls.commit",
  requestId: "r-1",
  groupId,
  epoch: 3,
  added: [bruno],
  removed: [],
  commit: payload,
  welcome: payload,
};

describe("MlsCommitEnvelope", () => {
  it("carries the epoch, the declared change, the commit and its welcome", () => {
    expect(Value.Check(MlsCommitEnvelope, commit)).toBe(true);
    expect(Value.Check(ClientEnvelope, commit)).toBe(true);
    expect(
      Value.Check(MlsCommitEnvelope, {
        ...commit,
        added: [],
        removed: [carla],
        welcome: undefined,
      }),
    ).toBe(true);
  });

  it.each([
    ["a negative epoch", { ...commit, epoch: -1 }],
    ["a fractional epoch", { ...commit, epoch: 1.5 }],
    ["a Device declared twice", { ...commit, added: [bruno, bruno] }],
    ["a Device ID breaking its rules", { ...commit, removed: ["x:y"] }],
    ["a commit that is not base64", { ...commit, commit: "nope!" }],
    ["no declared removals", { ...commit, removed: undefined }],
  ])("rejects %s", (_case, envelope) => {
    expect(Value.Check(MlsCommitEnvelope, envelope)).toBe(false);
  });
});

describe("MlsMessageEnvelope and AckEnvelope", () => {
  it("carry the Group and the message, or the sequence number confirmed", () => {
    expect(
      Value.Check(MlsMessageEnvelope, {
        v: 1,
        type: "mls.message",
        requestId: "r-2",
        groupId,
        message: payload,
      }),
    ).toBe(true);
    expect(
      Value.Check(AckEnvelope, { v: 1, type: "ack", groupId, seq: 7 }),
    ).toBe(true);
  });

  it("rejects an ack of sequence number 0", () => {
    expect(
      Value.Check(AckEnvelope, { v: 1, type: "ack", groupId, seq: 0 }),
    ).toBe(false);
  });
});

describe("deliveries", () => {
  const sender = { username: "alice", deviceId: carla };

  it("name the sender, the Group and the sequence number", () => {
    const delivered = {
      v: 1,
      type: "mls.commit",
      groupId,
      seq: 4,
      sender,
      epoch: 3,
      added: [bruno],
      removed: [],
      commit: payload,
    };
    const welcome = {
      v: 1,
      type: "mls.welcome",
      groupId,
      seq: 5,
      sender,
      groupName: "friends",
      welcome: payload,
    };

    expect(Value.Check(MlsCommitDeliveryEnvelope, delivered)).toBe(true);
    expect(Value.Check(MlsWelcomeDeliveryEnvelope, welcome)).toBe(true);
    expect(Value.Check(ServerEnvelope, delivered)).toBe(true);
    expect(Value.Check(ServerEnvelope, welcome)).toBe(true);
  });
});
