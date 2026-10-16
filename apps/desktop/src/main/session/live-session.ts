import {
  PROTOCOL_VERSION,
  ServerEnvelope,
  WebSocketCloseCode,
  type HelloEnvelope,
} from "@newcord/shared";
import { Value } from "typebox/value";
import type { LocalStore } from "../local-store/local-store";
import { renewalDelayMs } from "./access-token-expiry";
import type {
  LiveSocket,
  LiveSocketListener,
  LiveSocketOpener,
} from "./live-socket";
import { applyPresence } from "./online-accounts";
import { createRetryBackoff, type RetryBackoff } from "./reconnect-backoff";
import type { CancelTimer, SessionClock } from "./session-clock";
import type { RenewalOutcome, TokenRenewal } from "./token-renewal";

/** What the live session tells the rest of the main process. */
export interface LiveSessionEvents {
  /** The server ended the session; the stored tokens are already deleted. */
  sessionEnded(): void;
  onlineAccountsChanged(usernames: readonly string[]): void;
}

export interface LiveSessionDependencies {
  readonly store: Pick<
    LocalStore,
    "readAccount" | "readSessionTokens" | "deleteSessionTokens"
  >;
  readonly renewal: TokenRenewal;
  readonly openSocket: LiveSocketOpener;
  readonly clock: SessionClock;
  readonly events: LiveSessionEvents;
}

/** Keeps a logged-in Device's session alive: renews its tokens and holds the WebSocket open. */
export interface LiveSession {
  /** Starts renewing and connecting; does nothing while already running. */
  start(): void;
  /** Stops everything and waits for a renewal under way, so the stored tokens are the latest. */
  stop(): Promise<void>;
  /** The other Accounts online now, sorted by username. */
  onlineAccounts(): readonly string[];
  /** Renews the tokens now, as a refused access token asks; ends the session if the server refuses the refresh token. */
  renewAccessToken(): Promise<RenewalOutcome>;
}

interface LiveSessionState {
  running: boolean;
  /** Counts starts, so work begun before a stop never continues after the next start. */
  generation: number;
  socket: LiveSocket | undefined;
  onlineAccounts: readonly string[];
  cancelRenewal: CancelTimer | undefined;
  cancelReconnect: CancelTimer | undefined;
  readonly reconnectBackoff: RetryBackoff;
  readonly renewalBackoff: RetryBackoff;
}

interface Session {
  readonly dependencies: LiveSessionDependencies;
  readonly state: LiveSessionState;
}

/**
 * Creates the live session: the access token is renewed 1 minute before it expires, the WebSocket
 * reconnects with backoff, and the session ends when the server says so (08-m1-build step 9).
 * @example const liveSession = createLiveSession({ store, renewal, openSocket, clock: systemSessionClock, events });
 */
export function createLiveSession(
  dependencies: LiveSessionDependencies,
): LiveSession {
  const session: Session = { dependencies, state: initialState() };
  return {
    start: (): void => start(session),
    stop: (): Promise<void> => stop(session),
    onlineAccounts: (): readonly string[] => session.state.onlineAccounts,
    renewAccessToken: (): Promise<RenewalOutcome> =>
      renewNow(session, session.state.generation),
  };
}

function initialState(): LiveSessionState {
  return {
    running: false,
    generation: 0,
    socket: undefined,
    onlineAccounts: [],
    cancelRenewal: undefined,
    cancelReconnect: undefined,
    reconnectBackoff: createRetryBackoff(),
    renewalBackoff: createRetryBackoff(),
  };
}

function start(session: Session): void {
  if (session.state.running) return;
  session.state.running = true;
  session.state.generation += 1;
  void renewIfDueThenConnect(session, session.state.generation);
}

async function stop(session: Session): Promise<void> {
  halt(session);
  await session.dependencies.renewal.settled();
}

function halt(session: Session): void {
  const { state } = session;
  state.running = false;
  state.cancelRenewal?.();
  state.cancelReconnect?.();
  state.cancelRenewal = undefined;
  state.cancelReconnect = undefined;
  const socket = state.socket;
  state.socket = undefined;
  socket?.close();
  state.reconnectBackoff.reset();
  state.renewalBackoff.reset();
  showOnlineAccounts(session, []);
}

function isCurrentRun(session: Session, generation: number): boolean {
  return session.state.running && session.state.generation === generation;
}

/** A token about to expire is renewed before connecting, so `hello` is not refused for it. */
async function renewIfDueThenConnect(
  session: Session,
  generation: number,
): Promise<void> {
  if (renewalDelay(session) === 0) await renewNow(session, generation);
  else scheduleRenewal(session);
  if (isCurrentRun(session, generation)) connect(session);
}

function renewalDelay(session: Session): number {
  const tokens = session.dependencies.store.readSessionTokens();
  if (tokens === undefined) return 0;
  return renewalDelayMs(tokens.accessToken, session.dependencies.clock.now());
}

