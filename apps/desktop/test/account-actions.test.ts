import { RecoveryCode } from "@newcord/shared";
import Database from "better-sqlite3";
import { Value } from "typebox/value";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  createAccountActions,
  type AccountActions,
  type AccountActionsDependencies,
} from "../src/main/account/account-actions";
import {
  createIdentityKeyPair,
  identityKeyBase64,
  loadOrCreateIdentityKey,
} from "../src/main/identity/identity-key";
import {
  createSqliteLocalStore,
  type LocalStore,
} from "../src/main/local-store/local-store";
import type {
  ServerPost,
  ServerReply,
  ServerTransport,
} from "../src/main/server-api/fetch-transport";
import { createServerApiClient } from "../src/main/server-api/server-api-client";
import type {
  AccountSwitchChoice,
  Credentials,
  SignUpResult,
} from "../src/preload/desktop-api";
import {
  serverRowCounts,
  startInProcessServer,
  unreachableTransport,
  type InProcessServer,
} from "./support/in-process-server";

const stayOnAccount: AccountSwitchChoice = { switchAccount: false };
const confirmedSwitch: AccountSwitchChoice = { switchAccount: true };
const alice: Credentials = {
  username: "alice",
  password: "correct horse battery staple",
};
const bruno: Credentials = {
  username: "bruno",
  password: "another long enough password",
};

type LiveSessionControls = AccountActionsDependencies["liveSession"];

interface FakeLiveSession {
  readonly start: Mock<LiveSessionControls["start"]>;
  readonly stop: Mock<LiveSessionControls["stop"]>;
  readonly onlineAccounts: Mock<LiveSessionControls["onlineAccounts"]>;
  readonly renewAccessToken: Mock<LiveSessionControls["renewAccessToken"]>;
}

interface Installation {
  readonly database: Database.Database;
  readonly store: LocalStore;
  readonly posts: Mock<(request: ServerPost) => Promise<ServerReply>>;
  readonly liveSession: FakeLiveSession;
  readonly actions: AccountActions;
}

let server: InProcessServer;
const databases: Database.Database[] = [];

beforeEach(async () => {
  server = await startInProcessServer();
});

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await server.close();
});

/** One app installation after its first start, talking to the in-process server through `transport`. */
function installApp(
  transport: ServerTransport = server.transport,
): Installation {
  const database = new Database(":memory:");
  databases.push(database);
  const store = createSqliteLocalStore(database);
  loadOrCreateIdentityKey(store, createIdentityKeyPair);
  const posts = vi.fn((request: ServerPost) => transport.post(request));
  const liveSession = fakeLiveSession();
  const actions = restartApp(store, { post: posts }, liveSession);
  return { database, store, posts, liveSession, actions };
}

function fakeLiveSession(): FakeLiveSession {
  return {
    start: vi.fn<LiveSessionControls["start"]>(),
    stop: vi.fn<LiveSessionControls["stop"]>(() => Promise.resolve()),
    onlineAccounts: vi.fn<LiveSessionControls["onlineAccounts"]>(() => []),
    renewAccessToken: vi.fn<LiveSessionControls["renewAccessToken"]>(() =>
      Promise.resolve("renewed"),
    ),
  };
}

function restartApp(
  store: LocalStore,
  transport: ServerTransport,
  liveSession: FakeLiveSession = fakeLiveSession(),
): AccountActions {
  return createAccountActions({
    store,
    server: createServerApiClient(transport),
    createKeyPair: createIdentityKeyPair,
    liveSession,
  });
}

function deviceIdOf(store: LocalStore): string {
  const account = store.readAccount();
  if (account === undefined) throw new Error("no Account is stored");
  return account.deviceId;
}

function recoveryCodeOf(result: SignUpResult): string {
  if (result.outcome !== "signed-up") {
    throw new Error(`sign-up was refused: ${result.refusal}`);
  }
  return result.recoveryCode;
}

