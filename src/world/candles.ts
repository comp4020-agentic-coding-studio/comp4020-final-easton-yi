// Candle placement on the twenty landmarks (courtyard/day-night directive §8–§9,
// 2026-11-06). Lighting is environmental exhibition dressing, kept apart from
// the timber: no piece of any recipe changes, nothing grows out of a column,
// and the candle data lives in the manifest's own `lighting` section, never in
// the landmark assets or in user works.
//
// Each landmark has an authored scheme (candle-schemes.ts) of deterministic
// anchors in its local frame, each tied to a logical group (an entrance, a stair,
// a landing, a room) and a role:
//
//   - supported: a group of 3–7 cups resting on a real horizontal timber surface
//     (a deck, a tread, a platform). The resolver looks down through the building's
//     own pieces (and shells), finds the surface under each cup, and accepts the
//     group only if every cup has a top face under its whole footprint (no overhang),
//     all cups of the group sit on the same level, and nothing of the building
//     intrudes into the cups' volume. A group that fails moves to the next of its
//     authored candidate positions; the last resort is to drop it (reported).
//   - detached: a sparse hovering group for a wall or column that needs mid-height
//     light and has no platform. It must keep a visible air gap (≥ 0.45 m) from
//     every piece, and stay upright and still.
//
// Every group is also checked against the landmark's entrances (walking centre
// lines), safe points and viewpoints, so no cup stands in a doorway, on a stair's
// walking line or in a fly-through. The resolution runs offline in the
// generator's per-landmark child (it needs the pieces) and its result is checked
// again by tests/world-candles.test.ts.
import { STOCKS, STOCK_IDS, type BuildResult, type V3 } from "./core.ts";
import { CUP_SIZES, cupCluster, type CandleGroupData, type Cup } from "./courtyard.ts";

/** One authored group. Positions are landmark-local (metres; the building's front faces −z). */
export interface CandleAnchor {
  id: string;
  /** Group kind for reports: entrance, stair, landing, interior, platform, terrace, summit, … */
  kind: string;
  role: "supported" | "detached";
  /** Candidate centres, tried in order; y is a hint (the surface found below y + 1.5 wins for supported groups). */
  at: V3[];
  cups: number;
  /** The light's reach (m); default by kind. */
  range?: number;
  weight?: number;
  /** An interior zone id (light from inside stays inside: the selector won't pick it for a viewer outside). */
  zone?: string;
  essential?: boolean;
  /** Spread of the cluster (1 = default ~0.2 m radius). */
  spread?: number;
  /** A supported group may stand on the landmark's pad (local y = 0) where no timber is found under it. */
  ground?: boolean;
  /** Search around each candidate this far (m) for a position that passes (default 1.2). */
  search?: number;
  /**
   * Lay the cups in a row along this local direction (x, z) instead of a cluster: for a single beam or board where a
   * cluster would overhang (a slatted deck's board, a rail's cap). Spacing 0.34 m.
   */
  row?: [number, number];
  /** Accept a rear shell's top as the surface (a solid plank finish the recipe draws as a floor). */
  shells?: boolean;
}

/** A named interior volume (landmark-local axis-aligned box) for room-aware light selection. */
export interface CandleZone {
  id: string;
  min: V3;
  max: V3;
}

export interface CandleScheme {
  /** What the scheme does for the building, in a sentence (reports). */
  intent: string;
  anchors: CandleAnchor[];
  zones?: CandleZone[];
  /** Ground-level groups placed on the terrain around the building (world space resolves their height). */
  ground?: CandleAnchor[];
}

export interface ResolvedGroup extends CandleGroupData {
  role: "supported" | "detached" | "ground";
  /** For supported groups: the surface's height and the smallest support margin under a cup (m); for detached: the air gap. */
  surface: number | null;
  clearance: number;
  candidate: number;
}

export interface Resolution {
  groups: ResolvedGroup[];
  dropped: { id: string; reason: string }[];
  zones: CandleZone[];
}

