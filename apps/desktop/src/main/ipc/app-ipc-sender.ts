import { isSameAppPage } from "../app-page";
import type { IpcInvocation } from "./checked-ipc-handler";

export interface AppWindowIdentity {
  readonly pageUrl: string;
  isAppWebContents(webContentsId: number): boolean;
}

/**
 * Whether an IPC call comes from the main frame of one of the app's own windows, showing the app's page.
 * @example isAppIpcSender(invocation, { pageUrl, isAppWebContents: (id) => appWebContentsIds.has(id) })
 */
export function isAppIpcSender(
  invocation: IpcInvocation,
  appWindow: AppWindowIdentity,
): boolean {
  const frame = invocation.senderFrame;
  if (frame === null || frame.parent !== null) return false;
  if (!appWindow.isAppWebContents(invocation.sender.id)) return false;
  return isSameAppPage(frame.url, appWindow.pageUrl);
}
