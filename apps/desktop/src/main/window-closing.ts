import type { CloseDecision } from "./app-shell/app-closing";

/** The parts of a BrowserWindow that closing and showing again use. */
export interface HideableWindow {
  on(
    event: "close",
    listener: (event: { preventDefault(): void }) => void,
  ): void;
  hide(): void;
  show(): void;
  focus(): void;
  isMinimized(): boolean;
  restore(): void;
}

/** How closing the window is decided, and who hears that it hid. */
export interface CloseHandling {
  decide(): CloseDecision;
  hidden(): void;
}

/**
 * Makes closing the window hide it to the tray, so messages and Calls keep running (D42, D15b),
 * unless the decision is to close.
 * @example hideOnClose(mainWindow, { decide: () => closeDecision(state), hidden: noticeOnce });
 */
export function hideOnClose(
  window: HideableWindow,
  handling: CloseHandling,
): void {
  window.on("close", (event) => {
    if (handling.decide() === "close") return;
    event.preventDefault();
    window.hide();
    handling.hidden();
  });
}

/**
 * Brings a hidden or minimized window back, as when the app is launched again.
 * @example app.on("second-instance", () => showAgain(mainWindow));
 */
export function showAgain(window: HideableWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
