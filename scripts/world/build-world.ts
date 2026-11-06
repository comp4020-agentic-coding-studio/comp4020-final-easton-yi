#!/usr/bin/env node
// Offline world generator (main prompt §9, scripts/build-world). Runs the 20
// recipes with the fixed seed, validates every building, resolves the layout,
// samples the terrain, and writes same-origin static assets:
//
//   <out>/manifest.json                 versions, hashes, placements, collision, routes
//   <out>/landmarks/Lxx.<hash>.bin      per-piece transforms (SWLM v2), fetched near the camera
//   <out>/landmarks/Lxx.far.<hash>.bin  strongest merged chains (SWLF v1), always resident
//   <out>/bom/Lxx.json                  course-level bill of materials
//   <out>/terrain.<hash>.bin            quantized chunk heightfields
//   *.br / *.gz                         pre-compressed siblings (served by @fastify/static)
//
// Bounded memory (docs/evidence/world/memory-incident.md): this coordinator
// never builds geometry. Each landmark is built by its own short-lived child
// (build-landmark.ts), one at a time; the coordinator keeps only small
// summaries. A landmark is reused from its checkpoint when the recipe version,
// generator version and the output files' hashes all still match; outputs are
// written to temp files and renamed; the manifest is written last, so a
// cancelled run never replaces the last good manifest with a partial one.
// Compression runs one file at a time, after the children.
//
// Usage: node scripts/world/build-world.ts [outDir = .world-cache/world-data] [options]
//   --publish <dir>     after a successful run, copy the live files (not checkpoints) to <dir>, manifest last
//                       (pnpm build publishes to dist/client/world-data, which vite empties on every build)
//   --report <dir>      write the evidence tables (landmarks.md, validation.json, …)
//   --only L05[,L06]    build only these landmarks (the rest must have valid checkpoints)
//   --fresh             ignore checkpoints (rebuild every landmark)
//   --plan              print what would be built or reused, build nothing
//   --validate          check the existing outputs against the checkpoint hashes, build nothing
//   --child-heap-mib N  V8 old-space cap per landmark child (default 2048; RSS is supervised separately)
//   --quiet
// Generation is build-time work only; the server never runs it. For local runs
// wrap it in scripts/world/supervise.ts (pnpm build:world does).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { LANDMARKS, RECIPE_VERSION } from "../../src/world/landmarks.ts";
import { fnv1a } from "../../src/world/format.ts";
import { home, placements, toWorld } from "../../src/world/layout.ts";
import { CHUNK, CHUNKS_X, CHUNKS_Z, COAST, REGIONS, ROUTE_LENGTH, WORLD_MIN, WORLD_SEED, chunkHeights, designToS, heightAt, regionAtS, routeAt, nearestOnRoute, rivers } from "../../src/world/terrain.ts";
import { ManifestS, parseManifest, type WorldManifest } from "../../src/world/manifest.ts";
import { REVEALS, SIDE_ROUTES, checkReveal, checkSideRoute, flightHeights, routeEye, sidePoints } from "../../src/world/routes.ts";
import type { Collider } from "../../src/world/core.ts";
import { terrainHidden } from "../../src/world/viewcheck.ts";
import { courtyard } from "../../src/world/courtyard.ts";
import { groupToWorld, type ResolvedGroup } from "../../src/world/candles.ts";

/** Bump when the generator's output for an unchanged recipe changes (format, encoding, file split). */
const GENERATOR_VERSION = "world-gen/4";

