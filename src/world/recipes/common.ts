// Helpers shared by several landmark recipes: platforms, roofs, cones,
// polyline facades and rails. Each still places preset stock through the
// shared parts, so counts stay real.
import { add, Builder, len, norm, scale, sub, type Stage, type StockId, type V3 } from "../core.ts";
import { chain, deck, floorGrid, rect, ring, sec, steps, trussQuad } from "../parts.ts";

export interface Band {
  /** Band height. */
  h: number;
  /** Inset of this band's outline from the platform's outer outline. */
  inset: number;
}

/**
 * A stepped platform: each band is a stack of perimeter frames (a solid-looking
 * band face), an internal grid at its top instead of a solid volume, and the
 * top band carries contiguous decking. One box collider per band.
 */
export function platform(
  b: Builder,
  o: {
    cx?: number;
    cz?: number;
    y0?: number;
    w: number;
    d: number;
    bands: Band[];
    frameStock?: StockId;
    framesPerBand?: number;
    gridP?: number;
    gridStock?: StockId;
    deckStock?: StockId | null;
    deckAxis?: "x" | "z";
    holes?: { x0: number; x1: number; z0: number; z1: number }[];
    band?: string;
    collide?: boolean;
  },
): number {
  const cx = o.cx ?? 0;
  const cz = o.cz ?? 0;
  let y = o.y0 ?? 0;
  const fs = o.frameStock ?? "M";
  const name = o.band ?? "platform";
  o.bands.forEach((band, k) => {
    b.set({ stage: "base", band: `${name} band ${k + 1}`, course: 0 });
    const w = o.w - 2 * band.inset;
    const d = o.d - 2 * band.inset;
    const per = o.framesPerBand ?? Math.max(1, Math.round(band.h / sec(fs)));
    for (let j = 0; j < per; j++) {
      b.set({ course: j });
      rect(b, fs, cx, y + (j * band.h) / per, cz, w, d, 1);
    }
    if (o.gridP) {
      b.set({ course: per });
      // the grid's two layers sit at the band's top (inside the frames), never below the band
      const gs = sec(o.gridStock ?? "M");
      b.with({ tier: 2 }, () => floorGrid(b, o.gridStock ?? "M", cx, Math.max(y + 2 * gs, y + band.h), cz, w - 2 * sec(fs), d - 2 * sec(fs), o.gridP!));
    }
    if (o.collide !== false) b.box([cx, y + band.h / 2, cz], [w / 2, band.h / 2, d / 2]);
    b.plan("base", `${name} band ${k + 1}`, per + (o.gridP ? 1 : 0));
    y += band.h;
  });
  const last = o.bands[o.bands.length - 1]!;
  if (o.deckStock !== null) {
    b.set({ stage: "base", band: `${name} deck`, course: 0 });
    deck(b, o.deckStock ?? "M", cx, y + sec(o.deckStock ?? "M"), cz, o.w - 2 * last.inset - 2 * sec(fs), o.d - 2 * last.inset - 2 * sec(fs), o.deckAxis ?? "x", o.holes ?? []);
    b.plan("base", `${name} deck`, 1);
  }
  return y;
}

/**
 * An approach flight subdivided into walkable risers (≤ 0.25 by default) with
 * a ramp collider, placed in its own "approach" component so the building's
 * core bounds stay comparable with the target envelope.
 */
export function approach(b: Builder, x: number, y0: number, zEdge: number, width: number, rise: number, dir: 1 | -1, id: string): { run: number } {
  return b.with({ comp: `approach ${id}`, stage: "base", band: `approach ${id}`, course: 0 }, () => {
    const r = steps(b, x, y0, zEdge, width, rise, { dir: dir === 1 ? 1 : -1, riser: 0.25, tread: 1.5 });
    b.plan("base", `approach ${id}`, 1);
    return { run: r.run };
  });
}

