import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerApiClient } from "../src/main/server-api/server-api-client";
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
    const alice = await installations.signedUp("alice");
    const bruno = await installations.signedUp("bruno");

    await expectOnline(alice, ["bruno"]);
    await expectOnline(bruno, ["alice"]);
  });

  it("removes an Account from the other's list when it logs out", async () => {
    const alice = await installations.signedUp("alice");
    const bruno = await installations.signedUp("bruno");
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
