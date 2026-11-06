// Region C — Cities and Halls: L09 Double-Ring Sea Castle, L10 Pointed-Arch
// Cloud Nave, L11 Eight-Lobed Dome Palace, L12 Embrace Square.
import { add, Builder, norm, scale, sub, type V3 } from "../core.ts";
import { arch, chain, deck, dome, floorGrid, rect, ring, sec, sphereCap, trussFace, trussQuad, wall, yawForX } from "../parts.ts";
import { corinthian, entasis } from "../orders.ts";
import { along, approach, cone, ngon, outward, pitchedRoof, platform, polyShaft, rails, triTruss } from "./common.ts";


/** A framed wall from plan point a to plan point c (local +x runs a → c). */
function wallAB(b: Builder, a: V3, c: V3, y0: number, H: number, p: number, o: Parameters<typeof wall>[5] = {}): void {
  const L = Math.hypot(c[0] - a[0], c[2] - a[2]);
  b.at([a[0], 0, a[2]], yawForX(c[0] - a[0], c[2] - a[2]), () => wall(b, L, y0, H, p, o));
}

// ================================================================= L09

/**
 * L09 Double-Ring Sea Castle, 176 × 152 × 108. An outer polygon of eight wall
 * runs between eight towers, an inner ring 120 × 96, offset gates and a
 * six-storey keep with corner caps and a central spire.
 */
