// SQLite owned by the coordinator worker: one connection, WAL, FULL sync, so a
// committed transaction is on the volume before any success is reported
// (SAVE-02). Explicit, append-only migrations; existing DB files are kept.
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    pw_hash TEXT NOT NULL,
    recovery_digest TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_digest TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    csrf TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE works (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    world_epoch INTEGER NOT NULL DEFAULT 1,
    command_seq INTEGER NOT NULL DEFAULT 0,
    best_height REAL NOT NULL DEFAULT 0,
    stable_height REAL NOT NULL DEFAULT 0,
    stick_count INTEGER NOT NULL DEFAULT 0,
    physics_config TEXT NOT NULL,
    physics_config_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX works_owner ON works(owner_id);
  CREATE TABLE memberships (
    work_id TEXT NOT NULL REFERENCES works(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (work_id, user_id)
  );
  CREATE INDEX memberships_user ON memberships(user_id);
  CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id),
    token_digest TEXT NOT NULL UNIQUE,
    issuer_id TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    max_uses INTEGER NOT NULL
  );
  CREATE INDEX invites_work ON invites(work_id);
  CREATE TABLE invite_acceptances (
    invite_id TEXT NOT NULL REFERENCES invites(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    accepted_at INTEGER NOT NULL,
    PRIMARY KEY (invite_id, user_id)
  );
  CREATE TABLE work_states (
    work_id TEXT PRIMARY KEY REFERENCES works(id),
    blob BLOB NOT NULL,
    meta TEXT NOT NULL,
    tick INTEGER NOT NULL,
    engine TEXT NOT NULL,
    config_version INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    moving INTEGER NOT NULL,
    saved_at INTEGER NOT NULL
  );
  CREATE TABLE previous_work_states (
    work_id TEXT PRIMARY KEY REFERENCES works(id),
    blob BLOB NOT NULL,
    meta TEXT NOT NULL,
    tick INTEGER NOT NULL,
    engine TEXT NOT NULL,
    config_version INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    moving INTEGER NOT NULL,
    saved_at INTEGER NOT NULL
  );
  CREATE TABLE command_receipts (
    actor_id TEXT NOT NULL,
    command_id TEXT NOT NULL,
    work_id TEXT NOT NULL REFERENCES works(id),
    kind TEXT NOT NULL,
    digest TEXT NOT NULL,
    outcome TEXT NOT NULL,
    code TEXT,
    seq INTEGER,
    epoch INTEGER,
    response TEXT NOT NULL,
    committed_at INTEGER NOT NULL,
    PRIMARY KEY (actor_id, command_id)
  );
  CREATE INDEX receipts_work ON command_receipts(work_id);
  CREATE TABLE snapshots (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id),
    creator_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('named', 'restore-protect', 'push-protect')),
    title TEXT NOT NULL,
    blob BLOB NOT NULL,
    meta TEXT NOT NULL,
    tick INTEGER NOT NULL,
    engine TEXT NOT NULL,
    config_version INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    height REAL NOT NULL,
    stick_count INTEGER NOT NULL,
    source_epoch INTEGER NOT NULL,
    source_seq INTEGER NOT NULL,
    stable INTEGER NOT NULL,
    geometry TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX snapshots_work ON snapshots(work_id, kind, created_at);
  CREATE TABLE exhibits (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id),
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    framing TEXT NOT NULL,
    attribution TEXT NOT NULL,
    geometry TEXT NOT NULL,
    height REAL NOT NULL,
    published_at INTEGER NOT NULL,
    withdrawn_at INTEGER
  );
  CREATE INDEX exhibits_public ON exhibits(withdrawn_at, published_at);
  CREATE INDEX exhibits_work ON exhibits(work_id);
  CREATE TABLE favorites (
    user_id TEXT NOT NULL REFERENCES users(id),
    exhibit_id TEXT NOT NULL REFERENCES exhibits(id),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, exhibit_id)
  );
  `,
];

export type DB = Database.Database;

export function openDatabase(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "stillwood.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 2000");
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]!);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  return db;
}
