import {
  HubErrorCode,
  type AckEnvelope,
  type MlsMessageEnvelope,
} from "@newcord/shared";
import { groupIdBytes } from "../groups/group-requests.js";
import type { GroupStore } from "../groups/group-store.js";
import type { HubContext, HubMessenger } from "../hub/hub-messenger.js";
import type { HubRequestHandlers } from "../hub/hub-requests.js";
import { deliveryEnvelope } from "./delivery-envelopes.js";
import type { MessageQueue } from "./message-queue.js";

export interface QueueRequestDependencies {
  groupStore: Pick<GroupStore, "isActiveMember" | "activeMemberDeviceIds">;
  messageQueue: MessageQueue;
  messenger: HubMessenger;
  clock: () => number;
}

/**
 * Creates the handlers of `mls.message` and `ack`.
 * Example: `const handlers = createQueueRequestHandlers({ groupStore, messageQueue, messenger, clock });`
 */
export function createQueueRequestHandlers(
  dependencies: QueueRequestDependencies,
): Pick<HubRequestHandlers, "mls.message" | "ack"> {
  return {
    "mls.message": (context, envelope): void =>
      queueMessage(dependencies, context, envelope),
    ack: (context, envelope): void =>
      acknowledge(dependencies, context, envelope),
  };
}

/**
 * Sends a newly authenticated socket everything waiting for its Device, in sequence order per Group.
 * Example: `replayQueueOnHello(dependencies, context);`
 */
export function replayQueueOnHello(
  dependencies: Pick<QueueRequestDependencies, "messageQueue" | "messenger">,
  context: HubContext,
): void {
  for (const message of dependencies.messageQueue.pendingFor(
    context.owner.deviceId,
  )) {
    dependencies.messenger.toSocket(context.socket, deliveryEnvelope(message));
  }
}

/**
 * Pushes a queued message to the recipients that are online now; the others get it after `hello`.
 * Example: `pushQueued(dependencies, groupId, seq, recipients);`
 */
export function pushQueued(
  dependencies: {
    messageQueue: Pick<MessageQueue, "queued">;
    messenger: HubMessenger;
  },
  groupId: Buffer,
  seq: number,
  recipients: readonly string[],
): void {
  const message = dependencies.messageQueue.queued(groupId, seq);
  if (message === undefined) return;
  dependencies.messenger.toDevices(recipients, deliveryEnvelope(message));
}

function queueMessage(
  dependencies: QueueRequestDependencies,
  context: HubContext,
  envelope: MlsMessageEnvelope,
): void {
  const groupId = groupIdBytes(envelope.groupId);
  const { deviceId } = context.owner;
  if (!dependencies.groupStore.isActiveMember(groupId, deviceId)) {
    dependencies.messenger.reply(context, envelope.requestId, {
      ok: false,
      code: HubErrorCode.NotAMember,
    });
    return;
  }
  const recipients = dependencies.groupStore
    .activeMemberDeviceIds(groupId)
    .filter((member) => member !== deviceId);
  const seq = dependencies.messageQueue.enqueue({
    groupId,
    kind: "message",
    senderDeviceId: deviceId,
    payload: Buffer.from(envelope.message, "base64"),
    recipients,
    createdAt: dependencies.clock(),
  });
  dependencies.messenger.reply(context, envelope.requestId, { ok: true, seq });
  pushQueued(dependencies, groupId, seq, recipients);
}

function acknowledge(
  dependencies: Pick<QueueRequestDependencies, "messageQueue">,
  context: HubContext,
  envelope: AckEnvelope,
): void {
  dependencies.messageQueue.acknowledge(
    groupIdBytes(envelope.groupId),
    envelope.seq,
    context.owner.deviceId,
  );
}
