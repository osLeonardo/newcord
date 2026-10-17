import { Type, type Static } from "typebox";
import { DeviceId } from "./accounts.js";

/** The most Participants in a Call; a seventh person sees "call full" (D2, 10-m3-build Settings). */
export const CALL_PARTICIPANT_LIMIT = 6;

/** A Call message older than this, by its sender's clock, is ignored (#9's spec). */
export const CALL_MESSAGE_MAX_AGE_MS = 60_000;

/**
 * The longest session description, in characters. A Chromium offer with audio, video and every
 * codec stays well under it, and the encrypted message stays under the 64 KiB Envelope limit.
 */
export const CALL_SDP_MAX_LENGTH = 20_000;

/** The sender's clock when the message was made, in milliseconds; only used to drop stale ones. */
const SentAt = Type.Integer({ minimum: 0 });

/** Joins the Group's Call; Members' apps learn who is in it, the server never does (D18). */
export const CallJoinPayload = Type.Object(
  { type: Type.Literal("call.join"), sentAt: SentAt },
  { additionalProperties: false },
);
export type CallJoinPayload = Static<typeof CallJoinPayload>;

export const CallLeavePayload = Type.Object(
  { type: Type.Literal("call.leave"), sentAt: SentAt },
  { additionalProperties: false },
);
export type CallLeavePayload = Static<typeof CallLeavePayload>;

/** A WebRTC offer or answer; its fingerprint protects the media (D18). */
export const CallDescription = Type.Object(
  {
    kind: Type.Literal("description"),
    type: Type.Union([Type.Literal("offer"), Type.Literal("answer")]),
    sdp: Type.String({ maxLength: CALL_SDP_MAX_LENGTH }),
  },
  { additionalProperties: false },
);
export type CallDescription = Static<typeof CallDescription>;

/** A network candidate, as `RTCIceCandidate.toJSON()` gives it. */
export const CallCandidate = Type.Object(
  {
    kind: Type.Literal("candidate"),
    candidate: Type.String({ maxLength: 1024 }),
    sdpMid: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
    sdpMLineIndex: Type.Union([
      Type.Integer({ minimum: 0, maximum: 255 }),
      Type.Null(),
    ]),
    usernameFragment: Type.Optional(
      Type.Union([Type.String({ maxLength: 256 }), Type.Null()]),
    ),
  },
  { additionalProperties: false },
);
export type CallCandidate = Static<typeof CallCandidate>;

export const CallSignal = Type.Union([CallDescription, CallCandidate]);
export type CallSignal = Static<typeof CallSignal>;

/** A signal for one Participant's Device: every Device receives it, only `to` acts on it (D18). */
export const CallSignalPayload = Type.Object(
  {
    type: Type.Literal("call.signal"),
    to: DeviceId,
    signal: CallSignal,
    sentAt: SentAt,
  },
  { additionalProperties: false },
);
export type CallSignalPayload = Static<typeof CallSignalPayload>;

export const CallPayload = Type.Union([
  CallJoinPayload,
  CallLeavePayload,
  CallSignalPayload,
]);
export type CallPayload = Static<typeof CallPayload>;

/**
 * Whether a Call message is too old to act on, so a Device back from offline ignores old offers.
 * A sender's clock ahead of this one's does not make a message stale.
 * @example isStaleCallMessage(sentAt, Date.now()) // false within the last 60 seconds
 */
export function isStaleCallMessage(sentAt: number, now: number): boolean {
  return now - sentAt > CALL_MESSAGE_MAX_AGE_MS;
}
