/** What the live session hears from one WebSocket connection to the server's `/ws`. */
export interface LiveSocketListener {
  opened(): void;
  received(text: string): void;
  /** Called once, whether the server closed the connection, the network dropped it or it never opened. */
  closed(code: number): void;
}

/** One WebSocket connection to the server's `/ws`. */
export interface LiveSocket {
  send(text: string): void;
  close(): void;
}

/** Opens a connection that reports to the listener; the app's adapter wraps the built-in WebSocket client. */
export type LiveSocketOpener = (listener: LiveSocketListener) => LiveSocket;

/** The part of the WHATWG WebSocket the adapter uses; Node.js's and Electron's built-in client fits it. */
export interface StandardWebSocket {
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: { readonly data: unknown }) => void,
  ): void;
  addEventListener(
    type: "close",
    listener: (event: { readonly code: number }) => void,
  ): void;
  send(data: string): void;
  close(): void;
}

/**
 * The hub's address on the server built into this build: `ws` for `http` and `wss` for `https` (D65).
 * @example liveSocketUrl("https://newcord.duckdns.org") // "wss://newcord.duckdns.org/ws"
 */
export function liveSocketUrl(serverAddress: string): string {
  const url = new URL("/ws", serverAddress);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  return url.href;
}

/**
 * Opens live sockets with a standard WebSocket client; binary messages are ignored, since every Envelope is JSON text.
 * @example const openSocket = createStandardSocketOpener(builtInServerAddress, (url) => new WebSocket(url));
 */
export function createStandardSocketOpener(
  serverAddress: string,
  createWebSocket: (url: string) => StandardWebSocket,
): LiveSocketOpener {
  const url = liveSocketUrl(serverAddress);
  return (listener: LiveSocketListener): LiveSocket => {
    const webSocket = createWebSocket(url);
    webSocket.addEventListener("open", () => listener.opened());
    webSocket.addEventListener("message", (event) => {
      if (typeof event.data === "string") listener.received(event.data);
    });
    webSocket.addEventListener("close", (event) => listener.closed(event.code));
    return {
      send: (text): void => webSocket.send(text),
      close: (): void => webSocket.close(),
    };
  };
}
