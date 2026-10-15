import {
  ServerEnvelope,
  WebSocketCloseCode,
  type RegisterResponse,
} from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fastFakeHasher,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  connectTestClient,
  connectWithHello,
  helloEnvelope,
  logInOnNewDevice,
  presenceChange,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

let server: TestServer;
let alice: RegisterResponse;
let bob: RegisterResponse;
let carol: RegisterResponse;
const clients: TestSocketClient[] = [];

beforeEach(async () => {
  server = await startTestServer({ passwordHasher: fastFakeHasher });
  alice = await signUpAs(server.app, "alice");
  bob = await signUpAs(server.app, "bob");
  carol = await signUpAs(server.app, "carol");
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await server.close();
});

async function online(
  accessToken: string,
): Promise<{ client: TestSocketClient; snapshot: unknown }> {
  const connection = await connectWithHello(server.app, accessToken);
  clients.push(connection.client);
  return connection;
}

async function aliceOnAnotherDevice(): Promise<string> {
  return (await logInOnNewDevice(server.app, "alice")).accessToken;
}

describe("presence snapshot", () => {
  it("lists every online Account by username, sorted, including the socket's own", async () => {
    await online(carol.accessToken);
    await online(alice.accessToken);

    const { snapshot } = await online(bob.accessToken);

    expect(snapshot).toEqual({
      v: 1,
      type: "presence",
      kind: "snapshot",
      usernames: ["alice", "bob", "carol"],
    });
  });

  it("lists an Account once however many Devices it has online", async () => {
    await online(alice.accessToken);
    await online(await aliceOnAnotherDevice());

    const { snapshot } = await online(bob.accessToken);

    expect(snapshot).toMatchObject({ usernames: ["alice", "bob"] });
  });
});

describe("presence changes", () => {
  it("tells every other authenticated socket when an Account's first Device connects", async () => {
    const aliceSocket = (await online(alice.accessToken)).client;
    const carolSocket = (await online(carol.accessToken)).client;
    expect(await aliceSocket.nextEnvelope()).toEqual(
      presenceChange("online", "carol"),
    );

    const bobSocket = (await online(bob.accessToken)).client;

    for (const socket of [aliceSocket, carolSocket]) {
      const envelope = await socket.nextEnvelope();
      expect(envelope).toEqual(presenceChange("online", "bob"));
      expect(Value.Check(ServerEnvelope, envelope)).toBe(true);
    }
    expect(bobSocket.unreadEnvelopes()).toEqual([]);
  });

  it("tells nothing to a socket that has not sent hello yet", async () => {
    const waiting = await connectTestClient(server.app);
    clients.push(waiting);
    await online(bob.accessToken);

    waiting.sendEnvelope(helloEnvelope(alice.accessToken));

    expect(await waiting.nextEnvelope()).toMatchObject({ kind: "snapshot" });
  });

  it("tells the others when an Account's last Device disconnects", async () => {
    const aliceSocket = (await online(alice.accessToken)).client;
    const bobSocket = (await online(bob.accessToken)).client;
    await aliceSocket.nextEnvelope();

    bobSocket.terminate();

    expect(await aliceSocket.nextEnvelope()).toEqual(
      presenceChange("offline", "bob"),
    );
  });

  it("says nothing when a second Device of an online Account connects or disconnects", async () => {
    await online(alice.accessToken);
    const bobSocket = (await online(bob.accessToken)).client;
    const laptop = (await online(await aliceOnAnotherDevice())).client;

    laptop.terminate();
    await laptop.closed;
    await online(carol.accessToken);

    expect(await bobSocket.nextEnvelope()).toEqual(
      presenceChange("online", "carol"),
    );
  });
});

describe("Envelopes after hello", () => {
  type SendMessage = (client: TestSocketClient) => void;

  it.each<[string, SendMessage]>([
    [
      "an unknown type",
      (client): void =>
        client.sendEnvelope({ v: 1, type: "group.create", name: "friends" }),
    ],
    [
      "a second hello",
      (client): void => client.sendEnvelope(helloEnvelope(alice.accessToken)),
    ],
    [
      "a hello with a field not in its schema",
      (client): void =>
        client.sendEnvelope({
          ...helloEnvelope(alice.accessToken),
          deviceId: alice.deviceId,
        }),
    ],
    ["text that is not JSON", (client): void => client.send("{oops")],
  ])(
    "closes the socket with the rejection close code for %s",
    async (_case, sendMessage) => {
      const { client } = await online(alice.accessToken);

      sendMessage(client);

      expect(await client.closed).toMatchObject({
        code: WebSocketCloseCode.EnvelopeRejected,
      });
    },
  );

  it("takes the Account offline at once when its only socket is rejected", async () => {
    const aliceSocket = (await online(alice.accessToken)).client;
    const bobSocket = (await online(bob.accessToken)).client;
    await aliceSocket.nextEnvelope();

    bobSocket.sendEnvelope({ v: 1, type: "group.create", name: "friends" });

    expect(await aliceSocket.nextEnvelope()).toEqual(
      presenceChange("offline", "bob"),
    );
  });
});
