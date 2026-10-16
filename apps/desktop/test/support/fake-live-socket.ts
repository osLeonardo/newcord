import type {
  LiveSocket,
  LiveSocketListener,
  LiveSocketOpener,
} from "../../src/main/session/live-socket";

/** One connection opened through the fake opener; the test plays the server's side. */
export interface FakeLiveConnection {
  readonly sent: string[];
  readonly closedByApp: boolean;
  open(): void;
  receive(envelope: object): void;
  closeFromServer(code: number): void;
}

/** A socket opener that records each connection the live session opens. */
export interface FakeSocketOpener {
  readonly open: LiveSocketOpener;
  readonly connections: FakeLiveConnection[];
  latest(): FakeLiveConnection;
}

/** Creates the fake opener; nothing connects until the test calls `open()` on a connection. */
export function createFakeSocketOpener(): FakeSocketOpener {
  const connections: FakeLiveConnection[] = [];
  return {
    connections,
    open: (listener): LiveSocket => {
      const connection = fakeConnection(listener);
      connections.push(connection.view);
      return connection.socket;
    },
    latest: (): FakeLiveConnection => {
      const connection = connections.at(-1);
      if (connection === undefined) throw new Error("no connection opened");
      return connection;
    },
  };
}

function fakeConnection(listener: LiveSocketListener): {
  view: FakeLiveConnection;
  socket: LiveSocket;
} {
  const sent: string[] = [];
  let closedByApp = false;
  const view: FakeLiveConnection = {
    sent,
    get closedByApp(): boolean {
      return closedByApp;
    },
    open: (): void => listener.opened(),
    receive: (envelope): void => listener.received(JSON.stringify(envelope)),
    closeFromServer: (code): void => listener.closed(code),
  };
  const socket: LiveSocket = {
    send: (text): void => {
      sent.push(text);
    },
    close: (): void => {
      closedByApp = true;
      listener.closed(1005);
    },
  };
  return { view, socket };
}
