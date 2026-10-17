import { WebSocketCloseCode } from "@newcord/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPresence, type Presence } from "../src/websocket/presence.js";
import {
  closeSocketsWhenSessionEnds,
  createSessionSockets,
  type SessionSockets,
} from "../src/websocket/session-sockets.js";
import {
  createSocketRegistry,
  type SocketRegistry,
} from "../src/websocket/socket-registry.js";
import {
  ALICE_AND_BOB_SHARE_A_GROUP,
  ALICE_LAPTOP,
  ALICE_PHONE,
  BOB_PHONE,
  createFakeHubSocket,
  type FakeHubSocket,
} from "./support/fake-hub-socket.js";
import { presenceChange } from "./support/websocket-test-client.js";

let registry: SocketRegistry;
let presence: Presence;
let sessionSockets: SessionSockets;
let phone: FakeHubSocket;
let laptop: FakeHubSocket;
let bob: FakeHubSocket;

beforeEach(() => {
  registry = createSocketRegistry();
  presence = createPresence(registry, ALICE_AND_BOB_SHARE_A_GROUP);
  sessionSockets = createSessionSockets({ socketRegistry: registry, presence });
  phone = createFakeHubSocket();
  laptop = createFakeHubSocket();
  bob = createFakeHubSocket();
  presence.join(phone, ALICE_PHONE);
  presence.join(laptop, ALICE_LAPTOP);
  presence.join(bob, BOB_PHONE);
  bob.sent.length = 0;
});

const sessionEnded = {
  code: WebSocketCloseCode.SessionEnded,
  reason: "session ended",
};

describe("SessionSockets.closeDeviceSockets", () => {
  it("closes every socket of that Device with the code given, and only those", () => {
    const secondPhone = createFakeHubSocket();
    presence.join(secondPhone, ALICE_PHONE);

    sessionSockets.closeDeviceSockets(
      "alice-phone",
      WebSocketCloseCode.SessionEnded,
    );

    expect(phone.closures).toEqual([sessionEnded]);
    expect(secondPhone.closures).toEqual([sessionEnded]);
    expect(laptop.closures).toEqual([]);
    expect(bob.closures).toEqual([]);
  });

  it("removes them at once, so the Account's other Device keeps it online without an offline change", () => {
    sessionSockets.closeDeviceSockets(
      "alice-phone",
      WebSocketCloseCode.SessionEnded,
    );

    expect(registry.socketsOfDevice("alice-phone")).toEqual([]);
    expect(registry.isAccountOnline(1)).toBe(true);
    expect(bob.sent).toEqual([]);
  });

  it("tells the others the Account went offline when its last Device is closed", () => {
    sessionSockets.closeDeviceSockets(
      "alice-phone",
      WebSocketCloseCode.SessionEnded,
    );
    sessionSockets.closeDeviceSockets(
      "alice-laptop",
      WebSocketCloseCode.SessionEnded,
    );

    expect(bob.sent).toEqual([presenceChange("offline", "alice")]);
  });

  it("does nothing for a Device without sockets", () => {
    sessionSockets.closeDeviceSockets(
      "unknown",
      WebSocketCloseCode.SessionEnded,
    );

    expect(registry.allSockets()).toHaveLength(3);
  });
});

describe("SessionSockets.closeAccountSockets", () => {
  it("closes every socket of every Device of the Account, and only those", () => {
    sessionSockets.closeAccountSockets(1, WebSocketCloseCode.SessionEnded);

    expect(phone.closures).toEqual([sessionEnded]);
    expect(laptop.closures).toEqual([sessionEnded]);
    expect(bob.closures).toEqual([]);
    expect(registry.isAccountOnline(1)).toBe(false);
    expect(bob.sent).toEqual([presenceChange("offline", "alice")]);
  });
});

describe("closeSocketsWhenSessionEnds", () => {
  it("closes the Device's sockets with the session-ended code, then tells the listener", () => {
    const listener = vi.fn(() => {
      expect(phone.closures).toEqual([sessionEnded]);
    });

    closeSocketsWhenSessionEnds(sessionSockets, listener)("alice-phone");

    expect(listener).toHaveBeenCalledExactlyOnceWith("alice-phone");
    expect(laptop.closures).toEqual([]);
  });

  it("works without a listener", () => {
    closeSocketsWhenSessionEnds(sessionSockets, undefined)("alice-phone");

    expect(phone.closures).toEqual([sessionEnded]);
  });
});
