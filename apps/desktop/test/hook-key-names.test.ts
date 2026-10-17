import { UiohookKey } from "uiohook-napi";
import { describe, expect, it } from "vitest";
import { HOOK_KEY_NAMES } from "../src/main/calls/hook-key-names";

const hookNames = new Set(Object.keys(UiohookKey));

describe("HOOK_KEY_NAMES (D74)", () => {
  it.each([
    ["KeyV", "V"],
    ["Digit5", "5"],
    ["Numpad5", "Numpad5"],
    ["F13", "F13"],
    ["CapsLock", "CapsLock"],
    ["Backquote", "Backquote"],
    ["ControlLeft", "Ctrl"],
    ["AltRight", "AltRight"],
    ["ShiftLeft", "Shift"],
  ])("maps the stored %s to the hook's %s", (code, name) => {
    expect(HOOK_KEY_NAMES.get(code)).toBe(name);
  });

  it("names only keys the hook knows", () => {
    for (const name of HOOK_KEY_NAMES.values()) {
      expect(hookNames).toContain(name);
    }
  });

  it("gives each hook key one stored code", () => {
    const names = [...HOOK_KEY_NAMES.values()];

    expect(new Set(names).size).toBe(names.length);
  });

  it("leaves out what the hook cannot hear", () => {
    expect(HOOK_KEY_NAMES.get("MediaPlayPause")).toBeUndefined();
  });
});
