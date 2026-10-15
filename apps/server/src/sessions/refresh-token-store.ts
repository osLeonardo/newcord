import type Database from "better-sqlite3";

export interface NewRefreshToken {
  tokenHash: Buffer;
  deviceId: string;
  expiresAt: number;
}

/** Stores refresh-token hashes in the refresh_tokens table. */
export interface RefreshTokenStore {
  insert(token: NewRefreshToken): void;
}

/**
 * Creates the refresh-token store on an open database.
 * Example: `createRefreshTokenStore(database).insert({ tokenHash, deviceId, expiresAt });`
 */
export function createRefreshTokenStore(
  database: Database.Database,
): RefreshTokenStore {
  const insertToken = database.prepare<NewRefreshToken>(
    "INSERT INTO refresh_tokens (token_hash, device_id, expires_at) VALUES (@tokenHash, @deviceId, @expiresAt)",
  );
  return {
    insert: (token: NewRefreshToken): void => {
      insertToken.run(token);
    },
  };
}
