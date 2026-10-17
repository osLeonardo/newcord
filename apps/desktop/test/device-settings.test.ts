import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
} from "../src/main/local-store/device-settings";
import type { DeviceSettings } from "../src/preload/settings-api";

describe("the Device settings", () => {
  it("start with the accepted defaults", () => {
    expect(createSettingsStore(new Database(":memory:")).read()).toEqual({
      microphoneMode: "voice-activity",
      pushToTalkKey: null,
      muteHotkey: "Ctrl+Shift+M",
      inputDeviceId: null,
      voiceSensitivity: 50,
      codec: "H264",
      hideMyIp: false,
      previewMode: "full",
      startAtLogin: true,
      quitOnClose: false,
    });
  });

  it("keep every setting across a restart of the store", () => {
    const database = new Database(":memory:");
    const changed: DeviceSettings = {
      microphoneMode: "push-to-talk",
      pushToTalkKey: "CapsLock",
      muteHotkey: "Alt+F9",
      inputDeviceId: "usb-headset",
      voiceSensitivity: 80,
      codec: "VP9",
      hideMyIp: true,
      previewMode: "sender",
      startAtLogin: false,
      quitOnClose: true,
    };
    createSettingsStore(database).change(changed);

    expect(createSettingsStore(database).read()).toEqual(changed);
  });

  it("carry over the values set in M3's Call settings panel (#9)", () => {
    const database = new Database(":memory:");
    database.exec(
      "CREATE TABLE call_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings TEXT NOT NULL)",
    );
    database
      .prepare("INSERT INTO call_settings (id, settings) VALUES (1, ?)")
      .run(
        JSON.stringify({
          microphoneMode: "push-to-talk",
          pushToTalkKey: "KeyV",
          muteHotkey: "Ctrl+Shift+M",
          codec: "VP8",
          hideMyIp: true,
        }),
      );

    expect(createSettingsStore(database).read()).toEqual({
      ...DEFAULT_SETTINGS,
      microphoneMode: "push-to-talk",
      pushToTalkKey: "KeyV",
      codec: "VP8",
      hideMyIp: true,
    });
  });
});
