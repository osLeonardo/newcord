import { HubErrorCode, type MlsCommitEnvelope } from "@newcord/shared";
import type Database from "better-sqlite3";
import type { DeviceStore } from "../devices/device-store.js";
import { groupIdBytes } from "../groups/group-requests.js";
import type { GroupMember, GroupStore } from "../groups/group-store.js";
import type { InvitationStore } from "../invitations/invitation-store.js";
import type { MessageQueue } from "../queue/message-queue.js";
import type { SocketOwner } from "../websocket/socket-registry.js";
import { commitRefusal } from "./commit-check.js";

/** What an accepted commit queued, and for whom, so it can be pushed to online Devices. */
export interface AcceptedCommit {
  accepted: true;
  groupId: Buffer;
  seq: number;
  epoch: number;
  commitRecipients: string[];
  welcome?: { seq: number; recipients: string[] };
  /** Every Account in the Group before or after a commit that changed its Members: their presence audiences may differ. */
  affectedUserIds: number[];
}

export type CommitOutcome =
  AcceptedCommit | { accepted: false; code: HubErrorCode };

export interface CommitAcceptanceDependencies {
  database: Database.Database;
  groupStore: Pick<GroupStore, "epochOf" | "membersOf" | "applyChange">;
  invitationStore: Pick<
    InvitationStore,
    "hasAcceptedInvitation" | "closeAccepted"
  >;
  deviceStore: Pick<DeviceStore, "ownerOf">;
  messageQueue: Pick<MessageQueue, "enqueue">;
  clock: () => number;
}

/** Decides a commit; check and change happen in one transaction, so two commits for one epoch cannot both win. */
export type CommitAcceptance = (
  sender: SocketOwner,
  envelope: MlsCommitEnvelope,
) => CommitOutcome;

/**
 * Creates the commit acceptance: the first valid commit for each epoch wins, gets the next sequence
 * number and is queued for every Device that was a Member before it, the removed ones included; its
 * welcome follows at once for the Devices it adds (09-m2-build step 7).
 * Example: `const outcome = createCommitAcceptance(dependencies)(context.owner, envelope);`
 */
export function createCommitAcceptance(
  dependencies: CommitAcceptanceDependencies,
): CommitAcceptance {
  return dependencies.database.transaction(
    (sender: SocketOwner, envelope: MlsCommitEnvelope): CommitOutcome =>
      decideCommit(dependencies, sender, envelope),
  );
}

function decideCommit(
  dependencies: CommitAcceptanceDependencies,
  sender: SocketOwner,
  envelope: MlsCommitEnvelope,
): CommitOutcome {
  const groupId = groupIdBytes(envelope.groupId);
  const epoch = dependencies.groupStore.epochOf(groupId);
  const members = dependencies.groupStore.membersOf(groupId);
  if (epoch === undefined || !isActiveMember(members, sender.deviceId)) {
    return { accepted: false, code: HubErrorCode.NotAMember };
  }
  const refusal = commitRefusal(
    { ...envelope, hasWelcome: envelope.welcome !== undefined },
    {
      epoch,
      members,
      ownerOf: (deviceId) => dependencies.deviceStore.ownerOf(deviceId),
      hasAcceptedInvitation: (userId) =>
        dependencies.invitationStore.hasAcceptedInvitation(groupId, userId),
    },
  );
  if (refusal !== undefined) return { accepted: false, code: refusal };
  return applyCommit(dependencies, sender, envelope, members);
}

function isActiveMember(
  members: readonly GroupMember[],
  deviceId: string,
): boolean {
  return members.some(
    (member) => member.deviceId === deviceId && !member.leaving,
  );
}

function applyCommit(
  dependencies: CommitAcceptanceDependencies,
  sender: SocketOwner,
  envelope: MlsCommitEnvelope,
  members: readonly GroupMember[],
): AcceptedCommit {
  const groupId = groupIdBytes(envelope.groupId);
  const commitRecipients = members
    .filter((member) => !member.leaving && member.deviceId !== sender.deviceId)
    .map((member) => member.deviceId);
  const seq = queueCommit(dependencies, sender, envelope, commitRecipients);
  dependencies.groupStore.applyChange(
    groupId,
    envelope.removed,
    envelope.added,
  );
  const addedOwners = ownersOf(dependencies, envelope.added);
  dependencies.invitationStore.closeAccepted(groupId, addedOwners);
  return {
    accepted: true,
    groupId,
    seq,
    epoch: envelope.epoch + 1,
    commitRecipients,
    ...queueWelcome(dependencies, sender, envelope),
    affectedUserIds: membershipChanged(envelope)
      ? [
          ...new Set([
            ...members.map((member) => member.userId),
            ...addedOwners,
          ]),
        ]
      : [],
  };
}

function membershipChanged(envelope: MlsCommitEnvelope): boolean {
  return envelope.added.length > 0 || envelope.removed.length > 0;
}

function queueCommit(
  dependencies: CommitAcceptanceDependencies,
  sender: SocketOwner,
  envelope: MlsCommitEnvelope,
  recipients: readonly string[],
): number {
  return dependencies.messageQueue.enqueue({
    groupId: groupIdBytes(envelope.groupId),
    kind: "commit",
    senderDeviceId: sender.deviceId,
    payload: Buffer.from(envelope.commit, "base64"),
    declared: {
      epoch: envelope.epoch,
      added: envelope.added,
      removed: envelope.removed,
    },
    recipients,
    createdAt: dependencies.clock(),
  });
}

function queueWelcome(
  dependencies: CommitAcceptanceDependencies,
  sender: SocketOwner,
  envelope: MlsCommitEnvelope,
): Pick<AcceptedCommit, "welcome"> {
  if (envelope.welcome === undefined) return {};
  const recipients = [...envelope.added];
  const seq = dependencies.messageQueue.enqueue({
    groupId: groupIdBytes(envelope.groupId),
    kind: "welcome",
    senderDeviceId: sender.deviceId,
    payload: Buffer.from(envelope.welcome, "base64"),
    recipients,
    createdAt: dependencies.clock(),
  });
  return { welcome: { seq, recipients } };
}

function ownersOf(
  dependencies: Pick<CommitAcceptanceDependencies, "deviceStore">,
  deviceIds: readonly string[],
): number[] {
  return deviceIds
    .map((deviceId) => dependencies.deviceStore.ownerOf(deviceId))
    .filter((owner) => owner !== undefined);
}
