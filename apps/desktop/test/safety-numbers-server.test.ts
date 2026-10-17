import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createdGroup,
  hubOf,
  inviteAndJoin,
  memberReady,
  secondDevice,
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

async function twoInAGroup(): Promise<{
  groupId: string;
  alice: LiveInstallation;
  bruno: LiveInstallation;
}> {
  const alice = await memberReady(server, installations, "alice");
  const bruno = await memberReady(server, installations, "bruno");
  const groupId = await createdGroup(alice);
  await inviteAndJoin(alice, bruno, groupId, "bruno");
  await vi.waitFor(async () => {
    const members = await (await hubOf(bruno)).groups.listMembers(groupId);
    expect(members).toHaveLength(2);
  }, WAIT);
  return { groupId, alice, bruno };
}

async function numberSeenBy(
  installation: LiveInstallation,
  groupId: string,
  username: string,
): Promise<string> {
  const result = await (
    await hubOf(installation)
  ).groups.readSafetyNumber(groupId, username);
  if (result.outcome !== "found") throw new Error(result.refusal);
  return result.safetyNumber;
}

async function verifiedIn(
  installation: LiveInstallation,
  groupId: string,
  username: string,
): Promise<boolean | undefined> {
  const members = await (await hubOf(installation)).groups.listMembers(groupId);
  return members.find((member) => member.username === username)?.verified;
}

describe("Safety numbers (#11, Step 01)", () => {
  it("are the same 60 digits on both sides", async () => {
    const { groupId, alice, bruno } = await twoInAGroup();

    const atAlice = await numberSeenBy(alice, groupId, "bruno");
    const atBruno = await numberSeenBy(bruno, groupId, "alice");

    expect(atAlice).toMatch(/^\d{60}$/);
    expect(atBruno).toBe(atAlice);
  });

  it("come from the Group's MLS credentials, not the server's Key directory", async () => {
    const { groupId, alice } = await twoInAGroup();
    const before = await numberSeenBy(alice, groupId, "bruno");

    server.database
      .prepare("UPDATE devices SET identity_key = randomblob(32)")
      .run();

    expect(await numberSeenBy(alice, groupId, "bruno")).toBe(before);
  });

  it("refuse a number with yourself or someone outside the Group", async () => {
    const { groupId, alice } = await twoInAGroup();
    const hub = await hubOf(alice);

    expect(await hub.groups.readSafetyNumber(groupId, "alice")).toEqual({
      outcome: "refused",
      refusal: "CANNOT_VERIFY_SELF",
    });
    expect(await hub.groups.readSafetyNumber(groupId, "carla")).toEqual({
      outcome: "refused",
      refusal: "PERSON_NOT_IN_GROUP",
    });
  });

  it("mark a person verified for the number shown, in the member list", async () => {
    const { groupId, alice } = await twoInAGroup();
    const hub = await hubOf(alice);
    const shown = await numberSeenBy(alice, groupId, "bruno");

    expect(await hub.groups.markVerified(groupId, "bruno", shown)).toEqual({
      outcome: "done",
    });

    expect(await verifiedIn(alice, groupId, "bruno")).toBe(true);
    expect(await hub.groups.readSafetyNumber(groupId, "bruno")).toEqual({
      outcome: "found",
      safetyNumber: shown,
      verified: true,
    });
  });

  it("refuse to mark a number that is no longer the current one", async () => {
    const { groupId, alice } = await twoInAGroup();

    expect(
      await (
        await hubOf(alice)
      ).groups.markVerified(groupId, "bruno", "0".repeat(60)),
    ).toEqual({ outcome: "refused", refusal: "SAFETY_NUMBER_CHANGED" });
    expect(await verifiedIn(alice, groupId, "bruno")).toBe(false);
  });

  it("change when the person adds a Device, which no longer counts as verified", async () => {
    const { groupId, alice } = await twoInAGroup();
    const hub = await hubOf(alice);
    const before = await numberSeenBy(alice, groupId, "bruno");
    await hub.groups.markVerified(groupId, "bruno", before);

    const laptop = await secondDevice(server, installations, "bruno");
    await waitUntilInGroup(laptop, groupId);

    await vi.waitFor(async () => {
      expect(await numberSeenBy(alice, groupId, "bruno")).not.toBe(before);
    }, WAIT);
    expect(await verifiedIn(alice, groupId, "bruno")).toBe(false);
    expect(await numberSeenBy(laptop, groupId, "alice")).toBe(
      await numberSeenBy(alice, groupId, "bruno"),
    );
  });
});

describe("Safety number changes (#11, Step 02)", () => {
  async function safetyNoticesAbout(
    installation: LiveInstallation,
    groupId: string,
    username: string,
  ): Promise<number> {
    const entries = await (
      await hubOf(installation)
    ).groups.listMessages(groupId);
    return entries.filter(
      (entry) =>
        entry.kind === "notice" &&
        entry.notice.type === "safety-number-changed" &&
        entry.notice.username === username,
    ).length;
  }

  it("post one notice in every Group shared with a person who adds a Device", async () => {
    const { groupId: first, alice, bruno } = await twoInAGroup();
    const second = await createdGroup(alice, "second");
    await inviteAndJoin(alice, bruno, second, "bruno");

    const laptop = await secondDevice(server, installations, "bruno");
    await waitUntilInGroup(laptop, first);
    await waitUntilInGroup(laptop, second);

    for (const groupId of [first, second]) {
      await vi.waitFor(async () => {
        expect(await safetyNoticesAbout(alice, groupId, "bruno")).toBe(1);
      }, WAIT);
      expect(await safetyNoticesAbout(bruno, groupId, "bruno")).toBe(0);
    }
  });

  it("clear the person's verified mark", async () => {
    const { groupId, alice } = await twoInAGroup();
    const shown = await numberSeenBy(alice, groupId, "bruno");
    await (await hubOf(alice)).groups.markVerified(groupId, "bruno", shown);

    const laptop = await secondDevice(server, installations, "bruno");
    await waitUntilInGroup(laptop, groupId);

    await vi.waitFor(async () => {
      expect(await safetyNoticesAbout(alice, groupId, "bruno")).toBe(1);
    }, WAIT);
    expect(
      alice.database
        .prepare("SELECT count(*) FROM verified_marks WHERE username = ?")
        .pluck()
        .get("bruno"),
    ).toBe(0);
  });
});
