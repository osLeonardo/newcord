import type { FastifyInstance } from "fastify";
import {
  runWhileAppIsUp,
  startRepeatingTask,
  type RepeatingTask,
} from "../repeating-task.js";
import type { RefreshTokenStore } from "./refresh-token-store.js";

/** How often expired refresh-token rows are deleted. */
export const REFRESH_TOKEN_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export interface RefreshTokenCleanupDependencies {
  refreshTokenStore: Pick<RefreshTokenStore, "deleteExpired">;
  clock: () => number;
}

export type RefreshTokenCleanup = RepeatingTask;

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
  return startRepeatingTask(deleteExpired, REFRESH_TOKEN_CLEANUP_INTERVAL_MS);
}

/**
 * Runs the cleanup while the app is up: from when it is ready until it closes.
 * Example: `scheduleRefreshTokenCleanup(app, { refreshTokenStore, clock });`
 */
export function scheduleRefreshTokenCleanup(
  app: FastifyInstance,
  dependencies: RefreshTokenCleanupDependencies,
): void {
  runWhileAppIsUp(app, () => startRefreshTokenCleanup(dependencies));
}
