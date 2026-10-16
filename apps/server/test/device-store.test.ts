import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/database/open-database.js";
import {
  createDeviceStore,
  type DeviceStore,
} from "../src/devices/device-store.js";

let database: Database.Database;
let store: DeviceStore;

beforeEach(() => {
  database = openDatabase(":memory:");
  store = createDeviceStore(database);
  for (const [userId, username] of [
    [7, "alice"],
    [8, "bruno"],
  ] as const) {
    database
      .prepare(
        "INSERT INTO users (id, username, password_hash, recovery_hash, created_at) VALUES (?, ?, 'p', 'r', 0)",
      )
      .run(userId, username);
  }
});

afterEach(() => {
  database.close();
});

function addDevice(deviceId: string, userId: number): void {
  store.insert({
    deviceId,
    userId,
    identityKey: Buffer.from(deviceId),
    createdAt: 0,
  });
}

describe("DeviceStore.deviceIdsOf", () => {
  it("returns the ID of every Device of the Account and no other", () => {
    addDevice("alice-phone", 7);
    addDevice("bruno-phone", 8);
    addDevice("alice-laptop", 7);

    expect(store.deviceIdsOf(7).sort()).toEqual([
      "alice-laptop",
      "alice-phone",
    ]);
  });

  it("returns no IDs for an Account without Devices or an unknown Account", () => {
    addDevice("alice-phone", 7);

    expect(store.deviceIdsOf(8)).toEqual([]);
    expect(store.deviceIdsOf(404)).toEqual([]);
  });
});
