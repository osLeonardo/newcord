import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createCallSettingsStore } from "../src/main/local-store/call-settings";

describe("the Call settings", () => {
  it("start with Hide my IP off (D14)", () => {
    expect(createCallSettingsStore(new Database(":memory:")).read()).toEqual({
      hideMyIp: false,
    });
  });

  it("keep a change across a restart", () => {
    const database = new Database(":memory:");
    createCallSettingsStore(database).change({ hideMyIp: true });

    expect(createCallSettingsStore(database).read()).toEqual({
      hideMyIp: true,
    });
  });
});
