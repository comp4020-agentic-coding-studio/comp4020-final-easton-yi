// World layout: where each landmark stands along the valley, the foundation
// pads that settle it into the terrain, the home portals, side routes, ridge
// reveals and the island-scale safe points. Authored values, validated by
// tests (clearances, route distance, pads, heights) rather than trusted.
import { LANDMARKS, type LandmarkDef } from "./landmarks.ts";
import { COAST, designToS, heightAt, landform, polygonSdf, riverAt, rivers, routeAt, setPads, setRivers, type Pad, type River } from "./terrain.ts";
import type { GroundProbe } from "./candles.ts";

export interface Placement {
  id: string;
  /** Design route distance (0–2,400). */
  d: number;
  /** Lateral offset from the route (+ = left of travel). */
  offset: number;
  /** World position of the building's local origin (foundation level). */
  position: [number, number, number];
  /** World yaw of the building's local frame. */
  yaw: number;
  /** Footprint half-sizes (from the target envelope plus approaches), for pads and clearance. */
  half: [number, number];
  /**
   * The local x/z rectangle the building actually occupies (min x, min z, max x, max z), approaches included.
   * Usually ±half; a building whose geometry is not centred on its origin declares it (L09's outer bastion,
   * L16's downstream toe and chutes). Footprints, clearance and pads use this, not ±half.
   */
  extent: [number, number, number, number];
  pad: Pad;
}

/**
 * Authored placements: route distance, lateral offset, how the building's
 * front (local −z) faces relative to the route ("route" = faces the route,
 * "along" = its long axis runs along the route), extra approach depth, and
 * the pad kind. Heights are taken from the terrain at the footprint and
 * flattened there.
 */
interface Authored {
  id: string;
  d: number;
  offset: number;
  face: "route" | "along" | "away";
  /** Extra half-depth for approach stairs in front (local −z). */
  approach: number;
  kind?: Pad["kind"];
  /** Fixed pad height (otherwise the terrain's median at the footprint). */
  y?: number;
  turn?: number;
  /**
   * Local x/z extent (min x, min z, max x, max z) when the recipe's geometry is not centred on its origin.
   * `tests/world-landmarks.test.ts` checks every landmark's generated bounds against its extent.
   */
  extent?: [number, number, number, number];
}

const AUTHORED: Authored[] = [
  // A — Origins Meadow (0–450): small temples on gentle slopes, alternating sides
  { id: "L01", d: 110, offset: 90, face: "route", approach: 10 },
  { id: "L02", d: 230, offset: -125, face: "route", approach: 30 },
  { id: "L03", d: 345, offset: 160, face: "along", approach: 40, turn: 0.15 },
  { id: "L04", d: 440, offset: -140, face: "route", approach: 50 },
  // B — Arches and Domes (450–950): the aqueduct crosses the stream valley
  { id: "L05", d: 560, offset: 0, face: "along", approach: 0, kind: "banks", turn: Math.PI / 2, extent: [-152, -10, 152, 10] },
  { id: "L06", d: 700, offset: 185, face: "route", approach: 8 },
  { id: "L07", d: 790, offset: -150, face: "route", approach: 40 },
  { id: "L08", d: 905, offset: 170, face: "route", approach: 40 },
  // C — Cities and Halls (950–1,450)
  // L09: the keep's outer gate bastion reaches +117 m in local x
  { id: "L09", d: 1010, offset: -170, face: "route", approach: 35, extent: [-90, -111, 120, 111] },
  { id: "L10", d: 1150, offset: 150, face: "route", approach: 40 },
  { id: "L11", d: 1270, offset: -165, face: "route", approach: 40 },
  { id: "L12", d: 1400, offset: 210, face: "route", approach: 10 },
  // D — Industrial Gorge (1,450–1,950): a broad basin, then the canyon
  { id: "L13", d: 1530, offset: -175, face: "along", approach: 0 },
  { id: "L14", d: 1620, offset: 130, face: "route", approach: 0 },
  { id: "L15", d: 1730, offset: -135, face: "route", approach: 30 },
  // L16: the dam's upstream face is near local z −43; the toe, fin spillway chutes and stilling basin reach z +117, and
  // the downstream channel continues to +170 (canyon floor, not a building, but it must not be filled)
  // and the reservoir basin reaches back to −255 upstream (its water must stand in a basin, not over the land)
  { id: "L16", d: 1865, offset: 0, face: "along", approach: 0, kind: "canyon", turn: Math.PI / 2, extent: [-180, -255, 180, 170] },
  // E — Contemporary Sea Cliffs (1,950–2,400)
  { id: "L17", d: 2010, offset: 125, face: "route", approach: 30 },
  { id: "L18", d: 2110, offset: -125, face: "route", approach: 30 },
  { id: "L19", d: 2215, offset: 120, face: "route", approach: 30 },
  { id: "L20", d: 2330, offset: -135, face: "route", approach: 30 },
];

