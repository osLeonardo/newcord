import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupIdFromText, payloadText } from "../src/main/groups/group-context";
import type { ChatEntry, GroupNotice } from "../src/preload/group-api";
import { encodeFakeMls } from "./support/fake-mls-engine";
import {
  createdGroup,
  deviceIdOf,
  hubOf,
  identityOf,
  inviteAndJoin,
  memberReady,
  mlsView,
  secondDevice,
  waitUntilInGroup,
  chatTextsOf,
  sendText,
  WAIT,
} from "./support/group-scenarios";
import {
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import {
  createLiveInstallations,
  type LiveInstallation,
  type LiveInstallations,
  REAL_MLS,
} from "./support/live-installations";

let server: InProcessServer;
let installations: LiveInstallations;

beforeEach(async () => {
  server = await startInProcessServer();
  installations = createLiveInstallations(server);
});

afterEach(async () => {
  await installations.close();
  await server.close();
});

interface ThreeInAGroup {
  groupId: string;
  alice: LiveInstallation;
  bruno: LiveInstallation;
  carla: LiveInstallation;
}

async function threeInAGroup(): Promise<ThreeInAGroup> {
  const alice = await memberReady(server, installations, "alice");
  const bruno = await memberReady(server, installations, "bruno");
  const carla = await memberReady(server, installations, "carla");
  const groupId = await createdGroup(alice);
  await inviteAndJoin(alice, bruno, groupId, "bruno");
  await inviteAndJoin(alice, carla, groupId, "carla");
  return { groupId, alice, bruno, carla };
}

async function entriesOf(
  installation: LiveInstallation,
  groupId: string,
): Promise<readonly ChatEntry[]> {
  return (await hubOf(installation)).groups.listMessages(groupId);
}

async function noticesOf(
  installation: LiveInstallation,
  groupId: string,
): Promise<GroupNotice[]> {
  return (await entriesOf(installation, groupId)).flatMap((entry) =>
    entry.kind === "notice" ? [entry.notice] : [],
  );
}

/**
 * The test-only way to send a misdeclared commit: a fake MLS commit whose real member list is
 * `members`, sent with an empty declaration (D71).
 */
async function sendForgedCommit(
  sender: LiveInstallation,
  groupId: string,
  members: string[],
): Promise<void> {
  const hub = await hubOf(sender);
  const { epoch } = await mlsView(sender, groupId);
  const commit = encodeFakeMls({
    t: "commit",
    group: Buffer.from(groupIdFromText(groupId)).toString("hex"),
    fromEpoch: epoch,
    sender: identityOf(sender),
    members,
  });
  const reply = await hub.requester.request({
    type: "mls.commit",
    groupId,
    epoch,
    added: [],
    removed: [],
    commit: payloadText(commit),
  });
  expect(reply.ok).toBe(true);
}

describe("commit checks (D41, D71)", () => {
  it("add no notice for commits that did what they declared", async () => {
    const { groupId, alice, bruno, carla } = await threeInAGroup();

    for (const installation of [alice, bruno, carla]) {
      expect(await noticesOf(installation, groupId)).toEqual([]);
    }
  });

  // Forged in the fake engine's own wire format, so only with the fake engine.
  it.skipIf(REAL_MLS)(
    "apply a commit that removed someone it did not declare, with a notice naming the sender",
    async () => {
      const { groupId, alice, bruno, carla } = await threeInAGroup();

      await sendForgedCommit(alice, groupId, [
        identityOf(alice),
        identityOf(bruno),
      ]);

      await vi.waitFor(async () => {
        expect(await noticesOf(bruno, groupId)).toEqual([
          {
            type: "commit-mismatch",
            sender: "alice",
            added: [],
            removed: [identityOf(carla)],
          },
        ]);
      }, WAIT);
      expect((await mlsView(bruno, groupId)).members).not.toContain(
        identityOf(carla),
      );
    },
  );

  // Forged in the fake engine's own wire format, so only with the fake engine.
  it.skipIf(REAL_MLS)(
    "apply a commit that took the Group past 10 people, with a notice",
    async () => {
      const { groupId, alice, bruno, carla } = await threeInAGroup();
      const strangers = Array.from(
        { length: 9 },
        (_, index) => `stranger${index}:${"S".repeat(21)}${index}`,
      );

      await sendForgedCommit(alice, groupId, [
        identityOf(alice),
        identityOf(bruno),
        identityOf(carla),
        ...strangers,
      ]);

      await vi.waitFor(async () => {
        expect(await noticesOf(bruno, groupId)).toContainEqual({
          type: "group-over-limit",
          sender: "alice",
          people: 12,
        });
      }, WAIT);
    },
  );
});

describe("new Devices (D56)", () => {
  it("are added to each shared Group, noticed there, and read only what is sent after they joined", async () => {
    const { groupId, alice, carla } = await threeInAGroup();
    await sendText(alice, groupId, "before the laptop");

    const brunoLaptop = await secondDevice(server, installations, "bruno");
    await waitUntilInGroup(brunoLaptop, groupId);
    await sendText(alice, groupId, "after the laptop");

    await vi.waitFor(async () => {
      expect(await chatTextsOf(brunoLaptop, groupId)).toEqual([
        "after the laptop",
      ]);
    }, WAIT);
    await vi.waitFor(async () => {
      expect(await noticesOf(carla, groupId)).toContainEqual({
        type: "new-device",
        username: "bruno",
      });
      expect(await noticesOf(alice, groupId)).toContainEqual({
        type: "new-device",
        username: "bruno",
      });
    }, WAIT);
  });
});

describe("resync (D24)", () => {
  it("removes and re-adds a Device that missed a commit, which then reads new messages again", async () => {
    const { groupId, alice, carla } = await threeInAGroup();
    await carla.liveSession.stop();
    // Alice's new laptop joins: a commit carla misses.
    const aliceLaptop = await secondDevice(server, installations, "alice");
    await waitUntilInGroup(aliceLaptop, groupId);
    expireCopiesFor(groupId, deviceIdOf(carla));

    await alice.liveSession.stop();
    alice.liveSession.start();
    carla.liveSession.start();
    await vi.waitFor(async () => {
      expect((await mlsView(carla, groupId)).epoch).toBe(
        (await mlsView(alice, groupId)).epoch,
      );
    }, WAIT);
    await sendText(alice, groupId, "welcome back");

    await vi.waitFor(async () => {
      expect(await chatTextsOf(carla, groupId)).toContain("welcome back");
    }, WAIT);
    expect(
      server.database
        .prepare("SELECT needs_resync FROM group_members WHERE device_id = ?")
        .pluck()
        .get(deviceIdOf(carla)),
    ).toBe(0);
    expect([...alice.hubErrors]).toEqual([]);
  });
});

/** Simulates 30 days passing for one Device: its queued copies expire and it needs a resync (D24). */
function expireCopiesFor(groupId: string, deviceId: string): void {
  const id = Buffer.from(groupId, "base64url");
  server.database
    .prepare("DELETE FROM deliveries WHERE device_id = ?")
    .run(deviceId);
  server.database
    .prepare(
      "DELETE FROM messages WHERE NOT EXISTS (SELECT 1 FROM deliveries WHERE deliveries.group_id = messages.group_id AND deliveries.seq = messages.seq)",
    )
    .run();
  server.database
    .prepare(
      "UPDATE group_members SET needs_resync = 1 WHERE group_id = ? AND device_id = ?",
    )
    .run(id, deviceId);
}
