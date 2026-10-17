import {
  PROTOCOL_VERSION,
  type HubErrorCode,
  type ReplyEnvelope,
  type ServerEnvelope,
} from "@newcord/shared";
import { sendEnvelope, type HubSocket } from "../websocket/hub-socket.js";
import type {
  SocketOwner,
  SocketRegistry,
} from "../websocket/socket-registry.js";

/** The socket a request came on and whom it speaks for, as `hello` established. */
export interface HubContext {
  socket: HubSocket;
  owner: SocketOwner;
}

/** A reply's outcome: carried out, with any result fields, or refused with a code. */
export type ReplyOutcome =
  | Omit<Extract<ReplyEnvelope, { ok: true }>, "v" | "type" | "requestId">
  | { ok: false; code: HubErrorCode };

/** Sends Envelopes to connected Devices and Accounts; offline ones get nothing. */
export interface HubMessenger {
  toSocket(socket: HubSocket, envelope: ServerEnvelope): void;
  toDevices(deviceIds: Iterable<string>, envelope: ServerEnvelope): void;
  toAccount(userId: number, envelope: ServerEnvelope): void;
  reply(context: HubContext, requestId: string, outcome: ReplyOutcome): void;
}

/**
 * Creates the messenger on the socket registry.
 * Example: `createHubMessenger(socketRegistry).reply(context, envelope.requestId, { ok: true });`
 */
export function createHubMessenger(
  registry: Pick<SocketRegistry, "socketsOfDevice" | "socketsOfAccount">,
): HubMessenger {
  const sendAll = (sockets: HubSocket[], envelope: ServerEnvelope): void => {
    for (const socket of sockets) sendEnvelope(socket, envelope);
  };
  return {
    toSocket: (socket, envelope): void => {
      sendEnvelope(socket, envelope);
    },
    toDevices: (deviceIds, envelope): void => {
      for (const deviceId of new Set(deviceIds)) {
        sendAll(registry.socketsOfDevice(deviceId), envelope);
      }
    },
    toAccount: (userId, envelope): void => {
      sendAll(registry.socketsOfAccount(userId), envelope);
    },
    reply: (context, requestId, outcome): void => {
      sendEnvelope(context.socket, {
        v: PROTOCOL_VERSION,
        type: "reply",
        requestId,
        ...outcome,
      });
    },
  };
}
