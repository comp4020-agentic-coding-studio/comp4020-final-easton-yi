// Turn a landmark asset (SWLM) into GPU-ready per-instance arrays in world
// space: position (vec3), rotation (quaternion) and a seed for the wood's
// variation. Runs inside the world worker; also usable directly in tests.
import { decodeFar, decodeLandmark } from "../../world/format.ts";

export interface InstanceArrays {
  /** Instances per stock (B, M, D), each array sorted so a prefix is the lower LOD tiers. */
  stocks: {
    pos: Float32Array;
    quat: Float32Array;
    seed: Float32Array;
    /** Instance counts of tier ≤ 0 and tier ≤ 1 within this stock (the far and mid prefixes). */
    tierEnd: [number, number, number];
    /** Inspector: stage index per instance. */
    stage: Uint8Array;
    band: Uint16Array;
  }[];
  count: number;
  /** Merged chains (distance LODs): world position, rotation, scale (length, section, section); long chains first. */
  chains: { pos: Float32Array; quat: Float32Array; scale: Float32Array; count: number; long: number };
}

/**
 * Decode and transform into world space: rotate by the placement yaw and
 * translate. Within each stock, instances keep the tier order, so drawing the
 * first `tierEnd[t]` instances shows tiers 0…t.
 */
export function toInstances(buffer: ArrayBuffer, placement: { position: readonly number[]; yaw: number }): InstanceArrays {
  const d = decodeLandmark(buffer);
  const inv = 1 / d.scale;
  const c = Math.cos(placement.yaw);
  const s = Math.sin(placement.yaw);
  // yaw quaternion about +y
  const qy = [0, Math.sin(placement.yaw / 2), 0, Math.cos(placement.yaw / 2)] as const;
  const [px, py, pz] = placement.position as [number, number, number];
  // count per stock, and per tier within stock (pieces are sorted tier → stock)
  const perStock = [0, 0, 0];
  const tierCount = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const stockOf = (i: number): number => {
    // stockRuns[t][s] = first index of (tier t, stock ≥ s); the tier is from tierStart
    let t = 0;
    while (t < 2 && i >= d.tierStart[t + 1]!) t++;
    const runs = d.stockRuns[t]!;
    if (i >= runs[2]!) return 2;
    if (i >= runs[1]!) return 1;
    return 0;
  };
  const tierOf = (i: number): number => (i >= d.tierStart[2]! ? 2 : i >= d.tierStart[1]! ? 1 : 0);
  const stockIdx = new Uint8Array(d.count);
  for (let i = 0; i < d.count; i++) {
    const st = stockOf(i);
    stockIdx[i] = st;
    perStock[st]!++;
    tierCount[st]![tierOf(i)]!++;
  }
  const stocks = [0, 1, 2].map((st) => ({
    pos: new Float32Array(perStock[st]! * 3),
    quat: new Float32Array(perStock[st]! * 4),
    seed: new Float32Array(perStock[st]!),
    tierEnd: [tierCount[st]![0]!, tierCount[st]![0]! + tierCount[st]![1]!, perStock[st]!] as [number, number, number],
    stage: new Uint8Array(perStock[st]!),
    band: new Uint16Array(perStock[st]!),
  }));
  const fill = [0, 0, 0];
  for (let i = 0; i < d.count; i++) {
    const st = stockIdx[i]!;
    const k = fill[st]!++;
    const o = stocks[st]!;
    const lx = d.pos[i * 3]! * inv + d.min[0];
    const ly = d.pos[i * 3 + 1]! * inv + d.min[1];
    const lz = d.pos[i * 3 + 2]! * inv + d.min[2];
    o.pos[k * 3] = px + lx * c + lz * s;
    o.pos[k * 3 + 1] = py + ly;
    o.pos[k * 3 + 2] = pz - lx * s + lz * c;
    // q_world = q_yaw * q_local
    const ax = d.quat[i * 4]! / 32767;
    const ay = d.quat[i * 4 + 1]! / 32767;
    const az = d.quat[i * 4 + 2]! / 32767;
    const aw = d.quat[i * 4 + 3]! / 32767;
    const [bx, by, bz, bw] = qy;
    let x = bw * ax + bx * aw + by * az - bz * ay;
    let y = bw * ay - bx * az + by * aw + bz * ax;
    let z = bw * az + bx * ay - by * ax + bz * aw;
    let w = bw * aw - bx * ax - by * ay - bz * az;
    const l = Math.hypot(x, y, z, w) || 1;
    x /= l;
    y /= l;
    z /= l;
    w /= l;
    o.quat[k * 4] = x;
    o.quat[k * 4 + 1] = y;
    o.quat[k * 4 + 2] = z;
    o.quat[k * 4 + 3] = w;
    o.seed[k] = (i * 7919) % 10007;
    o.stage[k] = d.stage[i]!;
    o.band[k] = d.band[i]!;
  }
  const cn = d.chains.count;
  const cpos = new Float32Array(cn * 3);
  const cq = new Float32Array(cn * 4);
  const csc = new Float32Array(cn * 3);
  for (let i = 0; i < cn; i++) {
    const lx = d.chains.pos[i * 3]! * inv + d.min[0];
    const ly = d.chains.pos[i * 3 + 1]! * inv + d.min[1];
    const lz = d.chains.pos[i * 3 + 2]! * inv + d.min[2];
    cpos[i * 3] = px + lx * c + lz * s;
    cpos[i * 3 + 1] = py + ly;
    cpos[i * 3 + 2] = pz - lx * s + lz * c;
    const ax = d.chains.quat[i * 4]! / 32767;
    const ay = d.chains.quat[i * 4 + 1]! / 32767;
    const az = d.chains.quat[i * 4 + 2]! / 32767;
    const aw = d.chains.quat[i * 4 + 3]! / 32767;
    const [bx, by, bz, bw] = qy;
    const x = bw * ax + bx * aw + by * az - bz * ay;
    const y = bw * ay - bx * az + by * aw + bz * ax;
    const z = bw * az + bx * ay - by * ax + bz * aw;
    const w = bw * aw - bx * ax - by * ay - bz * az;
    const l = Math.hypot(x, y, z, w) || 1;
    cq[i * 4] = x / l;
    cq[i * 4 + 1] = y / l;
    cq[i * 4 + 2] = z / l;
    cq[i * 4 + 3] = w / l;
    csc[i * 3] = d.chains.len[i]! / 100;
    csc[i * 3 + 1] = csc[i * 3 + 2] = d.chains.sec[i]! / 100;
  }
  return { stocks, count: d.count, chains: { pos: cpos, quat: cq, scale: csc, count: cn, long: d.chains.long } };
}

