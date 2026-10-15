import type { FastifyJWTOptions, JWT } from "@fastify/jwt";
import { DeviceId } from "@newcord/shared";
import { Type } from "typebox";
import { Value } from "typebox/value";

/** An access token expires after 15 minutes (D37b, 08-m1-build Settings). */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;

/** Whom an access token speaks for: an Account and one of its Devices. */
export interface AccessTokenSubject {
  userId: number;
  deviceId: string;
}

/** The claims signed into an access token; `sub` is the Account's ID. */
export interface AccessTokenClaims {
  sub: string;
  deviceId: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenClaims;
  }
}

/** The claims a verified token must carry; 15 digits keep the Account ID a safe integer. */
const VerifiedAccessTokenClaims = Type.Object({
  sub: Type.String({ pattern: "^[1-9][0-9]{0,14}$" }),
  deviceId: DeviceId,
  exp: Type.Number(),
});

/** Signs access tokens. */
export interface AccessTokenSigner {
  sign(subject: AccessTokenSubject): string;
}

/** Checks access tokens: on HTTP routes now, and in the WebSocket `hello` later. */
export interface AccessTokenVerifier {
  /** Returns whom the token speaks for, or undefined if it is malformed, forged, expired or not HS256. */
  verify(accessToken: string): AccessTokenSubject | undefined;
}

/**
 * The @fastify/jwt settings: HS256 only, both to sign and to verify (D37c).
 * Example: `await app.register(fastifyJwt, accessTokenPluginOptions(secret));`
 */
export function accessTokenPluginOptions(secret: string): FastifyJWTOptions {
  return {
    secret,
    // @fastify/jwt reads a numeric expiresIn as seconds, unlike the fast-jwt library beneath it.
    sign: { algorithm: "HS256", expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS },
    verify: { algorithms: ["HS256"] },
  };
}

/**
 * Wraps @fastify/jwt's signer behind the project's interface.
 * Example: `createAccessTokenSigner(app.jwt).sign({ userId: 1, deviceId });`
 */
export function createAccessTokenSigner(jwt: JWT): AccessTokenSigner {
  return {
    sign: (subject: AccessTokenSubject): string =>
      jwt.sign({ sub: String(subject.userId), deviceId: subject.deviceId }),
  };
}

/**
 * Wraps @fastify/jwt's verifier, turning every kind of failure into `undefined`.
 * Example: `const subject = createAccessTokenVerifier(app.jwt).verify(accessToken);`
 */
export function createAccessTokenVerifier(jwt: JWT): AccessTokenVerifier {
  return {
    verify: (accessToken: string): AccessTokenSubject | undefined =>
      subjectOf(verifiedClaims(jwt, accessToken)),
  };
}

function verifiedClaims(jwt: JWT, accessToken: string): unknown {
  try {
    return jwt.verify<object>(accessToken);
  } catch {
    // fast-jwt throws errors without an HTTP status for a wrong algorithm or a missing
    // signature; reporting every failure the same way keeps them all a plain 401.
    return undefined;
  }
}

function subjectOf(claims: unknown): AccessTokenSubject | undefined {
  if (!Value.Check(VerifiedAccessTokenClaims, claims)) return undefined;
  return { userId: Number(claims.sub), deviceId: claims.deviceId };
}
