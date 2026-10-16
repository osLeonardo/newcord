import { describe, expect, it, vi } from "vitest";
import type {
  DesktopApi,
  LogInResult,
  SignUpResult,
} from "../src/preload/desktop-api";
import {
  enterAccount,
  nextAfterAccountEntry,
  sendAccountRequest,
} from "../src/renderer/src/account/account-entry";
import type { AccountRequest, AppView } from "../src/renderer/src/app-view";

const credentials = {
  username: "bruno",
  password: "correct horse battery staple",
};
const logInRequest: AccountRequest = { kind: "log-in", credentials };
const signUpRequest: AccountRequest = { kind: "sign-up", credentials };
const anotherAccount: LogInResult & SignUpResult = {
  outcome: "refused",
  refusal: "ANOTHER_ACCOUNT_STORED",
};
const loggedIn: LogInResult = {
  outcome: "logged-in",
  session: { status: "logged-in", username: "bruno" },
};

/** Logins answer `result`; sign-ups are always refused, which both result types share. */
function desktopApiAnswering(
  result: LogInResult,
): Pick<DesktopApi, "signUp" | "logIn"> {
  return {
    signUp: vi.fn<DesktopApi["signUp"]>(() => Promise.resolve(anotherAccount)),
    logIn: vi.fn<DesktopApi["logIn"]>(() => Promise.resolve(result)),
  };
}

describe("sendAccountRequest", () => {
  it("signs up with the credentials and the choice", async () => {
    const desktopApi = desktopApiAnswering(anotherAccount);

    await sendAccountRequest(desktopApi, signUpRequest, {
      switchAccount: true,
    });

    expect(desktopApi.signUp).toHaveBeenCalledExactlyOnceWith(credentials, {
      switchAccount: true,
    });
    expect(desktopApi.logIn).not.toHaveBeenCalled();
  });

  it("logs in with the credentials and the choice", async () => {
    const desktopApi = desktopApiAnswering(anotherAccount);

    await sendAccountRequest(desktopApi, logInRequest, {
      switchAccount: false,
    });

    expect(desktopApi.logIn).toHaveBeenCalledExactlyOnceWith(credentials, {
      switchAccount: false,
    });
    expect(desktopApi.signUp).not.toHaveBeenCalled();
  });
});

describe("nextAfterAccountEntry", () => {
  it("shows the Recovery code after a sign-up", () => {
    const signedUp: SignUpResult = {
      outcome: "signed-up",
      recoveryCode: "0123456789ABCDEFGHJKMNPQ",
      session: { status: "logged-in", username: "bruno" },
    };

    expect(nextAfterAccountEntry(signUpRequest, signedUp, null)).toEqual({
      kind: "show",
      view: {
        screen: "recovery-code",
        recoveryCode: "0123456789ABCDEFGHJKMNPQ",
        next: { screen: "home", username: "bruno" },
      },
    });
  });

  it("shows the home screen after a login", () => {
    expect(nextAfterAccountEntry(logInRequest, loggedIn, "bruno")).toEqual({
      kind: "show",
      view: { screen: "home", username: "bruno" },
    });
  });

  it("shows the switch warning, keeping the request, when another Account is stored", () => {
    expect(
      nextAfterAccountEntry(logInRequest, anotherAccount, "alice"),
    ).toEqual({
      kind: "show",
      view: {
        screen: "account-switch",
        storedUsername: "alice",
        request: logInRequest,
      },
    });
  });

  it("explains a refusal in words", () => {
    expect(
      nextAfterAccountEntry(
        logInRequest,
        { outcome: "refused", refusal: "INVALID_CREDENTIALS" },
        "bruno",
      ),
    ).toEqual({ kind: "message", message: "Wrong username or password." });
  });

  it("explains the other-Account refusal when the screen knows no stored Account", () => {
    expect(nextAfterAccountEntry(signUpRequest, anotherAccount, null)).toEqual({
      kind: "message",
      message: "This app is set up for another Account.",
    });
  });
});

describe("enterAccount", () => {
  it("moves to the next screen and returns no message", async () => {
    const show = vi.fn<(view: AppView) => void>();

    await expect(
      enterAccount(
        desktopApiAnswering(loggedIn),
        logInRequest,
        { switchAccount: false },
        { storedUsername: "bruno", show },
      ),
    ).resolves.toBeUndefined();
    expect(show).toHaveBeenCalledExactlyOnceWith({
      screen: "home",
      username: "bruno",
    });
  });

  it("returns the refusal's sentence and stays on the screen", async () => {
    const show = vi.fn<(view: AppView) => void>();

    await expect(
      enterAccount(
        desktopApiAnswering({
          outcome: "refused",
          refusal: "SERVER_UNREACHABLE",
        }),
        logInRequest,
        { switchAccount: false },
        { storedUsername: "bruno", show },
      ),
    ).resolves.toBe(
      "Cannot reach the server. Check your connection and try again.",
    );
    expect(show).not.toHaveBeenCalled();
  });
});
