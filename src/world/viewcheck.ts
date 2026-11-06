// What a viewpoint actually shows (brief §13.1: "a safe viewpoint per building"). The generator used
// to check only that each viewpoint kind exists and that its eye is clear; L12's interior and detail
// views passed while one looked straight up a column face and the other sat inside the colonnade's
// entablature. This casts a grid of rays through the world camera's frustum (55° vertical, the
// stage's wide aspect) against the landmark's own pieces (oriented boxes of their stock) and shells,
// and reports what fraction is blocked at the lens and what fraction meets the building at all.
import { STOCKS, STOCK_IDS, type BuildResult, type Viewpoint, type V3 } from "./core.ts";

export const VIEW_FOV = 55;
/** The home and world stages are wide (1280 × 562 at a 1280 × 720 window). */
export const VIEW_ASPECT = 2.28;
/** A ray that meets a surface closer than this is "at the lens". */
export const LENS = 2.5;

export interface ViewContent {
  id: string;
  kind: string;
  /** Fraction of rays blocked within LENS metres. */
  blocked: number;
  /** Fraction of rays that meet the landmark (pieces or shells) within `reach` metres. */
  building: number;
  /** Median hit distance of the rays that meet the landmark. */
  median: number;
}

interface Obb {
  c: V3;
  ax: [V3, V3, V3];
  h: V3;
}

const rot = (q: readonly number[], v: readonly number[]): V3 => {
  const [x, y, z, w] = q as [number, number, number, number];
  const [vx, vy, vz] = v as [number, number, number];
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

/** Slab test of a ray against an oriented box; the entry distance, or Infinity. */
function hitObb(o: V3, d: V3, b: Obb): number {
  let t0 = -Infinity;
  let t1 = Infinity;
  const p: V3 = [b.c[0] - o[0], b.c[1] - o[1], b.c[2] - o[2]];
  for (let a = 0; a < 3; a++) {
    const ax = b.ax[a]!;
    const e = ax[0] * p[0] + ax[1] * p[1] + ax[2] * p[2];
    const f = ax[0] * d[0] + ax[1] * d[1] + ax[2] * d[2];
    const h = b.h[a]!;
    if (Math.abs(f) > 1e-9) {
      let ta = (e + h) / f;
      let tb = (e - h) / f;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1 || t1 < 0) return Infinity;
    } else if (-e - h > 0 || -e + h < 0) return Infinity;
  }
  return t0 >= 0 ? t0 : 0;
}

/** Oriented boxes for every piece and box shell, binned in a uniform grid for the ray walk. */
function scene(r: BuildResult, cell: number): { boxes: Obb[]; grid: Map<string, number[]>; cell: number } {
  const boxes: Obb[] = [];
  for (let i = 0; i < r.count; i++) {
    const st = STOCKS[STOCK_IDS[r.stock[i]!]!];
    const q = [r.quat[i * 4]!, r.quat[i * 4 + 1]!, r.quat[i * 4 + 2]!, r.quat[i * 4 + 3]!];
    boxes.push({ c: [r.pos[i * 3]!, r.pos[i * 3 + 1]!, r.pos[i * 3 + 2]!], ax: [rot(q, [1, 0, 0]), rot(q, [0, 1, 0]), rot(q, [0, 0, 1])], h: [st.length / 2, st.section / 2, st.section / 2] });
  }
  for (const s of r.shells) {
    // cylinders as their bounding box (conservative for "blocked", fine for "meets the building")
    boxes.push({ c: s.c, ax: [rot(s.q, [1, 0, 0]), rot(s.q, [0, 1, 0]), rot(s.q, [0, 0, 1])], h: s.h });
  }
  const grid = new Map<string, number[]>();
  boxes.forEach((b, i) => {
    const r2 = Math.hypot(...b.h);
    const lo = b.c.map((v) => Math.floor((v - r2) / cell));
    const hi = b.c.map((v) => Math.floor((v + r2) / cell));
    for (let x = lo[0]!; x <= hi[0]!; x++) for (let y = lo[1]!; y <= hi[1]!; y++) for (let z = lo[2]!; z <= hi[2]!; z++) {
      const k = `${x},${y},${z}`;
      const a = grid.get(k);
      if (a) a.push(i);
      else grid.set(k, [i]);
    }
  });
  return { boxes, grid, cell };
}

