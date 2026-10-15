import {
  ApiErrorCode,
  KeyDirectoryParams,
  KeyDirectoryResponse,
} from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance, onRequestHookHandler } from "fastify";
import { ApiError } from "../api-error.js";
import {
  KEY_DIRECTORY_RATE_LIMIT,
  createAccountRateLimit,
} from "../rate-limits.js";
import type { KeyDirectory } from "./key-directory.js";

export interface KeyDirectoryRouteDependencies {
  checkAccessToken: onRequestHookHandler;
  keyDirectory: KeyDirectory;
}

/**
 * Adds `GET /users/:username/keys`, the Key directory: logged-in Accounts only, each limited
 * to 60 lookups per minute (D64). The limit runs before validation, so every lookup counts.
 * Example: `registerKeyDirectoryRoute(app, { checkAccessToken, keyDirectory: createKeyDirectory(database) });`
 */
export function registerKeyDirectoryRoute(
  app: FastifyInstance,
  dependencies: KeyDirectoryRouteDependencies,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    "/users/:username/keys",
    {
      schema: {
        params: KeyDirectoryParams,
        response: { 200: KeyDirectoryResponse },
      },
      onRequest: [
        dependencies.checkAccessToken,
        createAccountRateLimit(app, KEY_DIRECTORY_RATE_LIMIT),
      ],
    },
    (request): KeyDirectoryResponse =>
      identityKeysResponse(dependencies.keyDirectory, request.params.username),
  );
}

function identityKeysResponse(
  keyDirectory: KeyDirectory,
  username: string,
): KeyDirectoryResponse {
  const identityKeys = keyDirectory.identityKeysOf(username);
  if (identityKeys === undefined) throw accountNotFoundError(username);
  return {
    identityKeys: identityKeys.map((key) => key.toString("base64")),
  };
}

function accountNotFoundError(username: string): ApiError {
  return new ApiError(
    404,
    ApiErrorCode.AccountNotFound,
    `No Account has the username "${username}"`,
  );
}
