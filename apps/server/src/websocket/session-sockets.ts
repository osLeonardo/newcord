import { WebSocketCloseCode } from "@newcord/shared";
import type { DeviceSessionEndedListener } from "../sessions/device-logout.js";
import { closeHubSocket, type HubSocket } from "./hub-socket.js";
import type { Presence } from "./presence.js";
import type { SocketRegistry } from "./socket-registry.js";

/**
 * Closes the authenticated sockets of a Device or of a whole Account, taking them out of
 * presence at once. Logout and reused refresh tokens use it now; password change and
 * recovery (D66) and M2 reuse it.
 */
export interface SessionSockets {
  closeDeviceSockets(deviceId: string, closeCode: WebSocketCloseCode): void;
  closeAccountSockets(userId: number, closeCode: WebSocketCloseCode): void;
}

export interface SessionSocketsDependencies {
  socketRegistry: Pick<SocketRegistry, "socketsOfDevice" | "socketsOfAccount">;
  presence: Pick<Presence, "leave">;
}

/**
 * Creates the closer of a Device's or an Account's sockets.
 * Example: `createSessionSockets({ socketRegistry, presence }).closeDeviceSockets(deviceId, WebSocketCloseCode.SessionEnded);`
 */
export function createSessionSockets(
  dependencies: SessionSocketsDependencies,
): SessionSockets {
  const { socketRegistry, presence } = dependencies;
  const closeAll = (
    sockets: HubSocket[],
    closeCode: WebSocketCloseCode,
  ): void => {
    for (const socket of sockets) leaveAndClose(socket, closeCode, presence);
  };
  return {
    closeDeviceSockets: (deviceId, closeCode): void =>
      closeAll(socketRegistry.socketsOfDevice(deviceId), closeCode),
    closeAccountSockets: (userId, closeCode): void =>
      closeAll(socketRegistry.socketsOfAccount(userId), closeCode),
  };
}

/**
 * Takes a socket out of presence, so others hear at once if its Account went offline,
 * then closes it with `closeCode`.
 * Example: `leaveAndClose(socket, WebSocketCloseCode.EnvelopeRejected, presence);`
 */
export function leaveAndClose(
  socket: HubSocket,
  closeCode: WebSocketCloseCode,
  presence: Pick<Presence, "leave">,
): void {
  presence.leave(socket);
  closeHubSocket(socket, closeCode);
}

/**
 * Builds the listener for a Device's session ending (logout, reused refresh token): it closes
 * that Device's sockets with the session-ended code, then tells `listener`, if any.
 * Example: `createDeviceLogout({ refreshTokenStore, onDeviceSessionEnded: closeSocketsWhenSessionEnds(sessionSockets, undefined) });`
 */
export function closeSocketsWhenSessionEnds(
  sessionSockets: Pick<SessionSockets, "closeDeviceSockets">,
  listener: DeviceSessionEndedListener | undefined,
): DeviceSessionEndedListener {
  return (deviceId: string): void => {
    sessionSockets.closeDeviceSockets(
      deviceId,
      WebSocketCloseCode.SessionEnded,
    );
    listener?.(deviceId);
  };
}
