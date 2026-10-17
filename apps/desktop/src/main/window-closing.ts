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

/**
 * Makes closing the window hide it, so a Call keeps running (D42); quitting the app still closes it.
 * The quit-on-close setting (D15b) and the tray arrive in M4 (#10).
 * @example hideOnClose(mainWindow, () => quitting);
 */
export function hideOnClose(
  window: HideableWindow,
  isQuitting: () => boolean,
): void {
  window.on("close", (event) => {
    if (isQuitting()) return;
    event.preventDefault();
    window.hide();
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
