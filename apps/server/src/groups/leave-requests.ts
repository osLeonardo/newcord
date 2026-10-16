import { HubErrorCode, type MlsProposalEnvelope } from "@newcord/shared";
import type Database from "better-sqlite3";
import type { HubContext, HubMessenger } from "../hub/hub-messenger.js";
import type { HubRequestHandlers } from "../hub/hub-requests.js";
import type { MessageQueue } from "../queue/message-queue.js";
import { pushQueued } from "../queue/queue-requests.js";
import type { Presence } from "../websocket/presence.js";
import { groupIdBytes } from "./group-requests.js";
import type { GroupStore } from "./group-store.js";

export interface LeaveRequestDependencies {
  database: Database.Database;
  groupStore: Pick<
    GroupStore,
    | "isActiveMember"
    | "markAccountLeaving"
    | "activeMemberDeviceIds"
    | "membersOf"
  >;
  messageQueue: Pick<MessageQueue, "enqueue" | "dropDeliveriesTo" | "queued">;
  messenger: HubMessenger;
  presence: Pick<Presence, "resendSnapshots">;
  clock: () => number;
}

interface QueuedLeave {
  seq: number;
  recipients: string[];
  affectedUserIds: number[];
}

/**
 * Creates the handler of `mls.proposal`, a Member's leave request: its Account stops receiving
 * the Group at once and drops out of its presence, and the request goes to the other Members so
 * the next one online commits the removal (D57).
 * Example: `const handlers = createLeaveRequestHandlers(dependencies);`
 */
export function createLeaveRequestHandlers(
  dependencies: LeaveRequestDependencies,
): Pick<HubRequestHandlers, "mls.proposal"> {
  const leave = dependencies.database.transaction(
    (context: HubContext, envelope: MlsProposalEnvelope): QueuedLeave =>
      queueLeave(dependencies, context, envelope),
  );
  return {
    "mls.proposal": (context, envelope): void => {
      const groupId = groupIdBytes(envelope.groupId);
      if (
        !dependencies.groupStore.isActiveMember(groupId, context.owner.deviceId)
      ) {
        dependencies.messenger.reply(context, envelope.requestId, {
          ok: false,
          code: HubErrorCode.NotAMember,
        });
        return;
      }
      const queued = leave(context, envelope);
      dependencies.messenger.reply(context, envelope.requestId, {
        ok: true,
        seq: queued.seq,
      });
      pushQueued(dependencies, groupId, queued.seq, queued.recipients);
      dependencies.presence.resendSnapshots(queued.affectedUserIds);
    },
  };
}

function queueLeave(
  dependencies: LeaveRequestDependencies,
  context: HubContext,
  envelope: MlsProposalEnvelope,
): QueuedLeave {
  const groupId = groupIdBytes(envelope.groupId);
  const { groupStore, messageQueue } = dependencies;
  const leavingDevices = groupStore.markAccountLeaving(
    groupId,
    context.owner.userId,
  );
  messageQueue.dropDeliveriesTo(groupId, leavingDevices);
  const recipients = groupStore.activeMemberDeviceIds(groupId);
  const seq = messageQueue.enqueue({
    groupId,
    kind: "proposal",
    senderDeviceId: context.owner.deviceId,
    payload: Buffer.from(envelope.proposal, "base64"),
    recipients,
    createdAt: dependencies.clock(),
  });
  const members = groupStore.membersOf(groupId).map((member) => member.userId);
  return { seq, recipients, affectedUserIds: [...new Set(members)] };
}
