import Database from "better-sqlite3";
import { createTables } from "./schema.js";

/**
 * Opens the SQLite database with foreign keys enforced and the tables created.
 * Example: `const database = openDatabase(":memory:");`
 */
export function openDatabase(filename: string): Database.Database {
  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  createTables(database);
  return database;
}
