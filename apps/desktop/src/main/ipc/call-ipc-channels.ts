import { CallSignal, DeviceId } from "@newcord/shared";
import { Type, type Static } from "typebox";
import type {
  CallApiCalls,
  CallSettings,
  CallSettingsApiCalls,
  CallSummary,
  IceConfigurationResult,
  JoinCallResult,
} from "../../preload/call-api";
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
const NoArguments = Type.Tuple([]);
type NoArguments = Static<typeof NoArguments>;
const SettingsChangeArguments = Type.Tuple([
  Type.Object(
    { hideMyIp: Type.Optional(Type.Boolean()) },
    { additionalProperties: false },
  ),
]);
type SettingsChangeArguments = Static<typeof SettingsChangeArguments>;

/**
 * The Call channels, each checked for its sender and arguments before the Call service sees it.
 * @example createCallIpcChannels(callActions)
 */
export function createCallIpcChannels(
  actions: CallApiCalls & CallSettingsApiCalls,
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
    checkedChannel<NoArguments, CallSettings>({
      name: desktopApiChannels.readCallSettings,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readCallSettings(),
    }),
    checkedChannel<SettingsChangeArguments, CallSettings>({
      name: desktopApiChannels.changeCallSettings,
      expectedArguments: "changes: { hideMyIp?: boolean }",
      argumentsMatch: argumentsMatching(SettingsChangeArguments),
      handle: (changes) => actions.changeCallSettings(changes),
    }),
  ];
}
