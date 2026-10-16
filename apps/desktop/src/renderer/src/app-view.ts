import type { Credentials, SessionState } from "../../preload/desktop-api";

/** A sign-up or login the person asked for, kept while the Account-switch warning is shown (D60). */
export interface AccountRequest {
  readonly kind: "sign-up" | "log-in";
  readonly credentials: Credentials;
}

/** The screen the window shows, chosen with plain React state from the session state (no router). */
export type AppView =
  | { readonly screen: "starting" }
  | { readonly screen: "start-failed" }
  | { readonly screen: "sign-up"; readonly storedUsername: string | null }
  | { readonly screen: "log-in"; readonly storedUsername: string | null }
  | {
      readonly screen: "recovery-code";
      readonly recoveryCode: string;
      readonly session: SessionState;
    }
  | {
      readonly screen: "account-switch";
      readonly storedUsername: string;
      readonly request: AccountRequest;
    }
  | { readonly screen: "home"; readonly username: string };

const RECOVERY_CODE_GROUP_LENGTH = 4;

/**
 * The screen for a session state: home while logged in, login once an Account is stored, sign-up before that.
 * @example viewForSessionState({ status: "logged-out", username: "alice" }) // { screen: "log-in", storedUsername: "alice" }
 */
export function viewForSessionState(session: SessionState): AppView {
  if (session.status === "logged-in") {
    return { screen: "home", username: session.username };
  }
  if (session.username === null) {
    return { screen: "sign-up", storedUsername: null };
  }
  return { screen: "log-in", storedUsername: session.username };
}

/**
 * Splits a Recovery code into the groups of four it is shown in.
 * @example recoveryCodeGroups("0123456789ABCDEFGHJKMNPQ") // ["0123", "4567", "89AB", "CDEF", "GHJK", "MNPQ"]
 */
export function recoveryCodeGroups(recoveryCode: string): string[] {
  const groupCount = Math.ceil(
    recoveryCode.length / RECOVERY_CODE_GROUP_LENGTH,
  );
  return Array.from({ length: groupCount }, (_, group) =>
    recoveryCode.slice(
      group * RECOVERY_CODE_GROUP_LENGTH,
      (group + 1) * RECOVERY_CODE_GROUP_LENGTH,
    ),
  );
}
