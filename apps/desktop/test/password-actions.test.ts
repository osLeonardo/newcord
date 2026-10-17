import { ApiErrorCode, RecoveryCode } from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerApiClient } from "../src/main/server-api/server-api-client";
import type { PasswordRecovery } from "../src/preload/desktop-api";
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

const NEW_PASSWORD = "a brand new long password";

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

async function signedUpWithCode(
  username: string,
): Promise<{ installation: LiveInstallation; recoveryCode: string }> {
  const installation = installations.install();
  const result = await installation.actions.signUp(credentialsOf(username), {
    switchAccount: false,
  });
  if (result.outcome !== "signed-up") {
    throw new Error(`sign-up of ${username} was refused: ${result.refusal}`);
  }
  return { installation, recoveryCode: result.recoveryCode };
}

async function logInOnNewDevice(username: string): Promise<LiveInstallation> {
  const installation = installations.install();
  await installation.actions.logIn(credentialsOf(username), {
    switchAccount: false,
  });
  return installation;
}

function canLogIn(username: string, password: string): Promise<boolean> {
  const fresh = installations.install();
  return fresh.actions
    .logIn({ username, password }, { switchAccount: false })
    .then((result) => result.outcome === "logged-in");
}

/** The code as a person might type it: lower case, in dashed groups, with o for 0 and l for 1. */
function typedSloppily(recoveryCode: string): string {
  const loose = recoveryCode.replaceAll("0", "o").replaceAll("1", "l");
  return (loose.toLowerCase().match(/.{1,4}/g) ?? []).join("-");
}

describe("changePassword", () => {
  it("sets the new password, so only it logs in", async () => {
    const { installation } = await signedUpWithCode("alice");

    await expect(
      installation.actions.changePassword(NEW_PASSWORD),
    ).resolves.toEqual({ outcome: "changed" });
    await expect(canLogIn("alice", NEW_PASSWORD)).resolves.toBe(true);
    await expect(
      canLogIn("alice", credentialsOf("alice").password),
    ).resolves.toBe(false);
  });

  it("keeps this Device logged in and returns the other Devices to their login screens", async () => {
    const { installation: laptop } = await signedUpWithCode("alice");
    const desktop = await logInOnNewDevice("alice");

    await laptop.actions.changePassword(NEW_PASSWORD);

    await vi.waitFor(() => {
      expect(desktop.sessionEnded).toHaveBeenCalledOnce();
    });
    expect(laptop.sessionEnded).not.toHaveBeenCalled();
    await expect(laptop.liveSession.renewAccessToken()).resolves.toBe(
      "renewed",
    );
  });

  it("renews an access token the server refuses and sends the change again", async () => {
    const { installation } = await signedUpWithCode("alice");
    const account = installation.store.readAccount();
    const tokens = installation.store.readSessionTokens();
    if (account === undefined || tokens === undefined) {
      throw new Error("sign-up stored nothing");
    }
    installation.store.saveLogin(account, {
      ...tokens,
      accessToken: "an.expired.token",
    });

    await expect(
      installation.actions.changePassword(NEW_PASSWORD),
    ).resolves.toEqual({ outcome: "changed" });
  });

  it("reports an ended session when the refresh token was used elsewhere", async () => {
    const { installation } = await signedUpWithCode("alice");
    const account = installation.store.readAccount();
    const tokens = installation.store.readSessionTokens();
    if (account === undefined || tokens === undefined) {
      throw new Error("sign-up stored nothing");
    }
    await createServerApiClient(server.transport).refresh({
      refreshToken: tokens.refreshToken,
    });
    installation.store.saveLogin(account, {
      ...tokens,
      accessToken: "an.expired.token",
    });

    await expect(
      installation.actions.changePassword(NEW_PASSWORD),
    ).resolves.toEqual({
      outcome: "refused",
      refusal: ApiErrorCode.InvalidRefreshToken,
    });
    expect(installation.sessionEnded).toHaveBeenCalledOnce();
  });
});

describe("recoverPassword", () => {
  it("accepts the code typed in lower case, with dashes and look-alike letters", async () => {
    const { recoveryCode } = await signedUpWithCode("alice");
    const helper = installations.install();

    const result = await helper.actions.recoverPassword({
      username: "alice",
      recoveryCode: typedSloppily(recoveryCode),
      newPassword: NEW_PASSWORD,
    });

    expect(result).toEqual({
      outcome: "recovered",
      recoveryCode: expect.any(String) as string,
      session: { status: "logged-out", username: null },
    });
    if (result.outcome !== "recovered") throw new Error("not recovered");
    expect(Value.Check(RecoveryCode, result.recoveryCode)).toBe(true);
    expect(result.recoveryCode).not.toBe(recoveryCode);
    await expect(canLogIn("alice", NEW_PASSWORD)).resolves.toBe(true);
  });

  it("returns the Account's Devices to their login screens", async () => {
    const { installation, recoveryCode } = await signedUpWithCode("alice");

    await installations.install().actions.recoverPassword({
      username: "alice",
      recoveryCode,
      newPassword: NEW_PASSWORD,
    });

    await vi.waitFor(() => {
      expect(installation.sessionEnded).toHaveBeenCalledOnce();
    });
  });

  it("reports a wrong code as wrong credentials", async () => {
    await signedUpWithCode("alice");
    const recovery: PasswordRecovery = {
      username: "alice",
      recoveryCode: "0".repeat(24),
      newPassword: NEW_PASSWORD,
    };

    await expect(
      installations.install().actions.recoverPassword(recovery),
    ).resolves.toEqual({
      outcome: "refused",
      refusal: ApiErrorCode.InvalidCredentials,
    });
  });

  it("reports the rate limit after five attempts within the hour", async () => {
    await signedUpWithCode("alice");
    const { actions } = installations.install();
    const wrongAttempt = (): ReturnType<typeof actions.recoverPassword> =>
      actions.recoverPassword({
        username: "alice",
        recoveryCode: "0".repeat(24),
        newPassword: NEW_PASSWORD,
      });
    for (let attempt = 0; attempt < 5; attempt += 1) await wrongAttempt();

    await expect(wrongAttempt()).resolves.toEqual({
      outcome: "refused",
      refusal: ApiErrorCode.RateLimited,
    });
  });
});
