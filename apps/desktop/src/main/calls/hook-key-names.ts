/** Keys whose `KeyboardEvent.code` and `uiohook-napi` name are the same. */
const SAME_NAMES = [
  "Backspace",
  "Tab",
  "Enter",
  "CapsLock",
  "Escape",
  "Space",
  "PageUp",
  "PageDown",
  "End",
  "Home",
  "ArrowLeft",
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
  "Insert",
  "Delete",
  "NumpadMultiply",
  "NumpadAdd",
  "NumpadSubtract",
  "NumpadDecimal",
  "NumpadDivide",
  "NumpadEnter",
  "Semicolon",
  "Equal",
  "Comma",
  "Minus",
  "Period",
  "Slash",
  "Backquote",
  "BracketLeft",
  "Backslash",
  "BracketRight",
  "Quote",
  "NumLock",
  "ScrollLock",
  "PrintScreen",
];

/** Modifier keys, which `uiohook-napi` names without "Left". */
const MODIFIERS: readonly (readonly [string, string])[] = [
  ["ControlLeft", "Ctrl"],
  ["ControlRight", "CtrlRight"],
  ["AltLeft", "Alt"],
  ["AltRight", "AltRight"],
  ["ShiftLeft", "Shift"],
  ["ShiftRight", "ShiftRight"],
  ["MetaLeft", "Meta"],
  ["MetaRight", "MetaRight"],
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIGITS = "0123456789".split("");
const FUNCTION_KEYS = Array.from({ length: 24 }, (_, index) => `F${index + 1}`);

/**
 * Every key push-to-talk can use: its `KeyboardEvent.code`, as the settings store it, and its name
 * in `uiohook-napi`'s `UiohookKey`. Both name the key's place on the keyboard, not its letter, so
 * the layout never matters (D44b, D74).
 */
export const HOOK_KEY_NAMES: ReadonlyMap<string, string> = new Map([
  ...LETTERS.map((letter) => [`Key${letter}`, letter] as const),
  ...DIGITS.map((digit) => [`Digit${digit}`, digit] as const),
  ...DIGITS.map((digit) => [`Numpad${digit}`, `Numpad${digit}`] as const),
  ...FUNCTION_KEYS.map((key) => [key, key] as const),
  ...SAME_NAMES.map((name) => [name, name] as const),
  ...MODIFIERS,
]);
