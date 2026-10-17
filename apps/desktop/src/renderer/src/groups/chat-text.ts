import { CHAT_TEXT_MAX_LENGTH } from "@newcord/shared";
import { groupRefusalMessage } from "./group-text";

/**
 * Why a Chat message cannot be sent, or undefined when it can. Whitespace alone counts as empty.
 * Lengths count characters, as the shared schema does.
 * @example chatTextProblem("   ") // "Messages have 1 to 4,000 characters."
 */
export function chatTextProblem(text: string): string | undefined {
  const length = Array.from(text).length;
  if (text.trim() === "" || length > CHAT_TEXT_MAX_LENGTH) {
    return groupRefusalMessage("INVALID_TEXT");
  }
  return undefined;
}

/** What the composer needs to know about a key press. */
export interface ComposerKey {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}

/**
 * Whether a key press sends the message: Enter alone sends, Shift+Enter starts a new line, and
 * Enter while an input method is composing a character does neither.
 * @example isSendKey({ key: "Enter", shiftKey: false, isComposing: false }) // true
 */
export function isSendKey(press: ComposerKey): boolean {
  return press.key === "Enter" && !press.shiftKey && !press.isComposing;
}

/**
 * The label a message is shown with: the sender's time of day, with the date when it was not today.
 * @example messageTimeLabel(sentAt, Date.now(), "en-GB") // "14:05"
 */
export function messageTimeLabel(
  sentAt: number,
  now: number,
  locale?: string,
): string {
  const sent = new Date(sentAt);
  const sameDay = sent.toDateString() === new Date(now).toDateString();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(sent);
  if (sameDay) return time;
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    sent,
  );
  return `${day} ${time}`;
}
