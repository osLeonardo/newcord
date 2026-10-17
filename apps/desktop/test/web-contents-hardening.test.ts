import { describe, expect, it, vi, type Mock } from "vitest";
import {
  browserUrlForLink,
  hardenWebContents,
  type HardenableWebContents,
  type NavigationAttempt,
  type WindowOpenRequest,
} from "../src/main/web-contents-hardening";

class FakeWebContents implements HardenableWebContents {
  navigationListener?: (attempt: NavigationAttempt) => void;
  windowOpenHandler?: (request: WindowOpenRequest) => { action: "deny" };

  on(
    _event: "will-frame-navigate",
    listener: (attempt: NavigationAttempt) => void,
  ): this {
    this.navigationListener = listener;
    return this;
  }

  setWindowOpenHandler(
    handler: (request: WindowOpenRequest) => { action: "deny" },
  ): void {
    this.windowOpenHandler = handler;
  }
}

const appPageUrl = "file:///C:/newcord/out/renderer/index.html";

function hardenedFake(): {
  contents: FakeWebContents;
  openInBrowser: Mock<(url: string) => void>;
} {
  const contents = new FakeWebContents();
  const openInBrowser = vi.fn<(url: string) => void>();
  hardenWebContents(contents, { appPageUrl, openInBrowser });
  return { contents, openInBrowser };
}

function attemptNavigation(contents: FakeWebContents, url: string): boolean {
  const preventDefault = vi.fn<() => void>();
  contents.navigationListener?.({ url, preventDefault });
  return preventDefault.mock.calls.length > 0;
}

describe("browserUrlForLink", () => {
  it.each([
    ["https://example.com/page", "https://example.com/page"],
    ["http://example.com", "http://example.com/"],
    ["HTTPS://EXAMPLE.COM/a?b=c#d", "https://example.com/a?b=c#d"],
  ])("opens the http or https link %s", (link, expected) => {
    expect(browserUrlForLink(link)).toBe(expected);
  });

  it.each([
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert('https://example.com')",
    "mailto:someone@example.com",
    "ms-settings:privacy",
    "smb://server/share",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com",
    "/relative/path",
    "https://",
    "",
  ])("opens nothing for %s", (link) => {
    expect(browserUrlForLink(link)).toBeUndefined();
  });
});

describe("hardenWebContents", () => {
  it("refuses navigation to a web page and opens it in the browser instead", () => {
    const { contents, openInBrowser } = hardenedFake();

    expect(attemptNavigation(contents, "https://example.com/")).toBe(true);
    expect(openInBrowser).toHaveBeenCalledWith("https://example.com/");
  });

  it("refuses navigation to any other scheme and opens nothing", () => {
    const { contents, openInBrowser } = hardenedFake();

    expect(attemptNavigation(contents, "file:///C:/Users/secret.txt")).toBe(
      true,
    );
    expect(openInBrowser).not.toHaveBeenCalled();
  });

  it("refuses every new window and opens a web link in the browser", () => {
    const { contents, openInBrowser } = hardenedFake();

    expect(
      contents.windowOpenHandler?.({ url: "https://example.com/" }),
    ).toEqual({ action: "deny" });
    expect(openInBrowser).toHaveBeenCalledWith("https://example.com/");
  });

  it("lets the app page reload itself", () => {
    const { contents, openInBrowser } = hardenedFake();

    expect(attemptNavigation(contents, appPageUrl)).toBe(false);
    expect(openInBrowser).not.toHaveBeenCalled();
  });

  it("refuses another page of the app's own origin", () => {
    const { contents, openInBrowser } = hardenedFake();

    expect(
      attemptNavigation(contents, "file:///C:/newcord/out/renderer/other.html"),
    ).toBe(true);
    expect(openInBrowser).not.toHaveBeenCalled();
  });

  it("refuses a new window even for the app page", () => {
    const { contents, openInBrowser } = hardenedFake();

    expect(contents.windowOpenHandler?.({ url: appPageUrl })).toEqual({
      action: "deny",
    });
    expect(openInBrowser).not.toHaveBeenCalled();
  });

  it("refuses a new window for any other scheme and opens nothing", () => {
    const { contents, openInBrowser } = hardenedFake();

    expect(
      contents.windowOpenHandler?.({ url: "javascript:alert(1)" }),
    ).toEqual({ action: "deny" });
    expect(openInBrowser).not.toHaveBeenCalled();
  });
});
