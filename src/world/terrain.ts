// The island: an authored heightfield (main prompt §4). Generation order:
// route and building footprints → regional elevation forms → constrained
// low-frequency noise → foundation flattening and blending → material weights.
// Everything here is a pure function of WORLD_SEED and the layout, evaluated
// identically by the offline generator, the browser and the tests, so the
// rendered ground, ground queries and collision always agree.
import { rng, type V3 } from "./core.ts";

export const WORLD_SEED = 20261103;
export const SEA_LEVEL = 0;

// ---------------------------------------------------------------- noise

/** Deterministic 2D value-noise lattice with smooth interpolation (seeded). */
function makeNoise(seed: number): (x: number, z: number) => number {
  const r = rng(seed);
  const P = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255]!;
  const V = new Float32Array(256);
  for (let i = 0; i < 256; i++) V[i] = r() * 2 - 1;
  const h = (x: number, z: number): number => V[P[(P[x & 255]! + z) & 255]!]!;
  return (x, z) => {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fz = z - zi;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const a = h(xi, zi);
    const b = h(xi + 1, zi);
    const c = h(xi, zi + 1);
    const d = h(xi + 1, zi + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
}
const N1 = makeNoise(WORLD_SEED);
const N2 = makeNoise(WORLD_SEED + 1);
const N3 = makeNoise(WORLD_SEED + 2);
export const fbm = (x: number, z: number, oct = 4): number => {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * N1(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
};

// ---------------------------------------------------------------- the route

/**
 * The valley route: a gentle S through control points from the home meadow
 * (west, x ≈ −1150) to the sea-cliff overlook (east). Catmull-Rom through the
 * points, then resampled by arc length.
 */
const ROUTE_CTRL: [number, number][] = [
  [-1180, 120],
  [-1000, 60],
  [-820, -40],
  [-640, -60],
  [-470, 10],
  [-300, 120],
  [-120, 170],
  [60, 130],
  [230, 20],
  [400, -110],
  [580, -180],
  [760, -150],
  [930, -40],
  [1080, 80],
  [1230, 140],
];

export interface RoutePoint {
  s: number;
  p: [number, number];
  t: [number, number];
  /** Unit lateral normal (left of travel). */
  n: [number, number];
}

function catmull(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

const ROUTE: { s: Float64Array; x: Float64Array; z: Float64Array; length: number } = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < ROUTE_CTRL.length; i++) {
    const p0 = ROUTE_CTRL[Math.max(0, i - 1)]!;
    const p1 = ROUTE_CTRL[i]!;
    const p2 = ROUTE_CTRL[i + 1]!;
    const p3 = ROUTE_CTRL[Math.min(ROUTE_CTRL.length - 1, i + 2)]!;
    for (let k = 0; k < 64; k++) pts.push(catmull(p0, p1, p2, p3, k / 64));
  }
  pts.push(ROUTE_CTRL[ROUTE_CTRL.length - 1]!);
  const s = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) s[i] = s[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return { s, x: Float64Array.from(pts.map((p) => p[0])), z: Float64Array.from(pts.map((p) => p[1])), length: s[pts.length - 1]! };
})();

export const ROUTE_LENGTH = ROUTE.length;

/** Point, tangent and lateral normal at arc length s (clamped). */
export function routeAt(s: number): RoutePoint {
  const S = ROUTE.s;
  const t0 = Math.max(0, Math.min(ROUTE.length, s));
  let lo = 0;
  let hi = S.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (S[m]! <= t0) lo = m;
    else hi = m;
  }
  const f = (t0 - S[lo]!) / (S[hi]! - S[lo]! || 1);
  const x = ROUTE.x[lo]! + (ROUTE.x[hi]! - ROUTE.x[lo]!) * f;
  const z = ROUTE.z[lo]! + (ROUTE.z[hi]! - ROUTE.z[lo]!) * f;
  const dx = ROUTE.x[hi]! - ROUTE.x[lo]!;
  const dz = ROUTE.z[hi]! - ROUTE.z[lo]!;
  const l = Math.hypot(dx, dz) || 1;
  const t: [number, number] = [dx / l, dz / l];
  return { s: t0, p: [x, z], t, n: [t[1], -t[0]] };
}

