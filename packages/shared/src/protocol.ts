import { Type } from "typebox";

/** The WebSocket protocol version; every Envelope carries it as `v` (06-message-formats). */
export const PROTOCOL_VERSION = 1;

/** The `v` field of every Envelope. */
export const ProtocolVersion = Type.Literal(PROTOCOL_VERSION);

/**
 * Chosen by the client for each request Envelope; the server's `reply` carries it back, so the
 * client can match answers to requests.
 */
export const RequestId = Type.String({ pattern: "^[A-Za-z0-9_-]{1,64}$" });

/** An MLS message, commit, welcome or proposal, opaque to the server: padded standard base64 (D30). */
export const MlsPayload = Type.String({
  minLength: 4,
  pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
});