function place(a: Authored, def: LandmarkDef): Placement {
  const rp = routeAt(designToS(a.d));
  const x = rp.p[0] + rp.n[0] * a.offset;
  const z = rp.p[1] + rp.n[1] * a.offset;
  // yaw so the building's local −z (its front) faces the route
  const toRoute: [number, number] = [-rp.n[0] * Math.sign(a.offset || 1), -rp.n[1] * Math.sign(a.offset || 1)];
  let yaw: number;
  if (a.face === "route") yaw = Math.atan2(toRoute[0], toRoute[1]); // local −z → toRoute
  else if (a.face === "away") yaw = Math.atan2(-toRoute[0], -toRoute[1]);
  else yaw = Math.atan2(-rp.t[0], -rp.t[1]); // front looks back down the route (toward visitors arriving)
  yaw += a.turn ?? 0;
  const [W, D] = def.target;
  const half: [number, number] = [W / 2, D / 2 + a.approach];
  const extent: [number, number, number, number] = a.extent ?? [-half[0], -half[1], half[0], half[1]];
  const ecx = (extent[0] + extent[2]) / 2;
  const ecz = (extent[1] + extent[3]) / 2;
  const ehx = (extent[2] - extent[0]) / 2;
  const ehz = (extent[3] - extent[1]) / 2;
  // pad height: terrain sampled over the footprint; the median keeps one bump from deciding
  const samples: number[] = [];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const lx = ecx + (i / 2) * ehx;
    const lz = ecz + (j / 2) * ehz;
    samples.push(heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
  }
  samples.sort((p, q) => p - q);
  const median = samples[Math.floor(samples.length / 2)]!;
  const y = a.y ?? Math.round(median * 2) / 2;
  // the pad covers the extent (its centre offset from the origin when the extent is not centred)
  const pad: Pad = { id: a.id, c: [x + ecx * c + ecz * s, z - ecx * s + ecz * c], yaw, hx: ehx + 6, hz: ehz + 6, y, blend: 45 + 0.15 * Math.max(W, D), kind: a.kind ?? "flat" };
  return { id: a.id, d: a.d, offset: a.offset, position: [x, y, z], yaw, half, extent, pad };
}

/** Corners of a placement's footprint (x, z), with a margin. */
export function footprint(p: Placement, margin = 0): [number, number][] {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const [x0, z0, x1, z1] = p.extent;
  return [[x0 - margin, z0 - margin], [x1 + margin, z0 - margin], [x1 + margin, z1 + margin], [x0 - margin, z1 + margin]].map(([lx, lz]) => [p.position[0] + lx! * c + lz! * s, p.position[2] - lx! * s + lz! * c] as [number, number]);
}

/** Separating-axis test for two convex quads (true = they overlap). */
export function quadsOverlap(A: [number, number][], B: [number, number][]): boolean {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i]!;
      const [x2, z2] = poly[(i + 1) % poly.length]!;
      const nx = z2 - z1;
      const nz = x1 - x2;
      const pa = A.map(([x, z]) => x * nx + z * nz);
      const pb = B.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Spanning structures cross the route by design (the aqueduct over its stream, the dam across the gorge). */
export const SPANS = new Set(["L05", "L16"]);
/** Clearance kept between neighbouring footprints and from the route's walking line. */
export const GAP = 18;

let cached: Placement[] | null = null;

/**
 * Compute placements once. Pads are computed against the undisturbed
 * landform first, then registered so heightAt includes them.
 */
