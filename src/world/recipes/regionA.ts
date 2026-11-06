// Region A — Origins Meadow: L01 First Lintel Ring, L02 Lotus Column Forest,
// L03 Ridge Doric Temple, L04 Volute Terrace Palace. Each function is its
// appendix table resolved into explicit parameters; deviations are recorded
// with b.revise().
import { Builder, type V3 } from "../core.ts";
import { chain, deck, floorGrid, rect, ring, sec } from "../parts.ts";
import { doric, entasis, ionicB4, lotus, radii } from "../orders.ts";
import { approach, pitchedRoof, platform, triTruss } from "./common.ts";

// ================================================================= L01

/**
 * L01 First Lintel Ring, 72 × 56 × 32. Twenty outer posts on an ellipse, five
 * inner portal pairs in an open horseshoe, staggered lintels.
 */
export function L01(b: Builder): void {
  const AX = 33; // outer post centre-line semi-axes, so footings (6 m) reach 72 × 56
  const AZ = 25;
  const n = 20;
  // posts at equal angle steps on the ellipse: neighbouring spans stay within 8.5–10.6 m
  const posts: { p: V3; yaw: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + Math.PI / n; // a gap centred on −z (the main entry) between posts 14 and 15
    const p: V3 = [AX * Math.cos(a), 0, AZ * Math.sin(a)];
    // the post's long section faces along the ring tangent
    const tx = -AX * Math.sin(a);
    const tz = AZ * Math.cos(a);
    posts.push({ p, yaw: Math.atan2(-tz, tx) });
  }
  b.revise({ item: "L01 outer ring geometry", original: "20 outer posts with no stated plan", revised: "posts at equal 18° steps on an ellipse with semi-axes 33 × 25, offset half a step so the −z axis falls between two posts", reason: "the 72 × 56 envelope includes the 6 m footings; equal angles keep lintel spans 8.4–10.6 m", impact: "the main opening on −z is a lintel bay of 10.6 m clear between post faces; a 12 m route uses the wider gap at the horseshoe's open end (see entries)" });

  // three foundation bands per footing: R(6,6) ×2 + G(6,6,1,1) core; widths 6 / 5.5 / 5
  b.plan("base", "footings", 3);
  for (const [i, post] of posts.entries()) {
    b.at(post.p, post.yaw, () => {
      b.set({ comp: `outer post ${i + 1}` });
      [6, 5.5, 5].forEach((w, k) => {
        b.set({ stage: "base", band: "footings", course: k });
        rect(b, "D", 0, k, 0, w, w, 1);
        rect(b, "D", 0, k + 0.125, 0, w, w, 1);
        b.with({ tier: 2 }, () => floorGrid(b, "D", 0, k + 1, 0, w - 0.25, w - 0.25, 1));
        // the band's visible face: M boards around the perimeter
        rect(b, "M", 0, k + 0.25, 0, w, w, 1);
      });
      b.box([0, 1.5, 0], [3, 1.5, 3]);
      b.footing([0, 0, 0]);
      outerPost(b);
    });
  }
  b.plan("columns", "outer posts", 5);

  // outer lintels between neighbouring posts, 23–27 m
  b.set({ stage: "beams", band: "outer lintels" });
  for (let i = 0; i < n; i++) {
    const a = posts[i]!.p;
    const c = posts[(i + 1) % n]!.p;
    b.set({ comp: `outer lintel ${i + 1}`, course: 0 });
    lintel(b, a, c, 23, 27, 1.6);
  }
  b.plan("beams", "outer lintels", 1);

  // five inner portal pairs in a horseshoe opening toward −z
  const tops = [24, 27, 29, 27, 24];
  const innerAngles = [-150, -115, -90, -65, -30].map((d) => (d * Math.PI) / 180 + Math.PI); // open end on −z
  b.plan("columns", "inner posts", 7);
  b.plan("beams", "inner lintels", 2);
  b.plan("details", "inner lintels", 1);
  innerAngles.forEach((ang, k) => {
    // the horseshoe: the pairs sit on an ellipse 16 × 13, each pair across the radial direction
    const c: V3 = [16 * Math.cos(ang), 0, 13 * Math.sin(ang) + 4];
    const radial: V3 = [Math.cos(ang), 0, Math.sin(ang)];
    const yaw = Math.atan2(-radial[0], radial[2]) + Math.PI / 2;
    b.at(c, yaw, () => {
      b.set({ comp: `inner portal ${k + 1}` });
      const top = tops[k]!;
      for (const sx of [-1, 1]) {
        b.at([sx * 5, 0, 0], 0, () => {
          b.set({ stage: "base", band: "footings", course: 0 });
          rect(b, "D", 0, 0, 0, 5.5, 4.5, 3);
          b.set({ course: 1 });
          rect(b, "M", 0, 0.375, 0, 5.5, 4.5, 4);
          b.box([0, 1.2, 0], [2.75, 1.2, 2.25]);
          b.footing([0, 0, 0]);
          // ceil((top − 3)/4) modules; the last module's overlap is adjusted to land on the top
          const mods = Math.ceil((top - 3) / 4);
          for (let m = 0; m < mods; m++) {
            const ya = 3 + m * 4 - (m === mods - 1 ? 3 + mods * 4 - top : 0);
            b.set({ stage: "columns", band: "inner posts", course: m });
            postModule(b, ya, ya + 4, 4, 3.2, m % 2 === 1);
          }
          b.box([0, (3 + top) / 2, 0], [2, (top - 3) / 2, 1.6]);
        });
      }
      // a 3 m-deep lintel with a slightly raised central upper chord and three projecting end layers
      b.set({ stage: "beams", band: "inner lintels", course: 0 });
      const y0 = top;
      for (const z of [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25]) {
        chain(b, "M", [-7.2, y0 + 0.25, z], [7.2, y0 + 0.25, z], { up: [0, 1, 0] });
        chain(b, "M", [-7.2, y0 + 2.75, z], [0, y0 + 3, z], { up: [0, 1, 0] });
        chain(b, "M", [0, y0 + 3, z], [7.2, y0 + 2.75, z], { up: [0, 1, 0] });
      }
      b.set({ course: 1 });
      for (let x = -6; x <= 6.01; x += 2) for (const z of [-1.25, 1.25]) chain(b, "D", [x, y0 + 0.5, z], [x, y0 + 2.6, z], { up: [0, 0, 1] });
      b.set({ stage: "details", band: "inner lintels", course: 2 });
      for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) for (const z of [-1, 0, 1]) chain(b, "D", [sx * (7.2 + 0.25 * (j + 1)) - sx * 0.5, y0 + 1 + j * 0.6, z], [sx * (7.2 + 0.25 * (j + 1)) + sx * 0.5, y0 + 1 + j * 0.6, z], { up: [0, 1, 0] });
      b.shell([0, y0 + 1.5, 0], [7, 1.2, 1.1], "plank");
      b.box([0, y0 + 1.5, 0], [7.4, 1.5, 1.5]);
      b.feature(k === 2 ? "highest inner portal reaches 32 m" : `inner portal ${k + 1}`, [0, y0 + 3, 0]);
    });
  });
  b.set({ comp: "main" });
  b.feature("bundled L-shaped corner posts with alternating ties", posts[0]!.p);
  b.feature("staggered outer lintels seated on posts", [0, 25, -25]);
  b.feature("two spatial layers: outer ring and inner horseshoe", [0, 0, 0]);

  b.entry("main", [0, 0, -40], [0, 0, 6], 12, 20, true, "through the open end of the horseshoe between outer posts into the inner court");
  b.entry("ring-bay", [-AX - 8, 0, 4], [-AX + 8, 0, 4], 8, 18, false, "through a side lintel bay");
  b.viewAt("ground", "ground", [6, 1.65, -44], [0, 18, 4], "approaching the open horseshoe");
  b.viewAt("interior", "interior", [2, 1.65, -2], [0, 26, 14], "under the highest portal");
  b.viewAt("high", "high", [-48, 44, -40], [0, 16, 0], "above the highest lintel");
  // stand back from the post bundle (the eye 2 m off its face saw half the frame as bundle at the lens)
  b.viewAt("detail", "detail", [AX * 0.55, 5, -AZ * 0.55], [AX * 0.98, 24, -AZ * 0.3], "post bundle and lintel seat");
  b.safe("entry", [0, 0, -42], 0);
  b.safe("court", [0, 0, 2], Math.PI);
}

