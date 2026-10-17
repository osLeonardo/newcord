import type { CallApiCalls } from "../../preload/call-api";

/**
 * The desktop API's Call functions, answered by the logged-in Device's Call service; without one
 * (no connection accepted yet, or no MLS module, #4) there is no Call to join.
 * @example const callActions = createCallActions(() => deviceHub?.current()?.calls);
 */
export function createCallActions(
  currentService: () => CallApiCalls | undefined,
): CallApiCalls {
  const unavailable = { outcome: "refused", refusal: "UNAVAILABLE" } as const;
  return {
    readCall: (groupId) =>
      currentService()?.readCall(groupId) ??
      Promise.resolve({
        groupId,
        ownDeviceId: "",
        joined: false,
        participants: [],
        full: false,
      }),
    joinCall: (groupId) =>
      currentService()?.joinCall(groupId) ?? Promise.resolve(unavailable),
    leaveCall: (groupId) =>
      currentService()?.leaveCall(groupId) ?? Promise.resolve(unavailable),
    sendCallSignal: (groupId, to, signal) =>
      currentService()?.sendCallSignal(groupId, to, signal) ??
      Promise.resolve(unavailable),
    dropCallParticipant: (groupId, deviceId) =>
      currentService()?.dropCallParticipant(groupId, deviceId) ??
      Promise.resolve(),
  };
}
