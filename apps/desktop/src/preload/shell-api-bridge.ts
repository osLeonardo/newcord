import type { IpcInvoke } from "./desktop-api-bridge";
import { desktopApiChannels } from "./desktop-api";
import type { ShellApiCalls } from "./shell-api";

/**
 * The desktop API's shell functions on IPC, each passing its own arguments and nothing else.
 * @example const shell = createShellApi(invoke);
 */
export function createShellApi(invoke: IpcInvoke): ShellApiCalls {
  return {
    readStartupNotice: () =>
      invoke(desktopApiChannels.readStartupNotice) as Promise<boolean>,
    dismissStartupNotice: () =>
      invoke(desktopApiChannels.dismissStartupNotice) as Promise<void>,
    reportCallMedia: (report) =>
      invoke(desktopApiChannels.reportCallMedia, report) as Promise<void>,
  };
}
