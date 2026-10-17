import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from "uiohook-napi";
import { HOOK_KEY_NAMES } from "./hook-key-names";
import type { KeyboardHook } from "./voice-controls";

/**
 * The keyboard hook over `uiohook-napi`, which hears keys while a game or another app is in front
 * (D44b, D74). It runs only while push-to-talk needs it.
 * @example createVoiceControls({ keyboardHook: createUiohookKeyboardHook(), … })
 */
export function createUiohookKeyboardHook(): KeyboardHook {
  const keycodes = new Map<string, number>(Object.entries(UiohookKey));
  const codeOfKeycode = new Map<number, string>();
  for (const [code, name] of HOOK_KEY_NAMES) {
    const keycode = keycodes.get(name);
    if (keycode !== undefined) codeOfKeycode.set(keycode, code);
  }
  return {
    start: (keyChanged): (() => void) => {
      const heard =
        (down: boolean) =>
        (event: UiohookKeyboardEvent): void => {
          const code = codeOfKeycode.get(event.keycode);
          if (code !== undefined) keyChanged(code, down);
        };
      const pressed = heard(true);
      const released = heard(false);
      uIOhook.on("keydown", pressed);
      uIOhook.on("keyup", released);
      uIOhook.start();
      return (): void => {
        uIOhook.off("keydown", pressed);
        uIOhook.off("keyup", released);
        uIOhook.stop();
      };
    },
  };
}
