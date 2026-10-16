import { Type, type Static } from "typebox";
import { DeviceId, Username } from "./accounts.js";
import { GroupId } from "./groups.js";
import { ProtocolVersion } from "./protocol.js";

/**
 * Asks the Group's Members to add an Account that accepted an Invitation: sent to online Members,
 * and to each Member Device after `hello`, until a commit adds the Account (D13).
 */
export const InviteAcceptedEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("invite.accepted"),
    groupId: GroupId,
    username: Username,
  },
  { additionalProperties: false },
);
export type InviteAcceptedEnvelope = Static<typeof InviteAcceptedEnvelope>;

/** Asks the Group's Members to add a Member's new Device, until a commit adds it (D56). */
export const DeviceNewEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("device.new"),
    groupId: GroupId,
    username: Username,
    deviceId: DeviceId,
  },
  { additionalProperties: false },
);
export type DeviceNewEnvelope = Static<typeof DeviceNewEnvelope>;

/**
 * Asks the Group's Members to remove and re-add a Device that missed a commit before it expired,
 * until a commit re-adds it (D24).
 */
export const ResyncEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("resync"),
    groupId: GroupId,
    username: Username,
    deviceId: DeviceId,
  },
  { additionalProperties: false },
);
export type ResyncEnvelope = Static<typeof ResyncEnvelope>;

/** Every prompt for a Member's app to change a Group. */
export const GroupPromptEnvelope = Type.Union([
  InviteAcceptedEnvelope,
  DeviceNewEnvelope,
  ResyncEnvelope,
]);
export type GroupPromptEnvelope = Static<typeof GroupPromptEnvelope>;
