import {
  PROTOCOL_VERSION,
  type LoginResponse,
  type PresenceChangeEnvelope,
  type RegisterResponse,
} from "@newcord/shared";
import type { FastifyInstance } from "fastify";
import type { SocketClosure } from "./fake-hub-socket.js";
import { createIdentityKey, login, signUp } from "./server-test-kit.js";

/** The password every Account in the WebSocket tests signs up with. */
export const SOCKET_TEST_PASSWORD = "correct horse battery staple";

/** Signs `username` up through `POST /register` and returns the `201` body. */
export async function signUpAs(
  app: FastifyInstance,
  username: string,
): Promise<RegisterResponse> {
  const { body } = await signUp(app, {
    username,
    password: SOCKET_TEST_PASSWORD,
  });
  return body;
}

/** Logs `username` in with a fresh identity key, which adds a new Device to the Account (D59). */
export async function logInOnNewDevice(
  app: FastifyInstance,
  username: string,
): Promise<LoginResponse> {
  const response = await login(app, {
    username,
    password: SOCKET_TEST_PASSWORD,
    identityKey: createIdentityKey(),
  });
  return response.json<LoginResponse>();
}

/** The presence Envelope the server sends when `username` comes online or goes offline. */
export function presenceChange(
  kind: PresenceChangeEnvelope["kind"],
  username: string,
): PresenceChangeEnvelope {
  return { v: PROTOCOL_VERSION, type: "presence", kind, username };
}

/**
 * What the tests use of the `ws` client that `injectWS` creates. Without `@types/ws`,
 * @fastify/websocket types that client as `any`, so this interface names its shape.
 */
interface RawTestClient {
  on(
    event: "message",
    listener: (data: Buffer, isBinary: boolean) => void,
  ): unknown;
  on(event: "close", listener: (code: number, reason: Buffer) => void): unknown;
  send(data: string | Buffer): void;
  terminate(): void;
  readonly readyState: number;
}

const WEBSOCKET_OPEN = 1;

/** A WebSocket client connected to the app's `/ws` without opening a port. */
export interface TestSocketClient {
  send(message: string | Buffer): void;
  sendEnvelope(envelope: object): void;
  /** Resolves with the oldest Envelope not read yet, waiting for one if none has arrived. */
  nextEnvelope(): Promise<unknown>;
  /** The Envelopes that arrived and were not read with `nextEnvelope` yet. */
  unreadEnvelopes(): unknown[];
  /** Resolves once the connection closes, with the close code and reason. */
  readonly closed: Promise<SocketClosure>;
  isOpen(): boolean;
  terminate(): void;
}

interface EnvelopeInbox {
  push: (envelope: unknown) => void;
  next: () => Promise<unknown>;
  unread: () => unknown[];
}

/** Opens a WebSocket to `/ws` through `injectWS`, listening before the connection opens. */
export async function connectTestClient(
  app: FastifyInstance,
): Promise<TestSocketClient> {
  await app.ready();
  let client: TestSocketClient | undefined;
  await app.injectWS(
    "/ws",
    {},
    {
      onInit: (raw: RawTestClient): void => {
        client = watchTestClient(raw);
      },
    },
  );
  if (client === undefined) {
    throw new Error("injectWS opened /ws without calling onInit");
  }
  return client;
}

/** A `hello` Envelope carrying `accessToken`. */
export function helloEnvelope(accessToken: string): object {
  return { v: PROTOCOL_VERSION, type: "hello", accessToken };
}

/** What every Device receives right after an accepted `hello`, in this order. */
export interface HelloAnswer {
  client: TestSocketClient;
  snapshot: unknown;
  blockList: unknown;
}

/** Connects, sends `hello` with `accessToken` and reads the presence snapshot and block list that answer it. */
export async function connectWithHello(
  app: FastifyInstance,
  accessToken: string,
): Promise<HelloAnswer> {
  const client = await connectTestClient(app);
  client.sendEnvelope(helloEnvelope(accessToken));
  const snapshot = await client.nextEnvelope();
  return { client, snapshot, blockList: await client.nextEnvelope() };
}

function watchTestClient(raw: RawTestClient): TestSocketClient {
  const inbox = createEnvelopeInbox();
  raw.on("message", (data) => inbox.push(JSON.parse(data.toString())));
  const closed = new Promise<SocketClosure>((resolve) => {
    raw.on("close", (code, reason) =>
      resolve({ code, reason: reason.toString() }),
    );
  });
  return {
    send: (message): void => raw.send(message),
    sendEnvelope: (envelope): void => raw.send(JSON.stringify(envelope)),
    nextEnvelope: inbox.next,
    unreadEnvelopes: inbox.unread,
    closed,
    isOpen: (): boolean => raw.readyState === WEBSOCKET_OPEN,
    terminate: (): void => raw.terminate(),
  };
}

function createEnvelopeInbox(): EnvelopeInbox {
  const unread: unknown[] = [];
  const readers: ((envelope: unknown) => void)[] = [];
  return {
    push: (envelope: unknown): void => {
      const reader = readers.shift();
      if (reader === undefined) unread.push(envelope);
      else reader(envelope);
    },
    next: (): Promise<unknown> => {
      if (unread.length > 0) return Promise.resolve(unread.shift());
      return new Promise((resolve) => readers.push(resolve));
    },
    unread: (): unknown[] => [...unread],
  };
}
