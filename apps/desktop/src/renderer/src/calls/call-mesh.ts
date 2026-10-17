import type { CallSignal } from "@newcord/shared";

/** A Participant who has not connected within this long, or lost the connection for this long, is dropped (#9's spec). */
export const CONNECT_TIMEOUT_MS = 30_000;

/** A network candidate as `RTCIceCandidate.toJSON()` gives it. */
export interface CandidateInit {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
  readonly usernameFragment?: string | null;
}

export interface SessionDescription {
  readonly type: string;
  readonly sdp: string;
}

/** The parts of an `RTCPeerConnection` the mesh drives; the window's adapter adds the microphone. */
export interface PeerConnection {
  signalingState(): string;
  localDescription(): SessionDescription | undefined;
  /** Creates and sets the offer or answer the current state calls for. */
  setLocalDescription(): Promise<void>;
  setRemoteDescription(description: {
    type: "offer" | "answer";
    sdp: string;
  }): Promise<void>;
  addIceCandidate(candidate: CandidateInit): Promise<void>;
  close(): void;
}

/** What a connection tells the mesh. */
export interface PeerConnectionEvents<Stream> {
  negotiationNeeded(): void;
  candidateFound(candidate: CandidateInit): void;
  remoteStreamAdded(stream: Stream): void;
  connectionStateChanged(state: string): void;
}

export interface CallMeshOptions<Stream> {
  readonly ownDeviceId: string;
  createConnection(
    peerDeviceId: string,
    events: PeerConnectionEvents<Stream>,
  ): PeerConnection;
  /** Hands a signal to the main process, which encrypts it for the Group (D18). */
  sendSignal(to: string, signal: CallSignal): void;
  /** Tells the main process a Participant could not be reached. */
  dropParticipant(deviceId: string): void;
  remoteStreamsChanged(streams: ReadonlyMap<string, Stream>): void;
  /** Starts a timer and returns what cancels it. */
  startTimer(callback: () => void, milliseconds: number): () => void;
  reportError(error: unknown): void;
}

/** One RTCPeerConnection per pair of Participants (10-m3-build step 4). */
export interface CallMesh {
  /** The other Participants now in the Call: new ones are connected, gone ones hung up on. */
  participantsChanged(deviceIds: readonly string[]): void;
  /** A signal from a Participant, perhaps one the list does not name yet. */
  signalReceived(from: string, signal: CallSignal): void;
  close(): void;
}

/**
 * The polite side of a pair yields when both send an offer at once: the lower Device ID (10-m3-build step 4).
 * @example isPolite("A…", "B…") // true
 */
export function isPolite(ownDeviceId: string, peerDeviceId: string): boolean {
  return ownDeviceId < peerDeviceId;
}

interface Link {
  readonly connection: PeerConnection;
  readonly polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswerPending: boolean;
  /** Signals are handled one at a time, in the order they came. */
  queue: Promise<void>;
  cancelTimer?: () => void;
}

/**
 * Creates the mesh of a Call this Device joined, using WebRTC's perfect negotiation.
 * @example const mesh = createCallMesh({ ownDeviceId, createConnection, sendSignal, … });
 */
export function createCallMesh<Stream>(
  options: CallMeshOptions<Stream>,
): CallMesh {
  const links = new Map<string, Link>();
  const streams = new Map<string, Stream>();
  const hangUp = (peer: string): void => {
    const link = links.get(peer);
    if (link === undefined) return;
    link.cancelTimer?.();
    link.connection.close();
    links.delete(peer);
    if (streams.delete(peer)) options.remoteStreamsChanged(new Map(streams));
  };
  const drop = (peer: string): void => {
    hangUp(peer);
    options.dropParticipant(peer);
  };
  const linkTo = (peer: string): Link => {
    const known = links.get(peer);
    if (known !== undefined) return known;
    const link = openLink(options, peer, {
      streamAdded: (stream) => {
        streams.set(peer, stream);
        options.remoteStreamsChanged(new Map(streams));
      },
      unreachable: () => drop(peer),
    });
    links.set(peer, link);
    return link;
  };
  return {
    participantsChanged: (deviceIds): void => {
      for (const peer of [...links.keys()]) {
        if (!deviceIds.includes(peer)) hangUp(peer);
      }
      for (const peer of deviceIds) linkTo(peer);
    },
    signalReceived: (from, signal): void => {
      const link = linkTo(from);
      link.queue = link.queue
        .then(() => handleSignal(options, from, link, signal))
        .catch((error: unknown) => {
          options.reportError(error);
        });
    },
    close: (): void => {
      for (const peer of [...links.keys()]) hangUp(peer);
    },
  };
}

