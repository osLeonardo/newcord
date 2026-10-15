import type Database from "better-sqlite3";
import type { DeviceLogout } from "./device-logout.js";
import type { RefreshTokenStore } from "./refresh-token-store.js";
import { hashRefreshToken } from "./refresh-tokens.js";
import type { SessionTokenIssuer, SessionTokens } from "./session-tokens.js";

export type TokenRefreshRefusal = "unknown" | "expired" | "reused";

export type TokenRefreshResult =
  | { refreshed: true; tokens: SessionTokens }
  | { refreshed: false; refusal: TokenRefreshRefusal };

export type TokenRefresh = (refreshToken: string) => TokenRefreshResult;

export interface TokenRefreshDependencies {
  database: Database.Database;
  refreshTokenStore: RefreshTokenStore;
  sessionTokens: SessionTokenIssuer;
  logOutDevice: DeviceLogout;
  clock: () => number;
}

type Rotation =
  | { refreshed: true; tokens: SessionTokens }
  | { refreshed: false; refusal: "unknown" | "expired" }
  | { refreshed: false; refusal: "reused"; deviceId: string };

/**
 * Creates the refresh action: swaps an unused, unexpired refresh token for new tokens, marking
 * it used in the same transaction; a used token logs its Device out instead (D62).
 * Example: `const result = createTokenRefresh(dependencies)(refreshToken);`
 */
export function createTokenRefresh(
  dependencies: TokenRefreshDependencies,
): TokenRefresh {
  const rotate = dependencies.database.transaction(
    (tokenHash: Buffer): Rotation =>
      rotateRefreshToken(dependencies, tokenHash),
  );
  return (refreshToken: string): TokenRefreshResult => {
    const rotation = rotate(hashRefreshToken(refreshToken));
    if (rotation.refreshed) return rotation;
    if (rotation.refusal === "reused") {
      dependencies.logOutDevice(rotation.deviceId);
    }
    return { refreshed: false, refusal: rotation.refusal };
  };
}

function rotateRefreshToken(
  dependencies: TokenRefreshDependencies,
  tokenHash: Buffer,
): Rotation {
  const stored = dependencies.refreshTokenStore.find(tokenHash);
  if (stored === undefined) return { refreshed: false, refusal: "unknown" };
  if (stored.usedAt !== null) {
    return { refreshed: false, refusal: "reused", deviceId: stored.deviceId };
  }
  const now = dependencies.clock();
  if (stored.expiresAt <= now) return { refreshed: false, refusal: "expired" };
  dependencies.refreshTokenStore.markUsed(tokenHash, now);
  const subject = { userId: stored.userId, deviceId: stored.deviceId };
  return { refreshed: true, tokens: dependencies.sessionTokens.issue(subject) };
}
