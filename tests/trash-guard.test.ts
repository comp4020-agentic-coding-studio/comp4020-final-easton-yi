// SAVE-10: the durable guard. The migrations' triggers must refuse any write
// that would change or revive a trashed work's world, versions or exhibits,
// while still allowing the reads, restore and permanent-delete paths.
// Runs the real migrations on a disposable database; no server.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, type DB } from "../src/server/db/db.ts";

let dir: string;
let db: DB;
const W = "00000000-0000-4000-8000-000000000001";
const U = "00000000-0000-4000-8000-0000000000aa";
const t = 1;

const insertState = () =>
  db
    .prepare(
      `INSERT INTO work_states (work_id, blob, meta, tick, engine, config_version, schema_version, checksum, moving, saved_at)
       VALUES (?, x'00', '{}', 1, 'e', 1, 1, 'c', 0, ?)
       ON CONFLICT(work_id) DO UPDATE SET tick = excluded.tick + 1, saved_at = excluded.saved_at`,
    )
    .run(W, t);
const insertSnapshot = (id: string) =>
  db
    .prepare(
      `INSERT INTO snapshots (id, work_id, creator_id, kind, title, blob, meta, tick, engine, config_version, schema_version,
        checksum, height, stick_count, source_epoch, source_seq, stable, geometry, created_at)
       VALUES (?, ?, ?, 'named', 'v', x'00', '{}', 1, 'e', 1, 1, 'c', 0, 0, 1, 0, 1, '{}', ?)`,
    )
    .run(id, W, U, t);
const insertExhibit = (id: string, snapshotId: string) =>
  db
    .prepare(
      `INSERT INTO exhibits (id, work_id, snapshot_id, title, description, framing, attribution, geometry, height, published_at)
       VALUES (?, ?, ?, 't', '', '{}', '[]', '{}', 0, ?)`,
    )
    .run(id, W, snapshotId, t);
const setTrashed = (on: boolean) => db.prepare("UPDATE works SET trashed_at = ? WHERE id = ?").run(on ? t : null, W);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "stillwood-guard-"));
  db = openDatabase(dir);
  db.prepare("INSERT INTO users (id, handle, display_name, pw_hash, recovery_digest, created_at) VALUES (?, 'guard', 'G', 'x', 'y', ?)").run(U, t);
  db.prepare("INSERT INTO works (id, owner_id, title, physics_config, physics_config_version, created_at, updated_at) VALUES (?, ?, 'W', '{}', 2, ?, ?)").run(W, U, t, t);
  insertState();
  insertSnapshot("s-before");
  insertExhibit("e-before", "s-before");
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("trash guard triggers", () => {
  it("are installed by the migrations", () => {
    expect(db.pragma("user_version", { simple: true })).toBe(2);
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all().map((r) => (r as { name: string }).name);
    expect(names).toEqual(["exhibits_guard_insert", "snapshots_guard_insert", "work_states_guard_insert", "work_states_guard_update"]);
  });

  it("refuse checkpoints, upserts, versions and exhibits for a trashed work", () => {
    setTrashed(true);
    const before = db.prepare("SELECT tick, saved_at FROM work_states WHERE work_id = ?").get(W);
    expect(() => insertState()).toThrow(/WORK_TRASHED/); // the upsert a late checkpoint would run
    expect(() => db.prepare("UPDATE work_states SET tick = 99 WHERE work_id = ?").run(W)).toThrow(/WORK_TRASHED/);
    expect(() => insertSnapshot("s-late")).toThrow(/WORK_TRASHED/);
    expect(() => insertExhibit("e-late", "s-before")).toThrow(/WORK_TRASHED/);
    expect(db.prepare("SELECT tick, saved_at FROM work_states WHERE work_id = ?").get(W)).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE work_id = ?").get(W)).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM exhibits WHERE work_id = ?").get(W)).toEqual({ n: 1 });
  });

  it("abort the whole transaction, not just the statement", () => {
    expect(() =>
      db.transaction(() => {
        db.prepare("UPDATE exhibits SET withdrawn_at = ? WHERE work_id = ?").run(t, W);
        insertSnapshot("s-in-tx");
      })(),
    ).toThrow(/WORK_TRASHED/);
    expect(db.prepare("SELECT withdrawn_at FROM exhibits WHERE id = 'e-before'").get()).toEqual({ withdrawn_at: null });
  });

  it("still allow withdrawal, reads and the permanent-delete cascade on a trashed work", () => {
    expect(() => db.prepare("UPDATE exhibits SET withdrawn_at = ? WHERE work_id = ?").run(t, W)).not.toThrow();
    expect(db.prepare("SELECT COUNT(*) AS n FROM work_states WHERE work_id = ?").get(W)).toEqual({ n: 1 });
    // deletes aren't guarded, so purge works; done on a copy of the rows inside a rolled-back transaction
    const purge = db.transaction(() => {
      db.prepare("DELETE FROM exhibits WHERE work_id = ?").run(W);
      db.prepare("DELETE FROM snapshots WHERE work_id = ?").run(W);
      db.prepare("DELETE FROM work_states WHERE work_id = ?").run(W);
      throw new Error("rollback");
    });
    expect(() => purge()).toThrow("rollback");
    expect(db.prepare("SELECT COUNT(*) AS n FROM exhibits WHERE work_id = ?").get(W)).toEqual({ n: 1 });
  });

  it("let writes through again once the owner restores", () => {
    setTrashed(false);
    expect(() => insertState()).not.toThrow();
    expect(() => insertSnapshot("s-after")).not.toThrow();
    expect(() => insertExhibit("e-after", "s-after")).not.toThrow();
  });
});
