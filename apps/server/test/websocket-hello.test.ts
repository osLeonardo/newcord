import {
  ServerEnvelope,
  WebSocketCloseCode,
  type RegisterResponse,
} from "@newcord/shared";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_JWT_SECRET,
  buildTestJwt,
  fastFakeHasher,
  hmacSignature,
  nowInSeconds,
  signUp,
  startTestServer,
  type TestJwt,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  connectTestClient,
  connectWithHello,
  helloEnvelope,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

const HELLO_DEADLINE_MS = 5000;
const MAX_ENVELOPE_BYTES = 64 * 1024;
const MESSAGE_TOO_BIG = 1009;

let server: TestServer;
let alice: RegisterResponse;
const clients: TestSocketClient[] = [];

beforeEach(async () => {
  server = await startTestServer({ passwordHasher: fastFakeHasher });
  alice = (await signUp(server.app, { username: "alice" })).body;
});

afterEach(async () => {
  vi.useRealTimers();
  for (const client of clients.splice(0)) client.terminate();
  await server.close();
});

async function connect(): Promise<TestSocketClient> {
  const client = await connectTestClient(server.app);
  clients.push(client);
  return client;
}

async function expectAuthenticationFailure(
  client: TestSocketClient,
): Promise<void> {
  expect(await client.closed).toMatchObject({
    code: WebSocketCloseCode.AuthenticationFailed,
  });
  expect(client.unreadEnvelopes()).toEqual([]);
}

describe("GET /ws hello deadline", () => {
  beforeEach(async () => {
    await server.app.ready();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("closes a socket that sends nothing within 5 seconds with the authentication close code", async () => {
    const client = await connect();

    vi.advanceTimersByTime(HELLO_DEADLINE_MS);
    // The injected client completes its close handshake on a timer of its own.
    vi.useRealTimers();

    await expectAuthenticationFailure(client);
  });

  it("accepts a hello sent just before the deadline and leaves the socket open after it", async () => {
    const client = await connect();
    vi.advanceTimersByTime(HELLO_DEADLINE_MS - 1);

    client.sendEnvelope(helloEnvelope(alice.accessToken));
    const snapshot = await client.nextEnvelope();
    vi.advanceTimersByTime(HELLO_DEADLINE_MS * 10);
    const bob = (await signUp(server.app, { username: "bob" })).body;
    clients.push((await connectWithHello(server.app, bob.accessToken)).client);

    expect(snapshot).toMatchObject({ kind: "snapshot" });
    expect(await client.nextEnvelope()).toMatchObject({
      kind: "online",
      username: "bob",
    });
    expect(client.isOpen()).toBe(true);
  });
});

describe("GET /ws with a valid hello", () => {
  it("answers with a presence snapshot listing the online Accounts by username", async () => {
    const { client, snapshot } = await connectWithHello(
      server.app,
      alice.accessToken,
    );
    clients.push(client);

    expect(snapshot).toEqual({
      v: 1,
      type: "presence",
      kind: "snapshot",
      usernames: ["alice"],
    });
    expect(Value.Check(ServerEnvelope, snapshot)).toBe(true);
  });
});

describe("GET /ws with a hello whose token is not valid", () => {
  const claimsFor = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    sub: server.app.jwt.verify<{ sub: string }>(alice.accessToken).sub,
    deviceId: alice.deviceId,
    iat: nowInSeconds(),
    exp: nowInSeconds() + 900,
    ...overrides,
  });

  const tokenWith = (
    alg: string,
    sign: TestJwt["sign"],
    claims: Record<string, unknown> = claimsFor(),
  ): string => buildTestJwt({ header: { alg, typ: "JWT" }, claims, sign });

  async function expectHelloRefused(accessToken: string): Promise<void> {
    const client = await connect();

    client.sendEnvelope(helloEnvelope(accessToken));

    await expectAuthenticationFailure(client);
  }

  it("accepts a hand-built HS256 token, so the refusals below test only what they change", async () => {
    const accessToken = tokenWith("HS256", hmacSignature(TEST_JWT_SECRET));

    const { client, snapshot } = await connectWithHello(
      server.app,
      accessToken,
    );
    clients.push(client);

    expect(snapshot).toMatchObject({ usernames: ["alice"] });
  });

  it("closes the socket with the authentication close code for an expired token", async () => {
    const expired = claimsFor({
      iat: nowInSeconds() - 901,
      exp: nowInSeconds() - 1,
    });

    await expectHelloRefused(
      tokenWith("HS256", hmacSignature(TEST_JWT_SECRET), expired),
    );
  });

  it("closes the socket with the authentication close code for a token signed with another secret", async () => {
    await expectHelloRefused(
      tokenWith("HS256", hmacSignature("another secret, also over 32 bytes")),
    );
  });

  it.each([
    ["HS512", hmacSignature(TEST_JWT_SECRET, "sha512")],
    ["none", (): Buffer => Buffer.alloc(0)],
  ])(
    "closes the socket with the authentication close code for a token signed with %s (D37c)",
    async (alg, sign) => {
      await expectHelloRefused(tokenWith(alg, sign));
    },
  );

  it("closes the socket with the authentication close code for text that is not a JWT", async () => {
    await expectHelloRefused("not-a-jwt");
  });
});

