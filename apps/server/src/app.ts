import fastifyJwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type Database from "better-sqlite3";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type onRequestHookHandler,
} from "fastify";
import {
  createAccountStore,
  type AccountStore,
} from "./accounts/account-store.js";
import { createLogin } from "./accounts/login.js";
import { registerLoginRoute } from "./accounts/login-route.js";
import {
  createArgon2idHasher,
  type PasswordHasher,
} from "./accounts/password-hasher.js";
import { registerSignUpRoute } from "./accounts/register-route.js";
import { createSignUp } from "./accounts/sign-up.js";
import { createDeviceStore, type DeviceStore } from "./devices/device-store.js";
import { createKeyDirectory } from "./key-directory/key-directory.js";
import { registerKeyDirectoryRoute } from "./key-directory/key-directory-route.js";
import { createLoggerOptions, type ServerLogOptions } from "./logging.js";
import { RATE_LIMIT_PLUGIN_OPTIONS } from "./rate-limits.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerAccessTokenCheck } from "./sessions/access-token-check.js";
import {
  accessTokenPluginOptions,
  createAccessTokenSigner,
  createAccessTokenVerifier,
  type AccessTokenVerifier,
} from "./sessions/access-tokens.js";
import {
  createDeviceLogout,
  type DeviceLogout,
  type DeviceSessionEndedListener,
} from "./sessions/device-logout.js";
import { registerLogoutRoute } from "./sessions/logout-route.js";
import { scheduleRefreshTokenCleanup } from "./sessions/refresh-token-cleanup.js";
import {
  createRefreshTokenStore,
  type RefreshTokenStore,
} from "./sessions/refresh-token-store.js";
import { registerRefreshRoute } from "./sessions/refresh-route.js";
import {
  createSessionTokenIssuer,
  type SessionTokenIssuer,
} from "./sessions/session-tokens.js";
import { createTokenRefresh } from "./sessions/token-refresh.js";
import { createLiveHub, type LiveHub } from "./websocket/live-hub.js";
import { scheduleLiveSessionCheck } from "./websocket/session-check.js";
import {
  closeSocketsWhenSessionEnds,
  type SessionSockets,
} from "./websocket/session-sockets.js";
import {
  WEBSOCKET_PLUGIN_OPTIONS,
  registerWebSocketRoute,
} from "./websocket/websocket-route.js";

/** Largest HTTP request body: 64 KiB (08-m1-build Settings). */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export interface ServerAppOptions {
  jwtSecret: string;
  database: Database.Database;
  log?: ServerLogOptions;
  passwordHasher?: PasswordHasher;
  clock?: () => number;
  /** Told when a Device's session ends by logout or a reused refresh token (D62), after its sockets close. */
  onDeviceSessionEnded?: DeviceSessionEndedListener;
}

/** The session services the routes share; the WebSocket's `hello` reuses the verifier. */
interface SessionParts {
  refreshTokenStore: RefreshTokenStore;
  sessionTokens: SessionTokenIssuer;
  accessTokenVerifier: AccessTokenVerifier;
  /** The one `onRequest` hook every authenticated route uses; it decorates requests, so build it once. */
  checkAccessToken: onRequestHookHandler;
  logOutDevice: DeviceLogout;
}

/** The stores and services the routes share, built once per app. */
interface ServerParts extends SessionParts, LiveHub {
  database: Database.Database;
  clock: () => number;
  passwordHasher: PasswordHasher;
  accountStore: AccountStore;
  deviceStore: DeviceStore;
}

/**
 * Builds the server app with its plugins and routes, without opening a port.
 * Example: `const app = await buildServerApp({ jwtSecret, database, log: { level: "info" } }); await app.listen({ port: 3000 });`
 */
export async function buildServerApp(
  options: ServerAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify(createFastifyOptions(options.log));
  await app.register(websocket, WEBSOCKET_PLUGIN_OPTIONS);
  await app.register(fastifyJwt, accessTokenPluginOptions(options.jwtSecret));
  await app.register(rateLimit, RATE_LIMIT_PLUGIN_OPTIONS);
  const parts = createServerParts(app, options);
  registerHealthRoute(app);
  registerAccountRoutes(app, parts);
  registerSessionRoutes(app, parts);
  registerWebSocketRoute(app, parts);
  scheduleRefreshTokenCleanup(app, parts);
  scheduleLiveSessionCheck(app, parts);
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

function createServerParts(
  app: FastifyInstance,
  options: ServerAppOptions,
): ServerParts {
  const clock = options.clock ?? ((): number => Date.now());
  const liveHub = createLiveHub();
  return {
    database: options.database,
    clock,
    passwordHasher: options.passwordHasher ?? createArgon2idHasher(),
    accountStore: createAccountStore(options.database),
    deviceStore: createDeviceStore(options.database),
    ...liveHub,
    ...createSessionParts(app, options, clock, liveHub.sessionSockets),
  };
}

function createSessionParts(
  app: FastifyInstance,
  options: ServerAppOptions,
  clock: () => number,
  sessionSockets: SessionSockets,
): SessionParts {
  const refreshTokenStore = createRefreshTokenStore(options.database);
  const accessTokenSigner = createAccessTokenSigner(app.jwt);
  const accessTokenVerifier = createAccessTokenVerifier(app.jwt);
  return {
    refreshTokenStore,
    sessionTokens: createSessionTokenIssuer({
      refreshTokenStore,
      accessTokenSigner,
      clock,
    }),
    accessTokenVerifier,
    checkAccessToken: registerAccessTokenCheck(app, accessTokenVerifier),
    logOutDevice: createDeviceLogout({
      refreshTokenStore,
      onDeviceSessionEnded: closeSocketsWhenSessionEnds(
        sessionSockets,
        options.onDeviceSessionEnded,
      ),
    }),
  };
}

function registerAccountRoutes(app: FastifyInstance, parts: ServerParts): void {
  registerSignUpRoute(app, createSignUp(parts));
  registerLoginRoute(app, createLogin(parts));
  registerKeyDirectoryRoute(app, {
    checkAccessToken: parts.checkAccessToken,
    keyDirectory: createKeyDirectory(parts.database),
  });
}

function registerSessionRoutes(app: FastifyInstance, parts: ServerParts): void {
  registerRefreshRoute(app, createTokenRefresh(parts));
  registerLogoutRoute(app, parts);
}
