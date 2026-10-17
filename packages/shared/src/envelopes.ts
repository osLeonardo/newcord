import { Type, type Static } from "typebox";
import { Username } from "./accounts.js";
import { AccessToken } from "./sessions.js";

/** The WebSocket protocol version; every Envelope carries it as `v` (06-message-formats). */
export const PROTOCOL_VERSION = 1;

const ProtocolVersion = Type.Literal(PROTOCOL_VERSION);

/** The client's first Envelope, sent within 5 seconds: it authenticates the socket (08-m1-build step 5). */
export const HelloEnvelope = Type.Object(
  { v: ProtocolVersion, type: Type.Literal("hello"), accessToken: AccessToken },
  { additionalProperties: false },
);
export type HelloEnvelope = Static<typeof HelloEnvelope>;

/** Sent once after `hello`: every online Account, the socket's own included, sorted by username. */
export const PresenceSnapshotEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("presence"),
    kind: Type.Literal("snapshot"),
    usernames: Type.Array(Username),
  },
  { additionalProperties: false },
);
export type PresenceSnapshotEnvelope = Static<typeof PresenceSnapshotEnvelope>;

/** Sent when an Account's first Device connects (`online`) or its last one disconnects (`offline`). */
export const PresenceChangeEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("presence"),
    kind: Type.Union([Type.Literal("online"), Type.Literal("offline")]),
    username: Username,
  },
  { additionalProperties: false },
);
export type PresenceChangeEnvelope = Static<typeof PresenceChangeEnvelope>;

/** Every Envelope a client may send; M1 has only `hello`. */
export const ClientEnvelope = Type.Union([HelloEnvelope]);
export type ClientEnvelope = Static<typeof ClientEnvelope>;

/** Every Envelope the server sends; M1 has only presence, sent to every connected client. */
export const ServerEnvelope = Type.Union([
  PresenceSnapshotEnvelope,
  PresenceChangeEnvelope,
]);
export type ServerEnvelope = Static<typeof ServerEnvelope>;

/** Why the server closed a WebSocket, so the app can tell a logout from a network drop. */
export const WebSocketCloseCode = {
  /** No valid `hello` within 5 seconds, or its access token was refused: refresh and reconnect. */
  AuthenticationFailed: 4001,
  /** The Device's session ended (logout, reused refresh token, no usable refresh token): log in again. */
  SessionEnded: 4002,
  /** The standard Policy Violation code: an Envelope after `hello` broke the protocol. */
  EnvelopeRejected: 1008,
} as const;
export type WebSocketCloseCode =
  (typeof WebSocketCloseCode)[keyof typeof WebSocketCloseCode];
