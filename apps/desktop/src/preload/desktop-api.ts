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

/**
 * Why a sign-up or login did not happen: the server's error code, the server being out of reach or
 * answering outside its contract, or this installation already belonging to another Account (D60).
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

/** The named functions the preload gives the interface as `window.desktopApi`; keys and tokens never cross it. */
export interface DesktopApi {
  readSessionState(): Promise<SessionState>;
  signUp(credentials: Credentials): Promise<SignUpResult>;
  logIn(credentials: Credentials): Promise<LogInResult>;
  /** Ends the session on the server and on this Device; resolves logged out even when the server is out of reach. */
  logOut(): Promise<SessionState>;
}

/** The IPC channel behind each function of the desktop API. */
export const desktopApiChannels = {
  readSessionState: "session:read-state",
  signUp: "account:sign-up",
  logIn: "account:log-in",
  logOut: "session:log-out",
} as const satisfies Record<keyof DesktopApi, string>;
