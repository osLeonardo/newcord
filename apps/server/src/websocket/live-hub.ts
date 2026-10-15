import { createPresence, type Presence } from "./presence.js";
import {
  createSessionSockets,
  type SessionSockets,
} from "./session-sockets.js";
import {
  createSocketRegistry,
  type SocketRegistry,
} from "./socket-registry.js";

/** The WebSocket hub's shared state: one registry, the presence on it, and the closer of sessions. */
export interface LiveHub {
  socketRegistry: SocketRegistry;
  presence: Presence;
  sessionSockets: SessionSockets;
}

/**
 * Creates the hub's parts around one empty socket registry.
 * Example: `const { presence, sessionSockets } = createLiveHub();`
 */
export function createLiveHub(): LiveHub {
  const socketRegistry = createSocketRegistry();
  const presence = createPresence(socketRegistry);
  return {
    socketRegistry,
    presence,
    sessionSockets: createSessionSockets({ socketRegistry, presence }),
  };
}