describe("a fresh installation", () => {
  it("is logged out and belongs to no Account", async () => {
    await expect(installApp().actions.readSessionState()).resolves.toEqual({
      status: "logged-out",
      username: null,
    });
  });
});

describe("signUp", () => {
  it("returns only the Recovery code and the logged-in session", async () => {
    const result = await installApp().actions.signUp(alice, stayOnAccount);

    expect(result).toEqual({
      outcome: "signed-up",
      recoveryCode: expect.any(String) as string,
      session: { status: "logged-in", username: "alice" },
    });
    expect(Value.Check(RecoveryCode, recoveryCodeOf(result))).toBe(true);
  });

  it("creates the Account on the server with this installation's identity key", async () => {
    const { store, actions } = installApp();

    await actions.signUp(alice, stayOnAccount);

    const deviceRow = server.database
      .prepare<[string], { identity_key: Buffer }>(
        "SELECT identity_key FROM devices WHERE id = ?",
      )
      .get(deviceIdOf(store));
    const keyPair = store.readIdentityKey();
    expect(keyPair && identityKeyBase64(keyPair)).toBe(
      deviceRow?.identity_key.toString("base64"),
    );
  });

  it("stores the username, the deviceId and the tokens", async () => {
    const { store, actions } = installApp();

    await actions.signUp(alice, stayOnAccount);

    expect(store.readAccount()?.username).toBe("alice");
    expect(serverRowCounts(server.database, deviceIdOf(store))).toEqual({
      users: 1,
      devices: 1,
      deviceRefreshTokens: 1,
    });
    expect(store.readSessionTokens()).toEqual({
      accessToken: expect.any(String) as string,
      refreshToken: expect.any(String) as string,
    });
  });

  it("stores the Recovery code nowhere in the local database", async () => {
    const { database, actions } = installApp();

    const recoveryCode = recoveryCodeOf(
      await actions.signUp(alice, stayOnAccount),
    );

    expect(database.serialize().includes(recoveryCode)).toBe(false);
  });

  it("reports a taken username and stores nothing", async () => {
    await installApp().actions.signUp(alice, stayOnAccount);
    const { store, actions } = installApp();

    await expect(actions.signUp(alice, stayOnAccount)).resolves.toEqual({
      outcome: "refused",
      refusal: "USERNAME_TAKEN",
    });
    expect(store.readAccount()).toBeUndefined();
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("is refused without asking the server once the installation belongs to an Account", async () => {
    const { posts, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    await actions.logOut();
    posts.mockClear();

    await expect(actions.signUp(bruno, stayOnAccount)).resolves.toEqual({
      outcome: "refused",
      refusal: "ANOTHER_ACCOUNT_STORED",
    });
    expect(posts).not.toHaveBeenCalled();
  });

  it("starts the live session once the tokens are stored", async () => {
    const { store, liveSession, actions } = installApp();
    liveSession.start.mockImplementation(() => {
      expect(store.readSessionTokens()).toBeDefined();
    });

    await actions.signUp(alice, stayOnAccount);

    expect(liveSession.start).toHaveBeenCalledOnce();
  });

  it("reports a server out of reach and stores nothing", async () => {
    const { store, actions } = installApp(unreachableTransport);

    await expect(actions.signUp(alice, stayOnAccount)).resolves.toEqual({
      outcome: "refused",
      refusal: "SERVER_UNREACHABLE",
    });
    expect(store.readAccount()).toBeUndefined();
  });
});

describe("logIn", () => {
  it("makes a fresh installation a new Device of an existing Account", async () => {
    const first = installApp();
    await first.actions.signUp(alice, stayOnAccount);
    const second = installApp();

    await expect(second.actions.logIn(alice, stayOnAccount)).resolves.toEqual({
      outcome: "logged-in",
      session: { status: "logged-in", username: "alice" },
    });
    expect(deviceIdOf(second.store)).not.toBe(deviceIdOf(first.store));
    expect(second.store.readSessionTokens()).toBeDefined();
  });

  it("returns the same deviceId after logging out and back in", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const deviceId = deviceIdOf(store);
    await actions.logOut();

    await actions.logIn(alice, stayOnAccount);

    expect(deviceIdOf(store)).toBe(deviceId);
    expect(serverRowCounts(server.database, deviceId).devices).toBe(1);
  });

  it("starts the live session", async () => {
    await installApp().actions.signUp(alice, stayOnAccount);
    const { liveSession, actions } = installApp();

    await actions.logIn(alice, stayOnAccount);

    expect(liveSession.start).toHaveBeenCalledOnce();
  });

  it("reports wrong credentials, stores nothing and starts nothing", async () => {
    await installApp().actions.signUp(alice, stayOnAccount);
    const { store, liveSession, actions } = installApp();

    await expect(
      actions.logIn(
        { ...alice, password: "not the right password" },
        stayOnAccount,
      ),
    ).resolves.toEqual({ outcome: "refused", refusal: "INVALID_CREDENTIALS" });
    expect(store.readAccount()).toBeUndefined();
    expect(store.readSessionTokens()).toBeUndefined();
    expect(liveSession.start).not.toHaveBeenCalled();
  });

  it("is refused without asking the server for an Account other than the stored one", async () => {
    await installApp().actions.signUp(bruno, stayOnAccount);
    const { posts, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    await actions.logOut();
    posts.mockClear();

    await expect(actions.logIn(bruno, stayOnAccount)).resolves.toEqual({
      outcome: "refused",
      refusal: "ANOTHER_ACCOUNT_STORED",
    });
    expect(posts).not.toHaveBeenCalled();
  });
});

describe("logOut", () => {
  it("stops the live session before asking the server", async () => {
    const { posts, liveSession, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    posts.mockClear();
    liveSession.stop.mockImplementation(() => {
      expect(posts).not.toHaveBeenCalled();
      return Promise.resolve();
    });

    await actions.logOut();

    expect(liveSession.stop).toHaveBeenCalledOnce();
    expect(posts).toHaveBeenCalled();
  });

  it("ends the session on the server and deletes only the local tokens", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const keyPair = store.readIdentityKey();
    const account = store.readAccount();

    await expect(actions.logOut()).resolves.toEqual({
      status: "logged-out",
      username: "alice",
    });
    expect(
      serverRowCounts(server.database, deviceIdOf(store)).deviceRefreshTokens,
    ).toBe(0);
    expect(store.readSessionTokens()).toBeUndefined();
    expect(store.readAccount()).toEqual(account);
    expect(store.readIdentityKey()).toEqual(keyPair);
  });

  it("renews an access token the server no longer accepts, so the server session still ends", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const account = store.readAccount();
    const tokens = store.readSessionTokens();
    if (account === undefined || tokens === undefined)
      throw new Error("sign-up stored nothing");
    store.saveLogin(account, { ...tokens, accessToken: "an.expired.token" });

    await actions.logOut();

    expect(
      serverRowCounts(server.database, account.deviceId).deviceRefreshTokens,
    ).toBe(0);
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("still logs out this Device when the server cannot be reached", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);

    const offlineActions = restartApp(store, unreachableTransport);

    await expect(offlineActions.logOut()).resolves.toEqual({
      status: "logged-out",
      username: "alice",
    });
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("asks the server nothing when no session is stored", async () => {
    const { posts, actions } = installApp();

    await expect(actions.logOut()).resolves.toEqual({
      status: "logged-out",
      username: null,
    });
    expect(posts).not.toHaveBeenCalled();
  });
});

describe("a restart of the app", () => {
  it("opens logged in when tokens are stored, without the password", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);

    const restarted = restartApp(store, server.transport);

    await expect(restarted.readSessionState()).resolves.toEqual({
      status: "logged-in",
      username: "alice",
    });
  });

  it("opens logged out, remembering the Account, after a logout", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    await actions.logOut();

    const restarted = restartApp(store, server.transport);

    await expect(restarted.readSessionState()).resolves.toEqual({
      status: "logged-out",
      username: "alice",
    });
  });
});

describe("readOnlineAccounts", () => {
  it("returns the live session's online list", async () => {
    const { liveSession, actions } = installApp();
    liveSession.onlineAccounts.mockReturnValue(["bruno", "carla"]);

    await expect(actions.readOnlineAccounts()).resolves.toEqual([
      "bruno",
      "carla",
    ]);
  });
});

describe("switching Accounts (D60)", () => {
  function snapshotOf(store: LocalStore): unknown {
    return {
      identityKey: store.readIdentityKey(),
      account: store.readAccount(),
      tokens: store.readSessionTokens(),
    };
  }

  function serverIdentityKeyOf(deviceId: string): string | undefined {
    return server.database
      .prepare<[string], { identity_key: Buffer }>(
        "SELECT identity_key FROM devices WHERE id = ?",
      )
      .get(deviceId)
      ?.identity_key.toString("base64");
  }

  it("logs in to the stored Account with no warning, whatever the choice", async () => {
    const { actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    await actions.logOut();

    await expect(actions.logIn(alice, confirmedSwitch)).resolves.toEqual({
      outcome: "logged-in",
      session: { status: "logged-in", username: "alice" },
    });
  });

  it("changes nothing while the switch is not confirmed", async () => {
    await installApp().actions.signUp(bruno, stayOnAccount);
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const before = snapshotOf(store);

    await actions.logIn(bruno, stayOnAccount);
    await actions.signUp({ ...bruno, username: "carla" }, stayOnAccount);

    expect(snapshotOf(store)).toEqual(before);
  });

  it("logs in as a new Device with a new identity key once confirmed", async () => {
    await installApp().actions.signUp(bruno, stayOnAccount);
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const oldKey = store.readIdentityKey();
    const oldDeviceId = deviceIdOf(store);

    await expect(actions.logIn(bruno, confirmedSwitch)).resolves.toEqual({
      outcome: "logged-in",
      session: { status: "logged-in", username: "bruno" },
    });
    const newKey = store.readIdentityKey();
    expect(newKey).toBeDefined();
    expect(newKey).not.toEqual(oldKey);
    expect(deviceIdOf(store)).not.toBe(oldDeviceId);
    expect(newKey && identityKeyBase64(newKey)).toBe(
      serverIdentityKeyOf(deviceIdOf(store)),
    );
  });

  it("signs up as a new Account with a new identity key once confirmed", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const oldKey = store.readIdentityKey();

    const result = await actions.signUp(bruno, confirmedSwitch);

    expect(result.outcome).toBe("signed-up");
    expect(store.readAccount()?.username).toBe("bruno");
    expect(store.readIdentityKey()).not.toEqual(oldKey);
  });

  it("ends the old Account's session on the server", async () => {
    await installApp().actions.signUp(bruno, stayOnAccount);
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const oldDeviceId = deviceIdOf(store);

    await actions.logIn(bruno, confirmedSwitch);

    expect(
      serverRowCounts(server.database, oldDeviceId).deviceRefreshTokens,
    ).toBe(0);
  });

  it("stops the live session before erasing anything", async () => {
    await installApp().actions.signUp(bruno, stayOnAccount);
    const { store, liveSession, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    liveSession.stop.mockImplementation(() => {
      expect(store.readAccount()?.username).toBe("alice");
      return Promise.resolve();
    });

    await actions.logIn(bruno, confirmedSwitch);

    expect(liveSession.stop).toHaveBeenCalledOnce();
    expect(liveSession.start).toHaveBeenLastCalledWith();
  });

  it("leaves the installation as it was when the server refuses the new Account", async () => {
    await installApp().actions.signUp(bruno, stayOnAccount);
    const { store, actions } = installApp();
    await actions.signUp(alice, stayOnAccount);
    const before = snapshotOf(store);

    await expect(
      actions.logIn(
        { ...bruno, password: "not the right password" },
        confirmedSwitch,
      ),
    ).resolves.toEqual({ outcome: "refused", refusal: "INVALID_CREDENTIALS" });
    expect(snapshotOf(store)).toEqual(before);
  });
});
