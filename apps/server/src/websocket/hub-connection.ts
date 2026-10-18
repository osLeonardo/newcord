import { WebSocketCloseCode } from "@newcord/shared";
import type { HubContext } from "../hub/hub-messenger.js";
import { parseHubRequest, type HubEndpoints } from "../hub/hub-requests.js";
import type { RepeatingTask } from "../repeating-task.js";
import { authenticateHello, type HelloDependencies } from "./hello.js";
import { startHeartbeat } from "./heartbeat.js";
import { closeHubSocket, type IncomingSocket } from "./hub-socket.js";
import type { Presence } from "./presence.js";
import { leaveAndClose } from "./session-sockets.js";

/** A socket must send a valid `hello` within 5 seconds (08-m1-build Settings). */
export const HELLO_DEADLINE_MS = 5000;

export interface HubConnectionDependencies extends HelloDependencies {
  presence: Presence;
  hub: HubEndpoints;
  /** How often each authenticated socket is pinged (D100). */
  heartbeatIntervalMs: number;
}

type ConnectionPhase = "awaiting-hello" | "authenticated" | "closed";

interface HubConnection {
  socket: IncomingSocket;
  phase: ConnectionPhase;
  helloDeadline: NodeJS.Timeout;
  dependencies: HubConnectionDependencies;
  /** Set once `hello` is accepted. */
  context?: HubContext;
  /** Pings the socket from `hello` on, ending it once a ping goes unanswered (D100). */
  heartbeat?: RepeatingTask;
}

/**
 * Runs one `/ws` connection: waits up to 5 seconds for a valid `hello`, then joins presence, pings
 * the socket every 30 seconds and hands every later request Envelope to the hub. A message
 * breaking every schema closes the socket, and so does a ping left unanswered (D100).
 * Example: `app.get("/ws", { websocket: true }, (socket) => openHubConnection(socket, dependencies));`
 */
export function openHubConnection(
  socket: IncomingSocket,
  dependencies: HubConnectionDependencies,
): void {
  const connection: HubConnection = {
    socket,
    phase: "awaiting-hello",
    helloDeadline: setTimeout(
      () => refuseAuthentication(connection),
      HELLO_DEADLINE_MS,
    ),
    dependencies,
  };
  socket.on("message", (data, isBinary) =>
    receiveMessage(connection, isBinary ? undefined : data.toString("utf8")),
  );
  socket.on("close", () => forgetConnection(connection));
}

function receiveMessage(
  connection: HubConnection,
  messageText: string | undefined,
): void {
  if (connection.phase === "awaiting-hello") {
    receiveHello(connection, messageText);
    return;
  }
  if (connection.phase === "authenticated") {
    receiveRequest(connection, messageText);
  }
}

function receiveRequest(
  connection: HubConnection,
  messageText: string | undefined,
): void {
  const envelope =
    messageText === undefined ? undefined : parseHubRequest(messageText);
  if (envelope === undefined || connection.context === undefined) {
    rejectEnvelope(connection);
    return;
  }
  connection.dependencies.hub.received(connection.context, envelope);
}

function receiveHello(
  connection: HubConnection,
  messageText: string | undefined,
): void {
  clearTimeout(connection.helloDeadline);
  const owner =
    messageText === undefined
      ? undefined
      : authenticateHello(messageText, connection.dependencies);
  if (owner === undefined) {
    refuseAuthentication(connection);
    return;
  }
  connection.phase = "authenticated";
  connection.context = { socket: connection.socket, owner };
  connection.heartbeat = startHeartbeat(
    connection.socket,
    connection.dependencies.heartbeatIntervalMs,
  );
  connection.dependencies.presence.join(connection.socket, owner);
  connection.dependencies.hub.opened(connection.context);
}

function refuseAuthentication(connection: HubConnection): void {
  if (connection.phase !== "awaiting-hello") return;
  connection.phase = "closed";
  closeHubSocket(connection.socket, WebSocketCloseCode.AuthenticationFailed);
}

function rejectEnvelope(connection: HubConnection): void {
  connection.phase = "closed";
  leaveAndClose(
    connection.socket,
    WebSocketCloseCode.EnvelopeRejected,
    connection.dependencies.presence,
  );
}

function forgetConnection(connection: HubConnection): void {
  clearTimeout(connection.helloDeadline);
  connection.heartbeat?.stop();
  connection.phase = "closed";
  connection.dependencies.presence.leave(connection.socket);
}
