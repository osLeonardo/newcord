import type { AppFlags } from "../local-store/app-flags";

/** The argument Windows starts the app with at login, so it opens hidden in the tray (11-m4-build step 4). */
export const HIDDEN_START_ARGUMENT = "--hidden";

/**
 * Whether this start should leave the window hidden in the tray.
 * @example startsHidden(process.argv)
 */
export function startsHidden(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_START_ARGUMENT);
}

/** What closing the window does. */
export type CloseDecision = "hide" | "close";

/**
 * Closing hides the window to the tray unless the person chose quit-on-close (D15b); while the app
 * quits, the window always closes.
 * @example closeDecision({ quitting: false, quitOnClose: false }) // "hide"
 */
export function closeDecision(state: {
  readonly quitting: boolean;
  readonly quitOnClose: boolean;
}): CloseDecision {
  return state.quitting || state.quitOnClose ? "close" : "hide";
}

/**
 * True the first time the window hides, and never again: the one-time notice that the app is still
 * running (D47).
 * @example if (firstHide(flags)) showStillRunningNotice();
 */
export function firstHide(flags: AppFlags): boolean {
  if (flags.has("close-notice-shown")) return false;
  flags.set("close-notice-shown");
  return true;
}

/** Windows' login items, as `app.setLoginItemSettings` sets them. */
export interface LoginItems {
  set(openAtLogin: boolean): void;
}

/**
 * On the first run, turns start at login on, opening hidden in the tray (D46). Later runs leave
 * the person's choice alone. Answers whether this was the first run.
 * @example setUpFirstRun(flags, loginItems)
 */
export function setUpFirstRun(
  flags: AppFlags,
  loginItems: LoginItems,
): boolean {
  if (flags.has("first-run-done")) return false;
  loginItems.set(true);
  flags.set("first-run-done");
  return true;
}
