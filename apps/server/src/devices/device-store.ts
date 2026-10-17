import type Database from "better-sqlite3";

export interface NewDevice {
  deviceId: string;
  userId: number;
  identityKey: Buffer;
  createdAt: number;
}

/** A Device as login needs it: its ID and the Account it belongs to. */
export interface StoredDevice {
  deviceId: string;
  userId: number;
}

/** Finds and adds Devices; an identity key belongs to one Device of one Account only (D60). */
export interface DeviceStore {
  findByIdentityKey(identityKey: Buffer): StoredDevice | undefined;
  insert(device: NewDevice): void;
  /** The ID of every Device of the Account; none for an unknown Account. */
  deviceIdsOf(userId: number): string[];
}

/**
 * Creates the Device store on an open database.
 * Example: `const device = createDeviceStore(database).findByIdentityKey(identityKey);`
 */
export function createDeviceStore(database: Database.Database): DeviceStore {
  const findDevice = database.prepare<[Buffer], StoredDevice>(
    "SELECT id AS deviceId, user_id AS userId FROM devices WHERE identity_key = ?",
  );
  const insertDevice = database.prepare<NewDevice>(
    "INSERT INTO devices (id, user_id, identity_key, created_at) VALUES (@deviceId, @userId, @identityKey, @createdAt)",
  );
  return {
    findByIdentityKey: (identityKey: Buffer): StoredDevice | undefined =>
      findDevice.get(identityKey),
    insert: (device: NewDevice): void => {
      insertDevice.run(device);
    },
    deviceIdsOf: createDeviceIdLookup(database),
  };
}

function createDeviceIdLookup(
  database: Database.Database,
): DeviceStore["deviceIdsOf"] {
  const listDeviceIds = database
    .prepare<[number], string>("SELECT id FROM devices WHERE user_id = ?")
    .pluck();
  return (userId: number): string[] => listDeviceIds.all(userId);
}
