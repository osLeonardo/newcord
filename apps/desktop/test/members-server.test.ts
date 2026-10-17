import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupIdFromText } from "../src/main/groups/group-context";
import { desktopApiEventChannels } from "../src/preload/desktop-api";
import {
  createdGroup,
  deviceIdOf,
  groupNames,
  hubOf,
  inviteAndJoin,
  memberReady,
  secondDevice,
  serverGroup,
  waitUntilInGroup,
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

async function send(
  installation: LiveInstallation,
  groupId: string,
  text: string,
): Promise<void> {
  const result = await (
    await hubOf(installation)
  ).groups.sendMessage(groupId, text);
  expect(result.outcome).toBe("sent");
}

async function textsOf(
  installation: LiveInstallation,
  groupId: string,
): Promise<string[]> {
  const messages = await (
    await hubOf(installation)
  ).groups.listMessages(groupId);
  return messages.flatMap((entry) =>
    entry.kind === "text" ? [entry.text] : [],
  );
}

async function waitUntilOutOfGroup(
  installation: LiveInstallation,
  groupId: string,
): Promise<void> {
  const hub = await hubOf(installation);
  await vi.waitFor(async () => {
    const groups = await hub.groups.listGroups();
    expect(groups.map((group) => group.groupId)).not.toContain(groupId);
  }, WAIT);
}

/** The newest queued copy of a Group message on the server, as some Member would receive it. */
function newestServerPayload(groupId: string): Uint8Array {
  const payload = server.database
    .prepare(
      "SELECT payload FROM messages WHERE group_id = ? ORDER BY seq DESC LIMIT 1",
    )
    .pluck()
    .get(Buffer.from(groupId, "base64url")) as Buffer | undefined;
  if (payload === undefined) throw new Error("nothing queued");
  return new Uint8Array(payload);
}

describe("the member list (#6, Step 04)", () => {
  it("shows each person once with their number of Devices", async () => {
    const alice = await memberReady(server, installations, "alice");
    await secondDevice(server, installations, "alice");
    const bruno = await memberReady(server, installations, "bruno");
    const groupId = await createdGroup(alice);
    await inviteAndJoin(alice, bruno, groupId, "bruno");

    await vi.waitFor(async () => {
      expect(await (await hubOf(bruno)).groups.listMembers(groupId)).toEqual([
        { username: "alice", deviceCount: 2, self: false },
        { username: "bruno", deviceCount: 1, self: true },
      ]);
    }, WAIT);
  });
});

describe("removing someone (#6, Step 04)", () => {
  it("removes all their Devices in one commit, and their app shows the Group as left", async () => {
    const { groupId, alice, bruno } = await threeInAGroup();
    const brunoLaptop = await secondDevice(server, installations, "bruno");
    await waitUntilInGroup(brunoLaptop, groupId);
    const epochBefore = serverGroup(server, groupId).epoch;

    const result = await (
      await hubOf(alice)
    ).groups.removeMember(groupId, "bruno");

    expect(result).toEqual({ outcome: "done" });
    expect(serverGroup(server, groupId).epoch).toBe(epochBefore + 1);
    expect(serverGroup(server, groupId).members).not.toContain(
      deviceIdOf(bruno),
    );
    expect(serverGroup(server, groupId).members).not.toContain(
      deviceIdOf(brunoLaptop),
    );
    await waitUntilOutOfGroup(bruno, groupId);
    await waitUntilOutOfGroup(brunoLaptop, groupId);
    expect(bruno.notifications).toContainEqual({
      channel: desktopApiEventChannels.onGroupLeft,
      payload: { groupId, name: "friends", reason: "removed" },
    });
  });

  it("leaves the removed person unable to read anything sent afterwards", async () => {
    const { groupId, alice, bruno, carla } = await threeInAGroup();
    await (await hubOf(alice)).groups.removeMember(groupId, "bruno");
    await waitUntilOutOfGroup(bruno, groupId);

    await send(alice, groupId, "after bruno left");

    await vi.waitFor(async () => {
      expect(await textsOf(carla, groupId)).toContain("after bruno left");
    }, WAIT);
    const brunoHub = await hubOf(bruno);
    expect(() =>
      brunoHub.mls.read((engine) =>
        engine.processIncoming(newestServerPayload(groupId)),
      ),
    ).toThrow();
    expect(await brunoHub.groups.listGroups()).toEqual([]);
  });

  it("refuses removing oneself or someone outside the Group", async () => {
    const { groupId, alice } = await threeInAGroup();
    const groups = (await hubOf(alice)).groups;

    await expect(groups.removeMember(groupId, "alice")).resolves.toEqual({
      outcome: "refused",
      refusal: "CANNOT_REMOVE_SELF",
    });
    await expect(groups.removeMember(groupId, "nobody")).resolves.toEqual({
      outcome: "refused",
      refusal: "PERSON_NOT_IN_GROUP",
    });
  });
});

describe("leaving (#6, Step 04)", () => {
  it("forgets the Group and its history here, and the next Member online commits the removal", async () => {
    const { groupId, alice, carla } = await threeInAGroup();
    await send(alice, groupId, "before");
    await vi.waitFor(async () => {
      expect(await textsOf(carla, groupId)).toEqual(["before"]);
    }, WAIT);
    const epochBefore = serverGroup(server, groupId).epoch;

    const result = await (await hubOf(carla)).groups.leaveGroup(groupId);

    expect(result).toEqual({ outcome: "done" });
    expect(await groupNames(carla)).toEqual([]);
    expect(await textsOf(carla, groupId)).toEqual([]);
    await vi.waitFor(() => {
      expect(serverGroup(server, groupId)).toEqual({
        epoch: epochBefore + 1,
        members: expect.not.arrayContaining([deviceIdOf(carla)]) as string[],
      });
    }, WAIT);
  });

  it("stops delivering to the leaver, and its other Devices drop the Group too", async () => {
    const { groupId, alice, carla } = await threeInAGroup();
    const carlaLaptop = await secondDevice(server, installations, "carla");
    await waitUntilInGroup(carlaLaptop, groupId);

    await (await hubOf(carla)).groups.leaveGroup(groupId);
    await waitUntilOutOfGroup(carlaLaptop, groupId);
    await send(alice, groupId, "carla is gone");

    const waitingForCarla = server.database
      .prepare("SELECT count(*) FROM deliveries WHERE device_id IN (?, ?)")
      .pluck()
      .get(deviceIdOf(carla), deviceIdOf(carlaLaptop));
    expect(waitingForCarla).toBe(0);
    expect(await textsOf(carlaLaptop, groupId)).toEqual([]);
    expect(groupIdFromText(groupId)).toHaveLength(16);
    expect([
      ...alice.hubErrors,
      ...carla.hubErrors,
      ...carlaLaptop.hubErrors,
    ]).toEqual([]);
  });
});
