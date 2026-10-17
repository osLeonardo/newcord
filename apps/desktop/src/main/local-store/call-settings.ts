import type Database from "better-sqlite3";
import type { CallSettings } from "../../preload/call-api";

/** The Call settings of this computer, kept in its local database (10-m3-build Settings). */
export interface CallSettingsStore {
  read(): CallSettings;
  change(changes: Partial<CallSettings>): CallSettings;
}

/** The settings accepted on October 14, 2026 (10-m3-build and 11-m4-build Settings, #9's spec). */
export const DEFAULT_CALL_SETTINGS: CallSettings = {
  microphoneMode: "voice-activity",
  pushToTalkKey: null,
  muteHotkey: "Ctrl+Shift+M",
  codec: "H264",
  hideMyIp: false,
};

const CREATE_CALL_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS call_settings (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  settings TEXT NOT NULL
);
`;

/**
 * Creates the Call settings store, creating its table if needed.
 * @example const settings = createCallSettingsStore(database); settings.change({ hideMyIp: true });
 */
export function createCallSettingsStore(
  database: Database.Database,
): CallSettingsStore {
  database.exec(CREATE_CALL_SETTINGS_SQL);
  const select = database.prepare<[], string>(
    "SELECT settings FROM call_settings WHERE id = 1",
  );
  const upsert = database.prepare<[string]>(
    "INSERT INTO call_settings (id, settings) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET settings = excluded.settings",
  );
  const read = (): CallSettings => {
    const stored = select.pluck().get();
    return stored === undefined
      ? DEFAULT_CALL_SETTINGS
      : {
          ...DEFAULT_CALL_SETTINGS,
          ...(JSON.parse(stored) as Partial<CallSettings>),
        };
  };
  return {
    read,
    change: (changes): CallSettings => {
      const changed = { ...read(), ...changes };
      upsert.run(JSON.stringify(changed));
      return changed;
    },
  };
}
