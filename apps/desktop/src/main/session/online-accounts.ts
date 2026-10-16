import type {
  PresenceChangeEnvelope,
  PresenceSnapshotEnvelope,
} from "@newcord/shared";

export type PresenceEnvelope =
  PresenceSnapshotEnvelope | PresenceChangeEnvelope;

/**
 * The "online now" list after one presence Envelope: the other online Accounts, sorted by
 * username. A snapshot replaces the list; the person's own Account is never in it.
 * @example applyPresence(["bruno"], { v: 1, type: "presence", kind: "online", username: "carla" }, "alice") // ["bruno", "carla"]
 */
export function applyPresence(
  current: readonly string[],
  envelope: PresenceEnvelope,
  ownUsername: string,
): readonly string[] {
  const online = new Set(envelope.kind === "snapshot" ? [] : current);
  if (envelope.kind === "snapshot") {
    for (const username of envelope.usernames) online.add(username);
  } else if (envelope.kind === "online") {
    online.add(envelope.username);
  } else {
    online.delete(envelope.username);
  }
  online.delete(ownUsername);
  return [...online].sort();
}
