import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CallSignal } from "@newcord/shared";
import type {
  CallSummary,
  IceConfiguration,
  ReceivedCallSignal,
} from "../../../preload/call-api";
import type { DesktopApi } from "../../../preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../account/account-messages";
import { groupRefusalMessage } from "../groups/group-text";
import {
  browserPeerConnection,
  openMicrophone,
  reconfigure,
  stopStream,
  watchVoiceLevel,
  type OpenConnections,
} from "./browser-call-media";
import { createCallMesh, type CallMesh } from "./call-mesh";
import { createLevelGate } from "./voice-level";

/** Relay passwords last an hour (10-m3-build Settings); new ones are fetched at half that. */
const RELAY_REFRESH_MS = 30 * 60 * 1000;

const MICROPHONE_PROBLEM =
  "The microphone could not be opened. Check that one is connected and allowed in Windows.";

/** The Call this Device is in, kept above the Group screens so switching Groups never hangs up. */
export interface CallSession {
  readonly active: CallSummary | undefined;
  readonly remoteStreams: ReadonlyMap<string, MediaStream>;
  /** The Devices heard speaking, this one included. */
  readonly speaking: ReadonlySet<string>;
  readonly problem: string | undefined;
  readonly joining: boolean;
  join(groupId: string): void;
  leave(): void;
}

interface RunningCall {
  readonly groupId: string;
  readonly microphone: MediaStream;
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
    ReadonlyMap<string, MediaStream>
  >(new Map());
  const [microphone, setMicrophone] = useState<MediaStream>();
  const [problem, setProblem] = useState<string>();
  const [joining, setJoining] = useState(false);

  const hangUp = useCallback((): void => {
    const running = refs.current.running;
    if (running === undefined) return;
    refs.current.running = undefined;
    running.stopRefreshing();
    running.mesh.close();
    stopStream(running.microphone);
    setActive(undefined);
    setRemoteStreams(new Map());
    setMicrophone(undefined);
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
    const unsubscribeSignals = desktopApi.onCallSignal((received) => {
      if (current.joining?.groupId === received.groupId) {
        current.joining.signals.push(received);
      } else if (current.running?.groupId === received.groupId) {
        current.running.mesh.signalReceived(received.from, received.signal);
      }
    });
    return (): void => {
      unsubscribeChanges();
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
          };
          const mesh = meshFor(desktopApi, started.call, media, {
            remoteStreamsChanged: setRemoteStreams,
          });
          refs.current.running = {
            groupId,
            microphone: started.microphone,
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

  const levelStreams = useMemo(() => {
    if (active === undefined || microphone === undefined) return remoteStreams;
    return new Map([...remoteStreams, [active.ownDeviceId, microphone]]);
  }, [active, microphone, remoteStreams]);
  const speaking = useSpeaking(levelStreams);

  return { active, remoteStreams, speaking, problem, joining, join, leave };
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
    microphone = await openMicrophone();
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
    remoteStreamsChanged(streams: ReadonlyMap<string, MediaStream>): void;
  },
): CallMesh {
  const { groupId } = call;
  return createCallMesh<MediaStream>({
    ownDeviceId: call.ownDeviceId,
    createConnection: (_peer, events) =>
      browserPeerConnection(
        media.microphone,
        media.configuration.current,
        media.connections,
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
  streams: ReadonlyMap<string, MediaStream>,
): ReadonlySet<string> {
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const heard = new Set<string>();
    const stops = [...streams].map(([deviceId, stream]) => {
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
