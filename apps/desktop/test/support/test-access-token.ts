/** An unsigned JWT-shaped token carrying `claims`; the app reads only its expiry. */
export function accessTokenWithClaims(claims: object): string {
  const encode = (part: object): string =>
    Buffer.from(JSON.stringify(part)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.c2lnbmF0dXJl`;
}

/** An access token whose `exp` claim is `expiresAt`, in milliseconds since the epoch. */
export function accessTokenExpiringAt(expiresAt: number): string {
  return accessTokenWithClaims({ exp: Math.floor(expiresAt / 1000) });
}
