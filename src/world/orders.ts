// The four column orders (Appendix B3) and the legacy 30 m Ionic column
// (Appendix B4). Every column takes its per-segment counts from the calling
// recipe, so L03's Doric (20 B ribs, 20 M rings, 80 D backs per segment) and
// L06's reduced Ionic half-column are the same function with different
// numbers, not differently scaled copies.
//
// A column's local origin is the centre of its footing at y = 0. Flutes are
// real recesses: outer ribs (raised fillets) carry the silhouette, recessed
// backs sit `fluteDepth` behind the rib faces, hidden ring ties sit inside the
// backs, and a dark core shell fills the interior so the recesses read as
// shadow rather than see-through gaps.
import { add, Builder, norm, scale, STOCKS, sub, type StockId, type V3 } from "./core.ts";
import { chain, rect, ring, sec, tieRing } from "./parts.ts";

export interface ShaftCounts {
  /** Outer ribs per segment (= flutes). */
  ribs: number;
  ribStock: StockId;
  /** Parallel lines per rib (2 for a 0.25 m fillet made of D). */
  ribLines?: 1 | 2;
  /** Recessed back lines per flute; each line is a chain over the segment (a 4 m segment of D is 4 pieces). */
  backsPerFlute: number;
  backStock: StockId;
  fluteDepth: number;
  /** Ring tie segments per shaft segment, and their stock. */
  ringSegments: number;
  ringStock: StockId;
  ringsPerSeg?: number;
}

export interface ShaftGeom {
  y0: number;
  segH: number;
  segs: number;
  radius: (k: number) => number;
}

/** Entasis: linear taper plus a swell peaking around the lower third, zero at both ends. */
export function entasis(rBottom: number, rTop: number, segs: number, swell: number): (k: number) => number {
  return (k) => {
    const t = k / segs;
    const bump = t < 1 / 3 ? Math.sin((Math.PI / 2) * (t * 3)) : Math.cos((Math.PI / 2) * ((t - 1 / 3) / (2 / 3)));
    return rBottom + (rTop - rBottom) * t + swell * bump * (1 - t * 0.5) * (k === 0 || k === segs ? 0 : 1);
  };
}

/** Explicit per-boundary radii (B4's 2.00/2.03/…), linearly interpolated if asked for between. */
export const radii = (rs: readonly number[]): ((k: number) => number) => (k) => rs[Math.max(0, Math.min(rs.length - 1, Math.round(k)))]!;

/** A long member laid along a→b but kept inside [yMin, yMax] by sliding it along its axis. */
function lapPiece(b: Builder, stock: StockId, pa: V3, pb: V3, up: V3, yMin: number, yMax: number, j: number): void {
  const dir = norm(sub(pb, pa));
  const u = STOCKS[stock].length;
  let c = scale(add(pa, pb), 0.5);
  const halfV = (u / 2) * dir[1];
  if (c[1] - halfV < yMin) c = add(c, scale(dir, (yMin - (c[1] - halfV)) / dir[1]));
  if (c[1] + halfV > yMax) c = add(c, scale(dir, (yMax - (c[1] + halfV)) / dir[1]));
  b.piece(stock, c, dir, up, j);
}

