import { WebSocketCloseCode, type ServerEnvelope } from "@newcord/shared";

/** What the hub does with an open socket: send it Envelopes and close it. */
export interface HubSocket {
  send(text: string): void;
  close(code: WebSocketCloseCode, reason: string): void;
}

/**
 * The server side of a `ws` WebSocket as @fastify/websocket hands it over. Without `@types/ws`
 * the plugin types it as `any`, so this interface names the part the hub relies on. With the
 * default `binaryType`, every message arrives as one Buffer.
 */
export interface IncomingSocket extends HubSocket {
  on(
    event: "message",
    listener: (data: Buffer, isBinary: boolean) => void,
  ): unknown;
  on(event: "close", listener: () => void): unknown;
}

/**
 * Closes a socket with `code` and the short reason that goes with it.
 * Example: `closeHubSocket(socket, WebSocketCloseCode.SessionEnded);`
 */
export function closeHubSocket(
  socket: HubSocket,
  code: WebSocketCloseCode,
): void {
  socket.close(code, closeReasonOf(code));
}

function closeReasonOf(code: WebSocketCloseCode): string {
  switch (code) {
    case WebSocketCloseCode.AuthenticationFailed:
      return "authentication failed or timed out";
    case WebSocketCloseCode.SessionEnded:
      return "session ended";
    case WebSocketCloseCode.EnvelopeRejected:
      return "envelope rejected";
  }
}

/**
 * Sends one Envelope as JSON text.
 * Example: `sendEnvelope(socket, { v: PROTOCOL_VERSION, type: "presence", kind: "online", username });`
 */
export function sendEnvelope(
  socket: HubSocket,
  envelope: ServerEnvelope,
): void {
  socket.send(JSON.stringify(envelope));
}