/** Nearest hit along a ray, walking the grid cells it passes (3D DDA) up to `reach` metres. */
function cast(s: ReturnType<typeof scene>, o: V3, d: V3, reach: number): number {
  const { cell, grid, boxes } = s;
  const pos = o.map((v) => Math.floor(v / cell)) as V3;
  const step = d.map((v) => (v > 0 ? 1 : -1)) as V3;
  const tMax = [0, 1, 2].map((a) => (d[a] === 0 ? Infinity : ((pos[a]! + (step[a]! > 0 ? 1 : 0)) * cell - o[a]!) / d[a]!));
  const tDelta = [0, 1, 2].map((a) => (d[a] === 0 ? Infinity : cell / Math.abs(d[a]!)));
  let best = Infinity;
  const tested = new Set<number>();
  let t = 0;
  while (t <= reach) {
    const list = grid.get(`${pos[0]},${pos[1]},${pos[2]}`);
    if (list) for (const i of list) {
      if (tested.has(i)) continue;
      tested.add(i);
      const h = hitObb(o, d, boxes[i]!);
      if (h < best) best = h;
    }
    // a hit inside the cells walked so far is final once the walk passes it
    const a = tMax[0]! < tMax[1]! ? (tMax[0]! < tMax[2]! ? 0 : 2) : tMax[1]! < tMax[2]! ? 1 : 2;
    t = tMax[a]!;
    if (best <= t) return best;
    pos[a] += step[a]!;
    tMax[a] += tDelta[a]!;
  }
  return best <= reach ? best : Infinity;
}

/** Content of each of a landmark's viewpoints (local space, as the BuildResult). */
export function viewContent(r: BuildResult, opts: { cols?: number; rows?: number; reach?: number } = {}): ViewContent[] {
  const cols = opts.cols ?? 24;
  const rows = opts.rows ?? 12;
  const reach = opts.reach ?? 600;
  const s = scene(r, 8);
  const tanY = Math.tan((VIEW_FOV * Math.PI) / 360);
  const tanX = tanY * VIEW_ASPECT;
  return r.viewpoints.map((v: Viewpoint) => {
    const cy = Math.cos(v.yaw);
    const sy = Math.sin(v.yaw);
    const cp = Math.cos(v.pitch);
    const sp = Math.sin(v.pitch);
    // three.js YXZ camera: forward (−sin y cos p, sin p, −cos y cos p), right (cos y, 0, −sin y), up = right × forward
    const f: V3 = [-sy * cp, sp, -cy * cp];
    const rt: V3 = [cy, 0, -sy];
    const up: V3 = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    const dists: number[] = [];
    let blocked = 0;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const u = ((i + 0.5) / cols) * 2 - 1;
      const w = ((j + 0.5) / rows) * 2 - 1;
      const d: V3 = [f[0] + rt[0] * u * tanX + up[0] * w * tanY, f[1] + rt[1] * u * tanX + up[1] * w * tanY, f[2] + rt[2] * u * tanX + up[2] * w * tanY];
      const l = Math.hypot(...d);
      const h = cast(s, v.eye, [d[0] / l, d[1] / l, d[2] / l], reach);
      if (h < LENS) blocked++;
      if (Number.isFinite(h)) dists.push(h);
    }
    const n = cols * rows;
    dists.sort((a, b) => a - b);
    return { id: v.id, kind: v.kind, blocked: blocked / n, building: dists.length / n, median: dists.length ? dists[dists.length >> 1]! : Infinity };
  });
}

/**
 * The acceptance rule: no viewpoint may be mostly blocked at the lens, and every viewpoint must show
 * the building (at least a sixth of the frame meets it). "High" views see the whole building small, so
 * they only need some of the frame.
 */
export function viewOk(v: ViewContent): boolean {
  return v.blocked <= 0.25 && v.building >= (v.kind === "high" ? 0.06 : 0.16);
}

/**
 * World placement: what share of a building's body terrain hides from an eye outside it. Sample points fill the
 * building's actual bounds (5 × 3 × 3, inset 10 % from each face) in world space; samples below the ground there
 * (a foundation bedded in rock) are left out, and a sample is hidden when the heightfield rises above the straight
 * line from the eye to it. The L13 high view passed every local check while
 * a 200 m canyon rim stood between it and the conservatory (82 % hidden); this is the check that catches it.
 */
export function terrainHidden(eye: readonly number[], bounds: { min: readonly number[]; max: readonly number[] }, toWorld: (v: readonly number[]) => readonly number[], heightAt: (x: number, z: number) => number): number {
  const { min, max } = bounds;
  let hidden = 0;
  let n = 0;
  for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fy of [0.1, 0.5, 0.9]) for (const fz of [0.1, 0.5, 0.9]) {
    const t = toWorld([min[0]! + (max[0]! - min[0]!) * fx, min[1]! + (max[1]! - min[1]!) * fy, min[2]! + (max[2]! - min[2]!) * fz]);
    // a sample inside the ground is bedded, not hidden from this eye (a dam's base in its canyon): not counted
    if (heightAt(t[0]!, t[2]!) > t[1]! + 0.3) continue;
    n++;
    const d = Math.hypot(t[0]! - eye[0]!, t[2]! - eye[2]!);
    const steps = Math.ceil(d / 3);
    for (let k = 1; k < steps; k++) {
      const f = k / steps;
      if (heightAt(eye[0]! + (t[0]! - eye[0]!) * f, eye[2]! + (t[2]! - eye[2]!) * f) > eye[1]! + (t[1]! - eye[1]!) * f + 0.3) {
        hidden++;
        break;
      }
    }
  }
  return n ? hidden / n : 1;
}
