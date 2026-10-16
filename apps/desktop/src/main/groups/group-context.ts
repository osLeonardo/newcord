import type { HubRequester } from "../hub/hub-requester";
import type { LocalGroups } from "../local-store/local-groups";
import type { MlsSession } from "../mls/mls-session";
import type { GroupLanes } from "./group-lanes";

/** What the main process tells the interface about Groups, so its screens refresh. */
export interface GroupEvents {
  groupsChanged(): void;
  invitationsChanged(): void;
}

/** Everything the Group features share for the logged-in Device. */
export interface GroupContext {
  readonly mls: MlsSession;
  readonly requester: HubRequester;
  readonly localGroups: LocalGroups;
  readonly lanes: GroupLanes;
  /** This Device's credential identity, `<username>:<deviceId>` (D70). */
  readonly ownIdentity: string;
  /** Confirms a delivery, so the server deletes this Device's copy (D9). */
  readonly sendAck: (groupId: Uint8Array, seq: number) => void;
  readonly events: GroupEvents;
  readonly reportError: (error: unknown) => void;
}

/**
 * A Group ID as Envelopes carry it: base64url without padding.
 * @example groupIdText(new Uint8Array(16)) // "AAAAAAAAAAAAAAAAAAAAAA"
 */
export function groupIdText(groupId: Uint8Array): string {
  return Buffer.from(groupId).toString("base64url");
}

/**
 * The bytes of a Group ID from an Envelope, which the shared schema already checked.
 * @example groupIdFromText("AAAAAAAAAAAAAAAAAAAAAA").length // 16
 */
export function groupIdFromText(groupId: string): Uint8Array {
  return new Uint8Array(Buffer.from(groupId, "base64url"));
}

/** Bytes as an Envelope's base64 payload. */
export function payloadText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** A base64 payload from an Envelope as bytes. */
export function payloadBytes(payload: string): Uint8Array {
  return new Uint8Array(Buffer.from(payload, "base64"));
}
