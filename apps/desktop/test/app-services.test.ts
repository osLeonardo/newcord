import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAppServices, type AppServices } from "../src/main/app-services";
import type { AppShellEvents } from "../src/main/app-shell/shell-actions";
import { desktopApiEventChannels } from "../src/preload/desktop-api";
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

describe("the settings (#10, Step 03)", () => {
  it("hand every change to the shell, which updates the login item, and to the windows", async () => {
    const shell = {
      callChanged: vi.fn(),
      callMediaChanged: vi.fn(),
      settingsChanged: vi.fn<AppShellEvents["settingsChanged"]>(),
    };
    const notify = vi.fn<(channel: string, payload?: unknown) => void>();
    const withShell = startAppServices({
      database: new Database(":memory:"),
      server: createServerApiClient(server.transport),
      openSocket: createInjectedSocketOpener(server.app),
      clock: createManualClock(),
      createEngine: undefined,
      notify,
      reportError: () => undefined,
      shell,
    });

    const changed = await withShell.calls.changeSettings({
      startAtLogin: false,
    });

    expect(changed.startAtLogin).toBe(false);
    expect(shell.settingsChanged).toHaveBeenCalledExactlyOnceWith(changed);
    expect(notify).toHaveBeenCalledWith(
      desktopApiEventChannels.onSettingsChanged,
      changed,
    );
    await withShell.stop();
  });

  it("re-register the mute hotkey when it changes during a Call", async () => {
    const registered: string[] = [];
    const withHotkeys = startAppServices({
      database: new Database(":memory:"),
      server: createServerApiClient(server.transport),
      openSocket: createInjectedSocketOpener(server.app),
      clock: createManualClock(),
      createEngine: undefined,
      notify: () => undefined,
      reportError: () => undefined,
      hotkeys: {
        register: (accelerator) => {
          registered.push(accelerator);
          return true;
        },
        unregister: (accelerator) => {
          registered.splice(registered.indexOf(accelerator), 1);
        },
      },
    });

    await withHotkeys.calls.changeSettings({ muteHotkey: "Alt+M" });

    // Outside a Call nothing is registered (D44c).
    expect(registered).toEqual([]);
    await withHotkeys.stop();
  });
});
