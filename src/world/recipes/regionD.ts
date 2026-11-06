// Region D — Industrial Gorge: L13 Lattice Conservatory, L14 Four-Leg Wind
// Tower, L15 Setback Crown, L16 Curved Gorge Dam (with the mandatory fin
// spillway of main prompt §7.4).
import { add, Builder, lerp3, norm, scale, sub, type V3 } from "../core.ts";
import { arch, chain, deck, floorGrid, rect, ring, sec, trussFace, trussQuad, yawForX } from "../parts.ts";
import { approach, cone, ngon, platform, polyShaft, rails } from "./common.ts";

// ================================================================= L13

/**
 * L13 Lattice Conservatory, 320 × 160 × 96. A 20 × 10 grid of 16 m bays:
 * low wings to 28, the central four bay rows rising to 52, a transverse
 * barrel vault (span 56, rise 28) across the middle, and a lantern ridge.
 */
export function L13(b: Builder): void {
  b.set({ comp: "base" });
  const y4 = platform(b, { w: 320, d: 160, bands: [0, 0.25, 0.5, 0.75].map((inset) => ({ h: 1, inset })), frameStock: "M", framesPerBand: 2, gridP: 16, deckStock: null, band: "base" });
  b.set({ stage: "base", band: "floor", course: 0 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, y4 + 0.5, 0, 318, 158, "x"));
  b.plan("base", "floor", 1);
  // long axis x (320), short axis z (160). Nodes at x = −160 + 16i (i = 0…20), z = −80 + 16j (j = 0…10)
  const X = (i: number): number => -160 + 16 * i;
  const Z = (j: number): number => -80 + 16 * j;
  // the central four bay rows (along x) are j = 3…7 (z −32…+32); the transept crosses at i = 8…12 (x −32…+32)
  const highRow = (j: number): boolean => j >= 3 && j <= 7;
  const inTransept = (i: number): boolean => i >= 9 && i <= 11;
  // removed nodes: interior nodes inside the transept span (long-span framing replaces them), and the end entrances
  const removed = (i: number, j: number): boolean => (inTransept(i) && j >= 4 && j <= 6) || ((i === 0 || i === 20) && (j === 4 || j === 5 || j === 6));
  b.revise({ item: "L13 removed nodes", original: "nominally 21 × 11 nodes; list nodes removed for the central passage", revised: "removed: nodes (i = 9…11, j = 4…6) under the transept vault, replaced by the vault's 56 m arches; nodes (i = 0 and 20, j = 4…6) at both ends, leaving 48 m entrances (≥ 32 m)", reason: "the passage and the transept need clear floor", impact: "231 − 15 = 216 columns" });
  let cols = 0;
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 10; j++) {
      if (removed(i, j)) continue;
      cols++;
      const top = highRow(j) && !(i === 0 || i === 20) ? 52 : 28;
      b.at([X(i), y4, Z(j)], 0, () => {
        b.set({ comp: `node ${i}.${j}`, stage: "columns", band: "lower frame" });
        // six 4 m rises of four M bundle members (to 28)
        for (let s = 0; s < 6; s++) {
          b.set({ course: s });
          for (const [ox, oz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]] as const) chain(b, "M", [ox, s * 4, oz], [ox, s * 4 + 4, oz], { up: [0, 0, 1] });
        }
        if (top > 28) {
          b.set({ stage: "columns", band: "high hall" });
          for (let s = 0; s < 6; s++) {
            b.set({ course: s });
            for (const [ox, oz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]] as const) chain(b, "M", [ox, 24 + s * 4, oz], [ox, 28 + s * 4, oz], { up: [0, 0, 1] });
          }
        }
        b.box([0, (top - 4) / 2, 0], [0.5, (top - 4) / 2, 0.5]);
        b.footing([0, 0, 0]);
      });
    }
  }
  b.plan("columns", "lower frame", 6);
  b.plan("columns", "high hall", 6);
  // y = 28 chord beams: upper/lower M chords with four web panels per 16 m bay, both directions
  b.set({ comp: "frame", stage: "beams", band: "chord beams", course: 0 });
  const yC = y4 + 24;
  const beamX = (i: number, j: number): void => {
    // along x from node (i, j) to (i + 1, j)
    const a: V3 = [X(i), 0, Z(j)];
    for (const y of [yC - 1.75, yC - 0.25]) chain(b, "M", [a[0], y, a[2]], [a[0] + 16, y, a[2]], { up: [0, 1, 0] });
    for (let w = 0; w < 4; w++) chain(b, "D", [a[0] + w * 4, yC - 1.5, a[2]], [a[0] + w * 4 + 4, yC - 0.5, a[2]]);
  };
  const beamZ = (i: number, j: number): void => {
    const a: V3 = [X(i), 0, Z(j)];
    for (const y of [yC - 2.25, yC - 0.75]) chain(b, "M", [a[0], y, a[2]], [a[0], y, a[2] + 16], { up: [0, 1, 0] });
    for (let w = 0; w < 4; w++) chain(b, "D", [a[0], yC - 2, a[2] + w * 4], [a[0], yC - 1, a[2] + w * 4 + 4]);
  };
  for (let i = 0; i < 20; i++) for (let j = 0; j <= 10; j++) {
    if (highRow(j) && j > 3 && j < 7) continue; // inside the high hall the 28 m beams are only at its edge rows
    if (inTransept(i) && j >= 3 && j <= 7) continue;
    beamX(i, j);
  }
  for (let i = 0; i <= 20; i++) for (let j = 0; j < 10; j++) {
    if (j >= 3 && j < 7 && !(i === 0 || i === 20)) continue;
    beamZ(i, j);
  }
  b.plan("beams", "chord beams", 1);
  // tall frames: F(16, 8, 4, 1) in three height bands along the high hall's long edges (rows j = 3 and 7)
  b.set({ stage: "beams", band: "tall frames" });
  for (const j of [3, 7]) {
    for (let i = 0; i < 20; i++) {
      if (inTransept(i)) continue;
      for (let band = 0; band < 3; band++) {
        b.set({ course: band });
        trussFace(b, "M", X(i), y4 + 28 + band * 8, X(i) + 16, y4 + 36 + band * 8, Z(j), { bottom: band === 0, sides: false });
      }
    }
  }
  b.plan("beams", "tall frames", 3);
  // high-hall roof beams at 52 across z (span 64) as trusses every 16 m, and 8 m edge galleries at 36
  b.set({ stage: "roof", band: "high roof trusses", course: 0 });
  for (let i = 0; i <= 20; i++) {
    if (inTransept(i)) continue;
    trussFace(b, "M", Z(3), y4 + 48, Z(7), y4 + 52, 0, { bottom: true });
    b.at([X(i), 0, 0], Math.PI / 2, () => trussFace(b, "M", -32, y4 + 48, 32, y4 + 52, 0));
  }
  b.plan("roof", "high roof trusses", 1);
  b.set({ stage: "beams", band: "galleries", course: 0 });
  for (const sz of [-1, 1]) {
    b.with({ tier: 2 }, () => deck(b, "M", -96, y4 + 36.5, sz * 28, 128, 8, "x"));
    b.with({ tier: 2 }, () => deck(b, "M", 96, y4 + 36.5, sz * 28, 128, 8, "x"));
    b.box([-96, y4 + 36, sz * 28], [64, 0.5, 4]);
    b.box([96, y4 + 36, sz * 28], [64, 0.5, 4]);
    rails(b, [[-160, 0, sz * 24], [-32, 0, sz * 24]], y4 + 36.5);
    rails(b, [[32, 0, sz * 24], [160, 0, sz * 24]], y4 + 36.5);
  }
  b.plan("beams", "galleries", 1);
  // wing roofs: each 16 m bay gets four sawtooth/folded roof groups, D glazing bars every 2 m, limited translucent infill
  b.set({ stage: "roof", band: "wing roofs", course: 0 });
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 10; j++) {
      if (j >= 3 && j < 7) continue;
      for (let g = 0; g < 4; g++) {
        const x0 = X(i) + g * 4;
        chain(b, "M", [x0, y4 + 24, Z(j)], [x0 + 2, y4 + 26, Z(j)], { up: [0, 0, 1] });
        chain(b, "M", [x0, y4 + 24, Z(j) + 16], [x0 + 2, y4 + 26, Z(j) + 16], { up: [0, 0, 1] });
        chain(b, "M", [x0 + 2, y4 + 26, Z(j)], [x0 + 2, y4 + 26, Z(j) + 16], { up: [0, 1, 0] });
        b.with({ tier: 2 }, () => {
          for (let z = 2; z < 16; z += 2) chain(b, "D", [x0, y4 + 24.1, Z(j) + z], [x0 + 2, y4 + 26.1, Z(j) + z], { up: [0, 0, 1] });
        });
        b.shell([x0 + 1, y4 + 25, Z(j) + 8], [1.4, 0.03, 8], "glass", { roll: Math.PI / 4 });
      }
    }
  }
  b.box([-96, y4 + 25, -56], [64, 1, 24]);
  b.box([96, y4 + 25, -56], [64, 1, 24]);
  b.box([-96, y4 + 25, 56], [64, 1, 24]);
  b.box([96, y4 + 25, 56], [64, 1, 24]);
  for (const sx of [-1, 1]) b.box([sx * 96, y4 + 52.5, 0], [64, 0.5, 32]);
  b.plan("roof", "wing roofs", 1);
  // transept barrel vault 52–80 across the middle (axis along z), span 56, ribs every 8 m (21 ribs over 160 m)
  b.set({ comp: "transept", stage: "arches", band: "transept ribs", course: 0 });
  for (let k = 0; k <= 20; k++) {
    b.set({ course: k });
    const z = -80 + 8 * k;
    b.at([0, 52 - 1.5, z], 0, () => {
      const r = arch(b, 56, 28, 1.5, 1, 4, { tieStock: "D", collide: false, shell: false });
      // D ties every 4 m along each rib
      for (let t = 0; t < r.N; t += 2) {
        const p = r.shape.at(t / r.N);
        chain(b, "D", [p.inner[0], p.inner[1], 0], [p.outer[0], p.outer[1], 0]);
      }
    });
  }
  b.plan("arches", "transept ribs", 21);
  // purlins along the vault and glass infill
  b.set({ stage: "roof", band: "vault purlins", course: 0 });
  for (let k = 0; k <= 16; k++) {
    const th = Math.PI * (k / 16);
    const x = 28.8 * Math.cos(th);
    const y = 50.5 + 28.8 * Math.sin(th);
    chain(b, "M", [x, y, -80], [x, y, 80], { up: [Math.cos(th), Math.sin(th), 0] });
    if (k < 16) {
      const th1 = Math.PI * ((k + 1) / 16);
      b.shell([(x + 28.8 * Math.cos(th1)) / 2, (y + 50.5 + 28.8 * Math.sin(th1)) / 2, 0], [2.85, 0.03, 80], "glass", { roll: (th + th1) / 2 - Math.PI / 2 });
      b.box([(x + 28.8 * Math.cos(th1)) / 2 * 1.03, (y + 50.5 + 28.8 * Math.sin(th1)) / 2, 0], [2.95, 0.6, 80], 0);
    }
  }
  b.plan("roof", "vault purlins", 1);
  // semicircular end windows: 32 radial D chains each
  b.set({ stage: "details", band: "vault end windows", course: 0 });
  for (const z of [-80, 80]) for (let k = 0; k < 32; k++) {
    const th = Math.PI * ((k + 0.5) / 32);
    chain(b, "D", [3 * Math.cos(th), 50.5 + 3 * Math.sin(th), z], [27 * Math.cos(th), 50.5 + 27 * Math.sin(th), z], { up: [0, 0, 1] });
  }
  b.plan("details", "vault end windows", 1);
  // roof lantern 80–96: a clerestory ridge 16 m high, 64 m long along x on the high hall, nine frames
  b.set({ comp: "lantern", stage: "roof", band: "lantern", course: 0 });
  // the lantern ridge rides the transept vault's crown (80 → 96), 64 m long along the vault axis (z)
  const yl = 80;
  for (let k = 0; k < 9; k++) {
    const z = -32 + 8 * k;
    for (const sx of [-1, 1]) {
      chain(b, "M", [sx * 6, yl - 1, z], [sx * 6, yl + 11, z], { up: [1, 0, 0] });
      chain(b, "M", [sx * 6, yl + 11, z], [0, yl + 16 - 0.25, z], { up: [1, 0, 0] });
      for (const t of [0.25, 0.75]) chain(b, "D", [sx * 6, yl + 12 * t - 1, z], [sx * 6, yl + 12 * t + 1, z + (k < 8 ? 4 : -4)], { up: [1, 0, 0] });
    }
  }
  b.with({ tier: 2 }, () => {
    for (let z = -32; z <= 32; z += 2) for (const sx of [-1, 1]) chain(b, "D", [sx * 6, yl, z], [sx * 6, yl + 10, z], { up: [1, 0, 0] });
  });
  for (const sx of [-1, 1]) b.shell([sx * 6, yl + 5, 0], [0.03, 5, 32], "glass");
  b.plan("roof", "lantern", 1);
  b.box([0, yl + 13, 0], [6, 3, 32]);
  b.set({ comp: "main" });
  b.feature(`modular 16 m bays (${cols} columns) and folded glazed wing roofs`, [-100, 30, -60]);
  b.feature("a 56 m transverse barrel vault with radial end windows", [0, 70, -80]);
  b.feature("a high central hall with edge galleries", [-96, 40, 28]);
  b.entry("long", [-190, 0, 8], [190, 0, 8], 14, 20, true, "through the 48 m end entrance, down the high hall between column rows and under the transept");
  b.entry("gallery", [-150, y4 + 36.5, 28], [-40, y4 + 36.5, 28], 6, 10, false, "along an upper edge gallery");
  b.viewAt("ground", "ground", [-196, 1.65, 6], [-120, 30, 0], "the end entrance into the long hall");
  b.viewAt("interior", "interior", [6, y4 + 1.65, -40], [0, y4 + 70, 10], "under the transept vault");
  // over the open valley side (the old eye at local (−200, 150, −260) stood behind the gorge's 200 m rim, which hid
  // 82 % of the hall; viewcheck.ts terrainHidden)
  b.viewAt("high", "high", [-200, 150, 260], [0, 40, 0], "the whole broad conservatory over the valley");
  b.viewAt("detail", "detail", [-100, y4 + 37 + 1.65, 26], [-112, y4 + 50, 32], "high-hall frames from the gallery");
  b.safe("west", [-190, 0, 8], -Math.PI / 2);
  b.safe("hall", [-88, y4 + 0.5, 8], -Math.PI / 2);
  b.safe("gallery", [-120, y4 + 36.5, 28], -Math.PI / 2);
}

