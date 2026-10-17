import type Database from "better-sqlite3";

/** A Key package handed out, and whether it was the Device's last-resort one, which stays stored. */
export interface TakenKeyPackage {
  data: Buffer;
  lastResort: boolean;
}

/** Each Device's Key packages: ordinary ones are handed out once, the last-resort one is kept. */
export interface KeyPackageStore {
  /** Adds ordinary packages and replaces the last-resort one if given; returns the Device's ordinary count. */
  store(
    deviceId: string,
    ordinary: Buffer[],
    lastResort: Buffer | undefined,
  ): number;
  ordinaryCount(deviceId: string): number;
  /** Hands out the Device's oldest ordinary package, deleting it, or else its last-resort package. */
  takeOne(deviceId: string): TakenKeyPackage | undefined;
}

interface KeyPackageRow {
  id: number;
  data: Buffer;
  last_resort: number;
}

/**
 * Creates the Key package store on an open database.
 * Example: `const count = createKeyPackageStore(database).store(deviceId, packages, lastResort);`
 */
export function createKeyPackageStore(
  database: Database.Database,
): KeyPackageStore {
  const countOrdinary = database
    .prepare<[string], number>(
      "SELECT count(*) FROM key_packages WHERE device_id = ? AND last_resort = 0",
    )
    .pluck();
  const ordinaryCount = (deviceId: string): number =>
    countOrdinary.get(deviceId) ?? 0;
  return {
    store: createStoreTransaction(database, ordinaryCount),
    ordinaryCount,
    takeOne: createTakeTransaction(database),
  };
}

function createStoreTransaction(
  database: Database.Database,
  ordinaryCount: (deviceId: string) => number,
): KeyPackageStore["store"] {
  const insert = database.prepare<[string, Buffer, number]>(
    "INSERT INTO key_packages (device_id, data, last_resort) VALUES (?, ?, ?)",
  );
  const deleteLastResort = database.prepare<[string]>(
    "DELETE FROM key_packages WHERE device_id = ? AND last_resort = 1",
  );
  return database.transaction(
    (deviceId: string, ordinary: Buffer[], lastResort: Buffer | undefined) => {
      for (const data of ordinary) insert.run(deviceId, data, 0);
      if (lastResort !== undefined) {
        deleteLastResort.run(deviceId);
        insert.run(deviceId, lastResort, 1);
      }
      return ordinaryCount(deviceId);
    },
  );
}

function createTakeTransaction(
  database: Database.Database,
): KeyPackageStore["takeOne"] {
  const findNext = database.prepare<[string], KeyPackageRow>(
    "SELECT id, data, last_resort FROM key_packages WHERE device_id = ? ORDER BY last_resort, id LIMIT 1",
  );
  const deleteById = database.prepare<[number]>(
    "DELETE FROM key_packages WHERE id = ?",
  );
  return database.transaction(
    (deviceId: string): TakenKeyPackage | undefined => {
      const row = findNext.get(deviceId);
      if (row === undefined) return undefined;
      if (row.last_resort === 0) deleteById.run(row.id);
      return { data: row.data, lastResort: row.last_resort === 1 };
    },
  );
}