/** Merged-chain instances (world space): position, rotation, scale (length, section, section); importance-sorted. */
export interface ChainArrays {
  pos: Float32Array;
  quat: Float32Array;
  scale: Float32Array;
  count: number;
  long: number;
}

/** The far file (SWLF) to world-space chain instances. */
export function farToChains(buffer: ArrayBuffer, placement: { position: readonly number[]; yaw: number }): ChainArrays {
  const d = decodeFar(buffer);
  const inv = 1 / d.scale;
  const c = Math.cos(placement.yaw);
  const s = Math.sin(placement.yaw);
  const qy = [0, Math.sin(placement.yaw / 2), 0, Math.cos(placement.yaw / 2)] as const;
  const [px, py, pz] = placement.position as [number, number, number];
  const n = d.count;
  const pos = new Float32Array(n * 3);
  const quat = new Float32Array(n * 4);
  const scale = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lx = d.pos[i * 3]! * inv + d.min[0];
    const ly = d.pos[i * 3 + 1]! * inv + d.min[1];
    const lz = d.pos[i * 3 + 2]! * inv + d.min[2];
    pos[i * 3] = px + lx * c + lz * s;
    pos[i * 3 + 1] = py + ly;
    pos[i * 3 + 2] = pz - lx * s + lz * c;
    yawQuat(qy, d.quat[i * 4]! / 32767, d.quat[i * 4 + 1]! / 32767, d.quat[i * 4 + 2]! / 32767, d.quat[i * 4 + 3]! / 32767, quat, i * 4);
    scale[i * 3] = d.len[i]! / 100;
    scale[i * 3 + 1] = scale[i * 3 + 2] = d.sec[i]! / 100;
  }
  return { pos, quat, scale, count: n, long: d.long };
}

