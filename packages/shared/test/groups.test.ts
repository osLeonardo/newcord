import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  ClientEnvelope,
  GroupCreateEnvelope,
  GroupId,
  GroupName,
  GroupRenamedEnvelope,
  GroupRenameEnvelope,
  HubRequestEnvelope,
  ServerEnvelope,
} from "../src/index.js";

/** 16 random bytes in base64url; the shared package has no Node.js types to make them at run time. */
const groupId = "MgZoqEdt4EEfhsMd_7xNqw";
const create = {
  v: 1,
  type: "group.create",
  requestId: "r-1",
  groupId,
  name: "friends",
};

describe("GroupId", () => {
  it.each([
    groupId,
    "mJMEbgts33NWbvGmNqkuEw",
    "pfDDyob7AL_qzztHbTuCoQ",
    "AAAAAAAAAAAAAAAAAAAAAA",
    "_____________________w",
  ])("accepts 16 bytes in base64url without padding: %s", (id) => {
    expect(Value.Check(GroupId, id)).toBe(true);
  });

  it.each([
    ["15 bytes", "QUuYpHmdOwUfSypfs53a"],
    ["17 bytes", "rvUKgPB0pwAMh5uYV6so8BI"],
    ["padded standard base64", "N0UiMYRpcaI0zTrBQODMFw=="],
    ["a non-canonical last symbol", `${"A".repeat(21)}B`],
  ])("rejects %s", (_case, id) => {
    expect(Value.Check(GroupId, id)).toBe(false);
  });
});

describe("GroupName", () => {
  it.each(["a", "n".repeat(64), "Friends & family 🎲"])(
    "accepts %j",
    (name) => {
      expect(Value.Check(GroupName, name)).toBe(true);
    },
  );

  it.each(["", "n".repeat(65)])("rejects %j", (name) => {
    expect(Value.Check(GroupName, name)).toBe(false);
  });
});

describe("GroupCreateEnvelope and GroupRenameEnvelope", () => {
  it("accept a request ID, a Group ID and a name", () => {
    expect(Value.Check(GroupCreateEnvelope, create)).toBe(true);
    expect(
      Value.Check(GroupRenameEnvelope, { ...create, type: "group.rename" }),
    ).toBe(true);
  });

  it.each([
    ["no request ID", { ...create, requestId: undefined }],
    ["a request ID with a space", { ...create, requestId: "r 1" }],
    ["a request ID longer than 64", { ...create, requestId: "r".repeat(65) }],
    ["a name that is too long", { ...create, name: "n".repeat(65) }],
    ["a field not in the schema", { ...create, epoch: 0 }],
  ])("reject %s", (_case, envelope) => {
    expect(Value.Check(GroupCreateEnvelope, envelope)).toBe(false);
  });

  it("are hub requests a client may send", () => {
    expect(Value.Check(HubRequestEnvelope, create)).toBe(true);
    expect(Value.Check(ClientEnvelope, create)).toBe(true);
  });
});

describe("GroupRenamedEnvelope", () => {
  it("is a server Envelope naming who renamed the Group", () => {
    const renamed = {
      v: 1,
      type: "group.renamed",
      groupId,
      name: "family",
      by: "alice",
    };

    expect(Value.Check(GroupRenamedEnvelope, renamed)).toBe(true);
    expect(Value.Check(ServerEnvelope, renamed)).toBe(true);
  });
});