export function L09(b: Builder): void {
  // rock platform 0–8: four 2 m bands with retaining walls
  b.set({ comp: "platform" });
  const y8 = platform(b, { w: 176, d: 152, bands: [0, 1, 2, 3].map((inset) => ({ h: 2, inset })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", band: "rock platform" });
  // two entries at different elevations: the main gate ramp on −z and a lower postern on +x
  approach(b, -79 + (79 / Math.hypot(79, 1)) * 46, 0, -76 + 3 - 32, 12, y8, 1, "gate");
  b.with({ comp: "approach postern" }, () => b.at([88 - 3 + 16, 0, 30], -Math.PI / 2, () => approach(b, 0, 0, -16, 8, y8, 1, "postern")));
  // eight outer towers on an octagon-ish ring: four reach 64, four reach 72
  const tw: { p: V3; top: number }[] = [
    [-79, -67], [0, -68], [79, -67], [80, 0], [79, 67], [0, 68], [-79, 67], [-80, 0],
  ].map(([x, z], k) => ({ p: [x!, 0, z!] as V3, top: k % 2 === 0 ? 72 : 64 }));
  b.revise({ item: "L09 tower plan", original: "eight outer towers, eight polyline wall runs", revised: "towers at the four corners (to 72 m) and the four side midpoints (to 64 m) of a 160 × 136 polygon; tower radius 6 m, conical roofs radius 7", reason: "corner towers carry the tallest roofs; runs between towers are the eight wall runs", impact: "the main gate is beside the south tower, offset from the inner gate" });
  tw.forEach((t, k) => {
    b.set({ comp: `tower ${k + 1}` });
    const courses = Math.round((t.top - 8 - 16) / 4); // shaft to the roof base, roof rises the rest
    const shaftTop = polyShaft(b, t.p[0], t.p[2], 6, 16, y8, courses, 4, { stock: "M", band: "towers" });
    b.footing([t.p[0], 0, t.p[2]]);
    // crenellated tower top: a platform ring then a conical roof of 16 ribs and 12 rings
    b.set({ stage: "beams", band: "tower decks", course: 0 });
    b.with({ tier: 2 }, () => deck(b, "M", t.p[0], shaftTop + 0.5, t.p[2], 10, 10, k % 2 ? "x" : "z"));
    b.box([t.p[0], shaftTop, t.p[2]], [5.5, 0.5, 5.5]);
    b.set({ stage: "roof" });
    cone(b, t.p[0], t.p[2], shaftTop + 0.5, 7, t.top - shaftTop - 0.5, 16, 12, { band: "tower roofs" });
    b.shell([t.p[0], shaftTop + (t.top - shaftTop) * 0.35, t.p[2]], [4.4, (t.top - shaftTop) * 0.33, 4.4], "plank");
    b.box([t.p[0], shaftTop + 3, t.p[2]], [5, 3, 5]);
    // arrow slits: narrow D frames in the shaft
    b.set({ stage: "details", band: "arrow slits", course: 0 });
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 16;
      for (let lvl = 0; lvl < 3; lvl++) {
        const y = y8 + 8 + lvl * 12;
        const p: V3 = [t.p[0] + 6.1 * Math.cos(a), y, t.p[2] + 6.1 * Math.sin(a)];
        chain(b, "D", p, add(p, [0, 2, 0]), { up: [Math.cos(a), 0, Math.sin(a)] });
        chain(b, "D", add(p, [-Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4]), add(p, [-Math.sin(a) * 0.4, 2, Math.cos(a) * 0.4]), { up: [Math.cos(a), 0, Math.sin(a)] });
      }
    }
  });
  b.plan("roof", "tower roofs ribs", 1);
  // outer wall 8–32: eight runs, six 4 m courses, 8 m bays (four M vertical chains, two double horizontals, X braces), 4 m wall walk
  const outerWall = (a: V3, c: V3, y0: number, courses: number, name: string, gate?: { at: number; w: number; h: number }): void => {
    const dx = c[0] - a[0];
    const dz = c[2] - a[2];
    const l = Math.hypot(dx, dz);
    const yaw = yawForX(dx, dz);
    b.at([a[0], 0, a[2]], yaw, () => {
      const start = 6;
      const L = l - 12;
      b.at([start, 0, 0], 0, () => {
        for (let k = 0; k < courses; k++) {
          b.set({ stage: "columns", band: name, course: k });
          const ya = y0 + k * 4;
          const ops = gate && ya < y0 + gate.h ? [{ x0: gate.at - gate.w / 2, x1: gate.at + gate.w / 2, y0: ya - 1, y1: Math.min(ya + 4, y0 + gate.h) }] : [];
          const bays = Math.max(1, Math.round(L / 8));
          const p = L / bays;
          for (let i = 0; i <= bays; i++) {
            const x = Math.min(L - 0.25, Math.max(0.25, i * p));
            if (ops.some((q) => x > q.x0 && x < q.x1)) continue;
            for (const z of [-1.75, -1.25, 1.25, 1.75]) chain(b, "M", [x, ya, z], [x, ya + 4, z], { up: [0, 0, 1], mode: "lap", within: [y0, y0 + courses * 4] });
          }
          for (const y of [ya + 0.25, ya + 0.75]) {
            for (const z of [-1.75, 1.75]) {
              if (ops.length) {
                const q = ops[0]!;
                chain(b, "M", [0, y, z], [q.x0, y, z], { up: [0, 1, 0] });
                chain(b, "M", [q.x1, y, z], [L, y, z], { up: [0, 1, 0] });
              } else chain(b, "M", [0, y, z], [L, y, z], { up: [0, 1, 0] });
            }
          }
          for (let i = 0; i < bays; i++) {
            const xa = i * p;
            const xb = (i + 1) * p;
            if (ops.some((q) => q.x1 > xa && q.x0 < xb)) continue;
            for (const z of [-2.1, 2.1]) chain(b, "M", [xa + 0.4, ya + 0.6, z], [xb - 0.4, ya + 3.6, z]);
          }
          // staggered horizontal M cladding on the outer face
          b.with({ tier: 2 }, () => {
            for (let j = 0; j < 4; j++) {
              const y = ya + 0.5 + j;
              const shift = j % 2 ? 2 : 0;
              for (let x = shift; x < L - 0.5; x += 4) {
                const x1 = Math.min(L, x + 4);
                if (ops.some((q) => x1 > q.x0 && x < q.x1)) continue;
                if (x1 - x > 1) chain(b, "M", [x, y, -2.4], [x1, y, -2.4], { up: [0, 1, 0] });
              }
            }
          });
        }
        const topY = y0 + courses * 4;
        // wall walk 4 m wide at the top, with crenellations every 4 m on the outer edge
        b.set({ stage: "beams", band: `${name} walk`, course: 0 });
        b.with({ tier: 2 }, () => deck(b, "M", L / 2, topY + 0.5, 0, L, 4, "x"));
        b.set({ stage: "details", band: "crenellations", course: 0 });
        for (let x = 1; x + 2 <= L - 1; x += 4) {
          // a 2 × 2 merlon from 8 M in four alternating layers
          for (let j = 0; j < 4; j++) {
            const y = topY + 0.75 + j * 0.5;
            if (j % 2 === 0) for (const z of [-2.25, -1.75]) chain(b, "M", [x, y, z], [x + 2, y, z], { up: [0, 1, 0], mode: "overhang" });
            else for (const xx of [x + 0.25, x + 1.75]) chain(b, "M", [xx, y, -3], [xx, y, -1], { up: [0, 1, 0], mode: "overhang" });
          }
        }
        // collision: wall body with the gate opening, walk and merlons
        const solid = (x0: number, x1: number, yy0: number, yy1: number): void => {
          if (x1 - x0 > 0.2) b.box([(x0 + x1) / 2, (yy0 + yy1) / 2, 0], [(x1 - x0) / 2, (yy1 - yy0) / 2, 2]);
        };
        if (gate) {
          solid(0, gate.at - gate.w / 2, y0, topY);
          solid(gate.at + gate.w / 2, L, y0, topY);
          solid(gate.at - gate.w / 2, gate.at + gate.w / 2, y0 + gate.h, topY);
        } else solid(0, L, y0, topY);
        b.box([L / 2, topY + 1.75, -2], [L / 2, 1, 0.5]);
        b.shell([L / 2, (y0 + topY) / 2, 0], [L / 2, (topY - y0) / 2, 1.2], "plank");
        if (gate) {
          b.shell([(gate.at - gate.w / 2) / 2, (y0 + topY) / 2, 0], [(gate.at - gate.w / 2) / 2, (topY - y0) / 2, 1.3], "plank");
        }
      });
    });
  };
  b.plan("columns", "outer wall", 6);
  for (let k = 0; k < 8; k++) {
    const a = tw[k]!.p;
    const c = tw[(k + 1) % 8]!.p;
    b.set({ comp: `outer wall ${k + 1}` });
    // the main gate in the run from the SW corner tower (k = 7 → 0 is west → corner; run 0 is corner SW → south): gate on run 0
    outerWall(a, c, y8, 6, "outer wall", k === 0 ? { at: 40, w: 12, h: 14 } : k === 3 ? { at: 50, w: 8, h: 10 } : undefined);
  }
  // inner wall 8–48: ten courses, plan 120 × 96, its gate on the east side (offset from the outer gate)
  const inner: V3[] = [[-60, 0, -48], [60, 0, -48], [60, 0, 48], [-60, 0, 48]];
  b.plan("columns", "inner wall", 10);
  for (let k = 0; k < 4; k++) {
    b.set({ comp: `inner wall ${k + 1}` });
    outerWall(inner[k]!, inner[(k + 1) % 4]!, y8, 10, "inner wall", k === 1 ? { at: 36, w: 12, h: 16 } : undefined);
  }
  for (const p of inner) {
    b.set({ comp: "inner corner towers" });
    polyShaft(b, p[0], p[2], 5, 12, y8, 11, 4, { stock: "M", band: "inner towers" });
    b.set({ stage: "roof" });
    cone(b, p[0], p[2], y8 + 44.5, 6, 10, 12, 8, { band: "inner tower roofs" });
  }
  // keep 8–80: 48 × 40, six floors × 12 m; 12 perimeter bundles of 4 B, R(48,40,4,4) on top, 2 × 3 beam grid
  b.set({ comp: "keep" });
  const kx = 10;
  const kz = 10;
  const bundles: V3[] = [];
  for (const x of [-24, -8, 8, 24]) bundles.push([kx + x, 0, kz - 20], [kx + x, 0, kz + 20]);
  for (const z of [-6.67, 6.67]) bundles.push([kx - 24, 0, kz + z], [kx + 24, 0, kz + z]);
  for (let f = 0; f < 6; f++) {
    b.set({ stage: "columns", band: "keep floors", course: f });
    const ya = y8 + f * 12;
    for (const p of bundles) {
      for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) chain(b, "B", [p[0] + ox, ya, p[2] + oz], [p[0] + ox, ya + 12, p[2] + oz], { up: [0, 0, 1] });
    }
    b.set({ stage: "beams", band: "keep beams", course: f });
    rect(b, "B", kx, ya + 12 - 4, kz, 48, 40, 4);
    // 2 × 3 bay beam grid
    for (const x of [-8, 8]) chain(b, "B", [kx + x, ya + 11.5, kz - 20], [kx + x, ya + 11.5, kz + 20], { up: [0, 1, 0] });
    for (const z of [-6.67, 6.67]) chain(b, "B", [kx - 24, ya + 10.5, kz + z], [kx + 24, ya + 10.5, kz + z], { up: [0, 1, 0] });
    b.with({ tier: 2 }, () => deck(b, "M", kx, ya + 12.5, kz, 47, 39, "x", f < 5 ? [{ x0: kx - 4, x1: kx + 4, z0: kz - 4, z1: kz + 4 }] : []));
    b.box([kx, ya + 12, kz], [24, 0.5, 20]);
    // recessed windows: at least four per floor; walls as plank shells between the bundles
    b.set({ stage: "details", band: "keep windows", course: f });
    for (const [x, z, nx, nz] of [[kx, kz - 20, 0, -1], [kx, kz + 20, 0, 1], [kx - 24, kz, -1, 0], [kx + 24, kz, 1, 0]] as const) {
      for (const off of [-4, 4]) {
        const c: V3 = [x + (nz !== 0 ? off : 0) - nx * 0.6, ya + 4, z + (nx !== 0 ? off : 0) - nz * 0.6];
        const t: V3 = nz !== 0 ? [1, 0, 0] : [0, 0, 1];
        chain(b, "D", add(c, scale(t, -1)), add(c, scale(t, 1)), { up: [0, 1, 0] });
        chain(b, "D", add(add(c, scale(t, -1)), [0, 3, 0]), add(add(c, scale(t, 1)), [0, 3, 0]), { up: [0, 1, 0] });
        chain(b, "D", add(c, scale(t, -1)), add(add(c, scale(t, -1)), [0, 3, 0]), { up: [0, 0, 1] });
        chain(b, "D", add(c, scale(t, 1)), add(add(c, scale(t, 1)), [0, 3, 0]), { up: [0, 0, 1] });
      }
    }
    // keep wall shells and colliders (with a ground-floor door on −z)
    for (const sz of [-1, 1]) {
      b.shell([kx, ya + 6, kz + sz * 19.6], [23.6, 5.6, 0.3], "plank");
      if (f === 0 && sz === -1) {
        b.box([kx - 14, ya + 6, kz - 20], [10, 6, 0.6]);
        b.box([kx + 14, ya + 6, kz - 20], [10, 6, 0.6]);
        b.box([kx, ya + 10, kz - 20], [4, 2, 0.6]);
      } else b.box([kx, ya + 6, kz + sz * 20], [24, 6, 0.6]);
    }
    for (const sx of [-1, 1]) {
      b.shell([kx + sx * 23.6, ya + 6, kz], [0.3, 5.6, 19.6], "plank");
      b.box([kx + sx * 24, ya + 6, kz], [0.6, 6, 20]);
    }
    if (f === 2 || f === 4) {
      // projecting galleries at floors 3 and 5, carried by three inclined M brackets every 2 m
      b.set({ stage: "beams", band: "keep galleries", course: f });
      for (let x = -24; x <= 24; x += 2) {
        for (const sz of [-1, 1]) {
          for (const k of [-0.5, 0, 0.5]) chain(b, "M", [kx + x + k, ya + 9, kz + sz * 20.25], [kx + x + k, ya + 12, kz + sz * 23.5], { up: [0, 0, 1] });
        }
      }
      for (const sz of [-1, 1]) {
        b.with({ tier: 2 }, () => deck(b, "M", kx, ya + 12.5, kz + sz * 22, 50, 4, "x"));
        b.box([kx, ya + 12, kz + sz * 22], [25, 0.5, 2]);
      }
    }
  }
  b.plan("columns", "keep floors", 6);
  // an internal stair stack (ramps) in the keep's central light well
  for (let f = 0; f < 6; f++) b.ramp([kx, y8 + f * 12 + 6, kz], 3.5, 3.9, f % 2 ? Math.PI : 0, y8 + f * 12, y8 + f * 12 + 12, y8 + f * 12 - 0.5);
  // main roof 80–108: four corner conical caps to 96, central pitched roof with spire to 108
  const yk = y8 + 72;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    b.set({ comp: "keep corner caps", stage: "roof" });
    cone(b, kx + sx * 22, kz + sz * 18, yk, 5, 96 - yk, 16, 10, { band: "keep caps" });
    b.box([kx + sx * 22, yk + 3, kz + sz * 18], [4, 3, 4]);
  }
  b.set({ comp: "keep roof" });
  pitchedRoof(b, { x0: kx - 18, x1: kx + 18, z0: kz - 15, z1: kz + 15, y0: yk, y1: yk + 14, trusses: 7, chord: "M", web: "D", webs: 3, band: "keep roof", strips: 2 });
  b.set({ stage: "roof" });
  cone(b, kx, kz, yk + 12, 4, 108 - yk - 12, 16, 8, { band: "keep spire" });
  b.set({ comp: "main" });
  b.feature("two concentric wall rings with offset gates", [0, 20, -70]);
  b.feature("crenellated wall walks", [40, 33, -69]);
  b.feature("conical tower roofs and a six-storey keep with galleries", [kx, 90, kz]);
  // the outer gate: 40 m along run 0 from its start (6 m past tower 1's centre), a 12 m opening
  const g0 = tw[0]!.p;
  const g1 = tw[1]!.p;
  const gl = Math.hypot(g1[0] - g0[0], g1[2] - g0[2]);
  const gt: V3 = [(g1[0] - g0[0]) / gl, 0, (g1[2] - g0[2]) / gl];
  const gate: V3 = add(g0, scale(gt, 6 + 40));
  // the inner gate: 36 m along the east inner run (from (60, −48) to (60, 48)), so at z = −48 + 6 + 36
  const innerGate: V3 = [60, 0, -48 + 6 + 36];
  const gx = -79 + (79 / Math.hypot(79, 1)) * 46;
  b.entry("gate-approach", [gx, 0, -76 + 3 - 40], [gx, 0, -76 + 3 - 32], 12, 14, true, "to the foot of the gate ramp");
  b.entry("gate", [gx, y8, -76 + 3], [gate[0], y8, gate[2] + 6], 12, 14, true, "from the ramp's top through the outer gate");
  b.entry("ward", [gate[0], y8, gate[2] + 6], [68, y8, -58], 10, 14, true, "across the outer ward, between the walls, toward the east");
  b.entry("court", [70, y8, -58], [70, y8, innerGate[2]], 8, 14, true, "along the east outer ward");
  b.entry("inner-gate", [74, y8, innerGate[2]], [kx + 26, y8, innerGate[2]], 10, 14, true, "through the offset east inner gate into the court");
  const walkA = add(g0, scale(gt, 9));
  const walkB = add(g0, scale(gt, 30));
  b.entry("walk", [walkA[0], y8 + 24.6, walkA[2]], [walkB[0], y8 + 24.6, walkB[2]], 3, 3, false, "along the outer wall walk (narrow)");
  b.viewAt("ground", "ground", [gate[0] + 8, 1.65, -112], [gate[0], 30, -60], "the gate below the south towers");
  b.viewAt("interior", "interior", [30, y8 + 1.65, -30], [kx, y8 + 70, kz], "the keep from the inner court");
  b.viewAt("high", "high", [-170, 150, -170], [0, 50, 0], "the double ring from above");
  b.viewAt("detail", "detail", [36, y8 + 26.2, -66], [60, y8 + 26, -68], "crenellations on the wall walk");
  b.safe("gate", [gate[0], 0, -112], 0);
  b.safe("ward", [gate[0], y8, -58], 0);
  b.safe("keep-top", [kx, y8 + 72.5, kz - 22], 0);
}

// ================================================================= L10

/**
 * L10 Pointed-Arch Cloud Nave, 112 × 216 × 128. Eight 20 m nave bays along
 * +z between an entry block (twin towers, rose window) on −z and a rear
 * chapel; compound piers, a gallery band, high windows with tracery, ribbed
 * vaults, flying buttresses, steep roof and a crossing spire.
 */
