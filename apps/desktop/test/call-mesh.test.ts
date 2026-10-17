import type { CallSignal } from "@newcord/shared";
import { describe, expect, it, vi } from "vitest";
import {
  CONNECT_TIMEOUT_MS,
  createCallMesh,
  isPolite,
  type CallMesh,
  type CandidateInit,
  type PeerConnection,
  type PeerConnectionEvents,
  type SessionDescription,
} from "../src/renderer/src/calls/call-mesh";

const LOW = "A".repeat(22);
const HIGH = "B".repeat(22);
const THIRD = "C".repeat(22);

/**
 * A stand-in for RTCPeerConnection's signaling states: an offer from "stable", an answer from
 * "have-remote-offer", and the implicit rollback a remote offer causes in "have-local-offer".
 */
class FakeConnection implements PeerConnection {
  state = "stable";
  local?: SessionDescription;
  remote?: SessionDescription;
  closed = false;
  rollbacks = 0;
  readonly candidates: CandidateInit[] = [];

  constructor(
    readonly owner: string,
    readonly peer: string,
    readonly events: PeerConnectionEvents<string>,
  ) {}

  signalingState(): string {
    return this.state;
  }

  localDescription(): SessionDescription | undefined {
    return this.local;
  }

  setLocalDescription(): Promise<void> {
    if (this.state === "stable") {
      this.local = { type: "offer", sdp: `offer from ${this.owner}` };
      this.state = "have-local-offer";
    } else if (this.state === "have-remote-offer") {
      this.local = { type: "answer", sdp: `answer from ${this.owner}` };
      this.state = "stable";
      this.connected();
    }
    // Gathering starts once the description is set, so candidates follow it.
    setTimeout(() => {
      this.events.candidateFound({
        candidate: `candidate of ${this.owner}`,
        sdpMid: "0",
        sdpMLineIndex: 0,
      });
    }, 0);
    return Promise.resolve();
  }

  setRemoteDescription(description: {
    type: "offer" | "answer";
    sdp: string;
  }): Promise<void> {
    if (description.type === "offer") {
      if (this.state === "have-local-offer") this.rollbacks++;
      this.state = "have-remote-offer";
    } else {
      if (this.state !== "have-local-offer") {
        return Promise.reject(new Error(`an answer in ${this.state}`));
      }
      this.state = "stable";
      this.connected();
    }
    this.remote = description;
    return Promise.resolve();
  }

  addIceCandidate(candidate: CandidateInit): Promise<void> {
    if (this.remote === undefined) {
      return Promise.reject(new Error("no remote description yet"));
    }
    this.candidates.push(candidate);
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }

  private connected(): void {
    this.events.connectionStateChanged("connected");
    this.events.remoteStreamAdded(`audio of ${this.peer}`);
  }
}

interface MeshUnderTest {
  readonly mesh: CallMesh;
  readonly connections: Map<string, FakeConnection>;
  readonly sent: { to: string; signal: CallSignal }[];
  readonly dropped: string[];
  readonly streams: () => ReadonlyMap<string, readonly string[]>;
  readonly errors: unknown[];
}

function meshOf(
  ownDeviceId: string,
  route: (from: string, to: string, signal: CallSignal) => void = () =>
    undefined,
): MeshUnderTest {
  const connections = new Map<string, FakeConnection>();
  const sent: { to: string; signal: CallSignal }[] = [];
  const dropped: string[] = [];
  const errors: unknown[] = [];
  let streams: ReadonlyMap<string, readonly string[]> = new Map();
  const mesh = createCallMesh<string>({
    ownDeviceId,
    createConnection: (peer, events) => {
      const connection = new FakeConnection(ownDeviceId, peer, events);
      connections.set(peer, connection);
      // Adding the microphone's track makes the connection ask for negotiation.
      queueMicrotask(() => events.negotiationNeeded());
      return connection;
    },
    sendSignal: (to, signal) => {
      sent.push({ to, signal });
      route(ownDeviceId, to, signal);
    },
    dropParticipant: (deviceId) => dropped.push(deviceId),
    remoteStreamsChanged: (changed) => {
      streams = changed;
    },
    startTimer: (callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return (): void => clearTimeout(timer);
    },
    reportError: (error) => errors.push(error),
  });
  return { mesh, connections, sent, dropped, streams: () => streams, errors };
}

/** Two meshes whose signals reach each other a moment later, as MLS messages do. */
function pair(): { low: MeshUnderTest; high: MeshUnderTest } {
  const meshes = new Map<string, MeshUnderTest>();
  const route = (from: string, to: string, signal: CallSignal): void => {
    setTimeout(() => meshes.get(to)?.mesh.signalReceived(from, signal), 1);
  };
  const low = meshOf(LOW, route);
  const high = meshOf(HIGH, route);
  meshes.set(LOW, low);
  meshes.set(HIGH, high);
  return { low, high };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50);
}