/** Nearest route arc length and lateral distance for a world point (coarse search + refinement). */
export function nearestOnRoute(x: number, z: number): { s: number; d: number; side: number } {
  let best = 0;
  let bd = Infinity;
  const S = ROUTE.s;
  for (let i = 0; i < S.length; i += 4) {
    const d = (ROUTE.x[i]! - x) ** 2 + (ROUTE.z[i]! - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const a = Math.max(0, best - 4);
  const b = Math.min(S.length - 1, best + 4);
  for (let i = a; i <= b; i++) {
    const d = (ROUTE.x[i]! - x) ** 2 + (ROUTE.z[i]! - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const rp = routeAt(S[best]!);
  const side = (x - rp.p[0]) * rp.n[0] + (z - rp.p[1]) * rp.n[1];
  return { s: S[best]!, d: Math.sqrt(bd), side };
}

// ---------------------------------------------------------------- regions

export interface RegionDef {
  id: "home" | "A" | "B" | "C" | "D" | "E";
  name: string;
  /** Route arc-length range. */
  s0: number;
  s1: number;
  prompt: string;
  /** Valley floor height along this region. */
  floor: number;
}

/** Route arc length is scaled so the five regions follow §4's table (0–450, 450–950, …, 1,950–2,400). */
export const REGIONS: readonly RegionDef[] = [
  { id: "home", name: "Home meadow", s0: -1, s1: 0, prompt: "From the first lintel to towers above the clouds. Follow the valley and discover how imagination becomes space, one piece at a time.", floor: 42 },
  { id: "A", name: "Origins Meadow", s0: 0, s1: 450, prompt: "Beams cross between columns", floor: 42 },
  { id: "B", name: "Arches and Domes", s0: 450, s1: 950, prompt: "Arches open larger spaces", floor: 38 },
  { id: "C", name: "Cities and Halls", s0: 950, s1: 1450, prompt: "Domes frame the sky", floor: 48 },
  { id: "D", name: "Industrial Gorge", s0: 1450, s1: 1950, prompt: "Frames lift buildings higher", floor: 40 },
  { id: "E", name: "Contemporary Sea Cliffs", s0: 1950, s1: 2400, prompt: "What would you leave here?", floor: 58 },
];

/** Map the design's 0–2,400 route distance onto the actual spline length (the S adds a little). */
export const designToS = (d: number): number => (d / 2400) * ROUTE.length;
export const sToDesign = (s: number): number => (s / ROUTE.length) * 2400;

export function regionAtS(s: number): RegionDef {
  const d = sToDesign(s);
  for (let i = REGIONS.length - 1; i >= 1; i--) if (d >= REGIONS[i]!.s0) return REGIONS[i]!;
  return REGIONS[1]!;
}

// ---------------------------------------------------------------- coastline

/**
 * The coastline: a closed, non-convex polygon (CCW in x–z) enclosing the
 * island, authored around the route with bays and headlands. The terrain
 * falls to the sea outside it; the flight boundary is this outline expanded.
 */
export const COAST: readonly [number, number][] = (() => {
  // radial-ish profile around an elongated centre, with authored bays
  const pts: [number, number][] = [];
  const n = 96;
  const r = rng(WORLD_SEED + 7);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const ex = 1400;
    const ez = 720;
    let k = 1 + 0.06 * Math.sin(3 * a + 0.4) + 0.045 * Math.sin(5 * a + 1.3) + 0.03 * Math.sin(9 * a + 2.1) + (r() - 0.5) * 0.02;
    // two bays (north-east and south-west) and a headland at the east cliffs
    k -= 0.1 * Math.exp(-(((a - 1.1) / 0.18) ** 2)) + 0.08 * Math.exp(-(((a - 4.0) / 0.2) ** 2));
    k += 0.04 * Math.exp(-(((a - 0.05) / 0.25) ** 2));
    pts.push([ex * k * Math.cos(a), ez * k * Math.sin(a)]);
  }
  return pts;
})();

/** Signed distance to a closed polygon (negative inside), valid for non-convex shapes. */
export function polygonSdf(poly: readonly [number, number][], x: number, z: number): number {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    const ex = xj - xi;
    const ez = zj - zi;
    const wx = x - xi;
    const wz = z - zi;
    const t = Math.max(0, Math.min(1, (wx * ex + wz * ez) / (ex * ex + ez * ez)));
    const dx = wx - ex * t;
    const dz = wz - ez * t;
    d = Math.min(d, dx * dx + dz * dz);
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(d);
}

// ---------------------------------------------------------------- foundation pads

/** Rim height of the dam canyon's banks (§4: 190–210 locally; the crest road is at 170). */
export const CANYON_RIM = 192;

export interface Pad {
  id: string;
  /** Centre and yaw of the footprint rectangle (x along local x). */
  c: [number, number];
  yaw: number;
  hx: number;
  hz: number;
  /** Ground height inside the pad. */
  y: number;
  /** Blend distance outside the pad. */
  blend: number;
  /** Optional: a terrace pad keyed to a different level along local x (aqueduct banks). */
  banks?: { atX: number; y: number }[];
  /** Canyon mode: the pad cuts a channel (dam). */
  kind?: "flat" | "canyon" | "banks";
  /**
   * Canyon only: the V cross-section along local x. The floor is flat to |x| ≤ floorHalf and the walls rise so that
   * at |x| = floorHalf + span·(h/height)^power the wall is h above the floor (the dam body's own half-width rule,
   * so its sloping sides bed into the rock instead of hanging over a flat floor).
   */
  vee?: { floorHalf: number; span: number; height: number; power: number };
  /**
   * Canyon only: the reservoir basin upstream of the dam (local z < `z1`, pad-local z): its floor below the water,
   * banks at `bank` around it to local x ±`half`, reaching back to local z `z0` (pad-local), where the land closes it.
   */
  reservoir?: { z0: number; z1: number; floor: number; bank: number; half: number };
  /**
   * Canyon only: the crest road's abutments. Along local x beyond the pad's ends, a strip centred on local z = `z`
   * (pad-local, ±halfWidth) is held at the crest height `y` for `level` metres and then ramps to the rim over `ramp`
   * metres, so the crest lands on walkable rock at both ends (the side route crosses here).
   */
  saddle?: { z: number; y: number; halfWidth: number; level: number; ramp: number };
}

/**
 * A river cut into the heightfield (§4, §7.4: "every water surface needs a channel, direction and receiving
 * body"): a polyline in world (x, z) with the water's height at each vertex, falling monotonically. The ground
 * along it is lowered to a flat bed `bed` m below the water across `floorHalf` m, with walls rising at `wall`
 * (rise per metre) back to the land; it never raises ground. Building interiors still win (heightAt).
 */
export interface River {
  id: string;
  points: [number, number][];
  /** Water surface height at each point (non-increasing along the river). */
  water: number[];
  floorHalf: number;
  bed: number;
  wall: number;
}
let RIVERS: River[] = [];
export function setRivers(r: River[]): void {
  RIVERS = r;
}
export const rivers = (): readonly River[] => RIVERS;

/** Nearest point on a river: distance across, the water height there and the arc position (0…1). */
export function riverAt(r: River, x: number, z: number): { across: number; water: number; t: number } {
  let best = Infinity;
  let water = r.water[0]!;
  let along = 0;
  let total = 0;
  const seg: number[] = [];
  for (let i = 0; i + 1 < r.points.length; i++) {
    const l = Math.hypot(r.points[i + 1]![0] - r.points[i]![0], r.points[i + 1]![1] - r.points[i]![1]);
    seg.push(l);
    total += l;
  }
  let acc = 0;
  for (let i = 0; i + 1 < r.points.length; i++) {
    const [ax, az] = r.points[i]!;
    const [bx, bz] = r.points[i + 1]!;
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) {
      best = d;
      water = r.water[i]! + (r.water[i + 1]! - r.water[i]!) * t;
      along = acc + seg[i]! * t;
    }
    acc += seg[i]!;
  }
  return { across: best, water, t: total > 0 ? along / total : 0 };
}

let PADS: Pad[] = [];
/** Set by the layout module once landmark placements are known. */
export function setPads(p: Pad[]): void {
  // the dam canyon shapes the land around it (its rim banks): its blend applies after the building pads' blends,
  // so a neighbour's slope can't cut the banks down; building interiors still win last (heightAt)
  PADS = [...p.filter((q) => q.kind !== "canyon"), ...p.filter((q) => q.kind === "canyon")];
}
export const pads = (): readonly Pad[] => PADS;

/** Distance outside a yawed rectangle (0 inside) and the point in its local frame. */
function rectLocal(p: Pad, x: number, z: number): { lx: number; lz: number; out: number } {
  const dx = x - p.c[0];
  const dz = z - p.c[1];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  // local x axis = (cos yaw, −sin yaw) (Builder.at convention: rotY)
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const ox = Math.max(0, Math.abs(lx) - p.hx);
  const oz = Math.max(0, Math.abs(lz) - p.hz);
  return { lx, lz, out: Math.hypot(ox, oz) };
}

// ---------------------------------------------------------------- height

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** The undisturbed landform: coastal shelf, valley floor along the route, ridges either side. */
export function landform(x: number, z: number): number {
  const sd = polygonSdf(COAST, x, z); // negative inside the coast
  if (sd > 0) {
    // offshore: the sea floor falls away; a rocky shelf just beyond the coast
    return Math.max(-40, -6 - sd * 0.35 + 3 * N2(x / 60, z / 60));
  }
  const inland = -sd; // distance inside the coastline
  const near = nearestOnRoute(x, z);
  const reg = regionAtS(near.s);
  const d = sToDesign(near.s);
  // valley floor height interpolated across regions
  const floorAt = (dd: number): number => {
    const ks = [0, 450, 950, 1450, 1950, 2400];
    const fs = [42, 40, 46, 44, 52, 62];
    for (let i = 0; i + 1 < ks.length; i++) if (dd <= ks[i + 1]!) return fs[i]! + (fs[i + 1]! - fs[i]!) * smooth((dd - ks[i]!) / (ks[i + 1]! - ks[i]!));
    return fs[fs.length - 1]!;
  };
  const floor = floorAt(Math.max(0, Math.min(2400, d)));
  void reg;
  // valley half-width: 70–140 m sightline, wider at major nodes
  const half = 60 + 25 * Math.sin(d / 180) + 20 * Math.sin(d / 67 + 1);
  const lat = Math.abs(near.side);
  // ridges rise beyond the valley to 120–170, with the dam canyon banks at 190–210 locally
  const ridgeBase = 135 + 25 * fbm(x / 600, z / 600, 3) + (d > 1650 && d < 1950 ? 55 * smooth(1 - Math.abs(d - 1800) / 150) : 0);
  const rise = smooth((lat - half) / 260);
  let h = floor + (ridgeBase - floor) * rise;
  // gentle undulation inside the valley (constrained low-frequency noise)
  h += (4 + 10 * rise) * fbm(x / 220, z / 220, 4);
  // near the coast: grassy terraces then cliffs down to the sea (35–65 terraces, cliff faces)
  // the outer slopes fall to the coastal terraces over ~320 m, so the island reads as an island (sea
  // visible from high ground), not a plateau ringed by cliffs
  const coastBand = smooth(inland / 320);
  const terrace = 38 + 14 * N3(x / 300, z / 300);
  h = terrace + (h - terrace) * coastBand;
  // cliff: within ~22 m of the coast the ground drops steeply to the waterline
  const cliff = smooth(inland / 22);
  h = -2 + (h + 2) * cliff;
  return h;
}

/** Terrain height at world (x, z), including foundation pads. */
/** A pad's own surface height at a local point: flat, stepped bank terraces (L05) or the canyon floor (L16). */
function padTarget(p: Pad, l: { lx: number; lz: number }): number {
  const rv = p.reservoir;
  if (p.kind === "canyon" && rv && l.lz < rv.z1) {
    // the reservoir basin: a floor under the water, walls up to the banks at its sides (noise keeps the line irregular)
    const wob = 10 * N3(l.lz / 70, 3.1);
    const ax = Math.abs(l.lx) - (rv.half - 30 + wob);
    if (ax <= 0) return rv.floor;
    return rv.floor + (rv.bank - rv.floor) * smooth(ax / 30);
  }
  if (p.kind === "canyon" && p.vee) {
    const v = p.vee;
    const ax = Math.abs(l.lx) - v.floorHalf;
    if (ax <= 0) return p.y;
    // invert halfWidth(y) = floorHalf + span·(y/height)^power
    const wall = p.y + v.height * Math.pow(Math.min(1, ax / v.span), 1 / v.power) + Math.max(0, ax - v.span) * 3;
    // along the crest road's line the wall is held at crest height (the road lands on rock at both ends)
    const sd = p.saddle;
    if (sd && wall > sd.y) {
      const across = Math.abs(l.lz - sd.z) - sd.halfWidth;
      if (across < 10) return sd.y + (wall - sd.y) * smooth(Math.max(0, across) / 10);
    }
    return wall;
  }
  if (p.kind === "banks" && p.banks) {
    // stepped bank terraces along the local x axis (the aqueduct's middle tier stands on rising ground), each
    // rise blended over a 30 m ramp so it is a slope, not a wall
    const ax = Math.abs(l.lx);
    let t = p.y;
    for (const b of p.banks) t = Math.max(t, p.y + (b.y - p.y) * smooth((ax - b.atX + 30) / 30));
    return t;
  }
  return p.y;
}

/** The designed surface of a building's pad at a world point (its interior profile), or null outside it. */
export function padSurface(id: string, x: number, z: number): number | null {
  const p = PADS.find((q) => q.id === id);
  if (!p) return null;
  const l = rectLocal(p, x, z);
  return l.out <= 0 ? padTarget(p, l) : null;
}

export function heightAt(x: number, z: number): number {
  let h = landform(x, z);
  for (const p of PADS) {
    const l = rectLocal(p, x, z);
    // the canyon's abutments reach further than an ordinary blend (30 m shoulder + 90 m easing)
    if (l.out > (p.kind === "canyon" ? p.blend + 120 : p.blend)) continue;
    const target = padTarget(p, l);
    if (p.kind === "canyon") {
      // inside: the canyon floor. Beyond the dam's ends (along local x) the banks are rim terraces at
      // CANYON_RIM (§4: "dam canyon banks locally y = 190–210"), 70 m wide, then easing back to the landform over
      // 180 m, so the crest road lands on walkable ground at both ends. Upstream and downstream (along local z) the
      // canyon continues as the reservoir and the channel, walled to the rim over the blend distance.
      if (l.out <= 0) {
        h = target;
        continue;
      }
      const ex = Math.abs(l.lx) - p.hx; // beyond the dam's ends
      const rim = CANYON_RIM;
      if (ex > 0 && Math.abs(l.lz) <= p.hz + p.blend) {
        // abutments: rock rises to the rim over the blend distance at the dam's ends, a 30 m shoulder, then eases back
        // to the land over 90 m (the valley route beyond is not walled off: the gorge is crossed in flight or on the crest)
        const wall = smooth(ex / p.blend);
        const back = smooth((ex - p.blend - 30) / 90);
        const bank = target + (rim - target) * wall;
        h = ex < p.blend + 30 ? bank : bank + (h - bank) * back;
        const sd = p.saddle;
        if (sd) {
          // the abutment saddle: crest height next to the dam's end, ramping up to the rim; its edges blend over 10 m
          const across = Math.abs(l.lz - sd.z) - sd.halfWidth;
          if (across < 10) {
            const along = sd.y + (Math.max(h, sd.y) - sd.y) * smooth((ex - sd.level) / sd.ramp);
            const k = smooth(Math.max(0, across) / 10);
            h = along + (h - along) * k;
          }
        }
        continue;
      }
      if (l.out > p.blend) continue; // beyond the reservoir/channel walls: the land as it is
      const w = smooth(l.out / p.blend);
      h = target + (Math.max(h, rim) - target) * w;
      continue;
    }
    if (l.out <= 0) h = target;
    else {
      const w = smooth(l.out / p.blend);
      h = target + (h - target) * w;
    }
  }
  // rivers: a bed below the water, walls back up to the land (only ever lowering it)
  h = Math.min(h, riverCut(x, z));
  // A pad's interior wins over every other pad's blend zone: neighbouring buildings closer than their blend
  // distances must not lift or sink each other's foundations (before 2026-11-04 L12's blend raised L10's east
  // side by up to 32 m and L06's lifted the aqueduct's east bank 14 m above its terraces). The slope between two
  // pads then lies wholly outside both interiors.
  for (const p of PADS) {
    const l = rectLocal(p, x, z);
    if (l.out <= 0) {
      const t = padTarget(p, l);
      // the canyon's floor is also the river's: its bed is cut into the floor below the dam (never a building's pad)
      return p.kind === "canyon" ? Math.min(t, riverCut(x, z)) : t;
    }
  }
  return h;
}

/** The lowest river cut at a point (Infinity away from every river). */
function riverCut(x: number, z: number): number {
  let h = Infinity;
  for (const r of RIVERS) {
    const q = riverAt(r, x, z);
    const out = q.across - r.floorHalf;
    const cut = q.water - r.bed + Math.max(0, out) * r.wall;
    if (cut < h) h = cut;
  }
  return h;
}

/** Surface normal by central differences. */
export function normalAt(x: number, z: number, e = 1): V3 {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx;
  const ny = 2 * e;
  const nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

/** Slope in degrees. */
export const slopeAt = (x: number, z: number): number => (Math.acos(Math.max(-1, Math.min(1, normalAt(x, z)[1]))) * 180) / Math.PI;

// ---------------------------------------------------------------- chunks

export const CHUNK = 128;
/** World extent (with the offshore flight buffer). */
export const WORLD_MIN: [number, number] = [-1664, -896];
export const WORLD_MAX: [number, number] = [1664, 896];
export const CHUNKS_X = Math.ceil((WORLD_MAX[0] - WORLD_MIN[0]) / CHUNK);
export const CHUNKS_Z = Math.ceil((WORLD_MAX[1] - WORLD_MIN[1]) / CHUNK);

/**
 * Heights for a chunk on an (n + 1)² grid including both edges, so
 * neighbouring chunks share identical boundary samples (no seams at equal
 * resolution; skirts hide the rest between levels).
 */
export function chunkHeights(cx: number, cz: number, n: number): Float32Array {
  const out = new Float32Array((n + 1) * (n + 1));
  const x0 = WORLD_MIN[0] + cx * CHUNK;
  const z0 = WORLD_MIN[1] + cz * CHUNK;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) out[j * (n + 1) + i] = heightAt(x0 + (i * CHUNK) / n, z0 + (j * CHUNK) / n);
  return out;
}
