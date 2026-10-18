import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CallSignal } from "@newcord/shared";
import type {
  CallSummary,
  IceConfiguration,
  ReceivedCallSignal,
} from "../../../preload/call-api";
import type { DeviceSettings } from "../../../preload/settings-api";
import type { DesktopApi } from "../../../preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../account/account-messages";
import { groupRefusalMessage } from "../groups/group-text";
import {
  browserPeerConnection,
  captureScreen,
  openMicrophone,
  reconfigure,
  sendScreen,
  stopSendingScreen,
  stopStream,
  watchVoiceLevel,
  type OpenConnections,
  type ScreenShare,
} from "./browser-call-media";
import { createCallMesh, type CallMesh } from "./call-mesh";
import { shareContentHint, type ShareMode } from "./share-settings";
import {
  createLevelGate,
  DEFAULT_VOICE_SENSITIVITY,
  voiceThreshold,
} from "./voice-level";
import { microphoneOpen, type MicrophoneInputs } from "./voice-settings";

/** Relay passwords last an hour (10-m3-build Settings); new ones are fetched at half that. */
const RELAY_REFRESH_MS = 30 * 60 * 1000;

const SOURCE_GONE_PROBLEM =
  "That screen or window is no longer there. Pick another one.";
const SHARE_PROBLEM = "The screen could not be shared. Try again.";

const MICROPHONE_PROBLEM =
  "The microphone could not be opened. Check that one is connected and allowed in Windows.";

/** The Call this Device is in, kept above the Group screens so switching Groups never hangs up. */
export interface CallSession {
  readonly active: CallSummary | undefined;
  readonly remoteStreams: ReadonlyMap<string, readonly MediaStream[]>;
  /** The Devices heard speaking, this one included while its microphone sends. */
  readonly speaking: ReadonlySet<string>;
  readonly muted: boolean;
  /** Whether this Device is sharing a screen or window; the window shows it with a Stop button. */
  readonly sharing: boolean;
  readonly problem: string | undefined;
  readonly joining: boolean;
  join(groupId: string): void;
  leave(): void;
  /** Also toggled by the global mute hotkey (D44c). */
  toggleMute(): void;
  /** Shares the source picked in the app's own picker, video only (D43), tuned for its mode (D103). */
  startSharing(sourceId: string, mode: ShareMode): void;
  stopSharing(): void;
}

interface RunningCall {
  readonly groupId: string;
  readonly media: CallMedia;
  readonly mesh: CallMesh;
  readonly stopRefreshing: () => void;
}

interface CallRefs {
  running?: RunningCall;
  /** The Group being joined, and the signals that came before its mesh existed. */
  joining?: { groupId: string; signals: ReceivedCallSignal[] };
}

/**
 * Runs this Device's Call: the microphone, one connection per Participant and the speaking levels.
 * @example const callSession = useCallSession(desktopApi);
 */
