import type Database from "better-sqlite3";

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  identity_key BLOB NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE (identity_key)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash BLOB PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES devices(id),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
`;

/**
 * Creates the users, devices and refresh_tokens tables if they do not exist (08-m1-build step 2).
 * Example: `createTables(new Database(":memory:"));`
 */
export function createTables(database: Database.Database): void {
  database.exec(CREATE_TABLES_SQL);
}
