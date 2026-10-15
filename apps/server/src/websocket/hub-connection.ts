import { WebSocketCloseCode } from "@newcord/shared";
import { authenticateHello, type HelloDependencies } from "./hello.js";
import { closeHubSocket, type IncomingSocket } from "./hub-socket.js";
import type { Presence } from "./presence.js";
import { leaveAndClose } from "./session-sockets.js";

/** A socket must send a valid `hello` within 5 seconds (08-m1-build Settings). */
export const HELLO_DEADLINE_MS = 5000;

export interface HubConnectionDependencies extends HelloDependencies {
  presence: Presence;
}

type ConnectionPhase = "awaiting-hello" | "authenticated" | "closed";

interface HubConnection {
  socket: IncomingSocket;
  phase: ConnectionPhase;
  helloDeadline: NodeJS.Timeout;
  dependencies: HubConnectionDependencies;
}

/**
 * Runs one `/ws` connection: waits up to 5 seconds for a valid `hello`, then joins presence.
 * M1 clients send nothing after `hello`, so any later message is rejected.
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
  if (connection.phase === "authenticated") rejectEnvelope(connection);
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
  connection.dependencies.presence.join(connection.socket, owner);
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
  connection.phase = "closed";
  connection.dependencies.presence.leave(connection.socket);
}
