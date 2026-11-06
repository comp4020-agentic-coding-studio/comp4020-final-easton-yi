// Side routes and ridge reveals (brief §4): "at least one side route per region that rejoins the valley" and
// "three ridge/turn reveals that conceal part of a landmark before revealing its full form". Authored as data
// in world space (control points on the island's terrain), validated against the real heightfield, footprints
// and coast by validateRoutes(), exported in the manifest and announced in the world.
import { COAST, designToS, heightAt, nearestOnRoute, polygonSdf, routeAt } from "./terrain.ts";
import { footprint, placements, toWorld, type Placement } from "./layout.ts";
import { LANDMARKS } from "./landmarks.ts";

export interface SideRoute {
  id: string;
  region: "A" | "B" | "C" | "D" | "E";
  name: string;
  /** Where it leaves and rejoins the valley route (design distance). */
  from: number;
  to: number;
  /** Intermediate control points (world x, z). */
  via: [number, number][];
  /** A landmark the route crosses on its own walkway (its footprint is not an obstacle for this route). */
  crosses?: string;
  /** "walk" (default): graded on the terrain; "fly": a flight line with clearance from the colliders, at its own heights. */
  mode?: "walk" | "fly";
  note: string;
}

export const SIDE_ROUTES: readonly SideRoute[] = [
  { id: "A-shoulder", region: "A", name: "Temple shoulder", from: 20, to: 420, via: [[-1170, -60], [-1140, -90], [-1030, -90], [-990, -50], [-970, -50], [-820, -140], [-770, -140], [-770, -80]], note: "north of the meadow, between the first lintels and the Doric temple's platform, rejoining below the Ionic terrace" },
  { id: "B-south-ridge", region: "B", name: "South ridge", from: 720, to: 880, via: [[-410, 30], [-310, 130], [-310, 160], [-370, 220], [-370, 230], [-380, 240], [-380, 260], [-310, 330], [-310, 420], [-320, 430], [-320, 450], [-300, 470], [-210, 470], [-200, 480], [-80, 480], [-70, 490], [-50, 470], [-50, 390], [-40, 380], [-40, 340], [-30, 330], [-30, 300], [-20, 310], [-20, 280], [-10, 290], [-10, 260], [0, 270], [0, 240], [10, 250], [20, 250], [30, 240], [-30, 180], [-80, 180], [-110, 180], [-120, 170], [-180, 170], [-190, 160], [-250, 160]], note: "climbs south past the oculus hall onto the ridge behind the sea castle (to about 125 m) and drops back to the valley" },
  { id: "C-court-path", region: "C", name: "Court path", from: 1040, to: 1440, via: [[-60, 180], [-60, 60], [0, 10], [30, 10], [110, 110], [210, 40], [230, 40], [260, -10]], note: "between the floating dome hall and the dome palace, through the courts beside the cloud nave" },
  { id: "D-gorge", region: "D", name: "Gorge flight", from: 1490, to: 2200, via: [], crosses: "L16", mode: "fly", note: "drops from the gorge's west rim into the canyon, follows the channel to the dam's toe, rises beside the fin spillway and the downstream face to the crest and rejoins the valley at the east rim (the dam's own route, §L16); the 150 m gorge walls are flown, not walked" },
  { id: "E-cliff-path", region: "E", name: "Cliff path", from: 2060, to: 2400, via: [[1010, -50], [1130, -170], [1260, -60], [1250, 60]], note: "out along the north sea cliffs behind the brace tower and back to the final overlook" },
];

export interface Reveal {
  id: string;
  landmark: string;
  /** Route design distances where the landmark is mostly hidden and then fully seen. */
  hidden: number;
  shown: number;
  note: string;
}

export const REVEALS: readonly Reveal[] = [
  { id: "R1", landmark: "L10", hidden: 915, shown: 1065, note: "the cloud nave hidden by the valley's turn, then its west front and towers at once" },
  { id: "R2", landmark: "L08", hidden: 630, shown: 830, note: "the floating dome hall hidden behind the theatre's hill, then its domes and half-domes as the valley turns north" },
  { id: "R3", landmark: "L20", hidden: 2080, shown: 2105, note: "the skyline peak hidden behind the sea-cliff ridge, then its three wings and spire" },
];