/** out[o..o+3] = normalize(q_yaw · q_local). */
function yawQuat(qy: readonly [number, number, number, number], ax: number, ay: number, az: number, aw: number, out: Float32Array, o: number): void {
  const [bx, by, bz, bw] = qy;
  const x = bw * ax + bx * aw + by * az - bz * ay;
  const y = bw * ay - bx * az + by * aw + bz * ax;
  const z = bw * az + bx * ay - by * ax + bz * aw;
  const w = bw * aw - bx * ax - by * ay - bz * az;
  const l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l;
  out[o + 1] = y / l;
  out[o + 2] = z / l;
  out[o + 3] = w / l;
}

/**
 * The detail file straight to spatial cells (world space), without keeping a
 * whole-building intermediate: two passes over the quantized pieces (count per
 * cell and stock, then fill), so the transient peak is the cell arrays plus
 * the fetched bytes.
 */
export function detailToCells(buffer: ArrayBuffer, placement: { position: readonly number[]; yaw: number }, size: number): { cells: CellArrays[]; count: number } {
  const d = decodeLandmark(buffer);
  const inv = 1 / d.scale;
  const c = Math.cos(placement.yaw);
  const s = Math.sin(placement.yaw);
  const qy = [0, Math.sin(placement.yaw / 2), 0, Math.cos(placement.yaw / 2)] as const;
  const [px, py, pz] = placement.position as [number, number, number];
  const half = [4, 2, 0.5];
  const stockOf = (i: number): number => {
    let t = 0;
    while (t < 2 && i >= d.tierStart[t + 1]!) t++;
    const runs = d.stockRuns[t]!;
    return i >= runs[2]! ? 2 : i >= runs[1]! ? 1 : 0;
  };
  const tierOf = (i: number): number => (i >= d.tierStart[2]! ? 2 : i >= d.tierStart[1]! ? 1 : 0);
  const world = (i: number, out: number[]): void => {
    const lx = d.pos[i * 3]! * inv + d.min[0];
    const ly = d.pos[i * 3 + 1]! * inv + d.min[1];
    const lz = d.pos[i * 3 + 2]! * inv + d.min[2];
    out[0] = px + lx * c + lz * s;
    out[1] = py + ly;
    out[2] = pz - lx * s + lz * c;
  };
  // pass 1: cell of every piece, counts per (cell, stock, tier) and bounds
  type Acc = { n: number[]; tier: number[][]; min: number[]; max: number[]; fill: number[]; out?: CellArrays };
  const cellOf = new Int32Array(d.count);
  const stockIdx = new Uint8Array(d.count);
  const keys = new Map<string, number>();
  const accs: Acc[] = [];
  const p = [0, 0, 0];
  for (let i = 0; i < d.count; i++) {
    world(i, p);
    const k = `${Math.floor(p[0]! / size)},${Math.floor(p[1]! / size)},${Math.floor(p[2]! / size)}`;
    let ci = keys.get(k);
    if (ci === undefined) {
      ci = accs.length;
      keys.set(k, ci);
      accs.push({ n: [0, 0, 0], tier: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], fill: [0, 0, 0] });
    }
    const a = accs[ci]!;
    const st = stockOf(i);
    cellOf[i] = ci;
    stockIdx[i] = st;
    a.n[st]!++;
    a.tier[st]![tierOf(i)]!++;
    const r = half[st]!;
    for (let ax = 0; ax < 3; ax++) {
      a.min[ax] = Math.min(a.min[ax]!, p[ax]! - r);
      a.max[ax] = Math.max(a.max[ax]!, p[ax]! + r);
    }
  }
  // the cells' merged chains: whole-building chains whose centres fall in the cell
  const cn = d.chains.count;
  const chainCell = new Int32Array(cn).fill(-1);
  const chainN = new Uint32Array(accs.length);
  for (let i = 0; i < cn; i++) {
    const lx = d.chains.pos[i * 3]! * inv + d.min[0];
    const ly = d.chains.pos[i * 3 + 1]! * inv + d.min[1];
    const lz = d.chains.pos[i * 3 + 2]! * inv + d.min[2];
    const wx = px + lx * c + lz * s;
    const wy = py + ly;
    const wz = pz - lx * s + lz * c;
    const ci = keys.get(`${Math.floor(wx / size)},${Math.floor(wy / size)},${Math.floor(wz / size)}`);
    if (ci === undefined) continue; // a chain whose centre lies in no piece cell (rare): the whole-building far chains still draw it
    chainCell[i] = ci;
    chainN[ci]!++;
    const a = accs[ci]!;
    const r = d.chains.len[i]! / 200;
    a.min[0] = Math.min(a.min[0]!, wx - r);
    a.min[1] = Math.min(a.min[1]!, wy - r);
    a.min[2] = Math.min(a.min[2]!, wz - r);
    a.max[0] = Math.max(a.max[0]!, wx + r);
    a.max[1] = Math.max(a.max[1]!, wy + r);
    a.max[2] = Math.max(a.max[2]!, wz + r);
  }
  // allocate exactly once per cell
  for (let ci = 0; ci < accs.length; ci++) {
    const a = accs[ci]!;
    const m = chainN[ci]!;
    const centre: [number, number, number] = [(a.min[0]! + a.max[0]!) / 2, (a.min[1]! + a.max[1]!) / 2, (a.min[2]! + a.max[2]!) / 2];
    a.out = {
      centre,
      radius: Math.hypot(a.max[0]! - centre[0], a.max[1]! - centre[1], a.max[2]! - centre[2]),
      stocks: [0, 1, 2].map((st) => ({
        pos: new Float32Array(a.n[st]! * 3),
        quat: new Float32Array(a.n[st]! * 4),
        seed: new Float32Array(a.n[st]!),
        tierEnd: [a.tier[st]![0]!, a.tier[st]![0]! + a.tier[st]![1]!, a.n[st]!] as [number, number, number],
      })),
      chains: { pos: new Float32Array(m * 3), quat: new Float32Array(m * 4), scale: new Float32Array(m * 3), count: m },
    };
  }
  // pass 2: fill (pieces are tier-sorted in the file, so each cell's stock arrays stay tier-sorted)
  for (let i = 0; i < d.count; i++) {
    const a = accs[cellOf[i]!]!;
    const st = stockIdx[i]!;
    const o = a.out!.stocks[st]!;
    const k = a.fill[st]!++;
    world(i, p);
    o.pos[k * 3] = p[0]!;
    o.pos[k * 3 + 1] = p[1]!;
    o.pos[k * 3 + 2] = p[2]!;
    yawQuat(qy, d.quat[i * 4]! / 32767, d.quat[i * 4 + 1]! / 32767, d.quat[i * 4 + 2]! / 32767, d.quat[i * 4 + 3]! / 32767, o.quat, k * 4);
    o.seed[k] = (i * 7919) % 10007;
  }
  const chainFill = new Uint32Array(accs.length);
  for (let i = 0; i < cn; i++) {
    const ci = chainCell[i]!;
    if (ci < 0) continue;
    const ch = accs[ci]!.out!.chains;
    const k = chainFill[ci]!++;
    const lx = d.chains.pos[i * 3]! * inv + d.min[0];
    const ly = d.chains.pos[i * 3 + 1]! * inv + d.min[1];
    const lz = d.chains.pos[i * 3 + 2]! * inv + d.min[2];
    ch.pos[k * 3] = px + lx * c + lz * s;
    ch.pos[k * 3 + 1] = py + ly;
    ch.pos[k * 3 + 2] = pz - lx * s + lz * c;
    yawQuat(qy, d.chains.quat[i * 4]! / 32767, d.chains.quat[i * 4 + 1]! / 32767, d.chains.quat[i * 4 + 2]! / 32767, d.chains.quat[i * 4 + 3]! / 32767, ch.quat, k * 4);
    ch.scale[k * 3] = d.chains.len[i]! / 100;
    ch.scale[k * 3 + 1] = ch.scale[k * 3 + 2] = d.chains.sec[i]! / 100;
  }
  for (const a of accs) if (a.out && Number.isFinite(a.out.radius)) octantsOfD(a.out);
  return { cells: accs.map((a) => a.out!).filter((x) => Number.isFinite(x.radius)), count: d.count };
}