const args = process.argv.slice(2);
const flagValue = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const valueFlags = new Set(["--report", "--only", "--child-heap-mib", "--publish"]);
const out = resolve(args.find((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1] ?? "")) ?? ".world-cache/world-data");
const publishDir = flagValue("--publish") ? resolve(flagValue("--publish")!) : null;
const reportDir = flagValue("--report") ?? null;
const only = flagValue("--only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const fresh = args.includes("--fresh");
const planOnly = args.includes("--plan");
const validateOnly = args.includes("--validate");
const childHeap = Number(flagValue("--child-heap-mib") ?? 2048);
const quiet = args.includes("--quiet");
const log = (...a: unknown[]): void => void (!quiet && console.log(...a));
const MiB = 1024 * 1024;

const t0 = performance.now();
const ckDir = join(out, ".checkpoints");
mkdirSync(join(out, "landmarks"), { recursive: true });
mkdirSync(join(out, "bom"), { recursive: true });
mkdirSync(ckDir, { recursive: true });
// leftovers of an interrupted run are never mistaken for outputs
for (const dir of [out, join(out, "landmarks"), join(out, "bom"), ckDir]) for (const f of readdirSync(dir)) if (/\.tmp-\d+$/.test(f)) rmSync(join(dir, f), { force: true });

type Summary = {
  id: string;
  recipeVersion: string;
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  size: number[];
  deviation: number[];
  count: number;
  totals: { B: number; M: number; D: number; byTier: [number, number, number] };
  contentHash: string;
  bounds: { min: number[]; max: number[] };
  asset: { path: string; hash: string; bytes: number };
  far: { path: string; hash: string; bytes: number; chains: number };
  bands: string[];
  components: string[];
  courses: [string, string, number][];
  shells: { shape: "box" | "cyl"; c: number[]; h: number[]; q: number[]; kind: "shade" | "glass" | "plank" }[];
  water: { c: number[]; hx: number; hz: number; yaw: number; speed: number; note: string }[];
  colliders: Collider[];
  entries: { id: string; a: number[]; b: number[]; width: number; height: number; main: boolean; note: string }[];
  viewpoints: { id: string; kind: "ground" | "interior" | "high" | "detail" | "side"; eye: number[]; yaw: number; pitch: number; note?: string }[];
  safePoints: { id: string; feet: number[]; yaw: number }[];
  features: string[];
  revisions: { item: string; original: string; revised: string; reason: string; impact: string }[];
  candles: { intent: string; groups: ResolvedGroup[]; dropped: { id: string; reason: string }[]; zones: { id: string; min: number[]; max: number[] }[] };
  stages: { stage: string; ms: number; mem: Record<string, number> }[];
  peak: Record<string, number>;
};
type Checkpoint = { key: string; summary: Summary };

/**
 * Hash of the generator's own source (src/world/**, these scripts): a change to any recipe, part, order or the
 * encoder invalidates the checkpoints even if nobody bumped RECIPE_VERSION. (Coarse on purpose: one edit rebuilds
 * all 20, which takes under 30 s, rather than risk reusing output from code that no longer exists.)
 */
const SOURCE_HASH = ((): string => {
  const root = new URL("../../", import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = join(dir, f.name);
      if (f.isDirectory()) walk(rel);
      else if (f.name.endsWith(".ts")) files.push(rel);
    }
  };
  walk("src/world");
  files.push("scripts/world/build-world.ts", "scripts/world/build-landmark.ts");
  const parts = files.map((f) => `${f}:${fnv1a(readFileSync(join(root, f)))}`);
  return fnv1a(new TextEncoder().encode(parts.join("\n")));
})();
const keyOf = (id: string): string => `${id}|${RECIPE_VERSION}|${GENERATOR_VERSION}|${SOURCE_HASH}`;
const hashFile = (rel: string): string | null => {
  const p = join(out, rel);
  return existsSync(p) ? fnv1a(readFileSync(p)) : null;
};
/** A checkpoint is valid when its key matches and its files exist with the recorded hashes. */
function loadCheckpoint(id: string): { ck: Checkpoint | null; why: string } {
  const p = join(ckDir, `${id}.json`);
  if (!existsSync(p)) return { ck: null, why: "no checkpoint" };
  let ck: Checkpoint;
  try {
    ck = JSON.parse(readFileSync(p, "utf8")) as Checkpoint;
  } catch {
    return { ck: null, why: "unreadable checkpoint" };
  }
  if (ck.key !== keyOf(id)) return { ck: null, why: `stale key (${ck.key})` };
  if (hashFile(ck.summary.asset.path) !== ck.summary.asset.hash) return { ck: null, why: "detail asset missing or changed" };
  if (hashFile(ck.summary.far.path) !== ck.summary.far.hash) return { ck: null, why: "far asset missing or changed" };
  if (!existsSync(join(out, `bom/${id}.json`))) return { ck: null, why: "BOM missing" };
  return { ck, why: "valid" };
}

const ids = LANDMARKS.map((l) => l.id);
if (only) for (const id of only) if (!ids.includes(id)) throw new Error(`--only: unknown landmark ${id}`);
const plan = ids.map((id) => {
  const { ck, why } = loadCheckpoint(id);
  const wanted = only ? only.includes(id) : true;
  const build = wanted && (fresh || !ck);
  return { id, ck, why, build };
});