export function L10(b: Builder): void {
  b.set({ comp: "base" });
  const y8 = platform(b, { w: 112, d: 216, bands: [0, 0.5, 1, 1.5].map((inset) => ({ h: 2, inset })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", deckAxis: "z", band: "base" });
  approach(b, 0, 0, -108 + 1.5 - 32, 20, y8, 1, "west");
  const z0 = -68; // nave from z = −68 to +92 (eight 20 m bays); entry block −106…−68
  const zs = Array.from({ length: 9 }, (_, k) => z0 + k * 20);
  const X = 10; // pier rows at x = ±10 → 20 m nave (16 m clear between pier faces)
  // two rows of nine compound piers: 16-sided core + eight attached shafts; per 4 m course 16 M core verticals + 8 × 4 D shaft bundles + 16 D ring ties
  b.plan("columns", "compound piers", 8);
  for (const sx of [-1, 1]) {
    zs.forEach((z, k) => {
      b.at([sx * X, y8, z], 0, () => {
        b.set({ comp: `pier ${sx > 0 ? "S" : "N"}${k + 1}`, stage: "columns", band: "compound piers" });
        for (let c = 0; c < 8; c++) {
          b.set({ course: c });
          const ya = c * 4;
          for (let i = 0; i < 16; i++) {
            const a = (2 * Math.PI * i) / 16;
            chain(b, "M", [1.6 * Math.cos(a), ya, 1.6 * Math.sin(a)], [1.6 * Math.cos(a), ya + 4, 1.6 * Math.sin(a)], { up: [Math.cos(a), 0, Math.sin(a)] });
          }
          for (let i = 0; i < 8; i++) {
            const a = (2 * Math.PI * i) / 8 + Math.PI / 8;
            const r = 2.05;
            for (const [dr, dt] of [[0, -0.07], [0, 0.07], [0.13, -0.07], [0.13, 0.07]] as const) {
              const p: V3 = [(r + dr) * Math.cos(a) - dt * Math.sin(a), ya, (r + dr) * Math.sin(a) + dt * Math.cos(a)];
              b.with({ tier: 1 }, () => chain(b, "D", p, add(p, [0, 4, 0]), { up: [Math.cos(a), 0, Math.sin(a)] }));
            }
          }
          ring(b, "D", 0, ya + 2, 0, 1.75, 16, 1);
        }
        b.shellCyl([0, 16, 0], 1.45, 16, "shade");
        b.cyl([0, 16, 0], 2.3, 16);
        b.footing([0, 0, 0]);
      });
    });
  }
  // aisle arcades: eight pointed bays per side, A(16, 18, 1.5, 4, 1), spring at 8 + 14 = 22 → crown 40
  b.set({ comp: "arcades", stage: "arches", band: "arcade arches", course: 0 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 8; k++) b.at([sx * X, y8 + 14, (zs[k]! + zs[k + 1]!) / 2], -Math.PI / 2, () => arch(b, 16, 18, 1.5, 4, 1, { collide: true }));
  }
  b.plan("arches", "arcade arches", 1);
  // outer aisle walls at x = ±(X + 18) with windows, aisle vault roof at ~30
  for (const sx of [-1, 1]) {
    b.set({ comp: `aisle wall ${sx > 0 ? "S" : "N"}` });
    b.set({ stage: "columns", band: "aisle walls", course: 0 });
    const ops = Array.from({ length: 8 }, (_, k) => ({ x0: k * 20 + 6, x1: k * 20 + 14, y0: 6, y1: 22 }));
    wallAB(b, [sx * (X + 18), 0, z0], [sx * (X + 18), 0, z0 + 160], y8, 30, 4, { stock: "M", facing: "M", openings: ops });
    b.set({ stage: "roof", band: "aisle roofs", course: 0 });
    b.with({ tier: 2 }, () => deck(b, "M", sx * (X + 9), y8 + 32.5, z0 + 80, 18, 160, "z"));
    b.box([sx * (X + 9), y8 + 32, z0 + 80], [9, 0.6, 80]);
  }
  b.plan("columns", "aisle walls", 1);
  // gallery band 40–52: three small pointed arches per bay (48 total), two D edge curves and two slender M columns each
  b.set({ comp: "gallery", stage: "arches", band: "gallery", course: 0 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 8; k++) {
      for (let j = 0; j < 3; j++) {
        const z = zs[k]! + 3.3 + j * 6.7;
        b.at([sx * X, y8 + 32, z], -Math.PI / 2, () => {
          // two D edge curves of a 5 m pointed arch rising 4 m above 4 m-tall M columns
          for (const off of [-0.3, 0.3]) {
            const pts: V3[] = [];
            for (let t = 0; t <= 6; t++) {
              const s = archPt(5, 4, t / 6);
              pts.push([s[0], 6 + s[1], off]);
            }
            for (let i = 0; i < 6; i++) chain(b, "D", pts[i]!, pts[i + 1]!, { mode: "overhang", up: [0, 0, 1] });
          }
          for (const x of [-2.5, 2.5]) chain(b, "M", [x, 2, 0], [x, 6, 0], { up: [0, 0, 1] });
        });
      }
      // the gallery floor behind (a passage, not a flat motif)
      b.with({ tier: 2 }, () => deck(b, "M", sx * (X + 3), y8 + 34, (zs[k]! + zs[k + 1]!) / 2, 5, 20, "z"));
    }
    b.box([sx * (X + 3), y8 + 33.5, z0 + 80], [2.5, 0.5, 80]);
  }
  b.plan("arches", "gallery", 1);
  // clerestory 52–76: one high-window assembly per bay: two M mullions + six branching D tracery chains
  b.set({ comp: "clerestory", stage: "details", band: "high windows", course: 0 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 8; k++) {
      const zc = (zs[k]! + zs[k + 1]!) / 2;
      b.at([sx * X, y8 + 44, zc], -Math.PI / 2, () => {
        for (const x of [-2.5, 2.5]) chain(b, "M", [x, 0, 0], [x, 14, 0], { up: [0, 0, 1] });
        // window head: pointed, with branching tracery
        const head: V3[] = [];
        for (let t = 0; t <= 8; t++) {
          const s = archPt(14, 10, t / 8);
          head.push([s[0], 14 + s[1], 0]);
        }
        for (let i = 0; i < 8; i++) chain(b, "M", head[i]!, head[i + 1]!, { mode: "overhang", up: [0, 0, 1] });
        for (const [a, c] of [[[-2.5, 14, 0], [-4, 19, 0]], [[-2.5, 14, 0], [-1, 19, 0]], [[2.5, 14, 0], [1, 19, 0]], [[2.5, 14, 0], [4, 19, 0]], [[0, 14, 0], [0, 22, 0]], [[-1, 19, 0], [1, 19, 0]]] as [V3, V3][]) chain(b, "D", a, c, { up: [0, 0, 1] });
        // side frames of the bay wall
        for (const x of [-7, 7]) chain(b, "M", [x, 0, 0], [x, 24, 0], { up: [0, 0, 1] });
        b.shell([-8.3, 12, 0.2], [1.3, 12, 0.25], "plank");
        b.shell([8.3, 12, 0.2], [1.3, 12, 0.25], "plank");
        b.shell([0, 0.5, 0.2], [7, 0.5, 0.25], "glass");
        b.box([-8.4, 12, 0], [1.6, 12, 0.6]);
        b.box([8.4, 12, 0], [1.6, 12, 0.6]);
        b.box([0, 21, 0], [7, 3, 0.6]);
      });
    }
  }
  b.plan("details", "high windows", 1);
  // main vault: per bay four diagonal and two transverse ribs, each a double M chain, crown ~76
  b.set({ comp: "vault", stage: "arches", band: "vault ribs", course: 0 });
  for (let k = 0; k < 8; k++) {
    b.set({ course: k });
    const za = zs[k]!;
    const zb = zs[k + 1]!;
    const zc = (za + zb) / 2;
    const yS = y8 + 52;
    const crown = y8 + 68; // 8 + 68 = 76
    const rib = (a: V3, c: V3): void => {
      const pts: V3[] = [];
      for (let t = 0; t <= 8; t++) {
        const f = t / 8;
        const h = Math.sin(Math.PI * f);
        pts.push([a[0] + (c[0] - a[0]) * f, yS + (crown - yS) * Math.pow(h, 0.7), a[2] + (c[2] - a[2]) * f]);
      }
      for (let i = 0; i < 8; i++) {
        chain(b, "M", pts[i]!, pts[i + 1]!, { mode: "overhang" });
        chain(b, "M", add(pts[i]!, [0, 0.55, 0]), add(pts[i + 1]!, [0, 0.55, 0]), { mode: "overhang" });
      }
    };
    rib([-X, 0, za], [X, 0, zb]);
    rib([X, 0, za], [-X, 0, zb]);
    rib([-X, 0, za], [X, 0, za]);
    if (k === 7) rib([-X, 0, zb], [X, 0, zb]);
    // ridge of the bay (the other two diagonals meet the transverse at its apex)
    rib([-X, 0, zc], [X, 0, zc]);
    b.shell([0, crown + 0.8, zc], [X, 0.25, 10], "plank");
  }
  b.plan("arches", "vault ribs", 8);
  b.box([0, y8 + 69.5, z0 + 80], [X + 1, 1, 80]);
  // flying buttresses: one assembly per bay per side (16): two arches at different levels, an outer pier and a pinnacle
  b.set({ comp: "buttresses", stage: "arches", band: "flying buttresses", course: 0 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 8; k++) {
      const z = zs[k + 1]! - (k === 7 ? 20 : 0);
      void z;
      const zp = zs[k]! + 10;
      const xOut = sx * (X + 24);
      // outer pier (8 m beyond the aisle wall) with a pinnacle
      b.at([xOut, y8, zp], 0, () => {
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) chain(b, "M", [ox * 1.25, 0, oz * 1.25], [ox * 1.25, 56, oz * 1.25], { up: [0, 0, 1] });
        for (let y = 4; y < 56; y += 8) rect(b, "M", 0, y, 0, 3, 3, 1);
        cone(b, 0, 0, 56, 1.8, 10, 4, 3, { ribStock: "M", ringStock: "D", band: "pinnacles" });
        b.box([0, 28, 0], [1.5, 28, 1.5]);
        b.footing([0, 0, 0]);
      });
      // two flying half-arches from the outer pier to the high wall at different levels
      for (const [yLo, yHi] of [[40, 52], [52, 64]] as const) {
        const a: V3 = [xOut - sx * 1.5, y8 + yLo, zp];
        const c: V3 = [sx * (X + 0.6), y8 + yHi, zp];
        const pts: V3[] = [];
        for (let t = 0; t <= 6; t++) {
          const f = t / 6;
          const sag = Math.sin(Math.PI * f) * 2.5;
          pts.push([a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f - sag * (1 - f) + sag * 0.0, zp]);
        }
        for (let i = 0; i < 6; i++) {
          chain(b, "M", pts[i]!, pts[i + 1]!, { mode: "overhang", up: [0, 0, 1] });
          chain(b, "M", add(pts[i]!, [0, 1.2, 0]), add(pts[i + 1]!, [0, 1.2, 0]), { mode: "overhang", up: [0, 0, 1] });
          chain(b, "D", add(pts[i]!, [0, 0.1, 0]), add(pts[i + 1]!, [0, 1.1, 0]), { up: [0, 0, 1] });
        }
      }
    }
  }
  b.plan("arches", "flying buttresses", 1);
  // main roof 76–92: nine steep trusses with D strips
  b.set({ comp: "roof" });
  pitchedRoof(b, { x0: -X - 1.5, x1: X + 1.5, z0: z0, z1: z0 + 160, y0: y8 + 70, y1: y8 + 84, trusses: 9, chord: "M", web: "D", webs: 3, band: "nave roof", strips: 2 });
  // entry towers: 20 × 20, bodies to 104 and tops to 116; four F faces per 4 m course
  for (const sx of [-1, 1]) {
    b.set({ comp: `tower ${sx > 0 ? "S" : "N"}`, stage: "columns", band: "west towers" });
    const cx = sx * 20;
    const cz = -88;
    for (let c = 0; c < 24; c++) {
      b.set({ course: c });
      const ya = y8 + c * 4;
      trussFace(b, "M", cx - 10, ya, cx + 10, ya + 4, cz - 10 + 0.25, { bottom: c === 0, diagonals: c % 2 === 0 });
      trussFace(b, "M", cx - 10, ya, cx + 10, ya + 4, cz + 10 - 0.25, { bottom: c === 0, diagonals: c % 2 === 0 });
      b.at([cx, 0, cz], Math.PI / 2, () => {
        trussFace(b, "M", -10, ya, 10, ya + 4, -10 + 0.25, { bottom: c === 0, diagonals: c % 2 === 1, sides: false });
        trussFace(b, "M", -10, ya, 10, ya + 4, 10 - 0.25, { bottom: c === 0, diagonals: c % 2 === 1, sides: false });
      });
    }
    b.shell([cx, y8 + 48, cz], [9.6, 48, 9.6], "plank");
    b.box([cx, y8 + 48, cz], [10, 48, 10]);
    b.footing([cx, 0, cz]);
    // tower tops 104–116: an open belfry frame and a short pyramid
    b.set({ stage: "roof", band: "tower tops", course: 0 });
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) chain(b, "M", [cx + ox * 8, y8 + 96, cz + oz * 8], [cx + ox * 4, 116, cz + oz * 4], { up: [0, 0, 1] });
    rect(b, "M", cx, y8 + 96, cz, 20, 20, 2);
    rect(b, "M", cx, 112, cz, 9, 9, 1);
  }
  b.plan("columns", "west towers", 24);
  // the west front between the towers, with the rose window (Ø 18, 24 petals, recessed 1 m)
  b.set({ comp: "west front", stage: "columns", band: "west front", course: 0 });
  b.at([-10, y8, -98], 0, () => wall(b, 20, 0, 76, 4, { stock: "M", facing: "M", openings: [{ x0: 4, x1: 16, y0: 0, y1: 22 }, { x0: 0.6, x1: 19.4, y0: 38, y1: 58 }] }));
  b.set({ stage: "details", band: "rose window", course: 0 });
  b.at([0, y8 + 48, -97], 0, () => {
    for (const r of [9, 8.6]) ring(b, "D", 0, 0, 0, r, 48, 1, { up: [0, 0, 1] });
    // a ring in the vertical plane: rotate pieces by building in the x–y plane
    for (let i = 0; i < 48; i++) {
      const a0 = (2 * Math.PI * i) / 48;
      const a1 = (2 * Math.PI * (i + 1)) / 48;
      chain(b, "D", [9 * Math.cos(a0), 9 * Math.sin(a0), 0.4], [9 * Math.cos(a1), 9 * Math.sin(a1), 0.4], { mode: "overhang", up: [0, 0, 1] });
      chain(b, "D", [3 * Math.cos(a0), 3 * Math.sin(a0), 0.4], [3 * Math.cos(a1), 3 * Math.sin(a1), 0.4], { mode: "overhang", up: [0, 0, 1] });
    }
    for (let i = 0; i < 24; i++) {
      const a = (2 * Math.PI * i) / 24;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (const off of [-0.09, 0.09]) chain(b, "D", [3 * ca - off * sa, 3 * sa + off * ca, 0.4], [8.6 * ca - off * sa, 8.6 * sa + off * ca, 0.4], { up: [0, 0, 1] });
      // three small curved frames per petal
      const am = a + Math.PI / 24;
      for (const r of [4.5, 6, 7.5]) {
        const da = 0.09;
        chain(b, "D", [r * Math.cos(am - da), r * Math.sin(am - da), 0.4], [(r + 0.5) * Math.cos(am), (r + 0.5) * Math.sin(am), 0.4], { up: [0, 0, 1] });
        chain(b, "D", [(r + 0.5) * Math.cos(am), (r + 0.5) * Math.sin(am), 0.4], [r * Math.cos(am + da), r * Math.sin(am + da), 0.4], { up: [0, 0, 1] });
      }
    }
    b.shell([0, 0, 1.4], [9, 9, 0.15], "glass");
  });
  b.plan("details", "rose window", 1);
  // crossing spire 92–128 at the fourth bay: octagonal base, twelve 3 m rises, radius 8 → 0.8; per course eight M edges + eight D rings
  b.set({ comp: "spire", stage: "roof", band: "crossing spire", course: 0 });
  const sz0 = zs[4]!;
  for (let c = 0; c < 12; c++) {
    b.set({ course: c });
    const ya = 92 + c * 3;
    const ra = 8 - (7.2 * c) / 12;
    const rb = 8 - (7.2 * (c + 1)) / 12;
    const va = ngon(8, ra, ya, 0, sz0, Math.PI / 8);
    const vb = ngon(8, rb, ya + 3, 0, sz0, Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      chain(b, "M", va[i]!, vb[i]!, { mode: "overhang" });
      chain(b, "D", va[i]!, va[(i + 1) % 8]!, { mode: "overhang", up: [0, 1, 0] });
    }
  }
  b.plan("roof", "crossing spire", 12);
  for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    b.set({ stage: "roof", band: "corner spires", course: 0 });
    cone(b, ox * 9, sz0 + oz * 9, 88, 2, 18, 8, 5, { ribStock: "M", ringStock: "D", band: "corner spires" });
  }
  b.shell([0, 104, sz0], [4.8, 12, 4.8], "plank");
  b.cyl([0, 100, sz0], 6, 8);
  // rear chapel: a lower apse frame
  b.set({ comp: "chapel", stage: "columns", band: "chapel", course: 0 });
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (i / 8);
    const p: V3 = [14 * Math.cos(a), y8, 92 + 14 * Math.sin(a)];
    chain(b, "M", p, add(p, [0, 30, 0]), { up: [Math.cos(a), 0, Math.sin(a)] });
    if (i < 8) {
      const q: V3 = [14 * Math.cos(Math.PI * ((i + 1) / 8)), y8, 92 + 14 * Math.sin(Math.PI * ((i + 1) / 8))];
      for (const y of [0.25, 15, 29.75]) chain(b, "M", add(p, [0, y, 0]), add(q, [0, y, 0]), { up: [0, 1, 0], mode: "overhang" });
      b.box([(p[0] + q[0]) / 2, y8 + 15, (p[2] + q[2]) / 2], [3, 15, 0.6], yawForX(q[0] - p[0], q[2] - p[2]));
    }
  }
  b.set({ comp: "main" });
  b.feature("pointed arcades, gallery and clerestory in three tiers", [X, y8 + 40, 0]);
  b.feature("sixteen flying buttresses with pinnacles", [X + 24, y8 + 60, z0 + 10]);
  b.feature("rose window between twin west towers", [0, y8 + 48, -98]);
  b.entry("west", [0, 0, -146], [0, y8, 60], 12, 20, true, "through the west door, up the high nave");
  b.entry("side", [0, y8 + 48, zs[3]! + 10], [X + 12, y8 + 48, zs[3]! + 10], 4, 8, true, "out sideways through a high window, over the aisle roof (flight)");
  b.entry("side-out", [X + 12, y8 + 48, zs[3]! + 10], [X + 12, y8 + 48, zs[4]!], 4, 8, true, "along the aisle roof to a bay line");
  b.entry("buttresses", [X + 12, y8 + 48, zs[4]!], [X + 60, y8 + 48, zs[4]!], 8, 8, true, "out between two flying buttresses (their piers stand at bay centres)");
  b.viewAt("ground", "ground", [10, 1.65, -150], [0, 60, -90], "the west front with towers and rose");
  b.viewAt("interior", "interior", [2, y8 + 1.65, -40], [0, y8 + 70, 20], "down the nave toward the vault ribs");
  b.viewAt("high", "high", [-170, 170, -40], [0, 70, 0], "spires and buttresses in silhouette");
  b.viewAt("detail", "detail", [X + 16, y8 + 50, zs[2]! + 4], [X + 8, y8 + 56, zs[2]! + 10], "a flying buttress at the high wall (flight)");
  b.safe("west", [0, 0, -148], 0);
  b.safe("nave", [0, y8, 0], 0);
  b.safe("roof-walk", [X + 9, y8 + 33, 0], 0);
}

