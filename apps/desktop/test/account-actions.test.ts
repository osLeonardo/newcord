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
import type { Credentials, SignUpResult } from "../src/preload/desktop-api";
import {
  serverRowCounts,
  startInProcessServer,
  unreachableTransport,
  type InProcessServer,
} from "./support/in-process-server";

const alice: Credentials = {
  username: "alice",
  password: "correct horse battery staple",
};
const bruno: Credentials = {
  username: "bruno",
  password: "another long enough password",
};

interface Installation {
  readonly database: Database.Database;
  readonly store: LocalStore;
  readonly posts: Mock<(request: ServerPost) => Promise<ServerReply>>;
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
  const actions = restartApp(store, { post: posts });
  return { database, store, posts, actions };
}

function restartApp(
  store: LocalStore,
  transport: ServerTransport,
): AccountActions {
  return createAccountActions({
    store,
    server: createServerApiClient(transport),
    createKeyPair: createIdentityKeyPair,
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
    const result = await installApp().actions.signUp(alice);

    expect(result).toEqual({
      outcome: "signed-up",
      recoveryCode: expect.any(String) as string,
      session: { status: "logged-in", username: "alice" },
    });
    expect(Value.Check(RecoveryCode, recoveryCodeOf(result))).toBe(true);
  });

  it("creates the Account on the server with this installation's identity key", async () => {
    const { store, actions } = installApp();

    await actions.signUp(alice);

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

    await actions.signUp(alice);

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

    const recoveryCode = recoveryCodeOf(await actions.signUp(alice));

    expect(database.serialize().includes(recoveryCode)).toBe(false);
  });

  it("reports a taken username and stores nothing", async () => {
    await installApp().actions.signUp(alice);
    const { store, actions } = installApp();

    await expect(actions.signUp(alice)).resolves.toEqual({
      outcome: "refused",
      refusal: "USERNAME_TAKEN",
    });
    expect(store.readAccount()).toBeUndefined();
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("is refused without asking the server once the installation belongs to an Account", async () => {
    const { posts, actions } = installApp();
    await actions.signUp(alice);
    await actions.logOut();
    posts.mockClear();

    await expect(actions.signUp(bruno)).resolves.toEqual({
      outcome: "refused",
      refusal: "ANOTHER_ACCOUNT_STORED",
    });
    expect(posts).not.toHaveBeenCalled();
  });

  it("reports a server out of reach and stores nothing", async () => {
    const { store, actions } = installApp(unreachableTransport);

    await expect(actions.signUp(alice)).resolves.toEqual({
      outcome: "refused",
      refusal: "SERVER_UNREACHABLE",
    });
    expect(store.readAccount()).toBeUndefined();
  });
});

describe("logIn", () => {
  it("makes a fresh installation a new Device of an existing Account", async () => {
    const first = installApp();
    await first.actions.signUp(alice);
    const second = installApp();

    await expect(second.actions.logIn(alice)).resolves.toEqual({
      outcome: "logged-in",
      session: { status: "logged-in", username: "alice" },
    });
    expect(deviceIdOf(second.store)).not.toBe(deviceIdOf(first.store));
    expect(second.store.readSessionTokens()).toBeDefined();
  });

  it("returns the same deviceId after logging out and back in", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice);
    const deviceId = deviceIdOf(store);
    await actions.logOut();

    await actions.logIn(alice);

    expect(deviceIdOf(store)).toBe(deviceId);
    expect(serverRowCounts(server.database, deviceId).devices).toBe(1);
  });

  it("reports wrong credentials and stores nothing", async () => {
    await installApp().actions.signUp(alice);
    const { store, actions } = installApp();

    await expect(
      actions.logIn({ ...alice, password: "not the right password" }),
    ).resolves.toEqual({ outcome: "refused", refusal: "INVALID_CREDENTIALS" });
    expect(store.readAccount()).toBeUndefined();
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("is refused without asking the server for an Account other than the stored one", async () => {
    await installApp().actions.signUp(bruno);
    const { posts, actions } = installApp();
    await actions.signUp(alice);
    await actions.logOut();
    posts.mockClear();

    await expect(actions.logIn(bruno)).resolves.toEqual({
      outcome: "refused",
      refusal: "ANOTHER_ACCOUNT_STORED",
    });
    expect(posts).not.toHaveBeenCalled();
  });
});

describe("logOut", () => {
  it("ends the session on the server and deletes only the local tokens", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice);
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
    await actions.signUp(alice);
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
    await actions.signUp(alice);

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
    await actions.signUp(alice);

    const restarted = restartApp(store, server.transport);

    await expect(restarted.readSessionState()).resolves.toEqual({
      status: "logged-in",
      username: "alice",
    });
  });

  it("opens logged out, remembering the Account, after a logout", async () => {
    const { store, actions } = installApp();
    await actions.signUp(alice);
    await actions.logOut();

    const restarted = restartApp(store, server.transport);

    await expect(restarted.readSessionState()).resolves.toEqual({
      status: "logged-out",
      username: "alice",
    });
  });
});
