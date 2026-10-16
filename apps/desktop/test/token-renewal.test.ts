import { ApiErrorCode, type RefreshResponse } from "@newcord/shared";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSqliteLocalStore,
  type LocalStore,
  type SessionTokens,
} from "../src/main/local-store/local-store";
import type {
  ServerApiClient,
  ServerCallResult,
} from "../src/main/server-api/server-api-client";
import { createTokenRenewal } from "../src/main/session/token-renewal";

const stored: SessionTokens = {
  accessToken: "old.claims.signature",
  refreshToken: "o".repeat(43),
};
const renewed: RefreshResponse = {
  accessToken: "new.claims.signature",
  refreshToken: "n".repeat(43),
};

type Refresh = ServerApiClient["refresh"];

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function loggedInStore(): LocalStore {
  const database = new Database(":memory:");
  databases.push(database);
  const store = createSqliteLocalStore(database);
  store.saveLogin({ username: "alice", deviceId: "A".repeat(22) }, stored);
  return store;
}

function answering(
  result: ServerCallResult<RefreshResponse>,
): ReturnType<typeof vi.fn<Refresh>> {
  return vi.fn<Refresh>(() => Promise.resolve(result));
}

describe("createTokenRenewal", () => {
  it("sends the stored refresh token and stores the new tokens", async () => {
    const store = loggedInStore();
    const refresh = answering({ ok: true, body: renewed });

    await expect(
      createTokenRenewal({ store, server: { refresh } }).renew(),
    ).resolves.toBe("renewed");
    expect(refresh).toHaveBeenCalledWith({ refreshToken: stored.refreshToken });
    expect(store.readSessionTokens()).toEqual(renewed);
  });

  it("sends one request for renewals asked for at the same time", async () => {
    const refresh = answering({ ok: true, body: renewed });
    const renewal = createTokenRenewal({
      store: loggedInStore(),
      server: { refresh },
    });

    const outcomes = await Promise.all([renewal.renew(), renewal.renew()]);

    expect(outcomes).toEqual(["renewed", "renewed"]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("sends a new request once the earlier one is done", async () => {
    const refresh = answering({ ok: true, body: renewed });
    const renewal = createTokenRenewal({
      store: loggedInStore(),
      server: { refresh },
    });

    await renewal.renew();
    await renewal.renew();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("reports the session ended when the server refuses the refresh token", async () => {
    const store = loggedInStore();
    const refresh = answering({
      ok: false,
      failure: ApiErrorCode.InvalidRefreshToken,
    });

    await expect(
      createTokenRenewal({ store, server: { refresh } }).renew(),
    ).resolves.toBe("session-ended");
    expect(store.readSessionTokens()).toEqual(stored);
  });

  it("reports the session ended without a request when no tokens are stored", async () => {
    const store = loggedInStore();
    store.deleteSessionTokens();
    const refresh = answering({ ok: true, body: renewed });

    await expect(
      createTokenRenewal({ store, server: { refresh } }).renew(),
    ).resolves.toBe("session-ended");
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    "SERVER_UNREACHABLE",
    "UNEXPECTED_RESPONSE",
    ApiErrorCode.RateLimited,
  ] as const)(
    "fails for now when the refresh fails with %s",
    async (failure) => {
      const store = loggedInStore();
      const refresh = answering({ ok: false, failure });

      await expect(
        createTokenRenewal({ store, server: { refresh } }).renew(),
      ).resolves.toBe("failed");
      expect(store.readSessionTokens()).toEqual(stored);
    },
  );

  it("discards new tokens when the stored ones were deleted during the request", async () => {
    const store = loggedInStore();
    const refresh = vi.fn<Refresh>(() => {
      store.deleteSessionTokens();
      return Promise.resolve({ ok: true, body: renewed });
    });

    await expect(
      createTokenRenewal({ store, server: { refresh } }).renew(),
    ).resolves.toBe("discarded");
    expect(store.readSessionTokens()).toBeUndefined();
  });

  it("settles once the renewal under way is done", async () => {
    const store = loggedInStore();
    let answer: (result: ServerCallResult<RefreshResponse>) => void = () => {};
    const refresh = vi.fn<Refresh>(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const renewal = createTokenRenewal({ store, server: { refresh } });
    void renewal.renew();
    const settled = renewal.settled().then(() => store.readSessionTokens());

    answer({ ok: true, body: renewed });

    await expect(settled).resolves.toEqual(renewed);
  });
});
