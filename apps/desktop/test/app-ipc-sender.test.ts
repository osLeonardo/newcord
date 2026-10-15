import { describe, expect, it } from "vitest";
import { isAppIpcSender } from "../src/main/ipc/app-ipc-sender";
import type { IpcInvocation } from "../src/main/ipc/checked-ipc-handler";

const appWebContentsId = 1;
const devPageUrl = "http://localhost:5173/";
const releasePageUrl =
  "file:///C:/Program%20Files/newcord/out/renderer/index.html";

function appWindow(pageUrl: string): {
  pageUrl: string;
  isAppWebContents: (webContentsId: number) => boolean;
} {
  return {
    pageUrl,
    isAppWebContents: (webContentsId) => webContentsId === appWebContentsId,
  };
}

function invocation(
  frameUrl: string,
  options: { webContentsId?: number; isSubFrame?: boolean } = {},
): IpcInvocation {
  return {
    sender: { id: options.webContentsId ?? appWebContentsId },
    senderFrame: {
      url: frameUrl,
      parent: options.isSubFrame === true ? {} : null,
    },
  };
}

describe("isAppIpcSender", () => {
  it.each([
    [devPageUrl, devPageUrl],
    [devPageUrl, "http://localhost:5173/#/login"],
    [releasePageUrl, releasePageUrl],
    [releasePageUrl, `${releasePageUrl}?screen=login`],
  ])(
    "accepts the main frame of the app window on its page %s",
    (pageUrl, frameUrl) => {
      expect(isAppIpcSender(invocation(frameUrl), appWindow(pageUrl))).toBe(
        true,
      );
    },
  );

  it.each([
    [devPageUrl, "https://evil.example/"],
    [devPageUrl, "http://localhost:5174/"],
    [devPageUrl, "http://localhost:5173/other.html"],
    [releasePageUrl, "file:///C:/Users/someone/Downloads/index.html"],
    [releasePageUrl, "about:blank"],
    [releasePageUrl, "not a url"],
  ])(
    "refuses a frame showing another page than %s: %s",
    (pageUrl, frameUrl) => {
      expect(isAppIpcSender(invocation(frameUrl), appWindow(pageUrl))).toBe(
        false,
      );
    },
  );

  it("refuses a sub-frame, even on the app page", () => {
    expect(
      isAppIpcSender(
        invocation(releasePageUrl, { isSubFrame: true }),
        appWindow(releasePageUrl),
      ),
    ).toBe(false);
  });

  it("refuses web contents that are not the app's own window", () => {
    expect(
      isAppIpcSender(
        invocation(releasePageUrl, { webContentsId: 2 }),
        appWindow(releasePageUrl),
      ),
    ).toBe(false);
  });

  it("refuses a call whose frame is gone", () => {
    const orphanInvocation: IpcInvocation = {
      sender: { id: appWebContentsId },
      senderFrame: null,
    };

    expect(isAppIpcSender(orphanInvocation, appWindow(releasePageUrl))).toBe(
      false,
    );
  });
});
