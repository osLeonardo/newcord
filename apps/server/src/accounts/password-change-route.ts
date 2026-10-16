import { PasswordChangeRequest } from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type {
  FastifyInstance,
  FastifyReply,
  onRequestHookHandler,
} from "fastify";
import {
  PASSWORD_CHANGE_RATE_LIMIT,
  createAccountRateLimit,
} from "../rate-limits.js";
import { authenticatedSubject } from "../sessions/access-token-check.js";
import type { PasswordChange } from "./password-change.js";

export interface PasswordChangeRouteDependencies {
  checkAccessToken: onRequestHookHandler;
  changePassword: PasswordChange;
}

/**
 * Adds `POST /password/change` for logged-in Devices, each Account limited to 5 changes per
 * hour (D55, D66). The limit runs before validation, so every authenticated attempt counts.
 * Example: `registerPasswordChangeRoute(app, { checkAccessToken, changePassword: createPasswordChange(dependencies) });`
 */
export function registerPasswordChangeRoute(
  app: FastifyInstance,
  dependencies: PasswordChangeRouteDependencies,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    "/password/change",
    {
      schema: { body: PasswordChangeRequest },
      onRequest: [
        dependencies.checkAccessToken,
        createAccountRateLimit(app, PASSWORD_CHANGE_RATE_LIMIT),
      ],
    },
    async (request, reply): Promise<FastifyReply> => {
      await dependencies.changePassword(
        authenticatedSubject(request),
        request.body.newPassword,
      );
      return reply.code(204).send();
    },
  );
}
