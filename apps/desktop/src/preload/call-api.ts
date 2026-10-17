import type { CallSignal } from "@newcord/shared";
import type { GroupActionResult, GroupRefusal } from "./group-api";

/** Someone heard in a Group's Call; a person on two Devices is there twice. */
export interface CallParticipantSummary {
  readonly username: string;
  readonly deviceId: string;
  readonly self: boolean;
}

/** A Group's Call as this Device knows it from the MLS messages it received (D18). */
export interface CallSummary {
  readonly groupId: string;
  /** This Device's ID; the lower ID of a pair is the polite side (10-m3-build step 4). */
  readonly ownDeviceId: string;
  readonly joined: boolean;
  /** This Device first when it is in the Call, then the others in the order they joined. */
  readonly participants: readonly CallParticipantSummary[];
  /** Six Participants: one more would see "call full" (D2). */
  readonly full: boolean;
}

export type JoinCallResult =
  | { readonly outcome: "joined"; readonly call: CallSummary }
  | { readonly outcome: "refused"; readonly refusal: GroupRefusal };

/** A decrypted signal for this Device from another Participant, for the window's WebRTC. */
export interface ReceivedCallSignal {
  readonly groupId: string;
  readonly from: string;
  readonly signal: CallSignal;
}

/** One STUN or TURN entry of `RTCConfiguration.iceServers`, all on the app's own relay (D23). */
export interface IceServer {
  readonly urls: readonly string[];
  readonly username?: string;
  readonly credential?: string;
}

/** How each Call connection reaches the others: the relay, and only the relay with Hide my IP (D14). */
export interface IceConfiguration {
  readonly iceServers: readonly IceServer[];
  readonly iceTransportPolicy: "all" | "relay";
}

export type IceConfigurationResult =
  | { readonly outcome: "ready"; readonly configuration: IceConfiguration }
  | { readonly outcome: "refused"; readonly refusal: GroupRefusal };

/** How the microphone turns on (D44). */
export type MicrophoneMode = "voice-activity" | "push-to-talk";

/** The codec a screen share prefers; the others stay listed after it (D11, D11b). */
export type ShareCodec = "H264" | "VP8" | "VP9";

/** The Call settings stored on this Device (10-m3-build Settings: settings live on each device). */
export interface CallSettings {
  readonly microphoneMode: MicrophoneMode;
  /** The held key, as a `KeyboardEvent.code`; none until the person picks one (11-m4-build Settings). */
  readonly pushToTalkKey: string | null;
  /** An Electron accelerator, Ctrl+Shift+M by default (11-m4-build Settings). */
  readonly muteHotkey: string;
  readonly codec: ShareCodec;
  /** Relay-only connections from the next Call on, so Participants never see this Device's IP (D14). */
  readonly hideMyIp: boolean;
}

/** Whether the voice controls can work on this computer. */
export interface VoiceControlsStatus {
  /** Push-to-talk needs the keyboard hook, `uiohook-napi` (D74). */
  readonly pushToTalkAvailable: boolean;
}

/** The Call functions the window uses; WebRTC itself runs in the window (D42). */
export interface CallApiCalls {
  readCall(groupId: string): Promise<CallSummary>;
  /** Sends call.join through MLS, leaving any other Call first; refused with CALL_FULL, sending nothing. */
  joinCall(groupId: string): Promise<JoinCallResult>;
  leaveCall(groupId: string): Promise<GroupActionResult>;
  /** Encrypts a signal for one Participant's Device; it is never sent in plain form (D18). */
  sendCallSignal(
    groupId: string,
    to: string,
    signal: CallSignal,
  ): Promise<GroupActionResult>;
  /** Takes a Participant off the list after its connection failed or never came up in 30 seconds. */
  dropCallParticipant(groupId: string, deviceId: string): Promise<void>;
  /** Fresh relay passwords for new connections; refused with RELAY_UNAVAILABLE when Hide my IP cannot be kept. */
  readIceConfiguration(): Promise<IceConfigurationResult>;
}

/** A screen or window the app's own picker offers for sharing (10-m3-build step 7). */
export interface ShareSourceSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: "screen" | "window";
  /** A PNG data URL. */
  readonly thumbnail: string;
}

/** The app's own screen-share picker; the share itself is video only (D43). */
export interface ScreenShareApiCalls {
  listShareSources(): Promise<readonly ShareSourceSummary[]>;
  /** Makes the next screen-share request capture this source; false for one not listed. */
  chooseShareSource(sourceId: string): Promise<boolean>;
}

/** The app's average CPU use over a measurement, in percent of one core (10-m3-build step 9). */
export interface CpuMeasurement {
  readonly seconds: number;
  readonly averagePercent: number;
  readonly byProcessType: readonly {
    readonly type: string;
    readonly averagePercent: number;
  }[];
}

/** Measurements for the developer, such as the codec comparison of #9, Step 05. */
export interface DiagnosticsApiCalls {
  measureCpu(seconds: number): Promise<CpuMeasurement>;
}

/** The Call settings, which need no Account: they belong to the computer. */
export interface CallSettingsApiCalls {
  readCallSettings(): Promise<CallSettings>;
  changeCallSettings(changes: Partial<CallSettings>): Promise<CallSettings>;
  readVoiceControls(): Promise<VoiceControlsStatus>;
}