/** One outer post: five 4 m segments, 24 M per segment, section tapering 4.5 × 3.5 → 4 × 3. */
function outerPost(b: Builder): void {
  for (let k = 0; k < 5; k++) {
    const f0 = k / 5;
    const f1 = (k + 1) / 5;
    const w = 4.5 - 0.5 * ((f0 + f1) / 2);
    const d = 3.5 - 0.5 * ((f0 + f1) / 2);
    b.set({ stage: "columns", band: "outer posts", course: k });
    postModule(b, 3 + 4 * k, 7 + 4 * k, w, d, k === 1 || k === 3);
  }
  b.box([0, 13, 0], [2.2, 10, 1.7]);
  b.shell([0, 13, 0], [1.75, 10, 1.25], "plank");
}

/**
 * A 4 m post module: four corners each two M verticals in an L, and four M
 * ties on each of four faces (two horizontals, two diagonals) = 24 M.
 * `turned` rotates the tie directions 90° (the X's lean the other way).
 */
function postModule(b: Builder, y0: number, y1: number, w: number, d: number, turned: boolean): void {
  const s = 0.5;
  const hw = w / 2;
  const hd = d / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      chain(b, "M", [sx * (hw - s / 2), y0, sz * (hd - s / 2)], [sx * (hw - s / 2), y1, sz * (hd - s / 2)], { up: [0, 0, 1] });
      chain(b, "M", [sx * (hw - (3 * s) / 2), y0, sz * (hd - s / 2)], [sx * (hw - (3 * s) / 2), y1, sz * (hd - s / 2)], { up: [0, 0, 1] });
    }
  }
  const faces: [V3, V3, number][] = [
    [[-hw, 0, -hd - s / 2], [hw, 0, -hd - s / 2], 0],
    [[-hw, 0, hd + s / 2], [hw, 0, hd + s / 2], 0],
    [[-hw - s / 2, 0, -hd], [-hw - s / 2, 0, hd], 1],
    [[hw + s / 2, 0, -hd], [hw + s / 2, 0, hd], 1],
  ];
  for (const [a, c] of faces) {
    const ya = y0 + 0.4;
    const yb = y1 - 0.4;
    chain(b, "M", [a[0], ya, a[2]], [c[0], ya, c[2]], { up: [0, 1, 0] });
    chain(b, "M", [a[0], yb, a[2]], [c[0], yb, c[2]], { up: [0, 1, 0] });
    if (turned) {
      chain(b, "M", [a[0], ya, a[2]], [(a[0] + c[0]) / 2, yb, (a[2] + c[2]) / 2]);
      chain(b, "M", [c[0], ya, c[2]], [(a[0] + c[0]) / 2, yb, (a[2] + c[2]) / 2]);
    } else {
      chain(b, "M", [(a[0] + c[0]) / 2, ya, (a[2] + c[2]) / 2], [a[0], yb, a[2]]);
      chain(b, "M", [(a[0] + c[0]) / 2, ya, (a[2] + c[2]) / 2], [c[0], yb, c[2]]);
    }
  }
}

