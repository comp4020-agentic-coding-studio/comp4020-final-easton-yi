// Region B — Arches and Domes: L05 Triple Aqueduct, L06 Ring Theatre,
// L07 Oculus Hall, L08 Floating Dome Hall.
import { add, Builder, scale, type V3 } from "../core.ts";
import { arch, chain, deck, dome, ellipseArc, floorGrid, rect, ring, sec, sphereCap, trussFace, trussQuad, yawForX } from "../parts.ts";
import { corinthian, entasis, ionic } from "../orders.ts";
import { approach, pitchedRoof, platform, rails } from "./common.ts";

// ================================================================= L05

/**
 * L05 Triple Aqueduct, 300 × 20 × 68. Spans along x. The lower tier stands in
 * the streambed (y = 0) between banks that rise toward ±x; the middle and top
 * tiers run on to the bank terraces. Three unequal arcades: 6 / 11 / 35.
 */
export function L05(b: Builder): void {
  // ---- first tier: six openings of 22 m clear, seven piers 8 m wide → 6·22 + 7·8 = 188 m
  const span1 = 22;
  const pier1 = 8;
  const n1 = 6;
  const L1 = n1 * span1 + (n1 + 1) * pier1;
  const x1 = (k: number): number => -L1 / 2 + pier1 / 2 + k * (span1 + pier1); // pier centres k = 0…6
  b.revise({ item: "L05 first tier length", original: "approximately 180 m", revised: `${L1} m (six 22 m openings, seven 8 m piers)`, reason: "openings and piers resolved at their stated sizes", impact: "the lower tier is 8 m longer than the round figure" });
  b.plan("base", "footings", 8);
  for (let k = 0; k <= n1; k++) {
    b.at([x1(k), 0, 0], 0, () => {
      b.set({ comp: `lower pier ${k + 1}` });
      // footings 0–4: eight M frame courses alternating direction, 8 × 20
      for (let j = 0; j < 8; j++) {
        b.set({ stage: "base", band: "footings", course: j });
        rect(b, "M", 0, j * 0.5, 0, pier1 + 1, 20, 1);
        if (j % 2) b.with({ tier: 2 }, () => floorGrid(b, "M", 0, j * 0.5 + 0.5, 0, pier1, 19, 4));
      }
      b.box([0, 2, 0], [(pier1 + 1) / 2, 2, 10]);
      b.footing([0, 0, 0]);
      // pier 4–28: six 4 m segments, four corner B bundles + F framing on four faces
      for (let s = 0; s < 6; s++) {
        b.set({ stage: "columns", band: "lower piers", course: s });
        const ya = 4 + s * 4;
        const yb = ya + 4;
        // corner B bundles: each corner two B members, lapping across segments
        if (s % 2 === 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const dx of [0, 1]) chain(b, "B", [sx * (pier1 / 2 - 0.5 - dx), ya, sz * 9.5], [sx * (pier1 / 2 - 0.5 - dx), Math.min(28, ya + 8), sz * 9.5], { up: [0, 0, 1] });
        trussFace(b, "M", -pier1 / 2, ya, pier1 / 2, yb, -10 + 0.75, { bottom: s === 0, sides: false });
        trussFace(b, "M", -pier1 / 2, ya, pier1 / 2, yb, 10 - 0.75, { bottom: s === 0, sides: false });
        b.at([0, 0, 0], Math.PI / 2, () => {
          trussFace(b, "M", -9.5, ya, 9.5, yb, -pier1 / 2 + 0.25, { bottom: s === 0, sides: false });
          trussFace(b, "M", -9.5, ya, 9.5, yb, pier1 / 2 - 0.25, { bottom: s === 0, sides: false });
        });
      }
      b.shell([0, 16, 0], [pier1 / 2 - 0.6, 12, 9.2], "plank");
      b.box([0, 16, 0], [pier1 / 2, 12, 10]);
    });
  }
  b.plan("columns", "lower piers", 6);
  // first tier arches: A(22, 11, 2, 16, 1) springing at 17 (top of rise 28), top beam to 28; depth 16 inside the 20 m deck
  b.set({ comp: "lower arcade", stage: "arches", band: "lower arches", course: 0 });
  for (let k = 0; k < n1; k++) {
    b.at([(x1(k) + x1(k + 1)) / 2, 15, 0], 0, () => arch(b, span1, 11, 2, 16, 1));
  }
  b.plan("arches", "lower arches", 1);
  b.set({ stage: "beams", band: "lower beam", course: 0 });
  for (const z of [-9.75, -9.25, 9.25, 9.75]) for (const y of [26.25, 26.75, 27.25, 27.75]) chain(b, "M", [-L1 / 2, y, z], [L1 / 2, y, z], { up: [0, 1, 0] });
  b.with({ tier: 2 }, () => floorGrid(b, "M", 0, 28, 0, L1, 19, 4));
  b.box([0, 27, 0], [L1 / 2, 1, 10]);
  b.plan("beams", "lower beam", 1);

  // ---- second tier 28–52: eleven arches of 20 m clear over 300 m; 12 piers. Piers stand on lower pier lines
  // where they exist; the outer ones stand on the bank terraces (rising ground).
  const span2 = 20;
  const n2 = 11;
  const pier2 = (300 - n2 * span2) / (n2 + 1); // 6.67 m
  const x2 = (k: number): number => -150 + pier2 / 2 + k * (span2 + pier2);
  b.revise({ item: "L05 middle-tier piers", original: "12 piers, roughly 20 m clear spans, not over lower arch centres", revised: `twelve ${pier2.toFixed(2)} m piers at a ${(span2 + pier2).toFixed(2)} m pitch; piers over the lower tier stand on its deck beam, the outer five per side on the bank terrace`, reason: "an exact 1:1 pier alignment with the lower tier (30 m pitch) is impossible with 11 arches over 300 m; every middle pier over the 188 m lower tier lands on the 2 m lower beam band, none over an arch crown's keystone (checked: min distance from a lower crown ≥ 3.3 m)", impact: "the middle tier reads as its own rhythm, as at the reference" });
  for (let k = 0; k <= n2; k++) {
    const x = x2(k);
    const onBank = Math.abs(x) > L1 / 2;
    // the bank terrace under outer piers: the terrain is shaped to y = 28 here (placement), so the pier starts at 28
    b.at([x, 0, 0], 0, () => {
      b.set({ comp: `middle pier ${k + 1}`, stage: "columns", band: "middle piers" });
      const y0 = 28;
      for (let s = 0; s < 3; s++) {
        b.set({ course: s });
        const ya = y0 + s * 4;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) chain(b, "B", [sx * (pier2 / 2 - 0.5), ya, sz * 7.5], [sx * (pier2 / 2 - 0.5), ya + 4, sz * 7.5], { up: [0, 0, 1], mode: "lap", within: [y0, y0 + 12] });
        trussFace(b, "M", -pier2 / 2, ya, pier2 / 2, ya + 4, -8 + 0.25, { bottom: s === 0, sides: false });
        trussFace(b, "M", -pier2 / 2, ya, pier2 / 2, ya + 4, 8 - 0.25, { bottom: s === 0, sides: false });
      }
      b.shell([0, 34, 0], [pier2 / 2 - 0.6, 6, 7.4], "plank");
      b.box([0, 34, 0], [pier2 / 2, 6, 8]);
      if (onBank) {
        // a stepped plinth into the bank so the pier visibly bears on it
        b.set({ stage: "base", band: "bank plinths", course: 0 });
        for (let j = 0; j < 4; j++) rect(b, "M", 0, 28 - 2 + j * 0.5, 0, pier2 + 2 - j * 0.4, 18 - j * 0.4, 1);
        b.footing([0, 28 - 2, 0]);
      }
    });
  }
  b.plan("columns", "middle piers", 3);
  b.plan("base", "bank plinths", 1);
  b.set({ comp: "middle arcade", stage: "arches", band: "middle arches", course: 0 });
  for (let k = 0; k < n2; k++) b.at([(x2(k) + x2(k + 1)) / 2, 40, 0], 0, () => arch(b, span2, 10, 1.5, 12, 1));
  b.plan("arches", "middle arches", 1);
  b.set({ stage: "beams", band: "middle beam", course: 0 });
  for (const z of [-7.75, -7.25, 7.25, 7.75]) for (const y of [50.25, 50.75, 51.25, 51.75]) chain(b, "M", [-150, y, z], [150, y, z], { up: [0, 1, 0] });
  b.with({ tier: 2 }, () => floorGrid(b, "M", 0, 52, 0, 300, 15.5, 4));
  b.box([0, 51, 0], [150, 1, 8]);
  b.plan("beams", "middle beam", 1);

  // ---- third tier 52–64: 35 small arches, 36 piers, ~6 m clear
  const n3 = 35;
  const span3 = 6;
  const pier3 = (300 - n3 * span3) / (n3 + 1); // 2.5
  const x3 = (k: number): number => -150 + pier3 / 2 + k * (span3 + pier3);
  b.plan("columns", "upper piers", 2);
  for (let k = 0; k <= n3; k++) {
    b.at([x3(k), 0, 0], 0, () => {
      b.set({ comp: `upper pier ${k + 1}`, stage: "columns", band: "upper piers" });
      for (let s = 0; s < 2; s++) {
        b.set({ course: s });
        const ya = 52 + s * 4;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) chain(b, "M", [sx * (pier3 / 2 - 0.25), ya, sz * 3.75], [sx * (pier3 / 2 - 0.25), ya + 4, sz * 3.75], { up: [0, 0, 1] });
        for (let j = 0; j < 8; j++) {
          const y = ya + 0.5 + j * 0.45;
          if (j % 2) chain(b, "D", [-pier3 / 2, y, -4], [-pier3 / 2, y, -3], { up: [1, 0, 0] });
          else chain(b, "D", [pier3 / 2, y, 3], [pier3 / 2, y, 4], { up: [1, 0, 0] });
        }
      }
      b.box([0, 56, 0], [pier3 / 2, 4, 4]);
    });
  }
  b.set({ comp: "upper arcade", stage: "arches", band: "upper arches", course: 0 });
  for (let k = 0; k < n3; k++) b.at([(x3(k) + x3(k + 1)) / 2, 60, 0], 0, () => arch(b, span3, 3, 1, 8, 1, { collide: false }));
  b.plan("arches", "upper arches", 1);
  b.set({ stage: "beams", band: "upper beam", course: 0 });
  for (const z of [-3.75, 3.75]) chain(b, "M", [-150, 63.75, z], [150, 63.75, z], { up: [0, 1, 0] });
  b.box([0, 62, 0], [150, 2, 4]);
  b.plan("beams", "upper beam", 1);
  // ---- water channel 64–68: eight staggered M courses per side, 4 m channel, ≥ 4 m maintenance walk
  b.set({ comp: "channel", stage: "roof", band: "channel walls", course: 0 });
  for (let j = 0; j < 8; j++) {
    b.set({ course: j });
    for (const z of [-3.75, -2.25, 2.25]) chain(b, "M", [-150 + (j % 2) * 2, 64.25 + j * 0.5, z], [150 - (j % 2) * 2, 64.25 + j * 0.5, z], { up: [0, 1, 0] });
  }
  b.plan("roof", "channel walls", 8);
  b.set({ stage: "roof", band: "walk deck", course: 0 });
  deck(b, "M", 0, 66.5, 6, 300, 7.5, "x");
  b.plan("roof", "walk deck", 1);
  b.set({ stage: "details", band: "rails", course: 0 });
  rails(b, [[-150, 0, 9.5], [150, 0, 9.5]], 66.5);
  b.plan("details", "rails", 1);
  b.waterRect([0, 66.2, 0], 150, 1.9, Math.PI / 2, 0.8, "channel water flowing along the aqueduct toward +x");
  b.box([0, 65, -1.5], [150, 1, 2.5]);
  b.box([0, 65.5, 6], [150, 1, 4]);
  b.revise({ item: "L05 deck width", original: "20 m deep envelope; 4 m channel plus ≥ 4 m walk", revised: "lower tier 20 m, middle 16 m, top 8 m plus a 7.5 m cantilevered walk deck to z = 9.75 (bracketed on the upper beam)", reason: "a stepped section keeps the tiers distinct and the walk wide enough to land on", impact: "the channel is 4 m wide between M walls; the walk is 7.5 m" });
  b.set({ comp: "main" });
  b.feature("three unequal arcade tiers 6/11/35", [0, 30, 0]);
  b.feature("water channel on top with a maintenance walk", [0, 66, 0]);
  b.feature("middle tier extends over the bank terraces", [-140, 40, 0]);

  const midOpening = (x1(2) + x1(3)) / 2;
  b.entry("lower-arch", [midOpening, 0, -30], [midOpening, 0, 30], 12, 14, true, "walk (or fly low) through a central lower arch");
  b.entry("middle-arch", [(x2(5) + x2(6)) / 2, 32, -20], [(x2(5) + x2(6)) / 2, 32, 20], 12, 7, true, "fly through a middle-tier arch");
  b.entry("channel", [-140, 66.5, 6], [140, 66.5, 6], 6, 3, false, "walk along the channel's maintenance deck");
  // on the streambed inside the pad (z −36 stood on the valley side, 14 m above the bed)
  b.viewAt("ground", "ground", [14, 1.65, -20], [0, 30, 0], "streambed below the lower arches");
  // under the arch between piers 2 and 3, looking up into its ring (x1(3) is a pier centre: the eye stood inside the pier)
  b.viewAt("interior", "interior", [(x1(3) + x1(2)) / 2, 1.65, -6], [(x1(3) + x1(2)) / 2, 26, 4], "inside a lower arch, along the vault");
  b.viewAt("high", "high", [60, 90, -110], [0, 40, 0], "the whole three-tier aqueduct");
  b.viewAt("detail", "detail", [x2(3), 53, -14], [x3(12), 60, 0], "the small top arcade");
  b.safe("streambed", [0, 0, -34], 0);
  b.safe("walk", [-120, 66.5, 6], -Math.PI / 2);
  b.safe("bank", [-142, 28, -14], 0);
}

