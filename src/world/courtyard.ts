// The home courtyard (courtyard/day-night directive §4–§5, 2026-11-06): a shallow
// pond with a low stone platform, stepping stones and stone edges, candle
// stones by the pond and beside each gateway's approach, and a small
// white-flower meadow in the foreground. Pure data and functions (no DOM, no
// three.js): the generator writes it into the manifest, the browser draws it
// and folds `courtGround` into the explorer's ground, and the tests check it,
// all from this one description.
//
// Everything is laid out in the spawn's own horizontal frame: F metres forward
// along the initial view and L metres to its left. The terrain heightfield is
// sampled every 4 m, too coarse for a 12 m pond, so the basin is an explicit
// surface: `courtGround` is the ground inside the pond (bed, platform, stepping
// stones) and on the stones around it, the renderer discards the terrain's
// fragments inside the pond's outline (materials.ts terrainMaterial) and draws
// the basin from the same profile (courtyard-view.ts). The terrain data and the
// home pad are unchanged.
import { rng } from "./core.ts";

export type XZ = [number, number];

/** The spawn's horizontal frame: origin, its ground height, unit forward and unit left vectors (x, z). */
export interface CourtFrame {
  o: XZ;
  y: number;
  f: XZ;
  l: XZ;
}

export function courtFrame(spawn: readonly number[], yaw: number): CourtFrame {
  const f: XZ = [-Math.sin(yaw), -Math.cos(yaw)];
  return { o: [spawn[0]!, spawn[2]!], y: spawn[1]!, f, l: [f[1], -f[0]] };
}

/** (F, L) in the spawn frame → world (x, z). */
export function at(fr: CourtFrame, F: number, L: number): XZ {
  return [fr.o[0] + fr.f[0] * F + fr.l[0] * L, fr.o[1] + fr.f[1] * F + fr.l[1] * L];
}
/** World (x, z) → (F, L) in the spawn frame. */
export function frameOf(fr: CourtFrame, x: number, z: number): XZ {
  const dx = x - fr.o[0];
  const dz = z - fr.o[1];
  return [dx * fr.f[0] + dz * fr.f[1], dx * fr.l[0] + dz * fr.l[1]];
}

// ---------------------------------------------------------------- the pond

/**
 * The pond's outline: an ellipse (semi-axes `a` across the view, `b` along it) about centre `c`, its across axis
 * at world angle `rot`, made softly irregular by a radial wave k(φ) = 1 + Σ amp·sin(n·φ + phase).
 */
export interface Pond {
  c: XZ;
  /** World unit vectors of the pond's across (u) and along (v) axes. */
  u: XZ;
  v: XZ;
  a: number;
  b: number;
  wave: readonly (readonly [number, number, number])[];
  /** Ground height at the rim (the home pad), the bed's depth below it and the water surface. */
  rim: number;
  depth: number;
  water: number;
}

/** Radial wave of the outline at angle φ (pond-local). */
export function pondWave(p: Pond, phi: number): number {
  let k = 1;
  for (const [n, amp, ph] of p.wave) k += amp * Math.sin(n * phi + ph);
  return k;
}

/** Pond-local coordinates (metres across and along) of a world point. */
export function pondLocal(p: Pond, x: number, z: number): XZ {
  const dx = x - p.c[0];
  const dz = z - p.c[1];
  return [dx * p.u[0] + dz * p.u[1], dx * p.v[0] + dz * p.v[1]];
}
export function pondWorld(p: Pond, u: number, v: number): XZ {
  return [p.c[0] + p.u[0] * u + p.v[0] * v, p.c[1] + p.u[1] * u + p.v[1] * v];
}

/** Normalised radius: < 1 inside the outline, 1 on it. */
export function pondRho(p: Pond, x: number, z: number): number {
  const [u, v] = pondLocal(p, x, z);
  const eu = u / p.a;
  const ev = v / p.b;
  return Math.hypot(eu, ev) / pondWave(p, Math.atan2(ev, eu));
}

