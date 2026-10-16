import { Type, type Static } from "typebox";
import { Username } from "./accounts.js";
import { ProtocolVersion, RequestId } from "./protocol.js";

/**
 * A Group's ID: 16 random bytes chosen by the creator (09-m2-build Settings), in base64url
 * without padding. The last symbol's four low bits are unused, so only four symbols are canonical there.
 */
export const GroupId = Type.String({ pattern: "^[A-Za-z0-9_-]{21}[AQgw]$" });

/** A Group's name: 1 to 64 characters, readable by the server (09-m2-build Settings, D40). */
export const GroupName = Type.String({ minLength: 1, maxLength: 64 });

/** Creates a Group whose only Member is the sending Device, at epoch 0. */
export const GroupCreateEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("group.create"),
    requestId: RequestId,
    groupId: GroupId,
    name: GroupName,
  },
  { additionalProperties: false },
);
export type GroupCreateEnvelope = Static<typeof GroupCreateEnvelope>;

/** Renames a Group; any Member may (D12). */
export const GroupRenameEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("group.rename"),
    requestId: RequestId,
    groupId: GroupId,
    name: GroupName,
  },
  { additionalProperties: false },
);
export type GroupRenameEnvelope = Static<typeof GroupRenameEnvelope>;

/** Sent to the Group's other online Member Devices after a rename. */
export const GroupRenamedEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("group.renamed"),
    groupId: GroupId,
    name: GroupName,
    by: Username,
  },
  { additionalProperties: false },
);
export type GroupRenamedEnvelope = Static<typeof GroupRenamedEnvelope>;
