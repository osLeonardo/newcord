import {
  desktopApiChannels,
  type DesktopApi,
  type LogInResult,
  type SessionState,
  type SignUpResult,
} from "./desktop-api";

/** `ipcRenderer.invoke`, which stays inside the preload and never reaches the interface. */
export type IpcInvoke = (
  channel: string,
  ...args: unknown[]
) => Promise<unknown>;

/**
 * Builds the desktop API on IPC calls, each passing its own arguments and nothing else; the main process checks them.
 * @example contextBridge.exposeInMainWorld("desktopApi", createDesktopApi((channel, ...args) => ipcRenderer.invoke(channel, ...args)));
 */
export function createDesktopApi(invoke: IpcInvoke): DesktopApi {
  // The main process answers each channel with the type its action returns.
  return {
    readSessionState: () =>
      invoke(desktopApiChannels.readSessionState) as Promise<SessionState>,
    signUp: (credentials) =>
      invoke(desktopApiChannels.signUp, credentials) as Promise<SignUpResult>,
    logIn: (credentials) =>
      invoke(desktopApiChannels.logIn, credentials) as Promise<LogInResult>,
    logOut: () => invoke(desktopApiChannels.logOut) as Promise<SessionState>,
  };
}
