import { describe, expect, it } from "vitest";
import { MlsDevice, type IncomingMls } from "../pkg/newcord_mls.js";
import {
  deviceNamed,
  groupOf,
  keyPackageOf,
  readText,
  text,
} from "./support/devices.js";

function removedBy(incoming: IncomingMls): readonly string[] {
  if (incoming.kind !== "commit") throw new Error(`got a ${incoming.kind}`);
  return incoming.removed;
}

function identityOf(device: MlsDevice): string {
  const identity = device.identity();
  if (identity === undefined) throw new Error("no identity");
  return identity;
}

describe("removing, leaving and resync (#4, Step 04)", () => {
  it("leaves a removed Device unable to read what follows, while the others continue", () => {
    const [alice, bruno, carla] = ["alice", "bruno", "carla"].map(deviceNamed);
    if (alice === undefined || bruno === undefined || carla === undefined) {
      throw new Error("missing Device");
    }
    const groupId = groupOf(alice, [bruno, carla]);

    const own = alice.removeMembers(groupId, [identityOf(carla)]);
    alice.mergePendingCommit(groupId);
    const applied = bruno.processIncoming(own.commit);
    carla.processIncoming(own.commit);
    const after = alice.encrypt(groupId, text("without carla"));

    expect(removedBy(applied)).toEqual([identityOf(carla)]);
    expect(readText(bruno, after).text).toBe("without carla");
    expect(() => carla.processIncoming(after)).toThrow();
  });

  it("lets the next Member complete a leave request (D57)", () => {
    const [alice, bruno, carla] = ["alice", "bruno", "carla"].map(deviceNamed);
    if (alice === undefined || bruno === undefined || carla === undefined) {
      throw new Error("missing Device");
    }
    const groupId = groupOf(alice, [bruno, carla]);

    const request = bruno.leaveGroup(groupId);
    const heard = alice.processIncoming(request);
    carla.processIncoming(request);
    const own = alice.commitPendingProposals(groupId);
    alice.mergePendingCommit(groupId);
    const applied = carla.processIncoming(own.commit);
    const after = alice.encrypt(groupId, text("bruno left"));

    expect(heard).toEqual({
      kind: "proposal",
      groupId,
      sender: identityOf(bruno),
      removes: [identityOf(bruno)],
    });
    expect(removedBy(applied)).toEqual([identityOf(bruno)]);
    expect(() => bruno.processIncoming(after)).toThrow();
  });

  it("re-adds a Device in one commit for a resync, after which its old state reads nothing new (D24)", () => {
    const [alice, bruno, carla] = ["alice", "bruno", "carla"].map(deviceNamed);
    if (alice === undefined || bruno === undefined || carla === undefined) {
      throw new Error("missing Device");
    }
    const groupId = groupOf(alice, [bruno, carla]);
    const staleCopy = carla.saveState();

    const own = alice.updateMembers(
      groupId,
      [keyPackageOf(carla)],
      [identityOf(carla)],
    );
    alice.mergePendingCommit(groupId);
    const applied = bruno.processIncoming(own.commit);
    carla.joinFromWelcome(own.welcome ?? new Uint8Array());
    const after = alice.encrypt(groupId, text("welcome back"));

    expect(applied).toMatchObject({
      kind: "commit",
      added: [identityOf(carla)],
      removed: [identityOf(carla)],
    });
    expect(readText(carla, after).text).toBe("welcome back");
    const stale = new MlsDevice();
    stale.loadState(staleCopy);
    expect(() => stale.processIncoming(after)).toThrow();
  });

  it("refuses identities that are not an array of strings", () => {
    const alice = deviceNamed("alice");
    const groupId = groupOf(alice, [deviceNamed("bruno")]);

    expect(() =>
      alice.removeMembers(groupId, [42] as unknown as readonly string[]),
    ).toThrow(/array of strings/);
    expect(() => alice.removeMembers(groupId, ["carla:nobody"])).toThrow(
      /not in that Group/,
    );
  });
});
