import fastifyJwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type Database from "better-sqlite3";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { createAccountStore } from "./accounts/account-store.js";
import {
  createArgon2idHasher,
  type PasswordHasher,
} from "./accounts/password-hasher.js";
import { registerSignUpRoute } from "./accounts/register-route.js";
import { createSignUp, type SignUp } from "./accounts/sign-up.js";
import { createLoggerOptions, type ServerLogOptions } from "./logging.js";
import { registerHealthRoute } from "./routes/health.js";
import {
  accessTokenPluginOptions,
  createAccessTokenSigner,
} from "./sessions/access-tokens.js";
import { createRefreshTokenStore } from "./sessions/refresh-token-store.js";
import { createSessionTokenIssuer } from "./sessions/session-tokens.js";

/** Largest HTTP request body: 64 KiB (08-m1-build Settings). */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export interface ServerAppOptions {
  jwtSecret: string;
  database: Database.Database;
  log?: ServerLogOptions;
  passwordHasher?: PasswordHasher;
  clock?: () => number;
}

/**
 * Builds the server app with its plugins and routes, without opening a port.
 * Example: `const app = await buildServerApp({ jwtSecret, database, log: { level: "info" } }); await app.listen({ port: 3000 });`
 */
export async function buildServerApp(
  options: ServerAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify(createFastifyOptions(options.log));
  await app.register(websocket);
  await app.register(fastifyJwt, accessTokenPluginOptions(options.jwtSecret));
  await app.register(rateLimit, { global: false });
  registerHealthRoute(app);
  registerSignUpRoute(app, wireSignUp(app, options));
  return app;
}

function createFastifyOptions(
  log: ServerLogOptions | undefined,
): FastifyServerOptions {
  return {
    bodyLimit: MAX_REQUEST_BODY_BYTES,
    logger: log ? createLoggerOptions(log) : false,
    // Fastify's defaults strip unknown fields and coerce types; schemas must reject both.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  };
}

function wireSignUp(app: FastifyInstance, options: ServerAppOptions): SignUp {
  const clock = options.clock ?? ((): number => Date.now());
  const sessionTokens = createSessionTokenIssuer({
    refreshTokenStore: createRefreshTokenStore(options.database),
    accessTokenSigner: createAccessTokenSigner(app.jwt),
    clock,
  });
  return createSignUp({
    database: options.database,
    accountStore: createAccountStore(options.database),
    sessionTokens,
    passwordHasher: options.passwordHasher ?? createArgon2idHasher(),
    clock,
  });
}
