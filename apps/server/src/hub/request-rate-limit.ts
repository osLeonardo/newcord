import type { RateLimitSetting } from "../rate-limits.js";

/** Counts requests per key in fixed time windows, for WebSocket requests the HTTP limiter cannot see. */
export interface RequestRateLimit {
  /** Counts one request for `key`; false once the key used up its window's allowance. */
  tryCount(key: string): boolean;
}

interface KeyWindow {
  startedAt: number;
  count: number;
}

/**
 * Creates an in-memory limit: there is one server process (D52).
 * Example: `const invitations = createRequestRateLimit(INVITATION_RATE_LIMIT, clock); if (!invitations.tryCount(String(userId))) refuse();`
 */
export function createRequestRateLimit(
  setting: RateLimitSetting,
  clock: () => number,
): RequestRateLimit {
  const windows = new Map<string, KeyWindow>();
  return {
    tryCount: (key): boolean => {
      const now = clock();
      const current = windows.get(key);
      const window =
        current === undefined || now - current.startedAt >= setting.timeWindow
          ? { startedAt: now, count: 0 }
          : current;
      window.count += 1;
      windows.set(key, window);
      return window.count <= setting.max;
    },
  };
}
