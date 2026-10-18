import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  startHeartbeat,
  type HeartbeatSocket,
} from "../src/websocket/heartbeat.js";

interface FakeHeartbeatSocket extends HeartbeatSocket {
  readonly pings: number;
  readonly terminated: boolean;
  answer(): void;
}

function createFakeHeartbeatSocket(): FakeHeartbeatSocket {
  let pings = 0;
  let terminated = false;
  const pongListeners: (() => void)[] = [];
  return {
    get pings(): number {
      return pings;
    },
    get terminated(): boolean {
      return terminated;
    },
    ping: (): void => {
      pings += 1;
    },
    terminate: (): void => {
      terminated = true;
    },
    on: (_event, listener): void => {
      pongListeners.push(listener);
    },
    answer: (): void => {
      for (const listener of pongListeners) listener();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the WebSocket heartbeat (#17, D100)", () => {
  it("pings every 30 seconds", () => {
    const socket = createFakeHeartbeatSocket();
    startHeartbeat(socket, HEARTBEAT_INTERVAL_MS);

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 1);
    expect(socket.pings).toBe(0);
    vi.advanceTimersByTime(1);
    expect(socket.pings).toBe(1);
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });

  it("terminates a socket that leaves a ping unanswered until the next one is due", () => {
    const socket = createFakeHeartbeatSocket();
    startHeartbeat(socket, HEARTBEAT_INTERVAL_MS);

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(socket.terminated).toBe(false);
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);

    expect(socket.terminated).toBe(true);
    expect(socket.pings).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a socket that answers every ping", () => {
    const socket = createFakeHeartbeatSocket();
    startHeartbeat(socket, HEARTBEAT_INTERVAL_MS);

    for (let ping = 0; ping < 10; ping += 1) {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
      socket.answer();
    }

    expect(socket.terminated).toBe(false);
    expect(socket.pings).toBe(10);
  });

  it("stops pinging once stopped, as when the socket closes", () => {
    const socket = createFakeHeartbeatSocket();
    const heartbeat = startHeartbeat(socket, HEARTBEAT_INTERVAL_MS);

    heartbeat.stop();
    vi.advanceTimersByTime(10 * HEARTBEAT_INTERVAL_MS);

    expect(socket.pings).toBe(0);
    expect(socket.terminated).toBe(false);
  });
});
