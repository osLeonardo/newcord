import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createdGroup,
  hubOf,
  inviteAndJoin,
  memberReady,
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

async function expectTexts(
  installation: LiveInstallation,
  groupId: string,
  texts: string[],
): Promise<void> {
  await vi.waitFor(async () => {
    expect(await chatTextsOf(installation, groupId)).toEqual(texts);
  }, WAIT);
}

/** Alice on two Devices and Bruno, sharing two Groups. */
async function sharedGroups(): Promise<{
  friends: string;
  family: string;
  phone: LiveInstallation;
  laptop: LiveInstallation;
  bruno: LiveInstallation;
}> {
  const phone = await memberReady(server, installations, "alice");
  const laptop = await secondDevice(server, installations, "alice");
  const bruno = await memberReady(server, installations, "bruno");
  const friends = await createdGroup(phone, "friends");
  const family = await createdGroup(phone, "family");
  for (const groupId of [friends, family]) {
    await waitUntilInGroup(laptop, groupId);
    await inviteAndJoin(phone, bruno, groupId, "bruno");
  }
  return { friends, family, phone, laptop, bruno };
}

describe("blocking (D57)", () => {
  it("hides the blocked person's messages in every shared Group on all the blocker's Devices, even ones already shown", async () => {
    const { friends, family, phone, laptop, bruno } = await sharedGroups();
    await sendText(bruno, friends, "hello friends");
    await expectTexts(laptop, friends, ["hello friends"]);

    const result = await (await hubOf(phone)).groups.blockAccount("bruno");
    await sendText(bruno, family, "hello family");

    expect(result).toEqual({ outcome: "done" });
    await vi.waitFor(async () => {
      expect(await (await hubOf(laptop)).groups.listBlocked()).toEqual([
        "bruno",
      ]);
    }, WAIT);
    for (const device of [phone, laptop]) {
      await expectTexts(device, friends, []);
      await expectTexts(device, family, []);
    }
  });

  it("still decrypts and acknowledges hidden messages, so the Group keeps working", async () => {
    const { friends, phone, bruno } = await sharedGroups();
    await (await hubOf(phone)).groups.blockAccount("bruno");

    await sendText(bruno, friends, "while blocked");
    await vi.waitFor(() => {
      expect(
        server.database
          .prepare("SELECT count(*) FROM deliveries")
          .pluck()
          .get(),
      ).toBe(0);
    }, WAIT);
    await sendText(phone, friends, "still working");

    await expectTexts(bruno, friends, ["while blocked", "still working"]);
  });

  it("shows the messages again after unblocking, including those received while blocked", async () => {
    const { friends, phone, laptop, bruno } = await sharedGroups();
    await sendText(bruno, friends, "before");
    await (await hubOf(phone)).groups.blockAccount("bruno");
    await sendText(bruno, friends, "during");
    await expectTexts(laptop, friends, []);

    await (await hubOf(laptop)).groups.unblockAccount("bruno");

    await expectTexts(phone, friends, ["before", "during"]);
    await expectTexts(laptop, friends, ["before", "during"]);
  });

  it("tells the interface when the block list changes", async () => {
    const { phone } = await sharedGroups();

    await (await hubOf(phone)).groups.blockAccount("bruno");

    await vi.waitFor(() => {
      expect(phone.notifications.map((change) => change.channel)).toContain(
        "blocks:changed",
      );
    }, WAIT);
  });
});