// ================================================================= L06

/**
 * L06 Ring Theatre, 240 × 196 × 78. An elliptical arcade of 48 bays in three
 * levels plus an attic, ring corridors and 24 seating steps.
 */
export function L06(b: Builder): void {
  const AX = 118; // base-step semi-axes reach 120 × 98 (envelope 240 × 196)
  const AZ = 96;
  const bays = 48;
  // pier centre-line ellipse: the attached half-columns' capitals (≈ 3.8 + 1.1 m outside the pier axis) stay inside the base steps
  const outer = ellipseArc(AX - 5, AZ - 5);
  const ds = outer.total / bays;
  // pier centres at equal arc length
  const piers = Array.from({ length: bays }, (_, i) => outer.at(i * ds));
  // base 0–4: four ring-step bands of 64 tangent M segments (actual arc lengths via C)
  for (let j = 0; j < 4; j++) {
    b.set({ comp: "base", stage: "base", band: "ring steps", course: j });
    const e = ellipseArc(AX + 2 - j * 0.8, AZ + 2 - j * 0.8);
    for (let i = 0; i < 64; i++) {
      const p = e.at((i * e.total) / 64);
      const q = e.at(((i + 1) * e.total) / 64);
      for (let k = 0; k < 2; k++) chain(b, "M", [p.p[0], j + 0.25 + k * 0.5, p.p[1]], [q.p[0], j + 0.25 + k * 0.5, q.p[1]], { up: [0, 1, 0], mode: "overhang" });
    }
  }
  b.plan("base", "ring steps", 4);
  b.revise({ item: "L06 ring-step base", original: "ellipse 240 × 196; four steps", revised: "step ellipses 240 × 196 at the base, shrinking 0.8 m per band; pier axes on a 226 × 182 ellipse so the attached half-columns stay within the envelope", reason: "the envelope includes the stepped base and the projecting half-columns", impact: "the steps are a walkable 0.5 m-riser plinth; entries cross it on ramps" });
  // ramps over the steps at the four main entries
  for (const k of [0, 12, 24, 36]) {
    const p = piers[k]!;
    const mid = outer.at((k + 0.5) * ds);
    b.with({ comp: "approach ramps" }, () => b.ramp([mid.p[0] + mid.out[0] * 3, 2, mid.p[1] + mid.out[1] * 3], 6, 4, yawForX(mid.t[0], mid.t[1]) + Math.PI / 2, 0, 4, -0.5));
    void p;
  }
  const levels = [
    { y0: 4, y1: 24, rise: 9, segs: 5, order: "plain" as const },
    { y0: 24, y1: 44, rise: 8, segs: 5, order: "ionic" as const },
    { y0: 44, y1: 62, rise: 7, segs: 4.5, order: "corinthian" as const },
  ];
  levels.forEach((lv, li) => {
    for (let i = 0; i < bays; i++) {
      const p = piers[i]!;
      const yaw = yawForX(p.t[0], p.t[1]);
      b.at([p.p[0], 0, p.p[1]], yaw, () => {
        b.set({ comp: `pier ${i + 1}`, stage: "columns", band: `level ${li + 1} piers` });
        // pier: 4 m segments of 8 M vertical bundle members + 8 M ties
        const nSeg = Math.round((lv.y1 - lv.y0) / 4);
        for (let s = 0; s < nSeg; s++) {
          b.set({ course: s });
          const ya = lv.y0 + s * ((lv.y1 - lv.y0) / nSeg);
          const yb = ya + (lv.y1 - lv.y0) / nSeg;
          for (const [x, z] of [[-1.25, -2.75], [-0.75, -2.75], [0.75, -2.75], [1.25, -2.75], [-1.25, 2.75], [-0.75, 2.75], [0.75, 2.75], [1.25, 2.75]] as const) chain(b, "M", [x, ya, z], [x, yb, z], { up: [0, 0, 1], mode: "lap", within: [lv.y0, lv.y1] });
          for (const y of [ya + 0.4, yb - 0.4]) for (const x of [-1.5, 1.5]) chain(b, "M", [x, y, -3], [x, y, 3], { up: [0, 1, 0] });
          for (const y of [ya + 0.4, yb - 0.4]) for (const z of [-3, 3]) chain(b, "M", [-1.5, y, z], [1.5, y, z], { up: [0, 1, 0] });
        }
        b.shell([0, (lv.y0 + lv.y1) / 2, 0], [1.3, (lv.y1 - lv.y0) / 2, 2.6], "plank");
        b.box([0, (lv.y0 + lv.y1) / 2, 0], [1.6, (lv.y1 - lv.y0) / 2, 3]);
        if (li === 0) b.footing([0, 4, 0]);
        // attached half-columns on the outer face (z = outward is local −z? the tangent is local +x; outward is local −z under yawForX)
        if (lv.order === "ionic") {
          b.at([0, 0, -3.8], 0, () => {
            b.set({ stage: "details", band: "ionic half-columns", course: 0 });
            ionic(b, { y0: lv.y0 + 1, segH: 3, segs: 4, radius: entasis(0.9, 0.8, 4, 0.03) }, { ribs: 12, ribStock: "D", ribLines: 1, backsPerFlute: 1, backStock: "D", fluteDepth: 0.1, ringSegments: 8, ringStock: "D" }, {
              rTop: 0.8, abacus: 2.2, tier: 2, base: { y0: lv.y0, radii: [1.15, 1.0], segments: 16, ties: 0, tieStock: "D" }, neckRings: 1, flareRadii: [0.9, 1.0], voluteSegs: 8, voluteR: 0.38, voluteConnectors: 4, abacusLayers: 2, abacusCross: 0, scale: 0.45, faces: 1,
            });
          });
        }
        if (lv.order === "corinthian") {
          b.at([0, 0, -3.8], 0, () => {
            b.set({ stage: "details", band: "corinthian half-columns", course: 0 });
            corinthian(b, { y0: lv.y0 + 0.5, segH: 3.5, segs: 3, radius: entasis(0.85, 0.75, 3, 0.02) }, { ribs: 12, ribStock: "D", backsPerFlute: 1, backStock: "D", fluteDepth: 0.1, ringSegments: 8, ringStock: "D" }, { rTop: 0.75, abacus: 2.2, capH: 2.2, leafLanes: 5, leafSegs: 3, clusters: 8, tier: 2 });
          });
        }
      });
    }
    // arches between neighbouring piers: A(localClearSpan, clear/2 (capped by level), 1.5, 12…6, 1)
    for (let i = 0; i < bays; i++) {
      const p = piers[i]!;
      const q = piers[(i + 1) % bays]!;
      const mid: [number, number] = [(p.p[0] + q.p[0]) / 2, (p.p[1] + q.p[1]) / 2];
      const span = Math.hypot(q.p[0] - p.p[0], q.p[1] - p.p[1]);
      const clear = span - 3;
      const rise = Math.min(lv.rise, clear / 2);
      const yaw = yawForX(q.p[0] - p.p[0], q.p[1] - p.p[1]);
      const spring = lv.y1 - 2 - rise - 1.5;
      b.at([mid[0], spring, mid[1]], yaw, () => {
        b.set({ comp: `bay ${i + 1}`, stage: "arches", band: `level ${li + 1} arches`, course: 0 });
        arch(b, clear, rise, 1.5, li === 0 ? 6 : 5, 1);
        // beam band over the arch to the level top
        b.set({ stage: "beams", band: `level ${li + 1} beams` });
        for (const z of [-2.5, -2, 2, 2.5]) chain(b, "M", [-span / 2, lv.y1 - spring - 0.75, z], [span / 2, lv.y1 - spring - 0.75, z], { up: [0, 1, 0] });
        for (const z of [-2.5, 2.5]) chain(b, "M", [-span / 2, lv.y1 - spring - 1.75, z], [span / 2, lv.y1 - spring - 1.75, z], { up: [0, 1, 0] });
        b.box([0, lv.y1 - spring - 1, 0], [span / 2, 1, 3]);
        b.shell([0, (lv.y1 - spring - 1.5 + (rise + 1.5)) / 2, -2.2], [span / 2 - 1.5, Math.max(0.2, (lv.y1 - spring - 1.5 - (rise + 1.5)) / 2), 0.25], "plank");
      });
      if (i % 4 === 0 && li === 0) {
        // every fourth bay: an inward radial passage
        b.set({ comp: `radial passage ${i / 4 + 1}`, stage: "beams", band: "radial passages", course: 0 });
        const dir: [number, number] = [-(p.out[0] + q.out[0]) / 2, -(p.out[1] + q.out[1]) / 2];
        const l = Math.hypot(dir[0], dir[1]);
        const d: V3 = [dir[0] / l, 0, dir[1] / l];
        const a: V3 = [mid[0], 0, mid[1]];
        const c: V3 = add(a, scale(d, 30));
        const side: V3 = [-d[2], 0, d[0]];
        for (const sgn of [-1, 1]) {
          for (const y of [4.25, 14.75]) chain(b, "M", add(add(a, scale(side, sgn * 5)), [0, y, 0]), add(add(c, scale(side, sgn * 5)), [0, y, 0]), { up: [0, 1, 0] });
          for (let k = 0; k <= 6; k++) {
            const pp = add(add(a, scale(d, k * 5)), scale(side, sgn * 5));
            chain(b, "M", add(pp, [0, 4, 0]), add(pp, [0, 15, 0]), { up: [0, 0, 1] });
          }
        }
        for (let k = 0; k <= 6; k++) chain(b, "M", add(add(a, scale(d, k * 5)), add(scale(side, -5), [0, 15, 0])), add(add(a, scale(d, k * 5)), add(scale(side, 5), [0, 15, 0])), { up: [0, 1, 0] });
      }
    }
  });
  b.plan("columns", "level 1 piers", 5);
  b.plan("arches", "level 1 arches", 1);
  // two upper beam bands and a three-layer projecting cornice at 62
  b.set({ comp: "cornice", stage: "beams", band: "upper cornice", course: 0 });
  for (let j = 0; j < 3; j++) {
    b.set({ course: j });
    const e = ellipseArc(AX - 5 + 0.4 * (j + 1), AZ - 5 + 0.4 * (j + 1));
    for (let i = 0; i < 64; i++) {
      const p = e.at((i * e.total) / 64);
      const q = e.at(((i + 1) * e.total) / 64);
      chain(b, "M", [p.p[0], 62.25 + j * 0.5, p.p[1]], [q.p[0], 62.25 + j * 0.5, q.p[1]], { up: [0, 1, 0], mode: "overhang" });
    }
  }
  b.plan("beams", "upper cornice", 3);
  // 62–74 upper wall: per bay four M vertical chains, two M horizontals, paired diagonals, a 1 m-recessed window
  for (let i = 0; i < bays; i++) {
    const p = piers[i]!;
    const q = piers[(i + 1) % bays]!;
    const mid: [number, number] = [(p.p[0] + q.p[0]) / 2, (p.p[1] + q.p[1]) / 2];
    const span = Math.hypot(q.p[0] - p.p[0], q.p[1] - p.p[1]);
    const yaw = yawForX(q.p[0] - p.p[0], q.p[1] - p.p[1]);
    b.at([mid[0], 0, mid[1]], yaw, () => {
      b.set({ comp: `attic ${i + 1}`, stage: "beams", band: "attic wall", course: 0 });
      for (const x of [-span / 2 + 0.25, -2.25, 2.25, span / 2 - 0.25]) chain(b, "M", [x, 64, 0], [x, 74, 0], { up: [0, 0, 1] });
      for (const y of [64.25, 73.75]) chain(b, "M", [-span / 2, y, 0], [span / 2, y, 0], { up: [0, 1, 0] });
      chain(b, "M", [-span / 2 + 0.5, 64.5, 0.5], [-2.5, 73.5, 0.5]);
      chain(b, "M", [span / 2 - 0.5, 64.5, 0.5], [2.5, 73.5, 0.5]);
      // recessed window frame
      b.set({ stage: "details", band: "attic windows" });
      for (const y of [67, 71]) chain(b, "D", [-2, y, 1], [2, y, 1], { up: [0, 1, 0] });
      for (const x of [-2, 2]) chain(b, "D", [x, 67, 1], [x, 71, 1], { up: [0, 0, 1] });
      b.shell([-(span / 4) - 1.1, 69, -0.1], [Math.max(0.2, span / 4 - 1.15), 4.8, 0.2], "plank");
      b.shell([span / 4 + 1.1, 69, -0.1], [Math.max(0.2, span / 4 - 1.15), 4.8, 0.2], "plank");
      b.box([0, 69, 0], [span / 2, 5, 0.6]);
      // crown 74–78: molding bands and an awning-support base (four M members)
      b.set({ stage: "roof", band: "crown" });
      for (let j = 0; j < 4; j++) chain(b, "M", [-span / 2, 74.25 + j * 0.5, -0.25 * j], [span / 2, 74.25 + j * 0.5, -0.25 * j], { up: [0, 1, 0] });
      for (const [x0, x1] of [[-0.6, -0.6], [0.6, 0.6], [-0.6, 0.2], [0.6, -0.2]] as const) chain(b, "M", [x0, 74, -1.2], [x1, 78, -1.6], { up: [0, 0, 1] });
    });
  }
  b.plan("beams", "attic wall", 1);
  b.plan("roof", "crown", 1);
  // ring corridor deck at levels 2 and 3 (inside the arcade), 6 m wide
  for (const y of [24, 44]) {
    b.set({ comp: "corridors", stage: "beams", band: `corridor ${y}`, course: 0 });
    const e = ellipseArc(AX - 11, AZ - 11);
    for (let i = 0; i < 96; i++) {
      const p = e.at((i * e.total) / 96);
      const q = e.at(((i + 1) * e.total) / 96);
      for (let k = 0; k < 6; k++) {
        const o = k * 1.02 - 2.55;
        b.with({ tier: 2 }, () => chain(b, "M", [p.p[0] + p.out[0] * o, y + 0.25, p.p[1] + p.out[1] * o], [q.p[0] + q.out[0] * o, y + 0.25, q.p[1] + q.out[1] * o], { up: [0, 1, 0], mode: "overhang" }));
      }
      const mid = e.at(((i + 0.5) * e.total) / 96);
      b.box([mid.p[0], y - 0.25, mid.p[1]], [((e.total / 96) * 1.05) / 2, 0.5, 3], yawForX(mid.t[0], mid.t[1]));
    }
  }
  // seating: three zones of eight steps (24), each step 48 radial sectors of M frames and D decking
  const seatOuter = { ax: AX - 16, az: AZ - 16 };
  for (let st = 0; st < 24; st++) {
    b.set({ comp: "seating", stage: "beams", band: "seating", course: st });
    const zone = Math.floor(st / 8);
    const inset = st * 1.6 + zone * 2;
    const y = 30 - st * 1.15 - zone * 0.8;
    const e = ellipseArc(seatOuter.ax - inset, seatOuter.az - inset);
    for (let i = 0; i < 48; i++) {
      const s0 = (i * e.total) / 48;
      const s1 = ((i + 1) * e.total) / 48;
      const p = e.at(s0);
      const q = e.at(s1);
      // leave the four main routes open in the lowest zone (vomitoria): sectors 0, 12, 24, 36
      if (zone === 2 && i % 12 === 0) continue;
      chain(b, "M", [p.p[0], y, p.p[1]], [q.p[0], y, q.p[1]], { up: [0, 1, 0], mode: "overhang" });
      chain(b, "M", [p.p[0], y - 0.5, p.p[1]], [p.p[0] - p.out[0] * 1.6, y - 0.5, p.p[1] - p.out[1] * 1.6], { up: [0, 1, 0] });
      b.with({ tier: 2 }, () => {
        for (const o of [0.4, 0.8, 1.2]) chain(b, "D", [p.p[0] - p.out[0] * o, y + 0.06, p.p[1] - p.out[1] * o], [q.p[0] - q.out[0] * o, y + 0.06, q.p[1] - q.out[1] * o], { up: [0, 1, 0], mode: "overhang" });
      });
      const mid = e.at((s0 + s1) / 2);
      b.box([mid.p[0] - mid.out[0] * 0.8, y - 0.5, mid.p[1] - mid.out[1] * 0.8], [((s1 - s0) * 1.05) / 2, 0.55, 0.85], yawForX(mid.t[0], mid.t[1]));
    }
  }
  b.plan("beams", "seating", 24);
  // the arena floor: a plank deck at the ground; the base ring steps are crossed on ramps at the four gates
  b.shell([0, 0.15, 0], [AX - 50, 0.1, AZ - 50], "plank");
  b.set({ comp: "main" });
  b.feature("three superposed arcades with plain / Ionic / Corinthian half-columns", [piers[6]!.p[0], 30, piers[6]!.p[1]]);
  b.feature("upper attic wall with rectangular windows", [piers[6]!.p[0], 70, piers[6]!.p[1]]);
  b.feature("24 seating steps around an open arena", [0, 10, 0]);
  const e0 = outer.at(0.5 * ds);
  b.entry("main", [e0.p[0] + e0.out[0] * 12, 0, e0.p[1] + e0.out[1] * 12], [0, 3, 0], 10, 8, true, "through a ground arch and radial passage into the arena");
  const bay18 = outer.at((18 + 0.5) * ds);
  b.entry("upper", [bay18.p[0] + bay18.out[0] * 14, 51, bay18.p[1] + bay18.out[1] * 14], [0, 51, 0], 8, 6, false, "fly through a third-level arch over the seating");
  b.viewAt("ground", "ground", [e0.p[0] + e0.out[0] * 30, 1.65, e0.p[1] + e0.out[1] * 30], [e0.p[0], 40, e0.p[1]], "facing the four-storey wall");
  b.viewAt("interior", "interior", [0, 4.65, 0], [0, 30, -AZ + 10], "the arena among the seating");
  b.viewAt("high", "high", [200, 140, -200], [0, 30, 0], "the whole ellipse");
  b.viewAt("detail", "detail", [piers[6]!.p[0] + piers[6]!.out[0] * 10, 30, piers[6]!.p[1] + piers[6]!.out[1] * 10], [piers[6]!.p[0], 35, piers[6]!.p[1]], "Ionic half-column on the second level");
  b.safe("outside", [e0.p[0] + e0.out[0] * 32, 0, e0.p[1] + e0.out[1] * 32], 0);
  b.safe("arena", [0, 3, 0], 0);
}

