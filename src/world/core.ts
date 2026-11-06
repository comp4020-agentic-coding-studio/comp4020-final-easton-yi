// Timber assembly core for the island world's preset landmarks. Shared by the
// offline generator (scripts/world), the browser worker and the tests: no DOM
// and no three.js, only numbers and typed arrays, so one recipe produces the
// same pieces everywhere.
//
// Conventions
// - World units are metres (1 unit ≈ 1 m) and y is up. This is the world's
//   own unit: the workshop's physics units are untouched.
// - A landmark's local origin is the centre of its footprint at foundation
//   level (y = 0). Its main front faces −z. x is its width W, z its depth D.
// - Every piece is exactly one preset stock, never scaled: B 8×1×1, M
//   4×0.5×0.5, D 1×0.125×0.125 (8:1:1 like the workshop stick). A piece's local
//   x is its length; local y and z are its square section.
// - yaw is a rotation about +y. A viewer with yaw θ looks along
//   (−sin θ, 0, −cos θ), the three.js camera convention, so a building placed
//   with yaw φ turns its local yaws into world yaws by adding φ.

export type V3 = [number, number, number];
export type StockId = "B" | "M" | "D";

export const STOCKS: Readonly<Record<StockId, { readonly index: number; readonly length: number; readonly section: number }>> = Object.freeze({
  B: { index: 0, length: 8, section: 1 },
  M: { index: 1, length: 4, section: 0.5 },
  D: { index: 2, length: 1, section: 0.125 },
});
export const STOCK_IDS: readonly StockId[] = ["B", "M", "D"];
/** The next smaller stock, or null for D. */
export const smaller = (s: StockId): StockId | null => (s === "B" ? "M" : s === "M" ? "D" : null);

/** Inspector stages (Appendix C1: base / columns / beams and arches / roof / detail). */
export const STAGES = ["base", "columns", "beams", "arches", "roof", "details"] as const;
export type Stage = (typeof STAGES)[number];

/**
 * Level-of-detail tier of a piece. Near detail draws every tier; mid detail
 * draws tiers 0 and 1. Defaults follow the stock (B 0, M 1, D 2); a recipe
 * promotes silhouette-defining D (capital outlines, tracery) to 1 and demotes
 * bulk M (decking, infill) to 2.
 */
export type Tier = 0 | 1 | 2;
const DEFAULT_TIER: Record<StockId, Tier> = { B: 0, M: 1, D: 2 };

// ---------------------------------------------------------------- vectors

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const dist = (a: V3, b: V3): number => len(sub(a, b));
/** Rotate a vector about +y by yaw (right-handed; matches three.js rotation.y). */
export const rotY = (p: V3, yaw: number): V3 => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};
/** Unit horizontal direction at angle a measured from +x towards +z. */
export const polar = (r: number, a: number, y = 0): V3 => [r * Math.cos(a), y, r * Math.sin(a)];
/** Forward vector of a viewer with this yaw. */
export const forwardOf = (yaw: number): V3 => [-Math.sin(yaw), 0, -Math.cos(yaw)];
/** The yaw whose forward vector points along the horizontal part of d. */
export const yawOf = (d: V3): number => Math.atan2(-d[0], -d[2]);

/** Quaternion [x, y, z, w] of the rotation whose columns are the basis vectors. */
export function quatFromBasis(x: V3, y: V3, z: V3): [number, number, number, number] {
  const m00 = x[0], m10 = x[1], m20 = x[2];
  const m01 = y[0], m11 = y[1], m21 = y[2];
  const m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let qx: number, qy: number, qz: number, qw: number;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  // canonical sign so equal rotations hash equally
  if (qw < 0 || (qw === 0 && qx < 0)) return [-qx, -qy, -qz, -qw];
  return [qx, qy, qz, qw];
}

