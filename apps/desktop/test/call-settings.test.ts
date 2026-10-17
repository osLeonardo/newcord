import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createCallSettingsStore } from "../src/main/local-store/call-settings";

describe("the Call settings", () => {
  it("start with the accepted defaults", () => {
    expect(createCallSettingsStore(new Database(":memory:")).read()).toEqual({
      microphoneMode: "voice-activity",
      pushToTalkKey: null,
      muteHotkey: "Ctrl+Shift+M",
      codec: "H264",
      hideMyIp: false,
    });
  });

  it("keep a change across a restart", () => {
    const database = new Database(":memory:");
    createCallSettingsStore(database).change({ hideMyIp: true });

    expect(createCallSettingsStore(database).read()).toMatchObject({
      hideMyIp: true,
      codec: "H264",
    });
  });
});
