import { Type, type Static } from "typebox";
import { Username } from "./accounts.js";
import { ProtocolVersion, RequestId } from "./protocol.js";

/** Blocks an Account: its Invitations are dropped without telling it (D57). */
export const BlockEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("block"),
    requestId: RequestId,
    username: Username,
  },
  { additionalProperties: false },
);
export type BlockEnvelope = Static<typeof BlockEnvelope>;

/** Removes a block. */
export const UnblockEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("unblock"),
    requestId: RequestId,
    username: Username,
  },
  { additionalProperties: false },
);
export type UnblockEnvelope = Static<typeof UnblockEnvelope>;

/**
 * Every Account the receiving Account blocks, sorted: sent after `hello` and whenever it changes,
 * so all of a person's Devices hide the same people (#6's spec).
 */
export const BlockListEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("blocks"),
    usernames: Type.Array(Username),
  },
  { additionalProperties: false },
);
export type BlockListEnvelope = Static<typeof BlockListEnvelope>;