/**
 * Reorder a cell's D arrays by octant (sign of each axis about the cell centre), keeping the tier order inside
 * each octant, and record the octants' runs, tier ends and bounds (CellArrays.dOct). In place; one scratch copy.
 */
export function octantsOfD(cell: CellArrays): void {
  const st = cell.stocks[2];
  if (!st) return;
  const n = st.seed.length;
  if (!n) return;
  const [cx, cy, cz] = cell.centre;
  const oct = new Uint8Array(n);
  const tierOf = (i: number): number => (i < st.tierEnd[0] ? 0 : i < st.tierEnd[1] ? 1 : 2);
  const count = new Uint32Array(8 * 3);
  for (let i = 0; i < n; i++) {
    const o = (st.pos[i * 3]! > cx ? 1 : 0) | (st.pos[i * 3 + 1]! > cy ? 2 : 0) | (st.pos[i * 3 + 2]! > cz ? 4 : 0);
    oct[i] = o;
    count[o * 3 + tierOf(i)]!++;
  }
  // destination of each (octant, tier) run
  const at = new Uint32Array(8 * 3);
  let k = 0;
  for (let o = 0; o < 8; o++) for (let t = 0; t < 3; t++) {
    at[o * 3 + t] = k;
    k += count[o * 3 + t]!;
  }
  const pos = new Float32Array(st.pos.length);
  const quat = new Float32Array(st.quat.length);
  const seed = new Float32Array(st.seed.length);
  const fill = at.slice();
  for (let i = 0; i < n; i++) {
    const j = fill[oct[i]! * 3 + tierOf(i)]!++;
    pos.set(st.pos.subarray(i * 3, i * 3 + 3), j * 3);
    quat.set(st.quat.subarray(i * 4, i * 4 + 4), j * 4);
    seed[j] = st.seed[i]!;
  }
  st.pos.set(pos);
  st.quat.set(quat);
  st.seed.set(seed);
  const out: NonNullable<CellArrays["dOct"]> = [];
  for (let o = 0; o < 8; o++) {
    const start = at[o * 3]!;
    const t0 = start + count[o * 3]!;
    const t1 = t0 + count[o * 3 + 1]!;
    const t2 = t1 + count[o * 3 + 2]!;
    if (t2 === start) continue;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < t2; i++) for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a]!, st.pos[i * 3 + a]! - 0.5);
      max[a] = Math.max(max[a]!, st.pos[i * 3 + a]! + 0.5);
    }
    const centre: [number, number, number] = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
    out.push({ start, tierEnd: [t0, t1, t2], centre, radius: Math.hypot(max[0]! - centre[0], max[1]! - centre[1], max[2]! - centre[2]) });
  }
  cell.dOct = out;
}

