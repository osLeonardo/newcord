import type { DesktopApi } from "../../../preload/desktop-api";
import type { AppView } from "../app-view";
import {
  accountRefusalMessage,
  inputProblemMessage,
  recoveryRefusalMessage,
  UNEXPECTED_FAILURE_MESSAGE,
} from "./account-messages";
import {
  newPasswordProblem,
  recoveryProblem,
  type NewPasswordInput,
  type RecoveryInput,
} from "./credentials-check";

/** A password change either went through or left a sentence to show. */
export type PasswordChangeSubmission =
  | { readonly changed: true }
  | { readonly changed: false; readonly message: string };

/**
 * Checks the new password typed twice, sends it only if the rules hold, and reports the outcome.
 * @example const submission = await submitPasswordChange(window.desktopApi, { newPassword, repeatedPassword });
 */
export async function submitPasswordChange(
  desktopApi: Pick<DesktopApi, "changePassword">,
  input: NewPasswordInput,
): Promise<PasswordChangeSubmission> {
  const problem = newPasswordProblem(input);
  if (problem !== undefined) {
    return { changed: false, message: inputProblemMessage(problem) };
  }
  try {
    const result = await desktopApi.changePassword(input.newPassword);
    if (result.outcome === "changed") return { changed: true };
    return { changed: false, message: accountRefusalMessage(result.refusal) };
  } catch {
    return { changed: false, message: UNEXPECTED_FAILURE_MESSAGE };
  }
}

/**
 * Checks the recovery screen's fields, sends them only if the rules hold, and on success shows the
 * new Recovery code, followed by the login screen. Returns the sentence to show otherwise.
 * @example const message = await submitPasswordRecovery(window.desktopApi, input, show);
 */
export async function submitPasswordRecovery(
  desktopApi: Pick<DesktopApi, "recoverPassword">,
  input: RecoveryInput,
  show: (view: AppView) => void,
): Promise<string | undefined> {
  const problem = recoveryProblem(input);
  if (problem !== undefined) return inputProblemMessage(problem);
  try {
    const result = await desktopApi.recoverPassword({
      username: input.username,
      recoveryCode: input.recoveryCode,
      newPassword: input.newPassword,
    });
    if (result.outcome === "refused") {
      return recoveryRefusalMessage(result.refusal);
    }
    show({
      screen: "recovery-code",
      recoveryCode: result.recoveryCode,
      next: { screen: "log-in", storedUsername: result.session.username },
    });
    return undefined;
  } catch {
    return UNEXPECTED_FAILURE_MESSAGE;
  }
}
