import { Type, type Static } from "typebox";
import { Username } from "./accounts.js";
import { GroupId, GroupName } from "./groups.js";
import { ProtocolVersion, RequestId } from "./protocol.js";

/** An Invitation's ID, created by the server: 16 random bytes in base64url. */
export const InvitationId = Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" });

/** Invites an Account to a Group by username (D13). */
export const InviteEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("invite"),
    requestId: RequestId,
    groupId: GroupId,
    username: Username,
  },
  { additionalProperties: false },
);
export type InviteEnvelope = Static<typeof InviteEnvelope>;

/** The invitee accepts or declines an Invitation. */
export const InviteReplyEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("invite.reply"),
    requestId: RequestId,
    invitationId: InvitationId,
    accept: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type InviteReplyEnvelope = Static<typeof InviteReplyEnvelope>;

/** A pending Invitation, sent to the invitee at once or after its next `hello`. */
export const InvitationEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("invitation"),
    invitationId: InvitationId,
    groupId: GroupId,
    groupName: GroupName,
    from: Username,
  },
  { additionalProperties: false },
);
export type InvitationEnvelope = Static<typeof InvitationEnvelope>;
