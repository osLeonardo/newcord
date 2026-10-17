import type { MlsCommitDeliveryEnvelope } from "@newcord/shared";
import type { IncomingMls } from "../mls/mls-engine";
import { noticesForCommit, type CommitFacts } from "./commit-review";
import { groupIdText, type GroupContext } from "./group-context";

/** What this Device's own commit declared. */
export interface OwnDeclaration {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/**
 * Checks a commit another Device sent against its declaration and the 10-person limit, and keeps
 * the notices it earns at its position in the chat (D56, D71). The commit is already applied.
 * @example recordReceivedCommit(context, groupId, delivery, commit);
 */
export function recordReceivedCommit(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: MlsCommitDeliveryEnvelope,
  commit: Extract<IncomingMls, { kind: "commit" }>,
): void {
  record(context, groupId, delivery.seq, {
    sender: commit.sender,
    declaredAdded: delivery.added,
    declaredRemoved: delivery.removed,
    realAdded: commit.added,
    realRemoved: commit.removed,
    membersAfter: context.mls.read((engine) => engine.groupMembers(groupId)),
  });
}

/**
 * Records the notices of this Device's own merged commit, such as a Member's new Device it added.
 * @example recordOwnCommit(context, groupId, reply.seq, membersBefore, declared);
 */
export function recordOwnCommit(
  context: GroupContext,
  groupId: Uint8Array,
  seq: number,
  membersBefore: readonly string[],
  declared: OwnDeclaration,
): void {
  const membersAfter = context.mls.read((engine) =>
    engine.groupMembers(groupId),
  );
  record(context, groupId, seq, {
    sender: context.ownIdentity,
    declaredAdded: declared.added,
    declaredRemoved: declared.removed,
    realAdded: membersAfter.filter((member) => !membersBefore.includes(member)),
    realRemoved: membersBefore.filter(
      (member) => !membersAfter.includes(member),
    ),
    membersAfter,
  });
}

function record(
  context: GroupContext,
  groupId: Uint8Array,
  seq: number,
  facts: CommitFacts,
): void {
  const notices = noticesForCommit(facts);
  if (notices.length === 0) return;
  context.localMessages.addNotices(groupId, seq, notices);
  context.events.messagesChanged(groupIdText(groupId));
}
