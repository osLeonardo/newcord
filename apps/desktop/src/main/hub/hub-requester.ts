import { randomBytes } from "node:crypto";
import {
  PROTOCOL_VERSION,
  type AckEnvelope,
  type HubErrorCode,
  type HubRequestEnvelope,
  type ReplyDoneEnvelope,
  type ReplyEnvelope,
} from "@newcord/shared";
import type { CancelTimer, SessionClock } from "../session/session-clock";

type DistributiveOmit<Type, Key extends PropertyKey> = Type extends unknown
  ? Omit<Type, Key>
  : never;

/** A request Envelope without the fields the requester fills in. */
export type HubRequest = DistributiveOmit<
  Exclude<HubRequestEnvelope, AckEnvelope>,
  "v" | "requestId"
>;

/** Why a request got no answer from the server. */
export type HubTransportFailure =
  "NOT_CONNECTED" | "CONNECTION_LOST" | "TIMED_OUT";

/** The results of a request the server carried out. */
export type HubDone = Omit<ReplyDoneEnvelope, "v" | "type" | "requestId">;

/** The server's answer to a request, or why none came. */
export type HubOutcome =
  | HubDone
  | { readonly ok: false; readonly code: HubErrorCode | HubTransportFailure };

/** A request waits this long for its reply before it counts as lost. */
export const HUB_REQUEST_TIMEOUT_MS = 30 * 1000;

export interface HubRequesterDependencies {
  readonly send: (envelope: object) => boolean;
  readonly clock: Pick<SessionClock, "setTimer">;
  readonly newRequestId?: () => string;
}

/** Sends request Envelopes and matches the server's replies to them. */
export interface HubRequester {
  request(request: HubRequest): Promise<HubOutcome>;
  replyReceived(reply: ReplyEnvelope): void;
  /** Answers every request still waiting: their replies can no longer come. */
  connectionLost(): void;
}

interface WaitingRequest {
  readonly settle: (outcome: HubOutcome) => void;
  readonly cancelTimeout: CancelTimer;
}

/**
 * Creates the requester on the live session's connection.
 * @example const outcome = await requester.request({ type: "group.create", groupId, name });
 */
export function createHubRequester(
  dependencies: HubRequesterDependencies,
): HubRequester {
  const waiting = new Map<string, WaitingRequest>();
  const newRequestId =
    dependencies.newRequestId ??
    ((): string => randomBytes(12).toString("base64url"));
  const settle = (requestId: string, outcome: HubOutcome): void => {
    const request = waiting.get(requestId);
    if (request === undefined) return;
    waiting.delete(requestId);
    request.cancelTimeout();
    request.settle(outcome);
  };
  return {
    request: (request): Promise<HubOutcome> => {
      const requestId = newRequestId();
      return new Promise((resolve) => {
        const cancelTimeout = dependencies.clock.setTimer(() => {
          settle(requestId, { ok: false, code: "TIMED_OUT" });
        }, HUB_REQUEST_TIMEOUT_MS);
        waiting.set(requestId, { settle: resolve, cancelTimeout });
        const envelope = { v: PROTOCOL_VERSION, requestId, ...request };
        if (!dependencies.send(envelope)) {
          settle(requestId, { ok: false, code: "NOT_CONNECTED" });
        }
      });
    },
    replyReceived: (reply): void => {
      settle(reply.requestId, outcomeOf(reply));
    },
    connectionLost: (): void => {
      for (const requestId of [...waiting.keys()]) {
        settle(requestId, { ok: false, code: "CONNECTION_LOST" });
      }
    },
  };
}

function outcomeOf(reply: ReplyEnvelope): HubOutcome {
  if (!reply.ok) return { ok: false, code: reply.code };
  const done: { -readonly [Field in keyof HubDone]: HubDone[Field] } = {
    ok: true,
  };
  if (reply.keyPackages !== undefined) done.keyPackages = reply.keyPackages;
  if (reply.seq !== undefined) done.seq = reply.seq;
  if (reply.epoch !== undefined) done.epoch = reply.epoch;
  return done;
}