/** Triangular truss in the vertical plane at z: span x0→x1, eave y0, ridge y1; `webs` vertical/diagonal web chains. */
export function triTruss(b: Builder, x0: number, x1: number, y0: number, y1: number, z: number, o: { chord?: StockId; web?: StockId; webs?: number; post?: boolean } = {}): number {
  const ch = o.chord ?? "M";
  const wb = o.web ?? "D";
  const xm = (x0 + x1) / 2;
  let n = 0;
  n += chain(b, ch, [x0, y0, z], [xm, y1, z], { up: [0, 0, 1] });
  n += chain(b, ch, [x1, y0, z], [xm, y1, z], { up: [0, 0, 1] });
  n += chain(b, ch, [x0, y0, z], [x1, y0, z], { up: [0, 1, 0] });
  const webs = o.webs ?? 5;
  // webs: verticals at fractions of the half span plus diagonals between them
  const half = (x1 - x0) / 2;
  const k = Math.max(1, Math.floor((webs + 1) / 2));
  for (let i = 1; i <= k; i++) {
    const f = i / (k + 1);
    for (const sgn of [-1, 1]) {
      const x = xm + sgn * half * (1 - f);
      const yTop = y0 + (y1 - y0) * f;
      if (yTop - y0 > 0.6) n += chain(b, wb, [x, y0, z], [x, yTop, z], { up: [0, 0, 1] });
      const xn = xm + sgn * half * (1 - (i + 1) / (k + 1));
      const yn = y0 + ((y1 - y0) * (i + 1)) / (k + 1);
      if (i < k || o.post !== false) n += chain(b, wb, [x, y0, z], [xn, Math.min(yn, y1), z], { up: [0, 0, 1] });
    }
  }
  if (o.post !== false) n += chain(b, ch === "B" ? "M" : ch, [xm, y0, z], [xm, y1, z], { up: [0, 0, 1] });
  return n;
}

/**
 * A pitched roof spanning x0→x1 with its ridge along z (z0→z1): `trusses`
 * triangular trusses, purlins every `purlin` metres down each slope, roof
 * strips (D) every 2 m and a plank shell under the strips so the roof reads
 * as closed. Box colliders step down each slope.
 */
export function pitchedRoof(
  b: Builder,
  o: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; trusses: number; chord?: StockId; web?: StockId; webs?: number; purlin?: number; strips?: number | null; stripStock?: StockId; shell?: boolean; collide?: boolean; band?: string; stage?: Stage },
): void {
  const band = o.band ?? "roof";
  const stage = o.stage ?? "roof";
  const xm = (o.x0 + o.x1) / 2;
  b.set({ stage, band: `${band} trusses`, course: 0 });
  for (let i = 0; i < o.trusses; i++) {
    b.set({ course: i });
    const z = o.trusses === 1 ? (o.z0 + o.z1) / 2 : o.z0 + ((o.z1 - o.z0) * i) / (o.trusses - 1);
    triTruss(b, o.x0, o.x1, o.y0, o.y1, z, { chord: o.chord, web: o.web, webs: o.webs });
  }
  b.plan(stage, `${band} trusses`, o.trusses);
  const slopeLen = Math.hypot((o.x1 - o.x0) / 2, o.y1 - o.y0);
  const p = o.purlin ?? 4;
  const np = Math.max(2, Math.ceil(slopeLen / p));
  b.set({ stage, band: `${band} purlins`, course: 0 });
  // purlins ride just under the rafters' top line, so the ridge stays at y1
  const drop = 0.75;
  for (const sgn of [-1, 1]) {
    for (let k = 0; k <= np; k++) {
      if (sgn > 0 && k === np) continue; // the ridge purlin is shared by both slopes
      const f = k / np;
      const x = xm + sgn * ((o.x1 - o.x0) / 2) * (1 - f);
      const y = o.y0 + (o.y1 - o.y0) * f - drop * f;
      chain(b, "M", [x, y, o.z0], [x, y, o.z1], { up: [0, 1, 0] });
    }
  }
  b.plan(stage, `${band} purlins`, 1);
  if (o.strips !== null) {
    const every = o.strips ?? 2;
    const st = o.stripStock ?? "D";
    b.set({ stage: "details", band: `${band} strips`, course: 0 });
    const nz = Math.max(1, Math.floor(Math.abs(o.z1 - o.z0) / every));
    for (let k = 0; k <= nz; k++) {
      const z = o.z0 + ((o.z1 - o.z0) * k) / nz;
      for (const sgn of [-1, 1]) chain(b, st, [o.x0 + (sgn < 0 ? 0 : o.x1 - o.x0), o.y0 + 0.2, z], [xm, o.y1 - 0.1, z], { up: [0, 1, 0] });
    }
    b.plan("details", `${band} strips`, 1);
  }
  if (o.shell !== false) {
    const pitch = Math.atan2(o.y1 - o.y0, (o.x1 - o.x0) / 2);
    const hz = Math.abs(o.z1 - o.z0) / 2;
    for (const sgn of [-1, 1]) {
      const c: V3 = [xm + (sgn * (o.x1 - o.x0)) / 4, (o.y0 + o.y1) / 2 - 0.1, (o.z0 + o.z1) / 2];
      // the slope falls from the ridge (centre) to the eave (outside): on the +x side its local +x must point down-and-out,
      // i.e. a negative roll about z (quatYPR maps +x to [cos r, sin r, 0]); the opposite sign made a V whose eaves
      // stood up past the gables as dark "horns" (found in the inspector review, 2026-11-04)
      b.shell(c, [slopeLen / 2, 0.08, hz], "plank", { roll: -sgn * pitch });
    }
  }
  if (o.collide !== false) {
    // stepped boxes approximating each slope
    const steps_ = 4;
    for (let k = 0; k < steps_; k++) {
      const f0 = k / steps_;
      const f1 = (k + 1) / steps_;
      const half = (o.x1 - o.x0) / 2;
      const yTop = o.y0 + (o.y1 - o.y0) * f1;
      const xa = half * (1 - f1);
      const xb = half * (1 - f0);
      for (const sgn of [-1, 1]) {
        const xc = xm + sgn * (xa + xb) / 2;
        b.box([xc, (o.y0 + yTop) / 2, (o.z0 + o.z1) / 2], [Math.max(0.3, (xb - xa) / 2), Math.max(0.3, (yTop - o.y0) / 2), Math.abs(o.z1 - o.z0) / 2]);
      }
    }
  }
}

