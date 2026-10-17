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
import {
  createCredentialStore,
  type CredentialStore,
} from "./accounts/credential-store.js";
import { createLogin } from "./accounts/login.js";
import { registerLoginRoute } from "./accounts/login-route.js";
import { createPasswordChange } from "./accounts/password-change.js";
import { registerPasswordChangeRoute } from "./accounts/password-change-route.js";
import {
  createArgon2idHasher,
  type PasswordHasher,
} from "./accounts/password-hasher.js";
import { createPasswordRecovery } from "./accounts/password-recovery.js";
import { registerPasswordRecoveryRoute } from "./accounts/password-recovery-route.js";
import { registerSignUpRoute } from "./accounts/register-route.js";
import { createSignUp } from "./accounts/sign-up.js";
import { createDeviceStore, type DeviceStore } from "./devices/device-store.js";
import {
  createInvitationRequestHandlers,
  sendInvitationsOnHello,
} from "./invitations/invitation-requests.js";
import {
  createInvitationStore,
  type InvitationStore,
} from "./invitations/invitation-store.js";
import {
  createKeyDirectory,
  keyDirectoryAudience,
} from "./key-directory/key-directory.js";
import {
  createKeyPackageRequestHandlers,
  sendKeyPackageCountOnHello,
} from "./key-packages/key-package-requests.js";
import { registerKeyPackageRoute } from "./key-packages/key-package-route.js";
import {
  createKeyPackageStore,
  type KeyPackageStore,
} from "./key-packages/key-package-store.js";
import { registerKeyDirectoryRoute } from "./key-directory/key-directory-route.js";
import { createLoggerOptions, type ServerLogOptions } from "./logging.js";
import {
  INVITATION_RATE_LIMIT,
  KEY_PACKAGE_REQUEST_RATE_LIMIT,
  RATE_LIMIT_PLUGIN_OPTIONS,
} from "./rate-limits.js";
import {
  createRequestRateLimit,
  type RequestRateLimit,
} from "./hub/request-rate-limit.js";
import {
  registerRelayCredentialsRoute,
  type RelaySettings,
} from "./relay/relay-credentials.js";
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
import { createCommitAcceptance } from "./commits/commit-acceptance.js";
import { createCommitRequestHandlers } from "./commits/commit-requests.js";
import {
  createMessageQueue,
  type MessageQueue,
} from "./queue/message-queue.js";
import {
  createQueueRequestHandlers,
  replayQueueOnHello,
} from "./queue/queue-requests.js";
import {
  createBlockRequestHandlers,
  sendBlockListOnHello,
} from "./blocks/block-requests.js";
import { createBlockStore, type BlockStore } from "./blocks/block-store.js";
import {
  createGroupPrompter,
  type GroupPrompter,
} from "./groups/group-prompter.js";
import { createGroupRequestHandlers } from "./groups/group-requests.js";
import { createLeaveRequestHandlers } from "./groups/leave-requests.js";
import { createPromptStore } from "./groups/prompt-store.js";
import {
  createQueueCleanup,
  scheduleQueueCleanup,
} from "./queue/queue-cleanup.js";
import { createGroupStore, type GroupStore } from "./groups/group-store.js";
import { createHubMessenger, type HubMessenger } from "./hub/hub-messenger.js";
import { createHubEndpoints, type HubEndpoints } from "./hub/hub-requests.js";
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
  relay: RelaySettings;
  log?: ServerLogOptions;
  passwordHasher?: PasswordHasher;
  clock?: () => number;
  /** Told when a Device's session ends by logout or a reused refresh token (D62), after its sockets close. */
  onDeviceSessionEnded?: DeviceSessionEndedListener;
  /**
   * The proxy whose client-address header is believed, so per-IP rate limits and logs see the real
   * client (14-server-deployment step 5); none in development.
   */
  trustProxy?: string;
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
  relay: RelaySettings;
  clock: () => number;
  passwordHasher: PasswordHasher;
  accountStore: AccountStore;
  credentialStore: CredentialStore;
  deviceStore: DeviceStore;
  groupStore: GroupStore;
  blockStore: BlockStore;
  invitationStore: InvitationStore;
  invitationRateLimit: RequestRateLimit;
  keyPackageStore: KeyPackageStore;
  keyPackageRateLimit: RequestRateLimit;
  messageQueue: MessageQueue;
  messenger: HubMessenger;
  prompter: GroupPrompter;
}

/**
 * Builds the server app with its plugins and routes, without opening a port.
 * Example: `const app = await buildServerApp({ jwtSecret, database, log: { level: "info" } }); await app.listen({ port: 3000 });`
 */