/** A point on the outline at angle φ, scaled by s (1 = the rim). */
export function pondOutline(p: Pond, phi: number, s = 1): XZ {
  const k = pondWave(p, phi) * s;
  return pondWorld(p, Math.cos(phi) * p.a * k, Math.sin(phi) * p.b * k);
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Where the bed starts rising toward the rim (normalised radius). */
export const BANK_START = 0.78;
/** The basin's own surface at normalised radius ρ (rim height at ρ ≥ 1). */
export function bedAt(p: Pond, rho: number): number {
  return p.rim - p.depth * (1 - smooth(BANK_START, 1, rho));
}
/** Normalised radius where the bank meets the water surface. */
export function waterlineRho(p: Pond): number {
  // invert bedAt(ρ) = water on the bank
  let lo = BANK_START;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (bedAt(p, m) < p.water) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- stones

/** A flat-topped stone (platform, stepping stone, candle slab, plinth): a convex polygon top at `top`, sides falling to `base`. */
export interface Slab {
  id: string;
  kind: "platform" | "step" | "candle" | "plinth";
  /** Top outline (world x, z), counter-clockwise seen from above. */
  poly: XZ[];
  top: number;
  base: number;
  /** How far the sides spread beyond the top outline at the base (a slight batter). */
  batter: number;
  seed: number;
}

/** A low edge stone from the island's rock family: footprint semi-axes along its own yaw, height above its base. */
export interface EdgeStone {
  id: string;
  c: XZ;
  yaw: number;
  a: number;
  b: number;
  h: number;
  base: number;
  /** Rock silhouette (0–7, rockGeometries) and a seed for its own variation. */
  variant: number;
  seed: number;
}

/** One candle cup: base centre (world), cup diameter and height. */
export type Cup = [number, number, number, number, number];

export interface CandleGroupData {
  id: string;
  /** Where the group's light sits (world), how far it reaches and how much it matters (selection weight). */
  light: [number, number, number];
  range: number;
  weight: number;
  /** Interior zone the group belongs to (null: outside). */
  zone: string | null;
  /** Navigation group (entrance, stair, landing): kept on every tier. Decorative groups thin out on Low. */
  essential: boolean;
  kind: string;
  cups: Cup[];
}

export interface Flower {
  x: number;
  z: number;
  /** Stem height (m), yaw (rad), lean (rad), a 0–1 seed for colour and sway. */
  h: number;
  yaw: number;
  lean: number;
  s: number;
}

export interface Courtyard {
  frame: CourtFrame;
  pond: Pond;
  slabs: Slab[];
  edges: EdgeStone[];
  candles: CandleGroupData[];
  /** Flower patches: centre and semi-axes in the spawn frame (F, L), for reports and tests. */
  patches: { id: string; c: XZ; r: XZ }[];
  /** Small meadow rocks among the flowers. */
  meadowRocks: EdgeStone[];
  /** Primary routes (world x, z polylines, 3 m wide): spawn → pond ring, the ring, ring → each gateway's approach. */
  routes: { id: string; points: XZ[]; width: number }[];
  /** Each gateway's approach rectangle kept clear: centre, unit normal toward the spawn, half-width and depth. */
  approaches: { id: string; c: XZ; n: XZ; half: number; depth: number }[];
  /** A bounding circle of everything above (for cheap rejection in ground queries). */
  bound: { c: XZ; r: number };
}

/** The candle cup's size range (directive §8): diameter 0.22–0.32 m, height 0.12–0.20 m. */
export const CUP_SIZES: readonly (readonly [number, number])[] = [
  [0.26, 0.14],
  [0.3, 0.17],
  [0.24, 0.13],
  [0.28, 0.19],
  [0.32, 0.15],
  [0.27, 0.16],
];

/** Lay `n` cups around a centre in a loose cluster (deterministic per seed); positions in a local 2D frame. */
export function cupCluster(n: number, seed: number, spread = 1): { dx: number; dz: number; d: number; h: number }[] {
  const r = rng(seed);
  const out: { dx: number; dz: number; d: number; h: number }[] = [];
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const [d, h] = CUP_SIZES[(i + Math.floor(r() * CUP_SIZES.length)) % CUP_SIZES.length]!;
    if (i === 0 && n > 3) {
      out.push({ dx: 0, dz: 0, d, h: h + 0.02 });
      continue;
    }
    const ring = n > 3 ? i - 1 : i;
    const count = n > 3 ? n - 1 : n;
    const ang = phase + (ring / count) * Math.PI * 2 + (r() - 0.5) * 0.35;
    // the ring clears the centre cup and its neighbours: chord between neighbours ≥ the largest cup plus a gap
    const minChord = 0.36;
    const ringR = Math.max(count <= 3 ? 0.24 : 0.36, minChord / (2 * Math.sin(Math.PI / count)));
    const rad = ringR * spread + r() * 0.03;
    out.push({ dx: Math.cos(ang) * rad, dz: Math.sin(ang) * rad, d, h });
  }
  return out;
}

/**
 * Signed distance to a convex polygon (either winding): negative inside. Outside, the largest edge-line distance
 * (a lower bound of the true distance near corners, exact along edges).
 */
export function polySdf(poly: readonly XZ[], x: number, z: number): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]!;
    const [bx, bz] = poly[(i + 1) % poly.length]!;
    area += ax * bz - bx * az;
  }
  const w = area >= 0 ? 1 : -1;
  let d = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]!;
    const [bx, bz] = poly[(i + 1) % poly.length]!;
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez) || 1;
    // outward distance from this edge's line (positive outside for a counter-clockwise polygon)
    d = Math.max(d, (-(ex * (z - az) - ez * (x - ax)) / len) * w);
  }
  return d;
}