/**
 * The island around the building, in its local frame, for ground groups: a landmark's pad is finite (it blends
 * into the hillside beyond its footprint) and a river may be cut through it (L16's canyon floor below the dam), so
 * "local y = 0" is only a surface where the terrain really is there, level and dry. Supplied by the generator's
 * landmark child from the placement (layout.ts) and the heightfield (terrain.ts).
 */
export interface GroundProbe {
  /** Terrain height at a landmark-local (x, z), landmark-local metres (0 = the pad). */
  height(x: number, z: number): number;
  /** True where a river's or the building's water surface covers the point (with `pad` metres of margin). */
  wet(x: number, z: number, pad: number): boolean;
}

// ---------------------------------------------------------------- the building as boxes

interface Obb {
  c: V3;
  ax: [V3, V3, V3];
  h: V3;
  shell: boolean;
}

const rot = (q: readonly number[], v: readonly number[]): V3 => {
  const [x, y, z, w] = q as [number, number, number, number];
  const [vx, vy, vz] = v as [number, number, number];
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

/** A spatial hash of the landmark's pieces and box shells (2 m cells). `solid` excludes shells from the support search. */
export class BuildingBoxes {
  readonly boxes: Obb[] = [];
  private grid = new Map<string, number[]>();
  private readonly cell = 2;

  constructor(r: BuildResult) {
    for (let i = 0; i < r.count; i++) {
      const st = STOCKS[STOCK_IDS[r.stock[i]!]!];
      const q = [r.quat[i * 4]!, r.quat[i * 4 + 1]!, r.quat[i * 4 + 2]!, r.quat[i * 4 + 3]!];
      this.push({ c: [r.pos[i * 3]!, r.pos[i * 3 + 1]!, r.pos[i * 3 + 2]!], ax: [rot(q, [1, 0, 0]), rot(q, [0, 1, 0]), rot(q, [0, 0, 1])], h: [st.length / 2, st.section / 2, st.section / 2], shell: false });
    }
    for (const s of r.shells) {
      if (s.kind === "glass") continue; // glazing is not a surface to stand a cup on, nor a wall it must clear by 0.45 m
      if (s.shape === "cyl") {
        // a vertical cylinder: its square bounding box is conservative for intrusion; supports use the true radius below
        // the inscribed square: conservative as a surface (a cup on it is on the cylinder's top), not for intrusion
        this.push({ c: s.c, ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [s.h[0] * 0.7071, s.h[1], s.h[2] * 0.7071], shell: true });
      } else this.push({ c: s.c, ax: [rot(s.q, [1, 0, 0]), rot(s.q, [0, 1, 0]), rot(s.q, [0, 0, 1])], h: s.h, shell: true });
    }
  }

  private push(b: Obb): void {
    const i = this.boxes.length;
    this.boxes.push(b);
    const e = [0, 1, 2].map((a) => Math.abs(b.ax[0][a]!) * b.h[0] + Math.abs(b.ax[1][a]!) * b.h[1] + Math.abs(b.ax[2][a]!) * b.h[2]);
    const lo = b.c.map((v, a) => Math.floor((v - e[a]!) / this.cell));
    const hi = b.c.map((v, a) => Math.floor((v + e[a]!) / this.cell));
    if ((hi[0]! - lo[0]!) * (hi[1]! - lo[1]!) * (hi[2]! - lo[2]!) > 40000) return; // a huge shell: tested by brute force below
    for (let x = lo[0]!; x <= hi[0]!; x++) for (let y = lo[1]!; y <= hi[1]!; y++) for (let z = lo[2]!; z <= hi[2]!; z++) {
      const k = `${x},${y},${z}`;
      const a = this.grid.get(k);
      if (a) a.push(i);
      else this.grid.set(k, [i]);
    }
  }

  /** Boxes whose bounds may touch the axis-aligned region [lo, hi]. */
  near(lo: V3, hi: V3): Obb[] {
    const out = new Set<number>();
    const a = lo.map((v) => Math.floor(v / this.cell));
    const b = hi.map((v) => Math.floor(v / this.cell));
    for (let x = a[0]!; x <= b[0]!; x++) for (let y = a[1]!; y <= b[1]!; y++) for (let z = a[2]!; z <= b[2]!; z++) for (const i of this.grid.get(`${x},${y},${z}`) ?? []) out.add(i);
    return [...out].map((i) => this.boxes[i]!);
  }
}

/** Distance from a point to an oriented box (0 inside). */
function distToObb(p: V3, b: Obb): number {
  const d: V3 = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
  let s = 0;
  for (let a = 0; a < 3; a++) {
    const t = d[0] * b.ax[a]![0] + d[1] * b.ax[a]![1] + d[2] * b.ax[a]![2];
    const o = Math.abs(t) - b.h[a]!;
    if (o > 0) s += o * o;
  }
  return Math.sqrt(s);
}

/** The top surface of a box directly under (x, z) and its height, if the box's top face is horizontal there (within `slack` of its edge). */
function topAt(b: Obb, x: number, z: number, slack = 0): number | null {
  // the box's axis most aligned with +y must be (nearly) vertical for a flat top
  let up = -1;
  let best = 0;
  for (let a = 0; a < 3; a++) {
    const c = Math.abs(b.ax[a]![1]);
    if (c > best) {
      best = c;
      up = a;
    }
  }
  if (best < 0.996) return null; // not level (within ~5°)
  const u = b.ax[up]!;
  const sign = u[1] > 0 ? 1 : -1;
  // the other two axes span the top face: is (x, z) within it?
  const d: V3 = [x - b.c[0], 0, z - b.c[2]];
  for (let a = 0; a < 3; a++) {
    if (a === up) continue;
    const ax = b.ax[a]!;
    const hl = Math.hypot(ax[0], ax[2]) || 1;
    const t = (d[0] * ax[0] + d[2] * ax[2]) / hl;
    if (Math.abs(t) > b.h[a]! - 1e-3 + slack) return null;
  }
  // the top face is the one whose normal points up: half the box's extent along `up` above its centre
  void sign;
  return b.c[1] + Math.abs(u[1]) * b.h[up]!;
}

const CUP_MARGIN = 0.03; // a cup's rim must stand this far inside the supporting surface
/** Boards of one deck differ by up to ~1.5 cm (lapped chains are nudged apart) and have ~2 cm gaps between them. */
const LEVEL_TOL = 0.025;
const GAP_SLACK = 0.025;

/**
 * The supporting surface under a cup of diameter d centred at (x, z), searched from `fromY` down to `fromY − drop`:
 * the highest level top face under the centre, and the cup's whole footprint (centre and eight points a margin
 * outside its rim) carried by level top faces no more than LEVEL_TOL below it (one board or several; the cup
 * stands on the highest). `ground` (landmark-local y = 0, the pad) counts as a surface when allowed and nothing of
 * the building is found above it. Returns the cup's base height, or null.
 */
function supportUnder(B: BuildingBoxes, x: number, z: number, d: number, fromY: number, drop: number, ground: GroundProbe | null, shells: boolean): { y: number; margin: number; onGround: boolean } | null {
  const rad = d / 2 + CUP_MARGIN;
  const pts: [number, number][] = [[x, z]];
  for (let i = 0; i < 8; i++) pts.push([x + Math.cos((i * Math.PI) / 4) * rad, z + Math.sin((i * Math.PI) / 4) * rad]);
  const list = B.near([x - 1, fromY - drop, z - 1], [x + 1, fromY + 0.5, z + 1]).filter((b) => shells || !b.shell);
  // the highest level top under the centre (or the rim: a cup bridging a 2 cm board gap)
  let y = -Infinity;
  for (const [px, pz] of pts) for (const b of list) {
    const t = topAt(b, px, pz, GAP_SLACK);
    if (t !== null && t <= fromY + 1e-6 && t >= fromY - drop && t > y) y = t;
  }
  if (!Number.isFinite(y)) {
    // the pad: only where the island's terrain is really at pad level under the whole footprint, and dry
    if (ground && fromY - drop <= 0 && fromY >= 0) {
      if (ground.wet(x, z, d / 2 + CUP_MARGIN)) return null;
      for (const [px, pz] of pts) if (Math.abs(ground.height(px, pz)) > LEVEL_TOL) return null;
      return { y: 0, margin: Infinity, onGround: true };
    }
    return null;
  }
  for (const [px, pz] of pts) {
    let covered = false;
    for (const b of list) {
      const t = topAt(b, px, pz, GAP_SLACK);
      if (t !== null && t <= y + 1e-6 && t >= y - LEVEL_TOL) {
        covered = true;
        break;
      }
    }
    if (!covered) return null; // an overhang (or a top too far below the others to bear the cup evenly)
  }
  return { y, margin: CUP_MARGIN, onGround: false };
}

/** Does anything of the building intrude into a cup's volume (a cylinder of diameter d and height h above y)? */
function intrudes(B: BuildingBoxes, x: number, y: number, z: number, d: number, h: number): boolean {
  const list = B.near([x - 1, y, z - 1], [x + 1, y + h + 0.6, z + 1]);
  // sample the cup's volume above the surface (the flame adds 0.12 m)
  for (const fy of [0.04, h * 0.5, h, h + 0.12]) {
    for (const [dx, dz] of [[0, 0], [d / 2, 0], [-d / 2, 0], [0, d / 2], [0, -d / 2]]) {
      for (const b of list) if (distToObb([x + dx!, y + fy, z + dz!], b) < 0.005) return true;
    }
  }
  return false;
}

/** Smallest distance from a detached group's cups (their whole height) to the building. */
function airGap(B: BuildingBoxes, cups: readonly Cup[]): number {
  let g = Infinity;
  for (const [x, y, z, d, h] of cups) {
    const list = B.near([x - 4, y - 4, z - 4], [x + 4, y + h + 4, z + 4]);
    for (const fy of [-0.05, h / 2, h + 0.15]) for (const [dx, dz] of [[0, 0], [d / 2, 0], [-d / 2, 0], [0, d / 2], [0, -d / 2]]) for (const b of list) g = Math.min(g, distToObb([x + dx!, y + fy, z + dz!], b));
  }
  return g;
}

/** A detached group needs this much air between its cups and any timber, and stays within the second figure of it (it lights that structure). */
export const DETACHED_GAP = 0.45;
export const DETACHED_NEAR = 2.5;
/** Cups keep this far from an entry's walking centre line (half its width, at least 1.6 m) and from safe points. */
const ROUTE_CLEAR = 1.6;

export const RANGE: Record<string, number> = { entrance: 9, stair: 7, landing: 7.5, interior: 10, platform: 9, terrace: 9, summit: 10, court: 10, gate: 9, column: 7, crest: 9, colonnade: 8 };

/** Distance from a point to a segment (3D). */
function segDist(p: V3, a: V3, b: V3): number {
  const v: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (w[0] * v[0] + w[1] * v[1] + w[2] * v[2]) / (v[0] * v[0] + v[1] * v[1] + v[2] * v[2] || 1)));
  return Math.hypot(w[0] - v[0] * t, w[1] - v[1] * t, w[2] - v[2] * t);
}
/** Horizontal distance from a point to a segment, only where the point's height is within the segment's band. */
function routeDist(p: V3, a: V3, b: V3): number {
  const v: V3 = [b[0] - a[0], 0, b[2] - a[2]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * v[0] + (p[2] - a[2]) * v[2]) / (v[0] * v[0] + v[2] * v[2] || 1)));
  const y = a[1] + (b[1] - a[1]) * t;
  if (Math.abs(p[1] - y) > 3) return Infinity; // a different level
  return Math.hypot(p[0] - a[0] - v[0] * t, p[2] - a[2] - v[2] * t);
}