// ================================================================= L07

/**
 * L07 Oculus Hall, 112 × 144 × 86. Rotunda (outside Ø 96 → 112 with the base
 * steps) on +z, a portico on −z; a hemispherical rib-and-ring dome of radius
 * 42 truncated at the 5 m oculus; coffers in five latitude bands.
 */
export function L07(b: Builder): void {
  const cz = 16; // rotunda centre; portico extends to z = −72
  const R = 48; // outside radius of the drum
  b.revise({ item: "L07 plan", original: "rotunda outside Ø 96, overall depth 144, envelope width 112", revised: "drum Ø 96 centred at z = +16; six base bands step out to Ø 112; portico from z = −72 to the drum", reason: "the 112 m width is the stepped base, the 144 m depth is base + portico", impact: "none on the dome" });
  // base 0–6: six 1 m bands, perimeter 64 M-frame segments
  for (let j = 0; j < 6; j++) {
    b.set({ comp: "base", stage: "base", band: "rotunda base", course: j });
    const r = 56 - j * 1.4;
    for (let i = 0; i < 64; i++) {
      const a0 = (2 * Math.PI * i) / 64;
      const a1 = (2 * Math.PI * (i + 1)) / 64;
      for (const dy of [0.25, 0.75]) chain(b, "M", [r * Math.cos(a0), j + dy, cz + r * Math.sin(a0)], [r * Math.cos(a1), j + dy, cz + r * Math.sin(a1)], { up: [0, 1, 0], mode: "overhang" });
    }
    b.cyl([0, j + 0.5, cz], r, 0.5);
  }
  b.plan("base", "rotunda base", 6);
  b.set({ stage: "base", band: "floor", course: 0 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, 6.5, cz, 90, 90, "x"));
  b.plan("base", "floor", 1);
  approach(b, 0, 0, -72 - 36, 24, 6, 1, "front");
  // portico platform z −72…−30
  b.with({ comp: "portico base" }, () => platform(b, { cx: 0, cz: -50, w: 56, d: 44, bands: [0, 0, 0].map(() => ({ h: 2, inset: 0 })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", band: "portico base" }));
  // drum 6–42: 32 sectors × nine 4 m segments; eight deep niches; a front passage ≥ 16 m
  const sectors = 32;
  for (let i = 0; i < sectors; i++) {
    const a0 = (2 * Math.PI * i) / sectors - Math.PI / 2;
    const a1 = (2 * Math.PI * (i + 1)) / sectors - Math.PI / 2;
    const am = (a0 + a1) / 2;
    const front = Math.abs(Math.sin(am) + 1) < 0.07; // sector centred near −z (the portico)
    const isFrontPair = i === 15 || i === 16 || i === 31 || i === 0;
    void isFrontPair;
    const niche = i % 4 === 2;
    for (let s = 0; s < 9; s++) {
      b.set({ comp: `drum sector ${i + 1}`, stage: "columns", band: "drum", course: s });
      const ya = 6 + s * 4;
      const yb = ya + 4;
      const open = (front || frontGap(am)) && yb <= 30;
      const p = (a: number, r: number, y: number): V3 => [r * Math.cos(a), y, cz + r * Math.sin(a)];
      // four M vertical chains per sector/course (two pairs at the sector edges, inner and outer leaf)
      for (const r of [R - 0.25, R - 2.25]) chain(b, "M", p(a0, r, ya), p(a0, r, yb), { up: [Math.cos(a0), 0, Math.sin(a0)] });
      if (!open) {
        for (const r of [R - 0.25, R - 2.25]) for (const y of [ya + 0.25, yb - 0.25]) chain(b, "M", p(a0, r, y), p(a1, r, y), { up: [0, 1, 0], mode: "overhang" });
        b.with({ tier: 2 }, () => {
          chain(b, "D", p(a0, R - 0.25 - 0.2, ya + 0.5), p(a1, R - 0.25 - 0.2, yb - 0.5));
          chain(b, "D", p(a1, R - 0.25 - 0.2, ya + 0.5), p(a0, R - 0.25 - 0.2, yb - 0.5));
        });
      }
      if (niche && s < 5 && !open) {
        // a deep niche: the inner leaf steps back 3 m
        b.set({ stage: "details", band: "niches" });
        for (const y of [ya + 0.25, yb - 0.25]) chain(b, "M", p(a0, R - 5, y), p(a1, R - 5, y), { up: [0, 1, 0], mode: "overhang" });
      }
    }
    if (!(front || frontGap(am))) {
      const mid: V3 = [(R - 1.25) * Math.cos(am), 24, cz + (R - 1.25) * Math.sin(am)];
      b.box(mid, [((2 * Math.PI * R) / sectors) / 2 + 0.3, 18, 1.5], yawForX(-Math.sin(am), Math.cos(am)));
      b.shell([(R - 1.25) * Math.cos(am), 24, cz + (R - 1.25) * Math.sin(am)], [((2 * Math.PI * (R - 1.25)) / sectors) / 2, 18, 0.8], "plank", { yaw: yawForX(-Math.sin(am), Math.cos(am)) });
    } else {
      // over the 24 m-high front passage
      const mid: V3 = [(R - 1.25) * Math.cos(am), 36, cz + (R - 1.25) * Math.sin(am)];
      b.box(mid, [((2 * Math.PI * R) / sectors) / 2 + 0.3, 6, 1.5], yawForX(-Math.sin(am), Math.cos(am)));
    }
  }
  b.plan("columns", "drum", 9);
  // portico 6–36: sixteen columns (eight front, two rows of four leaving the centre clear)
  const pc: V3[] = [];
  for (let k = 0; k < 8; k++) pc.push([-24.5 + 7 * k, 6, -68]);
  for (const z of [-58, -48]) for (const x of [-24.5, -17.5, 17.5, 24.5]) pc.push([x, 6, z]);
  pc.forEach((p, k) => {
    b.at(p, 0, () => {
      b.set({ comp: `portico column ${k + 1}` });
      // six 4 m segments, 24 M ribs + 24 D rings per segment; 16 leaf clusters of 5 bent D lanes; three abacus layers
      corinthian(b, { y0: 0.6, segH: 4, segs: 6, radius: entasis(1.75, 1.5, 6, 0.04) }, { ribs: 24, ribStock: "M", backsPerFlute: 0, backStock: "D", fluteDepth: 0.15, ringSegments: 24, ringStock: "D" }, { rTop: 1.5, abacus: 4.4, capH: 3, leafLanes: 5, leafSegs: 1, clusters: 8, base: { y0: 0, rings: 2 } });
      b.footing([0, 0, 0]);
    });
  });
  b.revise({ item: "L07 portico capitals", original: "16 × 5 D leaf groups and three abacus layers", revised: "two rows of eight clusters (16) of five D leaf lanes, each lane bent in two (lower row) or four (upper row) D runs so the cluster widens, closes to a point and turns its tip down; three stepped abacus frames", reason: "with one run per lane the five lanes of a cluster fell on the same line; the builder dropped four of five as coincident duplicates, leaving 32 single sticks per capital that read as loose wires (inspector review 2026-11-04); the brief asks for broad, opening, pointed clusters", impact: "240 leaf D per capital instead of the 32 that survived (+3,328 pieces over the sixteen portico columns)" });
  // portico roof: triangular, rising to 44 and joining the drum
  b.set({ comp: "portico roof" });
  pitchedRoof(b, { x0: -29, x1: 29, z0: -71, z1: -26, y0: 36, y1: 44, trusses: 6, chord: "M", web: "D", webs: 3, band: "portico roof", strips: 2 });
  b.set({ stage: "beams", band: "portico beam", course: 0 });
  rect(b, "M", 0, 34.6, -48, 56, 46, 3);
  b.plan("beams", "portico beam", 1);
  // dome 42–83.7: 48 meridional ribs × 24 segments, y_j = 42 + sqrt(42² − 5²)·j/24, r(y) = sqrt(42² − (y − 42)²)
  const prof = { rings: Array.from({ length: 25 }, (_, j) => {
    const y = 42 + (Math.sqrt(42 * 42 - 25) * j) / 24;
    return { r: Math.sqrt(Math.max(0, 42 * 42 - (y - 42) * (y - 42))), y };
  }) };
  b.set({ comp: "dome" });
  b.set({ stage: "roof", band: "dome" });
  dome(b, 0, cz, prof, 48, { ribStock: "M", ribDouble: true, ringStock: "M", ribBand: "dome ribs", ringBand: "dome rings" });
  b.plan("roof", "dome ribs", 24);
  b.plan("roof", "dome rings", 25);
  // a ring beam where the dome springs from the drum (radius 42 inside a 48 m drum): a stepped M ledge
  b.set({ stage: "roof", band: "dome springing", course: 0 });
  for (let j = 0; j < 6; j++) ring(b, "M", 0, 41.75 - j * 0.0 + 0, cz, 42 + j, 64, 1);
  b.plan("roof", "dome springing", 1);
  // coffers: five latitude bands × 28 cells, three inset D frames 0.25 m apart
  b.set({ stage: "details", band: "coffers", course: 0 });
  for (let band = 0; band < 5; band++) {
    b.set({ course: band });
    const j0 = 2 + band * 3;
    const j1 = j0 + 2;
    const p0 = prof.rings[j0]!;
    const p1 = prof.rings[j1]!;
    for (let c = 0; c < 28; c++) {
      const a0 = (2 * Math.PI * c) / 28 + 0.02;
      const a1 = (2 * Math.PI * (c + 1)) / 28 - 0.02;
      for (let f = 0; f < 3; f++) {
        const inset = 0.6 + f * 0.25;
        const shrinkA = (a1 - a0) * 0.08 * f;
        const r0 = p0.r - inset;
        const r1 = p1.r - inset;
        const y0 = p0.y + 0.3 + f * 0.25;
        const y1 = p1.y - 0.3 - f * 0.15;
        const q = (a: number, r: number, y: number): V3 => [r * Math.cos(a), y, cz + r * Math.sin(a)];
        chain(b, "D", q(a0 + shrinkA, r0, y0), q(a1 - shrinkA, r0, y0), { mode: "overhang" });
        chain(b, "D", q(a0 + shrinkA, r1, y1), q(a1 - shrinkA, r1, y1), { mode: "overhang" });
        chain(b, "D", q(a0 + shrinkA, r0, y0), q(a0 + shrinkA, r1, y1), { mode: "overhang" });
        chain(b, "D", q(a1 - shrinkA, r0, y0), q(a1 - shrinkA, r1, y1), { mode: "overhang" });
      }
    }
  }
  b.plan("details", "coffers", 5);
  // the shell behind the ribs (the dome reads closed; the oculus stays open)
  for (let j = 0; j < 24; j++) {
    const p = prof.rings[j]!;
    const q = prof.rings[j + 1]!;
    const segs = 48;
    for (let i = 0; i < segs; i += 2) {
      void i;
    }
    const rm = (p.r + q.r) / 2 + 0.6;
    b.shell([0, (p.y + q.y) / 2, cz], [rm, Math.max(0.15, (q.y - p.y) / 2), rm], "plank");
  }
  // oculus rim 83.7–86: about 2.3 m of rim around a 10 m opening
  b.set({ stage: "roof", band: "oculus rim", course: 0 });
  for (let j = 0; j < 5; j++) ring(b, "M", 0, 83.7 + j * 0.5, cz, 5.3 + 0.25 * (j % 2), 24, 1);
  b.plan("roof", "oculus rim", 1);
  // dome collision: stacked rings of boxes following the dome surface, oculus open
  for (let j = 0; j < 24; j += 2) {
    const p = prof.rings[j]!;
    const q = prof.rings[Math.min(24, j + 2)]!;
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / n;
      const rm = (p.r + q.r) / 2;
      b.box([rm * Math.cos(a), (p.y + q.y) / 2, cz + rm * Math.sin(a)], [(Math.PI * Math.max(p.r, q.r)) / n + 0.4, Math.max(0.6, (q.y - p.y) / 2 + 0.3), Math.max(0.6, Math.abs(p.r - q.r) / 2 + 0.6)], yawForX(-Math.sin(a), Math.cos(a)));
    }
  }
  b.set({ comp: "main" });
  b.feature("coffered dome with five latitude bands", [0, 60, cz]);
  b.feature("open oculus 10 m across", [0, 85, cz]);
  b.feature("Corinthian portico with triangular roof", [0, 40, -68]);
  b.entry("portico", [0, 0, -110], [0, 6, cz], 16, 24, true, "up the steps, through the portico and the 16 m drum passage");
  b.entry("oculus", [0, 60, cz], [0, 100, cz], 9, 9, true, "rise through the open oculus");
  b.viewAt("ground", "ground", [6, 1.65, -112], [0, 40, -40], "the portico and the dome behind");
  b.viewAt("interior", "interior", [0, 7.65, cz + 20], [0, 70, cz - 6], "under the coffers, the oculus overhead");
  b.viewAt("high", "high", [-100, 120, -120], [0, 60, cz], "the dome and its oculus");
  b.viewAt("detail", "detail", [-14, 30, -78], [-17.5, 34, -68], "Corinthian portico capital (flight)");
  b.safe("front", [0, 0, -112], 0);
  b.safe("rotunda", [0, 6, cz + 10], Math.PI);
  b.safe("portico", [0, 6, -50], 0);
}
/** The front passage in the drum faces the portico: the four sectors centred within ±17° of −z. */
function frontGap(am: number): boolean {
  const d = Math.atan2(Math.sin(am + Math.PI / 2), Math.cos(am + Math.PI / 2));
  return Math.abs(d) < (17 * Math.PI) / 180;
}

// ================================================================= L08

/**
 * L08 Floating Dome Hall, 136 × 176 × 96. Four piers carry four great arches;
 * pendentives turn the square into the circle of a clerestory drum; a spherical
 * cap above; two half-domes extend the space along z.
 */
export function L08(b: Builder): void {
  // base 0–6
  b.set({ comp: "base" });
  const y6 = platform(b, { w: 136, d: 176, bands: Array.from({ length: 6 }, (_, k) => ({ h: 1, inset: k * 0.5 })), frameStock: "M", framesPerBand: 2, gridP: 8, deckStock: "M", deckAxis: "z", band: "base" });
  approach(b, 0, 0, -88 + 2.5 - 36, 20, y6, 1, "west");
  // four 12 × 12 piers at the corners of the central 64 × 64 space; centres at ±38
  const P = 38;
  const pierTop = y6 + 36; // 6–42
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.at([sx * P, 0, sz * P], 0, () => {
        b.set({ comp: `pier ${sx > 0 ? "E" : "W"}${sz > 0 ? "N" : "S"}`, stage: "columns", band: "piers" });
        for (let s = 0; s < 9; s++) {
          b.set({ course: s });
          const ya = y6 + s * 4;
          // 16 B edge verticals (four per corner) plus four F(12,4,4,2) faces
          for (const cx of [-1, 1]) for (const cz2 of [-1, 1]) for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) chain(b, "B", [cx * (5.5 + ox), ya, cz2 * (5.5 + oz)], [cx * (5.5 + ox), ya + 4, cz2 * (5.5 + oz)], { up: [0, 0, 1], mode: "lap", within: [y6, pierTop] });
          trussFace(b, "M", -6, ya, 6, ya + 4, -6.25, { bottom: s === 0, sides: false });
          trussFace(b, "M", -6, ya, 6, ya + 4, 6.25, { bottom: s === 0, sides: false });
          b.at([0, 0, 0], Math.PI / 2, () => {
            trussFace(b, "M", -6, ya, 6, ya + 4, -6.25, { bottom: s === 0, sides: false });
            trussFace(b, "M", -6, ya, 6, ya + 4, 6.25, { bottom: s === 0, sides: false });
          });
        }
        b.shell([0, y6 + 18, 0], [5.6, 18, 5.6], "plank");
        b.box([0, y6 + 18, 0], [6, 18, 6]);
        b.footing([0, y6, 0]);
      });
    }
  }
  b.plan("columns", "piers", 9);
  b.revise({ item: "L08 main arches", original: "approximately 56 m span, 24 m rise, A(56,24,3,8,4), 42–66", revised: "clear span 64 − 0 between pier inner faces = 64 m at 44 → resolved as A(64, 24, 3, 8, 4) springing at 42 + 2 = 44 on a 2 m pier cap, crown 68 + 3", reason: "the piers' inner faces stand 64 m apart (the retained central space); a 56 m arch would not land on them", impact: "pendentives fill the spandrels between the crowns at 68; the drum sits on 68–76" });
  // pier caps and four great arches springing at y6 + 38 = 44 over the 64 m clear space
  const spring = y6 + 38;
  b.set({ comp: "great arches", stage: "base", band: "pier caps", course: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rect(b, "M", sx * P, pierTop, sz * P, 13, 13, 4);
  b.plan("base", "pier caps", 1);
  b.set({ stage: "arches", band: "great arches", course: 0 });
  for (const [yaw, off] of [[0, -P], [0, P], [Math.PI / 2, -P], [Math.PI / 2, P]] as const) {
    b.at(yaw === 0 ? [0, spring, off] : [off, spring, 0], yaw, () => {
      const r = arch(b, 64, 24, 3, 8, 4);
      // an extra D tie every four angular segments (inside the arch depth)
      for (let k = 0; k <= r.N; k += 4) {
        const p = r.shape.at(k / r.N);
        chain(b, "D", [(p.inner[0] + p.outer[0]) / 2, (p.inner[1] + p.outer[1]) / 2 + 0.5, -3.5], [(p.inner[0] + p.outer[0]) / 2, (p.inner[1] + p.outer[1]) / 2 + 0.5, -2.5]);
      }
    });
  }
  b.plan("arches", "great arches", 1);
  // pendentives 44–68: twelve rising courses each; a spherical triangle between two arch crowns,
  // expanding from ~2 m at the corner to ~32 m wide at the top, 8 fan ribs plus tangent chains
  const domeR = 32;
  const ySphere = spring; // the pendentive sphere is centred at the hall centre at spring height
  const Rp = Math.SQRT2 * 32 + 1; // circumsphere through the corners (≈ 46.3)
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    b.set({ comp: `pendentive ${sx > 0 ? "E" : "W"}${sz > 0 ? "N" : "S"}`, stage: "arches", band: "pendentives" });
    const aMid = Math.atan2(sz, sx);
    for (let c = 0; c < 12; c++) {
      b.set({ course: c });
      const y = ySphere + ((c + 0.5) * 24) / 12;
      const rr = Math.sqrt(Math.max(1, Rp * Rp - (y - ySphere) * (y - ySphere)));
      // the course is the circle of radius rr clipped to the square |x|,|z| ≤ 32: between the arch planes
      const lim = Math.acos(Math.min(1, 32 / rr));
      const half = Math.max(0.02, Math.PI / 4 - lim);
      const n = Math.max(1, Math.ceil((2 * half * rr) / 4));
      for (let i = 0; i < n; i++) {
        const a0 = aMid - half + (2 * half * i) / n;
        const a1 = aMid - half + (2 * half * (i + 1)) / n;
        chain(b, "M", [rr * Math.cos(a0), y, rr * Math.sin(a0)], [rr * Math.cos(a1), y, rr * Math.sin(a1)], { up: [0, 1, 0], mode: "overhang" });
      }
    }
    // eight fan ribs rising from the pier corner
    for (let f = 0; f < 8; f++) {
      const t = (f + 0.5) / 8;
      const pts: V3[] = [];
      for (let k = 0; k <= 6; k++) {
        const y = ySphere + (k * 24) / 6;
        const rr = Math.sqrt(Math.max(1, Rp * Rp - (y - ySphere) * (y - ySphere)));
        const lim = Math.acos(Math.min(1, 32 / rr));
        const half = Math.max(0, Math.PI / 4 - lim);
        const a = aMid - half + 2 * half * t;
        pts.push([(rr - 0.6) * Math.cos(a), y, (rr - 0.6) * Math.sin(a)]);
      }
      for (let k = 0; k < 6; k++) chain(b, "D", pts[k]!, pts[k + 1]!, { mode: "overhang" });
    }
    // collision: boxes stepping inward
    for (let c = 0; c < 6; c++) {
      const y = ySphere + ((c + 0.5) * 24) / 6;
      const rr = Math.sqrt(Math.max(1, Rp * Rp - (y - ySphere) * (y - ySphere)));
      b.box([sx * (rr / Math.SQRT2) * 0.98, y, sz * (rr / Math.SQRT2) * 0.98], [3 + c * 2, 2, 1.2], yawForX(-sz, sx));
    }
    b.shell([sx * 24, ySphere + 14, sz * 24], [10, 9, 1.5], "plank", { yaw: yawForX(-sz, sx) });
  }
  b.plan("arches", "pendentives", 12);
  // clerestory drum 68–76: 32 window bays, two M verticals and two upper/two lower M chains per bay (shared posts once)
  const yd = ySphere + 24;
  b.set({ comp: "drum", stage: "columns", band: "drum", course: 0 });
  for (let i = 0; i < 32; i++) {
    const a0 = (2 * Math.PI * i) / 32;
    const a1 = (2 * Math.PI * (i + 1)) / 32;
    const p = (a: number, r: number, y: number): V3 => [r * Math.cos(a), y, r * Math.sin(a)];
    chain(b, "M", p(a0, domeR, yd), p(a0, domeR, yd + 8), { up: [Math.cos(a0), 0, Math.sin(a0)] });
    chain(b, "M", p(a0 + 0.06, domeR, yd), p(a0 + 0.06, domeR, yd + 8), { up: [Math.cos(a0), 0, Math.sin(a0)] });
    for (const y of [yd + 0.25, yd + 0.75, yd + 7.25, yd + 7.75]) chain(b, "M", p(a0, domeR, y), p(a1, domeR, y), { up: [0, 1, 0], mode: "overhang" });
    const am = (a0 + a1) / 2;
    b.box([domeR * Math.cos(a0), yd + 4, domeR * Math.sin(a0)], [0.6, 4, 0.6]);
    void am;
  }
  b.cyl([0, yd - 0.5, 0], domeR + 1, 0.5);
  b.plan("columns", "drum", 1);
  // main dome 76–96: spherical cap, base radius 32, rise 20; 32 ribs × 16 segments, 16 rings
  b.set({ comp: "main dome", stage: "roof" });
  const cap = sphereCap(domeR, yd + 8, 20, 16);
  dome(b, 0, 0, cap, 32, { ribStock: "M", ribDouble: true, ringStock: "M", ribBand: "dome ribs", ringBand: "dome rings" });
  b.plan("roof", "dome ribs", 16);
  b.plan("roof", "dome rings", 16); // the apex ring has radius 0 and is a point, not a ring
  for (let j = 0; j < 16; j++) {
    const p = cap.rings[j]!;
    const q = cap.rings[j + 1]!;
    b.shell([0, (p.y + q.y) / 2 + 0.4, 0], [(p.r + q.r) / 2 + 0.3, Math.max(0.12, (q.y - p.y) / 2), (p.r + q.r) / 2 + 0.3], "plank");
    for (let i = 0; i < 16 && j % 2 === 0; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / 16;
      const rm = (p.r + q.r) / 2;
      b.box([rm * Math.cos(a), (p.y + q.y) / 2 + 0.6, rm * Math.sin(a)], [(Math.PI * p.r) / 16 + 0.5, Math.max(0.6, (q.y - p.y) / 2 + 0.6), 1], yawForX(-Math.sin(a), Math.cos(a)));
    }
  }
  // two half-domes on ±z: radius 24, rise 16, spring 48 → top 64; 16 ribs × 12 segments, 12 half-rings
  for (const sz of [-1, 1]) {
    b.set({ comp: `half-dome ${sz > 0 ? "N" : "S"}`, stage: "roof" });
    const half = sphereCap(24, y6 + 42, 16, 12);
    dome(b, 0, sz * (P + 6), half, 16, { ribStock: "M", ribDouble: false, ringStock: "M", arc: sz > 0 ? [0, Math.PI] : [Math.PI, 2 * Math.PI], ribBand: "half-dome ribs", ringBand: "half-dome rings" });
    for (let j = 0; j < 12; j += 2) {
      const p = half.rings[j]!;
      const q = half.rings[Math.min(12, j + 2)]!;
      for (let i = 0; i < 8; i++) {
        const a = (sz > 0 ? 0 : Math.PI) + (Math.PI * (i + 0.5)) / 8;
        const rm = (p.r + q.r) / 2;
        b.box([rm * Math.cos(a), (p.y + q.y) / 2, sz * (P + 6) + rm * Math.sin(a)], [(Math.PI * p.r) / 16 + 0.5, Math.max(0.6, (q.y - p.y) / 2 + 0.3), 1], yawForX(-Math.sin(a), Math.cos(a)));
      }
      b.shell([0, (p.y + q.y) / 2, sz * (P + 6) + sz * ((p.r + q.r) / 4)], [(p.r + q.r) / 2, Math.max(0.12, (q.y - p.y) / 2), (p.r + q.r) / 4], "plank");
    }
    // three smaller niches beneath each half-dome: A(10, 5, 1, 4, 1)
    b.set({ stage: "arches", band: "half-dome niches", course: 0 });
    for (const k of [-1, 0, 1]) {
      const a = (sz > 0 ? Math.PI / 2 : -Math.PI / 2) + k * 0.7;
      b.at([20 * Math.cos(a), y6 + 14, sz * (P + 6) + 20 * Math.sin(a)], yawForX(-Math.sin(a), Math.cos(a)), () => arch(b, 10, 5, 1, 4, 1));
    }
  }
  b.plan("roof", "half-dome ribs", 12);
  b.plan("arches", "half-dome niches", 1);
  // side aisles: two 18 m levels on ±x, six arched bays per side and 24 attached columns
  for (const sx of [-1, 1]) {
    b.set({ comp: `aisle ${sx > 0 ? "E" : "W"}`, stage: "arches", band: "aisle arcades" });
    for (let k = 0; k < 6; k++) {
      b.set({ course: k });
      const z = -50 + k * 20;
      for (const lvl of [0, 1]) {
        b.at([sx * 52, y6 + lvl * 18 + 8, z], Math.PI / 2, () => arch(b, 14, 7, 1, 4, 1));
      }
      // attached columns at bay edges: 2 per bay per side = 24 total
      for (const dz of [-8.5, 8.5]) {
        b.at([sx * 52, y6, z + dz], 0, () => {
          b.set({ stage: "details", band: "attached columns" });
          for (let s = 0; s < 4; s++) ring(b, "D", 0, 2 + s * 4, 0, 1, 12, 1);
          for (let i = 0; i < 8; i++) {
            const a = (2 * Math.PI * i) / 8;
            chain(b, "M", [Math.cos(a), 0, Math.sin(a)], [Math.cos(a), 16, Math.sin(a)], { up: [Math.cos(a), 0, Math.sin(a)] });
          }
          b.cyl([0, 8, 0], 1.2, 8);
          b.set({ stage: "arches", band: "aisle arcades" });
        });
      }
    }
    // the aisle gallery floor at 18 and an outer wall frame with windows
    b.set({ stage: "beams", band: "aisle gallery", course: 0 });
    b.with({ tier: 2 }, () => deck(b, "M", sx * 58, y6 + 18.5, 0, 12, 128, "z"));
    b.box([sx * 58, y6 + 18, 0], [6, 0.5, 64]);
    b.set({ stage: "beams", band: "aisle walls", course: 0 });
    for (let k = 0; k < 6; k++) {
      const z = -50 + k * 20;
      for (const y of [y6 + 0.25, y6 + 17.75, y6 + 35.75]) chain(b, "M", [sx * 66, y, z - 10], [sx * 66, y, z + 10], { up: [0, 1, 0] });
      for (const dz of [-10, -3.5, 3.5, 10]) chain(b, "M", [sx * 66, y6, z + dz], [sx * 66, y6 + 36, z + dz], { up: [1, 0, 0] });
      const wallFrom = sx > 0 && k === 3 ? y6 : y6 + 9;
      b.box([sx * 66, (wallFrom + y6 + 35) / 2, z - 6.75], [0.6, (y6 + 35 - wallFrom) / 2, 3.2]);
      b.box([sx * 66, (wallFrom + y6 + 35) / 2, z + 6.75], [0.6, (y6 + 35 - wallFrom) / 2, 3.2]);
      // a sill under the windows, except the east door bay (z = 10), which opens to the ground
      if (!(sx > 0 && k === 3)) b.box([sx * 66, y6 + 2, z], [0.6, 2, 10]);
      b.shell([sx * 66, y6 + 22, z - 6.75], [0.25, 13, 3.1], "plank");
      b.shell([sx * 66, y6 + 22, z + 6.75], [0.25, 13, 3.1], "plank");
    }
    b.set({ stage: "roof", band: "aisle roofs", course: 0 });
    b.with({ tier: 2 }, () => deck(b, "M", sx * 55, y6 + 36.5, 0, 22, 130, "z"));
    b.box([sx * 55, y6 + 36, 0], [11, 0.6, 65]);
  }
  b.plan("arches", "aisle arcades", 6);
  b.set({ comp: "main" });
  b.feature("four pendentives turning the square into the drum's circle", [24, ySphere + 14, 24]);
  b.feature("a ring of 32 clerestory windows under the dome", [0, yd + 4, 32]);
  b.feature("two half-domes extending the central space", [0, y6 + 50, P + 20]);
  b.entry("west", [0, 0, -130], [0, y6, 0], 16, 20, true, "up the west flight and under the half-dome into the central space");
  b.entry("aisle", [-50, y6, -60], [-50, y6, 60], 8, 12, false, "along the north aisle arcade");
  b.entry("side-exit", [0, y6, 10], [80, y6, 10], 10, 10, true, "out through an east aisle bay door (the dome is closed; this is its exit)");
  b.viewAt("ground", "ground", [8, 1.65, -132], [0, 50, -20], "the west front and the floating dome");
  b.viewAt("interior", "interior", [6, y6 + 1.65, -6], [0, yd + 14, 8], "looking up at the pendentives and the ring of windows");
  b.viewAt("high", "high", [150, 140, -150], [0, 60, 0], "the domes above the roofs");
  b.viewAt("detail", "detail", [20, ySphere + 10, 18], [32, ySphere + 14, 32], "a pendentive (flight)");
  b.safe("west", [0, 0, -132], 0);
  b.safe("centre", [0, y6, 0], 0);
  b.safe("gallery", [58, y6 + 19, 0], -Math.PI / 2);
}

export const _rb = { trussQuad, sec };
