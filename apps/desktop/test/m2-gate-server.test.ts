import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatTextsOf,
  createdGroup,
  deviceIdOf,
  hubOf,
  inviteAndJoin,
  memberReady,
  sendText,
  WAIT,
} from "./support/group-scenarios";
import { loadMlsEngineFactory } from "../src/main/mls/mls-module";
import {
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import {
  createLiveInstallations,
  type LiveInstallation,
  type LiveInstallations,
} from "./support/live-installations";

/**
 * M2's gate (05-milestones), run as three app instances against the real server, each with the
 * real MLS module (#4), so the server only ever holds ciphertext.
 */

let server: InProcessServer;
let installations: LiveInstallations;

beforeEach(async () => {
  server = await startInProcessServer();
  installations = createLiveInstallations(server, {
    createEngine: loadMlsEngineFactory(),
  });
});

afterEach(async () => {
  await installations.close();
  await server.close();
});

const CHAT = ["are you there?", "carla is away", "see you at nine"];

async function threeFriends(): Promise<{
  groupId: string;
  alice: LiveInstallation;
  bruno: LiveInstallation;
  carla: LiveInstallation;
}> {
  const alice = await memberReady(server, installations, "alice");
  const bruno = await memberReady(server, installations, "bruno");
  const carla = await memberReady(server, installations, "carla");
  const groupId = await createdGroup(alice, "friday night");
  await inviteAndJoin(alice, bruno, groupId, "bruno");
  await inviteAndJoin(alice, carla, groupId, "carla");
  return { groupId, alice, bruno, carla };
}

async function chatWhileCarlaIsAway(
  alice: LiveInstallation,
  bruno: LiveInstallation,
  groupId: string,
): Promise<void> {
  await sendText(alice, groupId, CHAT[0] ?? "");
  await sendText(bruno, groupId, CHAT[1] ?? "");
  await sendText(alice, groupId, CHAT[2] ?? "");
  await vi.waitFor(async () => {
    expect(await chatTextsOf(bruno, groupId)).toEqual(CHAT);
  }, WAIT);
}

/** Every text and blob value in the server's database, as text. */
function everyStoredValue(): string[] {
  const tables = server.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .pluck()
    .all() as string[];
  return tables.flatMap((table) =>
    (
      server.database.prepare(`SELECT * FROM "${table}"`).all() as Record<
        string,
        unknown
      >[]
    ).flatMap((row) =>
      Object.values(row).flatMap((value) => {
        if (typeof value === "string") return [value];
        if (Buffer.isBuffer(value)) return [value.toString("utf8")];
        return [];
      }),
    ),
  );
}

describe("the M2 gate", () => {
  it("delivers everything sent while a Member was offline, in order, when they return", async () => {
    const { groupId, alice, bruno, carla } = await threeFriends();
    await carla.liveSession.stop();

    await chatWhileCarlaIsAway(alice, bruno, groupId);
    carla.liveSession.start();

    await vi.waitFor(async () => {
      expect(await chatTextsOf(carla, groupId)).toEqual(CHAT);
    }, WAIT);
    await vi.waitFor(() => {
      expect(
        server.database.prepare("SELECT count(*) FROM messages").pluck().get(),
      ).toBe(0);
    }, WAIT);
  });

  it("stores the Group's name but no Chat text on the server", async () => {
    const { groupId, alice, bruno, carla } = await threeFriends();
    await carla.liveSession.stop();

    await chatWhileCarlaIsAway(alice, bruno, groupId);

    const stored = everyStoredValue();
    expect(
      server.database.prepare("SELECT count(*) FROM messages").pluck().get(),
    ).toBeGreaterThanOrEqual(CHAT.length);
    expect(stored).toContain("friday night");
    for (const text of CHAT) {
      const encodings = [text, Buffer.from(text).toString("base64")];
      expect(
        stored.filter((value) =>
          encodings.some((encoded) => value.includes(encoded)),
        ),
      ).toEqual([]);
    }
  });

  it("gives a removed Member nothing sent after the removal", async () => {
    const { groupId, alice, bruno, carla } = await threeFriends();
    await sendText(alice, groupId, "before");
    await vi.waitFor(async () => {
      expect(await chatTextsOf(carla, groupId)).toEqual(["before"]);
    }, WAIT);

    const removed = await (
      await hubOf(alice)
    ).groups.removeMember(groupId, "carla");
    expect(removed).toEqual({ outcome: "done" });
    await vi.waitFor(async () => {
      expect(
        (await (await hubOf(carla)).groups.listGroups()).map(
          (group) => group.groupId,
        ),
      ).not.toContain(groupId);
    }, WAIT);
    await bruno.liveSession.stop();
    await sendText(alice, groupId, "after");

    const recipients = server.database
      .prepare(
        "SELECT device_id FROM deliveries WHERE group_id = ? AND seq = (SELECT max(seq) FROM messages WHERE group_id = ?)",
      )
      .pluck()
      .all(
        Buffer.from(groupId, "base64url"),
        Buffer.from(groupId, "base64url"),
      );
    expect(recipients).toEqual([deviceIdOf(bruno)]);
    expect(await chatTextsOf(carla, groupId)).toEqual([]);
    bruno.liveSession.start();
    await vi.waitFor(async () => {
      expect(await chatTextsOf(bruno, groupId)).toEqual(["before", "after"]);
    }, WAIT);
  });
});
