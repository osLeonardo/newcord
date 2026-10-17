import { autoUpdater } from "electron-updater";
import type { UpdateSource } from "./update-service";

/**
 * electron-updater on the GitHub Releases named in `electron-builder.yml` (D48, D49): it downloads
 * in the background and installs when the app next quits (12-m5-build step 6).
 * @example const source = createElectronUpdateSource((error) => console.error(error));
 */
export function createElectronUpdateSource(
  reportError: (error: unknown) => void,
): UpdateSource {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Every failure, of a check or a download, arrives here; without a listener it would throw.
  autoUpdater.on("error", reportError);
  return {
    check: (): Promise<void> =>
      autoUpdater.checkForUpdates().then(
        () => undefined,
        () => undefined,
      ),
    onDownloaded: (listener): void => {
      autoUpdater.on("update-downloaded", () => {
        listener();
      });
    },
    restartAndInstall: (): void => {
      // Silently, and the app opens again once the update is installed.
      autoUpdater.quitAndInstall(true, true);
    },
  };
}
