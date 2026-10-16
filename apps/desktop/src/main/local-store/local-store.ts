import type Database from "better-sqlite3";
import type {
  IdentityKeyPair,
  IdentityKeyStore,
} from "../identity/identity-key";

/** The Account this installation belongs to, and this Device's ID on the server (D60). */
export interface StoredAccount {
  readonly username: string;
  readonly deviceId: string;
}

/** The tokens of the current session; present only while logged in. */
export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/** The app's local database: the identity key, the Account and the tokens, unencrypted (D20). */
export interface LocalStore extends IdentityKeyStore {
  readAccount(): StoredAccount | undefined;
  readSessionTokens(): SessionTokens | undefined;
  /** Stores the Account and the new tokens together, replacing any earlier ones. */
  saveLogin(account: StoredAccount, tokens: SessionTokens): void;
  /** Ends the local session, keeping the identity key and the Account. */
  deleteSessionTokens(): void;
}

// Each table holds at most one row: an installation belongs to one Account at a time (D60).
const CREATE_LOCAL_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS identity_key (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  public_key  BLOB NOT NULL CHECK (length(public_key) = 32),
  private_key BLOB NOT NULL CHECK (length(private_key) = 32)
);

CREATE TABLE IF NOT EXISTS account (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  username  TEXT NOT NULL,
  device_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_tokens (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL
);
`;

interface IdentityKeyRow {
  public_key: Buffer;
  private_key: Buffer;
}

interface AccountRow {
  username: string;
  device_id: string;
}

interface SessionTokensRow {
  access_token: string;
  refresh_token: string;
}

/**
 * Wraps an open better-sqlite3 database as the local store, creating its tables if needed.
 * @example const store = createSqliteLocalStore(new Database(join(app.getPath("userData"), "device.db")));
 */
export function createSqliteLocalStore(
  database: Database.Database,
): LocalStore {
  database.pragma("secure_delete = ON");
  database.exec(CREATE_LOCAL_TABLES_SQL);
  return {
    ...identityKeyQueries(database),
    ...accountQueries(database),
    ...sessionTokenQueries(database),
    saveLogin: saveLoginTransaction(database),
  };
}

function identityKeyQueries(database: Database.Database): IdentityKeyStore {
  const select = database.prepare<[], IdentityKeyRow>(
    "SELECT public_key, private_key FROM identity_key WHERE id = 1",
  );
  // A plain INSERT fails if a key exists: the key is replaced only by wiping the store (D60).
  const insert = database.prepare<[Buffer, Buffer]>(
    "INSERT INTO identity_key (id, public_key, private_key) VALUES (1, ?, ?)",
  );
  return {
    readIdentityKey: (): IdentityKeyPair | undefined => {
      const row = select.get();
      return row && { publicKey: row.public_key, privateKey: row.private_key };
    },
    saveIdentityKey: (keyPair: IdentityKeyPair): void => {
      insert.run(keyPair.publicKey, keyPair.privateKey);
    },
  };
}

function accountQueries(
  database: Database.Database,
): Pick<LocalStore, "readAccount"> {
  const select = database.prepare<[], AccountRow>(
    "SELECT username, device_id FROM account WHERE id = 1",
  );
  return {
    readAccount: (): StoredAccount | undefined => {
      const row = select.get();
      return row && { username: row.username, deviceId: row.device_id };
    },
  };
}

function sessionTokenQueries(
  database: Database.Database,
): Pick<LocalStore, "readSessionTokens" | "deleteSessionTokens"> {
  const select = database.prepare<[], SessionTokensRow>(
    "SELECT access_token, refresh_token FROM session_tokens WHERE id = 1",
  );
  const remove = database.prepare("DELETE FROM session_tokens");
  return {
    readSessionTokens: (): SessionTokens | undefined => {
      const row = select.get();
      return (
        row && {
          accessToken: row.access_token,
          refreshToken: row.refresh_token,
        }
      );
    },
    deleteSessionTokens: (): void => {
      remove.run();
    },
  };
}

function saveLoginTransaction(
  database: Database.Database,
): LocalStore["saveLogin"] {
  const upsertAccount = database.prepare<[string, string]>(
    "INSERT OR REPLACE INTO account (id, username, device_id) VALUES (1, ?, ?)",
  );
  const upsertTokens = database.prepare<[string, string]>(
    "INSERT OR REPLACE INTO session_tokens (id, access_token, refresh_token) VALUES (1, ?, ?)",
  );
  const saveLogin = database.transaction(
    (account: StoredAccount, tokens: SessionTokens): void => {
      upsertAccount.run(account.username, account.deviceId);
      upsertTokens.run(tokens.accessToken, tokens.refreshToken);
    },
  );
  return (account, tokens): void => {
    saveLogin(account, tokens);
  };
}