// ================================================================= L14

/**
 * L14 Four-Leg Wind Tower, 100 × 100 × 188. Four curved tapering legs on
 * 18 m pads, lower arches between them, a 56 m platform at 56–64, a 32 m
 * platform at 104–112, a converging upper shaft and a summit ring and spire.
 */
export function L14(b: Builder): void {
  // leg centre radius (diagonal distance from the axis) at segment boundaries, 8 → 56 m
  const rLow = [42, 39, 35, 30, 25, 20, 16];
  const secLow = (k: number): number => 12 - (4 * k) / 6;
  // feet: four 18 × 18 pads, four 2 m bands (four M perimeter frames and a 4 × 4 grid each)
  const legDir = (k: number): [number, number] => [Math.cos(Math.PI / 4 + (k * Math.PI) / 2), Math.sin(Math.PI / 4 + (k * Math.PI) / 2)];
  b.revise({ item: "L14 foot placement", original: "100 × 100 envelope, four 18 m pads, leg centre radius 42 at the base", revised: "the leg centre radius 42/39/35/30/25/20/16 is measured from each vertical mid-plane (|x| = |z| = r); pads 18 × 18 centred at |x| = |z| = 41; the 12 m leg section at r = 42 reaches ±48, pads ±50", reason: "read as a diagonal distance the legs would stand only 30 m off-axis and the tower would be 75 m wide, not 100", impact: "the legs spread wider, so the lower arches span about 60 m between leg faces" });
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = legDir(k);
    const c: V3 = [dx * 41 * Math.SQRT2, 0, dz * 41 * Math.SQRT2];
    b.set({ comp: `foot ${k + 1}` });
    for (let band = 0; band < 4; band++) {
      b.set({ stage: "base", band: "feet", course: band });
      for (let f = 0; f < 4; f++) rect(b, "M", c[0], band * 2 + f * 0.5, c[2], 18, 18, 1);
      b.with({ tier: 2 }, () => floorGrid(b, "M", c[0], band * 2 + 2, c[2], 17, 17, 4.25));
    }
    b.box([c[0], 4, c[2]], [9, 4, 9]);
    b.footing(c);
  }
  b.plan("base", "feet", 4);
  // a leg is a square-section lattice whose centre follows a curve and whose section narrows
  // the table's "centre radius" is read as each leg centre's distance from the two vertical mid-planes
  // (|x| = |z| = r), so the 42 m base value with a 12 m section reaches the 100 m envelope
  const legCentre = (k: number, r: number, y: number): V3 => {
    const [dx, dz] = legDir(k);
    return [dx * r * Math.SQRT2, y, dz * r * Math.SQRT2];
  };
  const legCorners = (k: number, r: number, y: number, s: number): V3[] => {
    // the section is aligned to x and z
    const c = legCentre(k, r, y);
    const h = s / 2;
    return [
      [c[0] - h, y, c[2] - h],
      [c[0] + h, y, c[2] - h],
      [c[0] + h, y, c[2] + h],
      [c[0] - h, y, c[2] + h],
    ];
  };
  for (let k = 0; k < 4; k++) {
    b.set({ comp: `leg ${k + 1}` });
    for (let seg = 0; seg < 6; seg++) {
      b.set({ stage: "columns", band: "lower legs", course: seg });
      const ya = 8 + seg * 8;
      const yb = ya + 8;
      const A = legCorners(k, rLow[seg]!, ya, secLow(seg));
      const B2 = legCorners(k, rLow[seg + 1]!, yb, secLow(seg + 1));
      // four corners × two B chord chains
      for (let i = 0; i < 4; i++) {
        const out = norm(sub(A[i]!, legCentre(k, rLow[seg]!, ya)));
        chain(b, "B", A[i]!, B2[i]!, { mode: "overhang" });
        chain(b, "B", add(A[i]!, scale(out, -1.02)), add(B2[i]!, scale(out, -1.02)), { mode: "overhang" });
      }
      // one F(sectionWidth, slopingHeight, 4, 1) on each face
      for (let i = 0; i < 4; i++) trussQuad(b, "M", A[i]!, A[(i + 1) % 4]!, B2[i]!, B2[(i + 1) % 4]!, { bottom: seg === 0, sides: false, offset: [0, 0, 0] });
      const cm = lerp3(legCentre(k, rLow[seg]!, ya), legCentre(k, rLow[seg + 1]!, yb), 0.5);
      b.box(cm, [secLow(seg) / 2 - 0.5, 4, secLow(seg) / 2 - 0.5]);
    }
  }
  b.plan("columns", "lower legs", 6);
  // four lower connecting arches between neighbouring legs (A(56, 20, 2, 4, 4)), springing at 24, preserving the centre
  b.set({ comp: "lower arches", stage: "arches", band: "lower arches", course: 0 });
  for (const [x, z, yaw] of [[0, -36, 0], [36, 0, Math.PI / 2], [0, 36, 0], [-36, 0, Math.PI / 2]] as const) {
    b.at([x, 24 + 8, z], yaw, () => arch(b, 56, 20, 2, 4, 4, { tieStock: "M" }));
  }
  b.plan("arches", "lower arches", 1);
  // first platform 56–64: 56 × 56, four 2 m frame bands, R(56,56,4,4) + 7 × 7 M grid, central 20 × 20 aperture
  b.set({ comp: "first platform" });
  for (let band = 0; band < 4; band++) {
    b.set({ stage: "beams", band: "first platform", course: band });
    rect(b, "M", 0, 56 + band * 2, 0, 56, 56, 4);
    if (band === 3) {
      for (let i = 0; i <= 7; i++) {
        const t = -28 + 8 * i;
        chain(b, "M", [-28, 63.75, t], [-10, 63.75, t], { up: [0, 1, 0] });
        chain(b, "M", [10, 63.75, t], [28, 63.75, t], { up: [0, 1, 0] });
        if (Math.abs(t) > 10) chain(b, "M", [-10, 63.75, t], [10, 63.75, t], { up: [0, 1, 0] });
        chain(b, "M", [t, 63.25, -28], [t, 63.25, -10], { up: [0, 1, 0] });
        chain(b, "M", [t, 63.25, 10], [t, 63.25, 28], { up: [0, 1, 0] });
        if (Math.abs(t) > 10) chain(b, "M", [t, 63.25, -10], [t, 63.25, 10], { up: [0, 1, 0] });
      }
      b.with({ tier: 2 }, () => deck(b, "M", 0, 64.5, 0, 55, 55, "x", [{ x0: -10, x1: 10, z0: -10, z1: 10 }]));
    }
  }
  b.plan("beams", "first platform", 4);
  for (const [x, z, hx, hz] of [[0, -19, 28, 9], [0, 19, 28, 9], [-19, 0, 9, 10], [19, 0, 9, 10]] as const) b.box([x, 60, z], [hx, 4, hz]);
  b.set({ stage: "details", band: "platform rails", course: 0 });
  rails(b, [[-28, 0, -28], [-28, 0, 28], [28, 0, 28], [28, 0, -28]], 64.5, true);
  rails(b, [[-10, 0, -10], [-10, 0, 10], [10, 0, 10], [10, 0, -10]], 64.5, true);
  // middle segments 64–104: five 8 m rises, leg centre radius 16 → 8, X-braced faces (two vertical panels per face)
  const rMid = [16, 14.4, 12.8, 11.2, 9.6, 8];
  const secMid = (k: number): number => 8 - (2 * k) / 5;
  for (let k = 0; k < 4; k++) {
    b.set({ comp: `leg ${k + 1}` });
    for (let seg = 0; seg < 5; seg++) {
      b.set({ stage: "columns", band: "middle legs", course: seg });
      const ya = 64 + seg * 8;
      const yb = ya + 8;
      const A = legCorners(k, rMid[seg]!, ya, secMid(seg));
      const B2 = legCorners(k, rMid[seg + 1]!, yb, secMid(seg + 1));
      for (let i = 0; i < 4; i++) chain(b, "B", A[i]!, B2[i]!, { mode: "overhang" });
      for (let i = 0; i < 4; i++) {
        const a0 = A[i]!;
        const a1 = A[(i + 1) % 4]!;
        const b0 = B2[i]!;
        const b1 = B2[(i + 1) % 4]!;
        const am = lerp3(a0, a1, 0.5);
        const bm = lerp3(b0, b1, 0.5);
        trussQuad(b, "M", a0, am, b0, bm, { bottom: false, sides: false });
        trussQuad(b, "M", am, a1, bm, b1, { bottom: false, sides: false });
        chain(b, "M", am, bm);
      }
      b.box(lerp3(legCentre(k, rMid[seg]!, ya), legCentre(k, rMid[seg + 1]!, yb), 0.5), [secMid(seg) / 2 - 0.3, 4, secMid(seg) / 2 - 0.3]);
    }
  }
  b.plan("columns", "middle legs", 5);
  // second platform 104–112: 32 × 32, four bands, 12 × 12 aperture, corners cantilever 2 m with bracket groups
  b.set({ comp: "second platform" });
  for (let band = 0; band < 4; band++) {
    b.set({ stage: "beams", band: "second platform", course: band });
    rect(b, "M", 0, 104 + band * 2, 0, 32, 32, 4);
  }
  b.with({ tier: 2 }, () => deck(b, "M", 0, 112.5, 0, 35, 35, "x", [{ x0: -6, x1: 6, z0: -6, z1: 6 }]));
  b.set({ stage: "details", band: "brackets", course: 0 });
  for (const [ax, az, nx, nz] of [[0, -16, 0, -1], [0, 16, 0, 1], [-16, 0, -1, 0], [16, 0, 1, 0]] as const) {
    for (let g = 0; g < 8; g++) {
      const t = -14 + 4 * g;
      const base: V3 = [ax + (nz !== 0 ? t : 0), 108, az + (nx !== 0 ? t : 0)];
      for (const o of [-0.5, 0, 0.5]) chain(b, "M", add(base, nz !== 0 ? [o, 0, 0] : [0, 0, o]), add(base, [nx * 2 + (nz !== 0 ? o : 0), 4, nz * 2 + (nx !== 0 ? o : 0)]));
    }
  }
  b.plan("beams", "second platform", 4);
  for (const [x, z, hx, hz] of [[0, -11.5, 17.5, 5.5], [0, 11.5, 17.5, 5.5], [-11.5, 0, 5.5, 6], [11.5, 0, 5.5, 6]] as const) b.box([x, 108, z], [hx, 4, hz]);
  b.set({ stage: "details", band: "platform rails" });
  rails(b, [[-17.5, 0, -17.5], [-17.5, 0, 17.5], [17.5, 0, 17.5], [17.5, 0, -17.5]], 112.5, true);
  // upper shaft 112–176: eight 8 m rises, section 24 → 8, four corners × four B chains, two F panels per face, M rings at mid and top
  b.set({ comp: "upper shaft" });
  for (let seg = 0; seg < 8; seg++) {
    b.set({ stage: "columns", band: "upper shaft", course: seg });
    const ya = 112 + seg * 8;
    const yb = ya + 8;
    const sa = 24 - 2 * seg;
    const sb = sa - 2;
    const ca = ngon(4, (sa / 2) * Math.SQRT2, ya, 0, 0, Math.PI / 4);
    const cb = ngon(4, (sb / 2) * Math.SQRT2, yb, 0, 0, Math.PI / 4);
    for (let i = 0; i < 4; i++) {
      const inward = norm([-ca[i]![0], 0, -ca[i]![2]]);
      for (const [o1, o2] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const tan = norm(sub(ca[(i + 1) % 4]!, ca[i]!));
        const off = add(scale(inward, o1 * 1.02), scale(tan, o2 * 1.02));
        chain(b, "B", add(ca[i]!, off), add(cb[i]!, off), { mode: "overhang" });
      }
      const am = lerp3(ca[i]!, ca[(i + 1) % 4]!, 0.5);
      const bm = lerp3(cb[i]!, cb[(i + 1) % 4]!, 0.5);
      trussQuad(b, "M", ca[i]!, am, cb[i]!, bm, { bottom: false, sides: false });
      trussQuad(b, "M", am, ca[(i + 1) % 4]!, bm, cb[(i + 1) % 4]!, { bottom: false, sides: false });
    }
    ring(b, "M", 0, ya + 4, 0, ((sa + sb) / 4) * Math.SQRT2, 4, 1, { phase: Math.PI / 4 });
    ring(b, "M", 0, yb - 0.25, 0, (sb / 2) * Math.SQRT2, 4, 1, { phase: Math.PI / 4 });
    // hollow shaft collision: four wall boxes so the shaft can be flown up inside
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) b.box([nx * ((sa + sb) / 4), ya + 4, nz * ((sa + sb) / 4)], [nx ? 0.6 : (sa + sb) / 4, 4, nz ? 0.6 : (sa + sb) / 4]);
  }
  b.plan("columns", "upper shaft", 8);
  // summit 176–188: octagonal observation ring Ø 12, 4 m high, then an 8 m spire of eight M ribs and four D rings
  b.set({ comp: "summit", stage: "roof", band: "summit", course: 0 });
  const oct = ngon(8, 6, 176, 0, 0, Math.PI / 8);
  for (const v of oct) chain(b, "M", v, add(v, [0, 4, 0]), { up: [0, 0, 1] });
  ring(b, "M", 0, 176.25, 0, 6, 8, 2, { phase: Math.PI / 8 });
  ring(b, "M", 0, 179.75, 0, 6, 8, 1, { phase: Math.PI / 8 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, 176.5, 0, 8, 8, "x"));
  b.box([0, 176, 0], [5, 0.5, 5]);
  b.set({ course: 1 });
  cone(b, 0, 0, 180, 4, 8, 8, 4, { ribStock: "M", ringStock: "D", band: "summit spire" });
  b.plan("roof", "summit", 1);
  b.cyl([0, 184, 0], 1.5, 4);
  b.set({ comp: "main" });
  b.feature("four curved tapering lattice legs", [30, 30, 30]);
  b.feature("two platforms with central apertures", [0, 64, 0]);
  b.feature("converging upper shaft and summit ring", [0, 176, 0]);
  b.entry("legs", [0, 0, -60], [0, 0, 60], 30, 24, true, "walk between the legs under the lower arches");
  b.entry("apertures", [0, 20, 0], [0, 170, 0], 7, 7, true, "fly up through the 20 m and 12 m platform apertures and inside the upper shaft");
  b.viewAt("ground", "ground", [4, 1.65, -10], [0, 120, 0], "standing at the centre looking up through both apertures");
  b.viewAt("interior", "interior", [0, 65.5 + 1.65, -16], [0, 150, 0], "on the first platform");
  b.viewAt("high", "high", [-150, 200, -150], [0, 100, 0], "the tower from above its summit");
  b.viewAt("detail", "detail", [36, 20, -2], [30, 30, 30], "a curved leg's lattice");
  b.safe("centre", [0, 0, -2], 0);
  b.safe("first", [0, 64.5, -20], 0);
  b.safe("second", [0, 112.5, -15.5], 0);
  b.safe("summit", [0, 176.5, 0], 0);
}

