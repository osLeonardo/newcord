import { describe, expect, it } from "vitest";
import { isInView, noticeContent } from "../src/main/app-shell/message-notices";

const message = {
  groupId: "MgZoqEdt4EEfhsMd_7xNqw",
  groupName: "friends",
  sender: "bruno",
  text: "see you\nat nine",
};

describe("noticeContent (D15)", () => {
  it("shows the message on one line with full previews", () => {
    expect(noticeContent("full", false, message)).toEqual({
      title: "friends",
      body: "bruno: see you at nine",
    });
  });

  it("shows only the sender with sender-only previews", () => {
    expect(noticeContent("sender", false, message)).toEqual({
      title: "friends",
      body: "New message from bruno",
    });
  });

  it("shows neither Group nor sender with generic previews", () => {
    expect(noticeContent("generic", false, message)).toEqual({
      title: "newcord",
      body: "New message",
    });
  });

  it.each(["full", "sender", "generic"] as const)(
    "is generic while a screen share runs, even with %s previews",
    (mode) => {
      expect(noticeContent(mode, true, message)).toEqual({
        title: "newcord",
        body: "New message",
      });
    },
  );

  it("shortens a long message", () => {
    const long = { ...message, text: `${"word ".repeat(100)}\n\nend` };

    const { body } = noticeContent("full", false, long);

    expect(body.length).toBeLessThanOrEqual("bruno: ".length + 200);
    expect(body.endsWith("…")).toBe(true);
    expect(body).not.toContain("\n");
  });
});

describe("isInView", () => {
  const groupId = message.groupId;
  const view = { viewedGroup: groupId, windowFocused: true, sharing: false };

  it("is true only for the open Group while the window has the focus", () => {
    expect(isInView(view, groupId)).toBe(true);
    expect(isInView({ ...view, windowFocused: false }, groupId)).toBe(false);
    expect(isInView({ ...view, viewedGroup: "other" }, groupId)).toBe(false);
    expect(isInView({ windowFocused: true, sharing: false }, groupId)).toBe(
      false,
    );
  });
});
