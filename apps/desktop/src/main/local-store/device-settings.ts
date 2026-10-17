import type Database from "better-sqlite3";
import type { DeviceSettings } from "../../preload/settings-api";

/** This computer's settings, kept in its local database (11-m4-build Settings). */
export interface SettingsStore {
  read(): DeviceSettings;
  change(changes: Partial<DeviceSettings>): DeviceSettings;
}

/** The settings accepted on October 14, 2026 (10-m3-build and 11-m4-build Settings, #9's and #10's specs). */
export const DEFAULT_SETTINGS: DeviceSettings = {
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
};

// M3 kept its Call settings in call_settings (#9); the same row now holds every setting.
const MIGRATE_CALL_SETTINGS_SQL =
  "ALTER TABLE call_settings RENAME TO device_settings";

const CREATE_DEVICE_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS device_settings (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  settings TEXT NOT NULL
);
`;

/**
 * Creates the settings store, creating its table if needed. Settings missing from the stored row,
 * such as those M4 added to M3's, take their defaults.
 * @example const settings = createSettingsStore(database); settings.change({ hideMyIp: true });
 */
export function createSettingsStore(
  database: Database.Database,
): SettingsStore {
  migrateCallSettings(database);
  database.exec(CREATE_DEVICE_SETTINGS_SQL);
  const select = database.prepare<[], string>(
    "SELECT settings FROM device_settings WHERE id = 1",
  );
  const upsert = database.prepare<[string]>(
    "INSERT INTO device_settings (id, settings) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET settings = excluded.settings",
  );
  const read = (): DeviceSettings => {
    const stored = select.pluck().get();
    return stored === undefined
      ? DEFAULT_SETTINGS
      : {
          ...DEFAULT_SETTINGS,
          ...(JSON.parse(stored) as Partial<DeviceSettings>),
        };
  };
  return {
    read,
    change: (changes): DeviceSettings => {
      const changed = { ...read(), ...changes };
      upsert.run(JSON.stringify(changed));
      return changed;
    },
  };
}

function migrateCallSettings(database: Database.Database): void {
  const tables = new Set(
    database
      .prepare<[], string>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )
      .pluck()
      .all(),
  );
  if (tables.has("call_settings") && !tables.has("device_settings")) {
    database.exec(MIGRATE_CALL_SETTINGS_SQL);
  }
}
