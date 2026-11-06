// Static world collision for first-person exploration (main prompt §6).
// Independent of the workshop's server physics. A vertical capsule (the
// camera's body) moves against: the terrain heightfield, static box /
// cylinder / ramp proxies in a uniform grid, the sea-level floor over water,
// the ceiling, and the coastline boundary.
//
// Movement is resolved in conservative substeps no longer than half the
// capsule radius, so no proxy at least 0.5 m thick can be skipped at any
// speed; when the substep budget runs out the remaining motion is dropped
// (the player slows), never teleported through.
import type { ManifestCollider } from "./manifest.ts";

export type Vec3 = [number, number, number];

export interface Capsule {
  /** Radius and the eye's height above the feet. */
  radius: number;
  eye: number;
}
/** Eye 1.65; capsule radius 0.35; height (feet → top) = eye + 0.15 = 1.8, endpoints at feet + r and top − r. */
export const PLAYER: Capsule = { radius: 0.35, eye: 1.65 };
export const CAPSULE_HEIGHT = PLAYER.eye + 0.15;
/** Segment endpoints (relative to the feet) of the capsule's core: [r, height − r]. */
export const CAPSULE_SEGMENT: [number, number] = [PLAYER.radius, CAPSULE_HEIGHT - PLAYER.radius];

export interface World {
  ground(x: number, z: number): number;
  /** Signed distance to the coastline (negative inside the island). */
  coast(x: number, z: number): number;
  /** Outward unit normal of the coastline nearest (x, z). */
  coastNormal(x: number, z: number): [number, number];
  ceiling: number;
  /** Minimum flight height over the sea. */
  seaFloor: number;
  /** Hard boundary distance outside the coastline; soft feedback starts `soft` metres before it. */
  hard: number;
  soft: number;
}

interface Prepared {
  kind: "box" | "cyl" | "ramp";
  // box/ramp: centre, half extents in the local frame, cos/sin of yaw
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  c: number;
  s: number;
  r: number;
  y0: number;
  y1: number;
  floor: number;
  owner: string;
}

/** A uniform 2D grid over x–z of static proxies. */
export class StaticGrid {
  private cell: number;
  private cells = new Map<string, Prepared[]>();
  private owners = new Map<string, Prepared[]>();
  count = 0;

  constructor(cell = 32) {
    this.cell = cell;
  }

  add(owner: string, cols: readonly ManifestCollider[]): void {
    const list: Prepared[] = [];
    for (const col of cols) {
      let p: Prepared;
      if (col.kind === "box") p = { kind: "box", cx: col.c[0], cy: col.c[1], cz: col.c[2], hx: col.h[0], hy: col.h[1], hz: col.h[2], c: Math.cos(col.yaw), s: Math.sin(col.yaw), r: 0, y0: 0, y1: 0, floor: 0, owner };
      else if (col.kind === "cyl") p = { kind: "cyl", cx: col.c[0], cy: col.c[1], cz: col.c[2], hx: col.r, hy: col.hy, hz: col.r, c: 1, s: 0, r: col.r, y0: 0, y1: 0, floor: 0, owner };
      else p = { kind: "ramp", cx: col.c[0], cy: col.c[1], cz: col.c[2], hx: col.hx, hy: 0, hz: col.hz, c: Math.cos(col.yaw), s: Math.sin(col.yaw), r: 0, y0: col.y0, y1: col.y1, floor: col.floor, owner };
      list.push(p);
      const ext = p.kind === "cyl" ? p.r : Math.hypot(p.hx, p.hz);
      const i0 = Math.floor((p.cx - ext) / this.cell);
      const i1 = Math.floor((p.cx + ext) / this.cell);
      const j0 = Math.floor((p.cz - ext) / this.cell);
      const j1 = Math.floor((p.cz + ext) / this.cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        let a = this.cells.get(k);
        if (!a) this.cells.set(k, (a = []));
        a.push(p);
      }
    }
    this.owners.set(owner, list);
    this.count += list.length;
  }

  remove(owner: string): void {
    const list = this.owners.get(owner);
    if (!list) return;
    const set = new Set(list);
    for (const [k, a] of this.cells) {
      const f = a.filter((p) => !set.has(p));
      if (f.length) this.cells.set(k, f);
      else this.cells.delete(k);
    }
    this.owners.delete(owner);
    this.count -= list.length;
  }

  has(owner: string): boolean {
    return this.owners.has(owner);
  }

  /** Owners (landmarks, portals) whose colliders are in the grid. */
  ownerCount(): number {
    return this.owners.size;
  }

