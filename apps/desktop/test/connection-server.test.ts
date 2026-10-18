import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopApiEventChannels } from "../src/preload/desktop-api";
import { WAIT } from "./support/group-scenarios";
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

function connectionNotices(installation: LiveInstallation): unknown[] {
  return installation.notifications
    .filter(
      (notice) =>
        notice.channel === desktopApiEventChannels.onConnectionChanged,
    )
    .map((notice) => notice.payload);
}

describe("the connection, as the window sees it", () => {
  it("is down before anyone signs in", async () => {
    const installation = installations.install();

    await expect(installation.actions.readConnection()).resolves.toBe(false);
    expect(connectionNotices(installation)).toEqual([]);
  });

  it("comes up once the server accepts the Device, and the window hears it", async () => {
    const alice = await installations.signedUp("alice");

    await vi.waitFor(async () => {
      await expect(alice.actions.readConnection()).resolves.toBe(true);
    }, WAIT);
    expect(connectionNotices(alice)).toEqual([true]);
  });

  it("goes down when the connection ends, and the window hears that too", async () => {
    const alice = await installations.signedUp("alice");
    await vi.waitFor(async () => {
      await expect(alice.actions.readConnection()).resolves.toBe(true);
    }, WAIT);

    await alice.liveSession.stop();

    await expect(alice.actions.readConnection()).resolves.toBe(false);
    expect(connectionNotices(alice)).toEqual([true, false]);
  });
});
