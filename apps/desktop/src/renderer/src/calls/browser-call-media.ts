import type {
  CandidateInit,
  PeerConnection,
  PeerConnectionEvents,
  SessionDescription,
} from "./call-mesh";
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

/**
 * Wraps an `RTCPeerConnection` carrying the microphone for the Call mesh. The relay arrives in
 * Step 02; until then only direct connections are tried.
 * @example createConnection: (peer, events) => browserPeerConnection(microphone, events)
 */
export function browserPeerConnection(
  microphone: MediaStream,
  events: PeerConnectionEvents<MediaStream>,
): PeerConnection {
  const connection = new RTCPeerConnection({ iceServers: [] });
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
      connection.close();
    },
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
