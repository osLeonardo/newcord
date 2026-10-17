import type { HubOutcome } from "../hub/hub-requester";
import { groupIdText, payloadText, type GroupContext } from "./group-context";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encrypts a payload for the Group's Members and sends it as one `mls.message`, the state saved
 * first (D39). Run it in the Group's lane: encrypting moves the Group's MLS state on.
 * @example const reply = await sendGroupPayload(context, groupId, { type: "call.join", sentAt });
 */
export function sendGroupPayload(
  context: GroupContext,
  groupId: Uint8Array,
  payload: object,
): Promise<HubOutcome> {
  const plaintext = encoder.encode(JSON.stringify(payload));
  return context.mls.runThenSend(
    (engine) => engine.encrypt(groupId, plaintext),
    (message) =>
      context.requester.request({
        type: "mls.message",
        groupId: groupIdText(groupId),
        message: payloadText(message),
      }),
  );
}

/**
 * The JSON inside a decrypted message, or undefined when it is not JSON; each feature checks its
 * own schema.
 * @example readPayload(incoming.plaintext) // { type: "chat.text", … }
 */
export function readPayload(plaintext: Uint8Array): unknown {
  try {
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    return undefined;
  }
}
