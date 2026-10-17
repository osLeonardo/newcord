import type {
  AccountSwitchChoice,
  DesktopApi,
  LogInResult,
  SignUpResult,
} from "../../../preload/desktop-api";
import {
  viewForSessionState,
  type AccountRequest,
  type AppView,
} from "../app-view";
import { accountRefusalMessage } from "./account-messages";

/** The next screen to show, or the sentence to show on the current one. */
export type AccountEntryNext =
  | { readonly kind: "show"; readonly view: AppView }
  | { readonly kind: "message"; readonly message: string };

/**
 * Sends a sign-up or login to the main process with the person's switch choice.
 * @example const result = await sendAccountRequest(window.desktopApi, { kind: "log-in", credentials }, { switchAccount: false });
 */
export function sendAccountRequest(
  desktopApi: Pick<DesktopApi, "signUp" | "logIn">,
  request: AccountRequest,
  choice: AccountSwitchChoice,
): Promise<SignUpResult | LogInResult> {
  return request.kind === "sign-up"
    ? desktopApi.signUp(request.credentials, choice)
    : desktopApi.logIn(request.credentials, choice);
}

/**
 * What follows a sign-up or login: the Recovery code, the home screen, the Account-switch
 * warning (D60) when this installation belongs to another Account, or a refusal's sentence.
 * @example nextAfterAccountEntry(request, { outcome: "refused", refusal: "ANOTHER_ACCOUNT_STORED" }, "alice") // the warning
 */
export function nextAfterAccountEntry(
  request: AccountRequest,
  result: SignUpResult | LogInResult,
  storedUsername: string | null,
): AccountEntryNext {
  if (result.outcome === "signed-up") {
    return {
      kind: "show",
      view: {
        screen: "recovery-code",
        recoveryCode: result.recoveryCode,
        next: viewForSessionState(result.session),
      },
    };
  }
  if (result.outcome === "logged-in") {
    return { kind: "show", view: viewForSessionState(result.session) };
  }
  if (result.refusal === "ANOTHER_ACCOUNT_STORED" && storedUsername !== null) {
    return {
      kind: "show",
      view: { screen: "account-switch", storedUsername, request },
    };
  }
  return { kind: "message", message: accountRefusalMessage(result.refusal) };
}

/**
 * Sends a request and moves to the next screen, or returns the sentence the current screen shows.
 * @example const message = await enterAccount(desktopApi, request, { switchAccount: false }, { storedUsername, show });
 */
export async function enterAccount(
  desktopApi: Pick<DesktopApi, "signUp" | "logIn">,
  request: AccountRequest,
  choice: AccountSwitchChoice,
  screen: {
    readonly storedUsername: string | null;
    readonly show: (view: AppView) => void;
  },
): Promise<string | undefined> {
  const result = await sendAccountRequest(desktopApi, request, choice);
  const next = nextAfterAccountEntry(request, result, screen.storedUsername);
  if (next.kind === "message") return next.message;
  screen.show(next.view);
  return undefined;
}
