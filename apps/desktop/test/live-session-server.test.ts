import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAccountActions,
  type AccountActions,
} from "../src/main/account/account-actions";
import {
  createIdentityKeyPair,
  loadOrCreateIdentityKey,
} from "../src/main/identity/identity-key";
import {
  createSqliteLocalStore,
  type LocalStore,
} from "../src/main/local-store/local-store";
import { createServerApiClient } from "../src/main/server-api/server-api-client";
import {
  createLiveSession,
  type LiveSession,
} from "../src/main/session/live-session";
import { createTokenRenewal } from "../src/main/session/token-renewal";
import type {
  AccountSwitchChoice,
  Credentials,
} from "../src/preload/desktop-api";
import { createInjectedSocketOpener } from "./support/injected-socket-opener";
import {
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import { createManualClock, type ManualClock } from "./support/manual-clock";

const stayOnAccount: AccountSwitchChoice = { switchAccount: false };
const PASSWORD = "correct horse battery staple";
const FOURTEEN_MINUTES = 14 * 60 * 1000;

interface Installation {
  readonly store: LocalStore;
  readonly clock: ManualClock;
  readonly liveSession: LiveSession;
  readonly sessionEnded: ReturnType<typeof vi.fn<() => void>>;
  readonly actions: AccountActions;
}

let server: InProcessServer;
const installations: {
  database: Database.Database;
  liveSession: LiveSession;
}[] = [];

beforeEach(async () => {
  server = await startInProcessServer();
});

afterEach(async () => {
  for (const { database, liveSession } of installations.splice(0)) {
    await liveSession.stop();
    database.close();
  }
  await server.close();
});

function credentialsOf(username: string): Credentials {
  return { username, password: PASSWORD };
}

/** One app installation with its live session, talking to the in-process server. */
function installApp(): Installation {
  const database = new Database(":memory:");
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
  installations.push({ database, liveSession });
  const actions = createAccountActions({
    store,
    server: serverApi,
    createKeyPair: createIdentityKeyPair,
    liveSession,
  });
  return { store, clock, liveSession, sessionEnded, actions };
}

async function signedUp(username: string): Promise<Installation> {
  const installation = installApp();
  const result = await installation.actions.signUp(
    credentialsOf(username),
    stayOnAccount,
  );
  if (result.outcome !== "signed-up") {
    throw new Error(`sign-up of ${username} was refused: ${result.refusal}`);
  }
  return installation;
}

async function expectOnline(
  installation: Installation,
  usernames: string[],
): Promise<void> {
  await vi.waitFor(() => {
    expect(installation.liveSession.onlineAccounts()).toEqual(usernames);
  });
}

describe("the live session against the real server", () => {
  it("shows two logged-in Accounts each other online", async () => {
    const alice = await signedUp("alice");
    const bruno = await signedUp("bruno");

    await expectOnline(alice, ["bruno"]);
    await expectOnline(bruno, ["alice"]);
  });

  it("removes an Account from the other's list when it logs out", async () => {
    const alice = await signedUp("alice");
    const bruno = await signedUp("bruno");
    await expectOnline(alice, ["bruno"]);

    await bruno.actions.logOut();

    await expectOnline(alice, []);
    expect(alice.sessionEnded).not.toHaveBeenCalled();
  });

  it("returns to the login screen when a copied refresh token was used first", async () => {
    const alice = await signedUp("alice");
    await expectOnline(alice, []);
    const deviceId = alice.store.readAccount()?.deviceId;
    const stolen = alice.store.readSessionTokens();
    if (stolen === undefined) throw new Error("sign-up stored no tokens");
    await createServerApiClient(server.transport).refresh({
      refreshToken: stolen.refreshToken,
    });

    await alice.clock.advance(FOURTEEN_MINUTES);

    await vi.waitFor(() => {
      expect(alice.sessionEnded).toHaveBeenCalledOnce();
    });
    await expect(alice.actions.readSessionState()).resolves.toEqual({
      status: "logged-out",
      username: "alice",
    });
    await alice.actions.logIn(credentialsOf("alice"), stayOnAccount);
    expect(alice.store.readAccount()?.deviceId).toBe(deviceId);
  });
});
