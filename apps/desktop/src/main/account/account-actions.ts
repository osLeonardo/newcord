import type { LoginRequest, LoginResponse } from "@newcord/shared";
import type {
  AccountRefusal,
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
 * in the local store, and start or stop the live session.
 * @example const actions = createAccountActions({ store, server, createKeyPair: createIdentityKeyPair, liveSession });
 */
export function createAccountActions(
  dependencies: AccountActionsDependencies,
): AccountActions {
  return {
    readSessionState: () => Promise.resolve(sessionStateOf(dependencies.store)),
    signUp: (credentials) => signUp(dependencies, credentials),
    logIn: (credentials) => logIn(dependencies, credentials),
    logOut: () => logOut(dependencies),
    readOnlineAccounts: () =>
      Promise.resolve(dependencies.liveSession.onlineAccounts()),
  };
}

async function signUp(
  dependencies: AccountActionsDependencies,
  credentials: Credentials,
): Promise<SignUpResult> {
  // Signing up always makes a new Account, so it needs the D60 switch first (Step 05).
  if (dependencies.store.readAccount() !== undefined) {
    return refusedBecause("ANOTHER_ACCOUNT_STORED");
  }
  const result = await dependencies.server.register(
    accountRequest(dependencies, credentials),
  );
  if (!result.ok) return refusedBecause(result.failure);
  startSession(dependencies, credentials.username, result.body);
  return {
    outcome: "signed-up",
    recoveryCode: result.body.recoveryCode,
    session: sessionStateOf(dependencies.store),
  };
}

async function logIn(
  dependencies: AccountActionsDependencies,
  credentials: Credentials,
): Promise<LogInResult> {
  const storedAccount = dependencies.store.readAccount();
  if (storedAccount && storedAccount.username !== credentials.username) {
    return refusedBecause("ANOTHER_ACCOUNT_STORED");
  }
  const result = await dependencies.server.logIn(
    accountRequest(dependencies, credentials),
  );
  if (!result.ok) return refusedBecause(result.failure);
  startSession(dependencies, credentials.username, result.body);
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

/** Register and login carry the same fields (D59); the identity key always comes from the store. */
function accountRequest(
  dependencies: AccountActionsDependencies,
  credentials: Credentials,
): LoginRequest {
  const keyPair = loadOrCreateIdentityKey(
    dependencies.store,
    dependencies.createKeyPair,
  );
  return {
    username: credentials.username,
    password: credentials.password,
    identityKey: identityKeyBase64(keyPair),
  };
}

function startSession(
  dependencies: AccountActionsDependencies,
  username: string,
  response: LoginResponse,
): void {
  dependencies.store.saveLogin(
    { username, deviceId: response.deviceId },
    { accessToken: response.accessToken, refreshToken: response.refreshToken },
  );
  dependencies.liveSession.start();
}

function refusedBecause(refusal: AccountRefusal): Refused {
  return { outcome: "refused", refusal };
}
