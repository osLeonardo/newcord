import type {
  CandidateInit,
  PeerConnection,
  PeerConnectionEvents,
  SessionDescription,
} from "./call-mesh";
import type { IceConfiguration } from "../../../preload/call-api";
import { rmsLevel } from "./voice-level";

/** How often a stream's loudness is measured for the speaking indicator. */
const LEVEL_INTERVAL_MS = 100;

/**
 * Opens the microphone with Chromium's voice processing on (10-m3-build Settings), and no camera (D10).
 * @example const microphone = await openMicrophone();
 */
export function openMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

/** The Call's connections, so fresh relay passwords reach each one. */
export type OpenConnections = Set<RTCPeerConnection>;

/**
 * Wraps an `RTCPeerConnection` carrying the microphone for the Call mesh, reaching the others
 * through the app's own relay, and only through it with Hide my IP (10-m3-build step 5).
 * @example createConnection: (peer, events) => browserPeerConnection(microphone, configuration, connections, events)
 */
export function browserPeerConnection(
  microphone: MediaStream,
  configuration: IceConfiguration,
  connections: OpenConnections,
  events: PeerConnectionEvents<MediaStream>,
): PeerConnection {
  const connection = new RTCPeerConnection(rtcConfiguration(configuration));
  connections.add(connection);
  connection.addEventListener("negotiationneeded", () => {
    events.negotiationNeeded();
  });
  connection.addEventListener("icecandidate", (event) => {
    const found = event.candidate;
    // An empty candidate only says gathering ended.
    if (found === null || found.candidate === "") return;
    events.candidateFound(candidateInit(found));
  });
  connection.addEventListener("track", (event) => {
    const [stream] = event.streams;
    if (stream !== undefined) events.remoteStreamAdded(stream);
  });
  connection.addEventListener("connectionstatechange", () => {
    events.connectionStateChanged(connection.connectionState);
  });
  for (const track of microphone.getAudioTracks()) {
    connection.addTrack(track, microphone);
  }
  return {
    signalingState: () => connection.signalingState,
    localDescription: (): SessionDescription | undefined => {
      const description = connection.localDescription;
      return description === null
        ? undefined
        : { type: description.type, sdp: description.sdp };
    },
    setLocalDescription: () => connection.setLocalDescription(),
    setRemoteDescription: (description) =>
      connection.setRemoteDescription(description),
    addIceCandidate: (candidate) =>
      connection.addIceCandidate({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment ?? null,
      }),
    close: (): void => {
      connections.delete(connection);
      connection.close();
    },
  };
}

/**
 * Hands every open connection the relay's fresh passwords; the old ones expire after an hour.
 * @example reconfigure(connections, configuration);
 */
export function reconfigure(
  connections: OpenConnections,
  configuration: IceConfiguration,
): void {
  for (const connection of connections) {
    connection.setConfiguration(rtcConfiguration(configuration));
  }
}

function rtcConfiguration(configuration: IceConfiguration): RTCConfiguration {
  return {
    iceServers: configuration.iceServers.map((server) => ({
      urls: [...server.urls],
      ...(server.username === undefined ? {} : { username: server.username }),
      ...(server.credential === undefined
        ? {}
        : { credential: server.credential }),
    })),
    iceTransportPolicy: configuration.iceTransportPolicy,
  };
}

function candidateInit(candidate: RTCIceCandidate): CandidateInit {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

/**
 * Measures a stream's loudness ten times a second until stopped.
 * @example const stop = watchVoiceLevel(stream, (level) => gate.update(level, performance.now()));
 */
export function watchVoiceLevel(
  stream: MediaStream,
  onLevel: (level: number) => void,
): () => void {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    onLevel(rmsLevel(samples));
  }, LEVEL_INTERVAL_MS);
  return (): void => {
    clearInterval(timer);
    source.disconnect();
    void context.close();
  };
}

/** Stops every track of a stream, turning the microphone off. */
export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