/** A lintel from post a to post c: four upper and four lower M chord chains, D ties every 2 m, thicker at midspan. */
function lintel(b: Builder, a: V3, c: V3, y0: number, y1: number, depth: number): void {
  const dx = c[0] - a[0];
  const dz = c[2] - a[2];
  const l = Math.hypot(dx, dz);
  const t: V3 = [dx / l, 0, dz / l];
  const nrm: V3 = [-t[2], 0, t[0]];
  // ends seat 1.2 m onto each post
  const A: V3 = [a[0] - t[0] * 1.2, 0, a[2] - t[2] * 1.2];
  const C: V3 = [c[0] + t[0] * 1.2, 0, c[2] + t[2] * 1.2];
  const mid: V3 = [(A[0] + C[0]) / 2, 0, (A[2] + C[2]) / 2];
  for (const off of [-0.75, -0.25, 0.25, 0.75]) {
    const o: V3 = [nrm[0] * off * (depth / 1.6), 0, nrm[2] * off * (depth / 1.6)];
    chain(b, "M", [A[0] + o[0], y0 + 0.25, A[2] + o[2]], [C[0] + o[0], y0 + 0.25, C[2] + o[2]], { up: [0, 1, 0] });
    // the upper chord bows up 0.4 m at midspan (thicker middle)
    chain(b, "M", [A[0] + o[0], y1 - 0.65, A[2] + o[2]], [mid[0] + o[0], y1 - 0.25, mid[2] + o[2]], { up: [0, 1, 0] });
    chain(b, "M", [mid[0] + o[0], y1 - 0.25, mid[2] + o[2]], [C[0] + o[0], y1 - 0.65, C[2] + o[2]], { up: [0, 1, 0] });
  }
  const ties = Math.max(2, Math.round(l / 2));
  for (let i = 1; i < ties; i++) {
    const f = i / ties;
    const p: V3 = [a[0] + dx * f, 0, a[2] + dz * f];
    const top = y1 - 0.65 + 0.4 * (1 - Math.abs(2 * f - 1));
    for (const off of [-0.75, 0.75]) {
      const o: V3 = [nrm[0] * off * (depth / 1.6), 0, nrm[2] * off * (depth / 1.6)];
      chain(b, "D", [p[0] + o[0], y0 + 0.5, p[2] + o[2]], [p[0] + o[0], top - 0.25, p[2] + o[2]], { up: nrm });
    }
  }
  b.shell([mid[0], (y0 + y1) / 2 - 0.1, mid[2]], [l / 2 + 1, (y1 - y0) / 2 - 0.5, depth * 0.35], "plank", { yaw: Math.atan2(-t[2], t[0]) });
  b.box([mid[0], (y0 + y1) / 2, mid[2]], [l / 2 + 1, (y1 - y0) / 2, depth / 2 + 0.2], Math.atan2(-t[2], t[0]));
}

// ================================================================= L02

/**
 * L02 Lotus Column Forest, 144 × 104 × 44. Six rows × eight columns = 48;
 * the central two columns of every row are high, the rest low. Side roof
 * 32–36, central roof 40–44, clerestory bars between.
 */
