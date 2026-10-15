import type Database from "better-sqlite3";

export interface NewRefreshToken {
  tokenHash: Buffer;
  deviceId: string;
  expiresAt: number;
}

/** A stored refresh token with the Device and Account it speaks for; `usedAt` is null until it is swapped. */
export interface StoredRefreshToken {
  deviceId: string;
  userId: number;
  expiresAt: number;
  usedAt: number | null;
}

/** Stores refresh-token hashes in the refresh_tokens table; used ones stay until they expire (D62). */
export interface RefreshTokenStore {
  insert(token: NewRefreshToken): void;
  find(tokenHash: Buffer): StoredRefreshToken | undefined;
  markUsed(tokenHash: Buffer, usedAt: number): void;
  deleteForDevice(deviceId: string): void;
  /** Deletes every token whose expiry is at or before `now`, used or not; returns how many. */
  deleteExpired(now: number): number;
}

/**
 * Creates the refresh-token store on an open database.
 * Example: `createRefreshTokenStore(database).insert({ tokenHash, deviceId, expiresAt });`
 */
export function createRefreshTokenStore(
  database: Database.Database,
): RefreshTokenStore {
  const statements = prepareRefreshTokenStatements(database);
  return {
    insert: (token: NewRefreshToken): void => {
      statements.insert.run(token);
    },
    find: (tokenHash: Buffer): StoredRefreshToken | undefined =>
      statements.find.get(tokenHash),
    markUsed: (tokenHash: Buffer, usedAt: number): void => {
      statements.markUsed.run({ tokenHash, usedAt });
    },
    deleteForDevice: (deviceId: string): void => {
      statements.deleteForDevice.run(deviceId);
    },
    deleteExpired: (now: number): number =>
      statements.deleteExpired.run(now).changes,
  };
}

function prepareRefreshTokenStatements(database: Database.Database): {
  insert: Database.Statement<NewRefreshToken>;
  find: Database.Statement<[Buffer], StoredRefreshToken>;
  markUsed: Database.Statement<{ tokenHash: Buffer; usedAt: number }>;
  deleteForDevice: Database.Statement<[string]>;
  deleteExpired: Database.Statement<[number]>;
} {
  return {
    insert: database.prepare(
      "INSERT INTO refresh_tokens (token_hash, device_id, expires_at) VALUES (@tokenHash, @deviceId, @expiresAt)",
    ),
    find: database.prepare(
      "SELECT refresh_tokens.device_id AS deviceId, devices.user_id AS userId, refresh_tokens.expires_at AS expiresAt, refresh_tokens.used_at AS usedAt FROM refresh_tokens JOIN devices ON devices.id = refresh_tokens.device_id WHERE refresh_tokens.token_hash = ?",
    ),
    markUsed: database.prepare(
      "UPDATE refresh_tokens SET used_at = @usedAt WHERE token_hash = @tokenHash",
    ),
    deleteForDevice: database.prepare(
      "DELETE FROM refresh_tokens WHERE device_id = ?",
    ),
    deleteExpired: database.prepare(
      "DELETE FROM refresh_tokens WHERE expires_at <= ?",
    ),
  };
}
