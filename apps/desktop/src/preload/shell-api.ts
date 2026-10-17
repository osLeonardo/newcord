/** Whether this Device's microphone is muted and its screen shared, as the window knows it. */
export interface CallMediaReport {
  readonly muted: boolean;
  readonly sharing: boolean;
}

/** The app around the screens: the tray, start at login and notifications (#10). */
export interface ShellApiCalls {
  /** True while start at login is on and the person has not dismissed the first screen's note (D46). */
  readStartupNotice(): Promise<boolean>;
  dismissStartupNotice(): Promise<void>;
  /** Keeps the tray's Mute or Unmute, and the notifications' privacy while sharing (D15), up to date. */
  reportCallMedia(report: CallMediaReport): Promise<void>;
}
