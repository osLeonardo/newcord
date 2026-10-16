import { Type, type Static } from "typebox";
import { ProtocolVersion, RequestId } from "./protocol.js";

/** Why the server refused a request Envelope that matched its schema but broke a rule. */
export const HubErrorCode = {
  /** The sender's Device is not a Member of the Group, or no such Group exists: the two look alike. */
  NotAMember: "NOT_A_MEMBER",
  GroupExists: "GROUP_EXISTS",
  /** No Account has the username, or the sender may not learn about it (D64). */
  AccountNotFound: "ACCOUNT_NOT_FOUND",
  CannotBlockSelf: "CANNOT_BLOCK_SELF",
  AlreadyAMember: "ALREADY_A_MEMBER",
  /** The Account already has a pending or accepted Invitation to the Group. */
  AlreadyInvited: "ALREADY_INVITED",
  /** The change would take the Group past 10 people, counting open Invitations (D17). */
  GroupFull: "GROUP_FULL",
  /** No pending Invitation with that ID is addressed to the sender's Account. */
  InvitationNotFound: "INVITATION_NOT_FOUND",
  RateLimited: "RATE_LIMITED",
} as const;
export type HubErrorCode = (typeof HubErrorCode)[keyof typeof HubErrorCode];

/** The answer to a request Envelope that was carried out. */
export const ReplyDoneEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("reply"),
    requestId: RequestId,
    ok: Type.Literal(true),
  },
  { additionalProperties: false },
);
export type ReplyDoneEnvelope = Static<typeof ReplyDoneEnvelope>;

/** The answer to a request Envelope the server refused. */
export const ReplyRefusedEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("reply"),
    requestId: RequestId,
    ok: Type.Literal(false),
    code: Type.Enum(Object.values(HubErrorCode)),
  },
  { additionalProperties: false },
);
export type ReplyRefusedEnvelope = Static<typeof ReplyRefusedEnvelope>;

/** Every answer to a request Envelope. */
export const ReplyEnvelope = Type.Union([
  ReplyDoneEnvelope,
  ReplyRefusedEnvelope,
]);
export type ReplyEnvelope = Static<typeof ReplyEnvelope>;