/** Why a group can't stand where it is (route, safe point, viewpoint), or null. */
function inTheWay(r: BuildResult, cups: readonly Cup[]): string | null {
  for (const [x, y, z, d] of cups) {
    const p: V3 = [x, y, z];
    for (const e of r.entries) {
      // flights (entries in the air) are fly-throughs: keep their tube clear, except where it meets a floor (its ends:
      // a terrace a flight starts from is walked there, so the walking rule applies near the end at its level);
      // walked routes: the walking band
      const flying = e.a[1] > 2 && Math.abs(e.b[1] - e.a[1]) > 6;
      const atEnd = flying && [e.a, e.b].some((q) => Math.abs(y - q[1]) < 1.2 && Math.hypot(x - q[0], z - q[2]) < 9);
      const dist = flying && !atEnd ? segDist(p, e.a, e.b) : flying ? Math.hypot(x - (Math.abs(y - e.a[1]) < 1.2 ? e.a : e.b)[0], z - (Math.abs(y - e.a[1]) < 1.2 ? e.a : e.b)[2]) : routeDist(p, e.a, e.b);
      const need = flying && !atEnd ? Math.max(e.width, e.height) / 2 + 0.5 : Math.max(ROUTE_CLEAR, Math.min(e.width / 2, 4)) + d / 2;
      if (dist < need) return `in entry ${e.id} (${dist.toFixed(2)} m from its line, needs ${need.toFixed(2)})`;
    }
    for (const s of r.safePoints) if (Math.hypot(x - s.feet[0], z - s.feet[2]) < 2 && Math.abs(y - s.feet[1]) < 2.5) return `at safe point ${s.id}`;
    for (const v of r.viewpoints) if (Math.hypot(x - v.eye[0], y - v.eye[1], z - v.eye[2]) < 2.5) return `at viewpoint ${v.id}`;
  }
  return null;
}

