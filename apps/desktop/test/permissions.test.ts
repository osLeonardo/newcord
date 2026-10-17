import { describe, expect, it, vi } from "vitest";
import {
  grantCallPermissionsOnly,
  type PermissionCheckHandler,
  type PermissionControlledSession,
  type PermissionRequestDetails,
  type PermissionRequestHandler,
} from "../src/main/permissions";

const APP_WEB_CONTENTS = { id: 1 };
const OTHER_WEB_CONTENTS = { id: 2 };

class FakeSession implements PermissionControlledSession {
  requestHandler?: PermissionRequestHandler;
  checkHandler?: PermissionCheckHandler;
  deviceHandler?: () => boolean;

  setPermissionRequestHandler(handler: PermissionRequestHandler): void {
    this.requestHandler = handler;
  }

  setPermissionCheckHandler(handler: PermissionCheckHandler): void {
    this.checkHandler = handler;
  }

  setDevicePermissionHandler(handler: () => boolean): void {
    this.deviceHandler = handler;
  }
}

function appSession(): FakeSession {
  const session = new FakeSession();
  grantCallPermissionsOnly(session, (id) => id === APP_WEB_CONTENTS.id);
  return session;
}

const PAGE = "file:///app/out/renderer/index.html";

function decisionFor(
  permission: string,
  media: Omit<PermissionRequestDetails, "requestingUrl"> = {},
  webContents = APP_WEB_CONTENTS,
): boolean | undefined {
  const details: PermissionRequestDetails = { requestingUrl: PAGE, ...media };
  const decide = vi.fn<(granted: boolean) => void>();
  appSession().requestHandler?.(webContents, permission, decide, details);
  expect(decide).toHaveBeenCalledOnce();
  return decide.mock.calls[0]?.[0];
}

describe("grantCallPermissionsOnly (security checklist, M3)", () => {
  it("grants the app's window the microphone and screen capture", () => {
    expect(decisionFor("media", { mediaTypes: ["audio"] })).toBe(true);
    expect(decisionFor("display-capture")).toBe(true);
  });

  it.each([
    ["the camera", { mediaTypes: ["video"] }],
    ["the microphone with the camera", { mediaTypes: ["audio", "video"] }],
    ["media with no type", {}],
  ])("refuses %s", (_case, details) => {
    expect(decisionFor("media", details)).toBe(false);
  });

  it.each([
    "geolocation",
    "notifications",
    "clipboard-read",
    "openExternal",
    "midi",
  ])("refuses a request for %s", (permission) => {
    expect(decisionFor(permission)).toBe(false);
  });

  it("refuses everything to web contents that are not the app's window", () => {
    expect(
      decisionFor("media", { mediaTypes: ["audio"] }, OTHER_WEB_CONTENTS),
    ).toBe(false);
    expect(decisionFor("display-capture", {}, OTHER_WEB_CONTENTS)).toBe(false);
  });

  it("answers yes only to the app window's media checks", () => {
    const session = appSession();

    expect(session.checkHandler?.(APP_WEB_CONTENTS, "media")).toBe(true);
    expect(session.checkHandler?.(APP_WEB_CONTENTS, "geolocation")).toBe(false);
    expect(session.checkHandler?.(OTHER_WEB_CONTENTS, "media")).toBe(false);
    expect(session.checkHandler?.(null, "media")).toBe(false);
  });

  it("answers no to every device permission check", () => {
    expect(appSession().deviceHandler?.()).toBe(false);
  });
});
