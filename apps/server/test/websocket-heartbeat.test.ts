import type { AddressInfo } from "node:net";
import { PROTOCOL_VERSION, type RegisterResponse } from "@newcord/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_INTERVAL_MS } from "../src/websocket/heartbeat.js";
import {
  fastFakeHasher,
  shareGroup,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  connectWithHello,
  presenceChange,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

let server: TestServer;
let alice: RegisterResponse;
let bruno: RegisterResponse;
const clients: TestSocketClient[] = [];

async function online(accessToken: string): Promise<TestSocketClient> {
  const { client } = await connectWithHello(server.app, accessToken);
  clients.push(client);
  return client;
}

/**
 * Moves one heartbeat interval forward, then waits a moment of real time, so a ping and its
 * automatic pong cross the socket before the next interval is due, as they do within
 * milliseconds. Only intervals are fake, so `setTimeout` still runs in real time.
 */
async function nextHeartbeat(): Promise<void> {
  await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("the heartbeat over real sockets (#17, D100)", () => {
  beforeEach(async () => {
    server = await startTestServer({ passwordHasher: fastFakeHasher });
    alice = await signUpAs(server.app, "alice");
    bruno = await signUpAs(server.app, "bruno");
    shareGroup(server.database, [alice.deviceId, bruno.deviceId]);
    await server.app.ready();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    for (const client of clients.splice(0)) client.terminate();
    await server.close();
  });

  it("ends a socket that stops answering within two intervals, and its Account goes offline for the others", async () => {
    const aliceClient = await online(alice.accessToken);
    const brunoClient = await online(bruno.accessToken);
    expect(await aliceClient.nextEnvelope()).toEqual(
      presenceChange("online", "bruno"),
    );
    brunoClient.stopAnsweringPings();

    await nextHeartbeat();
    expect(brunoClient.isOpen()).toBe(true);
    await nextHeartbeat();

    expect(await aliceClient.nextEnvelope()).toEqual(
      presenceChange("offline", "bruno"),
    );
    await brunoClient.closed;
    expect(aliceClient.isOpen()).toBe(true);
  });

  it("keeps a socket that answers every ping open, with its Account online", async () => {
    const aliceClient = await online(alice.accessToken);
    const brunoClient = await online(bruno.accessToken);
    await aliceClient.nextEnvelope();

    for (let ping = 0; ping < 5; ping += 1) await nextHeartbeat();

    expect(brunoClient.isOpen()).toBe(true);
    expect(aliceClient.unreadEnvelopes()).toEqual([]);
    // Both heartbeats are still running, so the pings really were sent and answered.
    expect(vi.getTimerCount()).toBe(2);
  });
});

describe("the desktop app's WebSocket and the heartbeat (#17)", () => {
  it("answers pings on its own: Node's built-in WebSocket, the one the main process uses, stays connected", async () => {
    const quick = await startTestServer({
      passwordHasher: fastFakeHasher,
      heartbeatIntervalMs: 50,
    });
    const carla = await signUpAs(quick.app, "carla");
    await quick.app.listen({ host: "127.0.0.1", port: 0 });
    const { port } = quick.app.server.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const received: unknown[] = [];
    socket.addEventListener("message", (event) => {
      received.push(JSON.parse(String(event.data)));
    });
    await new Promise((resolve) => socket.addEventListener("open", resolve));
    socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "hello",
        accessToken: carla.accessToken,
      }),
    );

    // Ten intervals: a client that did not answer would be gone after two.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(received[0]).toMatchObject({ type: "presence", kind: "snapshot" });
    socket.close();
    // The server handles the TCP close after the client sees its own; it must finish first.
    const { clients } = (
      quick.app as unknown as { websocketServer: { clients: Set<unknown> } }
    ).websocketServer;
    await vi.waitFor(() => {
      expect(clients.size).toBe(0);
    });
    await quick.close();
  });
});
