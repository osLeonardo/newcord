import type { CallSummary } from "../../preload/call-api";
import type { DeviceSettings } from "../../preload/settings-api";
import type { CallMediaReport, ShellApiCalls } from "../../preload/shell-api";
import { isInView, type ViewState } from "./message-notices";

/** What the Electron shell (tray, login items, notifications) hears from the services. */
export interface AppShellEvents {
  callChanged(call: CallSummary): void;
  callMediaChanged(report: CallMediaReport): void;
  settingsChanged(settings: DeviceSettings): void;
}

export interface ShellActionsDependencies {
  readonly shell: AppShellEvents | undefined;
  readonly view: ViewState;
  /** A Group came into view: its unread count and notification go. */
  readonly groupViewed: (groupId: string) => void;
}

/**
 * The window's shell functions: the mute and sharing state the tray and notifications follow, and
 * which Group the window shows.
 * @example const shellActions = createShellActions({ shell, view, groupViewed });
 */
export function createShellActions(
  dependencies: ShellActionsDependencies,
): ShellApiCalls {
  const { view } = dependencies;
  return {
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