/** One fluted shaft; returns actual piece counts. */
export function fluted(b: Builder, g: ShaftGeom, n: ShaftCounts): { ribs: number; backs: number; rings: number } {
  const lines = n.ribLines ?? 1;
  const ribDepth = lines === 2 ? 0.25 : sec(n.ribStock);
  const top = g.y0 + g.segH * g.segs;
  const c0 = b.context.course;
  let ribs = 0;
  let backs = 0;
  let rings = 0;
  for (let k = 0; k < g.segs; k++) {
    b.set({ course: c0 + k });
    const ya = g.y0 + k * g.segH;
    const yb = ya + g.segH;
    const ra = g.radius(k);
    const rb = g.radius(k + 1);
    for (let i = 0; i < n.ribs; i++) {
      const a = (2 * Math.PI * i) / n.ribs;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const up: V3 = [ca, 0, sa];
      const tng: V3 = [-sa, 0, ca];
      const fillet = (dr: number, dt: number): void => {
        const off = add(scale(up, -dr), scale(tng, dt));
        const pa = add([(ra - sec(n.ribStock) / 2) * ca, ya, (ra - sec(n.ribStock) / 2) * sa], off);
        const pb = add([(rb - sec(n.ribStock) / 2) * ca, yb, (rb - sec(n.ribStock) / 2) * sa], off);
        if (STOCKS[n.ribStock].length > g.segH + 1e-6) lapPiece(b, n.ribStock, pa, pb, up, g.y0, top, k % 2 ? 1 : -1);
        else ribs += chain(b, n.ribStock, pa, pb, { up }) - 1;
        ribs++;
      };
      if (lines === 2) {
        fillet(0, -sec(n.ribStock) / 2);
        fillet(0, sec(n.ribStock) / 2);
      } else fillet(0, 0);
      // recessed backs between this rib and the next
      const fa = a + Math.PI / n.ribs;
      const cf = Math.cos(fa);
      const sf = Math.sin(fa);
      const bs = sec(n.backStock);
      const halfW = Math.max(0, n.backsPerFlute - 1) * bs * 0.55;
      for (let q = 0; q < n.backsPerFlute; q++) {
        const dt = n.backsPerFlute === 1 ? 0 : -halfW + (2 * halfW * q) / (n.backsPerFlute - 1);
        const ta: V3 = [-sf, 0, cf];
        // the middle back sits deepest so the channel is concave
        const depth = n.fluteDepth + (n.backsPerFlute >= 3 ? bs * 0.5 * (1 - Math.abs(dt) / Math.max(halfW, 1e-6)) : 0);
        const ra2 = ra - ribDepth + sec(n.ribStock) / 2 - depth - bs / 2 + (ribDepth - sec(n.ribStock)) / 2;
        const rb2 = rb - ribDepth + sec(n.ribStock) / 2 - depth - bs / 2 + (ribDepth - sec(n.ribStock)) / 2;
        const pa = add([ra2 * cf, ya, ra2 * sf], scale(ta, dt));
        const pb = add([rb2 * cf, yb, rb2 * sf], scale(ta, dt));
        if (STOCKS[n.backStock].length > g.segH + 1e-6) {
          lapPiece(b, n.backStock, pa, pb, [cf, 0, sf], g.y0, top, k % 2 ? 1 : -1);
          backs++;
        } else backs += chain(b, n.backStock, pa, pb, { up: [cf, 0, sf] });
      }
    }
    const per = n.ringsPerSeg ?? 1;
    for (let q = 0; q < per; q++) {
      const r = Math.min(ra, rb) - ribDepth - n.fluteDepth - sec(n.backStock) * 1.6 - sec(n.ringStock) / 2;
      const span = g.segH / per;
      rings += tieRing(b, n.ringStock, 0, 0, Math.max(0.3, r), n.ringSegments, ya + q * span, ya + (q + 1) * span, (k * Math.PI) / n.ringSegments).pieces;
    }
  }
  b.set({ course: c0 });
  // the dark core: flute recesses read as shadow, not as daylight through the column
  const rCore = Math.max(0.2, Math.min(g.radius(0), g.radius(g.segs)) - ribDepth - n.fluteDepth - sec(n.backStock) * 1.2);
  b.shellCyl([0, (g.y0 + top) / 2, 0], rCore, (top - g.y0) / 2, "shade");
  return { ribs, backs, rings };
}

export interface CapitalOpts {
  /** Shaft top radius, where the capital starts. */
  rTop: number;
  /** Abacus width (square). */
  abacus: number;
  /** Detail tier for capital pieces. */
  tier?: 0 | 1 | 2;
}

// ---------------------------------------------------------------- Doric

