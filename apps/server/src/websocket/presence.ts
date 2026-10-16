import { PROTOCOL_VERSION, type PresenceChangeEnvelope } from "@newcord/shared";
import { sendEnvelope, type HubSocket } from "./hub-socket.js";
import type { SocketOwner, SocketRegistry } from "./socket-registry.js";

/** Who sees an Account online: the other Accounts sharing a Group with it (09-m2-build step 7). */
export interface PresenceAudience {
  coMemberUserIdsOf(userId: number): readonly number[];
}

/** Tells connected clients which Accounts sharing a Group with theirs are online. */
export interface Presence {
  /** Registers an authenticated socket, tells its audience if its Account just came online, then sends it the snapshot. */
  join(socket: HubSocket, owner: SocketOwner): void;
  /** Forgets a socket and tells its audience if its Account just went offline; ignores sockets it does not know. */
  leave(socket: HubSocket): void;
  /** Sends every socket of these Accounts a fresh snapshot, after the Groups they share changed. */
  resendSnapshots(userIds: Iterable<number>): void;
}

/**
 * Creates presence on a registry: an Account is online while any of its Devices has an
 * authenticated socket, and only Accounts sharing a Group hear about each other.
 * Example: `const presence = createPresence(registry, groupStore); presence.join(socket, owner);`
 */
export function createPresence(
  registry: SocketRegistry,
  audience: PresenceAudience,
): Presence {
  return {
    join: (socket, owner): void => {
      if (!registry.isAccountOnline(owner.userId)) {
        broadcastChange(registry, audience, "online", owner);
      }
      registry.add(socket, owner);
      sendSnapshot(registry, audience, socket, owner);
    },
    leave: (socket): void => {
      const owner = registry.remove(socket);
      if (owner === undefined || registry.isAccountOnline(owner.userId)) return;
      broadcastChange(registry, audience, "offline", owner);
    },
    resendSnapshots: (userIds): void => {
      for (const userId of new Set(userIds)) {
        for (const [socket, owner] of registry.connectionsOfAccount(userId)) {
          sendSnapshot(registry, audience, socket, owner);
        }
      }
    },
  };
}

/** The snapshot names the socket's own Account too, as in M1; the app leaves it out. */
function sendSnapshot(
  registry: SocketRegistry,
  audience: PresenceAudience,
  socket: HubSocket,
  owner: SocketOwner,
): void {
  const coMembers = audience.coMemberUserIdsOf(owner.userId);
  sendEnvelope(socket, {
    v: PROTOCOL_VERSION,
    type: "presence",
    kind: "snapshot",
    usernames: registry.onlineUsernamesAmong([owner.userId, ...coMembers]),
  });
}

/** The socket that caused the change is never registered at that moment. */
function broadcastChange(
  registry: SocketRegistry,
  audience: PresenceAudience,
  kind: PresenceChangeEnvelope["kind"],
  owner: SocketOwner,
): void {
  const envelope: PresenceChangeEnvelope = {
    v: PROTOCOL_VERSION,
    type: "presence",
    kind,
    username: owner.username,
  };
  for (const userId of audience.coMemberUserIdsOf(owner.userId)) {
    for (const socket of registry.socketsOfAccount(userId)) {
      sendEnvelope(socket, envelope);
    }
  }
}
