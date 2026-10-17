import {
  ApiErrorCode,
  PROTOCOL_VERSION,
  WebSocketCloseCode,
  type RefreshResponse,
} from "@newcord/shared";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSqliteLocalStore,
  type LocalStore,
} from "../src/main/local-store/local-store";
import type {
  ServerApiClient,
  ServerCallResult,
} from "../src/main/server-api/server-api-client";
import {
  createLiveSession,
  type LiveSession,
  type LiveSessionEvents,
} from "../src/main/session/live-session";
import { createTokenRenewal } from "../src/main/session/token-renewal";
import {
  createFakeSocketOpener,
  type FakeLiveConnection,
  type FakeSocketOpener,
} from "./support/fake-live-socket";
import { createManualClock, type ManualClock } from "./support/manual-clock";
import { accessTokenExpiringAt } from "./support/test-access-token";

const ONE_MINUTE = 60 * 1000;
const FIFTEEN_MINUTES = 15 * ONE_MINUTE;
const NETWORK_DROP = 1006;

type Refresh = ServerApiClient["refresh"];

let clock: ManualClock;
let database: Database.Database;
let store: LocalStore;
let refresh: ReturnType<typeof vi.fn<Refresh>>;
let opener: FakeSocketOpener;
let events: {
  [Event in keyof LiveSessionEvents]: ReturnType<
    typeof vi.fn<LiveSessionEvents[Event]>
  >;
};
let liveSession: LiveSession;
let issuedTokens = 0;

beforeEach(() => {
  // JWT expiries are whole seconds, so time starts on one.
  clock = createManualClock(Math.floor(Date.now() / 1000) * 1000);
  database = new Database(":memory:");
  store = createSqliteLocalStore(database);
  store.saveLogin(
    { username: "alice", deviceId: "A".repeat(22) },
    tokensExpiringIn(FIFTEEN_MINUTES),
  );
  refresh = vi.fn<Refresh>(() =>
    Promise.resolve({ ok: true, body: tokensExpiringIn(FIFTEEN_MINUTES) }),
  );
  opener = createFakeSocketOpener();
  events = { sessionEnded: vi.fn(), onlineAccountsChanged: vi.fn() };
  liveSession = createLiveSession({
    store,
    renewal: createTokenRenewal({ store, server: { refresh } }),
    openSocket: opener.open,
    clock,
    events,
  });
});

afterEach(async () => {
  await liveSession.stop();
  database.close();
});

function tokensExpiringIn(milliseconds: number): RefreshResponse {
  issuedTokens += 1;
  return {
    accessToken: accessTokenExpiringAt(clock.now() + milliseconds),
    refreshToken: String(issuedTokens).padStart(43, "r"),
  };
}

function failingWith(
  failure: Extract<ServerCallResult<RefreshResponse>, { ok: false }>["failure"],
): Promise<ServerCallResult<RefreshResponse>> {
  return Promise.resolve({ ok: false, failure });
}

function snapshot(...usernames: string[]): object {
  return { v: PROTOCOL_VERSION, type: "presence", kind: "snapshot", usernames };
}

function change(kind: "online" | "offline", username: string): object {
  return { v: PROTOCOL_VERSION, type: "presence", kind, username };
}

function helloSentOn(connection: FakeLiveConnection): unknown {
  return connection.sent.map((text) => JSON.parse(text) as unknown);
}

function storedAccessToken(): string | undefined {
  return store.readSessionTokens()?.accessToken;
}

/** Starts the session and lets the first connection open and receive its snapshot. */
async function startConnected(
  ...online: string[]
): Promise<FakeLiveConnection> {
  liveSession.start();
  await clock.advance(0);
  const connection = opener.latest();
  connection.open();
  await clock.advance(0);
  connection.receive(snapshot("alice", ...online));
  return connection;
}

