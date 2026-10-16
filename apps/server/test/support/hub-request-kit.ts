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