/** Rotate v by unit quaternion q. */
export function quatApply(q: ArrayLike<number>, o: number, v: V3): V3 {
  const x = q[o]!, y = q[o + 1]!, z = q[o + 2]!, w = q[o + 3]!;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** A unit vector perpendicular to d, preferring world up as the section's y. */
export function defaultUp(d: V3): V3 {
  return Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [0, 0, 1];
}

// ---------------------------------------------------------------- non-visual outputs

/**
 * Static collision proxies, in local coordinates (yaw-rotated boxes, vertical
 * cylinders and walkable ramps). They are deliberately coarse: floors, walls,
 * piers, columns and ramps, never decoration. Every proxy must be at least
 * 0.5 m thick so the controller's substeps can't pass through it.
 */
export type Collider =
  | { kind: "box"; c: V3; h: V3; yaw: number }
  | { kind: "cyl"; c: V3; r: number; hy: number }
  /** A walkable slope over a yawed rectangle: surface height y0 at local −z, y1 at +z; solid below down to `floor`. */
  | { kind: "ramp"; c: V3; hx: number; hz: number; yaw: number; y0: number; y1: number; floor: number };

/** A marked traversable path: a capsule must pass from `a` to `b` (feet level) within `width` × `height` clearance. */
export interface Entry {
  id: string;
  a: V3;
  b: V3;
  width: number;
  height: number;
  main: boolean;
  note: string;
}
export type ViewKind = "ground" | "interior" | "high" | "detail" | "side";
export interface Viewpoint {
  id: string;
  kind: ViewKind;
  /** Eye position. */
  eye: V3;
  yaw: number;
  pitch: number;
  note?: string;
}
/** A standable recovery position: feet on a surface, capsule clear. */
export interface SafePoint {
  id: string;
  feet: V3;
  yaw: number;
}
export interface Feature {
  name: string;
  at?: V3;
}
export interface Revision {
  item: string;
  original: string;
  revised: string;
  reason: string;
  impact: string;
}
export type ShellKind = "shade" | "glass" | "plank";
/**
 * A rear shading shell: a plain box or vertical cylinder behind the timber
 * (h = half extents; for a cylinder h = [r, hy, r]), rotated by quaternion q.
 */
export interface Shell {
  shape: "box" | "cyl";
  c: V3;
  h: V3;
  q: [number, number, number, number];
  kind: ShellKind;
}

/** Quaternion product a·b. */
export function quatMul(a: readonly number[], b: readonly number[]): [number, number, number, number] {
  const [ax, ay, az, aw] = a as [number, number, number, number];
  const [bx, by, bz, bw] = b as [number, number, number, number];
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
/** Rotation yaw (about y), then pitch (about the turned x), then roll (about the turned z). */
export function quatYPR(yaw: number, pitch = 0, roll = 0): [number, number, number, number] {
  const qy: [number, number, number, number] = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const qp: [number, number, number, number] = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
  const qr: [number, number, number, number] = [0, 0, Math.sin(roll / 2), Math.cos(roll / 2)];
  return quatMul(quatMul(qy, qp), qr);
}
export interface WaterSurface {
  c: V3;
  hx: number;
  hz: number;
  yaw: number;
  speed: number;
  note: string;
}
export interface Plan {
  stage: Stage;
  band: string;
  courses: number;
  note?: string;
}

export interface CourseInfo {
  stage: Stage;
  band: string;
  course: number;
}

export interface BomRow extends CourseInfo {
  B: number;
  M: number;
  D: number;
}

export interface BuildResult {
  id: string;
  count: number;
  /** Local centres, 3 per piece. */
  pos: Float32Array;
  /** Unit quaternions [x y z w], 4 per piece. */
  quat: Float32Array;
  /** Stock index (0 B, 1 M, 2 D). */
  stock: Uint8Array;
  tier: Uint8Array;
  /** Index into `courses`. */
  course: Uint16Array;
  /** Index into `components`. */
  comp: Uint16Array;
  /** Chain id: pieces of one collinear chain share it (mid-LOD merging). */
  chain: Uint32Array;
  courses: CourseInfo[];
  components: string[];
  colliders: Collider[];
  entries: Entry[];
  viewpoints: Viewpoint[];
  safePoints: SafePoint[];
  features: Feature[];
  revisions: Revision[];
  plans: Plan[];
  bounds: { min: V3; max: V3 };
  /** Bounds without approach stairs and ramps (components named "approach…"), checked against the target envelope. */
  coreBounds: { min: V3; max: V3 };
  shells: Shell[];
  water: WaterSurface[];
  footings: V3[];
  bom: BomRow[];
  totals: { B: number; M: number; D: number; byTier: [number, number, number] };
  /** Exact coincident duplicates that were dropped (reported, not hidden). */
  duplicates: number;
  /** Pieces placed shorter-than-stock spans by overhanging, and automatic stock downgrades. */
  overhangs: number;
  downgrades: number;
  /** Quantized content hash of every piece (FNV-1a), for reproducibility checks. */
  hash: string;
}

// ---------------------------------------------------------------- builder

interface Ctx {
  stage: Stage;
  band: string;
  course: number;
  comp: string;
  tier: Tier | null;
}

/**
 * Collects pieces and their metadata. Recipes set context (stage, band,
 * course, component, tier) and place pieces through the primitives; the
 * builder records the course-level bill of materials, drops exact coincident
 * duplicates and computes actual bounds from the rotated sections.
 */
export class Builder {
  readonly id: string;
  private n = 0;
  private cap = 4096;
  private pos = new Float32Array(this.cap * 3);
  private quat = new Float32Array(this.cap * 4);
  private stockA = new Uint8Array(this.cap);
  private tierA = new Uint8Array(this.cap);
  private courseA = new Uint16Array(this.cap);
  private compA = new Uint16Array(this.cap);
  private chainA = new Uint32Array(this.cap);
  private chainId = 0;
  private inChain = false;
  private keys = new Set<string>();
  private courseIndex = new Map<string, number>();
  private courses: CourseInfo[] = [];
  private compIndex = new Map<string, number>();
  private components: string[] = [];
  private ctx: Ctx = { stage: "base", band: "base", course: 0, comp: "main", tier: null };
  private yaw = 0;
  private origin: V3 = [0, 0, 0];
  private min: V3 = [Infinity, Infinity, Infinity];
  private max: V3 = [-Infinity, -Infinity, -Infinity];
  duplicates = 0;
  overhangs = 0;
  downgrades = 0;
  readonly colliders: Collider[] = [];
  readonly entries: Entry[] = [];
  readonly viewpoints: Viewpoint[] = [];
  readonly safePoints: SafePoint[] = [];
  readonly features: Feature[] = [];
  readonly revisions: Revision[] = [];
  readonly plans: Plan[] = [];
  readonly shells: Shell[] = [];
  readonly water: WaterSurface[] = [];
  readonly footings: V3[] = [];
  private coreMin: V3 = [Infinity, Infinity, Infinity];
  private coreMax: V3 = [-Infinity, -Infinity, -Infinity];

  constructor(id: string) {
    this.id = id;
  }

  get count(): number {
    return this.n;
  }

  // ------------------------------------------------ context

  /** Set part of the context; returns the previous context. */
  set(c: Partial<Ctx>): Ctx {
    const prev = { ...this.ctx };
    Object.assign(this.ctx, c);
    return prev;
  }
  /** Run fn with part of the context set, then restore it. */
  with<T>(c: Partial<Ctx>, fn: () => T): T {
    const prev = this.set(c);
    try {
      return fn();
    } finally {
      this.ctx = prev;
    }
  }
  get context(): Readonly<Ctx> {
    return this.ctx;
  }

  /**
   * Run fn in a local frame translated by `offset` and turned by `yaw` about
   * +y. Pieces, colliders, entries, viewpoints and safe points placed inside
   * are transformed. Frames nest.
   */
  at<T>(offset: V3, yaw: number, fn: () => T): T {
    const o = this.origin;
    const y = this.yaw;
    this.origin = add(o, rotY(offset, y));
    this.yaw = y + yaw;
    try {
      return fn();
    } finally {
      this.origin = o;
      this.yaw = y;
    }
  }
  /** Local point → the builder's root (building-local) coordinates. */
  toRoot(p: V3): V3 {
    return add(this.origin, rotY(p, this.yaw));
  }
  private dirToRoot(d: V3): V3 {
    return rotY(d, this.yaw);
  }

  // ------------------------------------------------ pieces

  /**
   * Place one piece of `stock` centred at `center`, its length along `xDir`
   * and its section's y as close to `yHint` as possible. `jitter` (±1)
   * offsets it by 0.4 % of its section along y, so collinear overlapping
   * pieces of a chain don't share coplanar faces.
   */
  piece(stock: StockId, center: V3, xDir: V3, yHint?: V3, jitter = 0): void {
    const st = STOCKS[stock];
    let x = norm(this.dirToRoot(xDir));
    if (len(x) === 0) x = [1, 0, 0];
    let yh = yHint ? this.dirToRoot(yHint) : defaultUp(x);
    let y = sub(yh, scale(x, dot(yh, x)));
    if (len(y) < 1e-6) {
      yh = defaultUp(x);
      y = sub(yh, scale(x, dot(yh, x)));
    }
    y = norm(y);
    const z = cross(x, y);
    let c = this.toRoot(center);
    // lapped pieces of one chain are nudged apart across both section axes, so
    // no two faces are coplanar where they overlap (no depth fighting)
    if (jitter) c = add(c, scale(add(y, z), jitter * 0.015 * st.section));
    if (!Number.isFinite(c[0] + c[1] + c[2])) throw new Error(`${this.id}: non-finite piece position in ${this.ctx.band}`);

    const key = dedupeKey(st.index, c, x, y);
    if (this.keys.has(key)) {
      this.duplicates++;
      return;
    }
    this.keys.add(key);

    if (this.n === this.cap) this.grow();
    const i = this.n++;
    const q = quatFromBasis(x, y, z);
    this.pos[i * 3] = c[0];
    this.pos[i * 3 + 1] = c[1];
    this.pos[i * 3 + 2] = c[2];
    this.quat[i * 4] = q[0];
    this.quat[i * 4 + 1] = q[1];
    this.quat[i * 4 + 2] = q[2];
    this.quat[i * 4 + 3] = q[3];
    this.stockA[i] = st.index;
    this.chainA[i] = this.inChain ? this.chainId : ++this.chainId;
    this.tierA[i] = this.ctx.tier ?? DEFAULT_TIER[stock];
    this.courseA[i] = this.courseRef();
    this.compA[i] = this.compRef();
    // actual bounds: half extents of the rotated box along each world axis
    const hl = st.length / 2;
    const hs = st.section / 2;
    const core = !this.ctx.comp.startsWith("approach");
    for (let a = 0; a < 3; a++) {
      const e = Math.abs(x[a]!) * hl + Math.abs(y[a]!) * hs + Math.abs(z[a]!) * hs;
      if (c[a]! - e < this.min[a]!) this.min[a] = c[a]! - e;
      if (c[a]! + e > this.max[a]!) this.max[a] = c[a]! + e;
      if (core && c[a]! - e < this.coreMin[a]!) this.coreMin[a] = c[a]! - e;
      if (core && c[a]! + e > this.coreMax[a]!) this.coreMax[a] = c[a]! + e;
    }
  }

  private courseRef(): number {
    const k = `${this.ctx.stage}|${this.ctx.band}|${this.ctx.course}`;
    let i = this.courseIndex.get(k);
    if (i === undefined) {
      i = this.courses.length;
      if (i > 65535) throw new Error(`${this.id}: too many courses`);
      this.courses.push({ stage: this.ctx.stage, band: this.ctx.band, course: this.ctx.course });
      this.courseIndex.set(k, i);
    }
    return i;
  }
  private compRef(): number {
    let i = this.compIndex.get(this.ctx.comp);
    if (i === undefined) {
      i = this.components.length;
      if (i > 65535) throw new Error(`${this.id}: too many components`);
      this.components.push(this.ctx.comp);
      this.compIndex.set(this.ctx.comp, i);
    }
    return i;
  }

  private grow(): void {
    this.cap *= 2;
    const g = <T extends Float32Array | Uint8Array | Uint16Array>(a: T, k: number): T => {
      const b = new (a.constructor as new (n: number) => T)(this.cap * k);
      b.set(a);
      return b;
    };
    this.pos = g(this.pos, 3);
    this.quat = g(this.quat, 4);
    this.stockA = g(this.stockA, 1);
    this.tierA = g(this.tierA, 1);
    this.courseA = g(this.courseA, 1);
    this.compA = g(this.compA, 1);
    const c = new Uint32Array(this.cap);
    c.set(this.chainA);
    this.chainA = c;
  }

  /**
   * Group the pieces placed inside fn into one chain (collinear members of
   * one stock): the mid level of detail draws a chain as a single member.
   */
  chained<T>(fn: () => T): T {
    if (this.inChain) return fn();
    this.chainId++;
    this.inChain = true;
    try {
      return fn();
    } finally {
      this.inChain = false;
    }
  }

  // ------------------------------------------------ non-visual outputs (all in the current frame)

  box(c: V3, h: V3, yaw = 0): void {
    this.colliders.push({ kind: "box", c: this.toRoot(c), h, yaw: this.yaw + yaw });
  }
  /** Axis-aligned (in the current frame) box from min to max corners. */
  boxMinMax(min: V3, max: V3): void {
    this.box(scale(add(min, max), 0.5), scale(sub(max, min), 0.5));
  }
  cyl(c: V3, r: number, hy: number): void {
    this.colliders.push({ kind: "cyl", c: this.toRoot(c), r, hy });
  }
  /** Walkable ramp: centre (x, z), half sizes, surface y0 at local −z edge rising to y1 at +z edge; solid below to `floor`. */
  ramp(c: V3, hx: number, hz: number, yaw: number, y0: number, y1: number, floor = Math.min(y0, y1) - 1): void {
    const r = this.toRoot(c);
    const dy = r[1] - c[1];
    this.colliders.push({ kind: "ramp", c: r, hx, hz, yaw: this.yaw + yaw, y0: y0 + dy, y1: y1 + dy, floor: floor + dy });
  }
  entry(id: string, a: V3, b: V3, width: number, height: number, main: boolean, note: string): void {
    this.entries.push({ id, a: this.toRoot(a), b: this.toRoot(b), width, height, main, note });
  }
  view(id: string, kind: ViewKind, eye: V3, yaw: number, pitch: number, note?: string): void {
    this.viewpoints.push({ id, kind, eye: this.toRoot(eye), yaw: this.yaw + yaw, pitch, note });
  }
  /** Eye position looking at a target point. */
  viewAt(id: string, kind: ViewKind, eye: V3, target: V3, note?: string): void {
    const d = sub(target, eye);
    this.view(id, kind, eye, yawOf(d), Math.atan2(d[1], Math.hypot(d[0], d[2])), note);
  }
  safe(id: string, feet: V3, yaw: number): void {
    this.safePoints.push({ id, feet: this.toRoot(feet), yaw: this.yaw + yaw });
  }
  feature(name: string, at?: V3): void {
    this.features.push({ name, at: at ? this.toRoot(at) : undefined });
  }
  revise(r: Revision): void {
    this.revisions.push(r);
  }
  /**
   * A rear shading shell (main prompt §7.1: allowed behind timber, never a
   * substitute for it): a plain box drawn in a darker or glassy finish so
   * facades read as solid. Not a piece and not in the BOM.
   */
  shell(c: V3, h: V3, kind: ShellKind = "shade", rot: { yaw?: number; pitch?: number; roll?: number } = {}): void {
    this.shells.push({ shape: "box", c: this.toRoot(c), h, q: quatYPR(this.yaw + (rot.yaw ?? 0), rot.pitch ?? 0, rot.roll ?? 0), kind });
  }
  /** A vertical cylinder shell (column cores behind recessed flutes). */
  shellCyl(c: V3, r: number, hy: number, kind: ShellKind = "shade"): void {
    this.shells.push({ shape: "cyl", c: this.toRoot(c), h: [r, hy, r], q: [0, 0, 0, 1], kind });
  }
  /** A water surface: a flat yawed rectangle at c (top), flowing along local +z at `speed` m/s (0 = still). */
  waterRect(c: V3, hx: number, hz: number, yaw: number, speed: number, note: string): void {
    this.water.push({ c: this.toRoot(c), hx, hz, yaw: this.yaw + yaw, speed, note });
  }
  /** A point where the structure meets the ground (validated against the terrain). */
  footing(p: V3): void {
    this.footings.push(this.toRoot(p));
  }
  /** Declare a band's planned course count; the validator checks every course has pieces. */
  plan(stage: Stage, band: string, courses: number, note?: string): void {
    this.plans.push({ stage, band, courses, note });
  }

  // ------------------------------------------------ result

  finalize(): BuildResult {
    const n = this.n;
    const pos = this.pos.slice(0, n * 3);
    const quat = this.quat.slice(0, n * 4);
    const stock = this.stockA.slice(0, n);
    const tier = this.tierA.slice(0, n);
    const course = this.courseA.slice(0, n);
    const comp = this.compA.slice(0, n);
    const chainOf = this.chainA.slice(0, n);
    const rows: BomRow[] = this.courses.map((c) => ({ ...c, B: 0, M: 0, D: 0 }));
    const totals = { B: 0, M: 0, D: 0, byTier: [0, 0, 0] as [number, number, number] };
    let h = 0x811c9dc5;
    const mix = (v: number): void => {
      h ^= v & 0xffff;
      h = Math.imul(h, 0x01000193);
      h ^= (v >>> 16) & 0xffff;
      h = Math.imul(h, 0x01000193);
    };
    for (let i = 0; i < n; i++) {
      const s = STOCK_IDS[stock[i]!]!;
      rows[course[i]!]![s]++;
      totals[s]++;
      totals.byTier[tier[i]! as Tier]++;
      mix(stock[i]!);
      for (let k = 0; k < 3; k++) mix(Math.round(pos[i * 3 + k]! * 1000));
      for (let k = 0; k < 4; k++) mix(Math.round(quat[i * 4 + k]! * 10000));
    }
    return {
      id: this.id,
      count: n,
      pos,
      quat,
      stock,
      tier,
      course,
      comp,
      chain: chainOf,
      courses: this.courses,
      components: this.components,
      colliders: this.colliders,
      entries: this.entries,
      viewpoints: this.viewpoints,
      safePoints: this.safePoints,
      features: this.features,
      revisions: this.revisions,
      plans: this.plans,
      bounds: n ? { min: [...this.min] as V3, max: [...this.max] as V3 } : { min: [0, 0, 0], max: [0, 0, 0] },
      coreBounds: Number.isFinite(this.coreMin[0]) ? { min: [...this.coreMin] as V3, max: [...this.coreMax] as V3 } : { min: [0, 0, 0], max: [0, 0, 0] },
      shells: this.shells,
      water: this.water,
      footings: this.footings,
      bom: rows,
      totals,
      duplicates: this.duplicates,
      overhangs: this.overhangs,
      downgrades: this.downgrades,
      hash: (h >>> 0).toString(16).padStart(8, "0"),
    };
  }
}

/**
 * Identity of a placed box up to its symmetries: a stick turned end for end,
 * or rolled by a multiple of 90° about its length, is the same geometry.
 */
function dedupeKey(stock: number, c: V3, x: V3, y: V3): string {
  let xs = x;
  // sign-normalise the length axis
  const lead = Math.abs(x[0]) > 1e-6 ? x[0] : Math.abs(x[1]) > 1e-6 ? x[1] : x[2];
  if (lead < 0) xs = scale(x, -1);
  const k: V3 = Math.abs(xs[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const r = norm(cross(xs, k));
  const rr = cross(xs, r);
  let roll = Math.atan2(dot(y, rr), dot(y, r));
  const q = Math.PI / 2;
  roll = ((roll % q) + q) % q;
  if (q - roll < 5e-4) roll = 0;
  const f = (v: number, s: number): number => Math.round(v * s);
  return `${stock}|${f(c[0], 1000)}|${f(c[1], 1000)}|${f(c[2], 1000)}|${f(xs[0], 2000)}|${f(xs[1], 2000)}|${f(xs[2], 2000)}|${f(roll, 1000)}`;
}

/** Deterministic PRNG (mulberry32) for recipes and scattering. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
