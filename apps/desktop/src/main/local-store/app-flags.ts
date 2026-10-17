import type Database from "better-sqlite3";

/** Things the app did once on this computer (#10's spec). */
export type AppFlag =
  /** Start at login was turned on by the first run (D46). */
  | "first-run-done"
  /** The "still running in the tray" notice was shown (D47). */
  | "close-notice-shown"
  /** The person read the first screen's note about starting with Windows (D46). */
  | "startup-notice-dismissed";

export interface AppFlags {
  has(flag: AppFlag): boolean;
  set(flag: AppFlag): void;
}

const CREATE_APP_FLAGS_SQL = `
CREATE TABLE IF NOT EXISTS app_flags (
  name TEXT PRIMARY KEY
);
`;

/**
 * Creates the flag store, creating its table if needed.
 * @example const flags = createAppFlags(database); if (!flags.has("first-run-done")) …
 */
export function createAppFlags(database: Database.Database): AppFlags {
  database.exec(CREATE_APP_FLAGS_SQL);
  const select = database.prepare<[string], number>(
    "SELECT 1 FROM app_flags WHERE name = ?",
  );
  const insert = database.prepare<[string]>(
    "INSERT OR IGNORE INTO app_flags (name) VALUES (?)",
  );
  return {
    has: (flag): boolean => select.pluck().get(flag) !== undefined,
    set: (flag): void => {
      insert.run(flag);
    },
  };
}
