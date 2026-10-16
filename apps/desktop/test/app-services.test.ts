import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startAppServices, type AppServices } from "../src/main/app-services";
import { createServerApiClient } from "../src/main/server-api/server-api-client";
import { createInjectedSocketOpener } from "./support/injected-socket-opener";
import {
  startInProcessServer,
  type InProcessServer,
} from "./support/in-process-server";
import { createManualClock } from "./support/manual-clock";

let server: InProcessServer;
let database: Database.Database;
let services: AppServices;

beforeEach(async () => {
  server = await startInProcessServer();
  database = new Database(":memory:");
  services = startAppServices({
    database,
    server: createServerApiClient(server.transport),
    openSocket: createInjectedSocketOpener(server.app),
    clock: createManualClock(),
    createEngine: undefined,
    notify: () => undefined,
    reportError: () => undefined,
  });
});

afterEach(async () => {
  await services.stop();
  database.close();
  await server.close();
});

describe("startAppServices without the MLS module (#4 not built yet)", () => {
  it("creates the identity key and runs the account flows", async () => {
    expect(services.store.readIdentityKey()).toBeDefined();
    await expect(services.calls.readSessionState()).resolves.toEqual({
      status: "logged-out",
      username: null,
    });
  });

  it("has no Group hub, shows no Groups and refuses Group actions as unavailable", async () => {
    expect(services.deviceHub).toBeUndefined();
    await expect(services.calls.listGroups()).resolves.toEqual([]);
    await expect(services.calls.createGroup("friends")).resolves.toEqual({
      outcome: "refused",
      refusal: "UNAVAILABLE",
    });
  });
});
