import type { ShareCodec } from "../../../preload/settings-api";

/** Each viewer's share is capped at 4 Mbps (D103, 10-m3-build Settings). */
export const SCREEN_SHARE_MAX_BITRATE = 4_000_000;

/** Up to 1080p at 30 frames per second (10-m3-build Settings). */
export const SCREEN_SHARE_MAX_FRAMERATE = 30;
export const SCREEN_SHARE_MAX_WIDTH = 1920;
export const SCREEN_SHARE_MAX_HEIGHT = 1080;

const MIME_TYPES: ReadonlyMap<ShareCodec, string> = new Map([
  ["H264", "video/h264"],
  ["VP8", "video/vp8"],
  ["VP9", "video/vp9"],
]);

/**
 * The codecs in the order a share prefers them: the chosen one first, every other one kept after
 * it, so a viewer who cannot decode the first still sees the share (D11b, 10-m3-build step 8).
 * @example preferCodec(RTCRtpReceiver.getCapabilities("video").codecs, "VP9")
 */
export function preferCodec<Codec extends { readonly mimeType: string }>(
  codecs: readonly Codec[],
  codec: ShareCodec,
): Codec[] {
  const wanted = MIME_TYPES.get(codec);
  const first = codecs.filter(
    (entry) => entry.mimeType.toLowerCase() === wanted,
  );
  return [...first, ...codecs.filter((entry) => !first.includes(entry))];
}

/** What a share mostly shows, picked with each share: text and code, or video and games (D103). */
export type ShareMode = "text" | "motion";

/**
 * The content hint WebRTC adapts a share with when bandwidth or CPU runs short: "detail" drops
 * frame rate first, so text stays sharp; "motion" drops resolution first, so movement stays smooth.
 * @example shareContentHint("motion") // "motion"
 */
export function shareContentHint(mode: ShareMode): "detail" | "motion" {
  return mode === "text" ? "detail" : "motion";
}

/** The encoding a screen share sends to each viewer. */
export interface ShareEncoding {
  readonly maxBitrate: number;
  readonly maxFramerate: number;
}

/**
 * The encoding every screen-share sender starts with: at most 4 Mbps and 30 frames per second.
 * @example connection.addTransceiver(track, { sendEncodings: [screenShareEncoding()] })
 */
export function screenShareEncoding(): ShareEncoding {
  return {
    maxBitrate: SCREEN_SHARE_MAX_BITRATE,
    maxFramerate: SCREEN_SHARE_MAX_FRAMERATE,
  };
}
