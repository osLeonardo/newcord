import { ApiErrorCode } from "@newcord/shared";
import type { SessionTokens } from "../local-store/local-store";
import type { ServerApiClient } from "../server-api/server-api-client";

/**
 * Logs this Device out on the server, renewing a refused access token once so its refresh tokens
 * are still deleted. Other failures are left alone: the caller logs out locally whatever happens.
 * @example await endServerSession(serverApiClient, storedTokens);
 */
export async function endServerSession(
  server: ServerApiClient,
  tokens: SessionTokens,
): Promise<void> {
  const loggedOut = await server.logOut(tokens.accessToken);
  if (loggedOut.ok || loggedOut.failure !== ApiErrorCode.InvalidAccessToken) {
    return;
  }
  const renewed = await server.refresh({ refreshToken: tokens.refreshToken });
  if (renewed.ok) await server.logOut(renewed.body.accessToken);
}
