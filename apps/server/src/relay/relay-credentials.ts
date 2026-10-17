import { createHmac } from "node:crypto";
import {
  RELAY_CREDENTIAL_LIFETIME_SECONDS,
  RelayCredentialsResponse,
} from "@newcord/shared";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance, onRequestHookHandler } from "fastify";
import { authenticatedSubject } from "../sessions/access-token-check.js";

/** The relay as the server knows it: the secret shared with coturn and the addresses Devices use. */
export interface RelaySettings {
  secret: string;
  urls: readonly string[];
}

export interface RelayCredentialsRouteDependencies {
  checkAccessToken: onRequestHookHandler;
  relay: RelaySettings;
  clock: () => number;
}

/**
 * A Device's relay credentials in coturn's `use-auth-secret` format, valid for 1 hour from `now`.
 * Example: `relayCredentials(relay, deviceId, Date.now()).username // "1760620000:AAAA..."`
 */
export function relayCredentials(
  relay: RelaySettings,
  deviceId: string,
  now: number,
): RelayCredentialsResponse {
  const expiresAt = Math.floor(now / 1000) + RELAY_CREDENTIAL_LIFETIME_SECONDS;
  const username = `${expiresAt}:${deviceId}`;
  return {
    urls: [...relay.urls],
    username,
    password: createHmac("sha1", relay.secret)
      .update(username)
      .digest("base64"),
    lifetimeSeconds: RELAY_CREDENTIAL_LIFETIME_SECONDS,
  };
}

/**
 * Adds `GET /relay/credentials` for logged-in Devices only (D23).
 * Example: `registerRelayCredentialsRoute(app, { checkAccessToken, relay, clock });`
 */
export function registerRelayCredentialsRoute(
  app: FastifyInstance,
  dependencies: RelayCredentialsRouteDependencies,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    "/relay/credentials",
    {
      schema: { response: { 200: RelayCredentialsResponse } },
      onRequest: dependencies.checkAccessToken,
    },
    (request): RelayCredentialsResponse =>
      relayCredentials(
        dependencies.relay,
        authenticatedSubject(request).deviceId,
        dependencies.clock(),
      ),
  );
}