/**
 * Resolve one landmark's scheme against its own generated pieces. `island` is the terrain and water around the
 * building; without it no group may fall back to the pad (a ground anchor then needs timber under it, or drops).
 */
export function resolveScheme(id: string, r: BuildResult, scheme: CandleScheme, island: GroundProbe | null = null): Resolution {
  const B = new BuildingBoxes(r);
  // the building's own water (stilling basins, pools, channels) is never ground, whatever the terrain says
  const ownWet = (x: number, z: number, pad: number): boolean =>
    r.water.some((w) => {
      const c = Math.cos(w.yaw);
      const s = Math.sin(w.yaw);
      const dx = x - w.c[0];
      const dz = z - w.c[2];
      return Math.abs(w.c[1]) < 3 && Math.abs(dx * c - dz * s) < w.hx + pad && Math.abs(dx * s + dz * c) < w.hz + pad;
    });
  const ground: GroundProbe | null = island ? { height: island.height, wet: (x, z, pad) => island.wet(x, z, pad) || ownWet(x, z, pad) } : null;
  const groups: ResolvedGroup[] = [];
  const dropped: Resolution["dropped"] = [];
  let seed = 0;
  for (const c of id) seed = seed * 31 + c.charCodeAt(0);
  for (const [gi, a] of scheme.anchors.entries()) {
    let placed: ResolvedGroup | null = null;
    const reasons: string[] = [];
    const tries = expand(a.at, a.search ?? 1.2);
    for (const [ci, p] of tries.entries()) {
      const lay = a.row ? cupRow(a.cups, a.row, seed + gi * 101) : cupCluster(a.cups, seed + gi * 101 + ci, a.spread ?? 1);
      if (a.role === "supported") {
        const cups: Cup[] = [];
        let level: number | null = null;
        let fail: string | null = null;
        for (const q of lay) {
          const x = p[0] + q.dx;
          const z = p[2] + q.dz;
          const s = supportUnder(B, x, z, q.d, p[1] + 1.5, 4, a.ground ? ground : null, a.shells ?? false);
          if (!s) {
            fail = `no full support under a cup at (${x.toFixed(2)}, ${z.toFixed(2)})`;
            break;
          }
          if (level === null) level = s.y;
          else if (Math.abs(level - s.y) > LEVEL_TOL) {
            fail = `cups on different levels (${level.toFixed(2)} vs ${s.y.toFixed(2)})`;
            break;
          }
          if (intrudes(B, x, s.y + 0.004, z, q.d, q.h)) {
            fail = `timber intrudes into a cup at (${x.toFixed(2)}, ${s.y.toFixed(2)}, ${z.toFixed(2)})`;
            break;
          }
          cups.push([x, s.y, z, q.d, q.h]);
        }
        if (!fail) {
          const way = inTheWay(r, cups);
          if (way) fail = way;
        }
        if (fail) {
          if (reasons.length < 3) reasons.push(`#${ci}: ${fail}`);
          continue;
        }
        placed = mk(a, cups, level === 0 && (a.ground ?? false) ? "ground" : "supported", level!, CUP_MARGIN, ci);
        break;
      }
      // detached: upright cups hovering at the anchor's height
      const cups: Cup[] = lay.map((q) => [p[0] + q.dx, p[1], p[2] + q.dz, q.d, q.h]);
      const gap = airGap(B, cups);
      const way = inTheWay(r, cups);
      if (gap < DETACHED_GAP || gap > DETACHED_NEAR) {
        if (reasons.length < 3) reasons.push(`#${ci}: air gap ${gap.toFixed(2)} m outside ${DETACHED_GAP}–${DETACHED_NEAR}`);
      } else if (way) {
        if (reasons.length < 3) reasons.push(`#${ci}: ${way}`);
      }
      else {
        placed = mk(a, cups, "detached", null, gap, ci);
        break;
      }
    }
    if (placed) groups.push(placed);
    else dropped.push({ id: a.id, reason: reasons.join("; ") });
  }
  return { groups, dropped, zones: scheme.zones ?? [] };
}

