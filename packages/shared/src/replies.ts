import { Type, type Static } from "typebox";
import { DeviceKeyPackage } from "./key-packages.js";
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
  /**
   * `keypackage.get` named an Account with no reason to be added: no accepted Invitation to the
   * Group, and no Device of a Member Account missing from it.
   */
  NothingToAdd: "NOTHING_TO_ADD",
  /** Another commit already moved the Group past the commit's epoch: process it, then retry if still needed. */
  WrongEpoch: "WRONG_EPOCH",
  /**
   * The declared change breaks a rule: it adds a Device with no reason to join or already in the
   * Group, removes one not in it, or brings no welcome for the Devices it adds (or one for nobody).
   */
  InvalidChange: "INVALID_CHANGE",
} as const;
export type HubErrorCode = (typeof HubErrorCode)[keyof typeof HubErrorCode];

/** The answer to a request Envelope that was carried out, with the results some requests return. */
export const ReplyDoneEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("reply"),
    requestId: RequestId,
    ok: Type.Literal(true),
    /** `keypackage.get`: one Key package per Device that may be added. */
    keyPackages: Type.Optional(Type.Array(DeviceKeyPackage)),
    /** `mls.commit` and `mls.message`: the sequence number the server gave it. */
    seq: Type.Optional(Type.Integer({ minimum: 1 })),
    /** `mls.commit`: the Group's epoch after it. */
    epoch: Type.Optional(Type.Integer({ minimum: 0 })),
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
