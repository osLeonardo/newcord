import { createHmac } from "node:crypto";
import {
  RelayCredentialsResponse,
  type RegisterResponse,
} from "@newcord/shared";
import type { LightMyRequestResponse } from "fastify";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TEST_RELAY,
  fastFakeHasher,
  signUp,
  startTestServer,
  type TestServer,
} from "./support/server-test-kit.js";

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0, 750);

let server: TestServer;
let alice: RegisterResponse;

beforeEach(async () => {
  server = await startTestServer({
    passwordHasher: fastFakeHasher,
    clock: () => NOW,
  });
  alice = (await signUp(server.app)).body;
});

afterEach(async () => {
  await server.close();
});

function getCredentials(
  authorization?: string,
): Promise<LightMyRequestResponse> {
  return server.app.inject({
    method: "GET",
    url: "/relay/credentials",
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("GET /relay/credentials", () => {
  it("answers a logged-in Device with the relay addresses and a password for 1 hour", async () => {
    const response = await getCredentials(`Bearer ${alice.accessToken}`);

    expect(response.statusCode).toBe(200);
    const body = response.json<RelayCredentialsResponse>();
    expect(Value.Check(RelayCredentialsResponse, body)).toBe(true);
    expect(body).toMatchObject({
      urls: TEST_RELAY.urls,
      lifetimeSeconds: 3600,
    });
  });

  it("names the expiry, an hour from now, and the caller's Device in the username", async () => {
    const body = (
      await getCredentials(`Bearer ${alice.accessToken}`)
    ).json<RelayCredentialsResponse>();

    expect(body.username).toBe(
      `${Math.floor(NOW / 1000) + 3600}:${alice.deviceId}`,
    );
  });

  it("signs the username with the shared secret as coturn's use-auth-secret expects", async () => {
    const body = (
      await getCredentials(`Bearer ${alice.accessToken}`)
    ).json<RelayCredentialsResponse>();

    expect(body.password).toBe(
      createHmac("sha1", TEST_RELAY.secret)
        .update(body.username)
        .digest("base64"),
    );
  });

  it.each([
    ["no Authorization header", undefined],
    ["a forged token", "Bearer not.a.token"],
  ])("answers 401 to %s", async (_case, authorization) => {
    expect((await getCredentials(authorization)).statusCode).toBe(401);
  });

  it("never writes the password or the secret to the log", async () => {
    const lines: string[] = [];
    await server.close();
    server = await startTestServer({
      passwordHasher: fastFakeHasher,
      log: {
        level: "trace",
        stream: { write: (line: string): number => lines.push(line) },
      },
    });
    const { accessToken } = (await signUp(server.app)).body;

    const body = (
      await getCredentials(`Bearer ${accessToken}`)
    ).json<RelayCredentialsResponse>();

    expect(lines.join("")).toContain("request completed");
    expect(lines.join("")).not.toContain(body.password);
    expect(lines.join("")).not.toContain(TEST_RELAY.secret);
  });
});
