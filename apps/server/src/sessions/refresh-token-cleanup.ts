import type { FastifyInstance } from "fastify";
import type { RefreshTokenStore } from "./refresh-token-store.js";

/** How often expired refresh-token rows are deleted. */
export const REFRESH_TOKEN_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export interface RefreshTokenCleanupDependencies {
  refreshTokenStore: Pick<RefreshTokenStore, "deleteExpired">;
  clock: () => number;
}

export interface RefreshTokenCleanup {
  stop(): void;
}

/**
 * Deletes expired refresh-token rows, used or not, at once and then at every interval.
 * Example: `const cleanup = startRefreshTokenCleanup({ refreshTokenStore, clock }); cleanup.stop();`
 */
export function startRefreshTokenCleanup(
  dependencies: RefreshTokenCleanupDependencies,
): RefreshTokenCleanup {
  const deleteExpired = (): void => {
    dependencies.refreshTokenStore.deleteExpired(dependencies.clock());
  };
  deleteExpired();
  const timer = setInterval(deleteExpired, REFRESH_TOKEN_CLEANUP_INTERVAL_MS);
  timer.unref();
  return { stop: (): void => clearInterval(timer) };
}

/**
 * Runs the cleanup while the app is up: from when it is ready until it closes.
 * Example: `scheduleRefreshTokenCleanup(app, { refreshTokenStore, clock });`
 */
export function scheduleRefreshTokenCleanup(
  app: FastifyInstance,
  dependencies: RefreshTokenCleanupDependencies,
): void {
  let cleanup: RefreshTokenCleanup | undefined;
  app.addHook("onReady", (done) => {
    cleanup = startRefreshTokenCleanup(dependencies);
    done();
  });
  app.addHook("onClose", (_instance, done) => {
    cleanup?.stop();
    done();
  });
}
