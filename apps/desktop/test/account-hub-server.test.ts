import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import {
  createLiveInstallations,
  credentialsOf,
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

function serverKeyPackages(installation: LiveInstallation): {
  ordinary: number;
  lastResort: number;
} {
  const deviceId = installation.store.readAccount()?.deviceId;
  const count = (lastResort: number): number =>
    server.database
      .prepare(
        "SELECT count(*) FROM key_packages WHERE device_id = ? AND last_resort = ?",
      )
      .pluck()
      .get(deviceId, lastResort) as number;
  return { ordinary: count(0), lastResort: count(1) };
}

async function expectFullKeyPackages(
  installation: LiveInstallation,
): Promise<void> {
  await vi.waitFor(() => {
    expect(serverKeyPackages(installation)).toEqual({
      ordinary: 20,
      lastResort: 1,
    });
  });
}

describe("the Account hub against the real server (#6, Step 01)", () => {
  it("builds the MLS identity and uploads 20 Key packages and a last-resort one after sign-up", async () => {
    const alice = await installations.signedUp("alice");

    await expectFullKeyPackages(alice);
    expect(alice.deviceHub.current()?.deviceId).toBe(
      alice.store.readAccount()?.deviceId,
    );
    expect(alice.hubErrors).toEqual([]);
  });

  it("tops back up to 20 when the server reports fewer than 5", async () => {
    const alice = await installations.signedUp("alice");
    await expectFullKeyPackages(alice);
    server.database
      .prepare(
        `DELETE FROM key_packages WHERE last_resort = 0 AND id NOT IN (
           SELECT id FROM key_packages WHERE last_resort = 0 ORDER BY id LIMIT 3)`,
      )
      .run();

    await alice.liveSession.stop();
    alice.liveSession.start();

    await expectFullKeyPackages(alice);
  });

  it("starts a fresh MLS identity after switching Accounts (D60)", async () => {
    await installations.signedUp("bruno");
    const installation = await installations.signedUp("alice");
    await expectFullKeyPackages(installation);
    const firstHub = installation.deviceHub.current();

    await installation.actions.logIn(credentialsOf("bruno"), {
      switchAccount: true,
    });

    await vi.waitFor(() => {
      expect(installation.deviceHub.current()).not.toBe(firstHub);
    });
    await expectFullKeyPackages(installation);
  });
});
