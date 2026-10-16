import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  HubRequestEnvelope,
  InvitationEnvelope,
  InviteEnvelope,
  InviteReplyEnvelope,
  ServerEnvelope,
} from "../src/index.js";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";
const invitationId = "mJMEbgts33NWbvGmNqkuEw";

describe("InviteEnvelope", () => {
  const invite = {
    v: 1,
    type: "invite",
    requestId: "r-1",
    groupId,
    username: "bruno",
  };

  it("names the Group and the invitee's username", () => {
    expect(Value.Check(InviteEnvelope, invite)).toBe(true);
    expect(Value.Check(HubRequestEnvelope, invite)).toBe(true);
  });

  it.each([
    ["an invalid username", { ...invite, username: "Bruno" }],
    ["an invalid Group ID", { ...invite, groupId: "not-an-id" }],
    ["a field not in the schema", { ...invite, deviceId: "x" }],
  ])("rejects %s", (_case, envelope) => {
    expect(Value.Check(InviteEnvelope, envelope)).toBe(false);
  });
});

describe("InviteReplyEnvelope", () => {
  const reply = {
    v: 1,
    type: "invite.reply",
    requestId: "r-2",
    invitationId,
    accept: true,
  };

  it("accepts or declines by Invitation ID", () => {
    expect(Value.Check(InviteReplyEnvelope, reply)).toBe(true);
    expect(Value.Check(InviteReplyEnvelope, { ...reply, accept: false })).toBe(
      true,
    );
  });

  it.each([
    ["an answer that is not a boolean", { ...reply, accept: "yes" }],
    ["a short Invitation ID", { ...reply, invitationId: "abc" }],
  ])("rejects %s", (_case, envelope) => {
    expect(Value.Check(InviteReplyEnvelope, envelope)).toBe(false);
  });
});

describe("InvitationEnvelope", () => {
  it("shows the Group's name and who invited, from the server", () => {
    const invitation = {
      v: 1,
      type: "invitation",
      invitationId,
      groupId,
      groupName: "friends",
      from: "alice",
    };

    expect(Value.Check(InvitationEnvelope, invitation)).toBe(true);
    expect(Value.Check(ServerEnvelope, invitation)).toBe(true);
  });
});
