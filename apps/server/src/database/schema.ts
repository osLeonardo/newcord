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

// M2's tables (09-m2-build step 6). Additions to the guide's columns: groups.last_seq keeps the
// sequence counter after delivered messages are deleted; group_members.leaving stops deliveries
// to a leaver at once (D57) and needs_resync marks a Device that missed a commit (D24);
// invitations.hidden holds an Invitation from someone the invitee blocked (D57); messages.declared
// keeps a commit's declared epoch, additions and removals (D41); blocks is #5's spec.
const CREATE_GROUP_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS groups (
  id         BLOB PRIMARY KEY CHECK (length(id) = 16),
  name       TEXT NOT NULL,
  epoch      INTEGER NOT NULL,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id     BLOB NOT NULL REFERENCES groups(id),
  device_id    TEXT NOT NULL REFERENCES devices(id),
  leaving      INTEGER NOT NULL DEFAULT 0,
  needs_resync INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, device_id)
);
CREATE INDEX IF NOT EXISTS group_members_by_device ON group_members (device_id);

CREATE TABLE IF NOT EXISTS invitations (
  id         TEXT PRIMARY KEY,
  group_id   BLOB NOT NULL REFERENCES groups(id),
  from_user  INTEGER NOT NULL REFERENCES users(id),
  to_user    INTEGER NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invitations_by_invitee ON invitations (to_user, status);

CREATE TABLE IF NOT EXISTS key_packages (
  id          INTEGER PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id),
  data        BLOB NOT NULL,
  last_resort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS key_packages_by_device ON key_packages (device_id, last_resort);

CREATE TABLE IF NOT EXISTS messages (
  group_id   BLOB NOT NULL REFERENCES groups(id),
  seq        INTEGER NOT NULL,
  sender     TEXT NOT NULL REFERENCES devices(id),
  kind       TEXT NOT NULL CHECK (kind IN ('commit', 'welcome', 'message', 'proposal')),
  payload    BLOB NOT NULL,
  declared   TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, seq)
);

CREATE TABLE IF NOT EXISTS deliveries (
  group_id  BLOB NOT NULL,
  seq       INTEGER NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id),
  PRIMARY KEY (group_id, seq, device_id),
  FOREIGN KEY (group_id, seq) REFERENCES messages (group_id, seq)
);
CREATE INDEX IF NOT EXISTS deliveries_by_device ON deliveries (device_id, group_id, seq);

CREATE TABLE IF NOT EXISTS blocks (
  blocker INTEGER NOT NULL REFERENCES users(id),
  blocked INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
`;

/**
 * Creates M1's users, devices and refresh_tokens tables (08-m1-build step 2) and M2's Group,
 * Invitation, Key package, queue and block tables (09-m2-build step 6) if they do not exist.
 * Example: `createTables(new Database(":memory:"));`
 */
export function createTables(database: Database.Database): void {
  database.exec(CREATE_TABLES_SQL);
  database.exec(CREATE_GROUP_TABLES_SQL);
}