/** Doric: no circular base, 20 flutes, entasis, six-ring echinus, three-layer square abacus. Returns capital top. */
export function doric(b: Builder, g: ShaftGeom, n: ShaftCounts, c: CapitalOpts & { echinusRings?: number; echinusSegments?: number; abacusLayers?: number; echinusStep: number; abacusStep: number }): number {
  const top = g.y0 + g.segH * g.segs;
  b.set({ stage: "columns", band: "shaft" });
  fluted(b, g, n);
  const rings = c.echinusRings ?? 6;
  const segs = c.echinusSegments ?? 32;
  const layers = c.abacusLayers ?? 3;
  const capH = top;
  b.with({ stage: "details", band: "capital", tier: c.tier ?? 1 }, () => {
    // a necking groove: one recessed ring
    b.set({ course: 0 });
    ring(b, "D", 0, top - 0.35, 0, c.rTop - 0.16, segs, 1);
    // Each echinus course is a solid cushion band, not a single outline ring: its outer ring stacked at the D
    // section to fill the course height, with one ring just inside it so the overhang's underside reads as a
    // thick band from below (Appendix C2: capitals cast readable shadows). The core behind those two is the
    // capital's shade shell: further concentric rings were hidden by the band, the course above and the abacus
    // (66 % of the temple's D; docs/evidence/world/triangles.md). Recorded as a revision by the caller.
    const sD = sec("D");
    for (let j = 0; j < rings; j++) {
      b.set({ course: 1 + j });
      // the echinus flares outward like a cushion: fast at first, then flattening under the abacus
      const f = (j + 1) / rings;
      const r = c.rTop + (c.abacus / 2 - 0.15 - c.rTop) * Math.sin((f * Math.PI) / 2);
      const y = top + 0.06 + j * c.echinusStep;
      const stack = Math.max(1, Math.floor(c.echinusStep / (sD * 1.04)));
      // component LOD: the course's first ring (its radius and height: the profile) is structural, drawn from
      // the mid range; the stacked repeats that close the band and the underside ring are near detail (tier 2)
      ring(b, "D", 0, y, 0, r, segs, 1);
      b.with({ tier: 2 }, () => {
        // the same layers ring(…, stack) would place above the first (alternate layers offset half a segment)
        for (let k = 1; k < stack; k++) ring(b, "D", 0, y + k * sD, 0, r, segs, 1, { phase: k % 2 ? Math.PI / segs : 0 });
        const inner = r - sD * 2.2;
        if (inner > c.rTop - sD) ring(b, "D", 0, y, 0, inner, Math.max(12, Math.round((segs * inner) / r)), 1);
      });
    }
    // abacus: R(6,6,1,1) square frames of D, stacked to the layer height: the slab's visible edge, which casts the
    // hard shadow. Its top is covered by the architrave and its inside by the shade shell, so no infill deck.
    // The first frame of each layer is structural; the stacked repeats closing the edge are near detail.
    for (let j = 0; j < layers; j++) {
      b.set({ course: 1 + rings + j });
      const y = top + 0.06 + rings * c.echinusStep + j * c.abacusStep;
      const stack = Math.max(1, Math.floor(c.abacusStep / (sD * 1.04)));
      rect(b, "D", 0, y, 0, c.abacus, c.abacus, 1);
      if (stack > 1) b.with({ tier: 2 }, () => rect(b, "D", 0, y, 0, c.abacus, c.abacus, stack, 1));
    }
  });
  const capTop = top + 0.06 + rings * c.echinusStep + layers * c.abacusStep;
  b.shell([0, (top + capTop) / 2, 0], [c.abacus / 2 - 0.4, (capTop - top) / 2, c.abacus / 2 - 0.4], "shade");
  b.cyl([0, (g.y0 + top) / 2, 0], g.radius(0) * 0.92, (top - g.y0) / 2);
  b.box([0, (top + capTop) / 2, 0], [c.abacus / 2, (capTop - top) / 2, c.abacus / 2]);
  void capH;
  return capTop;
}

// ---------------------------------------------------------------- Ionic

/**
 * Ionic: layered torus/scotia base, 24 fillet-separated flutes, neck, flaring
 * echinus, two volutes on the front and two on the back (each a planar spiral
 * of D tangent pieces over ~1.25 turns, drawn in two parallel planes so the
 * scroll has depth), connecting cushion and a four-layer abacus.
 */
