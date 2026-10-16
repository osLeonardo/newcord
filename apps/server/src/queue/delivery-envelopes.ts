import {
  PROTOCOL_VERSION,
  type MlsCommitDeliveryEnvelope,
  type MlsMessageDeliveryEnvelope,
  type MlsWelcomeDeliveryEnvelope,
} from "@newcord/shared";
import type { QueuedMessage } from "./message-queue.js";

/** Every Envelope a queued message is delivered as. */
export type DeliveryEnvelope =
  | MlsCommitDeliveryEnvelope
  | MlsWelcomeDeliveryEnvelope
  | MlsMessageDeliveryEnvelope;

/**
 * The Envelope a queued message reaches its recipients as.
 * Example: `messenger.toDevices(recipients, deliveryEnvelope(queue.queued(groupId, seq)));`
 */
export function deliveryEnvelope(message: QueuedMessage): DeliveryEnvelope {
  const common = {
    v: PROTOCOL_VERSION,
    groupId: message.groupId.toString("base64url"),
    seq: message.seq,
    sender: message.sender,
  } as const;
  const payload = message.payload.toString("base64");
  switch (message.kind) {
    case "commit":
      return {
        ...common,
        type: "mls.commit",
        ...declaredOf(message),
        commit: payload,
      };
    case "welcome":
      return {
        ...common,
        type: "mls.welcome",
        groupName: message.groupName,
        welcome: payload,
      };
    case "message":
    case "proposal":
      return { ...common, type: "mls.message", message: payload };
  }
}

function declaredOf(
  message: QueuedMessage,
): Pick<MlsCommitDeliveryEnvelope, "epoch" | "added" | "removed"> {
  if (message.declared === undefined) {
    throw new Error(
      `Commit ${message.seq} of Group ${message.groupId.toString("base64url")} has no declared change; every commit is stored with one`,
    );
  }
  const { epoch, added, removed } = message.declared;
  return { epoch, added, removed };
}
