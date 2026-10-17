import type { TestSocketClient } from "./websocket-test-client.js";

let requestsSent = 0;

/** Sends a request Envelope with a fresh request ID and returns the ID. */
export function sendRequest(
  client: TestSocketClient,
  envelope: object,
): string {
  requestsSent += 1;
  const requestId = `r-${requestsSent}`;
  client.sendEnvelope({ v: 1, requestId, ...envelope });
  return requestId;
}

/** The reply to a request that was carried out, with any result fields. */
export function doneReply(requestId: string, results: object = {}): object {
  return { v: 1, type: "reply", requestId, ok: true, ...results };
}

/** The reply to a refused request. */
export function refusedReply(requestId: string, code: string): object {
  return { v: 1, type: "reply", requestId, ok: false, code };
}

/** Reads Envelopes until the reply to `requestId`, returning it and what came before it. */
export async function replyTo(
  client: TestSocketClient,
  requestId: string,
): Promise<{ reply: unknown; before: unknown[] }> {
  const before: unknown[] = [];
  for (;;) {
    const envelope = await client.nextEnvelope();
    const { type, requestId: answered } = envelope as {
      type?: string;
      requestId?: string;
    };
    if (type === "reply" && answered === requestId) {
      return { reply: envelope, before };
    }
    before.push(envelope);
  }
}

/** Sends a harmless request and waits for its reply, so everything sent before it was handled. */
export async function settleRequests(
  client: TestSocketClient,
): Promise<unknown[]> {
  const requestId = sendRequest(client, {
    type: "unblock",
    username: "nobody",
  });
  return (await replyTo(client, requestId)).before;
}

const PROMPT_TYPES: ReadonlySet<string> = new Set([
  "invite.accepted",
  "device.new",
  "resync",
]);

/** The next Envelope that is not a Group prompt, for tests where prompts are not under test. */
export async function nextBesidesPrompts(
  client: TestSocketClient,
): Promise<unknown> {
  for (;;) {
    const envelope = await client.nextEnvelope();
    const { type } = envelope as { type?: string };
    if (type === undefined || !PROMPT_TYPES.has(type)) return envelope;
  }
}