interface LinkCallbacks<Stream> {
  streamAdded(stream: Stream): void;
  unreachable(): void;
}

function openLink<Stream>(
  options: CallMeshOptions<Stream>,
  peer: string,
  callbacks: LinkCallbacks<Stream>,
): Link {
  const holder: { link?: Link } = {};
  const watch = (): void => {
    const link = holder.link;
    if (link === undefined || link.cancelTimer !== undefined) return;
    link.cancelTimer = options.startTimer(
      () => callbacks.unreachable(),
      CONNECT_TIMEOUT_MS,
    );
  };
  const connection = options.createConnection(peer, {
    negotiationNeeded: () => {
      if (holder.link !== undefined) void makeOffer(options, peer, holder.link);
    },
    candidateFound: (candidate) => {
      options.sendSignal(peer, {
        kind: "candidate",
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment ?? null,
      });
    },
    remoteStreamAdded: (stream) => callbacks.streamAdded(stream),
    connectionStateChanged: (state) => {
      const link = holder.link;
      if (link === undefined) return;
      if (state === "connected") {
        link.cancelTimer?.();
        link.cancelTimer = undefined;
      } else if (state === "failed") {
        callbacks.unreachable();
      } else if (state === "disconnected") {
        watch();
      }
    },
  });
  holder.link = {
    connection,
    polite: isPolite(options.ownDeviceId, peer),
    makingOffer: false,
    ignoreOffer: false,
    settingRemoteAnswerPending: false,
    queue: Promise.resolve(),
  };
  watch();
  return holder.link;
}

async function makeOffer<Stream>(
  options: CallMeshOptions<Stream>,
  peer: string,
  link: Link,
): Promise<void> {
  try {
    link.makingOffer = true;
    await link.connection.setLocalDescription();
    sendLocalDescription(options, peer, link);
  } catch (error) {
    options.reportError(error);
  } finally {
    link.makingOffer = false;
  }
}

/** The perfect negotiation pattern: the impolite side ignores a colliding offer, the polite side rolls back. */
async function handleSignal<Stream>(
  options: CallMeshOptions<Stream>,
  peer: string,
  link: Link,
  signal: CallSignal,
): Promise<void> {
  const { connection } = link;
  if (signal.kind === "candidate") {
    try {
      await connection.addIceCandidate({
        candidate: signal.candidate,
        sdpMid: signal.sdpMid,
        sdpMLineIndex: signal.sdpMLineIndex,
        usernameFragment: signal.usernameFragment ?? null,
      });
    } catch (error) {
      // Candidates of an ignored offer have nothing to attach to.
      if (!link.ignoreOffer) throw error;
    }
    return;
  }
  const readyForOffer =
    !link.makingOffer &&
    (connection.signalingState() === "stable" ||
      link.settingRemoteAnswerPending);
  const collision = signal.type === "offer" && !readyForOffer;
  link.ignoreOffer = !link.polite && collision;
  if (link.ignoreOffer) return;
  link.settingRemoteAnswerPending = signal.type === "answer";
  await connection.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
  link.settingRemoteAnswerPending = false;
  if (signal.type === "offer") {
    await connection.setLocalDescription();
    sendLocalDescription(options, peer, link);
  }
}

function sendLocalDescription<Stream>(
  options: CallMeshOptions<Stream>,
  peer: string,
  link: Link,
): void {
  const description = link.connection.localDescription();
  if (description?.type !== "offer" && description?.type !== "answer") return;
  options.sendSignal(peer, {
    kind: "description",
    type: description.type,
    sdp: description.sdp,
  });
}
