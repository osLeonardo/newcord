import type { AccountSwitchChoice } from "../../preload/desktop-api";
import type { IdentityKeyPair } from "../identity/identity-key";
import type { LocalStore } from "../local-store/local-store";
import type { ServerApiClient } from "../server-api/server-api-client";
import type { LiveSession } from "../session/live-session";
import { endServerSession } from "./server-session-end";

/**
 * How a sign-up or login treats this installation: as the Account already stored (or the first
 * one), as a confirmed switch to another Account, or as a switch still waiting for the warning.
 */
export type AccountEntryPlan =
  "same-account" | "switch-account" | "needs-confirmation";

/**
 * Whether entering `username` keeps this installation as it is or switches it to another Account (D60).
 * @example planAccountEntry(store, "bruno", { switchAccount: false }) // "needs-confirmation" when "alice" is stored
 */
export function planAccountEntry(
  store: Pick<LocalStore, "readAccount">,
  username: string,
  choice: AccountSwitchChoice,
): AccountEntryPlan {
  const storedAccount = store.readAccount();
  if (storedAccount === undefined || storedAccount.username === username) {
    return "same-account";
  }
  return choice.switchAccount ? "switch-account" : "needs-confirmation";
}

export interface AccountLeavingDependencies {
  readonly store: LocalStore;
  readonly server: ServerApiClient;
  readonly liveSession: Pick<LiveSession, "stop">;
}

/**
 * Leaves the stored Account once the server accepted the new one: ends its session on the server,
 * erases this app's local data and keeps the new identity key (D60).
 * @example await leaveStoredAccount(dependencies, newKeyPair);
 */
export async function leaveStoredAccount(
  dependencies: AccountLeavingDependencies,
  newKeyPair: IdentityKeyPair,
): Promise<void> {
  await dependencies.liveSession.stop();
  const tokens = dependencies.store.readSessionTokens();
  if (tokens !== undefined) {
    await endServerSession(dependencies.server, tokens);
  }
  dependencies.store.eraseEverything();
  dependencies.store.saveIdentityKey(newKeyPair);
}
