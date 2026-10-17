import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatTextsOf,
  createdGroup,
  hubOf,
  inviteAndJoin,
  memberReady,
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

async function friends(): Promise<{
  groupId: string;
  alice: LiveInstallation;
  bruno: LiveInstallation;
}> {
  const alice = await memberReady(server, installations, "alice");
  const bruno = await memberReady(server, installations, "bruno");
  const groupId = await createdGroup(alice, "friends");
  await inviteAndJoin(alice, bruno, groupId, "bruno");
  return { groupId, alice, bruno };
}

async function unreadOf(
  installation: LiveInstallation,
  groupId: string,
): Promise<number | undefined> {
  const groups = await (await hubOf(installation)).groups.listGroups();
  return groups.find((group) => group.groupId === groupId)?.unread;
}

async function arrived(
  installation: LiveInstallation,
  groupId: string,
  text: string,
): Promise<void> {
  await vi.waitFor(async () => {
    expect(await chatTextsOf(installation, groupId)).toContain(text);
  }, WAIT);
}

describe("message notifications (#10, Step 02)", () => {
  it("notify once per Group, replaced by each new message, with the full preview by default", async () => {
    const { groupId, alice, bruno } = await friends();

    await sendText(bruno, groupId, "first");
    await sendText(bruno, groupId, "second");
    await arrived(alice, groupId, "second");

    expect([...alice.shownNotices]).toEqual([
      [groupId, { title: "friends", body: "bruno: second" }],
    ]);
    expect(await unreadOf(alice, groupId)).toBe(2);
  });

  it("follow the preview setting, and stay generic while a screen share runs (D15)", async () => {
    const { groupId, alice, bruno } = await friends();
    await alice.actions.changeSettings({ previewMode: "sender" });

    await sendText(bruno, groupId, "hi");
    await arrived(alice, groupId, "hi");
    expect(alice.shownNotices.get(groupId)).toEqual({
      title: "friends",
      body: "New message from bruno",
    });

    await alice.actions.reportCallMedia({ muted: false, sharing: true });
    await sendText(bruno, groupId, "while sharing");
    await arrived(alice, groupId, "while sharing");

    expect(alice.shownNotices.get(groupId)).toEqual({
      title: "newcord",
      body: "New message",
    });
  });

  it("skip the Group open in the focused window, and clear it when opened", async () => {
    const { groupId, alice, bruno } = await friends();
    await sendText(bruno, groupId, "before opening");
    await arrived(alice, groupId, "before opening");
    expect(await unreadOf(alice, groupId)).toBe(1);

    alice.windowFocusChanged(true);
    await alice.actions.setViewedGroup(groupId);

    await vi.waitFor(async () => {
      expect(await unreadOf(alice, groupId)).toBe(0);
    }, WAIT);
    expect(alice.shownNotices.size).toBe(0);
    await sendText(bruno, groupId, "while open");
    await arrived(alice, groupId, "while open");
    expect(await unreadOf(alice, groupId)).toBe(0);
    expect(alice.shownNotices.size).toBe(0);
  });

  it("count a message that arrives while the window lacks the focus, even with the Group open", async () => {
    const { groupId, alice, bruno } = await friends();
    await alice.actions.setViewedGroup(groupId);

    await sendText(bruno, groupId, "while away");
    await arrived(alice, groupId, "while away");

    expect(await unreadOf(alice, groupId)).toBe(1);
    alice.windowFocusChanged(true);
    await vi.waitFor(async () => {
      expect(await unreadOf(alice, groupId)).toBe(0);
    }, WAIT);
  });

  it("never come from this Account's own messages or from someone blocked (D57)", async () => {
    const { groupId, alice, bruno } = await friends();
    await sendText(alice, groupId, "my own");
    await (await hubOf(alice)).groups.blockAccount("bruno");
    await vi.waitFor(async () => {
      expect(await (await hubOf(alice)).groups.listBlocked()).toEqual([
        "bruno",
      ]);
    }, WAIT);

    await sendText(bruno, groupId, "from someone blocked");
    await vi.waitFor(() => {
      expect(
        server.database
          .prepare("SELECT count(*) FROM deliveries")
          .pluck()
          .get(),
      ).toBe(0);
    }, WAIT);

    expect(await unreadOf(alice, groupId)).toBe(0);
    expect(alice.shownNotices.size).toBe(0);
  });
});
