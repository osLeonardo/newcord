import type { RegisterResponse } from "@newcord/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFRESH_TOKEN_CLEANUP_INTERVAL_MS,
  startRefreshTokenCleanup,
} from "../src/sessions/refresh-token-cleanup.js";
import {
  fastFakeHasher,
  refresh,
  refreshTokenRow,
  signUp,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startRefreshTokenCleanup", () => {
  const deleteExpired = vi.fn((): number => 0);
  let now: number;

  beforeEach(() => {
    deleteExpired.mockClear();
    now = NOW;
  });

  const start = (): ReturnType<typeof startRefreshTokenCleanup> =>
    startRefreshTokenCleanup({
      refreshTokenStore: { deleteExpired },
      clock: () => now,
    });

  it("runs every 15 minutes", () => {
    expect(REFRESH_TOKEN_CLEANUP_INTERVAL_MS).toBe(FIFTEEN_MINUTES_MS);
  });

  it("deletes expired tokens at once, then at each interval with the clock's time", () => {
    const cleanup = start();
    now = NOW + 5;
    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);
    cleanup.stop();

    expect(deleteExpired.mock.calls).toEqual([[NOW], [NOW + 5]]);
  });

  it("stops when asked and leaves no timer behind", () => {
    const cleanup = start();

    cleanup.stop();
    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS * 4);

    expect(deleteExpired).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the server's refresh-token cleanup", () => {
  let server: TestServer;
  let now: number;
  let alice: RegisterResponse;

  beforeEach(async () => {
    now = NOW;
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      clock: () => now,
    });
    alice = (await signUp(server.app)).body;
  });

  afterEach(async () => {
    await server.close();
  });

  it("deletes used and expired rows once they expire, without a request", async () => {
    const newest = (await refresh(server.app, alice.refreshToken)).json<{
      refreshToken: string;
    }>();
    now = NOW + 60_000;
    const later = (await refresh(server.app, newest.refreshToken)).json<{
      refreshToken: string;
    }>();

    now = NOW + THIRTY_DAYS_MS;
    vi.advanceTimersByTime(FIFTEEN_MINUTES_MS);

    expect(
      refreshTokenRow(server.database, alice.refreshToken),
    ).toBeUndefined();
    expect(
      refreshTokenRow(server.database, newest.refreshToken),
    ).toBeUndefined();
    expect(refreshTokenRow(server.database, later.refreshToken)).toBeDefined();
  });

  it("stops its timer when the server closes", async () => {
    expect(vi.getTimerCount()).toBe(1);

    await server.app.close();

    expect(vi.getTimerCount()).toBe(0);
  });
});
