import { ApiErrorCode, LoginRequest, LoginResponse } from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../api-error.js";
import { identityKeyTakenError } from "../devices/identity-key-taken.js";
import { LOGIN_RATE_LIMIT, createUsernameRateLimit } from "../rate-limits.js";
import type { Login, LoginRefusal } from "./login.js";

/**
 * Adds `POST /login`, limited per IP address before parsing and per username after validation.
 * Example: `registerLoginRoute(app, createLogin(dependencies));`
 */
export function registerLoginRoute(app: FastifyInstance, login: Login): void {
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    "/login",
    {
      schema: { body: LoginRequest, response: { 200: LoginResponse } },
      config: { rateLimit: LOGIN_RATE_LIMIT },
      preHandler: createUsernameRateLimit(app, LOGIN_RATE_LIMIT),
    },
    async (request): Promise<LoginResponse> => {
      const result = await login(request.body);
      if (!result.loggedIn) throw loginRefusalError(result.refusal);
      return result.response;
    },
  );
}

function loginRefusalError(refusal: LoginRefusal): ApiError {
  if (refusal === "identity-key-taken") return identityKeyTakenError();
  // One answer for an unknown username and a wrong password, so neither reveals the other.
  return new ApiError(
    401,
    ApiErrorCode.InvalidCredentials,
    "Wrong username or password",
  );
}
