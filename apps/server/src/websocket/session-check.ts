import { WebSocketCloseCode } from "@newcord/shared";
import type { FastifyInstance } from "fastify";
import { runWhileAppIsUp, startRepeatingTask } from "../repeating-task.js";
import type { RefreshTokenStore } from "../sessions/refresh-token-store.js";
import type { SessionSockets } from "./session-sockets.js";
import type { SocketRegistry } from "./socket-registry.js";

/** A socket outlives its 15-minute access token, so sessions are checked this often (08-m1-build step 5). */
export const LIVE_SESSION_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface LiveSessionCheckDependencies {
  socketRegistry: Pick<SocketRegistry, "connectedDeviceIds">;
  sessionSockets: Pick<SessionSockets, "closeDeviceSockets">;
  refreshTokenStore: Pick<RefreshTokenStore, "hasUsableToken">;
  clock: () => number;
}

/**
 * Closes, with the session-ended code, the sockets of every connected Device that no longer
 * has an unused, unexpired refresh token, so a logged-out Device stops listening.
 * Example: `checkLiveSessions({ socketRegistry, sessionSockets, refreshTokenStore, clock });`
 */
export function checkLiveSessions(
  dependencies: LiveSessionCheckDependencies,
): void {
  const now = dependencies.clock();
  for (const deviceId of dependencies.socketRegistry.connectedDeviceIds()) {
    if (dependencies.refreshTokenStore.hasUsableToken(deviceId, now)) continue;
    dependencies.sessionSockets.closeDeviceSockets(
      deviceId,
      WebSocketCloseCode.SessionEnded,
    );
  }
}

/**
 * Runs the session check every 15 minutes while the app is up.
 * Example: `scheduleLiveSessionCheck(app, { socketRegistry, sessionSockets, refreshTokenStore, clock });`
 */
export function scheduleLiveSessionCheck(
  app: FastifyInstance,
  dependencies: LiveSessionCheckDependencies,
): void {
  runWhileAppIsUp(app, () =>
    startRepeatingTask(
      () => checkLiveSessions(dependencies),
      LIVE_SESSION_CHECK_INTERVAL_MS,
    ),
  );
}
