import type { FastifyJWTOptions, JWT } from "@fastify/jwt";

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

/** Signs access tokens. */
export interface AccessTokenSigner {
  sign(subject: AccessTokenSubject): string;
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
