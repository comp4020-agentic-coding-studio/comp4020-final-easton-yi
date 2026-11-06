#!/usr/bin/env node
// One landmark, one short-lived process (bounded-memory generation; see
// docs/evidence/world/memory-incident.md). Builds and validates one recipe,
// writes its detail asset, far asset and BOM atomically (temp file + rename on
// the same filesystem), and writes a small JSON summary — the only thing the
// coordinator (build-world.ts) keeps. Process exit is the lifetime boundary for
// the geometry arrays; nothing of one landmark survives into the next.
//
// Usage: node scripts/world/build-landmark.ts <Lxx> <outDir> <summary.json>
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANDMARKS, RECIPE_VERSION, bandTable, buildLandmark, validate } from "../../src/world/landmarks.ts";
import { encodeFar, encodeLandmark, fnv1a, FAR_CHAINS } from "../../src/world/format.ts";
import { resolveScheme } from "../../src/world/candles.ts";
import { CANDLE_SCHEMES } from "../../src/world/candle-schemes.ts";
import { islandProbe } from "../../src/world/layout.ts";

const [id, out, summaryPath] = process.argv.slice(2);
if (!id || !out || !summaryPath) {
  console.error("usage: build-landmark.ts <Lxx> <outDir> <summary.json>");
  process.exit(2);
}
const def = LANDMARKS.find((l) => l.id === id);
if (!def) {
  console.error(`unknown landmark ${id}`);
  process.exit(2);
}

const MiB = 1024 * 1024;
const mem = (): Record<string, number> => {
  const m = process.memoryUsage();
  // arrayBuffers is part of external; neither is part of rss's sum
  return { rssMiB: Math.round(m.rss / MiB), heapUsedMiB: Math.round(m.heapUsed / MiB), heapTotalMiB: Math.round(m.heapTotal / MiB), externalMiB: Math.round(m.external / MiB), arrayBuffersMiB: Math.round(m.arrayBuffers / MiB) };
};
const stages: { stage: string; ms: number; mem: Record<string, number> }[] = [];
let t = performance.now();
const mark = (stage: string): void => {
  const now = performance.now();
  stages.push({ stage, ms: Math.round(now - t), mem: mem() });
  t = now;
};

/** Atomic write: temp name in the same directory, then rename. Stale files of this landmark are removed after. */
function writeAtomic(rel: string, data: Uint8Array | string): void {
  const p = join(out!, rel);
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, typeof data === "string" ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  renameSync(tmp, p);
}

mkdirSync(join(out, "landmarks"), { recursive: true });
mkdirSync(join(out, "bom"), { recursive: true });

const r = buildLandmark(def);
mark("build");
const v = validate(def, r);
mark("validate");
// environmental candle anchors (courtyard/day-night directive §9): resolved against this landmark's own pieces;
// they are lighting data, never pieces, and are written to the manifest's lighting section, not the asset
const scheme = CANDLE_SCHEMES[def.id];
if (!scheme) throw new Error(`${def.id}: no candle scheme`);
// the island around it (its placement sets the terrain's pads and the dam's river), for ground groups
const candles = resolveScheme(def.id, r, scheme, islandProbe(def.id));
mark("candles");
const enc = encodeLandmark(r);
const bytes = new Uint8Array(enc.buffer);
const hash = fnv1a(bytes);
const path = `landmarks/${def.id}.${hash}.bin`;
mark("encode");
const far = new Uint8Array(encodeFar(enc.buffer, FAR_CHAINS));
const farHash = fnv1a(far);
const farPath = `landmarks/${def.id}.far.${farHash}.bin`;
mark("encode far");
writeAtomic(path, bytes);
writeAtomic(farPath, far);
const bom = { id: def.id, recipeVersion: RECIPE_VERSION, totals: r.totals, duplicatesRemoved: r.duplicates, stockDowngrades: r.downgrades, subMetreOverhangs: r.overhangs, bands: bandTable(r), courses: r.bom };
writeAtomic(`bom/${def.id}.json`, JSON.stringify(bom));
mark("write");
// older content-hashed files of this landmark are superseded (never another landmark's, never the new ones)
for (const f of readdirSync(join(out, "landmarks"))) {
  if (!f.startsWith(`${def.id}.`)) continue;
  const keep = f === `${def.id}.${hash}.bin` || f === `${def.id}.far.${farHash}.bin` || f.startsWith(`${def.id}.${hash}.bin.`) || f.startsWith(`${def.id}.far.${farHash}.bin.`);
  if (!keep) rmSync(join(out, "landmarks", f), { force: true });
}

const summary = {
  id: def.id,
  recipeVersion: RECIPE_VERSION,
  ok: v.ok,
  checks: v.checks,
  size: v.size,
  deviation: v.deviation,
  count: r.count,
  totals: r.totals,
  contentHash: r.hash,
  bounds: r.bounds,
  asset: { path, hash, bytes: bytes.length },
  far: { path: farPath, hash: farHash, bytes: far.length, chains: new DataView(far.buffer, far.byteOffset, far.byteLength).getUint32(24, true) },
  bands: enc.bands,
  components: enc.components,
  courses: enc.courses,
  shells: r.shells,
  water: r.water,
  colliders: r.colliders,
  entries: r.entries,
  viewpoints: r.viewpoints,
  safePoints: r.safePoints,
  features: r.features.map((f) => f.name),
  revisions: r.revisions,
  candles: { intent: scheme.intent, groups: candles.groups, dropped: candles.dropped, zones: candles.zones },
  stages,
  peak: mem(),
};
// the summary is written last: its presence (with matching hashes) is what marks this landmark complete
const tmp = `${summaryPath}.tmp-${process.pid}`;
writeFileSync(tmp, JSON.stringify(summary));
renameSync(tmp, summaryPath);
