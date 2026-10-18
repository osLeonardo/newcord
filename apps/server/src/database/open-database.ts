import Database from "better-sqlite3";
import { createTables } from "./schema.js";

/**
 * The schema this server writes, kept in SQLite's `user_version`. Raise it with each change to the
 * tables, together with the step that moves an older database forward.
 */
export const SCHEMA_VERSION = 1;

/**
 * Opens the SQLite database with foreign keys enforced and the tables created. A database written
 * by a newer server is refused rather than used with tables this server does not know, as when an
 * older version is started by hand after an update.
 * Example: `const database = openDatabase(":memory:");`
 */
export function openDatabase(filename: string): Database.Database {
  const database = new Database(filename);
  const version = database.pragma("user_version", { simple: true }) as number;
  if (version > SCHEMA_VERSION) {
    database.close();
    throw new Error(
      `The database ${filename} was written by a newer newcord server (schema ${version}, this one knows ${SCHEMA_VERSION}); run that version or a later one`,
    );
  }
  database.pragma("foreign_keys = ON");
  createTables(database);
  database.pragma(`user_version = ${SCHEMA_VERSION}`);
  return database;
}