/** Cups in a row along a direction, 0.34 m apart, centred (sizes from the shared range, deterministic). */
function cupRow(n: number, dir: [number, number], seed: number): { dx: number; dz: number; d: number; h: number }[] {
  const l = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / l;
  const uz = dir[1] / l;
  return Array.from({ length: n }, (_, i) => {
    const [d, h] = CUP_SIZES[(i * 2 + seed) % CUP_SIZES.length]!;
    const t = (i - (n - 1) / 2) * 0.34;
    // a row stands on one board: the narrower cups of the range (0.22–0.26 m)
    return { dx: ux * t, dz: uz * t, d: Math.min(d, 0.22 + (i % 3) * 0.02), h };
  });
}

/** Each authored candidate, then a deterministic ring search around it (0.4 m steps out to `radius`, 8 headings). */
function expand(at: readonly V3[], radius: number): V3[] {
  const out: V3[] = [];
  for (const p of at) {
    out.push(p);
    for (let r = 0.4; r <= radius + 1e-9; r += 0.4) for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + r;
      out.push([p[0] + Math.cos(a) * r, p[1], p[2] + Math.sin(a) * r]);
    }
  }
  return out;
}

function mk(a: CandleAnchor, cups: Cup[], role: ResolvedGroup["role"], surface: number | null, clearance: number, candidate: number): ResolvedGroup {
  const cx = cups.reduce((s, c) => s + c[0], 0) / cups.length;
  const cy = cups.reduce((s, c) => s + c[1], 0) / cups.length;
  const cz = cups.reduce((s, c) => s + c[2], 0) / cups.length;
  return {
    id: a.id,
    kind: a.kind,
    role,
    light: [cx, cy + (role === "detached" ? 0.35 : 0.6), cz],
    range: a.range ?? RANGE[a.kind] ?? 8,
    weight: a.weight ?? (a.essential ? 1.2 : 1),
    zone: a.zone ?? null,
    essential: a.essential ?? (a.kind === "entrance" || a.kind === "stair" || a.kind === "gate"),
    cups: cups.map((c) => c.map((v) => Math.round(v * 1000) / 1000) as Cup),
    surface,
    clearance: Math.round(clearance * 1000) / 1000,
    candidate,
  };
}

/** World transform of a resolved group (yaw about +y, then the placement's position). */
export function groupToWorld(g: ResolvedGroup | CandleGroupData, pos: readonly number[], yaw: number): CandleGroupData {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const w = (x: number, y: number, z: number): [number, number, number] => [pos[0]! + x * c + z * s, pos[1]! + y, pos[2]! - x * s + z * c];
  const r3 = (v: number): number => Math.round(v * 1000) / 1000;
  const L = w(g.light[0], g.light[1], g.light[2]).map(r3) as [number, number, number];
  return {
    id: g.id,
    light: L,
    range: g.range,
    weight: g.weight,
    zone: g.zone,
    essential: g.essential,
    kind: g.kind,
    cups: g.cups.map(([x, y, z, d, h]) => [...w(x, y, z).map(r3), d, h] as Cup),
  };
}

export { CUP_SIZES };
