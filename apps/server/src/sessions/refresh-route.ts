import { ApiErrorCode, RefreshRequest, RefreshResponse } from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../api-error.js";
import { REFRESH_RATE_LIMIT } from "../rate-limits.js";
import type { TokenRefresh } from "./token-refresh.js";

/**
 * Adds `POST /refresh`, which swaps a refresh token for new tokens (D37b, D62).
 * Example: `registerRefreshRoute(app, createTokenRefresh(dependencies));`
 */
export function registerRefreshRoute(
  app: FastifyInstance,
  refreshTokens: TokenRefresh,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    "/refresh",
    {
      schema: { body: RefreshRequest, response: { 200: RefreshResponse } },
      config: { rateLimit: REFRESH_RATE_LIMIT },
    },
    (request): RefreshResponse => {
      const result = refreshTokens(request.body.refreshToken);
      if (!result.refreshed) throw invalidRefreshTokenError();
      return result.tokens;
    },
  );
}

function invalidRefreshTokenError(): ApiError {
  return new ApiError(
    401,
    ApiErrorCode.InvalidRefreshToken,
    "This refresh token is unknown, expired or already used; log in again",
  );
}
