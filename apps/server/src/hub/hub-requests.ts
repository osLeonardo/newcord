import { HubRequestEnvelope } from "@newcord/shared";
import { Value } from "typebox/value";
import type { HubContext } from "./hub-messenger.js";

/** Handles one type of request Envelope. */
export type HubRequestHandler<Envelope extends HubRequestEnvelope> = (
  context: HubContext,
  envelope: Envelope,
) => void;

/** One handler for each type of request Envelope. */
export type HubRequestHandlers = {
  [Type in HubRequestEnvelope["type"]]: HubRequestHandler<
    Extract<HubRequestEnvelope, { type: Type }>
  >;
};

/** What the hub does on an authenticated socket. */
export interface HubEndpoints {
  /** Called once `hello` was accepted and presence joined: sends the Device what it should know. */
  opened(context: HubContext): void;
  received(context: HubContext, envelope: HubRequestEnvelope): void;
}

/**
 * Reads a message as a request Envelope, or undefined if it is not JSON or breaks every schema.
 * Example: `const envelope = parseHubRequest(messageText);`
 */
export function parseHubRequest(
  messageText: string,
): HubRequestEnvelope | undefined {
  try {
    const envelope: unknown = JSON.parse(messageText);
    return Value.Check(HubRequestEnvelope, envelope) ? envelope : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Creates the hub's endpoints: the openers run in order after `hello`, and each request goes to its type's handler.
 * Example: `const hub = createHubEndpoints([sendBlockList], { ...groupHandlers, ...blockHandlers });`
 */
export function createHubEndpoints(
  openers: readonly ((context: HubContext) => void)[],
  handlers: HubRequestHandlers,
): HubEndpoints {
  const handlerOfType = new Map<string, HubRequestHandler<HubRequestEnvelope>>(
    Object.entries(handlers) as [
      string,
      HubRequestHandler<HubRequestEnvelope>,
    ][],
  );
  return {
    opened: (context): void => {
      for (const open of openers) open(context);
    },
    received: (context, envelope): void => {
      handlerOfType.get(envelope.type)?.(context, envelope);
    },
  };
}
