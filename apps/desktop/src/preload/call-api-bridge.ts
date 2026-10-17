import type {
  CallSummary,
  JoinCallResult,
  ReceivedCallSignal,
} from "./call-api";
import type { IpcInvoke, IpcSubscribe } from "./desktop-api-bridge";
import {
  desktopApiChannels,
  desktopApiEventChannels,
  type DesktopApi,
} from "./desktop-api";
import type { GroupActionResult } from "./group-api";

type CallApi = Pick<
  DesktopApi,
  | "readCall"
  | "joinCall"
  | "leaveCall"
  | "sendCallSignal"
  | "dropCallParticipant"
  | "onCallChanged"
  | "onCallSignal"
>;

/**
 * The desktop API's Call functions on IPC, each passing its own arguments and nothing else.
 * @example const calls = createCallApi(invoke, subscribe);
 */
export function createCallApi(
  invoke: IpcInvoke,
  subscribe: IpcSubscribe,
): CallApi {
  return {
    readCall: (groupId) =>
      invoke(desktopApiChannels.readCall, groupId) as Promise<CallSummary>,
    joinCall: (groupId) =>
      invoke(desktopApiChannels.joinCall, groupId) as Promise<JoinCallResult>,
    leaveCall: (groupId) =>
      invoke(
        desktopApiChannels.leaveCall,
        groupId,
      ) as Promise<GroupActionResult>,
    sendCallSignal: (groupId, to, signal) =>
      invoke(
        desktopApiChannels.sendCallSignal,
        groupId,
        to,
        signal,
      ) as Promise<GroupActionResult>,
    dropCallParticipant: (groupId, deviceId) =>
      invoke(
        desktopApiChannels.dropCallParticipant,
        groupId,
        deviceId,
      ) as Promise<void>,
    onCallChanged: (listener) =>
      subscribe(desktopApiEventChannels.onCallChanged, (payload) =>
        listener(payload as CallSummary),
      ),
    onCallSignal: (listener) =>
      subscribe(desktopApiEventChannels.onCallSignal, (payload) =>
        listener(payload as ReceivedCallSignal),
      ),
  };
}