function scheduleRenewal(session: Session): void {
  if (session.dependencies.store.readSessionTokens() === undefined) {
    endSession(session);
    return;
  }
  setRenewalTimer(session, renewalDelay(session));
}

function setRenewalTimer(session: Session, delayMs: number): void {
  const generation = session.state.generation;
  session.state.cancelRenewal?.();
  session.state.cancelRenewal = session.dependencies.clock.setTimer(
    () => void renewNow(session, generation),
    delayMs,
  );
}

async function renewNow(
  session: Session,
  generation: number,
): Promise<RenewalOutcome> {
  const outcome = await session.dependencies.renewal.renew();
  if (isCurrentRun(session, generation)) followRenewal(session, outcome);
  return outcome;
}

function followRenewal(session: Session, outcome: RenewalOutcome): void {
  if (outcome === "session-ended") {
    endSession(session);
    return;
  }
  if (outcome === "failed") {
    setRenewalTimer(session, session.state.renewalBackoff.nextDelayMs());
    return;
  }
  session.state.renewalBackoff.reset();
  scheduleRenewal(session);
}

function connect(session: Session): void {
  const { state } = session;
  if (!state.running || state.socket !== undefined) return;
  const opened: { socket?: LiveSocket } = {};
  const isThisSocket = (): boolean =>
    opened.socket !== undefined && state.socket === opened.socket;
  opened.socket = session.dependencies.openSocket(
    socketListener(session, isThisSocket),
  );
  state.socket = opened.socket;
}

function socketListener(
  session: Session,
  isThisSocket: () => boolean,
): LiveSocketListener {
  return {
    opened: (): void => void sendHello(session, isThisSocket),
    received: (text): void => {
      if (isThisSocket()) receiveEnvelope(session, text);
    },
    closed: (code): void => {
      if (isThisSocket()) socketClosed(session, code);
    },
  };
}

/** Waits for a renewal under way, so `hello` carries the newest access token. */
async function sendHello(
  session: Session,
  isThisSocket: () => boolean,
): Promise<void> {
  await session.dependencies.renewal.settled();
  const tokens = session.dependencies.store.readSessionTokens();
  if (!isThisSocket() || tokens === undefined) return;
  const hello: HelloEnvelope = {
    v: PROTOCOL_VERSION,
    type: "hello",
    accessToken: tokens.accessToken,
  };
  session.state.socket?.send(JSON.stringify(hello));
}

function receiveEnvelope(session: Session, text: string): void {
  const envelope = parseServerEnvelope(text);
  // M2's other Envelopes are handled by #6; the live session follows presence only.
  if (envelope?.type !== "presence") return;
  // The snapshot is the server's answer to a valid `hello`.
  if (envelope.kind === "snapshot") session.state.reconnectBackoff.reset();
  const ownUsername = session.dependencies.store.readAccount()?.username ?? "";
  showOnlineAccounts(
    session,
    applyPresence(session.state.onlineAccounts, envelope, ownUsername),
  );
}

function parseServerEnvelope(text: string): ServerEnvelope | undefined {
  try {
    const envelope: unknown = JSON.parse(text);
    return Value.Check(ServerEnvelope, envelope) ? envelope : undefined;
  } catch {
    return undefined;
  }
}

function socketClosed(session: Session, code: number): void {
  session.state.socket = undefined;
  showOnlineAccounts(session, []);
  if (code === WebSocketCloseCode.SessionEnded) {
    endSession(session);
    return;
  }
  if (code === WebSocketCloseCode.AuthenticationFailed) {
    void renewThenReconnect(session);
    return;
  }
  scheduleReconnect(session);
}

/** A refused `hello` usually means the access token expired: renew it rather than log out. */
async function renewThenReconnect(session: Session): Promise<void> {
  const generation = session.state.generation;
  const outcome = await renewNow(session, generation);
  if (outcome !== "session-ended" && isCurrentRun(session, generation)) {
    scheduleReconnect(session);
  }
}

function scheduleReconnect(session: Session): void {
  const { state } = session;
  state.cancelReconnect?.();
  state.cancelReconnect = session.dependencies.clock.setTimer(() => {
    state.cancelReconnect = undefined;
    connect(session);
  }, state.reconnectBackoff.nextDelayMs());
}

function endSession(session: Session): void {
  if (!session.state.running) return;
  halt(session);
  session.dependencies.store.deleteSessionTokens();
  session.dependencies.events.sessionEnded();
}

function showOnlineAccounts(
  session: Session,
  usernames: readonly string[],
): void {
  const shown = session.state.onlineAccounts;
  if (
    shown.length === usernames.length &&
    shown.every((name, index) => name === usernames.at(index))
  ) {
    return;
  }
  session.state.onlineAccounts = usernames;
  session.dependencies.events.onlineAccountsChanged(usernames);
}