describe("isPolite (10-m3-build step 4)", () => {
  it("makes the lower Device ID the polite side", () => {
    expect(isPolite(LOW, HIGH)).toBe(true);
    expect(isPolite(HIGH, LOW)).toBe(false);
  });
});

describe("the Call mesh", () => {
  it("connects two Participants who both offered at once, the polite side rolling back", async () => {
    vi.useFakeTimers();
    const { low, high } = pair();

    low.mesh.participantsChanged([HIGH]);
    high.mesh.participantsChanged([LOW]);
    await settle();

    const atLow = low.connections.get(HIGH);
    const atHigh = high.connections.get(LOW);
    expect(atLow?.state).toBe("stable");
    expect(atHigh?.state).toBe("stable");
    expect(atLow?.rollbacks).toBe(1);
    expect(atHigh?.rollbacks).toBe(0);
    expect(atLow?.remote?.sdp).toBe(`offer from ${HIGH}`);
    expect(atHigh?.remote?.sdp).toBe(`answer from ${LOW}`);
    expect(low.streams().get(HIGH)).toEqual([`audio of ${HIGH}`]);
    expect(high.streams().get(LOW)).toEqual([`audio of ${LOW}`]);
    expect(atLow?.candidates.length).toBeGreaterThan(0);
    expect(atHigh?.candidates.length).toBeGreaterThan(0);
    expect([...low.errors, ...high.errors].map(String)).toEqual([]);
    vi.useRealTimers();
  });

  it("sends only descriptions and candidates, each for the one peer", async () => {
    vi.useFakeTimers();
    const { low } = pair();

    low.mesh.participantsChanged([HIGH]);
    await settle();

    expect(low.sent.length).toBeGreaterThan(0);
    for (const { to, signal } of low.sent) {
      expect(to).toBe(HIGH);
      expect(["description", "candidate"]).toContain(signal.kind);
    }
    vi.useRealTimers();
  });

  it("opens a connection for a signal from someone not listed yet", async () => {
    vi.useFakeTimers();
    const { low, high } = pair();

    high.mesh.participantsChanged([LOW]);
    await settle();

    expect(low.connections.get(HIGH)?.state).toBe("stable");
    expect(low.streams().get(HIGH)).toEqual([`audio of ${HIGH}`]);
    vi.useRealTimers();
  });

  it("drops a Participant who does not connect within 30 seconds", async () => {
    vi.useFakeTimers();
    const lonely = meshOf(LOW);

    lonely.mesh.participantsChanged([HIGH]);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
    expect(lonely.dropped).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(lonely.dropped).toEqual([HIGH]);
    expect(lonely.connections.get(HIGH)?.closed).toBe(true);
    vi.useRealTimers();
  });

  it("drops a Participant whose connection failed, or stayed disconnected for 30 seconds", async () => {
    vi.useFakeTimers();
    const { low, high } = pair();
    low.mesh.participantsChanged([HIGH, THIRD]);
    high.mesh.participantsChanged([LOW]);
    await settle();

    low.connections.get(THIRD)?.events.connectionStateChanged("failed");
    low.connections.get(HIGH)?.events.connectionStateChanged("disconnected");
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);

    expect(low.dropped.toSorted()).toEqual([HIGH, THIRD].toSorted());
    expect(low.streams().size).toBe(0);
    vi.useRealTimers();
  });

  it("keeps a Participant whose connection came back", async () => {
    vi.useFakeTimers();
    const { low, high } = pair();
    low.mesh.participantsChanged([HIGH]);
    high.mesh.participantsChanged([LOW]);
    await settle();

    const connection = low.connections.get(HIGH);
    connection?.events.connectionStateChanged("disconnected");
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
    connection?.events.connectionStateChanged("connected");
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);

    expect(low.dropped).toEqual([]);
    vi.useRealTimers();
  });

  it("hangs up on someone who left without dropping them, and on everyone when closed", async () => {
    vi.useFakeTimers();
    const { low } = pair();
    low.mesh.participantsChanged([HIGH, THIRD]);
    await settle();

    low.mesh.participantsChanged([THIRD]);
    expect(low.connections.get(HIGH)?.closed).toBe(true);
    expect(low.connections.get(THIRD)?.closed).toBe(false);

    low.mesh.close();
    expect(low.connections.get(THIRD)?.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    expect(low.dropped).toEqual([]);
    vi.useRealTimers();
  });

  it("keeps each of a Participant's streams once, such as a shared screen next to their voice", async () => {
    vi.useFakeTimers();
    const { low, high } = pair();
    low.mesh.participantsChanged([HIGH]);
    high.mesh.participantsChanged([LOW]);
    await settle();

    const connection = low.connections.get(HIGH);
    connection?.events.remoteStreamAdded(`screen of ${HIGH}`);
    connection?.events.remoteStreamAdded(`screen of ${HIGH}`);

    expect(low.streams().get(HIGH)).toEqual([
      `audio of ${HIGH}`,
      `screen of ${HIGH}`,
    ]);
    vi.useRealTimers();
  });
});