export function L02(b: Builder): void {
  const W = 144;
  const D = 104;
  // base 0–4: four 1 m bands, perimeter R and an internal 8 m grid
  const top = platform(b, { w: W, d: D, bands: [0, 0.75, 1.5, 2.25].map((inset) => ({ h: 1, inset })), frameStock: "M", framesPerBand: 2, gridP: 8, deckStock: "M", deckAxis: "z", band: "base" });
  // a 16 m-wide approach on −z
  approach(b, 0, 0, -D / 2 + 2.25 - 16 * 1.5, 16, top, 1, "main");

  // column grid: x positions of eight columns along the hall's width; the central two widely spaced
  const xs = [-63, -45, -27, -11.5, 11.5, 27, 45, 63];
  const zs = [-40, -24, -8, 8, 24, 40];
  b.revise({ item: "L02 grid", original: "six rows × eight columns, ≥16 m clear between the central rows", revised: "column centres x = ±63/±45/±27/±11.5, z = ±40/±24/±8", reason: "central high columns at x = ±11.5 leave 23 − 2 × 2.5 = 18 m clear for the central passage; outer columns keep the 144 m envelope with 6 m overhangs of roof", impact: "the central passage runs along z through all six rows" });
  let i = 0;
  b.plan("columns", "stems", 8);
  b.plan("details", "capital", 10);
  for (const z of zs) {
    for (const x of xs) {
      i++;
      const high = Math.abs(x) < 20;
      b.at([x, top, z], 0, () => {
        b.set({ comp: `${high ? "high" : "low"} column ${i}` });
        if (high) {
          // 12 central columns: eight 4 m segments, 16 B stems + 32 D stem lines + 16 M ring ties per segment
          lotus(b, { y0: 0, segH: 4, segs: 8, radius: entasis(2.5, 2.25, 8, 0.02) }, {
            stems: 16, stemStock: "B", stemLinePieces: 32, backsPerSeg: 0, ringTies: 16, ringStock: "M",
            capital: "open", capRings: 8, capRingSegs: 32, capRadii: (t) => 2.4 + 1.6 * Math.pow(t, 0.8), capH: 4, groups: 16, groupMembers: 7, frame: 5,
          });
        } else {
          // 36 low columns: eight 3 m segments, 16 M stems + 16 D rings + 48 D recessed backs per segment
          lotus(b, { y0: 0, segH: 3, segs: 8, radius: radii([2.5, 2.46, 2.41, 2.37, 2.32, 2.28, 2.24, 2.19, 2.15]) }, {
            stems: 16, stemStock: "M", stemLinePieces: 0, backsPerSeg: 48, ringTies: 16, ringStock: "D",
            capital: "bud", capRings: 8, capRingSegs: 32, capRadii: (t) => (t < 0.7 ? 2.2 + (3.4 - 2.2) * Math.sin((t / 0.7) * (Math.PI / 2)) : 3.4 - (3.4 - 2.8) * ((t - 0.7) / 0.3)), capH: 4, groups: 16, groupMembers: 5, frame: 4,
            frameStock: "D", frameLayers: 1,
          });
        }
        b.footing([0, 0, 0]);
      });
    }
  }
  b.set({ comp: "roof" });
  // roofs: side roof 32–36 (top of low capitals 24 + 4 + 1 frame ≈ 29 → beams 32), central 40–44
  const yLow = top + 24 + 4 + 1;
  const yHigh = top + 32 + 4 + 1;
  // four-chord M beams across the column spans, along x and z
  b.set({ stage: "beams", band: "side roof beams", course: 0 });
  const beam4 = (a: V3, c: V3, y: number): void => {
    for (const [dy, dz] of [[0.25, -0.75], [0.25, 0.75], [2.25, -0.75], [2.25, 0.75]] as const) {
      const off: V3 = Math.abs(a[0] - c[0]) > Math.abs(a[2] - c[2]) ? [0, dy, dz] : [dz, dy, 0];
      chain(b, "M", [a[0] + off[0], y + off[1], a[2] + off[2]], [c[0] + off[0], y + off[1], c[2] + off[2]], { up: [0, 1, 0] });
    }
    // two diagonal assemblies per bay
    chain(b, "M", [a[0], y + 0.5, a[2]], [(a[0] + c[0]) / 2, y + 2, (a[2] + c[2]) / 2]);
    chain(b, "M", [c[0], y + 0.5, c[2]], [(a[0] + c[0]) / 2, y + 2, (a[2] + c[2]) / 2]);
  };
  for (const z of zs) {
    for (let k = 0; k + 1 < xs.length; k++) {
      const high = Math.abs(xs[k]!) < 20 && Math.abs(xs[k + 1]!) < 20;
      if (high) continue;
      beam4([xs[k]!, 0, z], [xs[k + 1]!, 0, z], yLow);
    }
  }
  for (const x of xs) {
    if (Math.abs(x) < 20) continue;
    for (let k = 0; k + 1 < zs.length; k++) beam4([x, 0, zs[k]!], [x, 0, zs[k + 1]!], yLow);
  }
  b.plan("beams", "side roof beams", 1);
  b.set({ stage: "beams", band: "central roof beams", course: 0 });
  for (const z of zs) beam4([-11.5, 0, z], [11.5, 0, z], yHigh);
  for (const x of [-11.5, 11.5]) for (let k = 0; k + 1 < zs.length; k++) beam4([x, 0, zs[k]!], [x, 0, zs[k + 1]!], yHigh);
  b.plan("beams", "central roof beams", 1);
  // roof decks: side halls (x from ±20 to ±72) and the raised centre (x in ±16), with plank shells
  b.set({ stage: "roof", band: "roof decking", course: 0 });
  for (const sx of [-1, 1]) {
    b.with({ tier: 2 }, () => deck(b, "M", sx * 46, yLow + 3, 0, 52, D - 4, "z"));
    b.shell([sx * 46, yLow + 2.4, 0], [26, 0.3, D / 2 - 2], "plank");
    b.box([sx * 46, yLow + 2, 0], [26, 1, D / 2 - 2]);
  }
  b.with({ tier: 2 }, () => deck(b, "M", 0, yHigh + 3, 0, 32, D - 4, "z"));
  b.shell([0, yHigh + 2.4, 0], [16, 0.3, D / 2 - 2], "plank");
  b.box([0, yHigh + 2, 0], [16, 1, D / 2 - 2]);
  b.plan("roof", "roof decking", 1);
  // clerestory: six M vertical bars per bay between the low and high roof levels, windows left open
  b.set({ stage: "details", band: "clerestory", course: 0 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k + 1 < zs.length; k++) {
      for (let j = 0; j < 6; j++) {
        const z = zs[k]! + ((j + 0.5) * (zs[k + 1]! - zs[k]!)) / 6;
        chain(b, "M", [sx * 15.5, yLow + 3, z], [sx * 15.5, yHigh + 0.5, z], { up: [1, 0, 0] });
      }
    }
  }
  b.plan("details", "clerestory", 1);
  b.feature("bundled lotus stems with open flower crowns on the central high columns", [11.5, top + 34, 8]);
  b.feature("closed bud capitals on the low side columns", [45, top + 26, 8]);
  b.feature("clerestory bars between the low and high roofs", [15.5, yLow + 6, 0]);

  b.entry("central", [0, top, -D / 2 - 26], [0, top, D / 2 - 4], 16, 20, true, "up the 16 m approach and along the 18 m central passage");
  b.entry("aisles", [-36, top, -D / 2 + 6], [-36, top, D / 2 - 6], 8, 18, false, "between side columns");
  b.entry("clerestory", [-30, yLow + 5, 0], [30, yLow + 5, 0], 8, 4.5, false, "flight through the clerestory band (narrow)");
  b.viewAt("ground", "ground", [0, top + 1.65, -D / 2 - 8], [0, top + 22, 0], "the approach facing the central hall");
  b.viewAt("interior", "interior", [3, top + 1.65, -16], [11, top + 34, 6], "between high columns, looking up to the open crowns");
  b.viewAt("high", "high", [80, 70, -90], [0, 20, 0], "over the roofs");
  b.viewAt("detail", "detail", [36, top + 1.65, 0], [45, top + 26, 8], "bud capital");
  b.safe("approach", [0, 0, -D / 2 - 30], 0);
  b.safe("hall", [0, top, 0], 0);
  b.safe("roof", [0, yHigh + 3, 0], 0);
}

// ================================================================= L03

/**
 * L03 Ridge Doric Temple, 96 × 184 × 52. Three-level platform, 46 outer
 * columns (8 × 17), Doric order, entablature with triglyphs and metopes,
 * cornice with dentil shadows, seventeen roof trusses and two pediments.
 */
