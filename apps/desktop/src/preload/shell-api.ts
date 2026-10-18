/** Whether this Device's microphone is muted and its screen shared, as the window knows it. */
export interface CallMediaReport {
  readonly muted: boolean;
  readonly sharing: boolean;
}

/** The app around the screens: the tray and notifications (#10). */
export interface ShellApiCalls {
  /** Keeps the tray's Mute or Unmute, and the notifications' privacy while sharing (D15), up to date. */
  reportCallMedia(report: CallMediaReport): Promise<void>;
  /** The Group open in the window, or null on other screens: its messages need no notification. */
  setViewedGroup(groupId: string | null): Promise<void>;
}
