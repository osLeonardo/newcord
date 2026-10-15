import { ApiErrorCode } from "@newcord/shared";
import type {
  FastifyInstance,
  FastifyRequest,
  onRequestHookHandler,
} from "fastify";
import { ApiError } from "../api-error.js";
import type {
  AccessTokenSubject,
  AccessTokenVerifier,
} from "./access-tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The Account and Device of the verified access token; null on routes without the check. */
    accessTokenSubject: AccessTokenSubject | null;
  }
}

const BEARER_PREFIX = "Bearer ";

/**
 * Lets requests carry a verified subject and returns the `onRequest` hook that requires an
 * `Authorization: Bearer <JWT>` header, answering 401 to anything else. Later hooks, such as a
 * per-Account rate limit, can read `request.accessTokenSubject`.
 * Example: `app.post("/logout", { onRequest: registerAccessTokenCheck(app, verifier) }, handler);`
 */
export function registerAccessTokenCheck(
  app: FastifyInstance,
  verifier: AccessTokenVerifier,
): onRequestHookHandler {
  app.decorateRequest("accessTokenSubject", null);
  return (request, _reply, done): void => {
    const token = bearerTokenOf(request.headers.authorization);
    const subject = token === undefined ? undefined : verifier.verify(token);
    if (subject === undefined) {
      done(accessTokenRefusal());
      return;
    }
    request.accessTokenSubject = subject;
    done();
  };
}

/**
 * Returns the subject the access-token check stored on a request.
 * Example: `const { deviceId } = authenticatedSubject(request);`
 */
export function authenticatedSubject(
  request: FastifyRequest,
): AccessTokenSubject {
  if (request.accessTokenSubject === null) {
    throw new Error(
      `${request.method} ${request.url} has no verified access token; add the access-token check as its onRequest hook`,
    );
  }
  return request.accessTokenSubject;
}

function bearerTokenOf(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith(BEARER_PREFIX)) return undefined;
  return authorization.slice(BEARER_PREFIX.length);
}

function accessTokenRefusal(): ApiError {
  return new ApiError(
    401,
    ApiErrorCode.InvalidAccessToken,
    "Send a valid access token as Authorization: Bearer <JWT>; refresh it if it has expired",
  );
}
