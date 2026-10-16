import {
  desktopApiChannels,
  desktopApiEventChannels,
  type DesktopApi,
  type LogInResult,
  type SessionState,
  type SignUpResult,
  type Unsubscribe,
} from "./desktop-api";

/** `ipcRenderer.invoke`, which stays inside the preload and never reaches the interface. */
export type IpcInvoke = (
  channel: string,
  ...args: unknown[]
) => Promise<unknown>;

/** Listens on an IPC channel, handing the listener only the message's payload, never the IPC event. */
export type IpcSubscribe = (
  channel: string,
  listener: (payload: unknown) => void,
) => Unsubscribe;

/**
 * Builds the desktop API on IPC calls, each passing its own arguments and nothing else; the main process checks them.
 * @example contextBridge.exposeInMainWorld("desktopApi", createDesktopApi(invoke, subscribe));
 */
export function createDesktopApi(
  invoke: IpcInvoke,
  subscribe: IpcSubscribe,
): DesktopApi {
  // The main process answers each channel, and sends each change, with the type its action returns.
  return {
    readSessionState: () =>
      invoke(desktopApiChannels.readSessionState) as Promise<SessionState>,
    signUp: (credentials) =>
      invoke(desktopApiChannels.signUp, credentials) as Promise<SignUpResult>,
    logIn: (credentials) =>
      invoke(desktopApiChannels.logIn, credentials) as Promise<LogInResult>,
    logOut: () => invoke(desktopApiChannels.logOut) as Promise<SessionState>,
    readOnlineAccounts: () =>
      invoke(desktopApiChannels.readOnlineAccounts) as Promise<
        readonly string[]
      >,
    onSessionChanged: (listener) =>
      subscribe(desktopApiEventChannels.onSessionChanged, (payload) =>
        listener(payload as SessionState),
      ),
    onOnlineAccountsChanged: (listener) =>
      subscribe(desktopApiEventChannels.onOnlineAccountsChanged, (payload) =>
        listener(payload as readonly string[]),
      ),
  };
}