if (planOnly || validateOnly) {
  for (const p of plan) log(`${p.id}  ${p.build ? "build" : p.ck ? "reuse" : "skip (not selected)"}  · checkpoint: ${p.why}${p.ck ? ` · ${p.ck.summary.count.toLocaleString("en")} pieces, peak child RSS ${p.ck.summary.peak.rssMiB} MiB` : ""}`);
  const bad = plan.filter((p) => !p.ck);
  if (validateOnly) {
    log(bad.length ? `invalid or missing: ${bad.map((p) => p.id).join(", ")}` : "all 20 checkpoints valid");
    process.exit(bad.length ? 1 : 0);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- landmarks: one child process each, sequentially
const self = new URL("./build-landmark.ts", import.meta.url).pathname;
const summaries = new Map<string, Summary>();
for (const p of plan) {
  if (!p.build) {
    if (p.ck) summaries.set(p.id, p.ck.summary);
    continue;
  }
  const summaryPath = join(ckDir, `${p.id}.summary.json`);
  rmSync(summaryPath, { force: true });
  const ts = performance.now();
  // the next landmark never starts before this child has exited (spawnSync)
  const r = spawnSync(process.execPath, [`--max-old-space-size=${childHeap}`, self, p.id, out, summaryPath], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0 || !existsSync(summaryPath)) {
    console.error(`${p.id}: landmark child failed (${r.signal ?? `exit ${r.status}`}); completed checkpoints are kept, the manifest is unchanged`);
    process.exit(r.status && r.status > 1 ? r.status : 1);
  }
  const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as Summary;
  rmSync(summaryPath, { force: true });
  const ck: Checkpoint = { key: keyOf(p.id), summary };
  const ckPath = join(ckDir, `${p.id}.json`);
  writeFileSync(`${ckPath}.tmp-${process.pid}`, JSON.stringify(ck));
  renameSync(`${ckPath}.tmp-${process.pid}`, ckPath);
  summaries.set(p.id, summary);
  log(`${p.id} ${(LANDMARKS.find((l) => l.id === p.id)!.title).padEnd(26)} ${String(summary.count).padStart(7)} pieces  ${summary.ok ? "ok" : "FAIL"}  ${((performance.now() - ts) / 1000).toFixed(1)} s  child peak RSS ${summary.peak.rssMiB} MiB`);
}
const missing = ids.filter((id) => !summaries.has(id));
if (missing.length) {
  console.error(`no valid output for ${missing.join(", ")} (build them, e.g. --only ${missing.join(",")}); manifest not written`);
  process.exit(1);
}

// ---------------------------------------------------------------- layout, terrain, manifest (small; in process)
const P = placements();
const r2 = (v: number): number => Math.round(v * 1000) / 1000;
const rv = (v: readonly number[]): [number, number, number] => [r2(v[0]!), r2(v[1]!), r2(v[2]!)];

/** Transform a local collider into world space (yaw composes, cylinders stay vertical). */
function colliderToWorld(c: Collider, p: (typeof P)[number]): Collider {
  const w = (v: readonly number[]): [number, number, number] => rv(toWorld(p, v));
  if (c.kind === "box") return { kind: "box", c: w(c.c), h: rv(c.h), yaw: r2(c.yaw + p.yaw) };
  if (c.kind === "cyl") return { kind: "cyl", c: w(c.c), r: r2(c.r), hy: r2(c.hy) };
  return { kind: "ramp", c: w(c.c), hx: r2(c.hx), hz: r2(c.hz), yaw: r2(c.yaw + p.yaw), y0: r2(c.y0 + p.position[1]), y1: r2(c.y1 + p.position[1]), floor: r2(c.floor + p.position[1]) };
}

const landmarks: WorldManifest["landmarks"] = [];
const failures: string[] = [];
let totalPieces = 0;
let highestTop = 0;
for (const def of LANDMARKS) {
  const s = summaries.get(def.id)!;
  if (!s.ok) failures.push(`${def.id}: ${s.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join("; ")}`);
  const p = P.find((q) => q.id === def.id)!;
  const lb = s.bounds;
  // high and side views see the building over the world's terrain (viewcheck.ts terrainHidden): a local view check
  // can't see a ridge standing between the eye and the building
  for (const vp of s.viewpoints.filter((v) => v.kind === "high" || v.kind === "side")) {
    const hid = terrainHidden(toWorld(p, vp.eye), lb, (q) => toWorld(p, q), heightAt);
    if (hid > 0.25) failures.push(`${def.id}: ${vp.kind} view: terrain hides ${(hid * 100).toFixed(0)} % of the building`);
  }
  const centre = [(lb.min[0]! + lb.max[0]!) / 2, (lb.min[1]! + lb.max[1]!) / 2, (lb.min[2]! + lb.max[2]!) / 2];
  const radius = Math.hypot(lb.max[0]! - centre[0]!, lb.max[1]! - centre[1]!, lb.max[2]! - centre[2]!);
  highestTop = Math.max(highestTop, p.position[1] + lb.max[1]!);
  totalPieces += s.count;
  landmarks.push({
    id: def.id,
    regionId: def.region,
    recipeVersion: RECIPE_VERSION,
    kind: "world-preset",
    title: def.title,
    inspiration: def.inspiration,
    period: def.period,
    organization: def.organization,
    targetSize: def.target,
    actualSize: rv(s.size),
    placement: { position: rv(p.position), yaw: r2(p.yaw), routeDistance: p.d, offset: p.offset },
    localBounds: { min: rv(lb.min), max: rv(lb.max) },
    radius: r2(radius),
    pieces: { total: s.count, B: s.totals.B, M: s.totals.M, D: s.totals.D, byTier: s.totals.byTier },
    asset: { path: s.asset.path, hash: s.asset.hash, bytes: s.asset.bytes, contentHash: s.contentHash },
    far: s.far,
    bands: s.bands,
    components: s.components,
    courses: s.courses,
    shells: s.shells.map((sh) => ({ shape: sh.shape, c: rv(sh.c), h: rv(sh.h), q: sh.q.map((x) => Math.round(x * 1e5) / 1e5) as [number, number, number, number], kind: sh.kind })),
    water: s.water.map((wtr) => ({ c: rv(toWorld(p, wtr.c)), hx: r2(wtr.hx), hz: r2(wtr.hz), yaw: r2(wtr.yaw + p.yaw), speed: wtr.speed, note: wtr.note })),
    collision: s.colliders.map((c) => colliderToWorld(c, p)),
    entries: s.entries.map((e) => ({ id: e.id, a: rv(toWorld(p, e.a)), b: rv(toWorld(p, e.b)), width: e.width, height: e.height, main: e.main, note: e.note })),
    viewpoints: s.viewpoints.map((vp) => ({ id: vp.id, kind: vp.kind, eye: rv(toWorld(p, vp.eye)), yaw: r2(vp.yaw + p.yaw), pitch: r2(vp.pitch), note: vp.note })),
    safePoints: s.safePoints.map((sp) => ({ id: `${def.id}-${sp.id}`, feet: rv(toWorld(p, sp.feet)), yaw: r2(sp.yaw + p.yaw) })),
    features: s.features,
    revisions: s.revisions,
    bom: { path: `bom/${def.id}.json` },
  });
}

// terrain: (n + 1)² u16 heights per chunk, all chunks concatenated in z-major order (≈ 0.8 MB; two passes, no per-chunk copies kept)
const n = 32;
const per = (n + 1) * (n + 1);
let hMin = Infinity;
let hMax = -Infinity;
for (let cz = 0; cz < CHUNKS_Z; cz++) for (let cx = 0; cx < CHUNKS_X; cx++) {
  for (const v of chunkHeights(cx, cz, n)) {
    if (v < hMin) hMin = v;
    if (v > hMax) hMax = v;
  }
}
hMin = Math.floor(hMin);
const heightScale = 65535 / (Math.ceil(hMax) - hMin);
const tq = new Uint16Array(CHUNKS_X * CHUNKS_Z * per);
for (let cz = 0; cz < CHUNKS_Z; cz++) for (let cx = 0; cx < CHUNKS_X; cx++) {
  const k = cz * CHUNKS_X + cx;
  const h = chunkHeights(cx, cz, n);
  for (let i = 0; i < per; i++) tq[k * per + i] = Math.round((h[i]! - hMin) * heightScale);
}
const tBytes = new Uint8Array(tq.buffer);
const tHash = fnv1a(tBytes);
const tPath = `terrain.${tHash}.bin`;
const writeAtomic = (rel: string, data: Uint8Array | string): void => {
  const p = join(out, rel);
  writeFileSync(`${p}.tmp-${process.pid}`, typeof data === "string" ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  renameSync(`${p}.tmp-${process.pid}`, p);
};
writeAtomic(tPath, tBytes);
for (const f of readdirSync(out)) if (/^terrain\.[0-9a-f]{8}\.bin/.test(f) && !f.startsWith(tPath)) rmSync(join(out, f), { force: true });

// island-level safe points: every 150 m of route, standing on the route
const islandSafe: WorldManifest["safePoints"] = [];
for (let d = 0; d <= 2400; d += 150) {
  const rp = routeAt(designToS(d));
  const yaw = Math.atan2(-rp.t[0], -rp.t[1]);
  islandSafe.push({ id: `route-${d}`, feet: rv([rp.p[0], heightAt(rp.p[0], rp.p[1]), rp.p[1]]), yaw: r2(yaw), regionId: regionAtS(designToS(d)).id });
}
const h = home();
islandSafe.unshift({ id: "home", feet: rv(h.spawn), yaw: r2(h.yaw), regionId: "home" });
for (const l of landmarks) for (const s of l.safePoints) islandSafe.push({ ...s, regionId: l.regionId });

const routePts: [number, number][] = [];
for (let s = 0; s <= ROUTE_LENGTH; s += 10) {
  const rp = routeAt(s);
  routePts.push([r2(rp.p[0]), r2(rp.p[1])]);
}

// ---------------------------------------------------------------- compression: one file at a time, skipped when the sibling is current
let totalBytes = 0;
function compress(rel: string): void {
  const p = join(out, rel);
  const buf = readFileSync(p);
  const stamp = fnv1a(buf);
  const stampFile = join(ckDir, `${rel.replace(/\//g, "_")}.z`);
  if (existsSync(`${p}.br`) && existsSync(`${p}.gz`) && existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp) {
    totalBytes += readFileSync(`${p}.br`).length;
    return;
  }
  const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  writeAtomic(`${rel}.br`, br);
  writeAtomic(`${rel}.gz`, gzipSync(buf, { level: 9 }));
  writeFileSync(stampFile, stamp);
  totalBytes += br.length;
}
const files = [tPath, ...landmarks.flatMap((l) => [l.asset.path, l.far.path, l.bom.path])];
for (const f of files) compress(f);

// side routes and reveals (§4), validated on the final terrain; a failure stops the build like a landmark's
const sideRoutes: WorldManifest["sideRoutes"] = [];
for (const r of SIDE_ROUTES) {
  const c = checkSideRoute(r, P);
  if (!c.ok) failures.push(`side route ${r.id}: ${c.problems.join("; ")}`);
  const pts = sidePoints(r);
  const fh = r.mode === "fly" ? flightHeights(r) : null;
  // every 4th sample (≈ 16 m): enough to draw the waymarks and follow the line
  const out: [number, number, number][] = [];
  for (let i = 0; i < pts.length; i += 4) out.push(rv([pts[i]![0], fh ? fh[i]! : heightAt(pts[i]![0], pts[i]![1]), pts[i]![1]]));
  const last = pts[pts.length - 1]!;
  out.push(rv([last[0], fh ? fh[fh.length - 1]! : heightAt(last[0], last[1]), last[1]]));
  // a flight starts and ends on the valley floor: its end points are on the ground (the waymark gates stand there)
  if (fh) {
    out[0] = rv([pts[0]![0], heightAt(pts[0]![0], pts[0]![1]), pts[0]![1]]);
    out[out.length - 1] = rv([last[0], heightAt(last[0], last[1]), last[1]]);
  }
  sideRoutes.push({ id: r.id, region: r.region, name: r.name, mode: r.mode ?? "walk", from: r.from, to: r.to, length: Math.round(c.length), points: out, note: r.note });
}
const reveals: WorldManifest["reveals"] = [];
for (const r of REVEALS) {
  const c = checkReveal(r, P);
  if (!c.ok) failures.push(`reveal ${r.id} (${r.landmark}): ${(c.hidden * 100).toFixed(0)} % visible where hidden, ${(c.shown * 100).toFixed(0)} % where shown`);
  reveals.push({ id: r.id, landmark: r.landmark, hidden: rv(routeEye(r.hidden)), shown: rv(routeEye(r.shown)), visibleHidden: r2(c.hidden), visibleShown: r2(c.shown), note: r.note });
}

// ---------------------------------------------------------------- environmental lighting and the home courtyard
// (courtyard/day-night directive §4, §8, §9): candle groups resolved per landmark in its child, turned into world
// space here; the courtyard laid out from the home spawn and portals. A landmark whose scheme dropped a group is a
// failure: every authored group must stand on a verified surface or hover with its air gap.
const court = courtyard(h.spawn, h.yaw, h.portals);
const lightingLandmarks: WorldManifest["lighting"]["landmarks"] = LANDMARKS.map((def) => {
  const s = summaries.get(def.id)!;
  const p = P.find((q) => q.id === def.id)!;
  if (!s.candles) failures.push(`${def.id}: no candle resolution in its summary (rebuild it)`);
  for (const d of s.candles?.dropped ?? []) failures.push(`${def.id}: candle group ${d.id} has no valid position: ${d.reason}`);
  const zones = (s.candles?.zones ?? []).map((z) => {
    const c = toWorld(p, [(z.min[0]! + z.max[0]!) / 2, (z.min[1]! + z.max[1]!) / 2, (z.min[2]! + z.max[2]!) / 2]);
    return { id: `${def.id}:${z.id}`, c: rv(c), h: rv([(z.max[0]! - z.min[0]!) / 2, (z.max[1]! - z.min[1]!) / 2, (z.max[2]! - z.min[2]!) / 2]), yaw: r2(p.yaw) };
  });
  const groups = (s.candles?.groups ?? []).map((g) => {
    const w = groupToWorld(g, p.position, p.yaw);
    // a ground group stands on the island itself: the heightfield under every cup at the cup's base (not a pad
    // edge's drop, not a river's bed)
    if (g.role === "ground") {
      for (const [x, y, z] of w.cups) {
        const t = heightAt(x, z);
        if (Math.abs(t - y) > 0.03) failures.push(`${def.id}: ground candle group ${g.id} stands ${(y - t).toFixed(2)} m off the terrain at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
    return { ...w, id: `${def.id}:${g.id}`, zone: g.zone ? `${def.id}:${g.zone}` : null };
  });
  return { id: def.id, intent: s.candles?.intent ?? "", groups, zones };
});
const lighting: WorldManifest["lighting"] = {
  version: 1,
  landmarks: lightingLandmarks,
  home: {
    groups: court.candles.map((g) => ({ ...g, id: `home:${g.id}`, light: rv(g.light), cups: g.cups.map((c) => [r2(c[0]), r2(c[1]), r2(c[2]), r2(c[3]), r2(c[4])] as [number, number, number, number, number]) })),
    pond: { ...court.pond, wave: court.pond.wave.map((w) => [...w] as [number, number, number]) },
    slabs: court.slabs.map((s) => ({ ...s, poly: s.poly.map(([x, z]) => [r2(x), r2(z)] as [number, number]) })),
    edges: court.edges,
    meadowRocks: court.meadowRocks,
    patches: court.patches,
    routes: court.routes.map((r) => ({ ...r, points: r.points.map(([x, z]) => [r2(x), r2(z)] as [number, number]) })),
    approaches: court.approaches,
    bound: court.bound,
  },
};

const manifest: WorldManifest = {
  format: "stillwood-world/1",
  recipeVersion: RECIPE_VERSION,
  seed: WORLD_SEED,
  generatedAt: "deterministic",
  route: { length: r2(ROUTE_LENGTH), points: routePts },
  sideRoutes,
  reveals,
  // the dam's river: water at its own height along its centre line, inside the bed the terrain cuts for it
  rivers: rivers().map((r) => ({ id: r.id, points: r.points.map(([x, z], i) => rv([x, r.water[i]!, z])), halfWidth: r.floorHalf, note: "below the dam: from the stilling basin through the gorge to the sea" })),
  regions: REGIONS.map((r) => ({ id: r.id, name: r.name, s0: r.s0, s1: r.s1, prompt: r.prompt })),
  coast: COAST.map(([x, z]) => [r2(x), r2(z)]),
  // soft feedback 40 m before the hard limit; the hard limit is the coastline expanded by 90 m (60–100 buffer)
  boundary: { soft: 50, hard: 90, ceiling: Math.max(640, Math.ceil(highestTop + 100)), seaFloor: 8, highestTop: r2(highestTop) },
  terrain: { chunk: CHUNK, min: [WORLD_MIN[0], WORLD_MIN[1]], chunksX: CHUNKS_X, chunksZ: CHUNKS_Z, n, heightMin: hMin, heightScale: r2(heightScale), path: tPath, hash: tHash, bytes: tBytes.length },
  home: { spawn: rv(h.spawn), yaw: r2(h.yaw), portals: h.portals.map((p) => ({ id: p.id, label: p.label, position: rv(p.position), yaw: r2(p.yaw), opening: p.opening })) },
  safePoints: islandSafe,
  landmarks,
  lighting,
  totals: { pieces: totalPieces, bytes: 0 },
};
// the manifest's own compressed size is part of the total
const manifestJson = (): string => JSON.stringify(manifest);
manifest.totals.bytes = totalBytes + brotliCompressSync(Buffer.from(manifestJson())).length;
parseManifest(ManifestS.parse(manifest), RECIPE_VERSION); // the same checks the browser runs

if (failures.length) {
  console.error("landmark validation failed (manifest not replaced):\n" + failures.join("\n"));
  process.exit(1);
}
// last: the manifest (and its compressed siblings), so a cancelled run never leaves a manifest pointing at missing files
const mj = manifestJson();
writeAtomic("manifest.json.br", brotliCompressSync(Buffer.from(mj), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
writeAtomic("manifest.json.gz", gzipSync(Buffer.from(mj), { level: 9 }));
writeAtomic("manifest.json", mj);

// files no longer referenced (older hashes) are removed
const live = new Set([...files, "manifest.json"].flatMap((f) => [f, `${f}.br`, `${f}.gz`]));
for (const dir of ["landmarks", "bom"]) for (const f of readdirSync(join(out, dir))) if (!live.has(`${dir}/${f}`)) rmSync(join(out, dir, f), { force: true });

if (publishDir && publishDir !== out) {
  // copy the live set; the manifest (and its siblings) last, so a reader never sees a manifest without its files
  const order = [...live].filter((f) => !f.startsWith("manifest.json")).concat(["manifest.json.br", "manifest.json.gz", "manifest.json"]);
  rmSync(publishDir, { recursive: true, force: true });
  for (const f of order) {
    const dst = join(publishDir, f);
    mkdirSync(join(dst, ".."), { recursive: true });
    copyFileSync(join(out, f), `${dst}.tmp-${process.pid}`);
    renameSync(`${dst}.tmp-${process.pid}`, dst);
  }
  log(`published ${order.length} files → ${publishDir}`);
}

if (reportDir) {
  mkdirSync(reportDir, { recursive: true });
  const rows = LANDMARKS.map((def) => {
    const s = summaries.get(def.id)!;
    return `| ${def.id} | ${def.title} | ${s.count.toLocaleString("en")} | ${s.totals.B} / ${s.totals.M} / ${s.totals.D} | ${s.size.map((v) => v.toFixed(1)).join(" × ")} | ${def.target.join(" × ")} | ${s.deviation.map((d) => (d * 100).toFixed(1) + "%").join(", ")} | ${(s.asset.bytes / 1024).toFixed(0)} KiB | ${(s.far.bytes / 1024).toFixed(0)} KiB | ${s.peak.rssMiB} MiB | ${s.ok ? "pass" : "FAIL"} |`;
  });
  writeFileSync(
    join(reportDir, "landmarks.md"),
    `# Generated landmarks (recipe ${RECIPE_VERSION}, seed ${WORLD_SEED})\n\nGenerated by \`pnpm build:world\` (\`scripts/world/build-world.ts\`, ${GENERATOR_VERSION}). Sizes are actual core bounds (approach flights excluded) as W × D × H; the envelope tolerance is ±1 % unless a recorded revision says otherwise. "Detail" is the per-piece file fetched near the camera; "Far" is the always-resident silhouette file. "Child RSS" is the landmark's generator process at exit (one process per landmark).\n\n| ID | Title | Pieces | B / M / D | Actual W × D × H | Target | Deviation | Detail | Far | Child RSS | Checks |\n| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- |\n${rows.join("\n")}\n\nTotal pieces: ${totalPieces.toLocaleString("en")}. Compressed (brotli) world assets: ${(manifest.totals.bytes / 1e6).toFixed(2)} MB.\n`,
  );
  writeFileSync(join(reportDir, "validation.json"), JSON.stringify(LANDMARKS.map((def) => { const s = summaries.get(def.id)!; return { id: def.id, title: def.title, pieces: s.count, B: s.totals.B, M: s.totals.M, D: s.totals.D, size: s.size, target: def.target, dev: s.deviation, bytes: s.asset.bytes, farBytes: s.far.bytes, ok: s.ok, checks: s.checks, generator: { stages: s.stages, peak: s.peak } }; }), null, 1));
  writeFileSync(join(reportDir, "revisions.json"), JSON.stringify(landmarks.map((l) => ({ id: l.id, revisions: l.revisions })), null, 1));
  // candle placement per landmark (directive §9): groups by kind and role, cups, the surfaces they rest on
  const lrows = LANDMARKS.map((def) => {
    const s = summaries.get(def.id)!;
    const gs = s.candles?.groups ?? [];
    const by = (role: string): number => gs.filter((g) => g.role === role).length;
    const kinds = [...new Set(gs.map((g) => g.kind))].join(", ");
    const levels = [...new Set(gs.filter((g) => g.surface !== null).map((g) => Math.round(g.surface! * 10) / 10))].sort((a, b) => a - b);
    return `| ${def.id} | ${gs.length} | ${gs.reduce((a, g) => a + g.cups.length, 0)} | ${by("supported")} / ${by("ground")} / ${by("detached")} | ${gs.filter((g) => g.essential).length} | ${kinds} | ${levels.join(", ")} | ${(s.candles?.dropped ?? []).length} |`;
  });
  const homeCups = lighting.home.groups.reduce((a, g) => a + g.cups.length, 0);
  writeFileSync(
    join(reportDir, "candles.md"),
    `# Candle placement (generated)\n\nWritten by \`pnpm build:world\` from \`src/world/candle-schemes.ts\`, resolved against each landmark's own pieces by \`src/world/candles.ts\`. Supported groups stand on a level timber surface (or a solid plank-finish floor where the scheme says so) that carries every cup's whole footprint; ground groups stand on the building's pad only where the island's terrain is level with it under every cup and no river or basin covers it (checked again on the world heightfield here, within 3 cm); detached groups hover with an air gap of ${0.45}–${2.5} m from every piece. None stands within a walking line, a fly-through tube, a safe point or a viewpoint.\n\n| ID | Groups | Cups | Supported / ground / detached | Essential | Kinds | Surface levels (local m) | Dropped |\n| --- | ---: | ---: | --- | ---: | --- | --- | ---: |\n${lrows.join("\n")}\n\nLandmarks: ${lighting.landmarks.reduce((a, l) => a + l.groups.length, 0)} groups, ${lighting.landmarks.reduce((a, l) => a + l.groups.reduce((b, g) => b + g.cups.length, 0), 0)} cups. Home courtyard: ${lighting.home.groups.length} groups, ${homeCups} cups.\n\n## Intent per landmark\n\n${lighting.landmarks.map((l) => `- **${l.id}**: ${l.intent}`).join("\n")}\n`,
  );
  writeFileSync(join(reportDir, "candles.json"), JSON.stringify(LANDMARKS.map((def) => ({ id: def.id, ...summaries.get(def.id)!.candles })), null, 1));
  writeFileSync(join(reportDir, "layout.json"), JSON.stringify({ placements: landmarks.map((l) => ({ id: l.id, ...l.placement, distanceToRoute: r2(nearestOnRoute(l.placement.position[0], l.placement.position[2]).d) })), home: manifest.home, boundary: manifest.boundary }, null, 1));
}

const mu = process.memoryUsage();
log(`world: ${landmarks.length} landmarks, ${totalPieces.toLocaleString("en")} pieces, ${(manifest.totals.bytes / 1e6).toFixed(2)} MB brotli, ${((performance.now() - t0) / 1000).toFixed(1)} s → ${out} · coordinator RSS ${Math.round(mu.rss / MiB)} MiB`);
