import { describe, expect, it } from "vitest";
import {
  chatTextProblem,
  isSendKey,
  messageTimeLabel,
} from "../src/renderer/src/groups/chat-text";

describe("chatTextProblem", () => {
  it.each(["hi", "x".repeat(4000), "😀".repeat(4000), "<b>not html</b>"])(
    "accepts a message of %#",
    (text) => {
      expect(chatTextProblem(text)).toBeUndefined();
    },
  );

  it.each(["", "   ", "\n\t", "x".repeat(4001)])("refuses %j", (text) => {
    expect(chatTextProblem(text)).toBe("Messages have 1 to 4,000 characters.");
  });
});

describe("isSendKey", () => {
  it.each([
    [{ key: "Enter", shiftKey: false, isComposing: false }, true],
    [{ key: "Enter", shiftKey: true, isComposing: false }, false],
    [{ key: "Enter", shiftKey: false, isComposing: true }, false],
    [{ key: "a", shiftKey: false, isComposing: false }, false],
  ])("decides %j sends: %s", (press, sends) => {
    expect(isSendKey(press)).toBe(sends);
  });
});

describe("messageTimeLabel", () => {
  const now = new Date(2026, 9, 16, 15, 30).getTime();

  it("shows only the time for a message sent today", () => {
    expect(
      messageTimeLabel(new Date(2026, 9, 16, 14, 5).getTime(), now, "en-GB"),
    ).toBe("14:05");
  });

  it("adds the date for an earlier day", () => {
    expect(
      messageTimeLabel(new Date(2026, 9, 14, 9, 0).getTime(), now, "en-GB"),
    ).toBe("14 Oct 2026 09:00");
  });
});