export function ionic(
  b: Builder,
  g: ShaftGeom,
  n: ShaftCounts,
  c: CapitalOpts & {
    base: { y0: number; radii: number[]; segments: number; ties: number; tieStock: StockId };
    neckRings?: number;
    neckTies?: number;
    flareRadii?: number[];
    voluteSegs?: number;
    voluteR?: number;
    voluteConnectors?: number;
    /** Draw each scroll in one plane (B4: 24 D per volute) or two (deeper reduced templates). */
    volutePlanes?: 1 | 2;
    /** Plane of the scrolls (front/back), default 0.87 × half the abacus. */
    voluteZ?: number;
    abacusLayers?: number;
    abacusCross?: number;
    scale?: number;
    faces?: 1 | 2;
  },
): number {
  const top = g.y0 + g.segH * g.segs;
  const k = c.scale ?? 1;
  b.with({ stage: "base", band: "column base" }, () => {
    const bb = c.base;
    const step = (g.y0 - bb.y0) / bb.radii.length;
    bb.radii.forEach((r, j) => {
      b.set({ course: j });
      ring(b, "D", 0, bb.y0 + step * (j + 0.5), 0, r, bb.segments, 1);
    });
    b.set({ course: bb.radii.length });
    for (let i = 0; i < bb.ties; i++) {
      const a = (2 * Math.PI * i) / bb.ties;
      const r = Math.min(...bb.radii) - 0.2;
      lapPiece(b, bb.tieStock, [r * Math.cos(a), bb.y0, r * Math.sin(a)], [r * Math.cos(a), g.y0 + 2, r * Math.sin(a)], [Math.cos(a), 0, Math.sin(a)], bb.y0, g.y0 + 2.5, i % 2 ? 1 : -1);
    }
    // a solid-reading torus under the rings
    b.shellCyl([0, (bb.y0 + g.y0) / 2, 0], Math.min(...bb.radii) - 0.05, (g.y0 - bb.y0) / 2, "shade");
  });
  b.set({ stage: "columns", band: "shaft", course: 0 });
  fluted(b, g, n);
  let capTop = top;
  b.with({ stage: "details", band: "capital", tier: c.tier ?? 1 }, () => {
    // neck 1 m: two 24-piece D rings and M internal ties up into the abacus
    const neckRings = c.neckRings ?? 2;
    for (let j = 0; j < neckRings; j++) {
      b.set({ course: j });
      ring(b, "D", 0, top + 0.25 + j * 0.5 * k, 0, c.rTop - 0.05, 24, 1);
    }
    const neckTop = top + 1 * k;
    // internal M ties linking the shaft top through the capital to the abacus
    const neckTies = c.neckTies ?? 0;
    for (let i = 0; i < neckTies; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / neckTies;
      const r = c.rTop * 0.55;
      lapPiece(b, "M", [r * Math.cos(a), top - 1, r * Math.sin(a)], [r * Math.cos(a), top + 3 * k, r * Math.sin(a)], [Math.cos(a), 0, Math.sin(a)], top - 1.4, top + 2.6 * k, i % 2 ? 1 : -1);
    }
    // flaring support: horizontal rings of growing radius
    const flare = c.flareRadii ?? [1.8, 1.95, 2.1, 2.25, 2.4, 2.55].map((r) => r * (c.rTop / 1.76) * k);
    flare.forEach((r, j) => {
      b.set({ course: neckRings + j });
      ring(b, "D", 0, neckTop + (j + 0.5) * ((1.5 * k) / flare.length), 0, r, 32, 1);
    });
    // B4 bands: neck top..+1, flare +1..+2.5, volutes hang beside the echinus, abacus +3.5..+4
    const half = c.abacus / 2;
    const vr = c.voluteR ?? 0.95 * k;
    const vsegs = c.voluteSegs ?? 24;
    const eyeY = top + 2.6 * k;
    const zPlane = c.voluteZ ?? half * 0.87;
    b.set({ course: neckRings + flare.length });
    const faces = c.faces === 1 ? [-1] : [-1, 1];
    const eyes: V3[] = [];
    for (const face of faces) {
      const zf = face * zPlane;
      for (const sgn of [-1, 1] as const) {
        // the scroll's eye sits out toward the abacus corner; the spiral starts at the top
        // inside, winds outward and down, then tightens into the eye (~1.25 turns)
        const cx = sgn * (half - vr - 0.1 * k);
        eyes.push([cx, eyeY, zf]);
        for (const dz of c.volutePlanes === 2 ? [0, face * 0.25] : [0]) {
          let prev: V3 | null = null;
          for (let i = 0; i <= vsegs; i++) {
            const t = (i / vsegs) * 1.25 * 2 * Math.PI;
            const r = vr * (1 - 0.78 * (i / vsegs));
            const ang = Math.PI / 2 + sgn * t;
            const p: V3 = [cx + r * Math.cos(ang), eyeY + r * Math.sin(ang), zf + dz];
            if (prev) chain(b, "D", prev, p, { mode: "overhang", up: [0, 0, 1] });
            prev = p;
          }
        }
      }
    }
    // connecting members: short D links from each eye across the coils
    const conn = c.voluteConnectors ?? 16;
    b.set({ course: neckRings + flare.length + 1 });
    const per = Math.max(1, Math.round(conn / eyes.length));
    for (const e of eyes) {
      for (let i = 0; i < per; i++) {
        const a = (2 * Math.PI * i) / per + Math.PI / 4;
        const d: V3 = [Math.cos(a), Math.sin(a), 0];
        b.piece("D", add(e, scale(d, vr * 0.45)), d, [0, 0, 1]);
      }
    }
    // abacus: alternating square frame layers and cross chains
    const layers = c.abacusLayers ?? 4;
    const at = top + 3.5 * k;
    for (let j = 0; j < layers; j++) {
      b.set({ course: neckRings + flare.length + 2 + j });
      rect(b, "D", 0, at + j * 0.125, 0, c.abacus, c.abacus, 1);
    }
    const cross = c.abacusCross ?? 4;
    for (let j = 0; j < cross; j++) {
      const t = -c.abacus / 2 + ((j + 0.5) * c.abacus) / cross;
      const yy = at + 0.0625 + 0.125 * (j % layers);
      if (j % 2) chain(b, "D", [-half + 0.125, yy, t], [half - 0.125, yy, t], { up: [0, 1, 0] });
      else chain(b, "D", [t, yy, -half + 0.125], [t, yy, half - 0.125], { up: [0, 1, 0] });
    }
    capTop = at + layers * 0.125;
  });
  b.shell([0, top + (capTop - top) * 0.55, 0], [c.rTop * 1.05, (capTop - top) * 0.4, c.rTop * 0.95], "shade");
  b.cyl([0, (g.y0 + top) / 2, 0], g.radius(0) * 0.92, (top - g.y0) / 2);
  b.box([0, (top + capTop) / 2, 0], [c.abacus / 2, Math.max(0.5, (capTop - top) / 2), c.abacus / 2]);
  return capTop;
}