describe("GET /ws with a first message that is not a valid hello", () => {
  it.each([
    ["an unknown type", { v: 1, type: "group.create", name: "friends" }],
    [
      "a field not in the hello schema",
      { v: 1, type: "hello", accessToken: "x", deviceId: "a".repeat(22) },
    ],
    ["another protocol version", { v: 2, type: "hello", accessToken: "x" }],
    [
      "an Envelope only the server sends",
      { v: 1, type: "presence", kind: "snapshot", usernames: [] },
    ],
  ])(
    "closes the socket with the authentication close code for %s",
    async (_case, envelope) => {
      const client = await connect();

      client.sendEnvelope(envelope);

      await expectAuthenticationFailure(client);
    },
  );

  it("closes the socket with the authentication close code for text that is not JSON", async () => {
    const client = await connect();

    client.send("{hello");

    await expectAuthenticationFailure(client);
  });

  it("closes the socket with the authentication close code for a valid hello sent as a binary frame", async () => {
    const client = await connect();

    client.send(Buffer.from(JSON.stringify(helloEnvelope(alice.accessToken))));

    await expectAuthenticationFailure(client);
  });
});

describe("GET /ws message size limit", () => {
  it("closes the socket with Message Too Big for a message over 64 KiB, before the hub reads it", async () => {
    const client = await connect();

    client.send("x".repeat(MAX_ENVELOPE_BYTES + 1));

    expect(await client.closed).toMatchObject({ code: MESSAGE_TOO_BIG });
  });

  it("lets a message of exactly 64 KiB reach the hub, which refuses it as a hello", async () => {
    const client = await connect();

    client.send("x".repeat(MAX_ENVELOPE_BYTES));

    await expectAuthenticationFailure(client);
  });

  it("applies the limit after hello too", async () => {
    const { client } = await connectWithHello(server.app, alice.accessToken);
    clients.push(client);

    client.send("x".repeat(MAX_ENVELOPE_BYTES + 1));

    expect(await client.closed).toMatchObject({ code: MESSAGE_TOO_BIG });
  });
});

describe("GET /ws logging", () => {
  it("never writes the token sent in hello to the log", async () => {
    const lines: string[] = [];
    await server.close();
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      log: {
        level: "trace",
        stream: { write: (line: string): number => lines.push(line) },
      },
    });
    const { body } = await signUp(server.app);
    const forged = `${body.accessToken.slice(0, -4)}AAAA`;

    clients.push((await connectWithHello(server.app, body.accessToken)).client);
    const refused = await connect();
    refused.sendEnvelope(helloEnvelope(forged));
    await refused.closed;

    const output = lines.join("");
    expect(output).toContain("/ws");
    expect(output).not.toContain(body.accessToken);
    expect(output).not.toContain(forged);
  });
});
