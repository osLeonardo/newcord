import { randomBytes } from "node:crypto";
import {
  ChatTextPayload,
  type MlsMessageDeliveryEnvelope,
} from "@newcord/shared";
import { Value } from "typebox/value";
import type {
  ChatEntry,
  ChatMessage,
  SendMessageResult,
} from "../../preload/group-api";
import type {
  StoredChatEntry,
  StoredChatMessage,
} from "../local-store/local-messages";
import { parseCredentialIdentity } from "../mls/credential-identity";
import type { IncomingMls } from "../mls/mls-engine";
import {
  groupIdFromText,
  groupIdText,
  payloadText,
  type GroupContext,
} from "./group-context";

const MESSAGE_ID_BYTES = 16;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Sends a text Chat message: encrypted in the Group's lane, the state saved before sending, and
 * kept in the history under the sequence number the server gave it (#6, Step 03).
 * @example await sendChatMessage(context, groupId, "hello");
 */
export async function sendChatMessage(
  context: GroupContext,
  groupId: string,
  text: string,
  newMessageId: () => string = () =>
    randomBytes(MESSAGE_ID_BYTES).toString("base64url"),
): Promise<SendMessageResult> {
  const payload: ChatTextPayload = {
    type: "chat.text",
    id: newMessageId(),
    text,
    sentAt: context.now(),
  };
  if (!Value.Check(ChatTextPayload, payload)) {
    return { outcome: "refused", refusal: "INVALID_TEXT" };
  }
  const id = groupIdFromText(groupId);
  if (!context.localGroups.has(id)) {
    return { outcome: "refused", refusal: "NOT_IN_GROUP" };
  }
  return context.lanes.run(id, () => encryptAndSend(context, id, payload));
}

async function encryptAndSend(
  context: GroupContext,
  groupId: Uint8Array,
  payload: ChatTextPayload,
): Promise<SendMessageResult> {
  const plaintext = encoder.encode(JSON.stringify(payload));
  const reply = await context.mls.runThenSend(
    (engine) => engine.encrypt(groupId, plaintext),
    (message) =>
      context.requester.request({
        type: "mls.message",
        groupId: groupIdText(groupId),
        message: payloadText(message),
      }),
  );
  if (!reply.ok) return { outcome: "refused", refusal: reply.code };
  if (reply.seq === undefined) {
    throw new Error(
      "The server accepted a Chat message without a sequence number",
    );
  }
  const own = parseCredentialIdentity(context.ownIdentity);
  const stored: StoredChatMessage = {
    groupId,
    seq: reply.seq,
    messageId: payload.id,
    senderUsername: own?.username ?? "",
    senderDeviceId: own?.deviceId ?? "",
    text: payload.text,
    sentAt: payload.sentAt,
  };
  context.localMessages.add(stored);
  context.events.messagesChanged(groupIdText(groupId));
  return { outcome: "sent", message: chatMessage(context, stored) };
}

/**
 * Keeps a received Chat message under the sender the MLS credential names (D70), not the one the
 * server reports. Payloads of other types (Calls, in M3) are left to their own features.
 * @example chatMessageReceived(context, groupId, delivery, incoming);
 */
export function chatMessageReceived(
  context: GroupContext,
  groupId: Uint8Array,
  delivery: MlsMessageDeliveryEnvelope,
  message: Extract<IncomingMls, { kind: "message" }>,
): void {
  const payload = parsePayload(message.plaintext);
  if (payload === undefined) return;
  const sender = parseCredentialIdentity(message.sender);
  if (sender === undefined) {
    throw new Error(
      `A Chat message in Group ${delivery.groupId} came from the credential "${message.sender}"; expected <username>:<deviceId>`,
    );
  }
  context.localMessages.add({
    groupId,
    seq: delivery.seq,
    messageId: payload.id,
    senderUsername: sender.username,
    senderDeviceId: sender.deviceId,
    text: payload.text,
    sentAt: payload.sentAt,
  });
  context.events.messagesChanged(delivery.groupId);
}

/**
 * The Group's Chat history and notices, in the server's sequence order.
 * @example const entries = listChatMessages(context, groupId);
 */
export function listChatMessages(
  context: GroupContext,
  groupId: string,
): ChatEntry[] {
  // Hidden, never deleted: unblocking shows them again (D57).
  const blocked = new Set(context.blockList.usernames());
  return context.localMessages
    .listOf(groupIdFromText(groupId))
    .filter(
      (stored) => stored.kind !== "text" || !blocked.has(stored.senderUsername),
    )
    .map((stored) => chatEntry(context, stored));
}

function chatEntry(context: GroupContext, stored: StoredChatEntry): ChatEntry {
  if (stored.kind === "text") return chatMessage(context, stored);
  return {
    kind: "notice",
    groupId: groupIdText(stored.groupId),
    seq: stored.seq,
    notice: stored.notice,
  };
}

function parsePayload(plaintext: Uint8Array): ChatTextPayload | undefined {
  try {
    const payload: unknown = JSON.parse(decoder.decode(plaintext));
    return Value.Check(ChatTextPayload, payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function chatMessage(
  context: GroupContext,
  stored: StoredChatMessage,
): ChatMessage {
  const ownUsername = parseCredentialIdentity(context.ownIdentity)?.username;
  return {
    kind: "text",
    groupId: groupIdText(stored.groupId),
    seq: stored.seq,
    messageId: stored.messageId,
    sender: stored.senderUsername,
    own: stored.senderUsername === ownUsername,
    text: stored.text,
    sentAt: stored.sentAt,
  };
}
