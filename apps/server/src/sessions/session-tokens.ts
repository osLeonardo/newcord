import type { AccessTokenSigner, AccessTokenSubject } from "./access-tokens.js";
import type { RefreshTokenStore } from "./refresh-token-store.js";
import {
  REFRESH_TOKEN_LIFETIME_MS,
  generateRefreshToken,
  hashRefreshToken,
} from "./refresh-tokens.js";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Issues a Device's access token and stores the hash of its new refresh token. */
export interface SessionTokenIssuer {
  issue(subject: AccessTokenSubject): SessionTokens;
}

export interface SessionTokenDependencies {
  refreshTokenStore: RefreshTokenStore;
  accessTokenSigner: AccessTokenSigner;
  clock: () => number;
}

/**
 * Creates the issuer of session tokens.
 * Example: `const { accessToken, refreshToken } = issuer.issue({ userId: 1, deviceId });`
 */
export function createSessionTokenIssuer(
  dependencies: SessionTokenDependencies,
): SessionTokenIssuer {
  return {
    issue: (subject: AccessTokenSubject): SessionTokens => {
      const refreshToken = generateRefreshToken();
      dependencies.refreshTokenStore.insert({
        tokenHash: hashRefreshToken(refreshToken),
        deviceId: subject.deviceId,
        expiresAt: dependencies.clock() + REFRESH_TOKEN_LIFETIME_MS,
      });
      return {
        accessToken: dependencies.accessTokenSigner.sign(subject),
        refreshToken,
      };
    },
  };
}
