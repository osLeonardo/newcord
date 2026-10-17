import type { CallSummary } from "../../preload/call-api";
import type { DeviceSettings } from "../../preload/settings-api";
import type { CallMediaReport, ShellApiCalls } from "../../preload/shell-api";
import type { AppFlags } from "../local-store/app-flags";
import type { SettingsStore } from "../local-store/device-settings";

/** What the Electron shell (tray, login items, notifications) hears from the services. */
export interface AppShellEvents {
  callChanged(call: CallSummary): void;
  callMediaChanged(report: CallMediaReport): void;
  settingsChanged(settings: DeviceSettings): void;
}

/**
 * The window's shell functions: the first screen's note about starting with Windows (D46), and
 * the mute and sharing state the tray and notifications follow.
 * @example const shellActions = createShellActions({ flags, settings, shell });
 */
export function createShellActions(dependencies: {
  readonly flags: AppFlags;
  readonly settings: SettingsStore;
  readonly shell: AppShellEvents | undefined;
}): ShellApiCalls {
  const { flags, settings } = dependencies;
  return {
    readStartupNotice: () =>
      Promise.resolve(
        settings.read().startAtLogin && !flags.has("startup-notice-dismissed"),
      ),
    dismissStartupNotice: (): Promise<void> => {
      flags.set("startup-notice-dismissed");
      return Promise.resolve();
    },
    reportCallMedia: (report): Promise<void> => {
      dependencies.shell?.callMediaChanged(report);
      return Promise.resolve();
    },
  };
}
