// Binary landmark asset format ("SWLM" v2). One file per landmark, served
// same-origin and pre-compressed. Pieces are sorted by LOD tier then stock
// then construction band, so a renderer can draw a prefix for mid detail.
// v2 adds a distance representation: every collinear chain of structural
// (tier 0–1) pieces merged into one box, long chains first, so the far and
// silhouette levels draw prefixes of it. Merging is a distance-only
// rendering simplification; the near and mid levels draw the real pieces.
//
// Layout (little-endian):
//   magic "SWLM" | u16 version | u16 reserved
//   u32 count | u32 recipeHash | f32 min[3] | f32 scale
//   u32 tierStart[4]          (piece index where tiers 0, 1, 2 and the end begin)
//   u32 stockRuns[3][3]       (within each tier: start of B, M, D — absolute indices)
//   u16 pos[count*3]          (quantized: (p − min) * scale)
//   i16 quat[count*4]         (×32767)
//   u16 band[count]           (index into the manifest's band list for the inspector)
//   u16 comp[count]           (v3: index into the manifest's component list, for the inspector's component and course views)
//   u8  stage[count]          (index into STAGES)
//   u8  course[count]         (v3: index into the manifest's course table [stage, band, course]; ≤ 255 courses per building)
//   u8  pad to 4
//   u32 chainCount | u32 longChains   (chains ≥ 6 m come first)
//   u16 cpos[chainCount*3] (same quantisation) | i16 cquat[chainCount*4] | u16 clen[chainCount] (cm) | u8 csec[chainCount] (cm)
//   u8  pad to 4
// Shells (rear shading geometry) are separate, small, and kept as JSON in the manifest.
//
// "SWLF" v1 is the far file: the first FAR_CHAINS chains of the same list
// (the strongest lines first), so the island-wide silhouettes and the mid/far
// levels of all 20 landmarks stay resident while the per-piece file is
// fetched only near the camera and evicted again (docs/evidence/world/memory-incident.md).
//   magic "SWLF" | u16 version | u16 reserved | f32 min[3] | f32 scale | u32 count | u32 long
//   u16 cpos[count*3] | i16 cquat[count*4] | u16 clen[count] | u8 csec[count] | pad to 4
import { STAGES, type BuildResult, type Stage } from "./core.ts";

export const MAGIC = 0x4d4c5753; // "SWLM"
export const FORMAT_VERSION = 3;
const HEADER = 4 + 2 + 2 + 4 + 4 + 12 + 4 + 16 + 36;

export interface DecodedLandmark {
  /** Merged structural chains for distance LODs. */
  chains: { count: number; long: number; pos: Uint16Array; quat: Int16Array; len: Uint16Array; sec: Uint8Array };
  count: number;
  recipeHash: number;
  min: [number, number, number];
  scale: number;
  tierStart: [number, number, number, number];
  stockRuns: number[][];
  pos: Uint16Array;
  quat: Int16Array;
  band: Uint16Array;
  comp: Uint16Array;
  stage: Uint8Array;
  course: Uint8Array;
}