/** Bytes held by a set of cells' typed arrays (the runtime's residency accounting). */
export function cellBytes(cells: readonly CellArrays[]): number {
  let b = 0;
  for (const c of cells) {
    for (const st of c.stocks) b += st.pos.byteLength + st.quat.byteLength + st.seed.byteLength;
    b += c.chains.pos.byteLength + c.chains.quat.byteLength + c.chains.scale.byteLength;
  }
  return b;
}

/** Terrain chunk heights (n + 1)² from the packed terrain asset. */
export function chunkFromTerrain(buffer: ArrayBuffer, index: number, n: number, heightMin: number, heightScale: number): Float32Array {
  const per = (n + 1) * (n + 1);
  const src = new Uint16Array(buffer, index * per * 2, per);
  const out = new Float32Array(per);
  for (let i = 0; i < per; i++) out[i] = src[i]! / heightScale + heightMin;
  return out;
}

// ---------------------------------------------------------------- spatial cells (local detail driven by distance)

export interface CellArrays {
  /** World-space centre and bounding radius of the cell's contents. */
  centre: [number, number, number];
  radius: number;
  /** Pieces per stock, tier-sorted (tierEnd as in InstanceArrays). */
  stocks: { pos: Float32Array; quat: Float32Array; seed: Float32Array; tierEnd: [number, number, number] }[];
  /** Merged chains whose centres fall in the cell, importance-sorted. */
  chains: { pos: Float32Array; quat: Float32Array; scale: Float32Array; count: number };
  /**
   * The D stock's pieces are grouped by the cell's octants (20 m sub-blocks of a 40 m cell), each run
   * tier-sorted: [start, end) in the D arrays, with its own tier ends (absolute indices) and bounds, so
   * the near level can choose D detail per octant from its own distance (a refinement of the cell's
   * level, never coarser than the rule applied to the octant itself). Absent when D is empty.
   */
  dOct?: { start: number; tierEnd: [number, number, number]; centre: [number, number, number]; radius: number }[];
}

