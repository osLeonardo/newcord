import type { CallApiCalls } from "../../preload/call-api";
import type {
  DeviceSettings,
  SettingsApiCalls,
} from "../../preload/settings-api";
import type { VoiceControls } from "./voice-controls";
import type { SettingsStore } from "../local-store/device-settings";

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
    readIceConfiguration: () =>
      currentService()?.readIceConfiguration() ?? Promise.resolve(unavailable),
  };
}

/**
 * The settings functions, answered from the local database whether or not anyone is logged in.
 * Each change reaches the voice controls and every window.
 * @example const settingsActions = createSettingsActions(store, voiceControls, notifyWindows);
 */
export function createSettingsActions(
  store: SettingsStore,
  voiceControls: Pick<VoiceControls, "settingsChanged" | "pushToTalkAvailable">,
  settingsChanged: (settings: DeviceSettings) => void,
): SettingsApiCalls {
  return {
    readSettings: () => Promise.resolve(store.read()),
    changeSettings: (changes): Promise<DeviceSettings> => {
      const settings = store.change(changes);
      voiceControls.settingsChanged();
      settingsChanged(settings);
      return Promise.resolve(settings);
    },
    readVoiceControls: () =>
      Promise.resolve({
        pushToTalkAvailable: voiceControls.pushToTalkAvailable(),
      }),
  };
}
