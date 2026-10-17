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
import type { ViewState } from "../src/main/app-shell/message-notices";

let settings: SettingsStore;
let callMediaChanged: ReturnType<
  typeof vi.fn<AppShellEvents["callMediaChanged"]>
>;
let actions: ShellApiCalls;
let view: ViewState;
let groupViewed: ReturnType<typeof vi.fn<(groupId: string) => void>>;

beforeEach(() => {
  const database = new Database(":memory:");
  settings = createSettingsStore(database);
  callMediaChanged = vi.fn<AppShellEvents["callMediaChanged"]>();
  view = { windowFocused: true, sharing: false };
  groupViewed = vi.fn<(groupId: string) => void>();
  actions = createShellActions({
    flags: createAppFlags(database),
    settings,
    shell: { callChanged: vi.fn(), callMediaChanged, settingsChanged: vi.fn() },
    view,
    groupViewed,
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

describe("setViewedGroup (#10's spec)", () => {
  const groupId = "MgZoqEdt4EEfhsMd_7xNqw";

  it("marks the Group read when it opens in the focused window", async () => {
    await actions.setViewedGroup(groupId);

    expect(view.viewedGroup).toBe(groupId);
    expect(groupViewed).toHaveBeenCalledExactlyOnceWith(groupId);
  });

  it("only remembers the Group while the window lacks the focus", async () => {
    view.windowFocused = false;

    await actions.setViewedGroup(groupId);

    expect(view.viewedGroup).toBe(groupId);
    expect(groupViewed).not.toHaveBeenCalled();
  });

  it("forgets the Group on other screens", async () => {
    await actions.setViewedGroup(groupId);

    await actions.setViewedGroup(null);

    expect(view.viewedGroup).toBeUndefined();
  });

  it("keeps the sharing state notifications need (D15)", async () => {
    await actions.reportCallMedia({ muted: false, sharing: true });

    expect(view.sharing).toBe(true);
  });
});