/** A cone (conical roof or spire) of `ribs` sloping ribs and `rings` shrinking rings. */
export function cone(b: Builder, cx: number, cz: number, y0: number, r0: number, h: number, ribs: number, rings: number, o: { ribStock?: StockId; ringStock?: StockId; phase?: number; band?: string; rTop?: number } = {}): void {
  const rs = o.ribStock ?? "M";
  const ns = o.ringStock ?? "M";
  const rTop = o.rTop ?? 0;
  const band = o.band ?? "cone";
  b.set({ band: `${band} ribs`, course: 0 });
  for (let i = 0; i < ribs; i++) {
    const a = (o.phase ?? 0) + (2 * Math.PI * i) / ribs;
    const c = Math.cos(a);
    const s = Math.sin(a);
    chain(b, rs, [cx + r0 * c, y0, cz + r0 * s], [cx + rTop * c, y0 + h - sec(rs) / 2, cz + rTop * s], { up: [c, 0, s] });
  }
  for (let k = 0; k < rings; k++) {
    b.set({ band: `${band} rings`, course: k });
    const f = k / rings;
    const r = r0 + (rTop - r0) * f;
    if (r < 0.4) continue;
    ring(b, ns, cx, y0 + h * f + 0.2, cz, r, ribs, 1, { phase: o.phase });
  }
}

/** Points and unit tangents along a polyline at `step` spacing, from start to end (inclusive). */
export function along(path: V3[], step: number, closed = false): { p: V3; t: V3; seg: number }[] {
  const pts = closed ? [...path, path[0]!] : path;
  const out: { p: V3; t: V3; seg: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const c = pts[i + 1]!;
    const d = sub(c, a);
    const l = len(d);
    const t = norm(d);
    const n = Math.max(1, Math.round(l / step));
    for (let k = 0; k < n; k++) out.push({ p: add(a, scale(d, k / n)), t, seg: i });
    if (!closed && i + 2 === pts.length) out.push({ p: c, t, seg: i });
  }
  return out;
}

/** Outward normal (in plan) of a polyline segment in a counter-clockwise ring (seen from +y). */
export const outward = (t: V3): V3 => [t[2], 0, -t[0]];

