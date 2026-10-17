import type { GroupLeftNotice } from "../../preload/group-api";
import type { HubRequester } from "../hub/hub-requester";
import type { LocalGroups } from "../local-store/local-groups";
import type { LocalMessages } from "../local-store/local-messages";
import type { VerifiedMarks } from "../local-store/verified-marks";
import type { SafetyHalves } from "../safety/safety-numbers";
import type { MlsSession } from "../mls/mls-session";
import type { GroupLanes } from "./group-lanes";

/** What the main process tells the interface about Groups, so its screens refresh. */
export interface GroupEvents {
  groupsChanged(): void;
  invitationsChanged(): void;
  /** The Group's chat history changed; its ID is the base64url text Envelopes carry. */
  messagesChanged(groupId: string): void;
  /** This Device is no longer in the Group. */
  groupLeft(notice: GroupLeftNotice): void;
  /** The Account's block list changed. */
  blocksChanged(): void;
}

/** The Account's block list as the server last sent it (D57); kept in memory only. */
export interface BlockList {
  usernames(): readonly string[];
  replace(usernames: readonly string[]): void;
}

/**
 * Creates an empty block list; the server sends the real one right after `hello`.
 * @example const blocks = createBlockList(); blocks.replace(["bruno"]);
 */
export function createBlockList(): BlockList {
  let blocked: readonly string[] = [];
  return {
    usernames: (): readonly string[] => blocked,
    replace: (usernames): void => {
      blocked = [...usernames];
    },
  };
}

/** Everything the Group features share for the logged-in Device. */
export interface GroupContext {
  readonly mls: MlsSession;
  readonly requester: HubRequester;
  readonly localGroups: LocalGroups;
  readonly localMessages: LocalMessages;
  readonly blockList: BlockList;
  readonly verifiedMarks: VerifiedMarks;
  readonly safetyHalves: SafetyHalves;
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
 * @example forgetGroup(context, groupId, "removed");
 */
export function forgetGroup(
  context: GroupContext,
  groupId: Uint8Array,
  reason: GroupLeftNotice["reason"],
): void {
  const name =
    context.localGroups
      .list()
      .find((group) => sameGroup(group.groupId, groupId))?.name ?? "";
  context.localGroups.remove(groupId);
  context.localMessages.removeGroup(groupId);
  context.events.groupsChanged();
  context.events.groupLeft({ groupId: groupIdText(groupId), name, reason });
}

function sameGroup(first: Uint8Array, second: Uint8Array): boolean {
  return Buffer.from(first).equals(Buffer.from(second));
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