export function useCallSession(desktopApi: DesktopApi): CallSession {
  const refs = useRef<CallRefs>({});
  const [active, setActive] = useState<CallSummary>();
  const [remoteStreams, setRemoteStreams] = useState<
    ReadonlyMap<string, readonly MediaStream[]>
  >(new Map());
  const [microphone, setMicrophone] = useState<MediaStream>();
  const [problem, setProblem] = useState<string>();
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const pushToTalkHeld = usePushToTalk(desktopApi);
  const settings = useCallSettings(desktopApi);

  const hangUp = useCallback((): void => {
    const running = refs.current.running;
    if (running === undefined) return;
    refs.current.running = undefined;
    running.stopRefreshing();
    running.mesh.close();
    stopStream(running.media.microphone);
    const screen = running.media.screen.current;
    if (screen !== undefined) stopStream(screen.stream);
    setSharing(false);
    setActive(undefined);
    setRemoteStreams(new Map());
    setMicrophone(undefined);
    setMuted(false);
  }, []);

  useEffect(() => {
    const current = refs.current;
    const unsubscribeChanges = desktopApi.onCallChanged((call) => {
      const running = current.running;
      if (running?.groupId !== call.groupId) return;
      if (!call.joined) {
        hangUp();
        return;
      }
      running.mesh.participantsChanged(othersIn(call));
      setActive(call);
    });
    const unsubscribeMute = desktopApi.onMuteToggled(() => {
      if (current.running !== undefined) setMuted((was) => !was);
    });
    const unsubscribeSignals = desktopApi.onCallSignal((received) => {
      if (current.joining?.groupId === received.groupId) {
        current.joining.signals.push(received);
      } else if (current.running?.groupId === received.groupId) {
        current.running.mesh.signalReceived(received.from, received.signal);
      }
    });
    return (): void => {
      unsubscribeChanges();
      unsubscribeMute();
      unsubscribeSignals();
      const running = current.running;
      if (running === undefined) return;
      hangUp();
      desktopApi.leaveCall(running.groupId).catch(reportCallError);
    };
  }, [desktopApi, hangUp]);

  const join = useCallback(
    (groupId: string): void => {
      if (refs.current.running?.groupId === groupId) return;
      setProblem(undefined);
      setJoining(true);
      refs.current.joining = { groupId, signals: [] };
      startCall(desktopApi, groupId)
        .then((started) => {
          const early = refs.current.joining?.signals ?? [];
          refs.current.joining = undefined;
          if (started.outcome === "refused") {
            setProblem(started.problem);
            return;
          }
          // The main process left any other Call before joining this one.
          hangUp();
          const media: CallMedia = {
            microphone: started.microphone,
            configuration: { current: started.configuration },
            connections: new Set(),
            screen: { current: undefined },
          };
          const mesh = meshFor(desktopApi, started.call, media, {
            remoteStreamsChanged: setRemoteStreams,
          });
          refs.current.running = {
            groupId,
            media,
            mesh,
            stopRefreshing: keepRelayFresh(desktopApi, media),
          };
          setMicrophone(started.microphone);
          setActive(started.call);
          mesh.participantsChanged(othersIn(started.call));
          for (const signal of early) {
            mesh.signalReceived(signal.from, signal.signal);
          }
        })
        .catch(() => {
          refs.current.joining = undefined;
          setProblem(UNEXPECTED_FAILURE_MESSAGE);
        })
        .finally(() => {
          setJoining(false);
        });
    },
    [desktopApi, hangUp],
  );

  const leave = useCallback((): void => {
    const running = refs.current.running;
    if (running === undefined) return;
    hangUp();
    desktopApi.leaveCall(running.groupId).catch(reportCallError);
  }, [desktopApi, hangUp]);

  const toggleMute = useCallback((): void => {
    if (refs.current.running !== undefined) setMuted((was) => !was);
  }, []);

  const stopSharing = useCallback((): void => {
    const media = refs.current.running?.media;
    const screen = media?.screen.current;
    if (media === undefined || screen === undefined) return;
    media.screen.current = undefined;
    for (const connection of media.connections) {
      stopSendingScreen(connection, screen.track);
    }
    stopStream(screen.stream);
    setSharing(false);
  }, []);

  const codec = settings?.codec ?? "H264";
  const startSharing = useCallback(
    (sourceId: string, mode: ShareMode): void => {
      const media = refs.current.running?.media;
      if (media === undefined || media.screen.current !== undefined) return;
      setProblem(undefined);
      shareScreen(desktopApi, sourceId, codec, mode)
        .then((shared) => {
          if (shared.outcome === "refused") {
            setProblem(shared.problem);
            return;
          }
          // The call may have ended while the picker was open.
          if (refs.current.running?.media !== media) {
            stopStream(shared.screen.stream);
            return;
          }
          media.screen.current = shared.screen;
          for (const connection of media.connections) {
            sendScreen(connection, shared.screen);
          }
          // Stopping from Windows' own controls ends the track.
          shared.screen.track.addEventListener("ended", stopSharing);
          setSharing(true);
        })
        .catch(() => {
          setProblem(SHARE_PROBLEM);
        });
    },
    [codec, desktopApi, stopSharing],
  );

  // The tray's Mute or Unmute, and private notifications while sharing (D15), follow this.
  const inCall = active !== undefined;
  useEffect(() => {
    desktopApi
      .reportCallMedia({ muted: inCall && muted, sharing })
      .catch(reportCallError);
  }, [desktopApi, inCall, muted, sharing]);

  const selfSpeaking = useMicrophoneGate(microphone, {
    mode: settings?.microphoneMode ?? "voice-activity",
    sensitivity: settings?.voiceSensitivity ?? DEFAULT_VOICE_SENSITIVITY,
    muted,
    pushToTalkHeld,
  });
  const othersSpeaking = useSpeaking(remoteStreams);
  const ownDeviceId = active?.ownDeviceId;
  const speaking = useMemo(
    () =>
      selfSpeaking && ownDeviceId !== undefined
        ? new Set([...othersSpeaking, ownDeviceId])
        : othersSpeaking,
    [othersSpeaking, ownDeviceId, selfSpeaking],
  );

  return {
    active,
    remoteStreams,
    speaking,
    muted,
    sharing,
    problem,
    joining,
    join,
    leave,
    toggleMute,
    startSharing,
    stopSharing,
  };
}

