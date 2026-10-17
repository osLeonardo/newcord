import type Database from "better-sqlite3";

/** The people this Device marked verified, each with the Safety number they were verified for (#11's spec). */
export interface VerifiedMarks {
  /** The Safety number the person was verified for, or undefined. */
  numberOf(username: string): string | undefined;
  mark(username: string, safetyNumber: string): void;
  clear(username: string): void;
}

const CREATE_VERIFIED_MARKS_SQL = `
CREATE TABLE IF NOT EXISTS verified_marks (
  username      TEXT PRIMARY KEY,
  safety_number TEXT NOT NULL
);
`;

/**
 * Creates the verified-mark store, creating its table if needed.
 * @example const marks = createVerifiedMarks(database); marks.mark("bruno", number);
 */
export function createVerifiedMarks(
  database: Database.Database,
): VerifiedMarks {
  database.exec(CREATE_VERIFIED_MARKS_SQL);
  const select = database.prepare<[string], string>(
    "SELECT safety_number FROM verified_marks WHERE username = ?",
  );
  const upsert = database.prepare<[string, string]>(
    "INSERT INTO verified_marks (username, safety_number) VALUES (?, ?) ON CONFLICT (username) DO UPDATE SET safety_number = excluded.safety_number",
  );
  const remove = database.prepare<[string]>(
    "DELETE FROM verified_marks WHERE username = ?",
  );
  return {
    numberOf: (username): string | undefined => select.pluck().get(username),
    mark: (username, safetyNumber): void => {
      upsert.run(username, safetyNumber);
    },
    clear: (username): void => {
      remove.run(username);
    },
  };
}