/** Encode a build; returns the buffer, the band names referenced by `band` and the component names referenced by `comp`. */
export function encodeLandmark(r: BuildResult): { buffer: ArrayBuffer; bands: string[]; components: string[]; courses: [string, string, number][] } {
  if (r.courses.length > 256) throw new Error(`${r.id}: ${r.courses.length} courses exceed the u8 course channel`);
  const n = r.count;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => r.tier[a]! - r.tier[b]! || r.stock[a]! - r.stock[b]! || r.course[a]! - r.course[b]! || a - b);
  const extent = Math.max(r.bounds.max[0] - r.bounds.min[0], r.bounds.max[1] - r.bounds.min[1], r.bounds.max[2] - r.bounds.min[2]);
  // 1/64 m resolution when the building fits 1024 m; otherwise as fine as 16 bits allow
  const scale = Math.min(64, Math.floor(65535 / Math.max(1, extent + 1)));
  const bandNames: string[] = [];
  const bandIndex = new Map<string, number>();
  const bandOf = (i: number): number => {
    const c = r.courses[r.course[i]!]!;
    const k = `${c.stage}|${c.band}`;
    let v = bandIndex.get(k);
    if (v === undefined) {
      v = bandNames.length;
      bandNames.push(k);
      bandIndex.set(k, v);
    }
    return v;
  };
  const padded = (x: number): number => (x + 3) & ~3;
  // merged chains of the structural tiers: endpoints along each chain's axis
  const chainMap = new Map<number, { stock: number; idx: number[] }>();
  for (let i = 0; i < n; i++) {
    if (r.tier[i]! > 1) continue;
    const k = r.chain[i]!;
    let e = chainMap.get(k);
    if (!e) chainMap.set(k, (e = { stock: r.stock[i]!, idx: [] }));
    e.idx.push(i);
  }
  const STOCK_LEN = [8, 4, 1];
  const STOCK_SEC = [1, 0.5, 0.125];
  const chains: { c: [number, number, number]; q: [number, number, number, number]; len: number; sec: number }[] = [];
  for (const e of chainMap.values()) {
    const i0 = e.idx[0]!;
    const q: [number, number, number, number] = [r.quat[i0 * 4]!, r.quat[i0 * 4 + 1]!, r.quat[i0 * 4 + 2]!, r.quat[i0 * 4 + 3]!];
    // the chain's axis is the first piece's local x
    const ax = qx(q);
    let lo = Infinity;
    let hi = -Infinity;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const i of e.idx) {
      const p = [r.pos[i * 3]!, r.pos[i * 3 + 1]!, r.pos[i * 3 + 2]!];
      cx += p[0]!;
      cy += p[1]!;
      cz += p[2]!;
    }
    cx /= e.idx.length;
    cy /= e.idx.length;
    cz /= e.idx.length;
    const half = STOCK_LEN[e.stock]! / 2;
    for (const i of e.idx) {
      const t = (r.pos[i * 3]! - cx) * ax[0] + (r.pos[i * 3 + 1]! - cy) * ax[1] + (r.pos[i * 3 + 2]! - cz) * ax[2];
      lo = Math.min(lo, t - half);
      hi = Math.max(hi, t + half);
    }
    const mid = (lo + hi) / 2;
    chains.push({ c: [cx + ax[0] * mid, cy + ax[1] * mid, cz + ax[2] * mid], q, len: hi - lo, sec: STOCK_SEC[e.stock]! });
  }
  // importance: the biggest members first (length × section), so any prefix is the building's strongest lines
  chains.sort((a, b) => b.len * b.sec - a.len * a.sec || b.len - a.len);
  const longChains = chains.filter((c) => c.len >= 6).length;
  const m = chains.length;
  const chainBytes = 8 + m * 6 + m * 8 + m * 2 + padded(m);
  const size = HEADER + n * 6 + n * 8 + n * 2 + n * 2 + padded(2 * n) + chainBytes;
  const buffer = new ArrayBuffer(padded(size));
  const dv = new DataView(buffer);
  let o = 0;
  dv.setUint32(o, MAGIC, true);
  o += 4;
  dv.setUint16(o, FORMAT_VERSION, true);
  o += 4;
  dv.setUint32(o, n, true);
  o += 4;
  dv.setUint32(o, parseInt(r.hash, 16) >>> 0, true);
  o += 4;
  for (let a = 0; a < 3; a++) {
    dv.setFloat32(o, r.bounds.min[a]!, true);
    o += 4;
  }
  dv.setFloat32(o, scale, true);
  o += 4;
  const tierStart = [0, 0, 0, n];
  const stockRuns = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  // compute starts
  for (let t = 0; t < 3; t++) {
    let first = order.findIndex((i) => r.tier[i]! >= t);
    if (first < 0) first = n;
    tierStart[t] = first;
  }
  for (let t = 0; t < 3; t++) {
    for (let s = 0; s < 3; s++) {
      let first = order.findIndex((i) => r.tier[i]! > t || (r.tier[i]! === t && r.stock[i]! >= s));
      if (first < 0) first = n;
      stockRuns[t]![s] = first;
    }
  }
  for (const v of tierStart) {
    dv.setUint32(o, v, true);
    o += 4;
  }
  for (const row of stockRuns) for (const v of row) {
    dv.setUint32(o, v, true);
    o += 4;
  }
  const pos = new Uint16Array(buffer, o, n * 3);
  o += n * 6;
  const quat = new Int16Array(buffer, o, n * 4);
  o += n * 8;
  const band = new Uint16Array(buffer, o, n);
  o += n * 2;
  const comp = new Uint16Array(buffer, o, n);
  o += n * 2;
  const stage = new Uint8Array(buffer, o, n);
  const course = new Uint8Array(buffer, o + n, n);
  order.forEach((i, k) => {
    for (let a = 0; a < 3; a++) pos[k * 3 + a] = Math.round((r.pos[i * 3 + a]! - r.bounds.min[a]!) * scale);
    for (let a = 0; a < 4; a++) quat[k * 4 + a] = Math.round(r.quat[i * 4 + a]! * 32767);
    band[k] = bandOf(i);
    comp[k] = r.comp[i]!;
    course[k] = r.course[i]!;
    stage[k] = STAGES.indexOf(r.courses[r.course[i]!]!.stage as Stage);
  });
  o += padded(2 * n);
  dv.setUint32(o, m, true);
  dv.setUint32(o + 4, longChains, true);
  o += 8;
  const cpos = new Uint16Array(buffer, o, m * 3);
  o += m * 6;
  const cquat = new Int16Array(buffer, o, m * 4);
  o += m * 8;
  const clen = new Uint16Array(buffer, o, m);
  o += m * 2;
  const csec = new Uint8Array(buffer, o, m);
  chains.forEach((c, k) => {
    for (let a = 0; a < 3; a++) cpos[k * 3 + a] = Math.max(0, Math.min(65535, Math.round((c.c[a]! - r.bounds.min[a]!) * scale)));
    for (let a = 0; a < 4; a++) cquat[k * 4 + a] = Math.round(c.q[a]! * 32767);
    clen[k] = Math.min(65535, Math.round(c.len * 100));
    csec[k] = Math.min(255, Math.round(c.sec * 100));
  });
  return { buffer, bands: bandNames, components: r.components, courses: r.courses.map((c) => [c.stage, c.band, c.course]) };
}

