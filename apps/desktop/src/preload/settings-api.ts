/** How the microphone turns on (D44). */
export type MicrophoneMode = "voice-activity" | "push-to-talk";

/** The codec a screen share prefers; the others stay listed after it (D11, D11b). */
export type ShareCodec = "H264" | "VP8" | "VP9";

/** How much a message notification shows (D15); always generic while a screen share runs. */
export type PreviewMode = "full" | "sender" | "generic";

/**
 * Every setting of this Device, stored in its local database (11-m4-build Settings: settings live
 * on each device), shown in four sections: Audio, Video, Privacy and App.
 */
export interface DeviceSettings {
  readonly microphoneMode: MicrophoneMode;
  /** The held key, as a `KeyboardEvent.code`; none until the person picks one (11-m4-build Settings). */
  readonly pushToTalkKey: string | null;
  /** An Electron accelerator, Ctrl+Shift+M by default (11-m4-build Settings). */
  readonly muteHotkey: string;
  /** The microphone's `deviceId`, or null for the system's default one. */
  readonly inputDeviceId: string | null;
  /** 0 to 100; 50 is M3's voice-activity threshold, higher hears quieter voices (#10's spec). */
  readonly voiceSensitivity: number;
  readonly codec: ShareCodec;
  /** Relay-only connections from the next Call on, so Participants never see this Device's IP (D14). */
  readonly hideMyIp: boolean;
  readonly previewMode: PreviewMode;
  /** Starts hidden in the tray when Windows starts (D46). */
  readonly startAtLogin: boolean;
  /** Closing the window quits instead of hiding it to the tray (D15b). */
  readonly quitOnClose: boolean;
}

/** Whether the voice controls can work on this computer. */
export interface VoiceControlsStatus {
  /** Push-to-talk needs the keyboard hook, `uiohook-napi` (D74). */
  readonly pushToTalkAvailable: boolean;
}

/** The settings, which need no Account: they belong to the computer. */
export interface SettingsApiCalls {
  readSettings(): Promise<DeviceSettings>;
  changeSettings(changes: Partial<DeviceSettings>): Promise<DeviceSettings>;
  readVoiceControls(): Promise<VoiceControlsStatus>;
}
