import { normalizeRecoveryCode } from "@newcord/shared";
import type {
  DesktopApiCalls,
  PasswordChangeResult,
  PasswordRecovery,
  PasswordRecoveryResult,
} from "../../preload/desktop-api";
import type { LocalStore } from "../local-store/local-store";
import type {
  ServerApiClient,
  ServerCallResult,
} from "../server-api/server-api-client";
import { createAuthenticatedCall } from "../session/authenticated-call";
import type { LiveSession } from "../session/live-session";
import { sessionStateOf } from "./session-state";

export interface PasswordActionsDependencies {
  readonly store: Pick<LocalStore, "readAccount" | "readSessionTokens">;
  readonly server: Pick<ServerApiClient, "changePassword" | "recoverPassword">;
  readonly liveSession: Pick<LiveSession, "renewAccessToken">;
}

export type PasswordActions = Pick<
  DesktopApiCalls,
  "changePassword" | "recoverPassword"
>;

/**
 * Changing the password from a logged-in Device (D55) and recovering it with the Recovery code.
 * @example const { changePassword, recoverPassword } = createPasswordActions({ store, server, liveSession });
 */
export function createPasswordActions(
  dependencies: PasswordActionsDependencies,
): PasswordActions {
  return {
    changePassword: (newPassword) => changePassword(dependencies, newPassword),
    recoverPassword: (recovery) => recoverPassword(dependencies, recovery),
  };
}

/** An access token the server refuses is renewed once and the change sent again. */
async function changePassword(
  dependencies: PasswordActionsDependencies,
  newPassword: string,
): Promise<PasswordChangeResult> {
  const callAuthenticated = createAuthenticatedCall(dependencies);
  return passwordChangeResult(
    await callAuthenticated((accessToken) =>
      dependencies.server.changePassword(accessToken, { newPassword }),
    ),
  );
}

function passwordChangeResult(
  result: ServerCallResult<undefined>,
): PasswordChangeResult {
  return result.ok
    ? { outcome: "changed" }
    : { outcome: "refused", refusal: result.failure };
}

async function recoverPassword(
  dependencies: PasswordActionsDependencies,
  recovery: PasswordRecovery,
): Promise<PasswordRecoveryResult> {
  const result = await dependencies.server.recoverPassword({
    username: recovery.username,
    recoveryCode: normalizeRecoveryCode(recovery.recoveryCode),
    newPassword: recovery.newPassword,
  });
  if (!result.ok) return { outcome: "refused", refusal: result.failure };
  return {
    outcome: "recovered",
    recoveryCode: result.body.recoveryCode,
    session: sessionStateOf(dependencies.store),
  };
}
