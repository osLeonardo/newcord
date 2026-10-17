import { APP_NAME } from "@newcord/shared";
import type { PreviewMode } from "../../preload/settings-api";

/** The longest message text a full preview shows. */
const PREVIEW_MAX_LENGTH = 200;

/** A Chat message that arrived in a Group nobody is looking at. */
export interface ArrivedMessage {
  readonly groupId: string;
  readonly groupName: string;
  readonly sender: string;
  readonly text: string;
}

export interface NoticeContent {
  readonly title: string;
  readonly body: string;
}

/**
 * The notification's text: the full message, its sender only, or nothing but "New message" (D15).
 * Always generic while a screen share runs, so viewers never see a message (D15).
 * @example noticeContent("sender", false, message) // { title: "friends", body: "New message from bruno" }
 */
export function noticeContent(
  mode: PreviewMode,
  sharing: boolean,
  message: ArrivedMessage,
): NoticeContent {
  const shown = sharing ? "generic" : mode;
  switch (shown) {
    case "full":
      return {
        title: message.groupName,
        body: `${message.sender}: ${shortened(message.text)}`,
      };
    case "sender":
      return {
        title: message.groupName,
        body: `New message from ${message.sender}`,
      };
    case "generic":
      return { title: APP_NAME, body: "New message" };
  }
}

function shortened(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= PREVIEW_MAX_LENGTH
    ? oneLine
    : `${oneLine.slice(0, PREVIEW_MAX_LENGTH - 1)}…`;
}

/** Windows notifications, one per Group: a new one replaces the Group's last (11-m4-build Settings). */
export interface NotificationPort {
  show(groupId: string, content: NoticeContent): void;
  close(groupId: string): void;
}

/** What the Device's window shows, as the main process knows it. */
export interface ViewState {
  /** The Group open in the window, or undefined on other screens. */
  viewedGroup?: string;
  /** Whether the window is shown and has the focus. */
  windowFocused: boolean;
  /** Whether this Device is sharing its screen (D15). */
  sharing: boolean;
}

/**
 * Whether a Group's chat is open and focused: its messages need no notification and no unread count.
 * @example isInView(view, groupId)
 */
export function isInView(view: ViewState, groupId: string): boolean {
  return view.windowFocused && view.viewedGroup === groupId;
}
