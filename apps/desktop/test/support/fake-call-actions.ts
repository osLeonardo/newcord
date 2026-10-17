import { vi, type Mock } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/main/local-store/device-settings";
import type {
  CallApiCalls,
  CallSummary,
  DiagnosticsApiCalls,
  ScreenShareApiCalls,
} from "../../src/preload/call-api";
import type { SettingsApiCalls } from "../../src/preload/settings-api";

type CallCalls = CallApiCalls &
  SettingsApiCalls &
  ScreenShareApiCalls &
  DiagnosticsApiCalls;

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
    readSettings: vi.fn<SettingsApiCalls["readSettings"]>(() =>
      Promise.resolve(DEFAULT_SETTINGS),
    ),
    changeSettings: vi.fn<SettingsApiCalls["changeSettings"]>((changes) =>
      Promise.resolve({ ...DEFAULT_SETTINGS, ...changes }),
    ),
    readVoiceControls: vi.fn<SettingsApiCalls["readVoiceControls"]>(() =>
      Promise.resolve({ pushToTalkAvailable: false }),
    ),
    listShareSources: vi.fn<ScreenShareApiCalls["listShareSources"]>(() =>
      Promise.resolve([]),
    ),
    chooseShareSource: vi.fn<ScreenShareApiCalls["chooseShareSource"]>(() =>
      Promise.resolve(true),
    ),
    measureCpu: vi.fn<DiagnosticsApiCalls["measureCpu"]>((seconds) =>
      Promise.resolve({ seconds, averagePercent: 0, byProcessType: [] }),
    ),
  };
}
