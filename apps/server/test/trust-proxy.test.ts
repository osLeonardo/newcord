import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  startTestServer,
  validRegisterRequest,
  type TestServer,
} from "./support/server-test-kit.js";

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

let signUps = 0;

/** A sign-up reaching the server from `remoteAddress`, naming `forwardedFor` as the client. */
function signUpThrough(
  app: FastifyInstance,
  remoteAddress: string,
  forwardedFor: string,
): Promise<LightMyRequestResponse> {
  signUps += 1;
  return app.inject({
    method: "POST",
    url: "/register",
    payload: validRegisterRequest({ username: `person${signUps}` }),
    remoteAddress,
    headers: { "x-forwarded-for": forwardedFor },
  });
}

/** Five sign-ups an hour per client address (08-m1-build Settings). */
async function useUpSignUps(
  app: FastifyInstance,
  remoteAddress: string,
  forwardedFor: string,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    expect(
      (await signUpThrough(app, remoteAddress, forwardedFor)).statusCode,
    ).toBe(201);
  }
  expect(
    (await signUpThrough(app, remoteAddress, forwardedFor)).statusCode,
  ).toBe(429);
}

describe("the client address behind nginx (14-server-deployment step 5)", () => {
  it("comes from nginx's header when trustProxy names 127.0.0.1, so each client has its own limits", async () => {
    server = await startTestServer({ trustProxy: "127.0.0.1" });
    await useUpSignUps(server.app, "127.0.0.1", "203.0.113.1");

    const other = await signUpThrough(server.app, "127.0.0.1", "203.0.113.2");

    expect(other.statusCode).toBe(201);
  });

  it("ignores the header from anyone but the trusted proxy", async () => {
    server = await startTestServer({ trustProxy: "127.0.0.1" });
    await useUpSignUps(server.app, "198.51.100.7", "203.0.113.1");

    const claimed = await signUpThrough(
      server.app,
      "198.51.100.7",
      "203.0.113.9",
    );

    expect(claimed.statusCode).toBe(429);
  });

  it("ignores the header in development, where no proxy is trusted", async () => {
    server = await startTestServer();
    await useUpSignUps(server.app, "127.0.0.1", "203.0.113.1");

    const other = await signUpThrough(server.app, "127.0.0.1", "203.0.113.2");

    expect(other.statusCode).toBe(429);
  });
});
