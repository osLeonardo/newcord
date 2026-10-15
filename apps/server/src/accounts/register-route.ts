import {
  ApiErrorCode,
  RegisterRequest,
  RegisterResponse,
} from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../api-error.js";
import { identityKeyTakenError } from "../devices/identity-key-taken.js";
import { SIGN_UP_RATE_LIMIT } from "../rate-limits.js";
import type { SignUpConflict } from "./account-store.js";
import type { SignUp } from "./sign-up.js";

/**
 * Adds `POST /register`, which creates an Account and its first Device (D55, D59, D60).
 * Example: `registerSignUpRoute(app, createSignUp(dependencies));`
 */
export function registerSignUpRoute(
  app: FastifyInstance,
  signUp: SignUp,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    "/register",
    {
      schema: { body: RegisterRequest, response: { 201: RegisterResponse } },
      config: { rateLimit: SIGN_UP_RATE_LIMIT },
    },
    async (request, reply) => {
      const result = await signUp(request.body);
      if (!result.created) {
        throw signUpConflictError(result.conflict, request.body.username);
      }
      return reply.code(201).send(result.response);
    },
  );
}

function signUpConflictError(
  conflict: SignUpConflict,
  username: string,
): ApiError {
  if (conflict === "username-taken") {
    return new ApiError(
      409,
      ApiErrorCode.UsernameTaken,
      `Username "${username}" is already taken; choose another`,
    );
  }
  return identityKeyTakenError();
}