/**
 * Appendix B4's 30 m Ionic column, its paper recipe resolved: base 0–2 m
 * (five 32-segment D rings, 16 M ties), eight 3 m shaft segments with 24 M
 * ribs, three D backs per flute and 24 D ring connectors, B4's per-segment
 * radii, neck two 24-D rings and 16 M ties, six 32-D flare rings, four
 * volutes of 24 D plus 16 D connectors, and four 24-D abacus layers plus four
 * 6-D cross chains. `shaftSegs` shortens the shaft for side porches (B4/L04).
 */
export function ionicB4(b: Builder, o: { shaftSegs?: number; scale?: number } = {}): number {
  const k = o.scale ?? 1;
  const segs = o.shaftSegs ?? 8;
  // B4 lists outer radii at the eight segment boundaries; a ninth (top) value continues the taper
  const r = [2.0, 2.03, 2.04, 2.02, 1.97, 1.91, 1.84, 1.76, 1.68].map((x) => x * k);
  const pick = (kk: number): number => r[Math.round((kk * 8) / segs)]!;
  return ionic(
    b,
    { y0: 2 * k, segH: 3 * k, segs, radius: segs === 8 ? (kk) => r[kk]! : pick },
    { ribs: 24, ribStock: "M", backsPerFlute: 1, backStock: "D", fluteDepth: 0.22 * k, ringSegments: 24, ringStock: "D" },
    {
      rTop: (segs === 8 ? r[8]! : pick(segs)),
      abacus: 6 * k,
      base: { y0: 0, radii: [2.8, 2.65, 2.35, 2.5, 2.15].map((x) => x * k), segments: 32, ties: 16, tieStock: "M" },
      neckRings: 2,
      neckTies: 16,
      flareRadii: [1.8, 1.95, 2.1, 2.25, 2.4, 2.55].map((x) => x * k),
      voluteSegs: 24,
      voluteR: 0.95 * k,
      voluteConnectors: 16,
      abacusLayers: 4,
      abacusCross: 4,
      scale: k,
    },
  );
}

