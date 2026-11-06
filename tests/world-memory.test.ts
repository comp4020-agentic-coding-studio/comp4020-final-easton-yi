// Bounded-memory contracts from the 2026-11-03 incident (docs/evidence/world/memory-incident.md):
// the far/detail asset split, direct-to-cell decoding, and the generator's
// per-landmark processes, checkpoints, atomic outputs and resume.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LANDMARKS, buildLandmark } from "../src/world/landmarks.ts";
import { FAR_CHAINS, decodeFar, decodeLandmark, encodeFar, encodeLandmark } from "../src/world/format.ts";
import { cellBytes, detailToCells, farToChains } from "../src/client/world/decode.ts";
import { WORLD_QUALITY } from "../src/client/world/quality-world.ts";

const L14 = buildLandmark(LANDMARKS.find((l) => l.id === "L14")!);
const L03 = buildLandmark(LANDMARKS.find((l) => l.id === "L03")!);

describe("far asset (always resident)", () => {
  it("holds the strongest chains of the detail asset, capped, in importance order", () => {
    for (const r of [L14, L03]) {
      const enc = encodeLandmark(r);
      const full = decodeLandmark(enc.buffer);
      const far = decodeFar(encodeFar(enc.buffer));
      expect(far.count).toBe(Math.min(FAR_CHAINS, full.chains.count));
      expect(far.long).toBeLessThanOrEqual(far.count);
      // a prefix of the same list: identical leading entries
      expect(Array.from(far.len.subarray(0, 50))).toEqual(Array.from(full.chains.len.subarray(0, 50)));
      expect(Array.from(far.pos.subarray(0, 30))).toEqual(Array.from(full.chains.pos.subarray(0, 30)));
    }
    // L03 has ~26k chains: the far file is the cap, not the whole list
    expect(decodeFar(encodeFar(encodeLandmark(L03).buffer)).count).toBe(FAR_CHAINS);
  });

  it("covers every tier's mid/far/silhouette prefix", () => {
    for (const q of Object.values(WORLD_QUALITY)) {
      expect(q.midChains).toBeLessThanOrEqual(FAR_CHAINS);
      expect(q.farChains).toBeLessThanOrEqual(q.midChains);
      expect(q.silhouetteChains).toBeLessThanOrEqual(q.farChains);
    }
  });

  it("decodes to finite world-space instances", () => {
    const c = farToChains(encodeFar(encodeLandmark(L14).buffer), { position: [100, 20, -50], yaw: 0.7 });
    expect(c.pos.length).toBe(c.count * 3);
    expect(c.pos.every(Number.isFinite) && c.quat.every(Number.isFinite) && c.scale.every((v) => v > 0)).toBe(true);
    for (let i = 0; i < c.count; i++) expect(Math.hypot(c.quat[i * 4]!, c.quat[i * 4 + 1]!, c.quat[i * 4 + 2]!, c.quat[i * 4 + 3]!)).toBeCloseTo(1, 4);
  });

  it("rejects a truncated or foreign file", () => {
    const far = encodeFar(encodeLandmark(L14).buffer);
    expect(() => decodeFar(far.slice(0, 40))).toThrow(/truncated/);
    expect(() => decodeFar(encodeLandmark(L14).buffer)).toThrow(/not a far/);
  });
});

