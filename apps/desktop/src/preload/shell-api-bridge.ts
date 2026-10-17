import type { IpcInvoke, IpcSubscribe } from "./desktop-api-bridge";
import {
  desktopApiChannels,
  desktopApiEventChannels,
  type DesktopApi,
} from "./desktop-api";
import type { ShellApiCalls } from "./shell-api";

/**
 * The desktop API's shell functions on IPC, each passing its own arguments and nothing else.
 * @example const shell = createShellApi(invoke, subscribe);
 */
export function createShellApi(
  invoke: IpcInvoke,
  subscribe: IpcSubscribe,
): ShellApiCalls & Pick<DesktopApi, "onOpenGroup"> {
  return {
    setViewedGroup: (groupId) =>
      invoke(desktopApiChannels.setViewedGroup, groupId) as Promise<void>,
    onOpenGroup: (listener) =>
      subscribe(desktopApiEventChannels.onOpenGroup, (payload) => {
        if (typeof payload === "string") listener(payload);
      }),
    readStartupNotice: () =>
      invoke(desktopApiChannels.readStartupNotice) as Promise<boolean>,
    dismissStartupNotice: () =>
      invoke(desktopApiChannels.dismissStartupNotice) as Promise<void>,
    reportCallMedia: (report) =>
      invoke(desktopApiChannels.reportCallMedia, report) as Promise<void>,
  };
}