describe("connecting", () => {
  it("sends hello with the stored access token once the WebSocket opens", async () => {
    liveSession.start();
    await clock.advance(0);
    opener.latest().open();
    await clock.advance(0);

    expect(helloSentOn(opener.latest())).toEqual([
      { v: PROTOCOL_VERSION, type: "hello", accessToken: storedAccessToken() },
    ]);
  });

  it("opens one connection when started twice", async () => {
    liveSession.start();
    liveSession.start();
    await clock.advance(0);

    expect(opener.connections).toHaveLength(1);
  });

  it("renews an access token about to expire before connecting", async () => {
    store.saveLogin(
      { username: "alice", deviceId: "A".repeat(22) },
      tokensExpiringIn(30 * 1000),
    );

    liveSession.start();
    await clock.advance(0);
    opener.latest().open();
    await clock.advance(0);

    expect(refresh).toHaveBeenCalledOnce();
    expect(helloSentOn(opener.latest())).toEqual([
      { v: PROTOCOL_VERSION, type: "hello", accessToken: storedAccessToken() },
    ]);
  });
});

describe("the online list", () => {
  it("shows the other Accounts in the snapshot", async () => {
    await startConnected("carla", "bruno");

    expect(liveSession.onlineAccounts()).toEqual(["bruno", "carla"]);
    expect(events.onlineAccountsChanged).toHaveBeenLastCalledWith([
      "bruno",
      "carla",
    ]);
  });

  it("follows Accounts coming online and going offline", async () => {
    const connection = await startConnected("bruno");

    connection.receive(change("online", "carla"));
    connection.receive(change("offline", "bruno"));

    expect(liveSession.onlineAccounts()).toEqual(["carla"]);
  });

  it("ignores Envelopes that break their schema", async () => {
    const connection = await startConnected("bruno");

    connection.receive({
      v: PROTOCOL_VERSION,
      type: "presence",
      kind: "online",
    });

    expect(liveSession.onlineAccounts()).toEqual(["bruno"]);
  });

  it("is emptied while the connection is down", async () => {
    const connection = await startConnected("bruno");

    connection.closeFromServer(NETWORK_DROP);

    expect(liveSession.onlineAccounts()).toEqual([]);
    expect(events.onlineAccountsChanged).toHaveBeenLastCalledWith([]);
  });
});

