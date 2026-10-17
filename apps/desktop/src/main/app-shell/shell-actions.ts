import type { CallSummary } from "../../preload/call-api";
import type { DeviceSettings } from "../../preload/settings-api";
import type { CallMediaReport, ShellApiCalls } from "../../preload/shell-api";
import type { AppFlags } from "../local-store/app-flags";
import type { SettingsStore } from "../local-store/device-settings";
import { isInView, type ViewState } from "./message-notices";

/** What the Electron shell (tray, login items, notifications) hears from the services. */
export interface AppShellEvents {
  callChanged(call: CallSummary): void;
  callMediaChanged(report: CallMediaReport): void;
  settingsChanged(settings: DeviceSettings): void;
}

export interface ShellActionsDependencies {
  readonly flags: AppFlags;
  readonly settings: SettingsStore;
  readonly shell: AppShellEvents | undefined;
  readonly view: ViewState;
  /** A Group came into view: its unread count and notification go. */
  readonly groupViewed: (groupId: string) => void;
}

/**
 * The window's shell functions: the first screen's note about starting with Windows (D46), the mute
 * and sharing state the tray and notifications follow, and which Group the window shows.
 * @example const shellActions = createShellActions({ flags, settings, shell, view, groupViewed });
 */
export function createShellActions(
  dependencies: ShellActionsDependencies,
): ShellApiCalls {
  const { flags, settings, view } = dependencies;
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
      view.sharing = report.sharing;
      dependencies.shell?.callMediaChanged(report);
      return Promise.resolve();
    },
    setViewedGroup: (groupId): Promise<void> => {
      view.viewedGroup = groupId ?? undefined;
      if (groupId !== null && isInView(view, groupId)) {
        dependencies.groupViewed(groupId);
      }
      return Promise.resolve();
    },
  };
}
