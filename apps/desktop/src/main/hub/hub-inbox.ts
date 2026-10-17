import type { HubEnvelope } from "../session/live-session";

/** What to do with each type of Envelope; types without a handler are ignored. */
export type HubEnvelopeHandlers = {
  readonly [Type in HubEnvelope["type"]]?: (
    envelope: Extract<HubEnvelope, { type: Type }>,
  ) => void;
};

type AnyHandler = (envelope: HubEnvelope) => void;

/**
 * Creates the inbox that hands each Envelope from the server to its type's handler.
 * @example const receive = createHubInbox({ reply: (reply) => requester.replyReceived(reply) });
 */
export function createHubInbox(
  handlers: HubEnvelopeHandlers,
): (envelope: HubEnvelope) => void {
  const handlerOfType = new Map(
    Object.entries(handlers) as [string, AnyHandler][],
  );
  return (envelope): void => {
    handlerOfType.get(envelope.type)?.(envelope);
  };
}
