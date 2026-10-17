import type { HubMessenger } from "../hub/hub-messenger.js";
import type { HubRequestHandlers } from "../hub/hub-requests.js";
import type { MessageQueue } from "../queue/message-queue.js";
import { pushQueued } from "../queue/queue-requests.js";
import type { Presence } from "../websocket/presence.js";
import type { AcceptedCommit, CommitAcceptance } from "./commit-acceptance.js";

export interface CommitRequestDependencies {
  acceptCommit: CommitAcceptance;
  messageQueue: Pick<MessageQueue, "queued">;
  messenger: HubMessenger;
  presence: Pick<Presence, "resendSnapshots">;
}

/**
 * Creates the handler of `mls.commit`: the sender learns the outcome; on acceptance the commit
 * and its welcome go to the online recipients, and everyone in the Group gets fresh presence.
 * Example: `const handlers = createCommitRequestHandlers({ acceptCommit, messageQueue, messenger, presence });`
 */
export function createCommitRequestHandlers(
  dependencies: CommitRequestDependencies,
): Pick<HubRequestHandlers, "mls.commit"> {
  return {
    "mls.commit": (context, envelope): void => {
      const outcome = dependencies.acceptCommit(context.owner, envelope);
      if (!outcome.accepted) {
        dependencies.messenger.reply(context, envelope.requestId, {
          ok: false,
          code: outcome.code,
        });
        return;
      }
      dependencies.messenger.reply(context, envelope.requestId, {
        ok: true,
        seq: outcome.seq,
        epoch: outcome.epoch,
      });
      deliverAcceptedCommit(dependencies, outcome);
    },
  };
}

function deliverAcceptedCommit(
  dependencies: CommitRequestDependencies,
  commit: AcceptedCommit,
): void {
  pushQueued(dependencies, commit.groupId, commit.seq, commit.commitRecipients);
  if (commit.welcome !== undefined) {
    const { seq, recipients } = commit.welcome;
    pushQueued(dependencies, commit.groupId, seq, recipients);
  }
  dependencies.presence.resendSnapshots(commit.affectedUserIds);
}
