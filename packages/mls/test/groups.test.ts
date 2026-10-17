import { describe, expect, it } from "vitest";
import { MlsDevice } from "../pkg/newcord_mls.js";
import {
  deviceNamed,
  groupOf,
  isEncrypted,
  keyPackageOf,
  readText,
  text,
} from "./support/devices.js";

describe("Groups and messages (#4, Step 03)", () => {
  it("lets two Devices talk once the second joined from the welcome alone", () => {
    const alice = deviceNamed("alice");
    const bruno = deviceNamed("bruno");
    const groupId = groupOf(alice, [bruno]);

    const hello = alice.encrypt(groupId, text("hello bruno"));
    const reply = bruno.encrypt(groupId, text("hi alice"));

    expect(readText(bruno, hello)).toEqual({
      sender: alice.identity(),
      text: "hello bruno",
    });
    expect(readText(alice, reply)).toEqual({
      sender: bruno.identity(),
      text: "hi alice",
    });
  });

  it("lets a Device added later read what comes after, and nothing from before", () => {
    const alice = deviceNamed("alice");
    const bruno = deviceNamed("bruno");
    const carla = deviceNamed("carla");
    const groupId = groupOf(alice, [bruno]);
    const before = alice.encrypt(groupId, text("before carla"));

    const own = alice.addMembers(groupId, [keyPackageOf(carla)]);
    alice.mergePendingCommit(groupId);
    const applied = bruno.processIncoming(own.commit);
    carla.joinFromWelcome(own.welcome ?? new Uint8Array());
    const after = alice.encrypt(groupId, text("after carla"));

    expect(applied).toEqual({
      kind: "commit",
      groupId,
      sender: alice.identity(),
      added: [carla.identity()],
      removed: [],
      epoch: 2,
    });
    expect(readText(carla, after).text).toBe("after carla");
    expect(() => carla.processIncoming(before)).toThrow();
  });

  it("sends commits and messages encrypted", () => {
    const alice = deviceNamed("alice");
    const bruno = deviceNamed("bruno");
    const groupId = groupOf(alice, [bruno]);

    const own = alice.addMembers(groupId, [keyPackageOf(deviceNamed("carla"))]);

    expect(isEncrypted(own.commit)).toBe(true);
    expect(isEncrypted(bruno.encrypt(groupId, text("secret")))).toBe(true);
  });

  it("moves the creator to the next epoch once its accepted commit is merged", () => {
    const alice = deviceNamed("alice");
    const groupId = new Uint8Array(16).fill(9);
    alice.createGroup(groupId);

    alice.addMembers(groupId, [keyPackageOf(deviceNamed("bruno"))]);
    expect(alice.groupEpoch(groupId)).toBe(0);
    alice.mergePendingCommit(groupId);

    expect(alice.groupEpoch(groupId)).toBe(1);
  });

  it("keeps both Devices in step when the loser of a race drops its commit", () => {
    const alice = deviceNamed("alice");
    const bruno = deviceNamed("bruno");
    const carla = deviceNamed("carla");
    const groupId = groupOf(alice, [bruno]);

    const winner = alice.addMembers(groupId, [keyPackageOf(carla)]);
    bruno.addMembers(groupId, [keyPackageOf(deviceNamed("diego"))]);
    alice.mergePendingCommit(groupId);
    bruno.clearPendingCommit(groupId);
    bruno.processIncoming(winner.commit);

    expect(bruno.groupEpoch(groupId)).toBe(alice.groupEpoch(groupId));
    expect(
      readText(alice, bruno.encrypt(groupId, text("still in step"))).text,
    ).toBe("still in step");
  });

  it("keeps decrypting new messages after a state saved mid-conversation is restored", () => {
    const alice = deviceNamed("alice");
    const bruno = deviceNamed("bruno");
    const groupId = groupOf(alice, [bruno]);
    readText(bruno, alice.encrypt(groupId, text("first")));

    const restored = new MlsDevice();
    restored.loadState(bruno.saveState());

    expect(
      readText(restored, alice.encrypt(groupId, text("second"))).text,
    ).toBe("second");
  });

  it("lists the Members with their signature keys (D90)", () => {
    const alice = deviceNamed("alice");
    const bruno = deviceNamed("bruno");
    const groupId = groupOf(alice, [bruno]);

    expect(bruno.groupMembers(groupId).toSorted()).toEqual(
      [alice.identity(), bruno.identity()].toSorted(),
    );
    expect(
      alice
        .groupMemberKeys(groupId)
        .find((member) => member.identity === alice.identity())?.signatureKey,
    ).toEqual(alice.signaturePublicKey());
  });

  it("refuses something other than an array of Key packages", () => {
    const alice = deviceNamed("alice");
    const groupId = new Uint8Array(16).fill(3);
    alice.createGroup(groupId);

    expect(() =>
      alice.addMembers(groupId, [
        "not bytes",
      ] as unknown as readonly Uint8Array[]),
    ).toThrow(/array of Uint8Array/);
  });
});
