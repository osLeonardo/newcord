import type { LoginRequest, LoginResponse } from "@newcord/shared";
import type {
  AccountRefusal,
  AccountSwitchChoice,
  Credentials,
  DesktopApiCalls,
  LogInResult,
  SessionState,
  SignUpResult,
} from "../../preload/desktop-api";
import {
  identityKeyBase64,
  loadOrCreateIdentityKey,
  type IdentityKeyPair,
} from "../identity/identity-key";
import type { LocalStore } from "../local-store/local-store";
import type { ServerApiClient } from "../server-api/server-api-client";
import type { LiveSession } from "../session/live-session";
import {
  leaveStoredAccount,
  planAccountEntry,
  type AccountEntryPlan,
} from "./account-switch";
import { endServerSession } from "./server-session-end";
import { sessionStateOf } from "./session-state";

export interface AccountActionsDependencies {
  readonly store: LocalStore;
  readonly server: ServerApiClient;
  readonly createKeyPair: () => IdentityKeyPair;
  readonly liveSession: Pick<LiveSession, "start" | "stop" | "onlineAccounts">;
}

/** What each desktop API call does in the main process. */
export type AccountActions = DesktopApiCalls;

interface Refused {
  readonly outcome: "refused";
  readonly refusal: AccountRefusal;
}

/**
 * The sign-up, login and logout flows: they call the server, keep the Account, deviceId and tokens
 * in the local store, start or stop the live session, and switch Accounts once confirmed (D60).
 * @example const actions = createAccountActions({ store, server, createKeyPair: createIdentityKeyPair, liveSession });
 */
export function createAccountActions(
  dependencies: AccountActionsDependencies,
): AccountActions {
  return {
    readSessionState: () => Promise.resolve(sessionStateOf(dependencies.store)),
    signUp: (credentials, choice) => signUp(dependencies, credentials, choice),
    logIn: (credentials, choice) => logIn(dependencies, credentials, choice),
    logOut: () => logOut(dependencies),
    readOnlineAccounts: () =>
      Promise.resolve(dependencies.liveSession.onlineAccounts()),
  };
}

async function signUp(
  dependencies: AccountActionsDependencies,
  credentials: Credentials,
  choice: AccountSwitchChoice,
): Promise<SignUpResult> {
  const plan = planAccountEntry(
    dependencies.store,
    credentials.username,
    choice,
  );
  if (plan === "needs-confirmation") {
    return refusedBecause("ANOTHER_ACCOUNT_STORED");
  }
  const keyPair = identityKeyFor(dependencies, plan);
  const result = await dependencies.server.register(
    accountRequest(keyPair, credentials),
  );
  if (!result.ok) return refusedBecause(result.failure);
  await enterAccount(dependencies, plan, keyPair, {
    username: credentials.username,
    response: result.body,
  });
  return {
    outcome: "signed-up",
    recoveryCode: result.body.recoveryCode,
    session: sessionStateOf(dependencies.store),
  };
}

async function logIn(
  dependencies: AccountActionsDependencies,
  credentials: Credentials,
  choice: AccountSwitchChoice,
): Promise<LogInResult> {
  const plan = planAccountEntry(
    dependencies.store,
    credentials.username,
    choice,
  );
  if (plan === "needs-confirmation") {
    return refusedBecause("ANOTHER_ACCOUNT_STORED");
  }
  const keyPair = identityKeyFor(dependencies, plan);
  const result = await dependencies.server.logIn(
    accountRequest(keyPair, credentials),
  );
  if (!result.ok) return refusedBecause(result.failure);
  await enterAccount(dependencies, plan, keyPair, {
    username: credentials.username,
    response: result.body,
  });
  return { outcome: "logged-in", session: sessionStateOf(dependencies.store) };
}

async function logOut(
  dependencies: AccountActionsDependencies,
): Promise<SessionState> {
  // Stopping first lets a renewal under way finish, so the tokens read next are the latest.
  await dependencies.liveSession.stop();
  const tokens = dependencies.store.readSessionTokens();
  if (tokens !== undefined) {
    await endServerSession(dependencies.server, tokens);
  }
  dependencies.store.deleteSessionTokens();
  return sessionStateOf(dependencies.store);
}

/**
 * A switch gets a new key that is stored only once the server accepts it, so a refused sign-up or
 * login leaves this installation as it was.
 */
function identityKeyFor(
  dependencies: AccountActionsDependencies,
  plan: AccountEntryPlan,
): IdentityKeyPair {
  if (plan === "switch-account") return dependencies.createKeyPair();
  return loadOrCreateIdentityKey(
    dependencies.store,
    dependencies.createKeyPair,
  );
}

/** Register and login carry the same fields (D59). */
function accountRequest(
  keyPair: IdentityKeyPair,
  credentials: Credentials,
): LoginRequest {
  return {
    username: credentials.username,
    password: credentials.password,
    identityKey: identityKeyBase64(keyPair),
  };
}

interface AcceptedAccountEntry {
  readonly username: string;
  readonly response: LoginResponse;
}

async function enterAccount(
  dependencies: AccountActionsDependencies,
  plan: AccountEntryPlan,
  keyPair: IdentityKeyPair,
  entry: AcceptedAccountEntry,
): Promise<void> {
  if (plan === "switch-account") {
    await leaveStoredAccount(dependencies, keyPair);
  }
  dependencies.store.saveLogin(
    { username: entry.username, deviceId: entry.response.deviceId },
    {
      accessToken: entry.response.accessToken,
      refreshToken: entry.response.refreshToken,
    },
  );
  dependencies.liveSession.start();
}

function refusedBecause(refusal: AccountRefusal): Refused {
  return { outcome: "refused", refusal };
}
