import type { SessionState } from "../../preload/desktop-api";
import type { LocalStore } from "../local-store/local-store";

/**
 * The session state the interface shows: logged in while tokens are stored, and the Account's
 * username once this installation belongs to one.
 * @example sessionStateOf(store) // { status: "logged-out", username: "alice" }
 */
export function sessionStateOf(
  store: Pick<LocalStore, "readAccount" | "readSessionTokens">,
): SessionState {
  const account = store.readAccount();
  if (account === undefined) return { status: "logged-out", username: null };
  if (store.readSessionTokens() === undefined) {
    return { status: "logged-out", username: account.username };
  }
  return { status: "logged-in", username: account.username };
}
