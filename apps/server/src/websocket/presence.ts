import { PROTOCOL_VERSION, type PresenceChangeEnvelope } from "@newcord/shared";
import { sendEnvelope, type HubSocket } from "./hub-socket.js";
import type { SocketOwner, SocketRegistry } from "./socket-registry.js";

/** Tells connected clients who is online: every one of them in M1; M2 narrows it to Group Members. */
export interface Presence {
  /** Registers an authenticated socket, tells the others if its Account just came online, then sends it the snapshot. */
  join(socket: HubSocket, owner: SocketOwner): void;
  /** Forgets a socket and tells the others if its Account just went offline; ignores sockets it does not know. */
  leave(socket: HubSocket): void;
}

/**
 * Creates presence on a registry: an Account is online while any of its Devices has an authenticated socket.
 * Example: `const presence = createPresence(registry); presence.join(socket, owner);`
 */
export function createPresence(registry: SocketRegistry): Presence {
  return {
    join: (socket, owner): void => {
      if (!registry.isAccountOnline(owner.userId)) {
        broadcastChange(registry, "online", owner.username);
      }
      registry.add(socket, owner);
      sendSnapshot(registry, socket);
    },
    leave: (socket): void => {
      const owner = registry.remove(socket);
      if (owner === undefined || registry.isAccountOnline(owner.userId)) return;
      broadcastChange(registry, "offline", owner.username);
    },
  };
}

function sendSnapshot(registry: SocketRegistry, socket: HubSocket): void {
  sendEnvelope(socket, {
    v: PROTOCOL_VERSION,
    type: "presence",
    kind: "snapshot",
    usernames: registry.onlineUsernames(),
  });
}

/** Sends the change to every registered socket; the socket that caused it is never registered at that moment. */
function broadcastChange(
  registry: SocketRegistry,
  kind: PresenceChangeEnvelope["kind"],
  username: string,
): void {
  const envelope: PresenceChangeEnvelope = {
    v: PROTOCOL_VERSION,
    type: "presence",
    kind,
    username,
  };
  for (const socket of registry.allSockets()) sendEnvelope(socket, envelope);
}