type SharedScreen =
  | { readonly outcome: "shared"; readonly screen: ScreenShare }
  | { readonly outcome: "refused"; readonly problem: string };

/** Tells the main process which source to answer with, then captures it. */
async function shareScreen(
  desktopApi: DesktopApi,
  sourceId: string,
  codec: ScreenShare["codec"],
  mode: ShareMode,
): Promise<SharedScreen> {
  if (!(await desktopApi.chooseShareSource(sourceId))) {
    return { outcome: "refused", problem: SOURCE_GONE_PROBLEM };
  }
  const stream = await captureScreen();
  const [track] = stream.getVideoTracks();
  if (track === undefined) {
    stopStream(stream);
    return { outcome: "refused", problem: SHARE_PROBLEM };
  }
  // Text keeps detail and drops frame rate first; motion keeps 30 fps and drops resolution (D103).
  track.contentHint = shareContentHint(mode);
  return { outcome: "shared", screen: { stream, track, codec } };
}

/** The Device settings, following changes made in any window. */
function useCallSettings(desktopApi: DesktopApi): DeviceSettings | undefined {
  const [settings, setSettings] = useState<DeviceSettings>();
  useEffect(() => {
    let mounted = true;
    desktopApi.readSettings().then((read) => {
      if (mounted) setSettings(read);
    }, reportCallError);
    const unsubscribe = desktopApi.onSettingsChanged(setSettings);
    return (): void => {
      mounted = false;
      unsubscribe();
    };
  }, [desktopApi]);
  return settings;
}

/** Whether the push-to-talk key is held, heard by the main process while any app is in front. */
function usePushToTalk(desktopApi: DesktopApi): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => desktopApi.onPushToTalk(setHeld), [desktopApi]);
  return held;
}

/**
 * Turns the microphone's track on and off by voice activity or push-to-talk, and off while muted
 * (D44). The level is measured on a copy of the track, which keeps hearing while the track is off.
 * Answers whether this Device is sending speech now.
 */
function useMicrophoneGate(
  microphone: MediaStream | undefined,
  controls: Omit<MicrophoneInputs, "voiceDetected"> & {
    readonly sensitivity: number;
  },
): boolean {
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const { mode, muted, pushToTalkHeld, sensitivity } = controls;
  useEffect(() => {
    if (microphone === undefined) return;
    const tracks = microphone.getAudioTracks();
    const listening = new MediaStream(tracks.map((track) => track.clone()));
    const gate = createLevelGate(voiceThreshold(sensitivity));
    let voiceDetected = false;
    const apply = (): void => {
      const open = microphoneOpen({
        mode,
        voiceDetected,
        pushToTalkHeld,
        muted,
      });
      for (const track of tracks) track.enabled = open;
      setSelfSpeaking(open && voiceDetected);
    };
    apply();
    const stopWatching = watchVoiceLevel(listening, (level) => {
      voiceDetected = gate.update(level, performance.now());
      apply();
    });
    return (): void => {
      stopWatching();
      stopStream(listening);
      setSelfSpeaking(false);
    };
  }, [microphone, mode, muted, pushToTalkHeld, sensitivity]);
  return selfSpeaking;
}

type StartedCall =
  | {
      readonly outcome: "joined";
      readonly call: CallSummary;
      readonly microphone: MediaStream;
      readonly configuration: IceConfiguration;
    }
  | { readonly outcome: "refused"; readonly problem: string };

/**
 * Opens the microphone and gets the relay's passwords before joining, so a refused permission or
 * an unreachable relay with Hide my IP sends nothing; a refused join turns the microphone off again.
 */
