import { ApiErrorCode, normalizeRecoveryCode } from "@newcord/shared";
import type {
  AccountRefusal,
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
import type { LiveSession } from "../session/live-session";
import type { RenewalOutcome } from "../session/token-renewal";
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
  const first = await sendPasswordChange(dependencies, newPassword);
  if (first.ok || first.failure !== ApiErrorCode.InvalidAccessToken) {
    return passwordChangeResult(first);
  }
  const renewal = await dependencies.liveSession.renewAccessToken();
  const renewalRefusal = refusalAfterRenewal(renewal);
  if (renewalRefusal !== undefined) {
    return { outcome: "refused", refusal: renewalRefusal };
  }
  return passwordChangeResult(
    await sendPasswordChange(dependencies, newPassword),
  );
}

function sendPasswordChange(
  dependencies: PasswordActionsDependencies,
  newPassword: string,
): Promise<ServerCallResult<undefined>> {
  const tokens = dependencies.store.readSessionTokens();
  if (tokens === undefined) {
    return Promise.resolve({
      ok: false,
      failure: ApiErrorCode.InvalidRefreshToken,
    });
  }
  return dependencies.server.changePassword(tokens.accessToken, {
    newPassword,
  });
}

function refusalAfterRenewal(
  renewal: RenewalOutcome,
): AccountRefusal | undefined {
  if (renewal === "session-ended") return ApiErrorCode.InvalidRefreshToken;
  // A renewal fails for now when the server is out of reach, limits the rate or answers oddly.
  if (renewal === "failed") return "SERVER_UNREACHABLE";
  return undefined;
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