  near(x: number, z: number, r: number, out: Prepared[]): Prepared[] {
    out.length = 0;
    const i0 = Math.floor((x - r) / this.cell);
    const i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((z - r) / this.cell);
    const j1 = Math.floor((z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.cells.get(`${i},${j}`);
      if (a) for (const p of a) if (!out.includes(p)) out.push(p);
    }
    return out;
  }
}

/** Surface height of a ramp at (x, z), or null outside its footprint. */
function rampTop(p: Prepared, x: number, z: number): number | null {
  const dx = x - p.cx;
  const dz = z - p.cz;
  const lx = dx * p.c - dz * p.s;
  const lz = dx * p.s + dz * p.c;
  if (Math.abs(lx) > p.hx || Math.abs(lz) > p.hz) return null;
  const t = (lz + p.hz) / (2 * p.hz);
  return p.y0 + (p.y1 - p.y0) * t;
}

/**
 * Push a capsule (feet at f) out of one proxy. Returns the displacement
 * applied and the contact normal (unit), or null when not touching. Boxes and
 * cylinders are treated as vertical prisms for the side push; tops act as
 * floors when the feet are within a small step of them.
 */
function resolve(p: Prepared, f: Vec3, r: number, h: number, step: number): { n: Vec3; d: number; floor?: number } | null {
  if (p.kind === "ramp") return null; // ramps are floors only (handled by groundUnder)
  const yb = p.cy - p.hy;
  const yt = p.cy + p.hy;
  if (f[1] + h <= yb || f[1] >= yt) return null; // above or below
  // horizontal closest point
  let nx: number;
  let nz: number;
  let pen: number;
  const dx = f[0] - p.cx;
  const dz = f[2] - p.cz;
  if (p.kind === "cyl") {
    const d = Math.hypot(dx, dz);
    pen = p.r + r - d;
    if (pen <= 0) return null;
    nx = d > 1e-9 ? dx / d : 1;
    nz = d > 1e-9 ? dz / d : 0;
  } else {
    // into the box's frame (local x = (c, −s), local z = (s, c))
    const lx = dx * p.c - dz * p.s;
    const lz = dx * p.s + dz * p.c;
    const qx = Math.max(-p.hx, Math.min(p.hx, lx));
    const qz = Math.max(-p.hz, Math.min(p.hz, lz));
    const ox = lx - qx;
    const oz = lz - qz;
    const d = Math.hypot(ox, oz);
    let lnx: number;
    let lnz: number;
    if (d > 1e-9) {
      pen = r - d;
      if (pen <= 0) return null;
      lnx = ox / d;
      lnz = oz / d;
    } else {
      // centre inside the box footprint: push out along the shallowest side
      const px = p.hx - Math.abs(lx);
      const pz = p.hz - Math.abs(lz);
      if (px < pz) {
        lnx = Math.sign(lx) || 1;
        lnz = 0;
        pen = px + r;
      } else {
        lnx = 0;
        lnz = Math.sign(lz) || 1;
        pen = pz + r;
      }
    }
    // back to world: x = lnx·c + lnz·s, z = −lnx·s + lnz·c
    nx = lnx * p.c + lnz * p.s;
    nz = -lnx * p.s + lnz * p.c;
  }
  // a top we can stand on (feet slightly below it): resolve upward instead of sideways
  if (yt - f[1] <= step && f[1] >= yt - step) return { n: [0, 1, 0], d: yt - f[1], floor: yt };
  // a ceiling we bump from below (head into the bottom face) when mostly under it
  if (f[1] + h - yb < Math.min(0.4, pen)) return { n: [0, -1, 0], d: f[1] + h - yb };
  return { n: [nx, 0, nz], d: pen };
}

export interface MoveResult {
  feet: Vec3;
  vel: Vec3;
  grounded: boolean;
  /** Remaining distance dropped because the substep budget ran out. */
  dropped: number;
  /** 0 inside the soft band, rising to 1 at the hard boundary. */
  boundary: number;
  collided: boolean;
}

/**
 * Move the capsule's feet by vel·dt against the world, in substeps of at
 * most `maxStep` (≤ radius / 2). Velocity components into contacts are
 * removed (sliding); grounded when standing on terrain, a ramp or a top.
 */
export function move(world: World, grid: StaticGrid, feet: Vec3, vel: Vec3, dt: number, opts: { flying: boolean; stepUp?: number; maxSubsteps?: number } = { flying: false }): MoveResult {
  const r = PLAYER.radius;
  const h = CAPSULE_HEIGHT;
  const stepUp = opts.stepUp ?? 0.45;
  const maxStep = r / 2;
  const v: Vec3 = [vel[0], vel[1], vel[2]];
  const f: Vec3 = [feet[0], feet[1], feet[2]];
  const dist = Math.hypot(v[0], v[1], v[2]) * dt;
  const budget = opts.maxSubsteps ?? 400;
  const n = Math.min(budget, Math.max(1, Math.ceil(dist / maxStep)));
  const dropped = Math.max(0, dist - n * maxStep);
  const scaleDt = dist > 0 ? Math.min(dt, (n * maxStep) / Math.hypot(v[0], v[1], v[2])) : dt;
  const sub = scaleDt / n;
  let grounded = false;
  let collided = false;
  let boundary = 0;
  const near: Prepared[] = [];
  for (let k = 0; k < n; k++) {
    f[0] += v[0] * sub;
    f[1] += v[1] * sub;
    f[2] += v[2] * sub;
    // ---- horizontal boundary (soft slowdown applied by the controller; here only the hard limit)
    const sd = world.coast(f[0], f[2]);
    if (sd > world.hard - world.soft) boundary = Math.max(boundary, Math.min(1, (sd - (world.hard - world.soft)) / world.soft));
    if (sd > world.hard) {
      const [cnx, cnz] = world.coastNormal(f[0], f[2]);
      const over = sd - world.hard;
      f[0] -= cnx * over;
      f[2] -= cnz * over;
      const out = v[0] * cnx + v[2] * cnz;
      if (out > 0) {
        v[0] -= cnx * out;
        v[2] -= cnz * out;
      }
      collided = true;
    }
    // ---- static proxies
    grid.near(f[0], f[2], r + 1, near);
    for (let it = 0; it < 4; it++) {
      let any = false;
      for (const p of near) {
        const c = resolve(p, f, r, h, opts.flying ? 0.05 : stepUp);
        if (!c) continue;
        any = true;
        collided = true;
        f[0] += c.n[0] * c.d;
        f[1] += c.n[1] * c.d;
        f[2] += c.n[2] * c.d;
        const into = v[0] * c.n[0] + v[1] * c.n[1] + v[2] * c.n[2];
        if (into < 0) {
          v[0] -= c.n[0] * into;
          v[1] -= c.n[1] * into;
          v[2] -= c.n[2] * into;
        }
        if (c.n[1] > 0.5) grounded = true;
      }
      if (!any) break;
    }
    // ---- floors: terrain, ramps, sea floor
    let floor = world.ground(f[0], f[2]);
    for (const p of near) {
      if (p.kind !== "ramp") continue;
      const t = rampTop(p, f[0], f[2]);
      if (t !== null && f[1] >= p.floor - 0.5 && f[1] <= t + stepUp) floor = Math.max(floor, t);
    }
    if (floor < world.seaFloor && sd > -5) floor = Math.max(floor, opts.flying ? world.seaFloor : floor);
    if (f[1] < floor) {
      f[1] = floor;
      if (v[1] < 0) v[1] = 0;
      grounded = true;
    } else if (!opts.flying && f[1] - floor < 0.06) grounded = true;
    // ---- ceiling
    if (f[1] + h > world.ceiling) {
      f[1] = world.ceiling - h;
      if (v[1] > 0) v[1] = 0;
      collided = true;
    }
  }
  return { feet: f, vel: v, grounded, dropped, boundary, collided };
}

/** Clearance check: is a capsule standing at feet f free of every proxy and above the ground? */
export function clearAt(world: World, grid: StaticGrid, f: Vec3): { ok: boolean; reason?: string } {
  if (![...f].every(Number.isFinite)) return { ok: false, reason: "non-finite" };
  const g = world.ground(f[0], f[2]);
  if (f[1] < g - 0.05) return { ok: false, reason: `below ground by ${(g - f[1]).toFixed(2)}` };
  const near: Prepared[] = [];
  grid.near(f[0], f[2], PLAYER.radius + 1, near);
  for (const p of near) {
    const c = resolve(p, [f[0], f[1] + 0.02, f[2]], PLAYER.radius, CAPSULE_HEIGHT - 0.04, 0);
    if (c && c.d > 0.02) return { ok: false, reason: `inside a ${p.kind} of ${p.owner} by ${c.d.toFixed(2)}` };
  }
  if (world.coast(f[0], f[2]) > world.hard) return { ok: false, reason: "outside the boundary" };
  return { ok: true };
}

/** The standable height under (x, z) at or below `fromY`: the highest of terrain, ramps and proxy tops. */
export function groundUnder(world: World, grid: StaticGrid, x: number, z: number, fromY: number): number {
  let best = world.ground(x, z);
  const near: Prepared[] = [];
  grid.near(x, z, PLAYER.radius, near);
  for (const p of near) {
    if (p.kind === "ramp") {
      const t = rampTop(p, x, z);
      if (t !== null && t <= fromY + 0.5) best = Math.max(best, t);
      continue;
    }
    const top = p.cy + p.hy;
    if (top > fromY + 0.5) continue;
    let inside: boolean;
    if (p.kind === "cyl") inside = Math.hypot(x - p.cx, z - p.cz) <= p.r;
    else {
      const dx = x - p.cx;
      const dz = z - p.cz;
      inside = Math.abs(dx * p.c - dz * p.s) <= p.hx && Math.abs(dx * p.s + dz * p.c) <= p.hz;
    }
    if (inside) best = Math.max(best, top);
  }
  return best;
}
