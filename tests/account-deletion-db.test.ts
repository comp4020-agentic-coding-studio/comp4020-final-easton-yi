// ADR-0007 at the database level: migration 3 on a database that already holds
// data, and the foreign keys that make a deleted account or work impossible to
// write back. Real migrations on disposable files; no server.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { MIGRATIONS, migrate, openDatabase } from "../src/server/db/db.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const disposable = (): string => {
  const d = mkdtempSync(join(tmpdir(), "stillwood-acctdb-"));
  dirs.push(d);
  return d;
};

const U = "00000000-0000-4000-8000-0000000000aa";
const V = "00000000-0000-4000-8000-0000000000bb";
const W = "00000000-0000-4000-8000-000000000001";

function seed(db: Database.Database): void {
  db.prepare("INSERT INTO users (id, handle, display_name, pw_hash, recovery_digest, created_at) VALUES (?, ?, ?, 'x', 'y', 1)").run(U, "owner", "Owner");
  db.prepare("INSERT INTO users (id, handle, display_name, pw_hash, recovery_digest, created_at) VALUES (?, ?, ?, 'x', 'y', 1)").run(V, "editor", "Editor");
  db.prepare("INSERT INTO works (id, owner_id, title, physics_config, physics_config_version, created_at, updated_at) VALUES (?, ?, 'W', '{}', 2, 1, 1)").run(W, U);
  db.prepare("INSERT INTO memberships (work_id, user_id, role, joined_at) VALUES (?, ?, 'owner', 1), (?, ?, 'editor', 1)").run(W, U, W, V);
  db.prepare(
    `INSERT INTO work_states (work_id, blob, meta, tick, engine, config_version, schema_version, checksum, moving, saved_at)
     VALUES (?, x'00', '{}', 1, 'e', 1, 1, 'c', 0, 1)`,
  ).run(W);
  db.prepare(
    `INSERT INTO snapshots (id, work_id, creator_id, kind, title, blob, meta, tick, engine, config_version, schema_version,
      checksum, height, stick_count, source_epoch, source_seq, stable, geometry, created_at)
     VALUES ('s1', ?, ?, 'named', 'by editor', x'0102', '{}', 1, 'e', 1, 1, 'c', 1.5, 2, 1, 3, 1, '{"sticks":[]}', 7)`,
  ).run(W, V);
  db.prepare(
    `INSERT INTO exhibits (id, work_id, snapshot_id, title, description, framing, attribution, geometry, height, published_at)
     VALUES ('e1', ?, 's1', 't', '', '{}', '["Owner","Editor"]', '{}', 1.5, 2)`,
  ).run(W);
}

describe("migration 3", () => {
  it("keeps every snapshot and its exhibit link, and makes the creator nullable", () => {
    const dir = disposable();
    const old = new Database(join(dir, "stillwood.db"));
    migrate(old, 2);
    old.pragma("foreign_keys = ON");
    seed(old);
    const before = old.prepare("SELECT * FROM snapshots").all();
    old.close();

    const db = openDatabase(dir);
    try {
      expect(db.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.prepare("SELECT * FROM snapshots").all()).toEqual(before);
      expect(db.pragma("foreign_key_check")).toEqual([]);
      expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
      // exhibits still reference the rebuilt table
      expect(() =>
        db.prepare(
          "INSERT INTO exhibits (id, work_id, snapshot_id, title, description, framing, attribution, geometry, height, published_at) VALUES ('e2', ?, 'missing', 't', '', '{}', '[]', '{}', 0, 1)",
        ).run(W),
      ).toThrow(/FOREIGN KEY/);
      db.prepare("UPDATE snapshots SET creator_id = NULL WHERE creator_id = ?").run(V);
      expect(db.prepare("SELECT creator_id FROM snapshots WHERE id = 's1'").get()).toEqual({ creator_id: null });
      // but still can't name an account that doesn't exist
      expect(() => db.prepare("UPDATE snapshots SET creator_id = 'nobody' WHERE id = 's1'").run()).toThrow(/FOREIGN KEY/);
      const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all().map((r) => (r as { name: string }).name);
      expect(triggers).toEqual(["exhibits_guard_insert", "snapshots_guard_insert", "work_states_guard_insert", "work_states_guard_update"]);
    } finally {
      db.close();
    }
  });

  it("refuses to commit a migration that would leave a dangling reference", () => {
    const dir = disposable();
    const old = new Database(join(dir, "stillwood.db"));
    migrate(old, 2);
    seed(old);
    // a row an older bug could have left behind, written with enforcement off
    old.prepare("INSERT INTO favorites (user_id, exhibit_id, created_at) VALUES ('ghost', 'e1', 1)").run();
    old.close();
    expect(() => openDatabase(dir)).toThrow(/foreign-key violations/);
    const check = new Database(join(dir, "stillwood.db"), { readonly: true });
    expect(check.pragma("user_version", { simple: true })).toBe(2);
    check.close();
  });
});

describe("foreign keys as the resurrection guard", () => {
  it("refuse a late save, session, membership or version for a deleted account or work", () => {
    const db = openDatabase(disposable());
    try {
      seed(db);
      expect(() => db.prepare("DELETE FROM users WHERE id = ?").run(U)).toThrow(/FOREIGN KEY/); // children first, or nothing
      db.transaction(() => {
        for (const t of ["exhibits", "snapshots", "work_states", "memberships"]) db.prepare(`DELETE FROM ${t} WHERE work_id = ?`).run(W);
        db.prepare("DELETE FROM works WHERE id = ?").run(W);
        db.prepare("DELETE FROM users WHERE id = ?").run(U);
      })();
      // the upsert a stale room's checkpoint would run
      expect(() =>
        db.prepare(
          `INSERT INTO work_states (work_id, blob, meta, tick, engine, config_version, schema_version, checksum, moving, saved_at)
           VALUES (?, x'00', '{}', 2, 'e', 1, 1, 'c', 0, 2)
           ON CONFLICT(work_id) DO UPDATE SET tick = excluded.tick, saved_at = excluded.saved_at`,
        ).run(W),
      ).toThrow(/FOREIGN KEY/);
      expect(db.prepare("UPDATE works SET stick_count = 5 WHERE id = ?").run(W).changes).toBe(0); // counters can't revive it
      expect(() => db.prepare("INSERT INTO sessions (token_digest, user_id, csrf, created_at, expires_at, last_seen) VALUES ('d', ?, 'c', 1, 9, 1)").run(U)).toThrow(/FOREIGN KEY/);
      expect(() => db.prepare("INSERT INTO works (id, owner_id, title, physics_config, physics_config_version, created_at, updated_at) VALUES ('w2', ?, 'x', '{}', 2, 1, 1)").run(U)).toThrow(
        /FOREIGN KEY/,
      );
      expect(() => db.prepare("INSERT INTO favorites (user_id, exhibit_id, created_at) VALUES (?, 'x', 1)").run(U)).toThrow(/FOREIGN KEY/);
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });
});
