import { describe, expect, it, vi } from "vitest";
import {
  refuseEveryPermission,
  type PermissionControlledSession,
  type PermissionRequestHandler,
} from "../src/main/permissions";

class FakeSession implements PermissionControlledSession {
  requestHandler?: PermissionRequestHandler;
  checkHandler?: () => boolean;
  deviceHandler?: () => boolean;

  setPermissionRequestHandler(handler: PermissionRequestHandler): void {
    this.requestHandler = handler;
  }

  setPermissionCheckHandler(handler: () => boolean): void {
    this.checkHandler = handler;
  }

  setDevicePermissionHandler(handler: () => boolean): void {
    this.deviceHandler = handler;
  }
}

function sessionRefusingEverything(): FakeSession {
  const session = new FakeSession();
  refuseEveryPermission(session);
  return session;
}

describe("refuseEveryPermission", () => {
  it.each([
    "media",
    "display-capture",
    "geolocation",
    "notifications",
    "clipboard-read",
    "openExternal",
  ])("refuses a request for %s", (permission) => {
    const session = sessionRefusingEverything();
    const decide = vi.fn<(granted: boolean) => void>();

    session.requestHandler?.({}, permission, decide);

    expect(decide).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("answers no to every permission check", () => {
    expect(sessionRefusingEverything().checkHandler?.()).toBe(false);
  });

  it("answers no to every device permission check", () => {
    expect(sessionRefusingEverything().deviceHandler?.()).toBe(false);
  });
});
