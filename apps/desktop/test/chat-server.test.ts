import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../src/preload/group-api";
import {
  createdGroup,
  hubOf,
  inviteAndJoin,
  memberReady,
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

/** Alice, Bruno and Carla in one Group. */
async function threeInAGroup(): Promise<{
  groupId: string;
  alice: LiveInstallation;
  bruno: LiveInstallation;
  carla: LiveInstallation;
}> {
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
): Promise<ChatMessage> {
  const result = await (
    await hubOf(installation)
  ).groups.sendMessage(groupId, text);
  if (result.outcome !== "sent") throw new Error(`refused: ${result.refusal}`);
  return result.message;
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

async function expectTexts(
  installation: LiveInstallation,
  groupId: string,
  texts: string[],
): Promise<void> {
  await vi.waitFor(async () => {
    expect(await textsOf(installation, groupId)).toEqual(texts);
  }, WAIT);
}

function serverCopies(): { messages: number; deliveries: number } {
  const count = (table: string): number =>
    server.database
      .prepare(`SELECT count(*) FROM ${table}`)
      .pluck()
      .get() as number;
  return { messages: count("messages"), deliveries: count("deliveries") };
}

describe("Chat messages (#6, Step 03)", () => {
  it("reach every other Member with the sender's username, in sequence order", async () => {
    const { groupId, alice, bruno, carla } = await threeInAGroup();

    const first = await send(alice, groupId, "hello");
    await send(bruno, groupId, "hi alice");

    await expectTexts(carla, groupId, ["hello", "hi alice"]);
    const atCarla = await (await hubOf(carla)).groups.listMessages(groupId);
    const texts = atCarla.filter((entry) => entry.kind === "text");
    expect(texts.map((message) => [message.sender, message.own])).toEqual([
      ["alice", false],
      ["bruno", false],
    ]);
    expect(first).toMatchObject({ sender: "alice", own: true, text: "hello" });
    await expectTexts(alice, groupId, ["hello", "hi alice"]);
  });

  it("keeps text with HTML exactly as typed", async () => {
    const { groupId, alice, bruno } = await threeInAGroup();
    const text = '<script>alert("x")</script> <b>bold</b>';

    await send(alice, groupId, text);

    await expectTexts(bruno, groupId, [text]);
  });

  it("refuses text over 4,000 characters, and empty text, before sending", async () => {
    const { groupId, alice } = await threeInAGroup();
    const before = serverCopies();
    const groups = (await hubOf(alice)).groups;

    await expect(
      groups.sendMessage(groupId, "x".repeat(4001)),
    ).resolves.toEqual({
      outcome: "refused",
      refusal: "INVALID_TEXT",
    });
    await expect(groups.sendMessage(groupId, "")).resolves.toMatchObject({
      refusal: "INVALID_TEXT",
    });
    expect(serverCopies()).toEqual(before);
    await expect(
      groups.sendMessage(groupId, "x".repeat(4000)),
    ).resolves.toMatchObject({
      outcome: "sent",
    });
  });

  it("shows a Device that was offline everything sent meanwhile, in order", async () => {
    const { groupId, alice, carla } = await threeInAGroup();
    await carla.liveSession.stop();

    for (const text of ["one", "two", "three"])
      await send(alice, groupId, text);
    carla.liveSession.start();

    await expectTexts(carla, groupId, ["one", "two", "three"]);
  });

  it("leaves no copy on the server once every Device acknowledged, and keeps the history after a restart", async () => {
    const { groupId, alice, bruno } = await threeInAGroup();
    await send(alice, groupId, "remember me");
    await vi.waitFor(() => {
      expect(serverCopies()).toEqual({ messages: 0, deliveries: 0 });
    }, WAIT);

    const restarted = await installations.restart(bruno);

    await expectTexts(restarted, groupId, ["remember me"]);
  });
});
