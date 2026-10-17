import type { MlsProposalDeliveryEnvelope } from "@newcord/shared";
import type {
  GroupActionResult,
  GroupMemberSummary,
} from "../../preload/group-api";
import {
  parseCredentialIdentity,
  type DeviceIdentity,
} from "../mls/credential-identity";
import type { IncomingMls } from "../mls/mls-engine";
import { commitChange, type CommitOutcome } from "./group-commits";
import {
  forgetGroup,
  groupIdFromText,
  payloadText,
  type GroupContext,
} from "./group-context";

/** How often a Device retries removing someone after another Member's commit won the epoch. */
const REMOVE_ATTEMPTS = 3;

type RemovalOutcome = CommitOutcome | "gone";

/**
 * The Group's people, each once with their number of Devices, read from the MLS state (D70).
 * @example listGroupMembers(context, groupId) // [{ username: "alice", deviceCount: 2, self: true }]
 */
export function listGroupMembers(
  context: GroupContext,
  groupId: string,
): GroupMemberSummary[] {
  const id = groupIdFromText(groupId);
  if (!context.localGroups.has(id)) return [];
  const ownUsername = parseCredentialIdentity(context.ownIdentity)?.username;
  const counts = new Map<string, number>();
  for (const device of memberDevices(context, id)) {
    counts.set(device.username, (counts.get(device.username) ?? 0) + 1);
  }
  return [...counts]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([username, deviceCount]) => ({
      username,
      deviceCount,
      self: username === ownUsername,
    }));
}

/**
 * Removes every Device of a person in one commit declaring them all; after it they read nothing new.
 * @example await removeGroupMember(context, groupId, "bruno");
 */
export async function removeGroupMember(
  context: GroupContext,
  groupId: string,
  username: string,
): Promise<GroupActionResult> {
  const id = groupIdFromText(groupId);
  if (!context.localGroups.has(id)) {
    return { outcome: "refused", refusal: "NOT_IN_GROUP" };
  }
  if (username === parseCredentialIdentity(context.ownIdentity)?.username) {
    return { outcome: "refused", refusal: "CANNOT_REMOVE_SELF" };
  }
  const outcome = await removeWithRetries(context, id, username);
  if (outcome === "accepted") return { outcome: "done" };
  if (outcome === "gone") {
    return { outcome: "refused", refusal: "PERSON_NOT_IN_GROUP" };
  }
  return {
    outcome: "refused",
    refusal: outcome === "failed" ? "CONNECTION_LOST" : "INVALID_CHANGE",
  };
}

/**
 * Leaves: sends this Device's removal request, and once the server has it forgets the Group and
 * its history here; the next Member online commits the removal (D57).
 * @example await leaveGroup(context, groupId);
 */
export async function leaveGroup(
  context: GroupContext,
  groupId: string,
): Promise<GroupActionResult> {
  const id = groupIdFromText(groupId);
  if (!context.localGroups.has(id)) {
    return { outcome: "refused", refusal: "NOT_IN_GROUP" };
  }
  const reply = await context.lanes.run(id, () =>
    context.mls.runThenSend(
      (engine) => engine.leaveGroup(id),
      (proposal) =>
        context.requester.request({
          type: "mls.proposal",
          groupId,
          proposal: payloadText(proposal),
        }),
    ),
  );
  if (!reply.ok) return { outcome: "refused", refusal: reply.code };
  forgetGroup(context, id, "left");
  return { outcome: "done" };
}

/**
 * Completes another Member's leave request by removing all of their Devices, as the server
 * already stopped delivering to them (D57). Every online Member may try; the first commit wins.
 * @example leaveRequested(context, groupId, delivery, proposal);
 */
export function leaveRequested(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: MlsProposalDeliveryEnvelope,
  proposal: Extract<IncomingMls, { kind: "proposal" }>,
): void {
  const leaver = parseCredentialIdentity(proposal.sender);
  if (leaver === undefined) {
    throw new Error(
      `A leave request in Group ${delivery.groupId} came from the credential "${proposal.sender}"; expected <username>:<deviceId>`,
    );
  }
  void removeWithRetries(context, groupId, leaver.username).catch(
    context.reportError,
  );
}

/** A lost race is retried after the winning commit, which usually leaves nobody to remove. */
async function removeWithRetries(
  context: GroupContext,
  groupId: Uint8Array,
  username: string,
): Promise<RemovalOutcome> {
  let outcome: RemovalOutcome = "lost-race";
  for (
    let attempt = 0;
    attempt < REMOVE_ATTEMPTS && outcome === "lost-race";
    attempt += 1
  ) {
    outcome = await context.lanes.run(groupId, () =>
      removeAccountDevices(context, groupId, username),
    );
  }
  return outcome;
}

function removeAccountDevices(
  context: GroupContext,
  groupId: Uint8Array,
  username: string,
): Promise<RemovalOutcome> {
  if (!context.localGroups.has(groupId)) return Promise.resolve("gone");
  const devices = memberDevices(context, groupId).filter(
    (device) => device.username === username,
  );
  if (devices.length === 0) return Promise.resolve("gone");
  const identities = devices.map(
    (device) => `${device.username}:${device.deviceId}`,
  );
  return commitChange(
    context,
    groupId,
    (engine) => engine.removeMembers(groupId, identities),
    { added: [], removed: devices.map((device) => device.deviceId) },
  );
}

function memberDevices(
  context: GroupContext,
  groupId: Uint8Array,
): DeviceIdentity[] {
  return context.mls
    .read((engine) => engine.groupMembers(groupId))
    .map(parseCredentialIdentity)
    .filter((device) => device !== undefined);
}
