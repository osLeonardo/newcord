import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import { ApiErrorCode } from "@newcord/shared";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
  preHandlerAsyncHookHandler,
} from "fastify";
import { ApiError } from "./api-error.js";
import { authenticatedSubject } from "./sessions/access-token-check.js";

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/** How many requests a key may make within a time window, in milliseconds. */
export interface RateLimitSetting {
  max: number;
  timeWindow: number;
}

/** Sign-up: 5 per hour per IP address (08-m1-build Settings). */
export const SIGN_UP_RATE_LIMIT: RateLimitSetting = {
  max: 5,
  timeWindow: ONE_HOUR_MS,
};

/** Login: 5 attempts per minute, per username and per IP address (08-m1-build Settings). */
export const LOGIN_RATE_LIMIT: RateLimitSetting = {
  max: 5,
  timeWindow: ONE_MINUTE_MS,
};

/** Refresh: 20 per minute per IP address (08-m1-build Settings). */
export const REFRESH_RATE_LIMIT: RateLimitSetting = {
  max: 20,
  timeWindow: ONE_MINUTE_MS,
};

/** Password change: 5 per hour per Account (08-m1-build Settings). */
export const PASSWORD_CHANGE_RATE_LIMIT: RateLimitSetting = {
  max: 5,
  timeWindow: ONE_HOUR_MS,
};

/** Password recovery: 5 attempts per hour, per username and per IP address (08-m1-build Settings). */
export const PASSWORD_RECOVERY_RATE_LIMIT: RateLimitSetting = {
  max: 5,
  timeWindow: ONE_HOUR_MS,
};

/** Key directory: 60 lookups per minute per Account (08-m1-build Settings, D64). */
export const KEY_DIRECTORY_RATE_LIMIT: RateLimitSetting = {
  max: 60,
  timeWindow: ONE_MINUTE_MS,
};

/** @fastify/rate-limit settings: only routes naming a limit are limited, and every 429 carries a code. */
export const RATE_LIMIT_PLUGIN_OPTIONS: RateLimitPluginOptions = {
  global: false,
  errorResponseBuilder: (_request, context): ApiError =>
    rateLimitExceeded(Math.ceil(context.ttl / 1000)),
};

/**
 * Creates a `preHandler` hook limiting requests per `username` in the validated body. It runs
 * after validation because the body is not parsed when the usual `onRequest` limit runs.
 * Example: `app.post("/login", { preHandler: createUsernameRateLimit(app, LOGIN_RATE_LIMIT) }, handler);`
 */
export function createUsernameRateLimit(
  app: FastifyInstance,
  setting: RateLimitSetting,
): preHandlerAsyncHookHandler {
  return createKeyedRateLimit(app, setting, (request) =>
    usernameIn(request.body),
  );
}

/**
 * Creates an `onRequest` hook limiting requests per Account, keyed on the verified access token
 * rather than the IP address; list it after the access-token check, which stores the Account.
 * Example: `app.get("/users/:username/keys", { onRequest: [checkAccessToken, createAccountRateLimit(app, KEY_DIRECTORY_RATE_LIMIT)] }, handler);`
 */
export function createAccountRateLimit(
  app: FastifyInstance,
  setting: RateLimitSetting,
): onRequestAsyncHookHandler {
  return createKeyedRateLimit(app, setting, (request) =>
    String(authenticatedSubject(request).userId),
  );
}

type RateLimitHook = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

function createKeyedRateLimit(
  app: FastifyInstance,
  setting: RateLimitSetting,
  keyOf: (request: FastifyRequest) => string,
): RateLimitHook {
  const countAttempt = app.createRateLimit({ ...setting, keyGenerator: keyOf });
  return async (request, reply): Promise<void> => {
    const attempt = await countAttempt(request);
    if (attempt.isAllowed || !attempt.isExceeded) return;
    reply.header("retry-after", attempt.ttlInSeconds);
    throw rateLimitExceeded(attempt.ttlInSeconds);
  };
}

function usernameIn(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "username" in body &&
    typeof body.username === "string"
  ) {
    return body.username;
  }
  throw new Error(
    `A per-username rate limit needs a validated body with a "username" string, got ${typeof body}`,
  );
}

function rateLimitExceeded(retryAfterSeconds: number): ApiError {
  return new ApiError(
    429,
    ApiErrorCode.RateLimited,
    `Too many attempts; retry in ${retryAfterSeconds} seconds`,
  );
}