/**
 * Partition a decoded landmark into cubic cells of `size` metres (world
 * space). The near level draws real pieces only in cells close to the camera
 * and the cell's merged chains elsewhere, so detail follows the viewer
 * through a building instead of switching the whole building at once.
 */
export function toCells(inst: InstanceArrays, size: number): CellArrays[] {
  const key = (x: number, y: number, z: number): string => `${Math.floor(x / size)},${Math.floor(y / size)},${Math.floor(z / size)}`;
  type Acc = { pieces: number[][]; chains: number[]; min: number[]; max: number[] };
  const cells = new Map<string, Acc>();
  const acc = (k: string): Acc => {
    let a = cells.get(k);
    if (!a) cells.set(k, (a = { pieces: [[], [], []], chains: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    return a;
  };
  const grow = (a: Acc, x: number, y: number, z: number, r: number): void => {
    a.min[0] = Math.min(a.min[0]!, x - r);
    a.min[1] = Math.min(a.min[1]!, y - r);
    a.min[2] = Math.min(a.min[2]!, z - r);
    a.max[0] = Math.max(a.max[0]!, x + r);
    a.max[1] = Math.max(a.max[1]!, y + r);
    a.max[2] = Math.max(a.max[2]!, z + r);
  };
  const half = [4, 2, 0.5];
  inst.stocks.forEach((st, si) => {
    const n = st.seed.length;
    for (let i = 0; i < n; i++) {
      const x = st.pos[i * 3]!;
      const y = st.pos[i * 3 + 1]!;
      const z = st.pos[i * 3 + 2]!;
      const a = acc(key(x, y, z));
      a.pieces[si]!.push(i);
      grow(a, x, y, z, half[si]!);
    }
  });
  const c = inst.chains;
  for (let i = 0; i < c.count; i++) {
    const x = c.pos[i * 3]!;
    const y = c.pos[i * 3 + 1]!;
    const z = c.pos[i * 3 + 2]!;
    const a = acc(key(x, y, z));
    a.chains.push(i);
    grow(a, x, y, z, c.scale[i * 3]! / 2);
  }
  const out: CellArrays[] = [];
  for (const a of cells.values()) {
    const stocks = a.pieces.map((idx, si) => {
      const st = inst.stocks[si]!;
      // keep tier order (indices are increasing, and the source is tier-sorted)
      const pos = new Float32Array(idx.length * 3);
      const quat = new Float32Array(idx.length * 4);
      const seed = new Float32Array(idx.length);
      const tierEnd: [number, number, number] = [0, 0, idx.length];
      idx.forEach((i, k) => {
        pos.set(st.pos.subarray(i * 3, i * 3 + 3), k * 3);
        quat.set(st.quat.subarray(i * 4, i * 4 + 4), k * 4);
        seed[k] = st.seed[i]!;
        if (i < st.tierEnd[0]) tierEnd[0] = k + 1;
        if (i < st.tierEnd[1]) tierEnd[1] = k + 1;
      });
      return { pos, quat, seed, tierEnd };
    });
    const m = a.chains.length;
    const cp = new Float32Array(m * 3);
    const cq = new Float32Array(m * 4);
    const cs = new Float32Array(m * 3);
    a.chains.forEach((i, k) => {
      cp.set(c.pos.subarray(i * 3, i * 3 + 3), k * 3);
      cq.set(c.quat.subarray(i * 4, i * 4 + 4), k * 4);
      cs.set(c.scale.subarray(i * 3, i * 3 + 3), k * 3);
    });
    const centre: [number, number, number] = [(a.min[0]! + a.max[0]!) / 2, (a.min[1]! + a.max[1]!) / 2, (a.min[2]! + a.max[2]!) / 2];
    const radius = Math.hypot(a.max[0]! - centre[0], a.max[1]! - centre[1], a.max[2]! - centre[2]);
    if (Number.isFinite(radius)) out.push({ centre, radius, stocks, chains: { pos: cp, quat: cq, scale: cs, count: m } });
  }
  return out;
}