// ================================================================= L15

/**
 * L15 Setback Crown, 112 × 88 × 212. Lobby, floors 1–8 at 112 × 88, floors
 * 9–28 at 88 × 64 with 8 m corner cuts, floors 29–40 retreating 2 m every
 * four floors, floors 41–44 at 32 × 24, a crown and a bundled mast.
 */
export function L15(b: Builder): void {
  // one floor ring for a rectangular plan with optional corner cuts: column bundles every 8 m, two M rings,
  // D window divisions every 2 m with infill recessed 0.75 m, and plank/glass shells
  const floor = (y: number, w: number, d: number, cut: number, band: string, k: number, opts: { spines?: boolean; lobby?: boolean } = {}): void => {
    b.set({ stage: "columns", band, course: k });
    const hw = w / 2;
    const hd = d / 2;
    // perimeter polyline (with corner cuts)
    const P: V3[] = cut > 0
      ? [[-hw + cut, 0, -hd], [hw - cut, 0, -hd], [hw, 0, -hd + cut], [hw, 0, hd - cut], [hw - cut, 0, hd], [-hw + cut, 0, hd], [-hw, 0, hd - cut], [-hw, 0, -hd + cut]]
      : [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]];
    for (let i = 0; i < P.length; i++) {
      const a = P[i]!;
      const c = P[(i + 1) % P.length]!;
      const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
      const t = norm(sub(c, a));
      const out: V3 = [t[2], 0, -t[0]];
      const nb = Math.max(1, Math.round(l / 8));
      for (let q = 0; q <= nb; q++) {
        if (q === nb && i < P.length) continue; // the next edge places the shared corner
        const p = lerp3(a, c, q / nb);
        // a four-M bundle just inside the facade line (corner bundles kept inside both faces)
        const along = q === 0 ? 0.26 : q === nb ? -0.78 : -0.26;
        for (const [s1, s2] of [[0.25, 0], [0.77, 0], [0.25, 0.52], [0.77, 0.52]] as const) chain(b, "M", add(p, add(scale(out, -s1), scale(t, s2 + along))).map((v, j) => (j === 1 ? y : v)) as V3, add(p, add(scale(out, -s1), scale(t, s2 + along))).map((v, j) => (j === 1 ? y + 4 : v)) as V3, { up: out });
      }
      for (const yy of [y + 0.25, y + 3.75]) chain(b, "M", add(a, [0, yy, 0]), add(c, [0, yy, 0]), { up: [0, 1, 0] });
      if (!opts.lobby) {
        b.with({ stage: "details", band: `${band} windows`, course: k }, () => {
          for (let s = 1; s < l; s += 2) {
            const p = lerp3(a, c, s / l);
            chain(b, "D", add(p, [0, y + 0.6, 0]), add(p, [0, y + 3.4, 0]), { up: out });
          }
        });
        b.shell(add(lerp3(a, c, 0.5), add(scale(out, -0.75), [0, y + 2, 0])), [l / 2, 1.5, 0.05], "glass", { yaw: yawForX(t[0], t[2]) });
        b.shell(add(lerp3(a, c, 0.5), add(scale(out, -0.6), [0, y + 0.2, 0])), [l / 2, 0.2, 0.15], "plank", { yaw: yawForX(t[0], t[2]) });
      }
      b.box(add(lerp3(a, c, 0.5), add(scale(out, -0.5), [0, y + 2, 0])), [l / 2 + 0.3, 2, 0.6], yawForX(t[0], t[2]));
    }
    b.with({ tier: 2, stage: "beams", band: `${band} floors`, course: k }, () => {
      // floor edge beam ring inset (floor plate shown only at the perimeter, interior shaded)
      for (let i = 0; i < P.length; i++) {
        const a = P[i]!;
        const c = P[(i + 1) % P.length]!;
        const t = norm(sub(c, a));
        const inn: V3 = [-t[2], 0, t[0]];
        chain(b, "M", add(add(a, scale(inn, 1.5)), [0, y + 0.25, 0]), add(add(c, scale(inn, 1.5)), [0, y + 0.25, 0]), { up: [0, 1, 0] });
      }
    });
    b.shell([0, y + 0.1, 0], [hw - 1.2, 0.1, hd - 1.2], "shade");
  };
  // lobby 0–8: four 2 m bands, corner bundles, an 8 m perimeter grid, 16 m clear central entrance, R top beams
  b.set({ comp: "lobby" });
  for (let k = 0; k < 4; k++) {
    b.set({ stage: "base", band: "lobby", course: k });
    rect(b, "M", 0, k * 2, 0, 112, 88, 1);
    for (const sx of [-1, 1]) chain(b, "M", [sx * 8, k * 2 + 0.25, -44.5], [sx * 56, k * 2 + 0.25, -44.5], { up: [0, 1, 0] });
  }
  for (const [x, z] of [[-55, -43], [55, -43], [55, 43], [-55, 43]] as const) for (const [ox, oz] of [[0, 0], [0.52, 0], [0, 0.52], [0.52, 0.52]] as const) chain(b, "M", [x + ox * Math.sign(-x), 0, z + oz * Math.sign(-z)], [x + ox * Math.sign(-x), 8, z + oz * Math.sign(-z)], { up: [0, 0, 1] });
  for (let x = -48; x <= 48; x += 8) for (const z of [-43.75, 43.75]) if (Math.abs(x) >= 8) chain(b, "M", [x, 0, z], [x, 8, z], { up: [0, 0, 1] });
  rect(b, "M", 0, 7, 0, 112, 88, 2);
  b.box([-32, 4, -43.5], [24, 4, 0.6]);
  b.box([32, 4, -43.5], [24, 4, 0.6]);
  b.box([0, 4, 43.5], [56, 4, 0.6]);
  b.box([-55.5, 4, 0], [0.6, 4, 44]);
  b.box([55.5, 4, 0], [0.6, 4, 44]);
  b.box([0, 7.5, 0], [56, 0.5, 44]);
  b.shell([0, 4, 43.6], [55, 3.8, 0.2], "glass");
  b.plan("base", "lobby", 4);
  b.footing([0, 0, 0]);
  // floors 1–8 (8–40) at 112 × 88; floor 8 gets four projecting D cornice layers
  b.set({ comp: "base block" });
  for (let k = 0; k < 8; k++) floor(8 + 4 * k, 111, 87, 0, "floors 1-8", k);
  b.plan("columns", "floors 1-8", 8);
  b.set({ stage: "details", band: "cornice 8", course: 0 });
  for (let j = 0; j < 4; j++) rect(b, "D", 0, 40 - 0.5 + j * 0.125, 0, 112 - 0.25 * (3 - j), 88 - 0.25 * (3 - j), 1);
  b.box([0, 40.25, 0], [56, 0.5, 44]);
  // setback roof terrace at 40 (between 112 × 88 and 88 × 64)
  b.set({ stage: "beams", band: "setback terraces", course: 0 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, 40.5, 0, 111, 87, "x", [{ x0: -44, x1: 44, z0: -32, z1: 32 }]));
  b.set({ stage: "details", band: "terrace rails", course: 0 });
  rails(b, [[-55.5, 0, -43.5], [-55.5, 0, 43.5], [55.5, 0, 43.5], [55.5, 0, -43.5]], 40.5, true);
  // floors 9–28 (40–120) at 88 × 64 with 8 m corner cuts and continuous double-M spines at each face centre
  b.set({ comp: "middle block" });
  for (let k = 0; k < 20; k++) floor(40 + 4 * k, 88, 64, 8, "floors 9-28", k);
  b.plan("columns", "floors 9-28", 20);
  b.set({ stage: "columns", band: "face spines", course: 0 });
  for (const [x, z, nx, nz] of [[0, -32, 0, -1], [0, 32, 0, 1], [-44, 0, -1, 0], [44, 0, 1, 0]] as const) for (const o of [-0.5, 0.5]) chain(b, "M", [x + nx * 0.6 + (nz ? o : 0), 40, z + nz * 0.6 + (nx ? o : 0)], [x + nx * 0.6 + (nz ? o : 0), 120, z + nz * 0.6 + (nx ? o : 0)], { up: [nx, 0, nz] });
  b.plan("columns", "face spines", 1);
  b.set({ stage: "beams", band: "setback terraces", course: 1 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, 120.5, 0, 87, 63, "x", [{ x0: -28, x1: 28, z0: -20, z1: 20 }]));
  b.box([0, 120, 0], [44, 0.5, 32]);
  // floors 29–40 (120–168): nominal 56 × 40, retreating 2 m every four floors; each setback with a ≥ 4 m edge, D rails and M brackets
  b.set({ comp: "tower block" });
  for (let k = 0; k < 12; k++) {
    const step = Math.floor(k / 4);
    const w = 56 - 4 * step;
    const d = 40 - 4 * step;
    floor(120 + 4 * k, w, d, 0, "floors 29-40", k);
    if (k % 4 === 3 && k < 11) {
      const y = 120 + 4 * (k + 1);
      b.set({ stage: "beams", band: "setback terraces", course: 2 + step });
      b.with({ tier: 2 }, () => deck(b, "M", 0, y + 0.5, 0, w, d, "x", [{ x0: -(w / 2 - 2), x1: w / 2 - 2, z0: -(d / 2 - 2), z1: d / 2 - 2 }]));
      b.box([0, y, 0], [w / 2, 0.5, d / 2]);
      b.set({ stage: "details", band: "terrace rails" });
      rails(b, [[-w / 2 + 0.2, 0, -d / 2 + 0.2], [-w / 2 + 0.2, 0, d / 2 - 0.2], [w / 2 - 0.2, 0, d / 2 - 0.2], [w / 2 - 0.2, 0, -d / 2 + 0.2]], y + 0.5, true);
      for (let x = -w / 2 + 2; x < w / 2; x += 4) for (const sz of [-1, 1]) chain(b, "M", [x, y - 2, sz * (d / 2 - 2)], [x, y, sz * (d / 2 - 0.3)]);
    }
  }
  b.plan("columns", "floors 29-40", 12);
  b.revise({ item: "L15 tower floors", original: "nominal plan 56 × 40, retreat 2 m every four floors", revised: "floors 29–32 at 56 × 40, 33–36 at 52 × 36, 37–40 at 48 × 32 (2 m off every face), each setback a 2 m terrace inside a 4 m-wide roof edge with rails", reason: "a symmetric 2 m retreat on each face per stage", impact: "three principal setbacks at 40, 120 and 168, plus two minor ones" });
  b.set({ stage: "beams", band: "setback terraces", course: 5 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, 168.5, 0, 48, 32, "x", [{ x0: -16, x1: 16, z0: -12, z1: 12 }]));
  b.box([0, 168, 0], [24, 0.5, 16]);
  // floors 41–44 (168–184) at 32 × 24 with double-M corner ribs
  b.set({ comp: "crown floors" });
  for (let k = 0; k < 4; k++) floor(168 + 4 * k, 32, 24, 0, "floors 41-44", k);
  b.set({ stage: "details", band: "corner ribs", course: 0 });
  for (const [x, z] of [[-16, -12], [16, -12], [16, 12], [-16, 12]] as const) for (const o of [0, 0.55]) chain(b, "M", [x + Math.sign(x) * (0.3 + o), 168, z + Math.sign(z) * 0.3], [x + Math.sign(x) * (0.3 + o), 186, z + Math.sign(z) * 0.3], { up: [0, 0, 1] });
  b.plan("columns", "floors 41-44", 4);
  // crown and mast 184–212: seven 4 m courses, 16 × 12 → 4 × 4, paired M corner edges and D frames at mid and top
  b.set({ comp: "crown", stage: "roof", band: "crown", course: 0 });
  for (let k = 0; k < 7; k++) {
    b.set({ course: k });
    const f0 = k / 7;
    const f1 = (k + 1) / 7;
    const w0 = 16 - 12 * f0;
    const w1 = 16 - 12 * f1;
    const d0 = 12 - 8 * f0;
    const d1 = 12 - 8 * f1;
    const y0 = 184 + 4 * k;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      for (const o of [0, 0.52]) chain(b, "M", [sx * (w0 / 2 - o), y0, sz * (d0 / 2)], [sx * (w1 / 2 - o), y0 + 4, sz * (d1 / 2)], { mode: "overhang" });
    }
    rect(b, "D", 0, y0 + 2, 0, (w0 + w1) / 2, (d0 + d1) / 2, 1);
    rect(b, "D", 0, y0 + 3.85, 0, w1, d1, 1);
    // the multi-stage crown's stepped fins
    if (k < 3) for (const sx of [-1, 1]) chain(b, "D", [sx * (w0 / 2 + 0.3), y0 + 0.5, 0], [sx * (w1 / 2 + 0.3), y0 + 3.5, 0], { up: [sx, 0, 0] });
    b.box([0, y0 + 2, 0], [(w0 + w1) / 4, 2, (d0 + d1) / 4]);
  }
  b.plan("roof", "crown", 7);
  b.shell([0, 194, 0], [5, 10, 3.5], "plank");
  // the mast: bundled B/M chains (not one stretched pole) from 184 to 212
  b.set({ stage: "roof", band: "mast", course: 0 });
  for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]] as const) {
    chain(b, "B", [ox, 188, oz], [ox * 0.5, 204, oz * 0.5], { mode: "overhang" });
    chain(b, "M", [ox * 0.5, 204, oz * 0.5], [ox * 0.2, 212 - 0.1, oz * 0.2], { mode: "overhang" });
  }
  b.plan("roof", "mast", 1);
  b.set({ comp: "main" });
  b.feature("three principal setbacks at 40, 120 and 168 m", [0, 120, -32]);
  b.feature("continuous face spines and recessed windows", [0, 80, -32]);
  b.feature("a multi-stage crown and bundled mast", [0, 200, 0]);
  b.entry("lobby", [0, 0, -70], [0, 0, 30], 16, 7, true, "through the 16 m lobby entrance");
  b.entry("terraces", [0, 41, -60], [0, 169, -20], 10, 10, false, "fly up past the three setback terraces");
  b.viewAt("ground", "ground", [6, 1.65, -60], [0, 120, 0], "the lobby front and the stepped tower");
  b.viewAt("interior", "interior", [0, 1.65, -30], [0, 6, 20], "inside the lobby");
  b.viewAt("high", "high", [-120, 230, -150], [0, 160, 0], "circling the crown");
  b.viewAt("detail", "detail", [30, 121.65, -36], [0, 150, -20], "the 120 m setback terrace");
  b.safe("front", [0, 0, -62], 0);
  b.safe("lobby", [0, 0, -20], 0);
  b.safe("terrace40", [0, 40.75, -40], 0);
  b.safe("terrace120", [0, 120.5, -28], 0);
  b.safe("terrace168", [0, 168.5, -14], 0);
}