/** Rails along a polyline at deck height y: D posts every 2 m, two D rails. */
export function rails(b: Builder, path: V3[], y: number, closed = false, o: { post?: StockId; rail?: StockId; height?: number } = {}): void {
  const post = o.post ?? "D";
  const rail = o.rail ?? "D";
  const h = o.height ?? 1.1;
  for (const q of along(path, 2, closed)) chain(b, post, [q.p[0], y, q.p[2]], [q.p[0], y + h, q.p[2]], { up: [0, 0, 1] });
  const pts = closed ? [...path, path[0]!] : path;
  for (let i = 0; i + 1 < pts.length; i++) {
    for (const yy of [y + h - 0.06, y + h * 0.5]) chain(b, rail, [pts[i]![0], yy, pts[i]![2]], [pts[i + 1]![0], yy, pts[i + 1]![2]], { up: [0, 1, 0], mode: "overhang" });
  }
}

/** A regular polygon's vertices (n, circumradius r) around (cx, cz) at y, CCW from angle `phase`. */
export function ngon(n: number, r: number, y: number, cx = 0, cz = 0, phase = 0): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)] as V3;
  });
}

/** A closed rectangle path (CCW seen from +y) with outer half extents. */
export function rectPath(cx: number, cz: number, hw: number, hd: number, y: number): V3[] {
  return [
    [cx - hw, y, cz - hd],
    [cx - hw, y, cz + hd],
    [cx + hw, y, cz + hd],
    [cx + hw, y, cz - hd],
  ];
}

/**
 * A hollow polygonal tower shaft (castle towers, intake towers): per course,
 * `n` vertical chains at the vertices and upper/lower rings, with diagonal
 * groups every second course. A cylinder collider.
 */
export function polyShaft(b: Builder, cx: number, cz: number, r: number, n: number, y0: number, courses: number, ch: number, o: { stock?: StockId; diagonals?: boolean; band?: string; ringEvery?: number } = {}): number {
  const st = o.stock ?? "M";
  const band = o.band ?? "shaft";
  const verts = ngon(n, r - sec(st) / 2, 0, cx, cz);
  if (b.context.stage !== "columns") b.set({ stage: "columns" });
  for (let k = 0; k < courses; k++) {
    b.set({ band, course: k });
    const ya = y0 + k * ch;
    const yb = ya + ch;
    for (const v of verts) chain(b, st, [v[0], ya, v[2]], [v[0], yb, v[2]], { up: norm([v[0] - cx, 0, v[2] - cz]) });
    ring(b, st, cx, ya + sec(st) / 2, cz, r - sec(st) / 2, n, 1, { stagger: false });
    if (k === courses - 1) ring(b, st, cx, yb - sec(st) / 2, cz, r - sec(st) / 2, n, 1, { stagger: false });
    if (o.diagonals !== false && k % 2 === 1) {
      for (let i = 0; i < n; i += 2) {
        const a = verts[i]!;
        const c = verts[(i + 1) % n]!;
        chain(b, st, [a[0], ya + 0.3, a[2]], [c[0], yb - 0.3, c[2]]);
      }
    }
  }
  b.plan(b.context.stage, band, courses);
  b.cyl([cx, y0 + (courses * ch) / 2, cz], r, (courses * ch) / 2);
  return y0 + courses * ch;
}

/** A braced vertical face between two plan points: bottom/top rails, verticals every `p`, X braces every second bay. */
export function bracedFace(b: Builder, a: V3, c: V3, y0: number, y1: number, p: number, o: { stock?: StockId; braces?: boolean } = {}): void {
  const st = o.stock ?? "M";
  const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
  const bays = Math.max(1, Math.round(l / p));
  const at = (f: number, y: number): V3 => [a[0] + (c[0] - a[0]) * f, y, a[2] + (c[2] - a[2]) * f];
  for (let i = 0; i <= bays; i++) chain(b, st, at(i / bays, y0), at(i / bays, y1), { up: [0, 1, 0] });
  chain(b, st, at(0, y0 + sec(st) / 2), at(1, y0 + sec(st) / 2), { up: [0, 1, 0] });
  chain(b, st, at(0, y1 - sec(st) / 2), at(1, y1 - sec(st) / 2), { up: [0, 1, 0] });
  if (o.braces !== false) for (let i = 0; i < bays; i += 2) trussQuad(b, st, at(i / bays, y0), at((i + 1) / bays, y0), at(i / bays, y1), at((i + 1) / bays, y1), { sides: false, bottom: false, top: false });
}

/** Typed list of piece-count expectations used by tests (recipe → band → minimum courses). */
export type CourseExpectation = { band: string; courses: number };
