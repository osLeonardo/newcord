import {
  ApiErrorCode,
  PasswordRecoveryRequest,
  PasswordRecoveryResponse,
} from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../api-error.js";
import {
  PASSWORD_RECOVERY_RATE_LIMIT,
  createUsernameRateLimit,
} from "../rate-limits.js";
import type { PasswordRecovery } from "./password-recovery.js";

/**
 * Adds `POST /password/recover`, limited per IP address before parsing and per username
 * after validation (D55, D66).
 * Example: `registerPasswordRecoveryRoute(app, createPasswordRecovery(dependencies));`
 */
export function registerPasswordRecoveryRoute(
  app: FastifyInstance,
  recoverPassword: PasswordRecovery,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    "/password/recover",
    {
      schema: {
        body: PasswordRecoveryRequest,
        response: { 200: PasswordRecoveryResponse },
      },
      config: { rateLimit: PASSWORD_RECOVERY_RATE_LIMIT },
      preHandler: createUsernameRateLimit(app, PASSWORD_RECOVERY_RATE_LIMIT),
    },
    async (request): Promise<PasswordRecoveryResponse> => {
      const result = await recoverPassword(request.body);
      if (!result.recovered) throw recoveryRefusedError();
      return result.response;
    },
  );
}

function recoveryRefusedError(): ApiError {
  // One answer for an unknown username and a wrong code, so neither reveals the other.
  return new ApiError(
    401,
    ApiErrorCode.InvalidCredentials,
    "Wrong username or Recovery code",
  );
}
