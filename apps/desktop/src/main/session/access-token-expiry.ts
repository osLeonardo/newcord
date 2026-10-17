/** The access token is renewed this long before it expires (08-m1-build Settings). */
export const RENEW_BEFORE_EXPIRY_MS = 60 * 1000;

/**
 * When the access token expires, in milliseconds since the epoch, read from its `exp` claim, or
 * undefined when it has none. The app only schedules renewals with it: the server checks the signature.
 * @example accessTokenExpiresAt("eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3MDAwMDAwMDB9.c2ln") // 1700000000000
 */
export function accessTokenExpiresAt(accessToken: string): number | undefined {
  const claims = jwtClaims(accessToken);
  if (typeof claims !== "object" || claims === null || !("exp" in claims)) {
    return undefined;
  }
  return typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
}

/**
 * How long to wait before renewing the access token: until 1 minute before it expires, and no
 * time at all when that moment has passed or the token's expiry cannot be read.
 * @example renewalDelayMs(accessToken, Date.now()) // 840000 for a fresh 15-minute token
 */
export function renewalDelayMs(accessToken: string, now: number): number {
  const expiresAt = accessTokenExpiresAt(accessToken);
  if (expiresAt === undefined) return 0;
  return Math.max(0, expiresAt - RENEW_BEFORE_EXPIRY_MS - now);
}

function jwtClaims(accessToken: string): unknown {
  const [, payload] = accessToken.split(".");
  if (payload === undefined) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}