describe("renewing the access token", () => {
  it("renews 1 minute before the token expires and stores the new tokens", async () => {
    await startConnected();

    await clock.advance(FIFTEEN_MINUTES - ONE_MINUTE - 1);
    expect(refresh).not.toHaveBeenCalled();
    await clock.advance(1);

    expect(refresh).toHaveBeenCalledOnce();
    expect(store.readSessionTokens()?.refreshToken).toBe(
      String(issuedTokens).padStart(43, "r"),
    );
  });

  it("keeps renewing each new token 1 minute before it expires", async () => {
    await startConnected();

    await clock.advance(2 * (FIFTEEN_MINUTES - ONE_MINUTE));

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("retries a failed renewal after 1 second, then 2", async () => {
    refresh
      .mockImplementationOnce(() => failingWith("SERVER_UNREACHABLE"))
      .mockImplementationOnce(() => failingWith(ApiErrorCode.RateLimited));
    await startConnected();

    await clock.advance(FIFTEEN_MINUTES - ONE_MINUTE);
    await clock.advance(1000);
    await clock.advance(2000);

    expect(refresh).toHaveBeenCalledTimes(3);
    expect(events.sessionEnded).not.toHaveBeenCalled();
  });
});

describe("renewing on request", () => {
  it("renews at once and schedules the next renewal from the new token", async () => {
    await startConnected();
    await clock.advance(5 * ONE_MINUTE);

    await expect(liveSession.renewAccessToken()).resolves.toBe("renewed");
    await clock.advance(FIFTEEN_MINUTES - ONE_MINUTE - 1);

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("ends the session when the server refuses the refresh token", async () => {
    refresh.mockImplementation(() =>
      failingWith(ApiErrorCode.InvalidRefreshToken),
    );
    await startConnected();

    await expect(liveSession.renewAccessToken()).resolves.toBe("session-ended");
    expect(events.sessionEnded).toHaveBeenCalledOnce();
  });
});

describe("reconnecting", () => {
  it("waits 1, 2 and 4 seconds after repeated drops", async () => {
    (await startConnected()).closeFromServer(NETWORK_DROP);

    for (const delay of [1000, 2000, 4000]) {
      const connectionsBefore = opener.connections.length;
      await clock.advance(delay - 1);
      expect(opener.connections).toHaveLength(connectionsBefore);
      await clock.advance(1);
      expect(opener.connections).toHaveLength(connectionsBefore + 1);
      opener.latest().closeFromServer(NETWORK_DROP);
    }
  });

  it("waits 1 second again after a successful hello", async () => {
    (await startConnected()).closeFromServer(NETWORK_DROP);
    await clock.advance(1000);
    opener.latest().closeFromServer(NETWORK_DROP);
    await clock.advance(2000);
    const connection = opener.latest();
    connection.open();
    await clock.advance(0);
    connection.receive(snapshot("alice"));

    connection.closeFromServer(NETWORK_DROP);
    await clock.advance(1000);

    expect(opener.connections).toHaveLength(4);
  });

  it("renews and reconnects, without logging out, when the server refuses hello", async () => {
    const connection = await startConnected();

    connection.closeFromServer(WebSocketCloseCode.AuthenticationFailed);
    await clock.advance(1000);
    opener.latest().open();
    await clock.advance(0);

    expect(refresh).toHaveBeenCalledOnce();
    expect(opener.connections).toHaveLength(2);
    expect(helloSentOn(opener.latest())).toEqual([
      { v: PROTOCOL_VERSION, type: "hello", accessToken: storedAccessToken() },
    ]);
    expect(events.sessionEnded).not.toHaveBeenCalled();
  });
});

describe("a session the server ends", () => {
  it("ends on the session-ended close code, keeping the Account", async () => {
    const connection = await startConnected("bruno");

    connection.closeFromServer(WebSocketCloseCode.SessionEnded);

    expect(events.sessionEnded).toHaveBeenCalledOnce();
    expect(store.readSessionTokens()).toBeUndefined();
    expect(store.readAccount()).toEqual({
      username: "alice",
      deviceId: "A".repeat(22),
    });
    expect(clock.pendingDelays()).toEqual([]);
  });

  it("ends when the server refuses the refresh token", async () => {
    refresh.mockImplementation(() =>
      failingWith(ApiErrorCode.InvalidRefreshToken),
    );
    const connection = await startConnected();

    await clock.advance(FIFTEEN_MINUTES - ONE_MINUTE);

    expect(events.sessionEnded).toHaveBeenCalledOnce();
    expect(store.readSessionTokens()).toBeUndefined();
    expect(connection.closedByApp).toBe(true);
  });

  it("ends at start when no tokens are stored", async () => {
    store.deleteSessionTokens();

    liveSession.start();
    await clock.advance(0);

    expect(events.sessionEnded).toHaveBeenCalledOnce();
    expect(opener.connections).toHaveLength(0);
  });
});

describe("stopping", () => {
  it("closes the socket, empties the list and does nothing more", async () => {
    const connection = await startConnected("bruno");

    await liveSession.stop();
    await clock.advance(FIFTEEN_MINUTES * 2);

    expect(connection.closedByApp).toBe(true);
    expect(liveSession.onlineAccounts()).toEqual([]);
    expect(opener.connections).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(events.sessionEnded).not.toHaveBeenCalled();
  });

  it("can start again afterwards", async () => {
    await startConnected();
    await liveSession.stop();

    liveSession.start();
    await clock.advance(0);

    expect(opener.connections).toHaveLength(2);
  });
});
