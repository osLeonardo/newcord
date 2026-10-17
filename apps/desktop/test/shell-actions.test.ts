import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShellActions,
  type AppShellEvents,
} from "../src/main/app-shell/shell-actions";
import { createAppFlags } from "../src/main/local-store/app-flags";
import {
  createSettingsStore,
  type SettingsStore,
} from "../src/main/local-store/device-settings";
import type { ShellApiCalls } from "../src/preload/shell-api";

let settings: SettingsStore;
let callMediaChanged: ReturnType<
  typeof vi.fn<AppShellEvents["callMediaChanged"]>
>;
let actions: ShellApiCalls;

beforeEach(() => {
  const database = new Database(":memory:");
  settings = createSettingsStore(database);
  callMediaChanged = vi.fn<AppShellEvents["callMediaChanged"]>();
  actions = createShellActions({
    flags: createAppFlags(database),
    settings,
    shell: { callChanged: vi.fn(), callMediaChanged, settingsChanged: vi.fn() },
  });
});

describe("the startup notice (D46)", () => {
  it("shows until dismissed", async () => {
    expect(await actions.readStartupNotice()).toBe(true);

    await actions.dismissStartupNotice();

    expect(await actions.readStartupNotice()).toBe(false);
  });

  it("is not shown once start at login is off", async () => {
    settings.change({ startAtLogin: false });

    expect(await actions.readStartupNotice()).toBe(false);
  });
});

describe("reportCallMedia", () => {
  it("hands the mute and sharing state to the shell", async () => {
    await actions.reportCallMedia({ muted: true, sharing: false });

    expect(callMediaChanged).toHaveBeenCalledExactlyOnceWith({
      muted: true,
      sharing: false,
    });
  });
});
