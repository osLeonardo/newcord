import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServerApp } from "../src/app.js";

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildServerApp();
});

afterEach(async () => {
  await app.close();
});

describe("buildServerApp", () => {
  it("does not open a network port", async () => {
    await app.ready();

    expect(app.server.listening).toBe(false);
  });

  it("registers the WebSocket plugin", async () => {
    await app.ready();

    expect(app.websocketServer).toBeDefined();
  });
});

describe("GET /health", () => {
  it('answers 200 with the JSON body {"ok":true}', async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.body).toBe('{"ok":true}');
  });

  it("ignores a query string", async () => {
    const response = await app.inject({ method: "GET", url: "/health?x=1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("answers 404 to POST", async () => {
    const response = await app.inject({ method: "POST", url: "/health" });

    expect(response.statusCode).toBe(404);
  });

  it("answers 404 to an unknown route", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(404);
  });
});
