import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceControls,
  type HotkeyRegistry,
  type KeyboardHook,
  type VoiceControls,
} from "../src/main/calls/voice-controls";
import type { CallSettings, CallSummary } from "../src/preload/call-api";

const groupId = "MgZoqEdt4EEfhsMd_7xNqw";

function call(joined: boolean, id = groupId): CallSummary {
  return {
    groupId: id,
    ownDeviceId: "a".repeat(22),
    joined,
    participants: [],
    full: false,
  };
}

class FakeHotkeys implements HotkeyRegistry {
  readonly registered = new Map<string, () => void>();
  taken = new Set<string>();

  register(accelerator: string, pressed: () => void): boolean {
    if (this.taken.has(accelerator)) return false;
    this.registered.set(accelerator, pressed);
    return true;
  }

  unregister(accelerator: string): void {
    this.registered.delete(accelerator);
  }
}

class FakeKeyboardHook implements KeyboardHook {
  listener?: (code: string, down: boolean) => void;

  start(keyChanged: (code: string, down: boolean) => void): () => void {
    this.listener = keyChanged;
    return () => {
      this.listener = undefined;
    };
  }

  press(code: string, down: boolean): void {
    this.listener?.(code, down);
  }
}

let settings: CallSettings;
let hotkeys: FakeHotkeys;
let hook: FakeKeyboardHook;
let muteToggled: ReturnType<typeof vi.fn<() => void>>;
let pushToTalk: boolean[];
let controls: VoiceControls;

beforeEach(() => {
  settings = {
    microphoneMode: "voice-activity",
    pushToTalkKey: null,
    muteHotkey: "Ctrl+Shift+M",
    codec: "H264",
    hideMyIp: false,
  };
  hotkeys = new FakeHotkeys();
  hook = new FakeKeyboardHook();
  muteToggled = vi.fn<() => void>();
  pushToTalk = [];
  controls = createVoiceControls({
    hotkeys,
    keyboardHook: hook,
    settings: () => settings,
    muteToggled,
    pushToTalkChanged: (held) => pushToTalk.push(held),
    reportError: (error) => {
      throw error;
    },
  });
});

describe("the mute hotkey (D44c)", () => {
  it("is registered only while this Device is in a Call", () => {
    expect(hotkeys.registered.size).toBe(0);

    controls.callChanged(call(true));
    expect([...hotkeys.registered.keys()]).toEqual(["Ctrl+Shift+M"]);

    controls.callChanged(call(false));
    expect(hotkeys.registered.size).toBe(0);
  });

  it("toggles mute from anywhere", () => {
    controls.callChanged(call(true));

    hotkeys.registered.get("Ctrl+Shift+M")?.();

    expect(muteToggled).toHaveBeenCalledOnce();
  });

  it("moves to a new shortcut when the setting changes", () => {
    controls.callChanged(call(true));

    settings = { ...settings, muteHotkey: "Alt+M" };
    controls.settingsChanged();

    expect([...hotkeys.registered.keys()]).toEqual(["Alt+M"]);
  });

  it("ignores another Group's Call ending", () => {
    controls.callChanged(call(true));

    controls.callChanged(call(false, "mJMEbgts33NWbvGmNqkuEw"));

    expect(hotkeys.registered.size).toBe(1);
  });
});

describe("push-to-talk (D44, D44b)", () => {
  beforeEach(() => {
    settings = {
      ...settings,
      microphoneMode: "push-to-talk",
      pushToTalkKey: "KeyV",
    };
  });

  it("turns on while the key is held and off when it is let go", () => {
    controls.callChanged(call(true));

    hook.press("KeyV", true);
    hook.press("KeyV", true);
    hook.press("KeyB", true);
    hook.press("KeyV", false);

    expect(pushToTalk).toEqual([true, false]);
  });

  it("listens only during a Call, in push-to-talk mode, with a key chosen", () => {
    expect(hook.listener).toBeUndefined();

    controls.callChanged(call(true));
    expect(hook.listener).toBeDefined();

    settings = { ...settings, microphoneMode: "voice-activity" };
    controls.settingsChanged();
    expect(hook.listener).toBeUndefined();

    settings = {
      ...settings,
      microphoneMode: "push-to-talk",
      pushToTalkKey: null,
    };
    controls.settingsChanged();
    expect(hook.listener).toBeUndefined();
  });

  it("lets go of a held key when the Call ends", () => {
    controls.callChanged(call(true));
    hook.press("KeyV", true);

    controls.callChanged(call(false));

    expect(pushToTalk).toEqual([true, false]);
    expect(hook.listener).toBeUndefined();
  });

  it("is unavailable without the keyboard hook", () => {
    const withoutHook = createVoiceControls({
      settings: () => settings,
      muteToggled,
      pushToTalkChanged: (held) => pushToTalk.push(held),
      reportError: () => undefined,
    });

    withoutHook.callChanged(call(true));

    expect(withoutHook.pushToTalkAvailable()).toBe(false);
    expect(controls.pushToTalkAvailable()).toBe(true);
  });
});