export const FAR_MAGIC = 0x464c5753; // "SWLF"
export const FAR_VERSION = 1;
/** Chains kept in the far file: the largest prefix any quality tier draws below the near level. */
export const FAR_CHAINS = 6000;

export interface DecodedFar {
  min: [number, number, number];
  scale: number;
  count: number;
  long: number;
  pos: Uint16Array;
  quat: Int16Array;
  len: Uint16Array;
  sec: Uint8Array;
}

/** The far file from an encoded landmark asset: its importance-sorted chain prefix (copied, so the big buffer can go). */
export function encodeFar(landmark: ArrayBuffer, limit = FAR_CHAINS): ArrayBuffer {
  const d = decodeLandmark(landmark);
  const m = Math.min(limit, d.chains.count);
  const long = Math.min(d.chains.long, m);
  const padded = (x: number): number => (x + 3) & ~3;
  const size = 4 + 2 + 2 + 12 + 4 + 4 + 4 + m * 6 + m * 8 + m * 2 + padded(m);
  const buffer = new ArrayBuffer(padded(size));
  const dv = new DataView(buffer);
  dv.setUint32(0, FAR_MAGIC, true);
  dv.setUint16(4, FAR_VERSION, true);
  for (let a = 0; a < 3; a++) dv.setFloat32(8 + a * 4, d.min[a]!, true);
  dv.setFloat32(20, d.scale, true);
  dv.setUint32(24, m, true);
  dv.setUint32(28, long, true);
  let o = 32;
  new Uint16Array(buffer, o, m * 3).set(d.chains.pos.subarray(0, m * 3));
  o += m * 6;
  new Int16Array(buffer, o, m * 4).set(d.chains.quat.subarray(0, m * 4));
  o += m * 8;
  new Uint16Array(buffer, o, m).set(d.chains.len.subarray(0, m));
  o += m * 2;
  new Uint8Array(buffer, o, m).set(d.chains.sec.subarray(0, m));
  return buffer;
}