// ---------------------------------------------------------------- Corinthian adaptation

/**
 * Corinthian: 24 flutes, an expanding bell, a lower and an upper row of eight
 * staggered leaf clusters (each five inclined D lanes, bent in at least two
 * runs, that fan out from a narrow foot, close to a pointed tip and turn it
 * down; the middle lane stands proud as a midrib), a pair of short volutes at each of four
 * corners and a concave-cornered abacus.
 */
export function corinthian(b: Builder, g: ShaftGeom, n: ShaftCounts, c: CapitalOpts & { capH?: number; leafLanes?: number; leafSegs?: number; base?: { y0: number; rings: number }; leafRows?: 2; clusters?: number }): number {
  const top = g.y0 + g.segH * g.segs;
  const capH = c.capH ?? 3.2;
  if (c.base) {
    b.with({ stage: "base", band: "column base" }, () => {
      const bb = c.base!;
      for (let j = 0; j < bb.rings; j++) {
        b.set({ course: j });
        ring(b, "D", 0, bb.y0 + ((g.y0 - bb.y0) * (j + 0.5)) / bb.rings, 0, g.radius(0) * (1.32 - 0.06 * j), 32, 2);
      }
      b.shellCyl([0, (bb.y0 + g.y0) / 2, 0], g.radius(0) * 1.05, (g.y0 - bb.y0) / 2, "shade");
    });
  }
  b.set({ stage: "columns", band: "shaft", course: 0 });
  fluted(b, g, n);
  const lanes = c.leafLanes ?? 5;
  const lsegs = c.leafSegs ?? 5;
  const clusters = c.clusters ?? 8;
  b.with({ stage: "details", band: "capital", tier: c.tier ?? 1 }, () => {
    // the bell (kalathos): rings widening upward
    for (let j = 0; j < 8; j++) {
      b.set({ course: j });
      const t = j / 7;
      ring(b, "D", 0, top + 0.1 + t * (capH - 0.5), 0, c.rTop * (0.97 + 0.3 * t * t), 32, 1);
    }
    for (let row = 0; row < 2; row++) {
      b.set({ course: 8 + row });
      const y0 = top + 0.05 + row * 0.32 * capH;
      const h = (row === 0 ? 0.5 : 0.78) * capH;
      const r0 = c.rTop * 0.97 + (row === 1 ? 0.12 : 0);
      // half the leaf's width in metres: neighbouring leaves almost touch, the other row covers the joins
      const halfW = ((Math.PI * r0) / clusters) * 0.86;
      // enough bends that the outline can widen and close to a point, each run about one D long
      const segs = Math.max(lsegs, Math.min(5, Math.round((h * 1.1) / 0.7)), 2);
      for (let i = 0; i < clusters; i++) {
        const a = (2 * Math.PI * (i + row * 0.5)) / clusters;
        for (let l = 0; l < lanes; l++) {
          const lane = lanes === 1 ? 0 : (l / (lanes - 1)) * 2 - 1;
          const pts: V3[] = [];
          for (let s = 0; s <= segs; s++) {
            const t = s / segs;
            // the leaf: a narrow foot on the bell, broadest near mid-height, drawn in to a pointed tip
            // that leans out and turns down; the midrib stands a little proud of the blade
            const w = halfW * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.05))) * (1 - t ** 3);
            const out = r0 + 0.3 * capH * t * t + (lane === 0 ? 0.07 * Math.sin(Math.PI * t) : 0);
            const yy = y0 + h * (t < 0.8 ? t : 0.8 + (t - 0.8) * 0.15) - (t > 0.82 ? (t - 0.82) * h * 0.5 : 0);
            const ang = a + (lane * w) / out;
            pts.push([out * Math.cos(ang), yy, out * Math.sin(ang)]);
          }
          for (let s = 0; s < segs; s++) chain(b, "D", pts[s]!, pts[s + 1]!, { mode: "overhang", up: [Math.cos(a), 0, Math.sin(a)] });
        }
      }
    }
    // corner volutes: a short pair at each corner, curling under the abacus corner
    b.set({ course: 10 });
    const half = c.abacus / 2;
    for (let q = 0; q < 4; q++) {
      const a = Math.PI / 4 + (q * Math.PI) / 2;
      const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
      const side: V3 = [-Math.sin(a), 0, Math.cos(a)];
      for (const sgn of [-1, 1]) {
        const base = add(scale(dir, half * Math.SQRT2 * 0.72), add(scale(side, sgn * 0.28), [0, top + capH - 0.5, 0]));
        let prev: V3 | null = null;
        for (let i = 0; i <= 10; i++) {
          const t = (i / 10) * 1.1 * 2 * Math.PI;
          const r = 0.42 * (1 - 0.75 * (i / 10));
          const p = add(base, add(scale(dir, r * Math.cos(t)), [0, r * Math.sin(t), 0]));
          if (prev) chain(b, "D", prev, p, { mode: "overhang", up: side });
          prev = p;
        }
      }
    }
    // abacus: three stepped layers, the lowest smallest, so its corners overhang the volutes
    for (let j = 0; j < 3; j++) {
      b.set({ course: 11 + j });
      rect(b, "D", 0, top + capH + j * 0.125, 0, c.abacus - (2 - j) * 0.25, c.abacus - (2 - j) * 0.25, 1);
    }
  });
  const capTop = top + capH + 0.375;
  b.shell([0, top + capH * 0.5, 0], [c.rTop * 1.05, capH * 0.5, c.rTop * 1.05], "shade");
  b.cyl([0, (g.y0 + top) / 2, 0], g.radius(0) * 0.92, (top - g.y0) / 2);
  b.box([0, (top + capTop) / 2, 0], [c.abacus / 2, Math.max(0.5, (capTop - top) / 2), c.abacus / 2]);
  return capTop;
}

