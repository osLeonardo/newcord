import type { HubRequester } from "../hub/hub-requester";
import type { LocalGroups } from "../local-store/local-groups";
import type { LocalMessages } from "../local-store/local-messages";
import type { MlsSession } from "../mls/mls-session";
import type { GroupLanes } from "./group-lanes";

/** What the main process tells the interface about Groups, so its screens refresh. */
export interface GroupEvents {
  groupsChanged(): void;
  invitationsChanged(): void;
  /** The Group's chat history changed; its ID is the base64url text Envelopes carry. */
  messagesChanged(groupId: string): void;
}

/** Everything the Group features share for the logged-in Device. */
export interface GroupContext {
  readonly mls: MlsSession;
  readonly requester: HubRequester;
  readonly localGroups: LocalGroups;
  readonly localMessages: LocalMessages;
  readonly lanes: GroupLanes;
  /** This Device's credential identity, `<username>:<deviceId>` (D70). */
  readonly ownIdentity: string;
  /** Confirms a delivery, so the server deletes this Device's copy (D9). */
  readonly sendAck: (groupId: Uint8Array, seq: number) => void;
  readonly events: GroupEvents;
  readonly reportError: (error: unknown) => void;
  /** The current time, in milliseconds. */
  readonly now: () => number;
}

/**
 * Forgets a Group the Device left or was removed from, with its whole history (#6's spec).
 * @example forgetGroup(context, groupId);
 */
export function forgetGroup(context: GroupContext, groupId: Uint8Array): void {
  context.localGroups.remove(groupId);
  context.localMessages.removeGroup(groupId);
  context.events.groupsChanged();
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