// ================================================================= L16

/**
 * L16 Curved Gorge Dam, 360 × 160 × 160. A curved arch-gravity body whose
 * crest arc spans the canyon (x), upstream face convex toward −z (the
 * reservoir); thickness tapers from 110 to 12; crest road; four intake towers
 * upstream; two powerhouses and a central fin spillway downstream (+z).
 *
 * Local datum: foundation y = 0; world placement puts this at ≈ 20.
 */
export function L16(b: Builder): void {
  const Rc = 260; // upstream face radius (plan), centre on +z
  const arcHalf = Math.asin(170 / Rc); // crest arc spans x = ±170 at the upstream face
  const thick = (y: number): number => {
    // 110 / 82 / 52 / 27 / 12 at 0 / ¼ / ½ / ¾ / 1 of 144, piecewise-cubic smooth
    const t = Math.max(0, Math.min(1, y / 144));
    const xs = [0, 0.25, 0.5, 0.75, 1];
    const vs = [110, 82, 52, 27, 12];
    let i = Math.min(3, Math.floor(t * 4));
    const f = (t - xs[i]!) / 0.25;
    // Catmull-Rom across the samples
    const p0 = vs[Math.max(0, i - 1)]!;
    const p1 = vs[i]!;
    const p2 = vs[i + 1]!;
    const p3 = vs[Math.min(4, i + 2)]!;
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  };
  // the body's plan at height y: upstream face on radius Rc around (0, zc), downstream face on radius Rc + thick(y)
  const zc = Rc - 20; // upstream face crown at z = −20 (the centre of curvature behind the dam, downstream)
  void zc;
  const up = (a: number): [number, number] => [Rc * Math.sin(a), -20 + Rc - Rc * Math.cos(a)];
  // canyon walls narrow the body toward the base: the half-width at height y
  const halfWidth = (y: number): number => 60 + (110 * Math.pow(Math.max(0, Math.min(1, y / 144)), 0.8));
  b.revise({ item: "L16 plan resolution", original: "360 × 160 envelope, curved upstream plan, 36 bands × 36 arc sectors", revised: "upstream face on a 260 m radius (convex toward the reservoir at −z), crest arc x = ±170; the canyon narrows the body to ±60 m at the foundation; thickness by Catmull-Rom through 110/82/52/27/12 m; 36 equal-angle sectors per band, trimmed by the canyon", reason: "a dam fills a V-shaped canyon: full-width sectors at the base would hang in the rock", impact: "the 160 m depth = 110 m base thickness + the plan sagitta + spillway toe; the crest is 12 m thick" });
  const sectorAngles = (y: number): number[] => {
    const hw = halfWidth(y);
    const aMax = Math.asin(Math.min(1, hw / Rc));
    return Array.from({ length: 37 }, (_, i) => -arcHalf + (2 * arcHalf * i) / 36).filter((a) => Math.abs(a) <= aMax + 1e-9);
  };
  // 36 body bands of 4 m: per band/sector one M face frame upstream and downstream, M ribs every 2 m, D facing; F truss every fourth sector
  b.set({ comp: "dam body" });
  for (let k = 0; k < 36; k++) {
    b.set({ stage: "columns", band: "dam body", course: k });
    const ya = k * 4;
    const yb = ya + 4;
    const ta = thick(ya);
    const tb = thick(yb);
    const angs = sectorAngles(ya + 2);
    for (let i = 0; i + 1 < angs.length; i++) {
      const a0 = angs[i]!;
      const a1 = angs[i + 1]!;
      // upstream face: points on radius Rc (vertical: the upstream face is near vertical, leaning back 2 %)
      const U = (a: number, y: number): V3 => {
        const [x, z] = up(a);
        const n: [number, number] = [Math.sin(a), Math.cos(a)];
        const lean = (144 - y) * 0.0;
        return [x + n[0] * lean, y, z + n[1] * lean];
      };
      const Dn = (a: number, y: number): V3 => {
        const [x, z] = up(a);
        const n: [number, number] = [Math.sin(a), Math.cos(a)];
        const t = thick(y);
        return [x + n[0] * t, y, z + n[1] * t];
      };
      // face frames: two vertical chains and top/bottom chains on each face
      for (const F of [U, Dn]) {
        chain(b, "M", F(a0, ya), F(a0, yb), { up: [0, 0, 1], mode: "overhang" });
        chain(b, "M", F(a0, ya + 0.25), F(a1, ya + 0.25), { up: [0, 1, 0], mode: "overhang" });
      }
      // vertical M ribs at ~2 m along the downstream face (the visible stepped toe face), D horizontal facing staggered
      const lenD = Math.hypot(Dn(a1, ya)[0] - Dn(a0, ya)[0], Dn(a1, ya)[2] - Dn(a0, ya)[2]);
      const nr = Math.max(1, Math.round(lenD / 2));
      b.with({ tier: 1 }, () => {
        for (let r = 1; r < nr; r++) chain(b, "M", lerp3(Dn(a0, ya), Dn(a1, ya), r / nr), lerp3(Dn(a0, yb), Dn(a1, yb), r / nr), { up: [0, 0, 1], mode: "overhang" });
      });
      b.with({ tier: 2, stage: "details", band: "dam facing", course: k }, () => {
        for (const yy of [ya + 1.25, ya + 2.25, ya + 3.25]) {
          const p0 = Dn(a0, yy);
          const p1 = Dn(a1, yy);
          chain(b, "D", add(p0, [0, 0, 0]), p1, { mode: "overhang", up: [0, 1, 0] });
        }
      });
      // internal radial F truss every fourth sector
      if (i % 4 === 0) {
        const um = U(a0, ya);
        const dm = Dn(a0, ya);
        b.with({ tier: 2 }, () => trussQuad(b, "M", um, dm, U(a0, yb), Dn(a0, yb), { bottom: false, sides: false }));
      }
      // shells and collision for this sector-band: a downstream face slab and an upstream face slab
      const mid = (a0 + a1) / 2;
      const midU = U(mid, (ya + yb) / 2);
      const midD = Dn(mid, (ya + yb) / 2);
      const yaw = yawForX(Math.cos(mid), -Math.sin(mid));
      const slopeRoll = 0;
      void slopeRoll;
      const segL = Rc * (a1 - a0);
      b.shell(add(midU, [Math.sin(mid) * 0.6, 0, Math.cos(mid) * 0.6]), [segL / 2, 2, 0.4], "plank", { yaw });
      b.shell(add(midD, [-Math.sin(mid) * 0.6, 0, -Math.cos(mid) * 0.6]), [(lenD / 2) * 1.0, 2, 0.4], "plank", { yaw });
      // body collision: the band's full thickness as one yawed box (solid dam)
      const cm = lerp3(midU, midD, 0.5);
      b.box(cm, [Math.max(segL, lenD) / 2 + 0.3, 2, (ta + tb) / 4], yaw);
    }
  }
  b.plan("columns", "dam body", 36);
  // crest road 144–150: three 2 m bands; 12 m wide; transverse beams every 8 m, four M longitudinal chains, D decking, rails
  b.set({ comp: "crest", stage: "beams", band: "crest road" });
  const crestA = sectorAngles(146);
  const crestPts = (off: number, y: number): V3[] => {
    const n = 72;
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = -arcHalf + (2 * arcHalf * i) / n;
      const [x, z] = up(a);
      return [x + Math.sin(a) * off, y, z + Math.cos(a) * off];
    });
  };
  for (let band = 0; band < 3; band++) {
    b.set({ course: band });
    const y = 144 + band * 2;
    for (const off of [0.25, 3.5, 8.5, 11.75]) {
      const pts = crestPts(off, y + 1);
      for (let i = 0; i + 1 < pts.length; i++) chain(b, "M", pts[i]!, pts[i + 1]!, { mode: "overhang", up: [0, 1, 0] });
    }
  }
  // transverse beams every 8 m
  const crestLen = Rc * 2 * arcHalf;
  for (let s = 0; s <= crestLen; s += 8) {
    const a = -arcHalf + (2 * arcHalf * s) / crestLen;
    const [x, z] = up(a);
    chain(b, "M", [x, 149.25, z], [x + Math.sin(a) * 12, 149.25, z + Math.cos(a) * 12], { up: [0, 1, 0] });
  }
  b.with({ tier: 2 }, () => {
    for (let off = 0.4; off < 12; off += 0.135 * 4) {
      const pts = crestPts(off, 149.94);
      for (let i = 0; i + 1 < pts.length; i += 1) chain(b, "D", pts[i]!, pts[i + 1]!, { mode: "overhang", up: [0, 1, 0] });
    }
  });
  b.plan("beams", "crest road", 3);
  b.set({ stage: "details", band: "crest rails", course: 0 });
  rails(b, crestPts(0.3, 0), 150);
  rails(b, crestPts(11.7, 0), 150);
  for (let i = 0; i < 24; i++) {
    const a = -arcHalf + (2 * arcHalf * (i + 0.5)) / 24;
    const [x, z] = up(a);
    b.box([x + Math.sin(a) * 6, 147, z + Math.cos(a) * 6], [(crestLen / 24) / 2 + 0.5, 3, 6], yawForX(Math.cos(a), -Math.sin(a)));
  }
  void crestA;
  // four intake towers upstream: 16-sided shafts on platforms; the upper 24 m in six 4 m bands; caps eight tapering 32 D rings
  const towers = [-90, -30, 30, 90].map((x) => {
    const a = Math.asin(x / Rc);
    const [ux, uz] = up(a);
    return [ux - Math.sin(a) * 18, 0, uz - Math.cos(a) * 18] as V3;
  });
  towers.forEach((p, k) => {
    b.set({ comp: `intake tower ${k + 1}` });
    // the submerged lower shaft (supporting geometry below the water level) and the upper 24 m to 160
    polyShaft(b, p[0], p[2], 6, 16, 40, 24, 4, { stock: "M", band: "intake shafts", diagonals: true });
    b.set({ stage: "roof", band: "intake caps", course: 0 });
    for (let j = 0; j < 8; j++) {
      b.set({ course: j });
      ring(b, "D", p[0], 136 + j * 0.5, p[2], 6.4 - j * 0.6, 32, 1);
    }
    cone(b, p[0], p[2], 140, 3.5, 20, 8, 4, { ribStock: "M", ringStock: "D", band: "intake finials" });
    // a bridge from the crest to the tower
    b.set({ stage: "beams", band: "intake bridges", course: 0 });
    const a = Math.atan2(p[0], 1);
    void a;
    const toward = norm(sub([p[0] * 0.97, 0, p[2] + 18], p));
    for (const o of [-1.5, 1.5]) {
      const side: V3 = [toward[2], 0, -toward[0]];
      chain(b, "M", add(add(p, scale(toward, 6)), add(scale(side, o), [0, 149.5, 0])), add(add(p, scale(toward, 18)), add(scale(side, o), [0, 149.5, 0])), { up: [0, 1, 0] });
    }
    b.box(add(add(p, scale(toward, 12)), [0, 149.5, 0]), [2, 0.5, 6.5], yawForX(toward[2], -toward[0]));
    b.footing([p[0], 40, p[2]]);
    // the tower's base platform at y = 40 on the reservoir floor shelf
    b.box([p[0], 38, p[2]], [8, 2, 8]);
  });
  b.plan("columns", "intake shafts", 24);
  b.plan("roof", "intake caps", 8);
  // downstream: two 64 × 24 powerhouses (four 8 m storeys, eight transverse frames per storey) flanking the river channel
  const toeZ = up(0)[1] + thick(0); // downstream toe at the crown
  for (const sx of [-1, 1]) {
    const cx = sx * 52;
    const cz = toeZ - 2;
    b.set({ comp: `powerhouse ${sx > 0 ? "E" : "W"}` });
    for (let s = 0; s < 4; s++) {
      b.set({ stage: "columns", band: "powerhouses", course: s });
      const ya = s * 8;
      for (let f = 0; f < 8; f++) {
        const x = cx - 32 + (64 * f) / 7;
        for (const z of [cz - 12 + 0.25, cz + 12 - 0.25]) chain(b, "M", [x, ya, z], [x, ya + 8, z], { up: [1, 0, 0] });
        chain(b, "M", [x, ya + 7.75, cz - 12], [x, ya + 7.75, cz + 12], { up: [0, 1, 0] });
      }
      rect(b, "M", cx, ya, cz, 64, 24, 1);
      b.with({ tier: 2, stage: "details", band: "powerhouse windows", course: s }, () => {
        for (let x = cx - 31; x < cx + 32; x += 2) chain(b, "D", [x, ya + 2, cz + sx * -12.2], [x, ya + 6, cz + sx * -12.2], { up: [0, 0, 1] });
      });
    }
    b.shell([cx, 16, cz], [31.6, 16, 11.6], "plank");
    b.box([cx, 16, cz], [32, 16, 12]);
    b.set({ stage: "roof", band: "powerhouse roofs", course: 0 });
    b.with({ tier: 2 }, () => deck(b, "M", cx, 32.5, cz, 64, 24, "x"));
    b.footing([cx, 0, cz]);
  }
  b.plan("columns", "powerhouses", 4);
  // the fin spillway (§7.4): a downstream annex at the crown between the powerhouses, five fin buttresses at
  // X = −32…32, 112 courses of 0.5 m (body 56), half-width 1.1 + 2.1(1 − t), nose z = 4 + 30(1 − t)^1.7, back z = −6,
  // four bay chutes z = 5 + 20(1 − y/56)^2, recessed gates 40.5–52, bridge, caps and rails to 61.75.
  // The annex sits against the dam's downstream face: its local z = −6 is that face at the crown.
  const SZ = toeZ - 6 - 8; // the annex origin's z, chosen so its back (z = −6) beds into the body's lower face
  b.revise({ item: "L16 fin spillway integration", original: "§7.4 local sample: 61.75 m high, back at z = −6", revised: "used unchanged as a lower downstream annex at the crown, its origin at the dam toe (back bedded into the body), between the two powerhouses, discharging into the central channel", reason: "keeps the 160 m dam and adds the required fins, bays, bottom-wide/top-narrow sections and spreading chute faces", impact: "the spillway reads from the toe and from the crest road above" });
  b.at([0, 0, SZ], 0, () => {
    b.set({ comp: "fin spillway" });
    for (let j = 0; j < 112; j++) {
      b.set({ stage: "columns", band: "spillway fins", course: j });
      const y = j * 0.5 + 0.25;
      const t = y / 56;
      const back = -6;
      const front = 4 + 30 * Math.pow(1 - t, 1.7);
      // upstream face: continuous double rows of horizontal chains (behind the fins, against the dam)
      if (j % 2 === 0) for (const row of [0, 0.5]) chain(b, "M", [-36, y, back + row], [36, y, back + row], { up: [0, 1, 0] });
      for (const x of [-32, -16, 0, 16, 32]) {
        const hw = 1.1 + 2.1 * (1 - t);
        for (const sgn of [-1, 1]) chain(b, "M", [x + sgn * hw, y, back], [x + sgn * hw, y, front], { up: [0, 1, 0] });
        chain(b, "M", [x - hw, y, front], [x + hw, y, front], { up: [0, 1, 0] });
      }
    }
    b.plan("columns", "spillway fins", 112);
    // fin collision and shells: each fin as stacked boxes following the nose curve
    for (const x of [-32, -16, 0, 16, 32]) {
      for (let k = 0; k < 14; k++) {
        const y0 = k * 4;
        const t = (y0 + 2) / 56;
        const hw = 1.1 + 2.1 * (1 - t);
        const front = 4 + 30 * Math.pow(1 - t, 1.7);
        b.box([x, y0 + 2, (front - 6) / 2], [hw, 2, (front + 6) / 2]);
        b.shell([x, y0 + 2, (front - 6) / 2], [hw - 0.4, 2, (front + 6) / 2 - 0.4], "plank");
      }
    }
    // four bays: recessed upper gates, continuous chute faces to the toe
    b.set({ stage: "details", band: "spillway gates", course: 0 });
    for (const x of [-24, -8, 8, 24]) {
      for (let y = 40.5; y < 52; y += 0.5) chain(b, "M", [x - 5, y, -2.5], [x + 5, y, -2.5], { up: [0, 1, 0] });
      for (const xx of [x - 5.8, x + 5.8]) chain(b, "M", [xx, 39, -1], [xx, 54, -1], { up: [0, 0, 1] });
      chain(b, "M", [x - 6, 53, -1], [x + 6, 53, -1], { up: [0, 1, 0] });
      b.box([x, 46, -2.5], [5, 6, 0.6]);
    }
    b.plan("details", "spillway gates", 1);
    b.set({ stage: "arches", band: "spillway chutes", course: 0 });
    for (const x of [-24, -8, 8, 24]) {
      for (let yy = 0.25; yy < 40; yy += 0.5) {
        const zz = 5 + 20 * Math.pow(1 - yy / 56, 2);
        chain(b, "M", [x - 5, yy, zz], [x + 5, yy, zz], { up: [0, 1, 0] });
      }
      for (const sgn of [-1, 1]) {
        const pts: V3[] = [];
        for (let k = 0; k <= 19; k++) {
          const yy = 2 + (37 * k) / 19;
          pts.push([x + sgn * 5, yy, 5 + 20 * Math.pow(1 - yy / 56, 2)]);
        }
        for (let k = 0; k < 19; k++) chain(b, "M", pts[k]!, pts[k + 1]!, { mode: "overhang" });
      }
      // chute collision as a ramp-like stack of boxes, and the flowing water sheet
      for (let k = 0; k < 10; k++) {
        const y0 = k * 4;
        const z0 = 5 + 20 * Math.pow(1 - y0 / 56, 2);
        const z1 = 5 + 20 * Math.pow(1 - (y0 + 4) / 56, 2);
        b.box([x, y0 + 2, (z0 + z1) / 2 - 1], [5, 2, Math.abs(z0 - z1) / 2 + 1]);
      }
      b.waterRect([x, 0.6, 30], 5, 6, 0, 3, "spillway bay outflow into the stilling basin");
    }
    b.plan("arches", "spillway chutes", 1);
    // crest bridge 76 × 10, five layered pier caps, rails on both sides (to 61.75)
    b.set({ stage: "beams", band: "spillway bridge", course: 0 });
    for (let j = 0; j < 4; j++) {
      b.set({ course: j });
      deck(b, "M", 0, 56.5 + j * 0.5, -1, 76, 10, "x");
    }
    b.plan("beams", "spillway bridge", 4);
    b.box([0, 57.5, -1], [38, 1.5, 5]);
    b.set({ stage: "details", band: "spillway caps", course: 0 });
    for (const x of [-32, -16, 0, 16, 32]) for (let j = 0; j < 4; j++) rect(b, "M", x, 58.5 + j, -1, 6 - j * 0.6, 6 - j * 0.6, 1);
    for (let x = -36; x <= 36; x += 2) for (const z of [-5.5, 3.5]) chain(b, "D", [x, 58.5, z], [x, 60.5, z], { up: [0, 0, 1] });
    for (const z of [-5.5, 3.5]) chain(b, "D", [-37, 60.5, z], [37, 60.5, z], { up: [0, 1, 0], mode: "overhang" });
    b.plan("details", "spillway caps", 1);
    b.feature("five fin buttresses, bottom-wide and top-narrow", [0, 20, 10]);
    b.feature("four recessed gate bays with continuous chute faces spreading to the toe", [8, 30, 8]);
  });
  // stilling basin training walls: two M-framed walls along the channel from the spillway toe to the
  // envelope's downstream edge, so the basin is contained (no water spreading over grass)
  b.set({ comp: "stilling basin", stage: "base", band: "training walls", course: 0 });
  const basinZ0 = SZ + 4;
  const basinZ1 = up(0)[1] - 20 + 160 - 0.5 - (up(0)[1] - 20 - (-42.6)) ;
  const zEnd = -42.6 + 160;
  void basinZ1;
  for (const sx of [-1, 1]) {
    const x = sx * 40;
    for (let k = 0; k < 6; k++) chain(b, "M", [x, 0.25 + k * 0.5, basinZ0], [x, 0.25 + k * 0.5, zEnd - 0.25], { up: [0, 1, 0] });
    for (let z = basinZ0; z <= zEnd - 0.5; z += 4) chain(b, "M", [x + sx * 0.5, 0, z], [x + sx * 0.5, 3, z], { up: [1, 0, 0] });
    b.box([x, 1.5, (basinZ0 + zEnd) / 2], [0.6, 1.5, (zEnd - basinZ0) / 2]);
  }
  b.plan("base", "training walls", 1);
  // stilling basin and channel water; the reservoir upstream is world terrain water (sea-level body set by placement)
  // the water stays between the training walls (it ends with them at zEnd); the river (layout.ts damRiver) takes it
  // on over the end sill, a metre lower, incised into the canyon floor and on through the gorge to the sea
  b.waterRect([0, 0.5, (basinZ0 + zEnd) / 2], 39, (zEnd - basinZ0) / 2, 0, 2.2, "the stilling basin and channel below the dam between its training walls, falling over the end sill into the river that runs through the gorge to the sea");
  b.waterRect([0, 136, up(0)[1] - 120], 170, 110, 0, 0, "the reservoir behind the dam, 8–12 m below the crest");
  b.set({ comp: "main" });
  b.feature("curved plan with a thick base tapering to a 12 m crest", [0, 72, up(0)[1] + 40]);
  b.feature("a 12 m crest road with rails", [0, 150, up(0)[1] + 6]);
  b.feature("four intake towers upstream", [towers[1]![0], 150, towers[1]![2]]);
  b.entry("toe", [0, 1, SZ + 70], [0, 1, SZ + 36], 16, 30, true, "walk up the channel bank to the spillway toe");
  // rise beside the downstream face: a path kept 8 m off the face, from the toe to above the crest road
  {
    const a = Math.asin(70 / Rc);
    const pts: V3[] = [];
    for (let k = 0; k <= 8; k++) {
      const y = 4 + (146 * k) / 8;
      const [x0, z0] = up(a);
      const off = thick(Math.min(144, y)) + 8;
      pts.push([x0 + Math.sin(a) * off, y, z0 + Math.cos(a) * off]);
    }
    for (let k = 0; k < 8; k++) b.entry(`face-${k + 1}`, pts[k]!, pts[k + 1]!, 12, 12, true, k === 0 ? "rise beside the downstream face from the toe to the crest" : "…continuing up the face");
  }
  b.entry("crest", [-160, 150, up(-0.6)[1] + 6], [160, 150, up(0.6)[1] + 6], 10, 4, true, "cross the crest road and circle the intake towers");
  b.viewAt("ground", "ground", [16, 1.65, SZ + 80], [0, 70, toeZ - 20], "from the channel looking up at the spillway and the dam");
  // on the bay floor beyond the chute's toe (z = 25 at y = 0), between the fins at x = 0 and 16, looking up the chute
  // (at z = 14 the eye stood under the chute face, inside the spillway)
  b.viewAt("interior", "interior", [8, 1.65, SZ + 34], [8, 40, SZ + 4], "inside a spillway bay looking up the chute");
  // high above the reservoir, looking down the dam into the gorge (the old eye on the west rim saw a quarter of it
  // past the rim rock)
  b.viewAt("high", "high", [-60, 310, -300], [0, 90, 20], "the curved crest and reservoir");
  // from the east abutment's rim (192), beyond the crest's end, looking back across the dam: the section tapers below
  // in flight over the canyon's east edge, beyond the dam's end and above the rim, looking back along the dam: the
  // thick base and thin crest of the section and its downstream face (the rim rock is below, not in the lens)
  b.viewAt("side", "side", [195, 215, 120], [20, 70, 30], "the dam's tapering section from the side");
  b.viewAt("detail", "detail", [40, 151.65, up(0)[1] + 6], [towers[2]![0], 150, towers[2]![2]], "an intake tower from the crest road");
  b.safe("toe", [20, 0.5, SZ + 72], Math.PI);
  b.safe("crest", [0, 150, up(0)[1] + 6], 0);
  b.safe("powerhouse-roof", [52, 32.5, toeZ - 2], 0);
}

export const _rd = { sec, trussFace };