// ---------------------------------------------------------------- lotus / papyrus bundle

/**
 * A bundled lotus/papyrus column: `stems` outer stems (B or M), finer D stem
 * lines on the stems, recessed D backs between stems, ring ties, binding bands
 * under the capital, and either closed bud groups or open petals over
 * expanding/closing rings, then a square bearing frame. No flutes, no volutes.
 */
export function lotus(
  b: Builder,
  g: ShaftGeom,
  o: {
    stems: number;
    stemStock: StockId;
    /** D pieces per segment laid as stem lines in the grooves. */
    stemLinePieces: number;
    backsPerSeg: number;
    ringTies: number;
    ringStock: StockId;
    capital: "bud" | "open";
    capRings: number;
    capRingSegs: number;
    capRadii: (t: number) => number;
    capH: number;
    groups: number;
    groupMembers: number;
    frame: number;
    frameStock?: StockId;
    frameLayers?: number;
  },
): number {
  const top = g.y0 + g.segH * g.segs;
  b.set({ stage: "columns", band: "stems" });
  const c0 = b.context.course;
  for (let k = 0; k < g.segs; k++) {
    b.set({ course: c0 + k });
    const ya = g.y0 + k * g.segH;
    const yb = ya + g.segH;
    const ra = g.radius(k);
    const rb = g.radius(k + 1);
    const s = sec(o.stemStock);
    for (let i = 0; i < o.stems; i++) {
      const a = (2 * Math.PI * i) / o.stems;
      const up: V3 = [Math.cos(a), 0, Math.sin(a)];
      const pa: V3 = [(ra - s / 2) * up[0], ya, (ra - s / 2) * up[2]];
      const pb: V3 = [(rb - s / 2) * up[0], yb, (rb - s / 2) * up[2]];
      if (STOCKS[o.stemStock].length > g.segH + 1e-6) lapPiece(b, o.stemStock, pa, pb, up, g.y0, top, k % 2 ? 1 : -1);
      else chain(b, o.stemStock, pa, pb, { up });
    }
    // fine D stem lines laid in the grooves between stems: stemLinePieces per segment
    const perLine = Math.max(1, Math.ceil(g.segH - 0.01));
    const lineCount = Math.round(o.stemLinePieces / perLine);
    for (let i = 0; i < lineCount; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / lineCount;
      const up: V3 = [Math.cos(a), 0, Math.sin(a)];
      const rr = (x: number): number => x - s * 0.55;
      chain(b, "D", [rr(ra) * up[0], ya, rr(ra) * up[2]], [rr(rb) * up[0], yb, rr(rb) * up[2]], { up });
    }
    // recessed backs between stems: backsPerSeg D pieces in vertical lines behind the grooves
    const backLines = Math.round(o.backsPerSeg / perLine);
    for (let i = 0; i < backLines; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / backLines;
      const up: V3 = [Math.cos(a), 0, Math.sin(a)];
      const rr = (x: number): number => x - s - 0.2;
      chain(b, "D", [rr(ra) * up[0], ya, rr(ra) * up[2]], [rr(rb) * up[0], yb, rr(rb) * up[2]], { up });
    }
    const rIn = Math.min(ra, rb) - s - (backLines ? 0.35 : 0.1) - sec(o.ringStock) / 2;
    tieRing(b, o.ringStock, 0, 0, rIn, o.ringTies, ya, yb, (k * Math.PI) / o.ringTies);
  }
  b.set({ course: c0 });
  b.shellCyl([0, (g.y0 + top) / 2, 0], Math.min(g.radius(0), g.radius(g.segs)) - sec(o.stemStock) - 0.3, (top - g.y0) / 2, "shade");
  b.with({ stage: "details", band: "capital", tier: 1 }, () => {
    for (let j = 0; j < o.capRings; j++) {
      b.set({ course: 1 + j });
      const t = (j + 0.5) / o.capRings;
      ring(b, "D", 0, top + t * o.capH, 0, Math.max(0.4, o.capRadii(t)), o.capRingSegs, 1);
    }
    b.set({ course: 1 + o.capRings });
    for (let i = 0; i < o.groups; i++) {
      const a = (2 * Math.PI * i) / o.groups;
      const up: V3 = [Math.cos(a), 0, Math.sin(a)];
      if (o.capital === "bud") {
        // a closed bud group: groupMembers D pieces following the swelling and closing ring profile
        const pts: V3[] = [];
        for (let s = 0; s <= o.groupMembers; s++) {
          const t = s / o.groupMembers;
          const rr = o.capRadii(Math.min(0.97, t)) + 0.07;
          pts.push([rr * Math.cos(a), top + t * o.capH, rr * Math.sin(a)]);
        }
        for (let s = 0; s < o.groupMembers; s++) chain(b, "D", pts[s]!, pts[s + 1]!, { mode: "overhang", up });
      } else {
        // an open petal: a folded curve of groupMembers D pieces flaring out past the ring crown
        const pts: V3[] = [];
        for (let s = 0; s <= o.groupMembers; s++) {
          const t = s / o.groupMembers;
          const rr = o.capRadii(Math.min(1, t)) + 0.15 + 0.25 * t * t;
          const fold = Math.sin(Math.PI * t) * 0.35;
          pts.push([rr * Math.cos(a), top + t * o.capH + fold, rr * Math.sin(a)]);
        }
        for (let s = 0; s < o.groupMembers; s++) chain(b, "D", pts[s]!, pts[s + 1]!, { mode: "overhang", up });
      }
    }
    // bearing frame
    b.set({ course: 2 + o.capRings });
    rect(b, o.frameStock ?? "M", 0, top + o.capH, 0, o.frame, o.frame, o.frameLayers ?? 2);
  });
  const capTop = top + o.capH + 1;
  b.shell([0, top + o.capH * 0.5, 0], [o.capRadii(0.5) * 0.85, o.capH * 0.45, o.capRadii(0.5) * 0.85], "shade");
  b.cyl([0, (g.y0 + top) / 2, 0], g.radius(0) * 0.92, (top - g.y0) / 2);
  b.box([0, top + o.capH / 2, 0], [o.frame / 2, o.capH / 2 + 0.5, o.frame / 2]);
  return capTop;
}

export const reuse = { chain, rect, ring };
