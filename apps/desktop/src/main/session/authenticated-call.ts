import { ApiErrorCode } from "@newcord/shared";
import type { LocalStore } from "../local-store/local-store";
import type { ServerCallResult } from "../server-api/server-api-client";
import type { LiveSession } from "./live-session";

export interface AuthenticatedCallDependencies {
  readonly store: Pick<LocalStore, "readSessionTokens">;
  readonly liveSession: Pick<LiveSession, "renewAccessToken">;
}

/** Makes a server call with the stored access token, renewing it once if the server refuses it. */
export type AuthenticatedCall = <Body>(
  call: (accessToken: string) => Promise<ServerCallResult<Body>>,
) => Promise<ServerCallResult<Body>>;

/**
 * Creates the caller. A session the server ended answers `INVALID_REFRESH_TOKEN`, and a renewal
 * that failed for now answers `SERVER_UNREACHABLE`.
 * @example const result = await createAuthenticatedCall({ store, liveSession })((token) => server.changePassword(token, request));
 */
export function createAuthenticatedCall(
  dependencies: AuthenticatedCallDependencies,
): AuthenticatedCall {
  const callWithStoredToken = <Body>(
    call: (accessToken: string) => Promise<ServerCallResult<Body>>,
  ): Promise<ServerCallResult<Body>> => {
    const tokens = dependencies.store.readSessionTokens();
    if (tokens === undefined) {
      return Promise.resolve({
        ok: false,
        failure: ApiErrorCode.InvalidRefreshToken,
      });
    }
    return call(tokens.accessToken);
  };
  return async (call) => {
    const first = await callWithStoredToken(call);
    if (first.ok || first.failure !== ApiErrorCode.InvalidAccessToken) {
      return first;
    }
    const renewal = await dependencies.liveSession.renewAccessToken();
    if (renewal === "session-ended") {
      return { ok: false, failure: ApiErrorCode.InvalidRefreshToken };
    }
    if (renewal === "failed") {
      return { ok: false, failure: "SERVER_UNREACHABLE" };
    }
    return callWithStoredToken(call);
  };
}