export function placements(): Placement[] {
  if (cached) return cached;
  setPads([]);
  const out: Placement[] = [];
  // Resolve each authored spot: search nearby route distances and offsets (keeping the authored side) for the
  // closest spot whose footprint clears earlier buildings by GAP, the route line by GAP and the coast by 40 m.
  // spans first (they are fixed to the route), then the rest in route order
  const order = [...AUTHORED.filter((a) => SPANS.has(a.id)), ...AUTHORED.filter((a) => !SPANS.has(a.id))];
  for (const a0 of order) {
    const def = LANDMARKS.find((l) => l.id === a0.id)!;
    let best: { p: Placement; cost: number } | null = null;
    const dSteps = SPANS.has(a0.id) ? [0, 12, -12, 24, -24, 36, -36, 48, -48, 60, -60] : Array.from({ length: 23 }, (_, i) => (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 15);
    for (const dd of dSteps) {
      for (let k = 0; k < (SPANS.has(a0.id) ? 1 : 40); k++) {
        const a = { ...a0, d: a0.d + dd, offset: a0.offset + Math.sign(a0.offset || 1) * k * 10 };
        const p = place(a, def);
        const fp = footprint(p, GAP / 2);
        if (out.some((q) => quadsOverlap(fp, footprint(q, GAP / 2)))) continue;
        if (!SPANS.has(a0.id) && routeIntrudes(p)) continue;
        if (footprint(p, 40).some(([x, z]) => polygonSdf(COAST, x, z) > 0)) break; // further out only leaves the island
        // cost: distance from the authored spot plus how far the pad departs from the ground around it
        const cut = Math.abs(p.pad.y - heightAt(p.position[0], p.position[2]));
        // lateral distance beyond the 240 m guideline costs heavily; sliding along the route is cheap
        const lateral = Math.abs(a.offset);
        const cost = 0.6 * Math.abs(dd) + k * 10 + Math.max(0, lateral - 240) * 6 + 0.5 * Math.abs(p.pad.y - 60) + cut;
        if (!best || cost < best.cost) best = { p, cost };
        break; // further out on this row only costs more
      }
    }
    if (!best) throw new Error(`no clear placement for ${a0.id}`);
    out.push(best.p);
  }
  out.sort((p, q) => p.d - q.d);
  // special pads: the aqueduct spans a stream; its middle tier bears on bank terraces at +28 above the bed
  const l05 = out.find((p) => p.id === "L05")!;
  l05.pad.kind = "banks";
  l05.pad.y = l05.position[1] - 6;
  l05.position[1] = l05.pad.y;
  l05.pad.banks = [{ atX: 97, y: l05.pad.y + 28 }];
  l05.pad.hx = 160;
  l05.pad.hz = 24;
  // the dam stands in a canyon: foundation ≈ 20, banks rising beside it, the reservoir upstream
  const l16 = out.find((p) => p.id === "L16")!;
  l16.pad.kind = "canyon";
  l16.pad.y = 20;
  l16.position[1] = 20;
  // the canyon floor spans the dam's whole extent: upstream face, toe, chutes, stilling basin and the start of the
  // downstream channel (its pad centre is offset downstream with the extent); the walls rise beyond
  l16.pad.hx = 180;
  l16.pad.hz = (l16.extent[3] - l16.extent[1]) / 2 + 4;
  l16.pad.blend = 40;
  // the crest road (local y 150, near local z 31–46 at its ends) lands on abutment saddles in the rim banks
  const padCz = (l16.extent[1] + l16.extent[3]) / 2;
  l16.pad.saddle = { z: 38 - padCz, y: l16.pad.y + 150, halfWidth: 14, level: 30, ramp: 60 };
  // the canyon's V follows the dam body's half-width rule (regionD.ts: 60 + 110·(y/144)^0.8), bedding its sides
  l16.pad.vee = { floorHalf: 60, span: 110, height: 144, power: 0.8 };
  // the reservoir basin upstream of the dam's face (local z < −20): floor at 100 under the water (156), banks at 172
  // around it to x ±175; the extent (and so the pad) reaches back over it to local z −255
  l16.pad.reservoir = { z0: -255 - padCz, z1: -20 - padCz, floor: l16.pad.y + 80, bank: l16.pad.y + 152, half: 175 };
  setPads([...out.map((p) => p.pad), ...homePads(landform)]);
  setRivers([damRiver(l16)]);
  cached = out;
  return out;
}

/**
 * The dam's river (§4 "downstream channel", §7.4 "receiving body"): from the end of L16's stilling-basin channel
 * (its local z 117.4, where the training walls end) over a 1 m end sill, incised into the canyon floor to the end of
 * the pad, then south-east through
 * the ridge below the dam in a walled gorge to the south coast, where it meets the sea at sea level. The water
 * falls monotonically; the gorge stays clear of L15's footprint and under the gorge flight line.
 */
function damRiver(l16: Placement): River {
  // the channel water (regionD.ts waterRect) ends with the training walls at local z = 117.4; the river starts at
  // that end sill, a metre lower (incised into the canyon floor, so the floor beside it is its bank)
  const start = toWorld(l16, [0, 0, 117.4]);
  const padEnd = toWorld(l16, [0, 0, 170]);
  const points: [number, number][] = [
    [start[0], start[2]],
    [padEnd[0], padEnd[2]],
    [708, 120],
    [772, 230],
    [800, 380],
    [806, 560],
  ];
  const len: number[] = [0];
  for (let i = 1; i < points.length; i++) len.push(len[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = len[len.length - 1]!;
  const top = l16.position[1] - 0.5;
  // level through the canyon, then an even fall to the sea
  const water = len.map((d, i) => (i <= 1 ? top : top * (1 - (d - len[1]!) / (total - len[1]!))));
  return { id: "L16-river", points, water, floorHalf: 30, bed: 1, wall: 1.6 };
}

export const placementOf = (id: string): Placement => placements().find((p) => p.id === id)!;

/**
 * The island around a landmark in its local frame (candles.ts GroundProbe): the terrain's height relative to the
 * pad, and whether a river's water covers a point. Shared by the generator's landmark child and the tests.
 */
export function islandProbe(id: string): GroundProbe {
  const place = placementOf(id);
  const c = Math.cos(place.yaw);
  const s = Math.sin(place.yaw);
  const wx = (x: number, z: number): [number, number] => [place.position[0] + x * c + z * s, place.position[2] - x * s + z * c];
  return {
    height: (x, z) => {
      const [X, Z] = wx(x, z);
      return heightAt(X, Z) - place.position[1];
    },
    wet: (x, z, pad) => {
      const [X, Z] = wx(x, z);
      return rivers().some((rv) => {
        const q = riverAt(rv, X, Z);
        return q.across < rv.floorHalf + rv.bed / rv.wall + pad && heightAt(X, Z) < q.water + 0.05;
      });
    },
  };
}

/** True if the route's centre line passes within GAP of the footprint. */
function routeIntrudes(p: Placement): boolean {
  const fp = footprint(p, GAP);
  // sample the route near the building
  const s0 = Math.max(0, designToS(p.d) - 600);
  const s1 = designToS(p.d) + 600;
  for (let s = s0; s <= s1; s += 6) {
    const rp = routeAt(s);
    if (pointInQuad(fp, rp.p[0], rp.p[1])) return true;
  }
  return false;
}
function pointInQuad(q: [number, number][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, zi] = q[i]!;
    const [xj, zj] = q[j]!;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** World transform of a local point in a landmark's frame. */
export function toWorld(p: Placement, v: readonly number[]): [number, number, number] {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return [p.position[0] + v[0]! * c + v[2]! * s, p.position[1] + v[1]!, p.position[2] - v[0]! * s + v[2]! * c];
}

// ---------------------------------------------------------------- home and portals

export interface Portal {
  id: "explore" | "works" | "together";
  label: string;
  /** World position (base centre), facing yaw (the side a visitor approaches from). */
  position: [number, number, number];
  yaw: number;
  /** Clear opening (width × height). */
  opening: [number, number];
}

/**
 * The home meadow: a grassy terrace on the western headland, 120-odd metres
 * up and a short walk from the southern sea cliffs. A search over the western
 * island (every 25 m, every 15° of heading; recorded in docs/evidence/world)
 * found this the only standable spot where the sea and the tall landmarks
 * share one view: looking east, nine of the tallest landmarks stand above the
 * ridges and the southern sea opens at the right of the frame. The valley
 * floor's temples are hidden by the terrace's edge and revealed by walking to
 * it (the first ridge reveal). The three portals stand on the terrace ahead.
 */
export const HOME_SITE: [number, number] = [-1125, -300];

export function home(): { spawn: [number, number, number]; yaw: number; portals: Portal[] } {
  placements();
  // the viewer stands toward the terrace's south-east edge, so the cliff no longer hides the sea below
  const cx = HOME_SITE[0] + 20;
  const cz = HOME_SITE[1] + 25;
  // the searched heading (yaw −97°): the valley's skyline centred within ±10° (the tallest landmarks at
  // 130–170 px on a 1080 px-high view), the temples to the left, and open sea across the right third
  // (25–55° off-centre); on a narrow phone the skyline and portals remain
  const fwdYaw = (-97 * Math.PI) / 180;
  const ring = (k: number): [number, number] => {
    // portals on an arc 34 m ahead of the spawn, spread ±26°
    const a = fwdYaw + ((k - 1) * 26 * Math.PI) / 180;
    return [cx - Math.sin(a) * 34, cz - Math.cos(a) * 34];
  };
  const mk = (id: Portal["id"], label: string, k: number): Portal => {
    const [x, z] = ring(k);
    const yaw = Math.atan2(x - cx, z - cz); // faces back toward the spawn
    return { id, label, position: [x, heightAt(x, z), z], yaw, opening: [6, 9] };
  };
  const portals = [mk("works", "My Works", 0), mk("explore", "Explore the World", 1), mk("together", "Build Together", 2)];
  return { spawn: [cx, heightAt(cx, cz), cz], yaw: fwdYaw, portals };
}

/** The home terrace pad and the path pad down to the valley start (added with the landmark pads). */
/**
 * The home terrace is an authored headland (main prompt §4 allows authored
 * overrides): a meadow at y = HOME_Y on the south-western ridge shoulder, high
 * enough to see over the valley's ridges to the skyline with the southern sea
 * at the right of the view, blended into the ridge over 110 m.
 */
export const HOME_Y = 128;
export function homePads(_groundAt: (x: number, z: number) => number): Pad[] {
  const [cx, cz] = HOME_SITE;
  return [{ id: "home", c: [cx, cz], yaw: 0, hx: 52, hz: 52, y: HOME_Y, blend: 110, kind: "flat" }];
}
