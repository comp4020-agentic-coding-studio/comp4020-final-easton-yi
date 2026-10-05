// Prepared queries over the coordinator's single connection. World envelopes
// (native snapshot + app metadata captured at the same tick) carry a checksum
// that is verified before any use (OPS-01).
import { createHash, randomUUID } from "node:crypto";
import type { DB } from "../db/db.ts";
import { ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION, type PhysicsConfig } from "../../shared/config.ts";
import type { StickMeta } from "./physics.ts";
import { AppError } from "../errors.ts";

export interface EnvelopeMeta {
  sticks: StickMeta[];
  tick: number;
  tableCollider: number;
  /** Motion from an interrupted push: best height stays suppressed until it settles. */
  pushTainted: boolean;
  moving: boolean;
}

export interface Envelope {
  blob: Uint8Array;
  meta: EnvelopeMeta;
  engine: string;
  configVersion: number;
  schemaVersion: number;
  checksum: string;
}

export const checksum = (blob: Uint8Array, meta: string): string =>
  createHash("sha256").update(blob).update("\0").update(meta).digest("hex");

export const makeEnvelope = (blob: Uint8Array, meta: EnvelopeMeta, cfg: PhysicsConfig): Envelope => ({
  blob,
  meta,
  engine: ENGINE_VERSION,
  configVersion: cfg.physicsConfigVersion,
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  checksum: checksum(blob, JSON.stringify(meta)),
});

interface EnvelopeRow {
  blob: Buffer;
  meta: string;
  tick: number;
  engine: string;
  config_version: number;
  schema_version: number;
  checksum: string;
}

export function readEnvelope(row: EnvelopeRow): Envelope {
  if (checksum(row.blob, row.meta) !== row.checksum) {
    throw new AppError("INCOMPATIBLE", "Saved world failed its integrity check");
  }
  if (row.engine !== ENGINE_VERSION || row.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    throw new AppError("INCOMPATIBLE", `Saved world uses ${row.engine} schema ${row.schema_version}, which this server cannot step`);
  }
  return {
    blob: new Uint8Array(row.blob.buffer, row.blob.byteOffset, row.blob.byteLength),
    meta: JSON.parse(row.meta) as EnvelopeMeta,
    engine: row.engine,
    configVersion: row.config_version,
    schemaVersion: row.schema_version,
    checksum: row.checksum,
  };
}

export interface UserRow {
  id: string;
  handle: string;
  display_name: string;
  pw_hash: string;
  recovery_digest: string;
}

export interface WorkRow {
  id: string;
  owner_id: string;
  title: string;
  archived: number;
  world_epoch: number;
  command_seq: number;
  best_height: number;
  stable_height: number;
  stick_count: number;
  physics_config: string;
  physics_config_version: number;
  created_at: number;
  updated_at: number;
}

export type Store = ReturnType<typeof createStore>;

