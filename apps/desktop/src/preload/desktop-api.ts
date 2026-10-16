import type { ApiErrorCode } from "@newcord/shared";

/** A username and password as typed on the sign-up or login screen. */
export interface Credentials {
  readonly username: string;
  readonly password: string;
}

/** Whether this installation is logged in, and the Account it belongs to; null before its first sign-up or login. */
export type SessionState =
  | { readonly status: "logged-in"; readonly username: string }
  | { readonly status: "logged-out"; readonly username: string | null };

/** Whether the person confirmed the warning that entering another Account erases this app's local data (D60). */
export interface AccountSwitchChoice {
  readonly switchAccount: boolean;
}

/**
 * Why a sign-up or login did not happen: the server's error code, the server being out of reach or
 * answering outside its contract, or this installation belonging to another Account while the
 * switch was not confirmed (D60).
 */
export type AccountRefusal =
  | ApiErrorCode
  | "SERVER_UNREACHABLE"
  | "UNEXPECTED_RESPONSE"
  | "ANOTHER_ACCOUNT_STORED";

/** A sign-up's outcome; the Recovery code is shown once and stored nowhere (D55). */
export type SignUpResult =
  | {
      readonly outcome: "signed-up";
      readonly recoveryCode: string;
      readonly session: SessionState;
    }
  | { readonly outcome: "refused"; readonly refusal: AccountRefusal };

export type LogInResult =
  | { readonly outcome: "logged-in"; readonly session: SessionState }
  | { readonly outcome: "refused"; readonly refusal: AccountRefusal };

/** Stops a listener from hearing any more changes. */
export type Unsubscribe = () => void;

/** The desktop API's calls into the main process, each checked there for its sender and arguments. */
export interface DesktopApiCalls {
  readSessionState(): Promise<SessionState>;
  signUp(
    credentials: Credentials,
    choice: AccountSwitchChoice,
  ): Promise<SignUpResult>;
  logIn(
    credentials: Credentials,
    choice: AccountSwitchChoice,
  ): Promise<LogInResult>;
  /** Ends the session on the server and on this Device; resolves logged out even when the server is out of reach. */
  logOut(): Promise<SessionState>;
  /** The other Accounts online now, sorted by username; empty while logged out or disconnected. */
  readOnlineAccounts(): Promise<readonly string[]>;
}

/** The changes the main process tells the interface about. */
export interface DesktopApiSubscriptions {
  /** Hears the session state whenever the server ends the session (D62, D66). */
  onSessionChanged(listener: (session: SessionState) => void): Unsubscribe;
  onOnlineAccountsChanged(
    listener: (usernames: readonly string[]) => void,
  ): Unsubscribe;
}

/** The named functions the preload gives the interface as `window.desktopApi`; keys and tokens never cross it. */
export interface DesktopApi extends DesktopApiCalls, DesktopApiSubscriptions {}

/** The IPC channel behind each call of the desktop API. */
export const desktopApiChannels = {
  readSessionState: "session:read-state",
  signUp: "account:sign-up",
  logIn: "account:log-in",
  logOut: "session:log-out",
  readOnlineAccounts: "presence:read-online",
} as const satisfies Record<keyof DesktopApiCalls, string>;

/** The IPC channel the main process sends each change on. */
export const desktopApiEventChannels = {
  onSessionChanged: "session:changed",
  onOnlineAccountsChanged: "presence:changed",
} as const satisfies Record<keyof DesktopApiSubscriptions, string>;
