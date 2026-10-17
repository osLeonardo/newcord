import type { AccountRefusal } from "../../../preload/desktop-api";
import {
  passwordLimits,
  usernameLimits,
  type InputProblem,
} from "./credentials-check";

/** Shown when the main process fails in a way the screens cannot explain. */
export const UNEXPECTED_FAILURE_MESSAGE =
  "Something went wrong. Try again, or restart the app.";

const refusalMessages: ReadonlyMap<string, string> = new Map(
  Object.entries({
    ANOTHER_ACCOUNT_STORED: "This app is set up for another Account.",
    USERNAME_TAKEN: "That username is taken. Choose another one.",
    IDENTITY_KEY_TAKEN:
      "This installation's identity key already belongs to another Account.",
    INVALID_CREDENTIALS: "Wrong username or password.",
    INVALID_REFRESH_TOKEN: "Your session has ended. Log in again.",
    INVALID_ACCESS_TOKEN:
      "The server did not accept this session. Log in again.",
    RATE_LIMITED: "Too many attempts. Try again later.",
    ACCOUNT_NOT_FOUND: "There is no Account with that username.",
    SERVER_UNREACHABLE:
      "Cannot reach the server. Check your connection and try again.",
    UNEXPECTED_RESPONSE:
      "The server gave an unexpected answer. Try again later.",
  } satisfies Record<AccountRefusal, string>),
);

/**
 * The sentence a screen shows when the main process refuses a sign-up or login.
 * @example accountRefusalMessage("INVALID_CREDENTIALS") // "Wrong username or password."
 */
export function accountRefusalMessage(refusal: AccountRefusal): string {
  return refusalMessages.get(refusal) ?? UNEXPECTED_FAILURE_MESSAGE;
}

/**
 * The sentence a recovery screen shows when the main process refuses it; a wrong code is not a wrong password.
 * @example recoveryRefusalMessage("INVALID_CREDENTIALS") // "Wrong username or Recovery code."
 */
export function recoveryRefusalMessage(refusal: AccountRefusal): string {
  return refusal === "INVALID_CREDENTIALS"
    ? "Wrong username or Recovery code."
    : accountRefusalMessage(refusal);
}

/**
 * The sentence a screen shows for what was typed, when it refuses it before sending.
 * @example inputProblemMessage("PASSWORD_TOO_SHORT") // "Passwords need at least 12 characters."
 */
export function inputProblemMessage(problem: InputProblem): string {
  switch (problem) {
    case "INVALID_USERNAME":
      return `Usernames have ${usernameLimits.minLength} to ${usernameLimits.maxLength} characters: lowercase letters, digits and underscores.`;
    case "PASSWORD_TOO_SHORT":
      return `Passwords need at least ${passwordLimits.minLength} characters.`;
    case "PASSWORD_TOO_LONG":
      return `Passwords can have at most ${passwordLimits.maxLength} characters.`;
    case "PASSWORDS_DIFFER":
      return "The two passwords do not match.";
    case "INVALID_RECOVERY_CODE":
      return "A Recovery code has 24 letters and digits, as shown when it was made.";
  }
}