export function L03(b: Builder): void {
  // platform 0–6: three 2 m bands, 96×184 / 92×180 / 88×176, four M frames per band, 8 m grid
  const y6 = platform(b, { w: 96, d: 184, bands: [0, 2, 4].map((inset) => ({ h: 2, inset })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", deckAxis: "x", band: "crepidoma" });
  // walkable approach: 6 m rise in 24 risers of 0.25 over 36 m, front and back
  approach(b, 0, 0, -92 - 36, 24, y6, 1, "front");
  approach(b, 0, 0, 92 + 36, 24, y6, -1, "back");
  b.revise({ item: "L03 platform approach", original: "three 2 m construction bands", revised: "front and rear flights of 24 risers of 0.25 m and 1.5 m treads, 24 m wide", reason: "a 2 m band is a construction band, not a stair riser (§7.2)", impact: "approaches extend 36 m beyond the 184 m envelope; the core bounds stay within it" });

  // 46 outer columns: 8 on each short side, 17 on each long side (corners shared)
  const W = 88 - 6.6; // column centre-line rectangle inside the top platform (columns 5.35 m wide at most)
  const Dd = 176 - 6.6;
  const xs: number[] = [];
  const zs: number[] = [];
  // corner contraction ~5 %: the end spans shrink, the adjoining ones absorb it
  const spans = (n: number, L: number): number[] => {
    const base = L / (n - 1);
    const end = base * 0.95;
    const inner = (L - 2 * end) / (n - 3);
    const out = [0];
    for (let k = 1; k < n; k++) out.push(out[k - 1]! + (k === 1 || k === n - 1 ? end : inner));
    return out.map((v) => v - L / 2);
  };
  xs.push(...spans(8, W));
  zs.push(...spans(17, Dd));
  const ring46: V3[] = [];
  for (const x of xs) ring46.push([x, 0, zs[0]!], [x, 0, zs[16]!]);
  for (let k = 1; k < 16; k++) ring46.push([xs[0]!, 0, zs[k]!], [xs[7]!, 0, zs[k]!]);
  if (ring46.length !== 46) throw new Error(`L03 column count ${ring46.length}`);
  b.plan("columns", "shaft", 7);
  b.plan("details", "capital", 10);
  b.revise({ item: "L03 Doric capital fill", original: "34–38 m capitals: six expanding rings of 32 D each, then three 6 m square abacus layers R(6,6,1,1)", revised: "each echinus course is a solid cushion band: its 32-segment outer ring stacked at the D section to fill the 0.42 m course plus one ring just inside it (the underside of the overhang); each abacus layer keeps its R(6,6,1,1) frame stacked to the 0.5 m layer; the core behind is the capital shade shell (inner rings and abacus decks hidden by the band, the next course and the architrave were removed 2026-11-04: 1,963 → 997 D per capital)", reason: "single 0.125 m rings 0.42 m apart and hollow square frames read as a see-through wire lampshade in the real viewport, failing Appendix C2 (capitals must cast readable shadows; outward-flaring support below a square abacus)", impact: "same 4 m capital height and 6 m abacus width (envelope unchanged); more D pieces per column (BOM); the capital reads as an echinus cushion under a solid slab and shadows the frieze" });
  ring46.forEach((p, k) => {
    b.at([p[0], y6, p[2]], 0, () => {
      b.set({ comp: `peristyle column ${k + 1}` });
      // seven 4 m segments: 20 outer ribs (M fillets, see revision) + 20 M ring ties + 80 D flute backs each; Ø 5.2 → 5.35 → 4.4
      doric(b, { y0: 0, segH: 4, segs: 7, radius: (kk) => [2.6, 2.66, 2.675, 2.62, 2.5, 2.38, 2.29, 2.2][kk]! }, { ribs: 20, ribStock: "M", backsPerFlute: 1, backStock: "D", fluteDepth: 0.3, ringSegments: 20, ringStock: "M" }, { rTop: 2.2, abacus: 6, echinusRings: 6, echinusSegments: 32, abacusLayers: 3, echinusStep: 0.42, abacusStep: 0.5 });
      b.footing([0, 0, 0]);
    });
  });
  // 12 smaller internal columns forming side aisles of the cella
  const cellaX = [-20, 20];
  const cellaZ = [-50, -30, -10, 10, 30, 50];
  for (const x of cellaX) {
    for (const z of cellaZ) {
      b.at([x, y6, z], 0, () => {
        b.set({ comp: "cella column" });
        b.set({ stage: "columns", band: "cella columns", course: 0 });
        doric(b, { y0: 0, segH: 4, segs: 6, radius: entasis(1.6, 1.3, 6, 0.06) }, { ribs: 20, ribStock: "D", backsPerFlute: 1, backStock: "D", fluteDepth: 0.15, ringSegments: 10, ringStock: "D" }, { rTop: 1.3, abacus: 3.6, echinusRings: 4, echinusSegments: 24, abacusLayers: 2, echinusStep: 0.3, abacusStep: 0.4 });
      });
    }
  }
  b.set({ comp: "entablature" });
  // column top: 6 + 28 = 34; capital to 38 (6 rings ×0.25 + 3 layers × 0.5 + necking = 3.06 → round to beam seat 38)
  const yBeam = y6 + 28 + 3.06;
  b.revise({ item: "L03 outer ribs", original: "20 B outer ribs per segment", revised: "20 M ribs per segment (0.5 m fillets)", reason: "twenty 1 m-wide B sections need 20 m of perimeter; a Ø 5.2 m shaft has 16.3 m, so B ribs would overlap into a smooth cylinder and leave no room for the flutes", impact: "same count and rhythm, true recessed flutes between ribs; the BOM shows M instead of B" });
  b.revise({ item: "L03 capital", original: "six expanding rings and three R(6,6,1,1) abacus layers in 34–38 m", revised: "six 32-D echinus rings at 0.42 m spacing and three D R(6,6) abacus frames at 0.5 m spacing, capital top 37.06 m", reason: "the rings and frames resolve to 3.06 m; a 0.94 m M bearing course closes to 38 m", impact: "the entablature still spans 38–44 m" });
  // entablature centre-line rectangle: the cornice's last projection lands on the 96 × 184 envelope
  const hw = 46.6;
  const hd = 90.6;
  // architrave + frieze 38–42: four M perimeter chain levels (with a bearing course at the seat)
  b.set({ stage: "beams", band: "architrave", course: 0 });
  rect(b, "M", 0, yBeam, 0, 2 * hw - 2, 2 * hd - 2, 2);
  for (let j = 0; j < 4; j++) {
    b.set({ course: 1 + j });
    rect(b, "M", 0, y6 + 32 + j * 0.5, 0, 2 * hw - 2, 2 * hd - 2, 1);
    rect(b, "M", 0, y6 + 32 + j * 0.5, 0, 2 * hw - 4, 2 * hd - 4, 1);
  }
  b.plan("beams", "architrave", 5);
  b.shell([0, y6 + 33, -hd + 1.5], [hw - 1, 1, 0.6], "plank");
  b.shell([0, y6 + 33, hd - 1.5], [hw - 1, 1, 0.6], "plank");
  b.shell([-hw + 1.5, y6 + 33, 0], [0.6, 1, hd - 1], "plank");
  b.shell([hw - 1.5, y6 + 33, 0], [0.6, 1, hd - 1], "plank");
  // frieze: per intercolumn bay two triglyph groups (3 × C(2,1) D each) and recessed metope frames 0.4 m behind
  b.set({ stage: "details", band: "frieze", course: 0 });
  const yF = y6 + 34;
  const frieze = (a: V3, c: V3, out: V3): void => {
    const bays = 2;
    for (let k = 0; k <= bays * 2; k++) {
      const f = k / (bays * 2);
      const p: V3 = [a[0] + (c[0] - a[0]) * f, 0, a[2] + (c[2] - a[2]) * f];
      if (k % 2 === 0) {
        // triglyph: three vertical D pairs (C(2,1) = 2 pieces each)
        for (const g of [-0.4, 0, 0.4]) {
          const t: V3 = [(c[0] - a[0]) / Math.hypot(c[0] - a[0], c[2] - a[2]), 0, (c[2] - a[2]) / Math.hypot(c[0] - a[0], c[2] - a[2])];
          chain(b, "D", [p[0] + t[0] * g + out[0] * 0.1, yF, p[2] + t[2] * g + out[2] * 0.1], [p[0] + t[0] * g + out[0] * 0.1, yF + 2, p[2] + t[2] * g + out[2] * 0.1], { up: out });
        }
      } else {
        // metope: a recessed square frame 0.4 m behind the triglyph plane
        const t: V3 = [(c[0] - a[0]) / Math.hypot(c[0] - a[0], c[2] - a[2]), 0, (c[2] - a[2]) / Math.hypot(c[0] - a[0], c[2] - a[2])];
        const q: V3 = [p[0] - out[0] * 0.4, 0, p[2] - out[2] * 0.4];
        chain(b, "D", [q[0] - t[0] * 0.9, yF + 0.2, q[2] - t[2] * 0.9], [q[0] + t[0] * 0.9, yF + 0.2, q[2] + t[2] * 0.9], { up: out });
        chain(b, "D", [q[0] - t[0] * 0.9, yF + 1.8, q[2] - t[2] * 0.9], [q[0] + t[0] * 0.9, yF + 1.8, q[2] + t[2] * 0.9], { up: out });
        chain(b, "D", [q[0] - t[0] * 0.9, yF + 0.2, q[2] - t[2] * 0.9], [q[0] - t[0] * 0.9, yF + 1.8, q[2] - t[2] * 0.9], { up: out });
        chain(b, "D", [q[0] + t[0] * 0.9, yF + 0.2, q[2] + t[2] * 0.9], [q[0] + t[0] * 0.9, yF + 1.8, q[2] + t[2] * 0.9], { up: out });
      }
    }
  };
  for (let k = 0; k + 1 < xs.length; k++) {
    frieze([xs[k]!, 0, -hd + 0.2], [xs[k + 1]!, 0, -hd + 0.2], [0, 0, -1]);
    frieze([xs[k]!, 0, hd - 0.2], [xs[k + 1]!, 0, hd - 0.2], [0, 0, 1]);
  }
  for (let k = 0; k + 1 < zs.length; k++) {
    frieze([-hw + 0.2, 0, zs[k]!], [-hw + 0.2, 0, zs[k + 1]!], [-1, 0, 0]);
    frieze([hw - 0.2, 0, zs[k]!], [hw - 0.2, 0, zs[k + 1]!], [1, 0, 0]);
  }
  b.plan("details", "frieze", 1);
  // cornice 42–44: four M frames, each projecting a further 0.35 m; dentils every 2 m
  b.set({ stage: "beams", band: "cornice", course: 0 });
  for (let j = 0; j < 4; j++) {
    b.set({ course: j });
    rect(b, "M", 0, y6 + 36 + j * 0.5, 0, 2 * hw + 0.7 * (j + 1), 2 * hd + 0.7 * (j + 1), 1);
  }
  b.plan("beams", "cornice", 4);
  b.set({ stage: "details", band: "dentils", course: 0 });
  const ox = hw + 0.5;
  const oz = hd + 0.5;
  for (let x = -hw; x <= hw + 0.01; x += 2) for (const z of [-oz, oz]) for (const dx of [-0.3, 0, 0.3]) chain(b, "D", [x + dx, y6 + 36 - 0.5, z], [x + dx, y6 + 36 + 0.4, z], { up: [0, 0, 1] });
  for (let z = -hd; z <= hd + 0.01; z += 2) for (const x of [-ox, ox]) for (const dz of [-0.3, 0, 0.3]) chain(b, "D", [x, y6 + 36 - 0.5, z + dz], [x, y6 + 36 + 0.4, z + dz], { up: [1, 0, 0] });
  b.plan("details", "dentils", 1);
  b.box([0, y6 + 34, 0], [hw + 1.5, 4, hd + 1.5]);
  // roof 44–52: 17 triangular trusses along the depth; the ridge runs along z
  pitchedRoof(b, { x0: -hw - 1, x1: hw + 1, z0: -hd, z1: hd, y0: y6 + 38, y1: y6 + 46, trusses: 17, chord: "M", web: "D", webs: 5, band: "roof", strips: 2 });
  // pediments: eight horizontal courses shortened to the triangle, recessed 0.6 m behind the raking cornice
  b.set({ stage: "details", band: "pediment", course: 0 });
  for (const sz of [-1, 1]) {
    for (let j = 0; j < 8; j++) {
      b.set({ course: j });
      const y = y6 + 38 + 0.5 + j;
      const half = (hw + 1) * (1 - (j + 0.5) / 8);
      if (half < 0.6) continue;
      chain(b, "M", [-half, y, sz * (hd - 0.6)], [half, y, sz * (hd - 0.6)], { up: [0, 1, 0] });
    }
    // raking cornice projecting in front, its top on the ridge line
    chain(b, "M", [-hw - 1.5, y6 + 38.2, sz * (hd + 0.4)], [0, y6 + 45.6, sz * (hd + 0.4)], { up: [0, 0, 1] });
    chain(b, "M", [hw + 1.5, y6 + 38.2, sz * (hd + 0.4)], [0, y6 + 45.6, sz * (hd + 0.4)], { up: [0, 0, 1] });
  }
  b.plan("details", "pediment", 8);
  b.feature("20 flutes with entasis on 46 peristyle columns", [xs[0]!, y6 + 10, zs[0]!]);
  b.feature("triglyph and metope rhythm in the frieze", [0, y6 + 35, -hd]);
  b.feature("triangular pediments with raking cornices", [0, y6 + 43, -hd]);

  b.entry("front", [0, 0, -92 - 40], [0, y6, 0], 12, 24, true, "up the front flight, between the two central front columns into the cella");
  b.entry("colonnade", [-hw - 2, y6, -60], [-hw - 2, y6, 60], 8, 20, false, "along the outer colonnade (outside the columns)");
  b.entry("back", [0, y6, 0], [0, 0, 92 + 40], 12, 24, true, "out through the rear front");
  b.viewAt("ground", "ground", [8, 1.65, -92 - 44], [0, 28, -90], "the front flight and pediment");
  b.viewAt("interior", "interior", [-30, y6 + 1.65, -40], [-hw + 2, y6 + 30, -50], "inside the colonnade looking up at the capitals");
  b.viewAt("high", "high", [-150, 110, -200], [0, 30, 0], "the whole temple on its ridge");
  b.viewAt("detail", "detail", [xs[1]! - 4, y6 + 1.65, zs[0]! - 7], [xs[1]!, y6 + 31, zs[0]!], "capital and frieze");
  b.safe("front", [0, 0, -92 - 42], 0);
  b.safe("cella", [0, y6, 0], 0);
  b.safe("roof-view", [0, y6, -hd + 6], Math.PI);
}

// ================================================================= L04

/**
 * L04 Volute Terrace Palace, 112 × 128 × 56. Main platform 8 m and side
 * platform 4 m; a 72 × 80 main hall with 18 B4 Ionic columns, a 32 × 48 side
 * porch with 10 shortened ones, a 12 m terrace between, two roof levels.
 */
export function L04(b: Builder): void {
  // plan: main platform on +x side, side platform on −x side, terrace between at the higher level
  const mainC: V3 = [16, 0, 0];
  const mainW = 80;
  const mainD = 128;
  const sideC: V3 = [-38, 0, -20];
  const sideW = 36;
  const sideD = 56;
  b.set({ comp: "main platform" });
  const yMain = platform(b, { cx: mainC[0], cz: mainC[2], w: mainW, d: mainD, bands: [0, 0.5, 1, 1.5].map((inset) => ({ h: 2, inset })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", band: "main terrace" });
  b.set({ comp: "side platform" });
  const ySide = platform(b, { cx: sideC[0], cz: sideC[2], w: sideW, d: sideD, bands: [0, 0.5].map((inset) => ({ h: 2, inset })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", band: "side terrace" });
  b.revise({ item: "L04 plan", original: "main hall 72 × 80, side porch 32 × 48, 12 m terrace", revised: "main platform 80 × 128 (hall 72 × 80 colonnade on it, the rest an open court), side platform 36 × 56 holding the 32 × 48 porch; a 12 m-wide flight links the 4 m and 8 m levels", reason: "112 × 128 envelope: 80 + 36 = 116 overlaps 4 m where the side terrace tucks under the main platform's edge", impact: "the court in front of the hall is the 'open connecting court'" });
  // walkable link between the levels and from the ground
  approach(b, sideC[0], 0, sideC[2] - sideD / 2 + 0.5 - 24, 12, ySide, 1, "porch");
  b.with({ comp: "approach link", stage: "base", band: "link flight", course: 0 }, () => {
    // 12 m wide terrace flight from the side porch level (4) to the main level (8): 16 risers along +x
    b.at([sideC[0] + sideW / 2 - 1, 0, sideC[2] + 10], -Math.PI / 2, () => {
      approach(b, 0, ySide, 0, 12, yMain - ySide, 1, "link");
    });
  });
  approach(b, mainC[0], 0, -mainD / 2 + 1.5 - 48, 24, yMain, 1, "main");

  // 18 main columns: six front, six rear, three more on each long side (explicit list, corners once)
  const hx = 32; // column centre-lines, 72 m hall outer = 64 + abacus 6 + margin
  const hz = 36;
  const cols: V3[] = [];
  for (let k = 0; k < 6; k++) {
    const x = -hx + (2 * hx * k) / 5;
    cols.push([x, 0, -hz], [x, 0, hz]);
  }
  for (const z of [-hz / 2, 0, hz / 2]) cols.push([-hx, 0, z], [hx, 0, z]);
  if (cols.length !== 18) throw new Error("L04 main column count");
  const hallZ = 10;
  b.plan("columns", "shaft", 8);
  cols.forEach((p, k) => {
    b.at([mainC[0] + p[0], yMain, hallZ + p[2]], 0, () => {
      b.set({ comp: `main ionic ${k + 1}` });
      ionicB4(b);
      b.footing([0, 0, 0]);
    });
  });
  // ten side-porch columns: five front, five rear on the side terrace, shaft shortened to six 3 m segments
  const side: V3[] = [];
  for (let k = 0; k < 5; k++) {
    const x = -12 + 6 * k;
    side.push([x, 0, -20], [x, 0, 20]);
  }
  side.forEach((p, k) => {
    b.at([sideC[0] + p[0], ySide, sideC[2] + p[2]], 0, () => {
      b.set({ comp: `porch ionic ${k + 1}` });
      ionicB4(b, { shaftSegs: 6 });
      b.footing([0, 0, 0]);
    });
  });
  b.revise({ item: "L04 Ionic recipe", original: "legacy B4: 224 M + 1,400 D per column (paper)", revised: "B4 generated: actual per-column counts in the BOM (base, shaft, neck, flare, volutes, abacus)", reason: "B4's counts were never generated; the generator expands the same rings, ribs and spirals and reports what it actually placed", impact: "see the generated BOM; the 3,306-piece offline sample is not used" });

  // entablatures: main 38–44 (three architrave bands projecting 0/0.25/0.5, frieze motif, four-layer cornice)
  const yMainTop = yMain + 30;
  b.set({ comp: "main entablature" });
  entablature(b, mainC[0], hallZ, yMainTop, 2 * hx + 6, 2 * hz + 6, "main");
  const ySideTop = ySide + 24;
  b.set({ comp: "porch entablature" });
  entablature(b, sideC[0], sideC[2], ySideTop, 24 + 5, 40 + 5, "porch");
  // roofs: main 44–56 nine M trusses; side 34–40 an M-grid porch roof
  b.set({ comp: "main roof" });
  pitchedRoof(b, { x0: mainC[0] - hx - 4, x1: mainC[0] + hx + 4, z0: hallZ - hz - 3, z1: hallZ + hz + 3, y0: yMainTop + 6, y1: yMainTop + 18, trusses: 9, chord: "M", web: "M", webs: 4, band: "main roof", strips: 2 });
  b.set({ comp: "porch roof", stage: "roof", band: "porch roof", course: 0 });
  floorGrid(b, "M", sideC[0], ySideTop + 6, sideC[2], 30, 46, 4);
  deck(b, "M", sideC[0], ySideTop + 6.5, sideC[2], 30, 46, "z");
  b.box([sideC[0], ySideTop + 5.8, sideC[2]], [15, 0.8, 23]);
  b.plan("roof", "porch roof", 1);
  b.feature("four mirrored volutes on every Ionic capital", [mainC[0] - hx, yMain + 28, hallZ - hz]);
  b.feature("two terrace levels with a 12 m connecting flight", [sideC[0] + sideW / 2, 6, sideC[2] + 10]);
  b.feature("three-band projecting architrave", [mainC[0], yMainTop + 1, hallZ - hz - 3]);

  b.entry("porch", [sideC[0], 0, sideC[2] - sideD / 2 - 26], [sideC[0], ySide, sideC[2]], 12, 18, true, "up to the low porch");
  b.entry("link", [sideC[0], ySide, sideC[2] + 10], [mainC[0] - 20, yMain, sideC[2] + 10], 12, 18, true, "across the terrace flight to the high court");
  b.entry("hall", [mainC[0], yMain, -mainD / 2 + 4], [mainC[0], yMain, hallZ], 12, 24, true, "from the court between the front columns into the hall");
  b.viewAt("ground", "ground", [sideC[0] + 4, 1.65, sideC[2] - sideD / 2 - 30], [mainC[0], 30, hallZ], "the two terraces from the meadow");
  b.viewAt("interior", "interior", [mainC[0] - 20, yMain + 1.65, hallZ - 30], [mainC[0] - hx, yMain + 29, hallZ - hz], "beside a scroll capital");
  b.viewAt("high", "high", [120, 90, -130], [0, 30, 0], "both roof levels");
  b.viewAt("detail", "detail", [mainC[0] - hx + 5, yMain + 26, hallZ - hz - 6], [mainC[0] - hx, yMain + 29, hallZ - hz], "an Ionic capital at volute height (flight)");
  b.safe("porch", [sideC[0], ySide, sideC[2]], 0);
  b.safe("court", [mainC[0], yMain, -40], 0);
}

/** Three architrave bands (four M chains each, projecting 0/0.25/0.5), a frieze motif every 2 m, a four-layer cornice. */
function entablature(b: Builder, cx: number, cz: number, y: number, w: number, d: number, name: string): void {
  for (let band = 0; band < 3; band++) {
    b.set({ stage: "beams", band: `${name} architrave`, course: band });
    const grow = band * 0.5;
    for (let j = 0; j < 4; j++) rect(b, "M", cx, y + band * 1.0 + (j % 2) * 0.5, cz, w + grow - (j >> 1) * 1.0, d + grow - (j >> 1) * 1.0, 1);
  }
  b.plan("beams", `${name} architrave`, 3);
  // frieze: a four-D angular motif every 2 m
  b.set({ stage: "details", band: `${name} frieze`, course: 0 });
  const yf = y + 3.2;
  const edge = (a: V3, c: V3): void => {
    const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const t: V3 = [(c[0] - a[0]) / l, 0, (c[2] - a[2]) / l];
    for (let s = 1; s < l; s += 2) {
      const p: V3 = [a[0] + t[0] * s, yf, a[2] + t[2] * s];
      chain(b, "D", p, [p[0] + t[0] * 0.7, yf + 0.7, p[2] + t[2] * 0.7]);
      chain(b, "D", [p[0] + t[0] * 0.7, yf + 0.7, p[2] + t[2] * 0.7], [p[0] + t[0] * 1.4, yf, p[2] + t[2] * 1.4]);
      chain(b, "D", [p[0], yf + 1.4, p[2]], [p[0] + t[0] * 0.7, yf + 0.7, p[2] + t[2] * 0.7]);
      chain(b, "D", [p[0] + t[0] * 0.7, yf + 0.7, p[2] + t[2] * 0.7], [p[0] + t[0] * 1.4, yf + 1.4, p[2] + t[2] * 1.4]);
    }
  };
  const hw = w / 2 + 0.35;
  const hd = d / 2 + 0.35;
  edge([cx - hw, 0, cz - hd], [cx + hw, 0, cz - hd]);
  edge([cx + hw, 0, cz + hd], [cx - hw, 0, cz + hd]);
  edge([cx - hw, 0, cz + hd], [cx - hw, 0, cz - hd]);
  edge([cx + hw, 0, cz - hd], [cx + hw, 0, cz + hd]);
  b.plan("details", `${name} frieze`, 1);
  b.shell([cx, y + 2.5, cz], [w / 2 - 0.3, 2.4, d / 2 - 0.3], "plank");
  for (let j = 0; j < 4; j++) {
    b.set({ stage: "beams", band: `${name} cornice`, course: j });
    rect(b, "M", cx, y + 5 + j * 0.5, cz, w + 1 + j * 0.6, d + 1 + j * 0.6, 1);
  }
  b.plan("beams", `${name} cornice`, 4);
  b.box([cx, y + 3, cz], [w / 2 + 1.5, 3, d / 2 + 1.5]);
}

export const _unused = { triTruss, ring, sec };
