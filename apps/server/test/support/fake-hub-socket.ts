import type { HubSocket } from "../../src/websocket/hub-socket.js";
import type { SocketOwner } from "../../src/websocket/socket-registry.js";

export interface SocketClosure {
  code: number;
  reason: string;
}

/** A socket that records what the server sends and how it closes it, for unit tests. */
export interface FakeHubSocket extends HubSocket {
  /** Every Envelope sent so far, parsed from its JSON text. */
  readonly sent: unknown[];
  readonly closures: SocketClosure[];
}

/** Creates a socket that records sent Envelopes and close calls instead of using the network. */
export function createFakeHubSocket(): FakeHubSocket {
  const sent: unknown[] = [];
  const closures: SocketClosure[] = [];
  return {
    sent,
    closures,
    send: (text: string): void => {
      sent.push(JSON.parse(text) as unknown);
    },
    close: (code: number, reason: string): void => {
      closures.push({ code, reason });
    },
  };
}

/** Alice's first Device, for tests of the socket registry and presence. */
export const ALICE_PHONE: SocketOwner = {
  userId: 1,
  deviceId: "alice-phone",
  username: "alice",
};

/** Alice's second Device: same Account, another Device. */
export const ALICE_LAPTOP: SocketOwner = {
  ...ALICE_PHONE,
  deviceId: "alice-laptop",
};

/** Bob's only Device. */
export const BOB_PHONE: SocketOwner = {
  userId: 2,
  deviceId: "bob-phone",
  username: "bob",
};
