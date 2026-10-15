import { WebSocketCloseCode } from "@newcord/shared";
import { describe, expect, it, vi } from "vitest";
import {
  LIVE_SESSION_CHECK_INTERVAL_MS,
  checkLiveSessions,
} from "../src/websocket/session-check.js";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

describe("LIVE_SESSION_CHECK_INTERVAL_MS", () => {
  it("is 15 minutes (08-m1-build step 5)", () => {
    expect(LIVE_SESSION_CHECK_INTERVAL_MS).toBe(15 * 60 * 1000);
  });
});

describe("checkLiveSessions", () => {
  it("closes, with the session-ended code, the sockets of each connected Device without a usable refresh token", () => {
    const closeDeviceSockets = vi.fn();
    const hasUsableToken = vi.fn(
      (deviceId: string, now: number): boolean =>
        deviceId === "logged-in" && now === NOW,
    );

    checkLiveSessions({
      socketRegistry: {
        connectedDeviceIds: (): string[] => ["logged-in", "logged-out"],
      },
      sessionSockets: { closeDeviceSockets },
      refreshTokenStore: { hasUsableToken },
      clock: () => NOW,
    });

    expect(hasUsableToken.mock.calls).toEqual([
      ["logged-in", NOW],
      ["logged-out", NOW],
    ]);
    expect(closeDeviceSockets).toHaveBeenCalledExactlyOnceWith(
      "logged-out",
      WebSocketCloseCode.SessionEnded,
    );
  });

  it("does nothing when no Device is connected", () => {
    const closeDeviceSockets = vi.fn();
    const hasUsableToken = vi.fn((): boolean => false);

    checkLiveSessions({
      socketRegistry: { connectedDeviceIds: (): string[] => [] },
      sessionSockets: { closeDeviceSockets },
      refreshTokenStore: { hasUsableToken },
      clock: () => NOW,
    });

    expect(hasUsableToken).not.toHaveBeenCalled();
    expect(closeDeviceSockets).not.toHaveBeenCalled();
  });
});
