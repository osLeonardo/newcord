import Database from "better-sqlite3";
import { vi } from "vitest";
import {
  createAccountActions,
  type AccountActions,
} from "../../src/main/account/account-actions";
import {
  createIdentityKeyPair,
  loadOrCreateIdentityKey,
} from "../../src/main/identity/identity-key";
import {
  createSqliteLocalStore,
  type LocalStore,
} from "../../src/main/local-store/local-store";
import { createServerApiClient } from "../../src/main/server-api/server-api-client";
import {
  createLiveSession,
  type LiveSession,
} from "../../src/main/session/live-session";
import { createTokenRenewal } from "../../src/main/session/token-renewal";
import type { Credentials } from "../../src/preload/desktop-api";
import { createInjectedSocketOpener } from "./injected-socket-opener";
import type { InProcessServer } from "./in-process-server";
import { createManualClock, type ManualClock } from "./manual-clock";

/** The password every Account in these tests signs up with. */
export const LIVE_TEST_PASSWORD = "correct horse battery staple";

/** One app installation with its live session, as the main process builds it. */
export interface LiveInstallation {
  readonly store: LocalStore;
  readonly clock: ManualClock;
  readonly liveSession: LiveSession;
  readonly sessionEnded: ReturnType<typeof vi.fn<() => void>>;
  readonly actions: AccountActions;
}

/** Builds installations talking to one in-process server, and tears them all down. */
export interface LiveInstallations {
  install(): LiveInstallation;
  signedUp(username: string): Promise<LiveInstallation>;
  close(): Promise<void>;
}

/** The credentials an Account named `username` signs up with. */
export function credentialsOf(username: string): Credentials {
  return { username, password: LIVE_TEST_PASSWORD };
}

/** Creates the installation factory for `server`. */
export function createLiveInstallations(
  server: InProcessServer,
): LiveInstallations {
  const opened: { database: Database.Database; liveSession: LiveSession }[] =
    [];
  const install = (): LiveInstallation => {
    const installation = installApp(server, new Database(":memory:"));
    opened.push(installation.resources);
    return installation.view;
  };
  return {
    install,
    signedUp: (username) => signUpOn(install(), username),
    close: async (): Promise<void> => {
      for (const { database, liveSession } of opened.splice(0)) {
        await liveSession.stop();
        database.close();
      }
    },
  };
}

function installApp(
  server: InProcessServer,
  database: Database.Database,
): {
  view: LiveInstallation;
  resources: { database: Database.Database; liveSession: LiveSession };
} {
  const store = createSqliteLocalStore(database);
  loadOrCreateIdentityKey(store, createIdentityKeyPair);
  const serverApi = createServerApiClient(server.transport);
  const clock = createManualClock();
  const sessionEnded = vi.fn<() => void>();
  const liveSession = createLiveSession({
    store,
    renewal: createTokenRenewal({ store, server: serverApi }),
    openSocket: createInjectedSocketOpener(server.app),
    clock,
    events: { sessionEnded, onlineAccountsChanged: () => undefined },
  });
  const actions = createAccountActions({
    store,
    server: serverApi,
    createKeyPair: createIdentityKeyPair,
    liveSession,
  });
  return {
    view: { store, clock, liveSession, sessionEnded, actions },
    resources: { database, liveSession },
  };
}

async function signUpOn(
  installation: LiveInstallation,
  username: string,
): Promise<LiveInstallation> {
  const result = await installation.actions.signUp(credentialsOf(username), {
    switchAccount: false,
  });
  if (result.outcome !== "signed-up") {
    throw new Error(`sign-up of ${username} was refused: ${result.refusal}`);
  }
  return installation;
}