export function createStore(db: DB) {
  const q = {
    userByHandle: db.prepare<[string], UserRow>("SELECT * FROM users WHERE handle = ?"),
    userById: db.prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?"),
    insertUser: db.prepare(
      "INSERT INTO users (id, handle, display_name, pw_hash, recovery_digest, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    insertSession: db.prepare(
      "INSERT INTO sessions (token_digest, user_id, csrf, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    session: db.prepare<
      [string],
      { token_digest: string; user_id: string; csrf: string; expires_at: number; last_seen: number; revoked_at: number | null }
    >("SELECT * FROM sessions WHERE token_digest = ?"),
    touchSession: db.prepare("UPDATE sessions SET last_seen = ? WHERE token_digest = ?"),
    revokeSession: db.prepare("UPDATE sessions SET revoked_at = ? WHERE token_digest = ? AND revoked_at IS NULL"),
    revokeUserSessions: db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"),
    insertWork: db.prepare(
      `INSERT INTO works (id, owner_id, title, physics_config, physics_config_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    work: db.prepare<[string], WorkRow>("SELECT * FROM works WHERE id = ?"),
    insertMember: db.prepare("INSERT OR IGNORE INTO memberships (work_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)"),
    member: db.prepare<[string, string], { role: "owner" | "editor"; joined_at: number }>(
      "SELECT role, joined_at FROM memberships WHERE work_id = ? AND user_id = ?",
    ),
    members: db.prepare<[string], { user_id: string; role: "owner" | "editor"; joined_at: number; display_name: string; handle: string }>(
      `SELECT m.user_id, m.role, m.joined_at, u.display_name, u.handle FROM memberships m
       JOIN users u ON u.id = m.user_id WHERE m.work_id = ? ORDER BY m.joined_at, m.user_id`,
    ),
    removeMember: db.prepare("DELETE FROM memberships WHERE work_id = ? AND user_id = ? AND role = 'editor'"),
    worksForUser: db.prepare<[string], WorkRow & { role: "owner" | "editor" }>(
      `SELECT w.*, m.role FROM works w JOIN memberships m ON m.work_id = w.id
       WHERE m.user_id = ? ORDER BY w.updated_at DESC`,
    ),
    ownedCount: db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM works WHERE owner_id = ?"),
    upsertState: db.prepare(
      `INSERT INTO work_states (work_id, blob, meta, tick, engine, config_version, schema_version, checksum, moving, saved_at)
       VALUES (@work_id, @blob, @meta, @tick, @engine, @config_version, @schema_version, @checksum, @moving, @saved_at)
       ON CONFLICT(work_id) DO UPDATE SET blob = excluded.blob, meta = excluded.meta, tick = excluded.tick,
         engine = excluded.engine, config_version = excluded.config_version, schema_version = excluded.schema_version,
         checksum = excluded.checksum, moving = excluded.moving, saved_at = excluded.saved_at`,
    ),
    copyToPrevious: db.prepare(
      `INSERT INTO previous_work_states SELECT * FROM work_states WHERE work_id = ?
       ON CONFLICT(work_id) DO UPDATE SET blob = excluded.blob, meta = excluded.meta, tick = excluded.tick,
         engine = excluded.engine, config_version = excluded.config_version, schema_version = excluded.schema_version,
         checksum = excluded.checksum, moving = excluded.moving, saved_at = excluded.saved_at`,
    ),
    state: db.prepare<[string], EnvelopeRow & { moving: number; saved_at: number }>("SELECT * FROM work_states WHERE work_id = ?"),
    previousState: db.prepare<[string], EnvelopeRow & { moving: number; saved_at: number }>(
      "SELECT * FROM previous_work_states WHERE work_id = ?",
    ),
    updateWorkCounters: db.prepare(
      `UPDATE works SET world_epoch = @epoch, command_seq = @seq, best_height = MAX(best_height, @best),
       stable_height = @stable, stick_count = @count, updated_at = @now WHERE id = @id`,
    ),
    receipt: db.prepare<
      [string, string],
      { work_id: string; kind: string; digest: string; outcome: string; code: string | null; response: string }
    >("SELECT * FROM command_receipts WHERE actor_id = ? AND command_id = ?"),
    insertReceipt: db.prepare(
      `INSERT INTO command_receipts (actor_id, command_id, work_id, kind, digest, outcome, code, seq, epoch, response, committed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
  };

  const writeState = (workId: string, env: Envelope, now: number): void => {
    q.upsertState.run({
      work_id: workId,
      blob: Buffer.from(env.blob.buffer, env.blob.byteOffset, env.blob.byteLength),
      meta: JSON.stringify(env.meta),
      tick: env.meta.tick,
      engine: env.engine,
      config_version: env.configVersion,
      schema_version: env.schemaVersion,
      checksum: env.checksum,
      moving: env.meta.moving ? 1 : 0,
      saved_at: now,
    });
  };

  return {
    db,
    q,
    writeState,
    tx<T>(f: () => T): T {
      return db.transaction(f)();
    },
    newId: (): string => randomUUID(),
  };
}
