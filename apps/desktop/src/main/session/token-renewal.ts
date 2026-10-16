import { ApiErrorCode } from "@newcord/shared";
import type { LocalStore } from "../local-store/local-store";
import type { ServerApiClient } from "../server-api/server-api-client";

/**
 * What a renewal did: stored new tokens; found the session ended (no tokens stored, or the server
 * refused the refresh token as reused, expired or unknown); failed for now (the server was out of
 * reach, limited the rate or answered oddly); or got new tokens after the stored ones changed.
 */
export type RenewalOutcome =
  "renewed" | "session-ended" | "failed" | "discarded";

export interface TokenRenewalDependencies {
  readonly store: Pick<
    LocalStore,
    "readSessionTokens" | "replaceSessionTokens"
  >;
  readonly server: Pick<ServerApiClient, "refresh">;
}

/** Swaps the stored refresh token for new tokens, one request at a time. */
export interface TokenRenewal {
  /** Renews the tokens, or joins the renewal already under way. */
  renew(): Promise<RenewalOutcome>;
  /** Resolves once no renewal is under way, so the stored tokens are the latest ones. */
  settled(): Promise<void>;
}

/**
 * Creates the renewal. A refresh token works once (D62): sending it twice would end the session,
 * so concurrent callers share one request.
 * @example const outcome = await createTokenRenewal({ store, server }).renew();
 */
export function createTokenRenewal(
  dependencies: TokenRenewalDependencies,
): TokenRenewal {
  let underWay: Promise<RenewalOutcome> | undefined;
  const renew = (): Promise<RenewalOutcome> => {
    underWay ??= renewOnce(dependencies).finally(() => {
      underWay = undefined;
    });
    return underWay;
  };
  return {
    renew,
    settled: async (): Promise<void> => {
      await underWay;
    },
  };
}

async function renewOnce(
  dependencies: TokenRenewalDependencies,
): Promise<RenewalOutcome> {
  const tokens = dependencies.store.readSessionTokens();
  if (tokens === undefined) return "session-ended";
  const result = await dependencies.server.refresh({
    refreshToken: tokens.refreshToken,
  });
  if (!result.ok) {
    return result.failure === ApiErrorCode.InvalidRefreshToken
      ? "session-ended"
      : "failed";
  }
  return dependencies.store.replaceSessionTokens(
    tokens.refreshToken,
    result.body,
  )
    ? "renewed"
    : "discarded";
}
