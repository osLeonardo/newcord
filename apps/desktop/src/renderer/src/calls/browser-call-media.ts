import type {
  CandidateInit,
  PeerConnection,
  PeerConnectionEvents,
  SessionDescription,
} from "./call-mesh";
import type { IceConfiguration, ShareCodec } from "../../../preload/call-api";
import {
  preferCodec,
  SCREEN_SHARE_MAX_FRAMERATE,
  SCREEN_SHARE_MAX_HEIGHT,
  SCREEN_SHARE_MAX_WIDTH,
  screenShareEncoding,
} from "./share-settings";
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

/** A screen share this Device sends: video only (D43), its detail kept over its frame rate. */
export interface ScreenShare {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly codec: ShareCodec;
}

/** What a new connection carries and how it reaches the others. */
export interface ConnectionMedia {
  readonly microphone: MediaStream;
  readonly configuration: IceConfiguration;
  readonly connections: OpenConnections;
  /** The share running when the connection is made, if any. */
  readonly screen: ScreenShare | undefined;
}

/**
 * Wraps an `RTCPeerConnection` carrying the microphone, and the screen while it is shared, for the
 * Call mesh, reaching the others through the app's own relay, and only through it with Hide my IP
 * (10-m3-build step 5).
 * @example createConnection: (peer, events) => browserPeerConnection(media, events)
 */
export function browserPeerConnection(
  media: ConnectionMedia,
  events: PeerConnectionEvents<MediaStream>,
): PeerConnection {
  const { microphone, connections } = media;
  const connection = new RTCPeerConnection(
    rtcConfiguration(media.configuration),
  );
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
  if (media.screen !== undefined) sendScreen(connection, media.screen);
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

/**
 * Asks the main process's picker choice for the screen, video only (D43), at up to 1080p and 30
 * frames per second (10-m3-build Settings).
 * @example const screen = await captureScreen();
 */
export function captureScreen(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { max: SCREEN_SHARE_MAX_WIDTH },
      height: { max: SCREEN_SHARE_MAX_HEIGHT },
      frameRate: { max: SCREEN_SHARE_MAX_FRAMERATE },
    },
    audio: false,
  });
}

/**
 * Sends the share on a connection: the chosen codec first with the others kept after it (D11b),
 * and at most 1.5 Mbps to this viewer (10-m3-build step 8).
 * @example sendScreen(connection, share);
 */
export function sendScreen(
  connection: RTCPeerConnection,
  share: ScreenShare,
): void {
  const transceiver = connection.addTransceiver(share.track, {
    direction: "sendonly",
    streams: [share.stream],
    sendEncodings: [screenShareEncoding()],
  });
  // Chromium checks preferences against what it can receive.
  const capabilities = RTCRtpReceiver.getCapabilities("video");
  if (capabilities !== null) {
    transceiver.setCodecPreferences(
      preferCodec(capabilities.codecs, share.codec),
    );
  }
}

/** Stops sending the share on a connection; the viewers' copy goes quiet. */
export function stopSendingScreen(
  connection: RTCPeerConnection,
  track: MediaStreamTrack,
): void {
  for (const sender of connection.getSenders()) {
    if (sender.track === track) connection.removeTrack(sender);
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
