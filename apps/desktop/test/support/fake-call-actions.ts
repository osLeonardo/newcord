import { vi, type Mock } from "vitest";
import type {
  CallApiCalls,
  CallSettingsApiCalls,
  CallSummary,
} from "../../src/preload/call-api";

type CallCalls = CallApiCalls & CallSettingsApiCalls;

export type FakeCallActions = {
  [Name in keyof CallCalls]: Mock<CallCalls[Name]>;
};

const emptyCall = (groupId: string): CallSummary => ({
  groupId,
  ownDeviceId: "a".repeat(22),
  joined: false,
  participants: [],
  full: false,
});

/** Call actions that answer like an empty Call, for tests of the layers around them. */
export function fakeCallActions(): FakeCallActions {
  return {
    readCall: vi.fn<CallApiCalls["readCall"]>((groupId) =>
      Promise.resolve(emptyCall(groupId)),
    ),
    joinCall: vi.fn<CallApiCalls["joinCall"]>((groupId) =>
      Promise.resolve({
        outcome: "joined",
        call: { ...emptyCall(groupId), joined: true },
      }),
    ),
    leaveCall: vi.fn<CallApiCalls["leaveCall"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
    sendCallSignal: vi.fn<CallApiCalls["sendCallSignal"]>(() =>
      Promise.resolve({ outcome: "done" }),
    ),
    dropCallParticipant: vi.fn<CallApiCalls["dropCallParticipant"]>(() =>
      Promise.resolve(),
    ),
    readIceConfiguration: vi.fn<CallApiCalls["readIceConfiguration"]>(() =>
      Promise.resolve({
        outcome: "ready",
        configuration: { iceServers: [], iceTransportPolicy: "all" },
      }),
    ),
    readCallSettings: vi.fn<CallSettingsApiCalls["readCallSettings"]>(() =>
      Promise.resolve({ hideMyIp: false }),
    ),
    changeCallSettings: vi.fn<CallSettingsApiCalls["changeCallSettings"]>(
      (changes) => Promise.resolve({ hideMyIp: false, ...changes }),
    ),
  };
}