describe("detail asset → cells (fetched near the camera, evicted after)", () => {
  it("keeps every piece exactly once, tier-sorted within each cell's stock", () => {
    const { cells, count } = detailToCells(encodeLandmark(L03).buffer, { position: [0, 0, 0], yaw: 0.3 }, 40);
    expect(count).toBe(L03.count);
    let pieces = 0;
    for (const c of cells) {
      expect(Number.isFinite(c.radius) && c.radius > 0).toBe(true);
      for (const st of c.stocks) {
        const n = st.seed.length;
        pieces += n;
        expect(st.pos.length).toBe(n * 3);
        expect(st.tierEnd[0]).toBeLessThanOrEqual(st.tierEnd[1]);
        expect(st.tierEnd[1]).toBeLessThanOrEqual(st.tierEnd[2]);
        expect(st.tierEnd[2]).toBe(n);
      }
    }
    expect(pieces).toBe(L03.count);
  });

  it("groups each cell's D pieces into octant runs: every piece once, inside its octant's sphere, tiers kept", () => {
    const { cells } = detailToCells(encodeLandmark(L03).buffer, { position: [0, 0, 0], yaw: 0.3 }, 40);
    let withD = 0;
    for (const c of cells) {
      const st = c.stocks[2]!;
      if (!st.seed.length) {
        expect(c.dOct).toBeUndefined();
        continue;
      }
      withD++;
      const runs = c.dOct!;
      // runs tile [0, n) in order
      let at = 0;
      const perTier = [0, 0, 0];
      for (const o of runs) {
        expect(o.start).toBe(at);
        expect(o.start).toBeLessThanOrEqual(o.tierEnd[0]);
        expect(o.tierEnd[0]).toBeLessThanOrEqual(o.tierEnd[1]);
        expect(o.tierEnd[1]).toBeLessThanOrEqual(o.tierEnd[2]);
        perTier[0] += o.tierEnd[0] - o.start;
        perTier[1] += o.tierEnd[1] - o.tierEnd[0];
        perTier[2] += o.tierEnd[2] - o.tierEnd[1];
        for (let i = o.start; i < o.tierEnd[2]; i++) {
          const d = Math.hypot(st.pos[i * 3]! - o.centre[0], st.pos[i * 3 + 1]! - o.centre[1], st.pos[i * 3 + 2]! - o.centre[2]);
          expect(d).toBeLessThanOrEqual(o.radius + 1e-3);
          // and inside the cell, so an octant is never nearer than its cell (its level is a refinement)
          expect(Math.hypot(st.pos[i * 3]! - c.centre[0], st.pos[i * 3 + 1]! - c.centre[1], st.pos[i * 3 + 2]! - c.centre[2])).toBeLessThanOrEqual(c.radius + 1e-3);
        }
        at = o.tierEnd[2];
      }
      expect(at).toBe(st.seed.length);
      // the cell's own tier counts are unchanged by the reordering
      expect(perTier).toEqual([st.tierEnd[0], st.tierEnd[1] - st.tierEnd[0], st.tierEnd[2] - st.tierEnd[1]]);
      expect(runs.length).toBeLessThanOrEqual(8);
    }
    expect(withD).toBeGreaterThan(10);
  });

  it("places every piece inside its own cell's bounding sphere", () => {
    const { cells } = detailToCells(encodeLandmark(L14).buffer, { position: [10, 5, 10], yaw: 1.1 }, 40);
    for (const c of cells) for (const st of c.stocks) for (let i = 0; i < st.seed.length; i++) {
      const d = Math.hypot(st.pos[i * 3]! - c.centre[0], st.pos[i * 3 + 1]! - c.centre[1], st.pos[i * 3 + 2]! - c.centre[2]);
      expect(d).toBeLessThanOrEqual(c.radius + 1e-3);
    }
  });

  it("stays well inside the per-tier residency byte budget for the heaviest building", () => {
    const L06 = buildLandmark(LANDMARKS.find((l) => l.id === "L06")!);
    const { cells } = detailToCells(encodeLandmark(L06).buffer, { position: [0, 0, 0], yaw: 0 }, 40);
    const bytes = cellBytes(cells);
    // the low tier keeps two such buildings within its budget
    expect(bytes * 2).toBeLessThan(WORLD_QUALITY.low.detailBytes);
  });
});

describe("generator: one process per landmark, checkpoints, resume", () => {
  const gen = (out: string, ...extra: string[]) => spawnSync(process.execPath, ["scripts/world/build-world.ts", out, "--quiet", ...extra], { encoding: "utf8" });

  it("reuses valid checkpoints, rebuilds only a corrupted landmark, and never leaves temp files", () => {
    const out = mkdtempSync(join(tmpdir(), "sw-gen-"));
    try {
      const first = gen(out);
      expect(first.status, first.stderr).toBe(0);
      const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
      expect(manifest.landmarks).toHaveLength(20);
      for (const l of manifest.landmarks) {
        expect(existsSync(join(out, l.asset.path))).toBe(true);
        expect(existsSync(join(out, l.far.path))).toBe(true);
        expect(existsSync(join(out, `${l.far.path}.br`))).toBe(true);
      }
      // plan: everything reused
      const plan = spawnSync(process.execPath, ["scripts/world/build-world.ts", out, "--plan"], { encoding: "utf8" });
      expect(plan.stdout.match(/ reuse /g)?.length).toBe(20);
      // corrupt one detail asset: only that landmark is rebuilt, and the result is byte-identical
      const l05 = manifest.landmarks.find((l: { id: string }) => l.id === "L05");
      const before = readFileSync(join(out, l05.asset.path));
      truncateSync(join(out, l05.asset.path), 100);
      const plan2 = spawnSync(process.execPath, ["scripts/world/build-world.ts", out, "--plan"], { encoding: "utf8" });
      expect(plan2.stdout).toMatch(/L05 {2}build .*detail asset missing or changed/);
      expect(plan2.stdout.match(/ reuse /g)?.length).toBe(19);
      const again = gen(out);
      expect(again.status, again.stderr).toBe(0);
      expect(readFileSync(join(out, l05.asset.path)).equals(before)).toBe(true);
      expect(JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")).totals.pieces).toBe(manifest.totals.pieces);
      // a stale temp file from an interrupted run is cleaned, never published
      writeFileSync(join(out, "landmarks", "L01.deadbeef.bin.tmp-123"), "partial");
      expect(gen(out).status).toBe(0);
      const all = readdirSync(join(out, "landmarks"));
      expect(all.some((f) => f.includes(".tmp-"))).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 180_000);

  it("keeps the last good manifest when a selected landmark has no valid output", () => {
    const out = mkdtempSync(join(tmpdir(), "sw-gen-"));
    try {
      // nothing built yet, and --only builds one: the manifest must not be written
      const r = gen(out, "--only", "L14");
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/no valid output for L01/);
      expect(existsSync(join(out, "manifest.json"))).toBe(false);
      // the one landmark that was built has a checkpoint
      expect(existsSync(join(out, ".checkpoints", "L14.json"))).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
