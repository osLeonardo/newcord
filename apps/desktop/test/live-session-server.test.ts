import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerApiClient } from "../src/main/server-api/server-api-client";
import {
  shareGroup,
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import {
  createLiveInstallations,
  credentialsOf,
  type LiveInstallation,
  type LiveInstallations,
} from "./support/live-installations";

const FOURTEEN_MINUTES = 14 * 60 * 1000;

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

function deviceIdOf(installation: LiveInstallation): string {
  const deviceId = installation.store.readAccount()?.deviceId;
  if (deviceId === undefined) throw new Error("no Account is stored");
  return deviceId;
}

/**
 * Signs both Accounts up and puts them in one Group (M2 narrows presence to Group Members), then
 * reconnects the second, as the Group did not exist when it first said hello.
 */
async function signedUpTogether(
  first: string,
  second: string,
): Promise<[LiveInstallation, LiveInstallation]> {
  const one = await installations.signedUp(first);
  const two = await installations.signedUp(second);
  shareGroup(server.database, [deviceIdOf(one), deviceIdOf(two)]);
  await two.liveSession.stop();
  two.liveSession.start();
  return [one, two];
}

async function expectOnline(
  installation: LiveInstallation,
  usernames: string[],
): Promise<void> {
  await vi.waitFor(() => {
    expect(installation.liveSession.onlineAccounts()).toEqual(usernames);
  });
}

describe("the live session against the real server", () => {
  it("shows two logged-in Accounts each other online", async () => {
    const [alice, bruno] = await signedUpTogether("alice", "bruno");

    await expectOnline(alice, ["bruno"]);
    await expectOnline(bruno, ["alice"]);
  });

  it("removes an Account from the other's list when it logs out", async () => {
    const [alice, bruno] = await signedUpTogether("alice", "bruno");
    await expectOnline(alice, ["bruno"]);

    await bruno.actions.logOut();

    await expectOnline(alice, []);
    expect(alice.sessionEnded).not.toHaveBeenCalled();
  });

  it("returns to the login screen when a copied refresh token was used first", async () => {
    const alice = await installations.signedUp("alice");
    await expectOnline(alice, []);
    const deviceId = alice.store.readAccount()?.deviceId;
    const stolen = alice.store.readSessionTokens();
    if (stolen === undefined) throw new Error("sign-up stored no tokens");
    await createServerApiClient(server.transport).refresh({
      refreshToken: stolen.refreshToken,
    });

    await alice.clock.advance(FOURTEEN_MINUTES);

    await vi.waitFor(() => {
      expect(alice.sessionEnded).toHaveBeenCalledOnce();
    });
    await expect(alice.actions.readSessionState()).resolves.toEqual({
      status: "logged-out",
      username: "alice",
    });
    await alice.actions.logIn(credentialsOf("alice"), { switchAccount: false });
    expect(alice.store.readAccount()?.deviceId).toBe(deviceId);
  });
});
