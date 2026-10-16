import type Database from "better-sqlite3";

/** Where the Device's MLS state blob is kept (D39), with what the Key package upkeep must remember. */
export interface MlsStateStore {
  read(): Uint8Array | undefined;
  save(state: Uint8Array): void;
  /** Whether the server already has this identity's last-resort Key package. */
  lastResortUploaded(): boolean;
  markLastResortUploaded(): void;
}

const CREATE_MLS_STATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mls_state (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  state                BLOB NOT NULL,
  last_resort_uploaded INTEGER NOT NULL DEFAULT 0
);
`;

/**
 * Creates the MLS state store on the local database (`secure_delete` on, as the local store sets it),
 * creating its table if needed; erasing the local store (D60) erases it too.
 * @example const mlsState = createMlsStateStore(database);
 */
export function createMlsStateStore(
  database: Database.Database,
): MlsStateStore {
  database.exec(CREATE_MLS_STATE_TABLE_SQL);
  const select = database
    .prepare<[], Buffer>("SELECT state FROM mls_state WHERE id = 1")
    .pluck();
  const upsert = database.prepare<[Buffer]>(
    `INSERT INTO mls_state (id, state) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET state = excluded.state`,
  );
  const readFlag = database
    .prepare<[], number>(
      "SELECT last_resort_uploaded FROM mls_state WHERE id = 1",
    )
    .pluck();
  const setFlag = database.prepare(
    "UPDATE mls_state SET last_resort_uploaded = 1 WHERE id = 1",
  );
  return {
    read: (): Uint8Array | undefined => select.get(),
    save: (state): void => {
      upsert.run(Buffer.from(state));
    },
    lastResortUploaded: (): boolean => readFlag.get() === 1,
    markLastResortUploaded: (): void => {
      setFlag.run();
    },
  };
}
