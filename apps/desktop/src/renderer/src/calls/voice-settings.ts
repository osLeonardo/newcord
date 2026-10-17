import type { CallSettings } from "../../../preload/call-api";

/** The keys of a press, as a `KeyboardEvent` gives them. */
export interface KeyPress {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * The Electron accelerator for a mute hotkey, or undefined when the press cannot be one. Ctrl or
 * Alt is required, so the shortcut never takes a key away from typing in other apps.
 * @example acceleratorOf({ code: "KeyM", ctrlKey: true, altKey: false, shiftKey: true }) // "Ctrl+Shift+M"
 */
export function acceleratorOf(press: KeyPress): string | undefined {
  const key = acceleratorKey(press.code);
  if (key === undefined || !(press.ctrlKey || press.altKey)) return undefined;
  return [
    ...(press.ctrlKey ? ["Ctrl"] : []),
    ...(press.altKey ? ["Alt"] : []),
    ...(press.shiftKey ? ["Shift"] : []),
    key,
  ].join("+");
}

function acceleratorKey(code: string): string | undefined {
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter !== undefined) return letter;
  const digit = /^Digit([0-9])$/.exec(code)?.[1];
  if (digit !== undefined) return digit;
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(code) ? code : undefined;
}

/**
 * A key code as people read it.
 * @example keyLabel("KeyV") // "V"
 */
export function keyLabel(code: string): string {
  const short = /^(?:Key|Digit)(.)$/.exec(code)?.[1];
  if (short !== undefined) return short;
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** What decides whether the microphone sends right now. */
export interface MicrophoneInputs {
  readonly mode: CallSettings["microphoneMode"];
  readonly voiceDetected: boolean;
  readonly pushToTalkHeld: boolean;
  readonly muted: boolean;
}

/**
 * Whether the microphone's track is on: never while muted, otherwise by voice activity or while the
 * push-to-talk key is held (D44).
 * @example microphoneOpen({ mode: "push-to-talk", voiceDetected: true, pushToTalkHeld: false, muted: false }) // false
 */
export function microphoneOpen(inputs: MicrophoneInputs): boolean {
  if (inputs.muted) return false;
  return inputs.mode === "push-to-talk"
    ? inputs.pushToTalkHeld
    : inputs.voiceDetected;
}

/** The codecs a screen share can prefer (D11b), as the settings show them. */
export const SHARE_CODEC_LABELS: Readonly<
  Record<CallSettings["codec"], string>
> = {
  H264: "H.264",
  VP8: "VP8",
  VP9: "VP9",
};
