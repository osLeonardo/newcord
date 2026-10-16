import { Type, type Static } from "typebox";
import { DeviceId, Username } from "./accounts.js";
import { GROUP_PEOPLE_LIMIT, GroupId, GroupName } from "./groups.js";
import { MlsPayload, ProtocolVersion, RequestId } from "./protocol.js";

/** A Group's position in its list of messages, from 1; every MLS message and commit gets the next one. */
export const SequenceNumber = Type.Integer({ minimum: 1 });

/** An MLS epoch: 0 when the Group is created, one more after each accepted commit. */
export const Epoch = Type.Integer({ minimum: 0 });

/** The Devices a commit may name: everyone in a full Group with two Devices each, with room to spare. */
const DeclaredDevices = Type.Array(DeviceId, {
  maxItems: GROUP_PEOPLE_LIMIT * 4,
  uniqueItems: true,
});

/**
 * A commit made in `epoch`, with the change its sender declares (D41). The welcome for the Devices
 * it adds travels with it, so the server queues the welcome right after an accepted commit, and
 * never after a refused one.
 */
export const MlsCommitEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("mls.commit"),
    requestId: RequestId,
    groupId: GroupId,
    epoch: Epoch,
    added: DeclaredDevices,
    removed: DeclaredDevices,
    commit: MlsPayload,
    welcome: Type.Optional(MlsPayload),
  },
  { additionalProperties: false },
);
export type MlsCommitEnvelope = Static<typeof MlsCommitEnvelope>;

/** An MLS application message for every other Member Device. */
export const MlsMessageEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("mls.message"),
    requestId: RequestId,
    groupId: GroupId,
    message: MlsPayload,
  },
  { additionalProperties: false },
);
export type MlsMessageEnvelope = Static<typeof MlsMessageEnvelope>;

/**
 * A Member's request to leave: an MLS proposal removing its own Device. The server stops delivering
 * the Group to that Account at once and queues the request for the others, so the next one online
 * commits the removal (D57).
 */
export const MlsProposalEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("mls.proposal"),
    requestId: RequestId,
    groupId: GroupId,
    proposal: MlsPayload,
  },
  { additionalProperties: false },
);
export type MlsProposalEnvelope = Static<typeof MlsProposalEnvelope>;

/** Confirms a delivery, so the server deletes this Device's copy (D9). */
export const AckEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("ack"),
    groupId: GroupId,
    seq: SequenceNumber,
  },
  { additionalProperties: false },
);
export type AckEnvelope = Static<typeof AckEnvelope>;

/** Who sent a delivered message, as the server knows it. */
export const MessageSender = Type.Object(
  { username: Username, deviceId: DeviceId },
  { additionalProperties: false },
);
export type MessageSender = Static<typeof MessageSender>;

const deliveryFields = {
  v: ProtocolVersion,
  groupId: GroupId,
  seq: SequenceNumber,
  sender: MessageSender,
};

/** A queued commit, with the change its sender declared, for every Device that was a Member before it. */
export const MlsCommitDeliveryEnvelope = Type.Object(
  {
    ...deliveryFields,
    type: Type.Literal("mls.commit"),
    epoch: Epoch,
    added: Type.Array(DeviceId),
    removed: Type.Array(DeviceId),
    commit: MlsPayload,
  },
  { additionalProperties: false },
);
export type MlsCommitDeliveryEnvelope = Static<
  typeof MlsCommitDeliveryEnvelope
>;

/** A queued welcome for a Device a commit added, with the Group's name, which MLS does not carry (D40). */
export const MlsWelcomeDeliveryEnvelope = Type.Object(
  {
    ...deliveryFields,
    type: Type.Literal("mls.welcome"),
    groupName: GroupName,
    welcome: MlsPayload,
  },
  { additionalProperties: false },
);
export type MlsWelcomeDeliveryEnvelope = Static<
  typeof MlsWelcomeDeliveryEnvelope
>;

/** A queued leave request, for the Group's other Members. */
export const MlsProposalDeliveryEnvelope = Type.Object(
  {
    ...deliveryFields,
    type: Type.Literal("mls.proposal"),
    proposal: MlsPayload,
  },
  { additionalProperties: false },
);
export type MlsProposalDeliveryEnvelope = Static<
  typeof MlsProposalDeliveryEnvelope
>;

/** A queued MLS application message. */
export const MlsMessageDeliveryEnvelope = Type.Object(
  {
    ...deliveryFields,
    type: Type.Literal("mls.message"),
    message: MlsPayload,
  },
  { additionalProperties: false },
);
export type MlsMessageDeliveryEnvelope = Static<
  typeof MlsMessageDeliveryEnvelope
>;