/** A point on a two-centred pointed arch of span w and rise h at parameter t (0…1), springing at y = 0. */
function archPt(w: number, h: number, t: number): [number, number] {
  const hw = w / 2;
  if (h <= hw) {
    const a = Math.PI * (1 - t);
    return [hw * Math.cos(a), h * Math.sin(a)];
  }
  const c = (h * h - hw * hw) / (2 * hw);
  const R = hw + c;
  const apex = Math.atan2(h, -c);
  if (t <= 0.5) {
    const th = Math.PI + (apex - Math.PI) * (t * 2);
    return [c + R * Math.cos(th), R * Math.sin(th)];
  }
  const m = archPt(w, h, 1 - t);
  return [-m[0], m[1]];
}

// ================================================================= L11

/**
 * L11 Eight-Lobed Dome Palace, 128 × 184 × 144. A five-bay front hall on −z,
 * an octagonal drum, a pointed double-shell dome of eight lobes with eight
 * main and sixteen secondary ribs, herringbone lobe infill, a lantern.
 */
export function L11(b: Builder): void {
  b.set({ comp: "base" });
  const y8 = platform(b, { w: 128, d: 184, bands: [0, 0.5, 1, 1.5].map((inset) => ({ h: 2, inset })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", deckAxis: "z", band: "base" });
  approach(b, 0, 0, -92 + 1.5 - 32, 24, y8, 1, "front");
  const cz = 40; // octagon centre; hall from z = −90 to ~0
  // main hall 8–48: five 20 m bays, six main piers per side (8 B bundle members + 8 M ring ties per 4 m course)
  const zs = [-90, -70, -50, -30, -10, 10];
  b.plan("columns", "hall piers", 10);
  for (const sx of [-1, 1]) {
    zs.forEach((z, k) => {
      b.at([sx * 14, y8, z], 0, () => {
        b.set({ comp: `hall pier ${sx > 0 ? "E" : "W"}${k + 1}`, stage: "columns", band: "hall piers" });
        for (let c = 0; c < 10; c++) {
          b.set({ course: c });
          const ya = c * 4;
          if (c % 2 === 0) for (let i = 0; i < 8; i++) {
            const a = (2 * Math.PI * i) / 8;
            chain(b, "B", [1.6 * Math.cos(a), ya, 1.6 * Math.sin(a)], [1.6 * Math.cos(a), ya + 8, 1.6 * Math.sin(a)], { up: [Math.cos(a), 0, Math.sin(a)] });
          }
          ring(b, "M", 0, ya + 2, 0, 2.4, 8, 1, { phase: Math.PI / 8 });
        }
        b.shellCyl([0, 20, 0], 1.3, 20, "shade");
        b.cyl([0, 20, 0], 2.2, 20);
        b.footing([0, 0, 0]);
      });
    });
  }
  b.revise({ item: "L11 hall piers", original: "8 B vertical bundle members + 8 M ring ties per 4 m course", revised: "8 B members lapping two courses each (one set per two courses) + 8 M ties every course", reason: "8 m B stock spans two 4 m courses; placing a new set every course would double each member", impact: "BOM: 5 × 8 B per pier rather than 10 × 8" });
  // round arches between piers along each side and across the nave at the bay lines
  b.set({ comp: "hall arches", stage: "arches", band: "hall arches", course: 0 });
  for (const sx of [-1, 1]) for (let k = 0; k + 1 < zs.length; k++) b.at([sx * 14, y8 + 24, (zs[k]! + zs[k + 1]!) / 2], Math.PI / 2, () => arch(b, 16, 8, 1.5, 3, 1));
  for (const z of zs) b.at([0, y8 + 26, z], 0, () => arch(b, 24, 12, 1.5, 3, 1, { collide: false }));
  b.plan("arches", "hall arches", 1);
  // hall walls and pitched roofs: central nave roof and lower aisle roofs
  for (const sx of [-1, 1]) {
    b.set({ comp: `hall wall ${sx > 0 ? "E" : "W"}`, stage: "columns", band: "hall walls", course: 0 });
    wallAB(b, [sx * 36, 0, -90], [sx * 36, 0, 10], y8, 30, 5, { stock: "M", facing: "M", openings: [10, 30, 50, 70, 90].map((x) => ({ x0: x - 3, x1: x + 3, y0: 8, y1: 22 })) });
  }
  b.plan("columns", "hall walls", 1);
  b.set({ comp: "hall roofs" });
  pitchedRoof(b, { x0: -16, x1: 16, z0: -92, z1: 12, y0: y8 + 40, y1: y8 + 52, trusses: 6, chord: "M", web: "D", webs: 3, band: "nave roof" });
  for (const sx of [-1, 1]) pitchedRoof(b, { x0: sx > 0 ? 16 : -38, x1: sx > 0 ? 38 : -16, z0: -92, z1: 12, y0: y8 + 30, y1: y8 + 36, trusses: 6, chord: "M", web: "D", webs: 1, band: "aisle roof", strips: null });
  // drum 48–72 on an octagon of circumradius 40 at (0, cz); 8 faces × three 8 m bands
  const R0 = 40;
  const oct = ngon(8, R0, 0, 0, cz, Math.PI / 8);
  b.plan("columns", "octagonal drum", 3);
  // the octagon's lower body 8–48 (its own frame)
  for (let k = 0; k < 8; k++) {
    const a = oct[k]!;
    const c = oct[(k + 1) % 8]!;
    b.set({ comp: `octagon face ${k + 1}` });
    const front = k === 5; // the face toward the hall (−z) stays open for the passage
    for (let band = 0; band < 8; band++) {
      const ya = y8 + band * 5;
      b.set({ stage: "columns", band: "octagon body", course: band });
      if (front && band < 6) continue;
      for (const y of [ya + 0.25]) chain(b, "M", [a[0], y, a[2]], [c[0], y, c[2]], { up: [0, 1, 0] });
      for (const f of [0.25, 0.5, 0.75]) chain(b, "M", [a[0] + (c[0] - a[0]) * f, ya, a[2] + (c[2] - a[2]) * f], [a[0] + (c[0] - a[0]) * f, ya + 5, a[2] + (c[2] - a[2]) * f], { up: [0, 0, 1] });
    }
    const mid: V3 = [(a[0] + c[0]) / 2, 0, (a[2] + c[2]) / 2];
    const yaw = yawForX(c[0] - a[0], c[2] - a[2]);
    const fl = Math.hypot(c[0] - a[0], c[2] - a[2]);
    if (front) {
      b.box([mid[0], y8 + 35, mid[2]], [fl / 2, 5, 1], yaw);
      b.shell([mid[0], y8 + 35, mid[2]], [fl / 2 - 0.5, 5, 0.6], "plank", { yaw });
    } else {
      b.box([mid[0], y8 + 20, mid[2]], [fl / 2, 20, 1], yaw);
      b.shell([mid[0], y8 + 20, mid[2]], [fl / 2 - 0.5, 20, 0.6], "plank", { yaw });
    }
    b.footing([a[0], 0, a[2]]);
    // drum 48–72: three 8 m bands: 4 B bundles at both corners, three M horizontals and paired diagonals; a 10 m round window
    for (let band = 0; band < 3; band++) {
      b.set({ stage: "columns", band: "octagonal drum", course: band });
      const ya = y8 + 40 + band * 8;
      for (const corner of [a]) {
        for (const [o1, o2] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const dirIn = norm(sub([0, 0, cz], corner));
          const t = norm(sub(c, a));
          const p = add(add(corner, scale(dirIn, o1 * 1.02)), scale(t, o2 * 1.02 + 0.5));
          chain(b, "B", [p[0], ya, p[2]], [p[0], ya + 8, p[2]], { up: [0, 0, 1] });
        }
      }
      for (const y of [ya + 0.25, ya + 4, ya + 7.75]) chain(b, "M", [a[0], y, a[2]], [c[0], y, c[2]], { up: [0, 1, 0] });
      if (band !== 1) {
        chain(b, "M", [a[0], ya + 0.5, a[2]], [mid[0], ya + 7.5, mid[2]]);
        chain(b, "M", [c[0], ya + 0.5, c[2]], [mid[0], ya + 7.5, mid[2]]);
      }
    }
    // the round window in the middle band: a 32-segment D ring and eight radial D chains in the face plane
    b.set({ stage: "details", band: "drum windows", course: 0 });
    b.at([mid[0], y8 + 52, mid[2]], yaw, () => {
      for (let i = 0; i < 32; i++) {
        const t0 = (2 * Math.PI * i) / 32;
        const t1 = (2 * Math.PI * (i + 1)) / 32;
        chain(b, "D", [5 * Math.cos(t0), 5 * Math.sin(t0), -0.4], [5 * Math.cos(t1), 5 * Math.sin(t1), -0.4], { mode: "overhang", up: [0, 0, 1] });
      }
      for (let i = 0; i < 8; i++) {
        const t = (2 * Math.PI * i) / 8;
        chain(b, "D", [1 * Math.cos(t), 1 * Math.sin(t), -0.4], [4.9 * Math.cos(t), 4.9 * Math.sin(t), -0.4], { up: [0, 0, 1] });
      }
      b.shell([-(fl / 4 + 2.5), 0, 0], [fl / 4 - 2.5, 12, 0.4], "plank");
      b.shell([fl / 4 + 2.5, 0, 0], [fl / 4 - 2.5, 12, 0.4], "plank");
      b.shell([0, 8.5, 0], [5, 3.5, 0.4], "plank");
      b.shell([0, -8.5, 0], [5, 3.5, 0.4], "plank");
      b.shell([0, 0, 0.2], [5, 5, 0.1], "glass");
    });
    b.box([mid[0], y8 + 52, mid[2]], [fl / 2, 12, 1], yaw);
  }
  b.plan("details", "drum windows", 1);
  // eight-lobed double shell 72–128: max outer radius 38, rise 56; r(t) = 6 + 32(1 − t^1.35)^0.65
  const y72 = y8 + 64;
  const rOf = (t: number): number => 6 + 32 * Math.pow(1 - Math.pow(t, 1.35), 0.65);
  const N = 28;
  const prof = (off: number): { r: number; y: number }[] => Array.from({ length: N + 1 }, (_, j) => {
    const t = j / N;
    return { r: rOf(t) - off, y: y72 + 56 * t };
  });
  const outerP = prof(0);
  const innerP = prof(2);
  // a lobe: between two main ribs the shell bows outward like a cloister vault; lobe point radius on the octagon
  const lobeR = (r: number, phi: number): number => {
    // phi within a lobe: 0 at a main rib, π/8 at mid-lobe; octagonal cross-section with circumradius r at the ribs
    const half = Math.PI / 8;
    return (r * Math.cos(half)) / Math.cos(phi - half);
  };
  const mainA = (k: number): number => Math.PI / 8 + (2 * Math.PI * k) / 8;
  // eight main ribs: four parallel M chains each
  b.set({ comp: "dome", stage: "roof", band: "main ribs", course: 0 });
  for (let k = 0; k < 8; k++) {
    const a = mainA(k);
    for (let j = 0; j < N; j++) {
      b.set({ course: j });
      const p = outerP[j]!;
      const q = outerP[j + 1]!;
      for (const [dr, dt] of [[0, -0.3], [0, 0.3], [-0.55, -0.3], [-0.55, 0.3]] as const) {
        const P: V3 = [(p.r + dr) * Math.cos(a) - dt * Math.sin(a), p.y, cz + (p.r + dr) * Math.sin(a) + dt * Math.cos(a)];
        const Q: V3 = [(q.r + dr) * Math.cos(a) - dt * Math.sin(a), q.y, cz + (q.r + dr) * Math.sin(a) + dt * Math.cos(a)];
        chain(b, "M", P, Q, { mode: "overhang", up: [Math.cos(a), 0, Math.sin(a)] });
      }
    }
  }
  b.plan("roof", "main ribs", N);
  // sixteen secondary ribs: two M chains each, on the lobe surface at ±1/3 of the lobe
  b.set({ stage: "roof", band: "secondary ribs" });
  for (let k = 0; k < 8; k++) {
    for (const f of [1 / 3, 2 / 3]) {
      const phi = (Math.PI / 4) * f;
      const a = mainA(k) + phi;
      for (let j = 0; j < N; j++) {
        b.set({ course: j });
        const p = outerP[j]!;
        const q = outerP[j + 1]!;
        const rp = lobeR(p.r, phi);
        const rq = lobeR(q.r, phi);
        for (const dt of [-0.26, 0.26]) chain(b, "M", [rp * Math.cos(a) - dt * Math.sin(a), p.y, cz + rp * Math.sin(a) + dt * Math.cos(a)], [rq * Math.cos(a) - dt * Math.sin(a), q.y, cz + rq * Math.sin(a) + dt * Math.cos(a)], { mode: "overhang", up: [Math.cos(a), 0, Math.sin(a)] });
      }
    }
  }
  b.plan("roof", "secondary ribs", N);
  // 28 rings on the outer shell (octagonal lobed rings), and the inner shell's rings and ribs
  b.set({ stage: "roof", band: "shell rings" });
  const lobedRing = (r: number, y: number, stock: "M" | "D"): void => {
    for (let k = 0; k < 8; k++) {
      for (let s = 0; s < 3; s++) {
        const p0 = (Math.PI / 4) * (s / 3);
        const p1 = (Math.PI / 4) * ((s + 1) / 3);
        const a0 = mainA(k) + p0;
        const a1 = mainA(k) + p1;
        const r0 = lobeR(r, p0);
        const r1 = lobeR(r, p1);
        chain(b, stock, [r0 * Math.cos(a0), y, cz + r0 * Math.sin(a0)], [r1 * Math.cos(a1), y, cz + r1 * Math.sin(a1)], { mode: "overhang", up: [0, 1, 0] });
      }
    }
  };
  for (let j = 1; j <= N; j++) {
    b.set({ course: j });
    lobedRing(outerP[j]!.r, outerP[j]!.y, "M");
  }
  b.plan("roof", "shell rings", N);
  b.set({ stage: "roof", band: "inner shell" });
  for (let j = 0; j <= N; j += 2) {
    b.set({ course: j });
    lobedRing(innerP[j]!.r, innerP[j]!.y, "M");
  }
  for (let k = 0; k < 8; k++) {
    const a = mainA(k);
    for (let j = 0; j < N; j++) chain(b, "M", [innerP[j]!.r * Math.cos(a), innerP[j]!.y, cz + innerP[j]!.r * Math.sin(a)], [innerP[j + 1]!.r * Math.cos(a), innerP[j + 1]!.y, cz + innerP[j + 1]!.r * Math.sin(a)], { mode: "overhang", up: [Math.cos(a), 0, Math.sin(a)] });
  }
  // shell ties: every fourth ring at every main rib, two M tie chains across the 2 m cavity (7 × 8 × 2)
  b.set({ stage: "roof", band: "shell ties", course: 0 });
  for (let j = 4; j <= N; j += 4) {
    for (let k = 0; k < 8; k++) {
      const a = mainA(k);
      for (const dt of [-0.6, 0.6]) {
        const o = outerP[j]!;
        const i = innerP[j]!;
        chain(b, "M", [(o.r - 0.6) * Math.cos(a) - dt * Math.sin(a), o.y - 0.3, cz + (o.r - 0.6) * Math.sin(a) + dt * Math.cos(a)], [(i.r - 0.3) * Math.cos(a) - dt * Math.sin(a), i.y - 0.3, cz + (i.r - 0.3) * Math.sin(a) + dt * Math.cos(a)], { up: [0, 1, 0] });
      }
    }
  }
  b.plan("roof", "shell ties", 1);
  // lobe infill: each longitudinal segment of each lobe divided into four cells, D ±45° herringbone with M frames (near LOD)
  b.set({ stage: "details", band: "herringbone", tier: 2 });
  for (let k = 0; k < 8; k++) {
    for (let j = 0; j < N; j++) {
      b.set({ course: j });
      const p = outerP[j]!;
      const q = outerP[j + 1]!;
      for (let cell = 0; cell < 4; cell++) {
        const f0 = cell / 4;
        const f1 = (cell + 1) / 4;
        const ph0 = (Math.PI / 4) * f0;
        const ph1 = (Math.PI / 4) * f1;
        const pt = (rr: number, ph: number, y: number): V3 => {
          const a = mainA(k) + ph;
          const r2 = lobeR(rr, ph) + 0.2;
          return [r2 * Math.cos(a), y, cz + r2 * Math.sin(a)];
        };
        const A = pt(p.r, ph0, p.y);
        const B2 = pt(p.r, ph1, p.y);
        const C = pt(q.r, ph1, q.y);
        const D = pt(q.r, ph0, q.y);
        if ((cell + j) % 2) chain(b, "D", A, C, { mode: "overhang" });
        else chain(b, "D", B2, D, { mode: "overhang" });
        if (cell === 0) chain(b, "M", A, D, { mode: "overhang" });
        void B2;
      }
    }
  }
  b.set({ tier: null });
  b.plan("details", "herringbone", N);
  // the shell surfaces: plank shells per ring band (outer) so the dome reads closed, a maintenance opening on one lobe
  for (let j = 0; j < N; j++) {
    const p = outerP[j]!;
    const q = outerP[j + 1]!;
    const rm = (p.r + q.r) / 2;
    b.shellCyl([0, (p.y + q.y) / 2, cz], rm * 0.98, Math.max(0.1, (q.y - p.y) / 2), "plank");
  }
  // dome collision: rings of boxes around the outer surface
  for (let j = 0; j < N; j += 2) {
    const p = outerP[j]!;
    const q = outerP[Math.min(N, j + 2)]!;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / n;
      const rm = (p.r + q.r) / 2;
      b.box([rm * Math.cos(a), (p.y + q.y) / 2, cz + rm * Math.sin(a)], [(Math.PI * Math.max(p.r, q.r)) / n + 0.6, Math.max(0.8, (q.y - p.y) / 2 + 0.4), Math.max(0.8, Math.abs(p.r - q.r) / 2 + 0.8)], yawForX(-Math.sin(a), Math.cos(a)));
    }
  }
  // the broad ring below the lantern: a viewing platform at 128
  b.set({ stage: "beams", band: "lantern ring", course: 0 });
  ring(b, "M", 0, y72 + 56.25, cz, 6.8, 16, 2);
  // the broad viewing ring: a deck around the lantern's base (the dome's top, radius 6 → a cantilevered 10 m ring)
  b.with({ tier: 2 }, () => deck(b, "M", 0, y72 + 56.75, cz, 20, 20, "x"));
  ring(b, "M", 0, y72 + 56.25, cz, 10, 16, 2);
  b.box([0, y72 + 56, cz], [10, 0.6, 10]);
  b.plan("beams", "lantern ring", 1);
  // lantern 128–144: octagonal frame r 6, eight column bundles (4 M each, lower 8 m), eight converging M ribs and four D rings above
  b.set({ comp: "lantern", stage: "roof", band: "lantern", course: 0 });
  const lv = ngon(8, 5.5, 0, 0, cz, Math.PI / 8);
  for (const v of lv) for (const [o1, o2] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]] as const) chain(b, "M", [v[0] + o1 - 0.25, y72 + 57, v[2] + o2 - 0.25], [v[0] + o1 - 0.25, y72 + 65, v[2] + o2 - 0.25], { up: [0, 0, 1] });
  b.set({ course: 1 });
  for (const v of lv) chain(b, "M", [v[0], y72 + 65, v[2]], [0, y72 + 72.5, cz], { mode: "overhang" });
  for (let j = 0; j < 4; j++) ring(b, "D", 0, y72 + 66 + j * 1.6, cz, 5 * (1 - (j + 1) / 5), 8, 1, { phase: Math.PI / 8 });
  b.plan("roof", "lantern", 2);
  b.cyl([0, y72 + 61, cz], 5.8, 4);
  b.set({ comp: "main" });
  b.feature("pointed eight-lobed dome with eight main and sixteen secondary ribs", [0, 110, cz]);
  b.feature("a local reveal of the double shell (ties across the 2 m cavity)", [0, 100, cz - 30]);
  b.feature("lantern above the broad viewing ring", [0, 136, cz]);
  b.revise({ item: "L11 double-shell reveal", original: "maintenance-display opening", revised: "the outer shell's plank infill is omitted on the octagon's −z lobe between rings 8 and 16, showing the inner shell and ties", reason: "an honest reveal without a new visitor route through the 2 m cavity", impact: "visible from the hall roof and from flight" });
  b.entry("hall", [0, 0, -126], [0, y8, cz], 12, 20, true, "up the front flight, through the hall and under the dome");
  b.entry("ribs", [0, y8 + 70, cz - 50], [0, y72 + 64, cz - 16], 8, 8, false, "rise beside the external main ribs to the lantern ring (flight)");
  b.viewAt("ground", "ground", [10, 1.65, -130], [0, 70, -40], "the hall front with the dome rising behind");
  b.viewAt("interior", "interior", [4, y8 + 1.65, cz - 6], [0, y8 + 110, cz + 4], "inside the octagon looking into the dome");
  b.viewAt("high", "high", [130, 190, -140], [0, 90, cz], "the eight lobes from above");
  b.viewAt("detail", "detail", [0, y72 + 56.75 + 1.65, cz - 8.5], [0, y72 + 66, cz], "the lantern from its ring");
  b.safe("front", [0, 0, -128], 0);
  b.safe("octagon", [0, y8, cz], 0);
  b.safe("lantern-ring", [0, y72 + 56.75, cz - 8.5], 0);
}

