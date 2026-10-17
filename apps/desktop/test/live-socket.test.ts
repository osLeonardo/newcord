import { describe, expect, it } from "vitest";
import {
  createStandardSocketOpener,
  liveSocketUrl,
  type LiveSocketListener,
  type StandardWebSocket,
} from "../src/main/session/live-socket";

type EventListeners = Map<string, ((event: never) => void)[]>;

interface FakeWebSocket extends StandardWebSocket {
  readonly url: string;
  readonly sent: string[];
  closeCalls: number;
  emit(type: string, event?: object): void;
}

function fakeWebSocket(url: string): FakeWebSocket {
  const listeners: EventListeners = new Map();
  const socket: FakeWebSocket = {
    url,
    sent: [],
    closeCalls: 0,
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    send: (data) => socket.sent.push(data),
    close: () => {
      socket.closeCalls += 1;
    },
    emit: (type, event = {}) => {
      for (const listener of listeners.get(type) ?? []) {
        listener(event as never);
      }
    },
  };
  return socket;
}

function recordingListener(): LiveSocketListener & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    opened: () => calls.push(["opened"]),
    received: (text) => calls.push(["received", text]),
    closed: (code) => calls.push(["closed", code]),
  };
}

function openFakeSocket(serverAddress = "http://localhost:3000"): {
  webSocket: FakeWebSocket;
  listener: ReturnType<typeof recordingListener>;
  socket: ReturnType<ReturnType<typeof createStandardSocketOpener>>;
} {
  let webSocket: FakeWebSocket | undefined;
  const open = createStandardSocketOpener(serverAddress, (url) => {
    webSocket = fakeWebSocket(url);
    return webSocket;
  });
  const listener = recordingListener();
  const socket = open(listener);
  if (webSocket === undefined) throw new Error("no WebSocket was created");
  return { webSocket, listener, socket };
}

describe("liveSocketUrl", () => {
  it.each([
    ["http://localhost:3000", "ws://localhost:3000/ws"],
    ["https://newcord.duckdns.org", "wss://newcord.duckdns.org/ws"],
    ["wss://newcord.duckdns.org", "wss://newcord.duckdns.org/ws"],
  ])("turns %s into %s", (serverAddress, expected) => {
    expect(liveSocketUrl(serverAddress)).toBe(expected);
  });
});

describe("createStandardSocketOpener", () => {
  it("connects to the hub's address", () => {
    expect(openFakeSocket("https://newcord.duckdns.org").webSocket.url).toBe(
      "wss://newcord.duckdns.org/ws",
    );
  });

  it("reports opening, text messages and the close code in order", () => {
    const { webSocket, listener } = openFakeSocket();

    webSocket.emit("open");
    webSocket.emit("message", { data: '{"type":"presence"}' });
    webSocket.emit("close", { code: 4002 });

    expect(listener.calls).toEqual([
      ["opened"],
      ["received", '{"type":"presence"}'],
      ["closed", 4002],
    ]);
  });

  it("ignores binary messages", () => {
    const { webSocket, listener } = openFakeSocket();

    webSocket.emit("message", { data: new ArrayBuffer(4) });

    expect(listener.calls).toEqual([]);
  });

  it("sends text and closes through the WebSocket", () => {
    const { webSocket, socket } = openFakeSocket();

    socket.send('{"type":"hello"}');
    socket.close();

    expect(webSocket.sent).toEqual(['{"type":"hello"}']);
    expect(webSocket.closeCalls).toBe(1);
  });
});
