import { PROTOCOL_VERSION } from "@newcord/shared";
import { describe, expect, it } from "vitest";
import {
  applyPresence,
  type PresenceEnvelope,
} from "../src/main/session/online-accounts";

function snapshot(...usernames: string[]): PresenceEnvelope {
  return { v: PROTOCOL_VERSION, type: "presence", kind: "snapshot", usernames };
}

function change(
  kind: "online" | "offline",
  username: string,
): PresenceEnvelope {
  return { v: PROTOCOL_VERSION, type: "presence", kind, username };
}

describe("applyPresence", () => {
  it("replaces the list with a snapshot, leaving out the person's own Account", () => {
    expect(
      applyPresence(["zoe"], snapshot("alice", "carla", "bruno"), "alice"),
    ).toEqual(["bruno", "carla"]);
  });

  it("adds an Account that comes online, keeping the list sorted", () => {
    expect(
      applyPresence(["bruno", "dora"], change("online", "carla"), "alice"),
    ).toEqual(["bruno", "carla", "dora"]);
  });

  it("does not list an Account twice", () => {
    expect(
      applyPresence(["bruno"], change("online", "bruno"), "alice"),
    ).toEqual(["bruno"]);
  });

  it("removes an Account that goes offline", () => {
    expect(
      applyPresence(["bruno", "carla"], change("offline", "bruno"), "alice"),
    ).toEqual(["carla"]);
  });

  it("never lists the person's own Account, even when another of its Devices comes online", () => {
    expect(applyPresence([], change("online", "alice"), "alice")).toEqual([]);
  });
});