/** Inside a convex polygon by at least `margin` metres (a negative margin accepts points just outside). */
export function insidePoly(poly: readonly XZ[], x: number, z: number, margin = 0): boolean {
  return polySdf(poly, x, z) < -margin;
}

/** An irregular convex polygon of `n` vertices about c, radii (ra, rb) along a yawed frame, ±jitter. */
function irregular(c: XZ, ra: number, rb: number, yaw: number, n: number, jitter: number, seed: number): XZ[] {
  const r = rng(seed);
  const pts: XZ[] = [];
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n) * 0.6;
    const k = 1 - jitter + r() * jitter;
    const lx = Math.cos(t) * ra * k;
    const lz = Math.sin(t) * rb * k;
    pts.push([c[0] + lx * cy - lz * sy, c[1] + lx * sy + lz * cy]);
  }
  return convexHull(pts);
}

function convexHull(pts: XZ[]): XZ[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: XZ, a: XZ, b: XZ): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XZ[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: XZ[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// ---------------------------------------------------------------- gateway approaches (from the portal layout)

export interface PortalLike {
  id: string;
  position: readonly number[];
  yaw: number;
}

// ---------------------------------------------------------------- the authored layout

/**
 * Tuning (directive §4): the pond's centre 15.5 m forward and 4.5 m left of the spawn (the directive's starting
 * proposal: 14–16 forward, 4–5 left), 12.4 × 8.4 m overall, 0.20 m of water over its bed. Adjusted against the
 * real view, not the plan: see docs/evidence/world/courtyard.md.
 */
export const POND = Object.freeze({ F: 15.5, L: 4.5, a: 6.2, b: 4.2, turn: 0.12, depth: 0.24, freeboard: 0.04 });
/** The central platform: about 3.5 m across, its top 0.14 m above the water. */
export const PLATFORM = Object.freeze({ u: -0.4, v: 0.25, r: 1.75, rise: 0.14 });

/** Every cup's whole footprint stands this far inside its stone's top (no rim over the edge). */
export const CUP_EDGE_MARGIN = 0.03;

/**
 * Grow a candle stone about its centroid (in 4 % steps, keeping its irregular outline) until every cup of its group
 * stands on its top with CUP_EDGE_MARGIN to spare: the cups are laid first, the stone is sized to carry them.
 */
function fitStone(slab: Slab, cups: readonly Cup[]): void {
  const fits = (): boolean => cups.every(([x, , z, d]) => polySdf(slab.poly, x, z) <= -(d / 2 + CUP_EDGE_MARGIN));
  const c: XZ = [slab.poly.reduce((a, q) => a + q[0], 0) / slab.poly.length, slab.poly.reduce((a, q) => a + q[1], 0) / slab.poly.length];
  for (let i = 0; i < 40 && !fits(); i++) slab.poly = slab.poly.map(([x, z]) => [c[0] + (x - c[0]) * 1.04, c[1] + (z - c[1]) * 1.04] as XZ);
  if (!fits()) throw new Error(`courtyard: candle stone ${slab.id} can't carry its cups`);
}

export function courtyard(spawn: readonly number[], yaw: number, portals: readonly PortalLike[]): Courtyard {
  const fr = courtFrame(spawn, yaw);
  const rimY = fr.y;
  // the pond's axes: across = left of the view, turned a little
  const c = at(fr, POND.F, POND.L);
  const ct = Math.cos(POND.turn);
  const st = Math.sin(POND.turn);
  const u: XZ = [fr.l[0] * ct + fr.f[0] * st, fr.l[1] * ct + fr.f[1] * st];
  const v: XZ = [fr.f[0] * ct - fr.l[0] * st, fr.f[1] * ct - fr.l[1] * st];
  const pond: Pond = {
    c,
    u,
    v,
    a: POND.a,
    b: POND.b,
    wave: [
      [2, 0.06, 0.6],
      [3, 0.045, 1.9],
      [5, 0.025, 0.3],
    ],
    rim: rimY,
    depth: POND.depth,
    water: rimY - POND.freeboard,
  };
  const slabs: Slab[] = [];
  const edges: EdgeStone[] = [];
  const candles: CandleGroupData[] = [];
  const bed = rimY - POND.depth;

  // ---- the platform: an irregular nine-sided stone top, 3.5 m across
  const pc = pondWorld(pond, PLATFORM.u, PLATFORM.v);
  const platformTop = pond.water + PLATFORM.rise;
  const platform: Slab = { id: "platform", kind: "platform", poly: irregular(pc, PLATFORM.r, PLATFORM.r * 0.92, 0.4, 9, 0.1, 41), top: platformTop, base: bed - 0.04, batter: 0.16, seed: 41 };
  slabs.push(platform);

  // ---- stepping stones from the pond's near-right bank (by the spawn's route, toward the centre line) to the platform
  const nearPhi = -Math.PI * 0.86;
  const bank = pondOutline(pond, nearPhi, 0.97);
  const [bu, bv] = pondLocal(pond, bank[0], bank[1]);
  // aim at the platform's nearest edge point along the line from the bank to its centre
  const [pu, pv] = [PLATFORM.u, PLATFORM.v];
  const dl = Math.hypot(pu - bu, pv - bv);
  const reach = dl - PLATFORM.r * 0.95;
  const stepTop = pond.water + 0.07;
  for (let i = 0; i < 3; i++) {
    const t = ((i + 0.55) / 3.1) * (reach / dl);
    const su = bu + (pu - bu) * t;
    const sv = bv + (pv - bv) * t;
    const sc = pondWorld(pond, su, sv);
    slabs.push({ id: `step-${i + 1}`, kind: "step", poly: irregular(sc, 0.37, 0.31, 0.5 + i * 1.1, 7, 0.14, 60 + i), top: stepTop, base: bed - 0.04, batter: 0.1, seed: 60 + i });
  }

  // ---- candle stones at the pond's edge: one at the far left, one at the near right, half on the bank
  const candleStone = (id: string, phi: number, seed: number): Slab => {
    const p = pondOutline(pond, phi, 1.02); // straddling the rim, clear of the ring route once sized to its cups
    const s: Slab = { id, kind: "candle", poly: irregular(p, 0.5, 0.36, phi + Math.PI / 2, 8, 0.1, seed), top: rimY + 0.16, base: rimY - 0.3, batter: 0.08, seed };
    slabs.push(s);
    return s;
  };
  // the pond's local u axis points to the view's left, v away from the spawn: φ = 0.3π is its far-left shore,
  // φ = −0.55π the middle of its near shore, facing the spawn
  const stoneFarLeft = candleStone("pond-far-left", Math.PI * 0.3, 71);
  const stoneNear = candleStone("pond-near", -Math.PI * 0.55, 72);

  // ---- low edge stones around the rim (rock family), leaving the stepping-stone landing and the candle stones
  const er = rng(91);
  const skip = [nearPhi, Math.PI * 0.3, -Math.PI * 0.55];
  let phi = -Math.PI;
  let k = 0;
  while (phi < Math.PI - 0.12) {
    const angGap = (d: number): number => Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    const near = skip.some((s) => angGap(phi - s) < 0.28);
    if (!near) {
      const a = 0.24 + er() * 0.2;
      const b = 0.18 + er() * 0.14;
      const h = 0.14 + er() * 0.16;
      const p = pondOutline(pond, phi, 1.0 + er() * 0.05);
      // tangent yaw so the long axis follows the rim, with a little disorder
      const t1 = pondOutline(pond, phi + 0.01);
      const t0 = pondOutline(pond, phi - 0.01);
      const yawStone = Math.atan2(t1[1] - t0[1], t1[0] - t0[0]) + (er() - 0.5) * 0.6;
      edges.push({ id: `edge-${k}`, c: p, yaw: yawStone, a, b, h, base: rimY - 0.07, variant: Math.floor(er() * 8), seed: 300 + k });
      k++;
    }
    // stone widths along the rim plus small, irregular gaps
    const radius = Math.hypot(POND.a, POND.b) * 0.7;
    phi += (0.55 + er() * 0.55) / radius + (er() < 0.18 ? 0.12 : 0);
  }

  // ---- candles in the pond: the platform (one group of seven, off-centre, leaving room to stand)
  const groupOn = (id: string, slab: Slab, centre: XZ, n: number, seed: number, light: { range: number; weight: number; lift: number }, kind: string, essential: boolean): void => {
    const lay = cupCluster(n, seed);
    const cups: Cup[] = lay.map((q) => [centre[0] + q.dx, slab.top, centre[1] + q.dz, q.d, q.h]);
    fitStone(slab, cups);
    candles.push({ id, light: [centre[0], slab.top + light.lift, centre[1]], range: light.range, weight: light.weight, zone: null, essential, kind, cups });
  };
  const plc = pondWorld(pond, PLATFORM.u + 0.55, PLATFORM.v + 0.45);
  groupOn("pond-platform", platform, plc, 7, 101, { range: 9, weight: 1, lift: 0.55 }, "platform", false);
  const centroid = (poly: readonly XZ[]): XZ => [poly.reduce((s, q) => s + q[0], 0) / poly.length, poly.reduce((s, q) => s + q[1], 0) / poly.length];
  groupOn("pond-far-left", stoneFarLeft, centroid(stoneFarLeft.poly), 3, 102, { range: 6.5, weight: 0.6, lift: 0.45 }, "pond edge", false);
  groupOn("pond-near", stoneNear, centroid(stoneNear.poly), 3, 103, { range: 6.5, weight: 0.6, lift: 0.45 }, "pond edge", false);

  // ---- each gateway: two plinths either side of its approach, 2.6 m in front of the threshold, outside the opening
  const approaches: Courtyard["approaches"] = [];
  for (const [i, p] of portals.entries()) {
    // a portal's local −z faces the spawn (layout.ts home(): yaw = atan2(x − cx, z − cz), so local +z points away)
    const n: XZ = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    const side: XZ = [Math.cos(p.yaw), -Math.sin(p.yaw)]; // the portal's local +x
    const px = p.position[0]!;
    const pz = p.position[2]!;
    const py = p.position[1]!;
    approaches.push({ id: p.id, c: [px + n[0] * 2, pz + n[1] * 2], n, half: 3.5, depth: 4 });
    for (const sx of [-1, 1]) {
      const cx = px + side[0] * sx * 5.5 + n[0] * 2.6;
      const cz = pz + side[1] * sx * 5.5 + n[1] * 2.6;
      const seed = 120 + i * 2 + (sx > 0 ? 1 : 0);
      const slab: Slab = { id: `plinth-${p.id}-${sx > 0 ? "r" : "l"}`, kind: "plinth", poly: irregular([cx, cz], 0.46, 0.36, p.yaw + 0.2 * sx, 8, 0.08, seed), top: py + 0.14, base: py - 0.25, batter: 0.06, seed };
      slabs.push(slab);
      const lay = cupCluster(3, seed + 50, 0.95);
      const cc = centroid(slab.poly);
      const cups: Cup[] = lay.map((q) => [cc[0] + q.dx, slab.top, cc[1] + q.dz, q.d, q.h]);
      fitStone(slab, cups);
      candles.push({ id: `gate-${p.id}-${sx > 0 ? "r" : "l"}`, light: [cc[0] - side[0] * sx * 1.2, slab.top + 0.9, cc[1] - side[1] * sx * 1.2], range: 7.5, weight: 1.25, zone: null, essential: true, kind: "gateway approach", cups });
    }
  }

  // ---- the flower meadow: a fuller patch at the left foreground, a smaller one to the right
  const patches = [
    // in view from the eye (the frame's lower edge meets the ground about 3 m ahead; at 6 m the view is ±7 m wide)
    { id: "left", c: [6.4, 4.9] as XZ, r: [2.7, 3.6] as XZ },
    { id: "right", c: [6.9, -4.4] as XZ, r: [1.9, 2.3] as XZ },
  ];
  const mr = rng(140);
  const meadowRocks: EdgeStone[] = [
    { id: "meadow-1", c: at(fr, 5.6, 5.9), yaw: 0.7, a: 0.3, b: 0.22, h: 0.16, base: rimY - 0.06, variant: 3, seed: 501 },
    { id: "meadow-2", c: at(fr, 6.0, 3.6), yaw: 2.1, a: 0.22, b: 0.17, h: 0.12, base: rimY - 0.05, variant: 5, seed: 502 },
    { id: "meadow-3", c: at(fr, 7.3, -5.0), yaw: 1.3, a: 0.2, b: 0.16, h: 0.11, base: rimY - 0.05, variant: 1, seed: 503 },
  ];
  void mr;

  // ---- primary routes (3 m wide): spawn → the ring in front of the pond; the ring; the ring → each approach
  const ring: XZ[] = [];
  const ringOffset = 2.5; // the ring's centre line lies this far outside the rim (stones at the rim, then 3 m of grass)
  for (let i = 0; i <= 48; i++) {
    const ph = (i / 48) * Math.PI * 2;
    const rim = pondOutline(pond, ph, 1.0);
    const dx = rim[0] - pond.c[0];
    const dz = rim[1] - pond.c[1];
    const dd = Math.hypot(dx, dz) || 1;
    ring.push([rim[0] + (dx / dd) * ringOffset, rim[1] + (dz / dd) * ringOffset]);
  }
  const nearestOnRing = (q: XZ): XZ => ring.reduce((b, p) => (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(b[0] - q[0], b[1] - q[1]) ? p : b));
  const routes: Courtyard["routes"] = [{ id: "ring", points: ring, width: 3 }];
  const spawnXZ: XZ = [fr.o[0], fr.o[1]];
  routes.push({ id: "spawn", points: [spawnXZ, at(fr, 4, 0.2), nearestOnRing(at(fr, 9.5, 0.2))], width: 3 });
  for (const a of approaches) {
    const end: XZ = [a.c[0] + a.n[0] * 2, a.c[1] + a.n[1] * 2];
    routes.push({ id: `to-${a.id}`, points: [nearestOnRing(end), end], width: 3 });
  }

  const all: XZ[] = [...ring, ...slabs.flatMap((s) => s.poly), ...edges.map((e) => e.c), ...patches.map((p) => at(fr, p.c[0], p.c[1])), spawnXZ];
  const bc: XZ = [all.reduce((s, q) => s + q[0], 0) / all.length, all.reduce((s, q) => s + q[1], 0) / all.length];
  const br = Math.max(...all.map((q) => Math.hypot(q[0] - bc[0], q[1] - bc[1]))) + 8;
  return { frame: fr, pond, slabs, edges, candles, patches, meadowRocks, routes, approaches, bound: { c: bc, r: br } };
}

// ---------------------------------------------------------------- ground

/** Height of an edge stone's cap at a point (an ellipsoidal cap over its footprint), or -Infinity outside it. */
export function stoneCap(s: EdgeStone, x: number, z: number): number {
  const dx = x - s.c[0];
  const dz = z - s.c[1];
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const lx = (dx * c + dz * sn) / s.a;
  const lz = (-dx * sn + dz * c) / s.b;
  const q = 1 - lx * lx - lz * lz;
  if (q <= 0) return -Infinity;
  return s.base + s.h * Math.sqrt(q);
}

/**
 * The ground the explorer stands on in and around the courtyard, given the terrain's height there: the basin
 * (bed and banks) inside the pond's outline, and the tops of the platform, stepping stones, slabs and edge stones
 * wherever they are higher. Outside the courtyard it is the terrain, untouched.
 */
export function courtGround(c: Courtyard, x: number, z: number, terrain: number): number {
  if (Math.hypot(x - c.bound.c[0], z - c.bound.c[1]) > c.bound.r) return terrain;
  const rho = pondRho(c.pond, x, z);
  let h = rho < 1 ? bedAt(c.pond, rho) : terrain;
  for (const s of c.slabs) if (insidePoly(s.poly, x, z)) h = Math.max(h, s.top);
  for (const s of c.edges) h = Math.max(h, stoneCap(s, x, z));
  for (const s of c.meadowRocks) h = Math.max(h, stoneCap(s, x, z));
  return h;
}

/** Is (x, z) water (inside the waterline, not on a stone)? */
export function inWater(c: Courtyard, x: number, z: number): boolean {
  if (pondRho(c.pond, x, z) >= waterlineRho(c.pond)) return false;
  return courtGround(c, x, z, c.pond.rim) < c.pond.water;
}

/** Distance from a point to a polyline. */
export function polylineDistance(pts: readonly XZ[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/** Inside a gateway's approach rectangle (in front of its threshold)? */
export function inApproach(a: Courtyard["approaches"][number], x: number, z: number, margin = 0): boolean {
  const dx = x - (a.c[0] - a.n[0] * 2);
  const dz = z - (a.c[1] - a.n[1] * 2);
  const along = dx * a.n[0] + dz * a.n[1]; // 0 at the threshold, + toward the spawn
  const across = Math.abs(dx * a.n[1] - dz * a.n[0]);
  return along > -1 - margin && along < a.depth + margin && across < a.half + margin;
}

// ---------------------------------------------------------------- flowers

/** Flower densities per tier (fraction of the High placement kept). */
export const FLOWER_TIER = Object.freeze({ high: 1, medium: 0.65, low: 0.38 });

/**
 * The meadow's flowers: a jittered 0.16 m grid over each patch, accepted with a density that is full in the patch's
 * core and dissolves toward its irregular edge, excluding the pond and its stones, the spawn, the primary routes,
 * the approaches and the slabs. Deterministic (seeded per grid cell), so they never move between visits.
 */
export function flowers(c: Courtyard): Flower[] {
  const out: Flower[] = [];
  const fr = c.frame;
  const cell = 0.13;
  for (const p of c.patches) {
    const seedBase = p.id === "left" ? 7001 : 7002;
    const shape = rng(seedBase);
    const wave: [number, number, number][] = [[2, 0.1 + shape() * 0.06, shape() * 6], [3, 0.08, shape() * 6], [5, 0.05, shape() * 6]];
    const extF = p.r[0] * 1.3;
    const extL = p.r[1] * 1.3;
    for (let i = Math.floor(-extF / cell); i <= Math.ceil(extF / cell); i++) {
      for (let j = Math.floor(-extL / cell); j <= Math.ceil(extL / cell); j++) {
        const r = rng((seedBase * 73856093) ^ ((i + 512) * 19349663) ^ ((j + 512) * 83492791));
        const F = p.c[0] + (i + r()) * cell;
        const L = p.c[1] + (j + r()) * cell;
        const ef = (F - p.c[0]) / p.r[0];
        const el = (L - p.c[1]) / p.r[1];
        const k = 1 + wave.reduce((s, [n, amp, ph]) => s + amp * Math.sin(n * Math.atan2(el, ef) + ph), 0);
        const rho = Math.hypot(ef, el) / k;
        // a fuller core with clumps, sparse edges dissolving into the grass
        const clump = 0.5 + 0.5 * Math.sin(F * 2.3 + Math.cos(L * 1.7) * 2) * Math.cos(L * 1.9 - F * 0.7);
        const density = (1 - smooth(0.45, 1.12, rho)) * (0.42 + 0.58 * clump);
        if (r() > density * 0.8) continue;
        const [x, z] = at(fr, F, L);
        if (!flowerAllowed(c, x, z)) continue;
        out.push({ x, z, h: 0.12 + r() * 0.1 + (r() < 0.12 ? 0.03 : 0), yaw: r() * Math.PI * 2, lean: (r() - 0.5) * 0.3, s: r() });
      }
    }
  }
  return out;
}

/** Grass stays out of the pond and its banks (with a margin), off the slabs and out of the meadow's fuller core. */
export function courtExcludes(c: Courtyard, x: number, z: number): boolean {
  if (Math.hypot(x - c.bound.c[0], z - c.bound.c[1]) > c.bound.r) return false;
  if (pondRho(c.pond, x, z) < 1.08) return true;
  for (const s of c.slabs) if (insidePoly(s.poly, x, z, -0.3)) return true;
  for (const p of c.patches) {
    const [F, L] = frameOf(c.frame, x, z);
    if (Math.hypot((F - p.c[0]) / p.r[0], (L - p.c[1]) / p.r[1]) < 0.55) return true;
  }
  return false;
}

/** Where a flower may grow: not in the pond or on its stones, the spawn, a route, an approach or a slab. */
export function flowerAllowed(c: Courtyard, x: number, z: number): boolean {
  const [F, L] = frameOf(c.frame, x, z);
  if (Math.hypot(F, L) < 2.6) return false; // the spawn
  if (pondRho(c.pond, x, z) < 1.12) return false;
  for (const r of c.routes) if (polylineDistance(r.points, x, z) < r.width / 2 + 0.15) return false;
  for (const a of c.approaches) if (inApproach(a, x, z, 0.5)) return false;
  for (const s of c.slabs) if (insidePoly(s.poly, x, z, -0.35)) return false;
  for (const s of [...c.edges, ...c.meadowRocks]) if (Math.hypot(x - s.c[0], z - s.c[1]) < Math.max(s.a, s.b) + 0.12) return false;
  return true;
}