// ================================================================= L12

/**
 * L12 Embrace Square, 280 × 240 × 154. Two four-deep curved colonnade wings
 * (128 columns) embrace an open square in front of a nine-bay facade, a
 * 32-sided drum, an authored elliptical dome and a lantern.
 */
export function L12(b: Builder): void {
  // square base 0–6: three 2 m bands under the colonnades (curved M frames, 8 m grids), the square open
  const SC: V3 = [0, 0, -16]; // centre of the colonnade circles
  const R0 = 118; // innermost colonnade radius; rows at 118/122/126/130
  const rowsR = [118, 122, 126, 130];
  // each wing: 16 arc positions over 100° of arc, centred on ±x
  const wingAngles = (sx: number): number[] => Array.from({ length: 16 }, (_, i) => (sx > 0 ? 0 : Math.PI) + ((i - 7.5) * (66 / 15) * Math.PI) / 180);
  b.revise({ item: "L12 colonnade plan", original: "two wings of 16 arc positions × four radial rows (128 columns)", revised: "wings on circles of radius 118/122/126/130 m around (0, −16), each over 66° of arc centred on ±x; the wing bases reach ±140 m (280 m); two paved forecourt bands mark the square's front at z = −120; the facade base reaches z = +120", reason: "fits the 280 m width with the facade and dome on +z inside the 240 m depth", impact: "the main approach crosses the open square between the wing ends" });
  for (const sx of [-1, 1]) {
    b.set({ comp: `wing ${sx > 0 ? "E" : "W"} base` });
    const angs = wingAngles(sx);
    for (let band = 0; band < 3; band++) {
      b.set({ stage: "base", band: "colonnade base", course: band });
      for (const r of [rowsR[0]! - 4, rowsR[3]! + 10]) {
        for (let i = 0; i + 1 < angs.length; i++) {
          const a0 = angs[i]! - (sx > 0 ? 0.03 : -0.03);
          const a1 = angs[i + 1]!;
          for (const dy of [0.25, 0.75, 1.25, 1.75]) chain(b, "M", [SC[0] + r * Math.cos(a0), band * 2 + dy, SC[2] + r * Math.sin(a0)], [SC[0] + r * Math.cos(a1), band * 2 + dy, SC[2] + r * Math.sin(a1)], { up: [0, 1, 0], mode: "overhang" });
        }
      }
    }
    // the colonnade floor: decking between the base frames
    b.set({ stage: "base", band: "colonnade floor", course: 0 });
    for (let i = 0; i + 1 < angs.length; i++) {
      const am = (angs[i]! + angs[i + 1]!) / 2;
      const span = (angs[i + 1]! - angs[i]!) * 124;
      for (let r = rowsR[0]! - 3.5; r <= rowsR[3]! + 9.5; r += 0.52) {
        b.with({ tier: 2 }, () => chain(b, "M", [SC[0] + r * Math.cos(angs[i]!), 6.25, SC[2] + r * Math.sin(angs[i]!)], [SC[0] + r * Math.cos(angs[i + 1]!), 6.25, SC[2] + r * Math.sin(angs[i + 1]!)], { up: [0, 1, 0], mode: "overhang" }));
      }
      b.box([SC[0] + 124 * Math.cos(am), 3, SC[2] + 124 * Math.sin(am)], [Math.abs(span) / 2 + 0.6, 3, 9.5], yawForX(-Math.sin(am), Math.cos(am)));
      b.ramp([SC[0] + (rowsR[0]! - 5.5) * Math.cos(am), 3, SC[2] + (rowsR[0]! - 5.5) * Math.sin(am)], Math.abs(span) / 2 + 0.6, 1.5, yawForX(-Math.sin(am), Math.cos(am)) + (sx > 0 ? 0 : 0), 0, 0, -0.5);
    }
    // 64 columns per wing: seven 4 m shaft segments (16 M ribs + 16 D ring ties), capital: four outward D rings + three M abacus layers
    b.plan("columns", "colonnade shafts", 7);
    angs.forEach((a, i) => {
      rowsR.forEach((r, row) => {
        b.at([SC[0] + r * Math.cos(a), 6, SC[2] + r * Math.sin(a)], 0, () => {
          b.set({ comp: `wing ${sx > 0 ? "E" : "W"} column ${i + 1}.${row + 1}`, stage: "columns", band: "colonnade shafts" });
          for (let s = 0; s < 7; s++) {
            b.set({ course: s });
            const ya = s * 4;
            const ra = 1.25 - 0.035 * s;
            const rb = 1.25 - 0.035 * (s + 1);
            for (let k = 0; k < 16; k++) {
              const t = (2 * Math.PI * k) / 16;
              chain(b, "M", [(ra - 0.25) * Math.cos(t), ya, (ra - 0.25) * Math.sin(t)], [(rb - 0.25) * Math.cos(t), ya + 4, (rb - 0.25) * Math.sin(t)], { up: [Math.cos(t), 0, Math.sin(t)] });
            }
            ring(b, "D", 0, ya + 2, 0, ra - 0.5, 16, 1);
          }
          b.shellCyl([0, 14, 0], 0.85, 14, "shade");
          b.set({ stage: "details", band: "colonnade capitals", course: 0 });
          for (let j = 0; j < 4; j++) ring(b, "D", 0, 28.1 + j * 0.3, 0, 1.05 + 0.18 * j, 16, 1);
          for (let j = 0; j < 3; j++) rect(b, "M", 0, 29.3 + j * 0.5, 0, 3.4, 3.4, 1);
          b.cyl([0, 14, 0], 1.25, 14);
          b.footing([0, 0, 0]);
        });
      });
      // 38–44 curved entablature: handled per span below
    });
    // curved entablature: four M curved chains above each column row, two M transverse groups between rows, six moulding courses
    b.set({ stage: "beams", band: "curved entablature", course: 0 });
    for (let i = 0; i + 1 < angs.length; i++) {
      for (const r of rowsR) for (const dy of [0.25, 0.75, 1.25, 1.75]) chain(b, "M", [SC[0] + r * Math.cos(angs[i]!), 6 + 32 + dy, SC[2] + r * Math.sin(angs[i]!)], [SC[0] + r * Math.cos(angs[i + 1]!), 6 + 32 + dy, SC[2] + r * Math.sin(angs[i + 1]!)], { up: [0, 1, 0], mode: "overhang" });
    }
    for (const a of angs) for (let row = 0; row < 3; row++) for (const dy of [2.25, 2.75]) chain(b, "M", [SC[0] + rowsR[row]! * Math.cos(a), 6 + 32 + dy, SC[2] + rowsR[row]! * Math.sin(a)], [SC[0] + rowsR[row + 1]! * Math.cos(a), 6 + 32 + dy, SC[2] + rowsR[row + 1]! * Math.sin(a)], { up: [0, 1, 0] });
    b.set({ stage: "beams", band: "mouldings" });
    for (let j = 0; j < 6; j++) {
      b.set({ course: j });
      for (const [r, sgn] of [[rowsR[0]!, -1], [rowsR[3]!, 1]] as const) {
        const rr = r + sgn * (1.2 + 0.2 * j);
        for (let i = 0; i + 1 < angs.length; i++) chain(b, "M", [SC[0] + rr * Math.cos(angs[i]!), 6 + 35 + j * 0.5, SC[2] + rr * Math.sin(angs[i]!)], [SC[0] + rr * Math.cos(angs[i + 1]!), 6 + 35 + j * 0.5, SC[2] + rr * Math.sin(angs[i + 1]!)], { up: [0, 1, 0], mode: "overhang" });
      }
    }
    // roof deck of the colonnade and its collider
    b.set({ stage: "roof", band: "colonnade roof", course: 0 });
    // radial M roof joists over every column line and mid-span, carrying the roof boards
    for (let i = 0; i < angs.length; i++) {
      for (const a of i + 1 < angs.length ? [angs[i]!, (angs[i]! + angs[i + 1]!) / 2] : [angs[i]!]) {
        chain(b, "M", [SC[0] + (rowsR[0]! - 1.5) * Math.cos(a), 6 + 40.75, SC[2] + (rowsR[0]! - 1.5) * Math.sin(a)], [SC[0] + (rowsR[3]! + 1.5) * Math.cos(a), 6 + 40.75, SC[2] + (rowsR[3]! + 1.5) * Math.sin(a)], { up: [0, 1, 0] });
      }
    }
    for (let i = 0; i + 1 < angs.length; i++) {
      const am = (angs[i]! + angs[i + 1]!) / 2;
      const span = Math.abs(angs[i + 1]! - angs[i]!) * 124;
      b.shell([SC[0] + 124 * Math.cos(am), 6 + 41.6, SC[2] + 124 * Math.sin(am)], [span / 2 + 0.3, 0.3, 7.5], "plank", { yaw: yawForX(-Math.sin(am), Math.cos(am)) });
      b.box([SC[0] + 124 * Math.cos(am), 6 + 40, SC[2] + 124 * Math.sin(am)], [span / 2 + 0.5, 2, 7.8], yawForX(-Math.sin(am), Math.cos(am)));
      // abstract 12 D roof ornament every second column position
      if (i % 2 === 0) {
        b.set({ stage: "details", band: "roof ornaments" });
        const p: V3 = [SC[0] + rowsR[0]! * Math.cos(angs[i]!), 6 + 38 + 6, SC[2] + rowsR[0]! * Math.sin(angs[i]!)];
        for (let k = 0; k < 6; k++) {
          const t = (Math.PI * k) / 6;
          chain(b, "D", add(p, [0.5 * Math.cos(t), 0, 0.5 * Math.sin(t)]), add(p, [0.2 * Math.cos(t), 1.5, 0.2 * Math.sin(t)]), { up: [Math.cos(t), 0, Math.sin(t)] });
          chain(b, "D", add(p, [0.2 * Math.cos(t), 1.5, 0.2 * Math.sin(t)]), add(p, [0, 2.4, 0]), { up: [Math.cos(t), 0, Math.sin(t)] });
        }
        b.set({ stage: "roof", band: "colonnade roof" });
      }
    }
  }
  b.plan("roof", "colonnade roof", 1);
  // central facade 6–62: 140 m wide at z = +78, nine bays (middle three wider), two tiers, deep central doors
  const FZ = 46;
  b.set({ comp: "facade base" });
  platform(b, { cx: 0, cz: FZ + 37, w: 150, d: 74, bands: [0, 0, 0].map(() => ({ h: 2, inset: 0 })), frameStock: "M", framesPerBand: 4, gridP: 8, deckStock: "M", band: "facade base" });
  approach(b, 0, 0, FZ - 6 - 24, 40, 6, 1, "facade");
  // the square's forecourt: a low paved band of D decking closing the square at z = −120 (the envelope's front edge)
  b.set({ comp: "square", stage: "base", band: "square paving", course: 0 });
  for (const sx of [-1, 1]) b.with({ tier: 2 }, () => deck(b, "M", sx * 70, 0.25, -116, 40, 8, "x"));
  b.box([-70, 0.15, -116], [20, 0.15, 4]);
  b.box([70, 0.15, -116], [20, 0.15, 4]);
  b.plan("base", "square paving", 1);
  const bayX = [-70, -56, -42, -28, -12, 12, 28, 42, 56, 70];
  b.revise({ item: "L12 facade bays", original: "nine bays with the middle three wider", revised: "bay lines at x = ±70/±56/±42/±28/±12: six outer bays of 14 m and three middle bays of 16/24/16 m", reason: "a 16 m main entrance clearance needs the central bay ≥ 16 m between column chains", impact: "the main door is 18 m clear" });
  for (const x of bayX) {
    b.at([x, 6, FZ], 0, () => {
      b.set({ comp: "facade", stage: "columns", band: "facade columns" });
      for (let tier = 0; tier < 2; tier++) {
        for (let c = 0; c < 7; c++) {
          b.set({ course: tier * 7 + c });
          const ya = tier * 28 + c * 4;
          for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) chain(b, "M", [ox, ya, oz], [ox, ya + 4, oz], { up: [0, 0, 1] });
        }
      }
      b.box([0, 28, 0], [1, 28, 1]);
      b.footing([0, 0, 0]);
    });
  }
  b.plan("columns", "facade columns", 14);
  b.set({ comp: "facade", stage: "beams", band: "facade beams", course: 0 });
  for (const y of [6 + 27, 6 + 28.5, 6 + 55, 6 + 56]) for (const z of [FZ - 0.5, FZ + 0.5]) chain(b, "M", [-70.5, y, z], [70.5, y, z], { up: [0, 1, 0] });
  b.plan("beams", "facade beams", 1);
  // walls between bay lines with deep doors/windows on both tiers in the central three bays
  for (let k = 0; k + 1 < bayX.length; k++) {
    const xa = bayX[k]!;
    const xb = bayX[k + 1]!;
    const central = k >= 3 && k <= 5;
    const doorW = central ? (k === 4 ? 18 : 10) : 6;
    const ops = [
      { x0: (xb - xa) / 2 - doorW / 2, x1: (xb - xa) / 2 + doorW / 2, y0: central ? 0 : 8, y1: central ? (k === 4 ? 22 : 18) : 20 },
      { x0: (xb - xa) / 2 - doorW / 2 + (central ? 1 : 0), x1: (xb - xa) / 2 + doorW / 2 - (central ? 1 : 0), y0: 32, y1: 50 },
    ];
    b.set({ stage: "columns", band: "facade walls", course: 0 });
    b.at([xa + 1, 6, FZ + 1.5], 0, () => wall(b, xb - xa - 2, 0, 56, 4, { stock: "M", facing: "M", openings: ops, facingStep: 1.1 }));
  }
  b.plan("columns", "facade walls", 1);
  // the hall behind the facade (roof at 62) and the drum/dome over its centre at z = FZ + 34
  const DZ = FZ + 34;
  b.set({ comp: "side roofs", stage: "roof", band: "side roofs", course: 0 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, 62.5, FZ + 34, 140, 62, "x", [{ x0: -40, x1: 40, z0: DZ - 40, z1: DZ + 40 }]));
  b.box([-56, 62, DZ], [16, 0.6, 31]);
  b.box([56, 62, DZ], [16, 0.6, 31]);
  b.box([0, 62, DZ - 36], [40, 0.6, 5]);
  b.box([0, 62, DZ + 36], [40, 0.6, 1]);
  for (const sx of [-1, 1]) for (const z of [FZ + 3, FZ + 65]) {
    b.box([sx * 70, 34, (FZ + 3 + FZ + 65) / 2], [0.8, 28, 31]);
    void z;
  }
  b.box([0, 34, FZ + 65], [70, 28, 0.8]);
  b.shell([0, 34, FZ + 65], [70, 28, 0.4], "plank");
  for (const sx of [-1, 1]) b.shell([sx * 70, 34, FZ + 34], [0.4, 28, 31], "plank");
  b.plan("roof", "side roofs", 1);
  // drum 62–78: 32 sides, a window every two sides (16), 16 main column bundles, 32 M ring chains over four layers
  b.set({ comp: "drum", stage: "columns", band: "drum", course: 0 });
  const rD = 38;
  for (let i = 0; i < 32; i++) {
    const a0 = (2 * Math.PI * i) / 32;
    const a1 = (2 * Math.PI * (i + 1)) / 32;
    const p = (a: number, y: number): V3 => [rD * Math.cos(a), y, DZ + 0.84 * rD * Math.sin(a)];
    if (i % 2 === 0) for (const [o1] of [[0], [0.55]] as const) chain(b, "M", add(p(a0, 62), [o1 * Math.cos(a0), 0, o1 * Math.sin(a0)]), add(p(a0, 78), [o1 * Math.cos(a0), 0, o1 * Math.sin(a0)]), { up: [0, 0, 1] });
    for (let layer = 0; layer < 4; layer++) {
      const y = layer < 2 ? 62.25 + layer * 0.5 : 76.75 + (layer - 2) * 0.5;
      chain(b, "M", p(a0, y), p(a1, y), { mode: "overhang", up: [0, 1, 0] });
    }
    if (i % 2 === 1) {
      // window: D frame in the side
      b.set({ stage: "details", band: "drum windows" });
      const c0 = p(a0 + 0.02, 66);
      const c1 = p(a1 - 0.02, 66);
      chain(b, "D", c0, c1, { mode: "overhang" });
      chain(b, "D", add(c0, [0, 8, 0]), add(c1, [0, 8, 0]), { mode: "overhang" });
      b.set({ stage: "columns", band: "drum" });
      b.shell([(p(a0, 70)[0] + p(a1, 70)[0]) / 2, 70, (p(a0, 70)[2] + p(a1, 70)[2]) / 2], [3.5, 4, 0.1], "glass", { yaw: yawForX(p(a1, 0)[0] - p(a0, 0)[0], p(a1, 0)[2] - p(a0, 0)[2]) });
    } else b.shell([(p(a0, 70)[0] + p(a1, 70)[0]) / 2, 70, (p(a0, 70)[2] + p(a1, 70)[2]) / 2], [3.6, 8, 0.4], "plank", { yaw: yawForX(p(a1, 0)[0] - p(a0, 0)[0], p(a1, 0)[2] - p(a0, 0)[2]) });
  }
  b.cyl([0, 70, DZ], rD, 8);
  b.plan("columns", "drum", 1);
  // elliptical dome 78–142: 32 double-M ribs × 32 segments and 32 D/M rings; rx = 8 + 30√(1−t²), rz = 8 + 24√(1−t²)
  b.set({ comp: "dome" });
  const K = 32;
  const rx = (t: number): number => 8 + 30 * Math.sqrt(Math.max(0, 1 - t * t));
  const rz = (t: number): number => 8 + 24 * Math.sqrt(Math.max(0, 1 - t * t));
  for (let i = 0; i < 32; i++) {
    const a = (2 * Math.PI * i) / 32;
    for (let j = 0; j < K; j++) {
      b.set({ stage: "roof", band: "dome ribs", course: j });
      const t0 = j / K;
      const t1 = (j + 1) / K;
      const P: V3 = [rx(t0) * Math.cos(a), 78 + 64 * t0, DZ + rz(t0) * Math.sin(a)];
      const Q: V3 = [rx(t1) * Math.cos(a), 78 + 64 * t1, DZ + rz(t1) * Math.sin(a)];
      chain(b, "M", P, Q, { mode: "overhang", up: [Math.cos(a), 0, Math.sin(a)] });
      chain(b, "M", add(P, [-0.52 * Math.cos(a), 0.1, -0.52 * Math.sin(a)]), add(Q, [-0.52 * Math.cos(a), 0.1, -0.52 * Math.sin(a)]), { mode: "overhang", up: [Math.cos(a), 0, Math.sin(a)] });
    }
  }
  b.plan("roof", "dome ribs", K);
  for (let j = 0; j < K; j++) {
    b.set({ stage: "roof", band: "dome rings", course: j });
    const t = (j + 1) / K;
    const segs = 32;
    for (let i = 0; i < segs; i++) {
      const a0 = (2 * Math.PI * i) / segs;
      const a1 = (2 * Math.PI * (i + 1)) / segs;
      chain(b, j % 2 ? "D" : "M", [rx(t) * Math.cos(a0), 78 + 64 * t, DZ + rz(t) * Math.sin(a0)], [rx(t) * Math.cos(a1), 78 + 64 * t, DZ + rz(t) * Math.sin(a1)], { mode: "overhang", up: [0, 1, 0] });
    }
    const t0 = j / K;
    b.shell([0, 78 + 64 * (t0 + t) / 2, DZ], [(rx(t0) + rx(t)) / 2 - 0.3, 1, (rz(t0) + rz(t)) / 2 - 0.3], "plank");
  }
  b.plan("roof", "dome rings", K);
  for (let j = 0; j < K; j += 2) {
    const t = (j + 1) / K;
    for (let i = 0; i < 16; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / 16;
      b.box([rx(t) * Math.cos(a), 78 + 64 * t, DZ + rz(t) * Math.sin(a)], [(Math.PI * rx(t)) / 16 + 0.5, 2.2, 1.2], yawForX(-Math.sin(a), Math.cos(a)));
    }
  }
  // lantern 142–154: sixteen-column ring pavilion (two connected M each), 16 converging ribs rising 4 m, top ring 32 D
  b.set({ comp: "lantern", stage: "roof", band: "lantern", course: 0 });
  for (let i = 0; i < 16; i++) {
    const a = (2 * Math.PI * i) / 16;
    const p: V3 = [7 * Math.cos(a), 142, DZ + 7 * Math.sin(a)];
    chain(b, "M", p, add(p, [0, 4, 0]), { up: [Math.cos(a), 0, Math.sin(a)] });
    chain(b, "M", add(p, [0, 4, 0]), add(p, [0, 8, 0]), { up: [Math.cos(a), 0, Math.sin(a)] });
    chain(b, "M", add(p, [0, 8, 0]), [0, 154 - 0.25, DZ], { mode: "overhang" });
  }
  ring(b, "D", 0, 150, DZ, 7, 32, 1);
  b.plan("roof", "lantern", 1);
  b.cyl([0, 146, DZ], 7.5, 4);
  b.set({ comp: "main" });
  b.feature("four-deep curved colonnades (128 columns)", [-124, 20, -16]);
  b.feature("nine-bay central facade with deep doors", [0, 30, FZ]);
  b.feature("authored elliptical dome with lantern over a 32-sided drum", [0, 120, DZ]);
  b.entry("square", [0, 0, -140], [0, 6, FZ - 2], 16, 22, true, "across the open square between the wings and up to the 18 m main door");
  b.entry("colonnade", [-116, 6, -16], [-132, 6, -16], 3, 24, false, "into the four-deep colonnade between rows");
  b.entry("door", [0, 6, FZ - 4], [0, 6, DZ], 16, 20, true, "through the main door into the hall under the dome");
  b.viewAt("ground", "ground", [8, 1.65, -110], [0, 60, DZ], "the square embraced by the colonnades");
  // between two rows, looking along them (the eye looked 50° up a column face at 1.8 m)
  b.viewAt("interior", "interior", [-124, 7.65, -16], [-116, 16, 40], "inside the colonnade among four rows of columns");
  b.viewAt("high", "high", [0, 200, -250], [0, 50, 20], "the wings and the dome from above the square");
  b.viewAt("detail", "detail", [-112, 30, -14], [-118, 36, -16], "colonnade capital and curved entablature (flight)");
  b.safe("square", [0, 0, -100], 0);
  b.safe("colonnade", [-124, 6, -16], 0);
  b.safe("hall", [0, 6, DZ], 0);
}

export const _rc = { trussQuad, triTruss, floorGrid, rails, along, outward, sec, sphereCap, dome, corinthian, entasis };
