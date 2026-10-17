import { Type, type Static } from "typebox";

/** The longest Chat message, in characters (#6's spec). */
export const CHAT_TEXT_MAX_LENGTH = 4000;

/** A Chat message's ID, created by the sender's app: 16 random bytes in base64url. */
export const ChatMessageId = Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" });

/**
 * A text Chat message, the plaintext inside an MLS message: only Members can read it
 * (06-message-formats, "Encrypted payloads"). `sentAt` is the sender's clock, in milliseconds.
 */
export const ChatTextPayload = Type.Object(
  {
    type: Type.Literal("chat.text"),
    id: ChatMessageId,
    text: Type.String({ minLength: 1, maxLength: CHAT_TEXT_MAX_LENGTH }),
    sentAt: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type ChatTextPayload = Static<typeof ChatTextPayload>;
