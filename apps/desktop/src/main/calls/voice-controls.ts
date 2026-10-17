import type { CallSummary } from "../../preload/call-api";
import type { DeviceSettings } from "../../preload/settings-api";

/** Electron's `globalShortcut`, or a test's stand-in. */
export interface HotkeyRegistry {
  /** False when another app holds the shortcut. */
  register(accelerator: string, pressed: () => void): boolean;
  unregister(accelerator: string): void;
}

/**
 * A keyboard hook that hears keys while another app is in front (D44b), as `uiohook-napi` does
 * (D74). Codes are `KeyboardEvent.code` names, such as "KeyV" or "CapsLock".
 */
export interface KeyboardHook {
  /** Starts listening and returns what stops it. */
  start(keyChanged: (code: string, down: boolean) => void): () => void;
}

export interface VoiceControlsDependencies {
  readonly hotkeys?: HotkeyRegistry;
  /** Missing until `uiohook-napi` is approved and installed (#9, Step 03). */
  readonly keyboardHook?: KeyboardHook;
  readonly settings: () => DeviceSettings;
  muteToggled(): void;
  pushToTalkChanged(held: boolean): void;
  reportError(error: unknown): void;
}

/** The global mute hotkey and push-to-talk, active only while this Device is in a Call. */
export interface VoiceControls {
  callChanged(call: CallSummary): void;
  settingsChanged(): void;
  pushToTalkAvailable(): boolean;
  stop(): void;
}

interface ControlsState {
  inCall?: string;
  hotkey?: string;
  hook?: { readonly key: string; readonly stop: () => void };
  held: boolean;
}

/**
 * Creates the voice controls. The mute hotkey uses Electron's global shortcuts, which only need key
 * presses (D44c); push-to-talk needs a held key heard everywhere, so it uses the keyboard hook.
 * @example const controls = createVoiceControls({ hotkeys: globalShortcut, settings, muteToggled, … });
 */
export function createVoiceControls(
  dependencies: VoiceControlsDependencies,
): VoiceControls {
  const state: ControlsState = { held: false };
  const apply = (): void => {
    const settings = dependencies.settings();
    applyHotkey(
      dependencies,
      state,
      state.inCall ? settings.muteHotkey : undefined,
    );
    applyHook(dependencies, state, wantedPushToTalkKey(state, settings));
  };
  return {
    callChanged: (call): void => {
      if (call.joined) state.inCall = call.groupId;
      else if (state.inCall === call.groupId) state.inCall = undefined;
      apply();
    },
    settingsChanged: apply,
    pushToTalkAvailable: (): boolean => dependencies.keyboardHook !== undefined,
    stop: (): void => {
      state.inCall = undefined;
      apply();
    },
  };
}

function wantedPushToTalkKey(
  state: ControlsState,
  settings: DeviceSettings,
): string | undefined {
  if (state.inCall === undefined) return undefined;
  if (settings.microphoneMode !== "push-to-talk") return undefined;
  return settings.pushToTalkKey ?? undefined;
}

function applyHotkey(
  dependencies: VoiceControlsDependencies,
  state: ControlsState,
  wanted: string | undefined,
): void {
  const { hotkeys } = dependencies;
  if (hotkeys === undefined || state.hotkey === wanted) return;
  if (state.hotkey !== undefined) hotkeys.unregister(state.hotkey);
  state.hotkey = undefined;
  if (wanted === undefined) return;
  try {
    if (hotkeys.register(wanted, () => dependencies.muteToggled())) {
      state.hotkey = wanted;
    }
  } catch (error) {
    dependencies.reportError(error);
  }
}

function applyHook(
  dependencies: VoiceControlsDependencies,
  state: ControlsState,
  wanted: string | undefined,
): void {
  const { keyboardHook } = dependencies;
  if (state.hook?.key === wanted) return;
  state.hook?.stop();
  state.hook = undefined;
  setHeld(dependencies, state, false);
  if (keyboardHook === undefined || wanted === undefined) return;
  const stop = keyboardHook.start((code, down) => {
    // A held key repeats its key-down; only changes count.
    if (code === wanted) setHeld(dependencies, state, down);
  });
  state.hook = { key: wanted, stop };
}

function setHeld(
  dependencies: VoiceControlsDependencies,
  state: ControlsState,
  held: boolean,
): void {
  if (state.held === held) return;
  state.held = held;
  dependencies.pushToTalkChanged(held);
}