export async function buildServerApp(
  options: ServerAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify(createFastifyOptions(options.log, options.trustProxy));
  await app.register(websocket, WEBSOCKET_PLUGIN_OPTIONS);
  await app.register(fastifyJwt, accessTokenPluginOptions(options.jwtSecret));
  await app.register(rateLimit, RATE_LIMIT_PLUGIN_OPTIONS);
  const parts = createServerParts(app, options);
  registerHealthRoute(app);
  registerAccountRoutes(app, parts);
  registerSessionRoutes(app, parts);
  registerWebSocketRoute(app, { ...parts, hub: createHub(parts) });
  scheduleRefreshTokenCleanup(app, parts);
  scheduleLiveSessionCheck(app, parts);
  scheduleQueueCleanup(
    app,
    createQueueCleanup(parts.database, parts.clock),
    (groupId) => parts.prompter.promptGroup(groupId),
  );
  return app;
}

function createFastifyOptions(
  log: ServerLogOptions | undefined,
  trustProxy: string | undefined,
): FastifyServerOptions {
  return {
    bodyLimit: MAX_REQUEST_BODY_BYTES,
    ...(trustProxy === undefined ? {} : { trustProxy }),
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
  const groupStore = createGroupStore(options.database);
  const liveHub = createLiveHub(groupStore);
  const messenger = createHubMessenger(liveHub.socketRegistry);
  return {
    database: options.database,
    relay: options.relay,
    clock,
    passwordHasher: options.passwordHasher ?? createArgon2idHasher(),
    accountStore: createAccountStore(options.database),
    credentialStore: createCredentialStore(options.database),
    deviceStore: createDeviceStore(options.database),
    groupStore,
    blockStore: createBlockStore(options.database),
    invitationStore: createInvitationStore(options.database),
    invitationRateLimit: createRequestRateLimit(INVITATION_RATE_LIMIT, clock),
    keyPackageStore: createKeyPackageStore(options.database),
    messageQueue: createMessageQueue(options.database),
    keyPackageRateLimit: createRequestRateLimit(
      KEY_PACKAGE_REQUEST_RATE_LIMIT,
      clock,
    ),
    messenger,
    prompter: createGroupPrompter({
      promptStore: createPromptStore(options.database),
      groupStore,
      messenger,
    }),
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
  registerLoginRoute(
    app,
    createLogin({
      ...parts,
      onDeviceCreated: (userId) => parts.prompter.promptAccountGroups(userId),
    }),
  );
  registerPasswordRoutes(app, parts);
  registerKeyPackageRoute(app, {
    ...parts,
    onKeyPackagesUploaded: (userId) =>
      parts.prompter.promptAccountGroups(userId),
  });
  registerRelayCredentialsRoute(app, parts);
  registerKeyDirectoryRoute(app, {
    checkAccessToken: parts.checkAccessToken,
    keyDirectory: createKeyDirectory(
      parts.database,
      keyDirectoryAudience(parts.groupStore, parts.invitationStore),
    ),
  });
}

function registerPasswordRoutes(
  app: FastifyInstance,
  parts: ServerParts,
): void {
  registerPasswordChangeRoute(app, {
    checkAccessToken: parts.checkAccessToken,
    changePassword: createPasswordChange(parts),
  });
  registerPasswordRecoveryRoute(app, createPasswordRecovery(parts));
}

function registerSessionRoutes(app: FastifyInstance, parts: ServerParts): void {
  registerRefreshRoute(app, createTokenRefresh(parts));
  registerLogoutRoute(app, parts);
}

/** The hub's endpoints: what a Device gets after `hello`, and the handler of each request Envelope. */
function createHub(parts: ServerParts): HubEndpoints {
  return createHubEndpoints(
    [
      (context): void => sendBlockListOnHello(parts, context),
      (context): void => sendKeyPackageCountOnHello(parts, context),
      (context): void => sendInvitationsOnHello(parts, context),
      (context): void => replayQueueOnHello(parts, context),
      (context): void => parts.prompter.promptOnHello(context),
    ],
    {
      ...createGroupRequestHandlers({
        ...parts,
        onGroupCreated: (groupId) => parts.prompter.promptGroup(groupId),
      }),
      ...createBlockRequestHandlers(parts),
      ...createInvitationRequestHandlers({
        ...parts,
        onInvitationAccepted: (groupId) => parts.prompter.promptGroup(groupId),
      }),
      ...createLeaveRequestHandlers(parts),
      ...createKeyPackageRequestHandlers(parts),
      ...createQueueRequestHandlers(parts),
      ...createCommitRequestHandlers({
        ...parts,
        acceptCommit: createCommitAcceptance(parts),
      }),
    },
  );
}
