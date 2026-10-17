import { generateKeyPairSync, randomBytes } from "node:crypto";
import { CHAT_TEXT_MAX_LENGTH } from "@newcord/shared";
import { MlsDevice } from "@newcord/mls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ENVELOPE_BYTES } from "../src/websocket/websocket-route.js";
import { replyTo, sendRequest } from "./support/hub-request-kit.js";
import {
  fastFakeHasher,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";
import {
  connectWithHello,
  signUpAs,
  type TestSocketClient,
} from "./support/websocket-test-client.js";

/** The largest M2 Group: 10 people, each on 2 Devices (#5's spec). */
const PEOPLE = 10;
const DEVICES_EACH = 2;

interface BuiltDevice {
  readonly device: MlsDevice;
  readonly deviceId: string;
}

function realDevice(username: string): BuiltDevice {
  const jwk = generateKeyPairSync("ed25519").privateKey.export({
    format: "jwk",
  });
  const device = new MlsDevice();
  const deviceId = randomBytes(16).toString("base64url");
  device.initIdentity(
    Buffer.from(jwk.d ?? "", "base64url"),
    Buffer.from(jwk.x ?? "", "base64url"),
    username,
    deviceId,
  );
  return { device, deviceId };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** The Envelope's size as the desktop app sends it: JSON text in UTF-8. */
function sizeOf(envelope: object): number {
  return Buffer.byteLength(JSON.stringify(envelope));
}

let server: TestServer;
let client: TestSocketClient;
let groupId: string;
let commitEnvelope: object;
let messageEnvelope: object;

beforeAll(async () => {
  const devices = Array.from({ length: PEOPLE * DEVICES_EACH }, (_, index) =>
    realDevice(`person_${Math.floor(index / DEVICES_EACH)}`),
  );
  const [creator, ...others] = devices;
  if (creator === undefined) throw new Error("no creator");
  const groupIdBytes = new Uint8Array(randomBytes(16));
  groupId = Buffer.from(groupIdBytes).toString("base64url");
  creator.device.createGroup(groupIdBytes);
  const keyPackages = others.flatMap(({ device }) =>
    device.createKeyPackages(1, false),
  );
  const own = creator.device.addMembers(groupIdBytes, keyPackages);
  creator.device.mergePendingCommit(groupIdBytes);
  commitEnvelope = {
    v: 1,
    type: "mls.commit",
    groupId,
    epoch: 0,
    added: others.map(({ deviceId }) => deviceId),
    removed: [],
    commit: base64(own.commit),
    welcome: base64(own.welcome ?? new Uint8Array()),
  };
  // The longest Chat message in the most bytes: 4,000 characters of three bytes each in UTF-8.
  const payload = {
    type: "chat.text",
    id: randomBytes(16).toString("base64url"),
    text: "€".repeat(CHAT_TEXT_MAX_LENGTH),
    sentAt: Date.now(),
  };
  const message = creator.device.encrypt(
    groupIdBytes,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  messageEnvelope = {
    v: 1,
    type: "mls.message",
    groupId,
    message: base64(message),
  };

  server = await startTestServer({ passwordHasher: fastFakeHasher });
  const alice = await signUpAs(server.app, "alice");
  ({ client } = await connectWithHello(server.app, alice.accessToken));
  await replyTo(
    client,
    sendRequest(client, { type: "group.create", groupId, name: "big" }),
  );
}, 60_000);

afterAll(async () => {
  client.terminate();
  await server.close();
});

describe("real MLS messages against the 64 KiB Envelope limit (#5, Step 06)", () => {
  it("fit the commit and welcome adding 19 Devices, for 10 people on 2 Devices each", () => {
    const size = sizeOf({ ...commitEnvelope, requestId: "r-measured" });

    console.info(
      `mls.commit with welcome for ${PEOPLE * DEVICES_EACH} Devices: ${size} bytes of ${MAX_ENVELOPE_BYTES}`,
    );
    expect(size).toBeLessThan(MAX_ENVELOPE_BYTES);
  });

  it("fit the largest Chat message", () => {
    const size = sizeOf({ ...messageEnvelope, requestId: "r-measured" });

    console.info(
      `mls.message with ${CHAT_TEXT_MAX_LENGTH} three-byte characters: ${size} bytes of ${MAX_ENVELOPE_BYTES}`,
    );
    expect(size).toBeLessThan(MAX_ENVELOPE_BYTES);
  });

  it("pass through the server's WebSocket limit and get an answer", async () => {
    for (const envelope of [commitEnvelope, messageEnvelope]) {
      const { reply } = await replyTo(client, sendRequest(client, envelope));

      expect(reply).toMatchObject({ type: "reply" });
      expect(client.isOpen()).toBe(true);
    }
  });
});
