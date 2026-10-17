import { CallSignal, DeviceId } from "@newcord/shared";
import { Type, type Static } from "typebox";
import type {
  CallApiCalls,
  CallSummary,
  CpuMeasurement,
  DiagnosticsApiCalls,
  IceConfigurationResult,
  JoinCallResult,
  ScreenShareApiCalls,
  ShareSourceSummary,
} from "../../preload/call-api";
import type {
  DeviceSettings,
  SettingsApiCalls,
  VoiceControlsStatus,
} from "../../preload/settings-api";
import { desktopApiChannels } from "../../preload/desktop-api";
import type { GroupActionResult } from "../../preload/group-api";
import { checkedChannel, type CheckedIpcChannel } from "./checked-ipc-handler";
import { argumentsMatching } from "./typebox-arguments";

const GroupId = Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" });
const GroupArguments = Type.Tuple([GroupId]);
type GroupArguments = Static<typeof GroupArguments>;
const SignalArguments = Type.Tuple([GroupId, DeviceId, CallSignal]);
type SignalArguments = Static<typeof SignalArguments>;
const ParticipantArguments = Type.Tuple([GroupId, DeviceId]);
type ParticipantArguments = Static<typeof ParticipantArguments>;
const ShareSourceArguments = Type.Tuple([
  Type.String({ pattern: "^(screen|window):[0-9]+:[0-9]+$" }),
]);
type ShareSourceArguments = Static<typeof ShareSourceArguments>;
const MeasureArguments = Type.Tuple([
  Type.Integer({ minimum: 5, maximum: 120 }),
]);
type MeasureArguments = Static<typeof MeasureArguments>;
const NoArguments = Type.Tuple([]);
type NoArguments = Static<typeof NoArguments>;
/** Ctrl or Alt, then a letter, digit or F-key: never a key other apps need for typing. */
const MuteHotkey = Type.String({
  pattern:
    "^(?=.*(Ctrl|Alt)\\+)(Ctrl\\+)?(Alt\\+)?(Shift\\+)?([A-Z0-9]|F([1-9]|1[0-9]|2[0-4]))$",
});
const SettingsChangeArguments = Type.Tuple([
  Type.Object(
    {
      microphoneMode: Type.Optional(
        Type.Union([
          Type.Literal("voice-activity"),
          Type.Literal("push-to-talk"),
        ]),
      ),
      pushToTalkKey: Type.Optional(
        Type.Union([
          Type.String({ pattern: "^[A-Za-z0-9]{1,32}$" }),
          Type.Null(),
        ]),
      ),
      muteHotkey: Type.Optional(MuteHotkey),
      codec: Type.Optional(
        Type.Union([
          Type.Literal("H264"),
          Type.Literal("VP8"),
          Type.Literal("VP9"),
        ]),
      ),
      hideMyIp: Type.Optional(Type.Boolean()),
      inputDeviceId: Type.Optional(
        Type.Union([
          Type.String({ minLength: 1, maxLength: 256 }),
          Type.Null(),
        ]),
      ),
      voiceSensitivity: Type.Optional(
        Type.Integer({ minimum: 0, maximum: 100 }),
      ),
      previewMode: Type.Optional(
        Type.Union([
          Type.Literal("full"),
          Type.Literal("sender"),
          Type.Literal("generic"),
        ]),
      ),
      startAtLogin: Type.Optional(Type.Boolean()),
      quitOnClose: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  ),
]);
type SettingsChangeArguments = Static<typeof SettingsChangeArguments>;

/**
 * The Call channels, each checked for its sender and arguments before the Call service sees it.
 * @example createCallIpcChannels(callActions)
 */
export function createCallIpcChannels(
  actions: CallApiCalls &
    SettingsApiCalls &
    ScreenShareApiCalls &
    DiagnosticsApiCalls,
): CheckedIpcChannel[] {
  return [
    checkedChannel<GroupArguments, CallSummary>({
      name: desktopApiChannels.readCall,
      expectedArguments: "groupId: GroupId",
      argumentsMatch: argumentsMatching(GroupArguments),
      handle: (groupId) => actions.readCall(groupId),
    }),
    checkedChannel<GroupArguments, JoinCallResult>({
      name: desktopApiChannels.joinCall,
      expectedArguments: "groupId: GroupId",
      argumentsMatch: argumentsMatching(GroupArguments),
      handle: (groupId) => actions.joinCall(groupId),
    }),
    checkedChannel<GroupArguments, GroupActionResult>({
      name: desktopApiChannels.leaveCall,
      expectedArguments: "groupId: GroupId",
      argumentsMatch: argumentsMatching(GroupArguments),
      handle: (groupId) => actions.leaveCall(groupId),
    }),
    checkedChannel<SignalArguments, GroupActionResult>({
      name: desktopApiChannels.sendCallSignal,
      expectedArguments: "groupId: GroupId, to: DeviceId, signal: CallSignal",
      argumentsMatch: argumentsMatching(SignalArguments),
      handle: (groupId, to, signal) =>
        actions.sendCallSignal(groupId, to, signal),
    }),
    checkedChannel<ParticipantArguments, void>({
      name: desktopApiChannels.dropCallParticipant,
      expectedArguments: "groupId: GroupId, deviceId: DeviceId",
      argumentsMatch: argumentsMatching(ParticipantArguments),
      handle: (groupId, deviceId) =>
        actions.dropCallParticipant(groupId, deviceId),
    }),
    checkedChannel<NoArguments, IceConfigurationResult>({
      name: desktopApiChannels.readIceConfiguration,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readIceConfiguration(),
    }),
    checkedChannel<NoArguments, DeviceSettings>({
      name: desktopApiChannels.readSettings,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readSettings(),
    }),
    checkedChannel<SettingsChangeArguments, DeviceSettings>({
      name: desktopApiChannels.changeSettings,
      expectedArguments: "changes: Partial<DeviceSettings>, each field checked",
      argumentsMatch: argumentsMatching(SettingsChangeArguments),
      handle: (changes) => actions.changeSettings(changes),
    }),
    checkedChannel<NoArguments, VoiceControlsStatus>({
      name: desktopApiChannels.readVoiceControls,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readVoiceControls(),
    }),
    checkedChannel<NoArguments, readonly ShareSourceSummary[]>({
      name: desktopApiChannels.listShareSources,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.listShareSources(),
    }),
    checkedChannel<ShareSourceArguments, boolean>({
      name: desktopApiChannels.chooseShareSource,
      expectedArguments: "sourceId: screen:<n>:<n> or window:<n>:<n>",
      argumentsMatch: argumentsMatching(ShareSourceArguments),
      handle: (sourceId) => actions.chooseShareSource(sourceId),
    }),
    checkedChannel<MeasureArguments, CpuMeasurement>({
      name: desktopApiChannels.measureCpu,
      expectedArguments: "seconds: 5 to 120",
      argumentsMatch: argumentsMatching(MeasureArguments),
      handle: (seconds) => actions.measureCpu(seconds),
    }),
  ];
}
