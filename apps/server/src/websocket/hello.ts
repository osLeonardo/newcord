import { HelloEnvelope } from "@newcord/shared";
import { Value } from "typebox/value";
import type { AccountStore } from "../accounts/account-store.js";
import type { AccessTokenVerifier } from "../sessions/access-tokens.js";
import type { SocketOwner } from "./socket-registry.js";

export interface HelloDependencies {
  accessTokenVerifier: AccessTokenVerifier;
  accountStore: Pick<AccountStore, "usernameOf">;
}

/**
 * Reads a socket's first message as a `hello` Envelope and checks its access token (HS256 only).
 * Returns whom the socket speaks for, or undefined for anything else; the token is never logged.
 * Example: `const owner = authenticateHello(messageText, { accessTokenVerifier, accountStore });`
 */
export function authenticateHello(
  messageText: string,
  dependencies: HelloDependencies,
): SocketOwner | undefined {
  const envelope = parseEnvelopeText(messageText);
  if (!Value.Check(HelloEnvelope, envelope)) return undefined;
  const subject = dependencies.accessTokenVerifier.verify(envelope.accessToken);
  if (subject === undefined) return undefined;
  const username = dependencies.accountStore.usernameOf(subject.userId);
  if (username === undefined) return undefined;
  return { userId: subject.userId, deviceId: subject.deviceId, username };
}

function parseEnvelopeText(messageText: string): unknown {
  try {
    return JSON.parse(messageText);
  } catch {
    return undefined;
  }
}
