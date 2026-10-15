import type { WebsocketPluginOptions } from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { IncomingSocket } from "./hub-socket.js";
import {
  openHubConnection,
  type HubConnectionDependencies,
} from "./hub-connection.js";

/** Largest WebSocket message: 64 KiB (08-m1-build Settings), measured again in M2. */
export const MAX_ENVELOPE_BYTES = 64 * 1024;

/** @fastify/websocket settings: `ws` closes a socket with 1009 when a message exceeds the limit. */
export const WEBSOCKET_PLUGIN_OPTIONS: WebsocketPluginOptions = {
  options: { maxPayload: MAX_ENVELOPE_BYTES },
};

/**
 * Adds the WebSocket hub at `GET /ws`; the access token travels in `hello`, never in the URL.
 * Example: `registerWebSocketRoute(app, { accessTokenVerifier, accountStore, presence });`
 */
export function registerWebSocketRoute(
  app: FastifyInstance,
  dependencies: HubConnectionDependencies,
): void {
  app.get("/ws", { websocket: true }, (socket: IncomingSocket): void => {
    openHubConnection(socket, dependencies);
  });
}
