import {
  createPresence,
  type Presence,
  type PresenceAudience,
} from "./presence.js";
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
 * Creates the hub's parts around one empty socket registry, with presence shared among Group Members.
 * Example: `const { presence, sessionSockets } = createLiveHub(groupStore);`
 */
export function createLiveHub(audience: PresenceAudience): LiveHub {
  const socketRegistry = createSocketRegistry();
  const presence = createPresence(socketRegistry, audience);
  return {
    socketRegistry,
    presence,
    sessionSockets: createSessionSockets({ socketRegistry, presence }),
  };
}
