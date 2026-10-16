import type { LoginRequest, LoginResponse } from "@newcord/shared";
import type {
  AccountRefusal,
  Credentials,
  DesktopApi,
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
import { endServerSession } from "./server-session-end";

export interface AccountActionsDependencies {
  readonly store: LocalStore;
  readonly server: ServerApiClient;
  readonly createKeyPair: () => IdentityKeyPair;
}

/** What each desktop API function does in the main process. */
export type AccountActions = DesktopApi;

interface Refused {
  readonly outcome: "refused";
  readonly refusal: AccountRefusal;
}

/**
 * The sign-up, login and logout flows: they call the server and keep the Account, deviceId and tokens in the local store.
 * @example const actions = createAccountActions({ store, server, createKeyPair: createIdentityKeyPair });
 */
export function createAccountActions(
  dependencies: AccountActionsDependencies,
): AccountActions {
  return {
    readSessionState: () => Promise.resolve(sessionStateOf(dependencies.store)),
    signUp: (credentials) => signUp(dependencies, credentials),
    logIn: (credentials) => logIn(dependencies, credentials),
    logOut: () => logOut(dependencies),
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
  saveLogin(dependencies.store, credentials.username, result.body);
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
  saveLogin(dependencies.store, credentials.username, result.body);
  return { outcome: "logged-in", session: sessionStateOf(dependencies.store) };
}

async function logOut(
  dependencies: AccountActionsDependencies,
): Promise<SessionState> {
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

function saveLogin(
  store: LocalStore,
  username: string,
  response: LoginResponse,
): void {
  store.saveLogin(
    { username, deviceId: response.deviceId },
    { accessToken: response.accessToken, refreshToken: response.refreshToken },
  );
}

function sessionStateOf(store: LocalStore): SessionState {
  const account = store.readAccount();
  if (account === undefined) return { status: "logged-out", username: null };
  if (store.readSessionTokens() === undefined) {
    return { status: "logged-out", username: account.username };
  }
  return { status: "logged-in", username: account.username };
}

function refusedBecause(refusal: AccountRefusal): Refused {
  return { outcome: "refused", refusal };
}
