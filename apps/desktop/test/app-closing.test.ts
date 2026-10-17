import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDecision,
  firstHide,
  setUpFirstRun,
  startsHidden,
} from "../src/main/app-shell/app-closing";
import { trayItems } from "../src/main/app-shell/tray-menu";
import {
  createAppFlags,
  type AppFlags,
} from "../src/main/local-store/app-flags";

let database: Database.Database;
let flags: AppFlags;

beforeEach(() => {
  database = new Database(":memory:");
  flags = createAppFlags(database);
});

describe("closeDecision (D15b)", () => {
  it.each([
    [{ quitting: false, quitOnClose: false }, "hide"],
    [{ quitting: false, quitOnClose: true }, "close"],
    [{ quitting: true, quitOnClose: false }, "close"],
    [{ quitting: true, quitOnClose: true }, "close"],
  ] as const)("decides %j: %s", (state, decision) => {
    expect(closeDecision(state)).toBe(decision);
  });
});

describe("the one-time notice (D47)", () => {
  it("is shown on the first hide only, even after a restart", () => {
    expect(firstHide(flags)).toBe(true);
    expect(firstHide(flags)).toBe(false);

    expect(firstHide(createAppFlags(database))).toBe(false);
  });
});

describe("start at login (D46)", () => {
  it("is turned on by the first run only", () => {
    const loginItems = { set: vi.fn<(openAtLogin: boolean) => void>() };

    expect(setUpFirstRun(flags, loginItems)).toBe(true);
    expect(setUpFirstRun(createAppFlags(database), loginItems)).toBe(false);

    expect(loginItems.set).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("opens hidden when Windows starts the app with --hidden", () => {
    expect(startsHidden(["newcord.exe", "--hidden"])).toBe(true);
    expect(startsHidden(["newcord.exe"])).toBe(false);
  });
});

describe("trayItems (11-m4-build step 1)", () => {
  it("offers Open, Mute and Quit, with Mute only during a Call", () => {
    expect(trayItems({ inCall: false, muted: false })).toEqual([
      { label: "Open", action: "open", enabled: true },
      { label: "Mute", action: "toggle-mute", enabled: false },
      { label: "Quit", action: "quit", enabled: true },
    ]);
  });

  it("shows Unmute while muted in a Call", () => {
    expect(trayItems({ inCall: true, muted: true })[1]).toEqual({
      label: "Unmute",
      action: "toggle-mute",
      enabled: true,
    });
  });
});