async function startCall(
  desktopApi: DesktopApi,
  groupId: string,
): Promise<StartedCall> {
  let microphone: MediaStream;
  try {
    // The input device chosen in Settings applies from the next Call on.
    const settings = await desktopApi.readSettings();
    microphone = await openMicrophone(settings.inputDeviceId);
  } catch {
    return { outcome: "refused", problem: MICROPHONE_PROBLEM };
  }
  try {
    const relay = await desktopApi.readIceConfiguration();
    if (relay.outcome === "refused") {
      stopStream(microphone);
      return {
        outcome: "refused",
        problem: groupRefusalMessage(relay.refusal),
      };
    }
    const result = await desktopApi.joinCall(groupId);
    if (result.outcome === "refused") {
      stopStream(microphone);
      return {
        outcome: "refused",
        problem: groupRefusalMessage(result.refusal),
      };
    }
    return {
      outcome: "joined",
      call: result.call,
      microphone,
      configuration: relay.configuration,
    };
  } catch (error) {
    stopStream(microphone);
    throw error;
  }
}

interface CallMedia {
  readonly microphone: MediaStream;
  /** The newest relay passwords, used by every new connection. */
  readonly configuration: { current: IceConfiguration };
  readonly connections: OpenConnections;
  /** The running share, which every new connection also sends. */
  readonly screen: { current: ScreenShare | undefined };
}

/** Fetches fresh relay passwords every 30 minutes and hands them to every connection. */
function keepRelayFresh(desktopApi: DesktopApi, media: CallMedia): () => void {
  const timer = setInterval(() => {
    desktopApi
      .readIceConfiguration()
      .then((relay) => {
        // Without new passwords the connections keep the ones they have.
        if (relay.outcome !== "ready") return;
        media.configuration.current = relay.configuration;
        reconfigure(media.connections, relay.configuration);
      })
      .catch(reportCallError);
  }, RELAY_REFRESH_MS);
  return (): void => {
    clearInterval(timer);
  };
}

function meshFor(
  desktopApi: DesktopApi,
  call: CallSummary,
  media: CallMedia,
  callbacks: {
    remoteStreamsChanged(
      streams: ReadonlyMap<string, readonly MediaStream[]>,
    ): void;
  },
): CallMesh {
  const { groupId } = call;
  return createCallMesh<MediaStream>({
    ownDeviceId: call.ownDeviceId,
    createConnection: (_peer, events) =>
      browserPeerConnection(
        {
          microphone: media.microphone,
          configuration: media.configuration.current,
          connections: media.connections,
          screen: media.screen.current,
        },
        events,
      ),
    sendSignal: (to: string, signal: CallSignal) => {
      desktopApi.sendCallSignal(groupId, to, signal).catch(reportCallError);
    },
    dropParticipant: (deviceId) => {
      desktopApi.dropCallParticipant(groupId, deviceId).catch(reportCallError);
    },
    remoteStreamsChanged: (streams) => {
      callbacks.remoteStreamsChanged(streams);
    },
    startTimer: (callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return (): void => {
        clearTimeout(timer);
      };
    },
    reportError: reportCallError,
  });
}

/** The Participants to connect to: everyone but this Device. */
function othersIn(call: CallSummary): string[] {
  return call.participants
    .filter((participant) => !participant.self)
    .map((participant) => participant.deviceId);
}

/** Who is speaking, measured on each stream with the 300 ms hold. */
function useSpeaking(
  streams: ReadonlyMap<string, readonly MediaStream[]>,
): ReadonlySet<string> {
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const heard = new Set<string>();
    const voices = [...streams].flatMap(([deviceId, peerStreams]) =>
      peerStreams
        .filter((stream) => stream.getAudioTracks().length > 0)
        .map((stream) => [deviceId, stream] as const),
    );
    const stops = voices.map(([deviceId, stream]) => {
      const gate = createLevelGate();
      return watchVoiceLevel(stream, (level) => {
        const now = gate.update(level, performance.now());
        if (now === heard.has(deviceId)) return;
        if (now) heard.add(deviceId);
        else heard.delete(deviceId);
        setSpeaking(new Set(heard));
      });
    });
    return (): void => {
      for (const stop of stops) stop();
      setSpeaking(new Set());
    };
  }, [streams]);
  return speaking;
}

function reportCallError(error: unknown): void {
  console.error("A Call step failed", error);
}