/** Polyline points of a side route every ~4 m (world x, z), from the valley at `from` to the valley at `to`. */
export function sidePoints(r: SideRoute): [number, number][] {
  const a = routeAt(designToS(r.from)).p;
  const b = routeAt(designToS(r.to)).p;
  const ctrl: [number, number][] = r.crosses ? [...r.via, ...crestVia(r)] : r.via;
  const poly: [number, number][] = [a, ...ctrl, b];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < poly.length; i++) {
    const [x0, z0] = poly[i]!;
    const [x1, z1] = poly[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  out.push(b);
  return out;
}

/** The gorge flight's plan points: west rim → down the channel → toe → beside the face → crest → east rim (L16 local). */
const GORGE_LOCAL: [number, number, number][] = [
  [-290, 222, 70], // climbing over the west abutment (rim 192)
  [-220, 222, 80],
  [-150, 175, 105], // dropping into the canyon over its west wall
  [-60, 70, 150],
  [-20, 32, 165], // low over the channel below the spillway
  [16, 28, 150], // at the toe, looking up (L16 entry "toe")
  [40, 60, 128], // rising beside the fin spillway
  [60, 110, 95], // beside the downstream face (L16 entries "face-1"…)
  [60, 178, 55], // over the crest road
  [200, 212, 40], // over the east abutment (rim 192)
  [300, 212, 38],
];
function gorgeLocal(r: SideRoute): [number, number, number][] {
  const p = placements().find((q) => q.id === r.crosses)!;
  return GORGE_LOCAL.map(([lx, y, lz]) => {
    const w = toWorld(p, [lx, 0, lz]);
    return [w[0], y, w[2]] as [number, number, number];
  });
}
function crestVia(r: SideRoute): [number, number][] {
  return gorgeLocal(r).map(([x, , z]) => [x, z]);
}
/** The flight line's height at each sampled point of a fly route (linear between its control heights). */
export function flightHeights(r: SideRoute): number[] {
  const pts = sidePoints(r);
  const a = routeAt(designToS(r.from)).p;
  const b = routeAt(designToS(r.to)).p;
  const ctrl = gorgeLocal(r);
  const poly: [number, number, number][] = [[a[0], heightAt(a[0], a[1]) + 6, a[1]], ...ctrl, [b[0], heightAt(b[0], b[1]) + 6, b[1]]];
  const out: number[] = [];
  for (let i = 0; i + 1 < poly.length; i++) {
    const [x0, y0, z0] = poly[i]!;
    const [x1, y1, z1] = poly[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
    for (let k = 0; k < n; k++) out.push(y0 + ((y1 - y0) * k) / n);
  }
  out.push(poly[poly.length - 1]![1]);
  // the flight keeps at least 12 m over the ground everywhere (it follows the control heights where they are higher)
  return out.map((y, i) => Math.max(y, heightAt(pts[i]![0], pts[i]![1]) + 12));
}

export interface RouteCheck {
  id: string;
  ok: boolean;
  length: number;
  /** Longest stretch steeper than 30 % (walkable limit), metres: those stretches are flown. */
  steep: number;
  /** Least clearance to a footprint the route doesn't cross. */
  clearance: number;
  coast: number;
  /** Greatest distance from the valley route: a real alternative, not a parallel lane. */
  separation: number;
  rejoins: boolean;
  climb: [number, number];
  problems: string[];
}

function distToQuad(q: [number, number][], x: number, z: number): number {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, zi] = q[i]!;
    const [xj, zj] = q[j]!;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (inside) return -1;
  let best = Infinity;
  for (let i = 0; i < q.length; i++) {
    const [ax, az] = q[i]!;
    const [bx, bz] = q[(i + 1) % q.length]!;
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}

/** Validate one side route on the real terrain (heights with pads), footprints and coast. */
export function checkSideRoute(r: SideRoute, ps: readonly Placement[] = placements()): RouteCheck {
  const pts = sidePoints(r);
  const quads = ps.filter((p) => p.id !== r.crosses).map((p) => ({ id: p.id, q: footprint(p, 0) }));
  const problems: string[] = [];
  let length = 0;
  let steep = 0;
  let run = 0;
  let clearance = Infinity;
  let near = "";
  let coast = Infinity;
  let separation = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let prevH = NaN;
  pts.forEach(([x, z], i) => {
    const h = heightAt(x, z);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
    for (const f of quads) {
      const d = distToQuad(f.q, x, z);
      if (d < clearance) {
        clearance = d;
        near = f.id;
      }
    }
    coast = Math.min(coast, -polygonSdf(COAST, x, z));
    separation = Math.max(separation, Math.abs(nearestOnRoute(x, z).side));
    if (i > 0) {
      const dl = Math.hypot(x - pts[i - 1]![0], z - pts[i - 1]![1]);
      length += dl;
      if (Math.abs(h - prevH) / Math.max(dl, 1e-6) > 0.3) {
        run += dl;
        steep = Math.max(steep, run);
      } else run = 0;
    }
    prevH = h;
  });
  const a = routeAt(designToS(r.from)).p;
  const b = routeAt(designToS(r.to)).p;
  const rejoins = Math.hypot(pts[0]![0] - a[0], pts[0]![1] - a[1]) < 1 && Math.hypot(pts[pts.length - 1]![0] - b[0], pts[pts.length - 1]![1] - b[1]) < 1;
  if (clearance < 18) problems.push(`within ${clearance.toFixed(0)} m of ${near}'s footprint`);
  if (coast < 40) problems.push(`${coast.toFixed(0)} m from the coast`);
  if (separation < 80) problems.push(`never more than ${separation.toFixed(0)} m from the valley route`);
  if (!rejoins) problems.push("does not leave and rejoin the valley route");
  if (length < 300) problems.push(`only ${length.toFixed(0)} m long`);
  // a short steep pitch is a stair; a long one is a flight segment, declared by crossing a landmark's own route
  if (r.mode === "fly") {
    // a flight line: it must stay above the ground (≥ 4 m) everywhere; grade does not apply
    const fh = flightHeights(r);
    let low = Infinity;
    pts.forEach(([x, z], i) => (low = Math.min(low, (fh[i] ?? fh[fh.length - 1]!) - heightAt(x, z))));
    if (low < 4) problems.push(`the flight line passes ${low.toFixed(1)} m above the ground`);
  } else if (steep > 60) {
    // a pitch up to 60 m is a stair (terraces and steps, §4); longer is not walkable
    problems.push(`${steep.toFixed(0)} m continuously steeper than 30 %`);
  }
  return { id: r.id, ok: problems.length === 0, length, steep, clearance, coast, separation, rejoins, climb: [lo, hi], problems };
}

/** Fraction of a landmark's bounding-box sample points visible from an eye (terrain occlusion only). */
export function visibleFraction(eye: [number, number, number], id: string, ps: readonly Placement[] = placements()): number {
  const p = ps.find((q) => q.id === id)!;
  const def = LANDMARKS.find((l) => l.id === id)!;
  const [x0, z0, x1, z1] = p.extent;
  const H = def.target[2];
  let vis = 0;
  let n = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (const fy of [0.25, 0.6, 1]) {
    const t = toWorld(p, [x0 + ((x1 - x0) * i) / 4, H * fy, z0 + ((z1 - z0) * j) / 4]);
    n++;
    const d = Math.hypot(t[0] - eye[0], t[2] - eye[2]);
    const steps = Math.ceil(d / 4);
    let blocked = false;
    for (let k = 1; k < steps && !blocked; k++) {
      const f = k / steps;
      if (heightAt(eye[0] + (t[0] - eye[0]) * f, eye[2] + (t[2] - eye[2]) * f) > eye[1] + (t[1] - eye[1]) * f + 0.5) blocked = true;
    }
    if (!blocked) vis++;
  }
  return vis / n;
}

/** The eye of a walker on the valley route at design distance d. */
export function routeEye(d: number): [number, number, number] {
  const q = routeAt(designToS(d)).p;
  return [q[0], heightAt(q[0], q[1]) + 1.65, q[1]];
}

export interface RevealCheck {
  id: string;
  ok: boolean;
  hidden: number;
  shown: number;
}

/** A reveal holds when the landmark is at most 60 % visible at `hidden` and at least 85 % at `shown`. */
export function checkReveal(r: Reveal, ps: readonly Placement[] = placements()): RevealCheck {
  const hidden = visibleFraction(routeEye(r.hidden), r.landmark, ps);
  const shown = visibleFraction(routeEye(r.shown), r.landmark, ps);
  return { id: r.id, ok: hidden <= 0.6 && shown >= 0.85, hidden, shown };
}
