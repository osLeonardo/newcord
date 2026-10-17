import { beforeEach, describe, expect, it } from "vitest";
import {
  createSocketRegistry,
  type SocketRegistry,
} from "../src/websocket/socket-registry.js";
import {
  ALICE_LAPTOP,
  ALICE_PHONE,
  BOB_PHONE,
  createFakeHubSocket,
} from "./support/fake-hub-socket.js";

let registry: SocketRegistry;

beforeEach(() => {
  registry = createSocketRegistry();
});

describe("SocketRegistry.add and remove", () => {
  it("returns the owner of a removed socket, then forgets it", () => {
    const socket = createFakeHubSocket();
    registry.add(socket, ALICE_PHONE);

    expect(registry.remove(socket)).toEqual(ALICE_PHONE);
    expect(registry.remove(socket)).toBeUndefined();
    expect(registry.allSockets()).toEqual([]);
  });

  it("returns undefined for a socket it never had", () => {
    expect(registry.remove(createFakeHubSocket())).toBeUndefined();
  });
});

describe("SocketRegistry lookups", () => {
  const phoneA = createFakeHubSocket();
  const phoneB = createFakeHubSocket();
  const laptop = createFakeHubSocket();
  const bob = createFakeHubSocket();

  beforeEach(() => {
    registry.add(phoneA, ALICE_PHONE);
    registry.add(phoneB, ALICE_PHONE);
    registry.add(laptop, ALICE_LAPTOP);
    registry.add(bob, BOB_PHONE);
  });

  it("finds every socket of one Device", () => {
    expect(registry.socketsOfDevice("alice-phone")).toEqual([phoneA, phoneB]);
    expect(registry.socketsOfDevice("unknown")).toEqual([]);
  });

  it("finds every socket of one Account, across its Devices", () => {
    expect(registry.socketsOfAccount(1)).toEqual([phoneA, phoneB, laptop]);
  });

  it("lists every socket", () => {
    expect(registry.allSockets()).toEqual([phoneA, phoneB, laptop, bob]);
  });

  it("lists each connected Device once", () => {
    expect(registry.connectedDeviceIds()).toEqual([
      "alice-phone",
      "alice-laptop",
      "bob-phone",
    ]);
  });

  it("lists the online usernames among the Accounts asked about, once each, sorted", () => {
    const zoe = createFakeHubSocket();
    registry.add(zoe, { userId: 3, deviceId: "zoe-phone", username: "zoe" });
    registry.add(createFakeHubSocket(), {
      userId: 4,
      deviceId: "ana-phone",
      username: "ana",
    });

    expect(registry.onlineUsernamesAmong([1, 2, 3, 4, 99])).toEqual([
      "alice",
      "ana",
      "bob",
      "zoe",
    ]);
    expect(registry.onlineUsernamesAmong([3, 1])).toEqual(["alice", "zoe"]);
    expect(registry.onlineUsernamesAmong([])).toEqual([]);
  });

  it("lists every socket of one Account with its owner", () => {
    expect(registry.connectionsOfAccount(2)).toEqual([[bob, BOB_PHONE]]);
  });

  it("keeps an Account online while any socket of any of its Devices is registered", () => {
    registry.remove(phoneA);
    registry.remove(phoneB);
    expect(registry.isAccountOnline(1)).toBe(true);

    registry.remove(laptop);
    expect(registry.isAccountOnline(1)).toBe(false);
    expect(registry.isAccountOnline(2)).toBe(true);
  });
});
