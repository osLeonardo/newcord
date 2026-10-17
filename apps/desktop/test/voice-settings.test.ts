import { describe, expect, it } from "vitest";
import {
  acceleratorOf,
  keyLabel,
  microphoneOpen,
} from "../src/renderer/src/calls/voice-settings";

const press = {
  code: "KeyM",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};

describe("acceleratorOf", () => {
  it.each([
    [{ ...press, ctrlKey: true, shiftKey: true }, "Ctrl+Shift+M"],
    [{ ...press, altKey: true }, "Alt+M"],
    [{ ...press, code: "Digit7", ctrlKey: true, altKey: true }, "Ctrl+Alt+7"],
    [{ ...press, code: "F9", ctrlKey: true }, "Ctrl+F9"],
  ])("turns %j into %s", (keys, accelerator) => {
    expect(acceleratorOf(keys)).toBe(accelerator);
  });

  it.each([
    ["a key without Ctrl or Alt", { ...press, shiftKey: true }],
    ["a modifier alone", { ...press, code: "ControlLeft", ctrlKey: true }],
    [
      "a key outside letters, digits and F-keys",
      { ...press, code: "Space", ctrlKey: true },
    ],
  ])("refuses %s", (_case, keys) => {
    expect(acceleratorOf(keys)).toBeUndefined();
  });
});

describe("keyLabel", () => {
  it.each([
    ["KeyV", "V"],
    ["Digit5", "5"],
    ["CapsLock", "Caps Lock"],
    ["F13", "F13"],
  ])("shows %s as %s", (code, label) => {
    expect(keyLabel(code)).toBe(label);
  });
});

describe("microphoneOpen (D44)", () => {
  const inputs = {
    mode: "voice-activity",
    voiceDetected: false,
    pushToTalkHeld: false,
    muted: false,
  } as const;

  it("follows the voice in voice-activity mode", () => {
    expect(microphoneOpen({ ...inputs, voiceDetected: true })).toBe(true);
    expect(microphoneOpen({ ...inputs, pushToTalkHeld: true })).toBe(false);
  });

  it("follows the key in push-to-talk mode", () => {
    const pushToTalk = { ...inputs, mode: "push-to-talk" } as const;

    expect(microphoneOpen({ ...pushToTalk, pushToTalkHeld: true })).toBe(true);
    expect(microphoneOpen({ ...pushToTalk, voiceDetected: true })).toBe(false);
  });

  it("stays off while muted", () => {
    expect(
      microphoneOpen({ ...inputs, voiceDetected: true, muted: true }),
    ).toBe(false);
    expect(
      microphoneOpen({
        ...inputs,
        mode: "push-to-talk",
        pushToTalkHeld: true,
        muted: true,
      }),
    ).toBe(false);
  });
});