export function decodeFar(buffer: ArrayBuffer): DecodedFar {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 32 || dv.getUint32(0, true) !== FAR_MAGIC) throw new Error("not a far landmark asset");
  const version = dv.getUint16(4, true);
  if (version !== FAR_VERSION) throw new Error(`far format ${version}, expected ${FAR_VERSION}`);
  const min: [number, number, number] = [dv.getFloat32(8, true), dv.getFloat32(12, true), dv.getFloat32(16, true)];
  const scale = dv.getFloat32(20, true);
  const count = dv.getUint32(24, true);
  const long = dv.getUint32(28, true);
  let o = 32;
  if (buffer.byteLength < o + count * 17) throw new Error("truncated far asset");
  const pos = new Uint16Array(buffer, o, count * 3);
  o += count * 6;
  const quat = new Int16Array(buffer, o, count * 4);
  o += count * 8;
  const len = new Uint16Array(buffer, o, count);
  o += count * 2;
  const sec = new Uint8Array(buffer, o, count);
  return { min, scale, count, long, pos, quat, len, sec };
}

/** The local x axis of a unit quaternion. */
function qx(q: readonly number[]): [number, number, number] {
  const [x, y, z, w] = q as [number, number, number, number];
  return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
}

export function decodeLandmark(buffer: ArrayBuffer): DecodedLandmark {
  const dv = new DataView(buffer);
  let o = 0;
  if (dv.getUint32(o, true) !== MAGIC) throw new Error("not a landmark asset");
  o += 4;
  const version = dv.getUint16(o, true);
  if (version !== FORMAT_VERSION) throw new Error(`landmark format ${version}, expected ${FORMAT_VERSION}`);
  o += 4;
  const count = dv.getUint32(o, true);
  o += 4;
  const recipeHash = dv.getUint32(o, true);
  o += 4;
  const min: [number, number, number] = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
  o += 12;
  const scale = dv.getFloat32(o, true);
  o += 4;
  const tierStart = [0, 0, 0, 0].map((_, k) => dv.getUint32(o + k * 4, true)) as [number, number, number, number];
  o += 16;
  const stockRuns = [0, 1, 2].map((t) => [0, 1, 2].map((s) => dv.getUint32(o + (t * 3 + s) * 4, true)));
  o += 36;
  if (buffer.byteLength < o + count * (6 + 8 + 2 + 2 + 2)) throw new Error("truncated landmark asset");
  const pos = new Uint16Array(buffer, o, count * 3);
  o += count * 6;
  const quat = new Int16Array(buffer, o, count * 4);
  o += count * 8;
  const band = new Uint16Array(buffer, o, count);
  o += count * 2;
  const comp = new Uint16Array(buffer, o, count);
  o += count * 2;
  const stage = new Uint8Array(buffer, o, count);
  const course = new Uint8Array(buffer, o + count, count);
  o += (2 * count + 3) & ~3;
  const cdv = new DataView(buffer, o, 8);
  const cn = cdv.getUint32(0, true);
  const clong = cdv.getUint32(4, true);
  o += 8;
  if (buffer.byteLength < o + cn * (6 + 8 + 2 + 1)) throw new Error("truncated landmark chains");
  const cpos = new Uint16Array(buffer, o, cn * 3);
  o += cn * 6;
  const cquat = new Int16Array(buffer, o, cn * 4);
  o += cn * 8;
  const clen = new Uint16Array(buffer, o, cn);
  o += cn * 2;
  const csec = new Uint8Array(buffer, o, cn);
  return { count, recipeHash, min, scale, tierStart, stockRuns, pos, quat, band, comp, stage, course, chains: { count: cn, long: clong, pos: cpos, quat: cquat, len: clen, sec: csec } };
}

/** FNV-1a over bytes, hex; used for manifest integrity (not security). */
export function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
