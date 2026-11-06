// Region E — Contemporary Sea Cliffs: L17 Vertical Court Tower, L18
// Nine-Bundle Cloud Tower, L19 Prismatic Brace Tower, L20 Three-Wing Skyline
// Peak. Each has its own structural organisation (curtain-wall mullions,
// bundled tubes, triangular bracing, a Y-plan with rotating setbacks); none
// is a height variant of a shared box generator.
import { add, Builder, lerp3, norm, scale, sub, type V3 } from "../core.ts";
import { chain, deck, floorGrid, rect, ring, sec } from "../parts.ts";
import { cone, ngon, rails } from "./common.ts";

const ux = (a: V3, c: V3): V3 => norm(sub(c, a));
const outN = (t: V3): V3 => [t[2], 0, -t[0]];

// ================================================================= L17

/**
 * L17 Vertical Court Tower, 80 × 56 × 244. An open 12 m lobby, 52 floors on a
 * 72 × 48 plan with 120 continuous mullion positions (2 m spacing), recessed
 * horizontal frames behind them, three terrace floors and an equipment crown.
 */
export function L17(b: Builder): void {
  const W = 72;
  const D = 48;
  // lobby 0–12: the perimeter of a 6 × 4 structural grid → 20 column bundles of four B chains; a 16 m central passage
  const xs = [-36, -24, -12, 0, 12, 24, 36];
  const zs = [-24, -12, 0, 12, 24];
  const lobbyCols: V3[] = [];
  for (const x of xs) lobbyCols.push([x, 0, -24], [x, 0, 24]);
  for (const z of [-12, 0, 12]) lobbyCols.push([-36, 0, z], [36, 0, z]);
  if (lobbyCols.length !== 20) throw new Error("L17 lobby count");
  b.set({ comp: "lobby" });
  b.plan("columns", "lobby columns", 2);
  // the 16 m central passage runs along z through x = 0: the column at (0, ±24) is set back into the core
  for (const p of lobbyCols) {
    const px = p[0];
    // the 16 m central passage along z at x = 0: the two bundles on its line are offset sideways to x = ±8
    const passage = px === 0;
    const at: V3 = passage ? [p[2] > 0 ? 8 : -8, 0, p[2]] : p;
    b.at(at, 0, () => {
      for (let c = 0; c < 2; c++) {
        b.set({ stage: "columns", band: "lobby columns", course: c });
        for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) chain(b, "B", [ox, c * 6, oz], [ox, c * 6 + 6, oz], { up: [0, 0, 1], mode: "lap", within: [0, 12] });
      }
      b.box([0, 6, 0], [1, 6, 1]);
      b.footing([0, 0, 0]);
    });
  }
  b.revise({ item: "L17 lobby passage", original: "20 column bundles on the 6 × 4 grid perimeter, 16 m central passage", revised: "the two bundles on the passage line (x = 0, z = ±24) move sideways to x = ±8 on their facades, so the passage along z is 16 m clear between them", reason: "a bundle on the passage axis would block it", impact: "same 20 bundles; the facade bays beside the passage are 8 and 4 m" });
  b.set({ stage: "beams", band: "lobby frame", course: 0 });
  for (let k = 0; k < 4; k++) rect(b, "M", 0, 10 + k * 0.5, 0, W + 1, D + 1, 1);
  for (const x of xs) chain(b, "M", [x, 11.75, -24], [x, 11.75, 24], { up: [0, 1, 0] });
  for (const z of zs) chain(b, "M", [-36, 11.25, z], [36, 11.25, z], { up: [0, 1, 0] });
  b.plan("beams", "lobby frame", 1);
  b.box([0, 11.75, 0], [36.5, 0.25, 24.5]);
  b.shell([0, 11.6, 0], [36, 0.3, 24], "plank");
  // a glazed inner lobby box set well back, leaving the open undercroft
  b.shell([0, 6, 0], [10, 6, 6], "glass");
  // floors 1–52 (12–220): perimeter 240 m, 2 m mullion spacing → 120 positions; per floor/position one M main
  // vertical + four D front detail members; one recessed R(72,48,4,1) frame per floor, behind the mullions
  const perim: V3[] = [[-36, 0, -24], [36, 0, -24], [36, 0, 24], [-36, 0, 24]];
  const positions: { p: V3; out: V3; t: V3 }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = perim[i]!;
    const c = perim[(i + 1) % 4]!;
    const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const t = ux(a, c);
    const o = outN(t);
    for (let s = 0; s < l; s += 2) positions.push({ p: add(a, scale(t, s)), out: o, t });
  }
  if (positions.length !== 120) throw new Error(`L17 mullions ${positions.length}`);
  b.set({ comp: "shaft" });
  const terraceFloors = new Set([16, 32, 48]);
  for (let f = 1; f <= 52; f++) {
    const y = 12 + (f - 1) * 4;
    b.set({ stage: "columns", band: "mullions", course: f });
    for (const m of positions) {
      // main vertical projecting 0.4 m out from the frame line
      const base = add(m.p, scale(m.out, 0.4 + 0.25));
      chain(b, "M", [base[0], y, base[2]], [base[0], y + 4, base[2]], { up: m.out });
      // four D front detail members: a narrow fin and its cap, one per metre of height pair
      b.with({ tier: 2, stage: "details", band: "mullion fins", course: f }, () => {
        const fin = add(m.p, scale(m.out, 0.4 + 0.5 + 0.0625));
        for (let q = 0; q < 4; q++) chain(b, "D", [fin[0], y + q, fin[2]], [fin[0], y + q + 1, fin[2]], { up: m.out });
      });
    }
    // the recessed horizontal frame (window sill/head band) behind the mullions; window cells retreat 0.6 m
    b.set({ stage: "beams", band: "floor frames", course: f });
    rect(b, "M", 0, y, 0, W, D, 1);
    b.with({ tier: 2, stage: "details", band: "window heads", course: f }, () => {
      for (let i = 0; i < 4; i++) {
        const a = perim[i]!;
        const c = perim[(i + 1) % 4]!;
        const o = outN(ux(a, c));
        for (const yy of [y + 0.7, y + 3.6]) chain(b, "D", add(add(a, scale(o, -0.6)), [0, yy, 0]), add(add(c, scale(o, -0.6)), [0, yy, 0]), { up: [0, 1, 0] });
      }
    });
    // window glass recessed 0.6 m and limited interior shading planes
    for (let i = 0; i < 4; i++) {
      const a = perim[i]!;
      const c = perim[(i + 1) % 4]!;
      const t = ux(a, c);
      const o = outN(t);
      const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
      const mid = add(lerp3(a, c, 0.5), scale(o, -0.6));
      b.shell([mid[0], y + 2.2, mid[2]], [l / 2, 1.45, 0.03], "glass", { yaw: Math.atan2(-t[2], t[0]) });
      b.shell(add([mid[0], y + 0.35, mid[2]], scale(o, -0.1)), [l / 2, 0.35, 0.08], "shade", { yaw: Math.atan2(-t[2], t[0]) });
      b.box([mid[0], y + 2, mid[2]], [l / 2 + 0.4, 2, 0.6], Math.atan2(-t[2], t[0]));
    }
    // the floor plate collider (for landing on terraces; interior floors sealed visually by shells)
    if (terraceFloors.has(f)) {
      // an 8 m-wide edge-viewing terrace projecting 4 m outward, with three-M bracket groups every 8 m
      b.set({ stage: "beams", band: "terraces", course: f });
      const yt = y;
      for (let i = 0; i < 4; i++) {
        const a = perim[i]!;
        const c = perim[(i + 1) % 4]!;
        const t = ux(a, c);
        const o = outN(t);
        const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
        const mid = add(lerp3(a, c, 0.5), scale(o, 0));
        b.with({ tier: 2 }, () => {
          for (let k = 0; k < 8; k++) {
            const off = -4 + 0.25 + k * 1.07;
            chain(b, "M", add(add(a, scale(o, off)), [0, yt - 0.25, 0]), add(add(c, scale(o, off)), [0, yt - 0.25, 0]), { up: [0, 1, 0] });
          }
        });
        for (let s = 4; s < l; s += 8) {
          const p = add(a, scale(t, s));
          for (const d of [-0.5, 0, 0.5]) chain(b, "M", add(add(p, scale(t, d)), [0, yt - 4, 0]), add(add(add(p, scale(t, d)), scale(o, 3.7)), [0, yt - 0.5, 0]));
        }
        rails(b, [add(a, scale(o, 3.75)), add(c, scale(o, 3.75))], yt);
        b.box([mid[0], yt - 0.5, mid[2]], [l / 2 + 4, 0.5, 4], Math.atan2(-t[2], t[0]));
      }
    }
  }
  b.plan("columns", "mullions", 52);
  b.plan("beams", "floor frames", 52);
  b.revise({ item: "L17 terraces", original: "8 m-wide edge-viewing terraces around 76, 140 and 204 m, projecting 4 m", revised: "on floors 16, 32 and 48 (floor f's slab at 12 + 4(f − 1) = 72, 136, 200 m): a ring 8 m wide whose outer 4 m cantilevers beyond the facade on bracket groups every 8 m; the inner 4 m is the recessed floor edge", reason: "floor and elevation conventions resolved (floor 1 at 12 m)", impact: "the terraces reach the 80 × 56 envelope" });
  b.shell([0, 116, 0], [35.2, 104, 23.2], "shade");
  // equipment crown 220–244: six 4 m bands; first two continue the facade, last four add D louvres every 0.5 m
  b.set({ comp: "crown" });
  for (let k = 0; k < 6; k++) {
    const y = 220 + k * 4;
    b.set({ stage: "roof", band: "crown", course: k });
    for (const m of positions) {
      if (k >= 2 && Math.round(m.p[0] + m.p[2]) % 4 !== 0) continue;
      const base = add(m.p, scale(m.out, 0.65));
      chain(b, "M", [base[0], y, base[2]], [base[0], y + 4, base[2]], { up: m.out });
    }
    rect(b, "M", 0, y, 0, W, D, 1);
    if (k >= 2) {
      b.with({ tier: 2, stage: "details", band: "louvres", course: k }, () => {
        for (let yy = y + 0.25; yy < y + 4; yy += 0.5) {
          for (let i = 0; i < 4; i++) {
            const a = perim[i]!;
            const c = perim[(i + 1) % 4]!;
            const o = outN(ux(a, c));
            chain(b, "D", add(add(a, scale(o, 0.2)), [0, yy, 0]), add(add(c, scale(o, 0.2)), [0, yy, 0]), { up: [0, 1, 0], mode: "overhang" });
          }
        }
      });
    }
  }
  b.plan("roof", "crown", 6);
  // corner columns continue; a rectangular open roof court at 220
  b.set({ stage: "roof", band: "roof court", course: 0 });
  b.with({ tier: 2 }, () => deck(b, "M", 0, 220.5, 0, 70, 46, "x", [{ x0: -20, x1: 20, z0: -10, z1: 10 }]));
  b.box([0, 220, 0], [36, 0.5, 24]);
  for (const sx of [-1, 1]) b.box([sx * 36.2, 232, 0], [0.6, 12, 24]);
  for (const sz of [-1, 1]) b.box([0, 232, sz * 24.2], [36, 12, 0.6]);
  b.plan("roof", "roof court", 1);
  b.set({ comp: "main" });
  b.feature("120 continuous mullions projecting 0.4 m with recessed windows", [0, 100, -24]);
  b.feature("an open lobby of 20 bundled columns", [0, 6, -24]);
  b.feature("three edge-viewing terraces and a louvred crown", [0, 136, -28]);
  b.entry("lobby", [0, 0, -50], [0, 0, 50], 16, 9, true, "through the open lobby undercroft");
  b.entry("terraces", [0, 73, -30], [0, 201, -30], 8, 8, false, "rise from terrace to terrace (flight)");
  b.viewAt("ground", "ground", [4, 1.65, -40], [0, 140, -24], "under the mullions looking up the facade");
  b.viewAt("interior", "interior", [0, 1.65, -10], [20, 8, -24], "inside the open lobby");
  // from the seaward side (the old eye looked across the cliff ridge, which hid the lower third of the tower)
  b.viewAt("high", "high", [130, 270, -70], [0, 130, 0], "the tower from above the crown");
  b.viewAt("detail", "detail", [10, 137.65, -27], [0, 160, -24], "standing on the floor-32 terrace");
  b.safe("plaza", [0, 0, -50], 0);
  b.safe("terrace16", [0, 72, -27.5], 0);
  b.safe("terrace32", [0, 136, -27.5], 0);
  b.safe("terrace48", [0, 200, -27.5], 0);
  b.safe("roof", [0, 220.5, -14], 0);
}

// ================================================================= L18

/**
 * L18 Nine-Bundle Cloud Tower, 90 × 90 × 276. Nine 30 m square tubes A–I in a
 * 3 × 3 grid; A and I end at floor 30, C and G at 42, D/F/H at 54, B and E
 * continue to 60; equipment edges and antenna bundles on top.
 */
export function L18(b: Builder): void {
  const names = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  // north is −z: A/B/C at z = −30, D/E/F at 0, G/H/I at +30; x = −30 / 0 / +30
  const tubeAt = (i: number): V3 => [((i % 3) - 1) * 30, 0, (Math.floor(i / 3) - 1) * 30];
  const lastFloor: Record<string, number> = { A: 30, I: 30, C: 42, G: 42, D: 54, F: 54, H: 54, B: 60, E: 60 };
  b.revise({ item: "L18 terminations", original: "A and I end at 30; C and G at 42; D/F/H at 54; B/E continue to 60", revised: "as written; tube E (centre) is full height; B shares E's west… north face and continues beside it", reason: "unchanged", impact: "from above: nine → seven → cross of five → two" });
  const floorY = (f: number): number => 8 + (f - 1) * 4; // floor f occupies [floorY(f), floorY(f) + 4]
  // shared walls once: the grid lines x ∈ {−45, −15, 15, 45}, z ∈ {−45, −15, 15, 45}. A wall segment between two
  // grid nodes exists up to the highest floor of either neighbouring tube.
  const top = (i: number): number => floorY(lastFloor[names[i]!]!) + 4;
  const tubeIdx = (cx: number, cz: number): number => (cz + 1) * 3 + (cx + 1);
  b.set({ comp: "base" });
  // base 0–8: each tube's two base bands R(30,30,4,4) + G(30,30,6,4)
  for (let i = 0; i < 9; i++) {
    const c = tubeAt(i);
    for (let band = 0; band < 2; band++) {
      b.set({ stage: "base", band: "tube bases", course: band });
      rect(b, "M", c[0], band * 4, c[2], 30, 30, 4);
      b.with({ tier: 2 }, () => floorGrid(b, "M", c[0], band * 4 + 4, c[2], 29, 29, 6));
    }
  }
  b.box([0, 4, 0], [45, 4, 45]);
  b.plan("base", "tube bases", 2);
  b.footing([0, 0, 0]);
  // vertical edges: four-M corner bundles at each grid node, up to the highest tube touching it
  const nodeTop = (nx: number, nz: number): number => {
    let t = 0;
    for (const dx of [-1, 0]) for (const dz of [-1, 0]) {
      const cx = nx + dx;
      const cz = nz + dz;
      if (cx < -1 || cx > 1 || cz < -1 || cz > 1) continue;
      t = Math.max(t, top(tubeIdx(cx, cz)));
    }
    return t;
  };
  // grid lines inset so outward mullions (0.55 m) land on the 90 m envelope
  const G = [-44.45, -14.8, 14.8, 44.45];
  b.set({ comp: "tubes" });
  for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 4; iz++) {
    const t = nodeTop(ix - 1, iz - 1);
    if (t <= 8) continue;
    const x = G[ix]!;
    const z = G[iz]!;
    for (let y = 8; y < t; y += 4) {
      b.set({ stage: "columns", band: "tube corners", course: (y - 8) / 4 });
      for (const [ox, oz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]] as const) chain(b, "M", [x + ox, y, z + oz], [x + ox, y + 4, z + oz], { up: [0, 0, 1] });
    }
    b.box([x, (8 + t) / 2, z], [0.6, (t - 8) / 2, 0.6]);
  }
  b.plan("columns", "tube corners", 60);
  // walls along grid lines: between nodes (a, b) on a line, the wall's height is the max of the two tubes it separates
  const wallSeg = (a: V3, c: V3, h: number, out: V3): void => {
    // M mullions every 6 m and R-frame bands at every floor; glass shells between
    const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const t = ux(a, c);
    for (let y = 8; y < h; y += 4) {
      const f = (y - 8) / 4 + 1;
      b.set({ stage: "columns", band: "mullions", course: f });
      for (let s = 6; s < l - 0.5; s += 6) {
        const p = add(add(a, scale(t, s)), scale(out, 0.3));
        chain(b, "M", [p[0], y, p[2]], [p[0], y + 4, p[2]], { up: out });
      }
      b.set({ stage: "beams", band: "floor bands", course: f });
      chain(b, "M", add(a, [0, y + 0.25, 0]), add(c, [0, y + 0.25, 0]), { up: [0, 1, 0] });
      if (f % 4 === 0 && y > 176) chain(b, "M", add(a, [0, y + 0.75, 0]), add(c, [0, y + 0.75, 0]), { up: [0, 1, 0] });
    }
    const mid = lerp3(a, c, 0.5);
    b.shell([mid[0], (8 + h) / 2, mid[2]], [l / 2, (h - 8) / 2, 0.05], "glass", { yaw: Math.atan2(-t[2], t[0]) });
    b.box([mid[0], (8 + h) / 2, mid[2]], [l / 2 + 0.3, (h - 8) / 2, 0.6], Math.atan2(-t[2], t[0]));
  };
  for (let iz = 0; iz < 4; iz++) for (let ix = 0; ix < 3; ix++) {
    // a wall along x on line z = G[iz] between nodes ix and ix + 1: tubes (cx = ix − 1, cz = iz − 1) and (cz = iz − 2)
    const cx = ix - 1;
    let h = 8;
    for (const cz of [iz - 2, iz - 1]) if (cz >= -1 && cz <= 1) h = Math.max(h, top(tubeIdx(cx, cz)));
    const exterior = iz === 0 || iz === 3 || (() => {
      // an interior wall is exterior where one side has ended
      const aT = iz - 2 >= -1 ? top(tubeIdx(cx, iz - 2)) : 0;
      const bT = iz - 1 <= 1 ? top(tubeIdx(cx, iz - 1)) : 0;
      return aT !== bT;
    })();
    if (!exterior) {
      // shared interior walls only get floor bands (hidden structure), no mullions
      continue;
    }
    wallSeg([G[ix]!, 0, G[iz]!], [G[ix + 1]!, 0, G[iz]!], h, [0, 0, iz === 0 ? -1 : 1]);
  }
  for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) {
    const cz = iz - 1;
    let h = 8;
    for (const cx of [ix - 2, ix - 1]) if (cx >= -1 && cx <= 1) h = Math.max(h, top(tubeIdx(cx, cz)));
    const aT = ix - 2 >= -1 ? top(tubeIdx(ix - 2, cz)) : 0;
    const bT = ix - 1 <= 1 ? top(tubeIdx(ix - 1, cz)) : 0;
    if (!(ix === 0 || ix === 3 || aT !== bT)) continue;
    wallSeg([G[ix]!, 0, G[iz]!], [G[ix]!, 0, G[iz + 1]!], h, [ix === 0 ? -1 : 1, 0, 0]);
  }
  b.plan("columns", "mullions", 60);
  // where a tube ends below its neighbour, the neighbour's wall above is exterior: handled by the max height plus
  // the exterior test (aT ≠ bT walls carry mullions full height)
  // per-tube R(30,30,4,2) at floor tops every floor (hidden behind glass) — every fourth floor, as the deeper connecting band
  b.set({ stage: "beams", band: "connecting bands", course: 0 });
  for (let i = 0; i < 9; i++) {
    const c = tubeAt(i);
    for (let f = 4; f <= lastFloor[names[i]!]!; f += 4) {
      b.set({ course: f });
      rect(b, "M", c[0], floorY(f) + 3, c[2], 30, 30, 2);
    }
  }
  b.plan("beams", "connecting bands", 1);
  // roofs where tubes end: G decking, D rails, and a 4 m equipment edge on the tubes that reach the crown
  for (let i = 0; i < 9; i++) {
    const n = names[i]!;
    const c = tubeAt(i);
    const y = floorY(lastFloor[n]!) + 4;
    b.set({ comp: `tube ${n} roof`, stage: "roof", band: "tube roofs", course: 0 });
    floorGrid(b, "M", c[0], y + 0.5, c[2], 29, 29, 4);
    b.with({ tier: 2 }, () => deck(b, "M", c[0], y + 1, c[2], 29, 29, "x"));
    b.box([c[0], y + 0.5, c[2]], [15, 0.5, 15]);
    b.set({ stage: "details", band: "roof rails" });
    rails(b, [[c[0] - 14.6, 0, c[2] - 14.6], [c[0] - 14.6, 0, c[2] + 14.6], [c[0] + 14.6, 0, c[2] + 14.6], [c[0] + 14.6, 0, c[2] - 14.6]], y + 1, true);
    if (n === "B" || n === "E") {
      // crown: a 4 m equipment edge and a 24 m antenna bundle (four B/M chains with D ties every 4 m)
      b.set({ stage: "roof", band: "crown", course: 0 });
      for (const [ox, oz] of [[-14, -14], [14, -14], [14, 14], [-14, 14]] as const) chain(b, "M", [c[0] + ox, y + 1, c[2] + oz], [c[0] + ox, y + 5, c[2] + oz], { up: [0, 0, 1] });
      rect(b, "M", c[0], y + 4.5, c[2], 29, 29, 1);
      b.shell([c[0], y + 3, c[2]], [14.2, 2, 14.2], "shade");
      b.set({ course: 1 });
      const ax = c[0] + (n === "B" ? 6 : -6);
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]] as const) {
        chain(b, "B", [ax + ox, y + 5, c[2] + oz], [ax + ox * 0.5, y + 21, c[2] + oz * 0.5], { mode: "overhang" });
        chain(b, "M", [ax + ox * 0.5, y + 21, c[2] + oz * 0.5], [ax + ox * 0.3, y + 29 - 0.05, c[2] + oz * 0.3], { mode: "overhang" });
      }
      for (let k = 1; k <= 5; k++) ring(b, "D", ax, y + 5 + k * 4, c[2], 0.9 - k * 0.08, 4, 1, { phase: Math.PI / 4 });
      b.cyl([ax, y + 17, c[2]], 1, 12);
    }
  }
  b.plan("roof", "tube roofs", 1);
  b.plan("roof", "crown", 2);
  b.set({ comp: "main" });
  b.feature("nine square tubes ending at four different heights", [30, 128, -30]);
  b.feature("the cross of five tubes above floor 42", [0, 200, 0]);
  b.feature("antenna bundles on the two full-height tubes", [0, 260, 0]);
  // climb the four roof stages from outside: A's roof (floor 30) → C's (42) → D's (54) → B's (60), each hop
  // rising outside the remaining tubes and landing on the next roof
  const roofY = (n: string): number => floorY(lastFloor[n]!) + 5;
  // waypoints stay 8 m clear of the tubes' outer faces (±44.45) while passing them
  const hops: [V3, V3][] = [
    [[-30, roofY("A"), -30], [-30, roofY("C") + 2, -54]],
    [[-30, roofY("C") + 2, -54], [30, roofY("C") + 2, -54]],
    [[30, roofY("C") + 2, -54], [30, roofY("C"), -30]],
    [[30, roofY("C"), -30], [54, roofY("D") + 2, -30]],
    [[54, roofY("D") + 2, -30], [54, roofY("D") + 2, 0]],
    [[54, roofY("D") + 2, 0], [30, roofY("F"), 0]],
    [[30, roofY("F"), 0], [54, roofY("B") + 2, 0]],
    [[54, roofY("B") + 2, 0], [54, roofY("B") + 2, -54]],
    [[54, roofY("B") + 2, -54], [0, roofY("B") + 2, -54]],
    [[0, roofY("B") + 2, -54], [0, roofY("B"), -30]],
  ];
  hops.forEach(([a, c], k) => b.entry(`roofs-${k + 1}`, a, c, 10, 10, true, k === 0 ? "climb the four roof stages from outside (flight): A → C → F → B" : "…next roof stage"));
  b.entry("base", [0, 0, -70], [0, 0, -46], 12, 8, true, "to the base entrance in tube B's north face");
  b.viewAt("ground", "ground", [6, 1.65, -60], [0, 150, 0], "at the base of the bundle");
  b.viewAt("interior", "interior", [-30, 129 + 1.65, -30], [0, 220, 0], "on tube A's roof looking up the bundle");
  b.viewAt("high", "high", [0, 330, -60], [0, 150, 0], "the nine-tube plan from above");
  b.viewAt("detail", "detail", [30, 178.65, 30], [0, 230, 0], "standing on the G roof (floor 42)");
  b.safe("plaza", [0, 0, -62], 0);
  b.safe("roofA", [-30, 129, -30], 0);
  b.safe("roofC", [30, 177, -30], 0);
  b.safe("roofD", [-30, 225, 0], 0);
  b.safe("roofB", [0, 249, -30], 0);
}

// ================================================================= L19

/**
 * L19 Prismatic Brace Tower, 88 × 88 × 304. Four right-triangle prisms around
 * the centre of an 88 m square, ending at floors 40/48/56/64 with sloping
 * crowns; large X braces on every exterior face per eight floors.
 */
export function L19(b: Builder): void {
  // prism corners inset so the brace chords (1 m proud, two 1.02 m layers deep) land on the 88 m envelope
  const H = 41.4;
  // the square's corners NW, NE, SE, SW and centre O; the four triangles are (corner, corner, O) split along the
  // two diagonals: N = (NW, NE, O), E = (NE, SE, O), S = (SE, SW, O), W = (SW, NW, O)
  const NW: V3 = [-H, 0, -H];
  const NE: V3 = [H, 0, -H];
  const SE: V3 = [H, 0, H];
  const SW: V3 = [-H, 0, H];
  const O: V3 = [0, 0, 0];
  const tris: { name: string; v: [V3, V3, V3]; last: number }[] = [
    { name: "W", v: [SW, NW, O], last: 40 },
    { name: "S", v: [SE, SW, O], last: 48 },
    { name: "N", v: [NW, NE, O], last: 56 },
    { name: "E", v: [NE, SE, O], last: 64 },
  ];
  b.revise({ item: "L19 prisms", original: "four right-triangle zones around the centre, ending at floors 40/48/56/64", revised: "the 88 m square split by both diagonals into four isosceles right triangles W/S/N/E ending at floors 40/48/56/64; each part's crown slopes down toward the lower neighbour's side over its last four floors", reason: "the diagonals give one shared central edge (assigned once, to the last-ending prism E)", impact: "the 12 m diagonal route at the base runs from SW to NE between the W/S and N/E pairs" });
  const fy = (f: number): number => 8 + (f - 1) * 4;
  // base 0–8: edge beam grid at 8 m, a 12 m clear route along the SW–NE diagonal
  b.set({ comp: "base", stage: "base", band: "base", course: 0 });
  // edge beams on an 8 m grid, each grid line broken once where it crosses the 12 m diagonal route (|x − z| < 6√2)
  const cut = 6 * Math.SQRT2;
  for (let k = 0; k <= Math.floor((2 * H) / 8); k++) {
    const t = -H + k * 8;
    for (const y of [0.25, 7.75]) {
      // along x at z = t: the route crosses where x = t ± cut
      for (const [x0, x1] of [[-H, Math.max(-H, t - cut)], [Math.min(H, t + cut), H]] as const) if (x1 - x0 > 1) chain(b, "M", [x0, y, t], [x1, y, t], { up: [0, 1, 0] });
    }
    // along z at x = t
    for (const [z0, z1] of [[-H, Math.max(-H, t - cut)], [Math.min(H, t + cut), H]] as const) if (z1 - z0 > 1) chain(b, "M", [t, 7.25, z0], [t, 7.25, z1], { up: [0, 1, 0] });
  }
  for (const [x, z] of [[-H, -H], [H, -H], [H, H], [-H, H], [-H, 0], [H, 0], [0, -H], [0, H]] as const) for (const [ox, oz] of [[0, 0], [0.52, 0], [0, 0.52], [0.52, 0.52]] as const) chain(b, "M", [x - Math.sign(x) * ox, 0, z - Math.sign(z) * oz], [x - Math.sign(x) * ox, 8, z - Math.sign(z) * oz], { up: [0, 0, 1] });
  b.plan("base", "base", 1);
  for (const [cx, cz] of [[-22, 22], [22, -22]] as const) b.box([cx, 4, cz], [18, 4, 18]);
  b.footing([0, 0, 0]);
  // every edge of every prism exists from floor 1 up to the higher of the prisms sharing it
  const edgeKey = (a: V3, c: V3): string => [a, c].map((p) => `${p[0]},${p[2]}`).sort().join("|");
  const edgeTop = new Map<string, { a: V3; c: V3; last: number; out: V3 | null }>();
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const a = t.v[i]!;
      const c = t.v[(i + 1) % 3]!;
      const k = edgeKey(a, c);
      const e = edgeTop.get(k);
      // an exterior edge is one on the square's perimeter (not through O)
      const ext = !(a === O || c === O);
      if (!e) edgeTop.set(k, { a, c, last: t.last, out: ext ? outN(ux(a, c)) : null });
      else e.last = Math.max(e.last, t.last);
    }
  }
  b.set({ comp: "prisms" });
  // mullions every 4 m along each edge, double M perimeter floor beams; shared edges assigned once
  for (const [k, e] of edgeTop) {
    const l = Math.hypot(e.c[0] - e.a[0], e.c[2] - e.a[2]);
    const t = ux(e.a, e.c);
    for (let f = 1; f <= e.last; f++) {
      const y = fy(f);
      // a crown's last four floors slope: the face is cut by the sloping plane (handled per prism below)
      b.set({ stage: "columns", band: "prism mullions", course: f });
      for (let s = 0; s <= l + 1e-6; s += 4) {
        const p = add(e.a, scale(t, Math.min(s, l)));
        chain(b, "M", [p[0], y, p[2]], [p[0], y + 4, p[2]], { up: e.out ?? [0, 1, 0] });
      }
      b.set({ stage: "beams", band: "floor beams", course: f });
      for (const dy of [0.25, 0.75]) chain(b, "M", add(e.a, [0, y + dy, 0]), add(e.c, [0, y + dy, 0]), { up: [0, 1, 0] });
    }
    void k;
  }
  b.plan("columns", "prism mullions", 64);
  // glass and colliders: each exterior prism face
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const a = t.v[i]!;
      const c = t.v[(i + 1) % 3]!;
      if (a === O || c === O) continue;
      const top = fy(t.last - 4) + 4;
      const l = Math.hypot(c[0] - a[0], c[2] - a[2]);
      const tv = ux(a, c);
      const mid = lerp3(a, c, 0.5);
      const o = outN(tv);
      b.shell(add([mid[0], (8 + top) / 2, mid[2]], scale(o, -0.3)), [l / 2, (top - 8) / 2, 0.05], "glass", { yaw: Math.atan2(-tv[2], tv[0]) });
      b.box([mid[0], (8 + top) / 2, mid[2]], [l / 2 + 0.3, (top - 8) / 2, 0.6], Math.atan2(-tv[2], tv[0]));
    }
  }
  // inner (diagonal) faces become exterior above a prism's neighbour's top: shells there
  for (const t of tris) {
    for (const nb of tris) {
      if (nb === t || nb.last >= t.last) continue;
      // shared diagonal edge between t and nb (both contain O and a shared corner)
      const shared = t.v.filter((p) => p !== O && nb.v.includes(p));
      if (shared.length !== 1) continue;
      const corner = shared[0]!;
      const y0 = fy(nb.last) + 4;
      const y1 = fy(t.last - 4) + 4;
      if (y1 <= y0) continue;
      const mid = lerp3(corner, O, 0.5);
      const tv = ux(corner, O);
      const l = Math.hypot(corner[0], corner[2]);
      b.shell([mid[0], (y0 + y1) / 2, mid[2]], [l / 2, (y1 - y0) / 2, 0.05], "glass", { yaw: Math.atan2(-tv[2], tv[0]) });
      b.box([mid[0], (y0 + y1) / 2, mid[2]], [l / 2, (y1 - y0) / 2, 0.6], Math.atan2(-tv[2], tv[0]));
    }
  }
  // one large X brace module per eight floors on every active exterior face, 0.75 m+ in front of the facade:
  // main corner chords four B chains, each diagonal two parallel B chains, eight M node members at the crossing
  b.set({ comp: "bracing" });
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const a = t.v[i]!;
      const c = t.v[(i + 1) % 3]!;
      if (a === O || c === O) continue;
      const tv = ux(a, c);
      const o = outN(tv);
      const mods = Math.floor((t.last - 4) / 8);
      for (let m = 0; m < mods; m++) {
        b.set({ stage: "arches", band: "brace modules", course: m + 1 });
        const y0 = fy(1 + m * 8);
        const y1 = y0 + 32;
        const A0 = add(a, scale(o, 1.0));
        const C0 = add(c, scale(o, 1.0));
        // chords at both corners (four B chains), once per module height
        for (const P of [A0, C0]) for (const [d1, d2] of [[0, 0], [1.02, 0], [0, 1.02], [1.02, 1.02]] as const) {
          const q = add(add(P, scale(tv, P === A0 ? d1 : -d1)), scale(o, -d2));
          for (let y = y0; y < y1; y += 8) chain(b, "B", [q[0], y, q[2]], [q[0], y + 8, q[2]], { up: o });
        }
        // the two diagonals, each two parallel B chains
        for (const [p0, p1] of [[[A0[0], y0, A0[2]], [C0[0], y1, C0[2]]], [[C0[0], y0, C0[2]], [A0[0], y1, A0[2]]]] as [V3, V3][]) {
          for (const d of [0, 1.02]) chain(b, "B", add(p0, scale(o, d * 0.0 + 0.0 + (d ? 1.02 : 0))), add(p1, scale(o, d ? 1.02 : 0)), { up: o });
        }
        // crossing node: eight M members
        const xm = lerp3(A0, C0, 0.5);
        for (let k = 0; k < 8; k++) {
          const ang = (Math.PI * k) / 8;
          const dir = add(scale(tv, Math.cos(ang)), [0, Math.sin(ang), 0]);
          chain(b, "M", add([xm[0], (y0 + y1) / 2, xm[2]], scale(dir, -2)), add([xm[0], (y0 + y1) / 2, xm[2]], scale(dir, 2)), { up: o });
        }
      }
    }
  }
  b.plan("arches", "brace modules", 7);
  // sloping terminal crowns: over each part's last four floors the outer frame retreats toward a sloping plane;
  // D infill strips aligned with the cut, the highest point at the prism's apex corner (O side)
  b.set({ comp: "crowns" });
  for (const t of tris) {
    const yA = fy(t.last - 3);
    const yB = fy(t.last) + 4;
    const [p, q] = [t.v[0]!, t.v[1]!];
    // the crown slopes from the exterior edge (low, yA) up to the centre O (high, yB)
    b.set({ stage: "roof", band: "sloping crowns", course: t.last });
    const n = 12;
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      const e = lerp3(p, q, f);
      chain(b, "M", [e[0], yA, e[2]], [O[0], yB, O[2]], { mode: "overhang" });
      b.with({ tier: 2 }, () => {
        if (k < n) {
          for (let s = 0.2; s < 1; s += 0.2) {
            const a2 = lerp3([e[0], yA, e[2]], [0, yB, 0], s);
            const e2 = lerp3(p, q, (k + 1) / n);
            const b2 = lerp3([e2[0], yA, e2[2]], [0, yB, 0], s);
            chain(b, "D", a2, b2, { mode: "overhang" });
          }
        }
      });
    }
    // the crown surface shells and a collider (a sloping roof: stepped boxes)
    for (let s = 0; s < 4; s++) {
      const f0 = s / 4;
      const f1 = (s + 1) / 4;
      const m0 = lerp3(lerp3(p, q, 0.5), O, (f0 + f1) / 2);
      const w = Math.hypot(q[0] - p[0], q[2] - p[2]) * (1 - (f0 + f1) / 2);
      const tv = ux(p, q);
      b.box([m0[0], yA + (yB - yA) * f1 - 1, m0[2]], [w / 2, 1, (Math.hypot(p[0], p[2]) * 0.7071 * (f1 - f0)) / 1], Math.atan2(-tv[2], tv[0]));
    }
  }
  b.plan("roof", "sloping crowns", 1);
  // the highest crown 264–280: the final (E) prism extends 16 m through four 4 m bands: three double-B edge chains and an M triangle per band
  const E = tris[3]!;
  b.set({ comp: "top crown", stage: "roof", band: "top crown" });
  for (let k = 0; k < 4; k++) {
    b.set({ course: k });
    const y = 264 + k * 4;
    const f = 1 - (k + 1) / 5;
    const vv = E.v.map((v) => lerp3(O, v, f + 0.2)) as V3[];
    for (const v of vv) for (const d of [0, 1.02]) chain(b, "B", [v[0] + d * 0.5, y, v[2]], [v[0] + d * 0.5, y + 4, v[2]], { mode: "lap", within: [264, 280], up: [0, 0, 1] });
    for (let i = 0; i < 3; i++) chain(b, "M", add(vv[i]!, [0, y + 0.25, 0]), add(vv[(i + 1) % 3]!, [0, y + 0.25, 0]), { up: [0, 1, 0] });
  }
  b.plan("roof", "top crown", 4);
  // twin spires 280–304: two 24 m bundles of four B chains and six D tie rings, placed on the E crown's outer corners
  b.set({ stage: "roof", band: "twin spires", course: 0 });
  for (const corner of [E.v[0]!, E.v[1]!]) {
    const c = lerp3(O, corner, 0.36);
    for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]] as const) {
      chain(b, "B", [c[0] + ox, 280, c[2] + oz], [c[0] + ox * 0.6, 288, c[2] + oz * 0.6], { mode: "overhang" });
      chain(b, "B", [c[0] + ox * 0.6, 288, c[2] + oz * 0.6], [c[0] + ox * 0.35, 296, c[2] + oz * 0.35], { mode: "overhang" });
      chain(b, "B", [c[0] + ox * 0.35, 296, c[2] + oz * 0.35], [c[0] + ox * 0.15, 304 - 0.1, c[2] + oz * 0.15], { mode: "overhang" });
    }
    for (let k = 1; k <= 6; k++) ring(b, "D", c[0], 280 + k * 3.4, c[2], 0.9 - k * 0.1, 4, 1, { phase: Math.PI / 4 });
    b.cyl([c[0], 292, c[2]], 1, 12);
  }
  b.plan("roof", "twin spires", 1);
  // landing platforms on each crown's high edge (four unequal platforms)
  for (const t of tris) {
    const yB = fy(t.last) + 4;
    const c = lerp3(O, lerp3(t.v[0]!, t.v[1]!, 0.5), 0.12);
    b.set({ stage: "beams", band: "crown platforms", course: 0 });
    b.with({ tier: 2 }, () => deck(b, "M", c[0], yB + 0.5, c[2], 8, 8, "x"));
    b.box([c[0], yB, c[2]], [4, 0.5, 4]);
  }
  b.set({ comp: "main" });
  b.feature("four triangular prisms ending at 40/48/56/64 floors", [-22, 170, 0]);
  b.feature("eight-floor X brace modules standing 1 m proud of the facade", [0, 60, -45]);
  b.feature("sloping prism crowns and twin spires", [20, 290, 0]);
  b.entry("diagonal", [-60, 0, 60], [60, 0, -60], 12, 7, true, "walk the 12 m diagonal route through the base");
  b.entry("platforms", [-20, 175, 0], [10, 285, -10], 8, 8, false, "rise from platform to platform up the crowns (flight)");
  b.viewAt("ground", "ground", [-10, 1.65, -56], [0, 120, -44], "beneath the intersecting braces");
  b.viewAt("interior", "interior", [-4, 1.65, 4], [30, 10, -30], "on the diagonal route under the base");
  b.viewAt("high", "high", [-180, 340, -180], [0, 200, 0], "the prism stack from above");
  b.viewAt("detail", "detail", [-20, 60, -56], [-10, 70, -45], "a brace node 1 m in front of the facade");
  b.safe("plaza", [-50, 0, 50], -Math.PI / 4);
  for (const t of tris) {
    const yB = fy(t.last) + 4;
    const c = lerp3(O, lerp3(t.v[0]!, t.v[1]!, 0.5), 0.12);
    b.safe(`platform-${t.name}`, [c[0], yB + 0.5, c[2]], 0);
  }
}

// ================================================================= L20

/**
 * L20 Three-Wing Skyline Peak, 144 × 132 × 340. A hexagonal core with three
 * wings at 120°, 72 floors with a wing setback every six floors (A → B → C),
 * six crown bands shrinking to the core, and a five-band spire.
 */
export function L20(b: Builder): void {
  // wing directions: A toward −z, B and C at ±120°; the envelope is set by the wing noses
  const dirs = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3];
  const wingDir = (k: number): V3 => [Math.cos(dirs[k]!), 0, Math.sin(dirs[k]!)];
  const W = 24;
  /** Wing length from the core centre to the nose tip at floor 0. */
  const WING0 = 81;
  const lenAt = (k: number, f: number): number => {
    // wing k shortens by 8 at its setback events: events at floors 6, 12, …, 72 cycle A, B, C
    let L = WING0;
    for (let e = 1; e * 6 <= f; e++) if ((e - 1) % 3 === k) L -= 8;
    return L;
  };
  const fy = (f: number): number => 8 + (f - 1) * 4;
  const coreR = 16;
  const core = ngon(6, coreR, 0, 0, 0, Math.PI / 6);
  // the wing plan for length L: from the core along dir, width 24, a 12-segment rounded nose at the end
  const wingOutline = (k: number, L: number): V3[] => {
    const d = wingDir(k);
    const s: V3 = [-d[2], 0, d[0]];
    const pts: V3[] = [];
    const base = scale(d, coreR * 0.7);
    const tip = scale(d, L);
    pts.push(add(base, scale(s, -W / 2)));
    pts.push(add(add(tip, scale(d, -W / 2)), scale(s, -W / 2)));
    for (let i = 1; i < 12; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 12;
      pts.push(add(add(tip, scale(d, -W / 2)), add(scale(d, (W / 2) * Math.cos(a)), scale(s, (W / 2) * Math.sin(a)))));
    }
    pts.push(add(add(tip, scale(d, -W / 2)), scale(s, W / 2)));
    pts.push(add(base, scale(s, W / 2)));
    return pts;
  };
  b.revise({ item: "L20 nose curtain wall", original: "each wing: double-M mullions every 4 m along both sides, a 12-segment nose and M floor-edge ring", revised: "the double-M mullions also stand at the nose's eleven interior segment points (0.3 m outside the outline, as on the sides), and the nose carries glass strips tangent to each segment", reason: "with mullions only on the straight sides, the three rounded noses showed the dark wing interior as bare 300 m slabs (inspector review, 2026-11-04)", impact: "the curtain wall reads continuously round each wing; more M pieces (BOM); envelope unchanged" });
  b.revise({ item: "L20 wing interior", original: "rear shading shells behind the curtain wall (§7.2: allowed)", revised: "the wing-prism and core infill shells use the plank finish (lit timber tone) instead of the near-black shade finish", reason: "about 54,000 m² of shade behind 38 %-opaque glass made the whole tower read as a black slab from every review camera, hiding the setbacks and terraces (inspector review, 2026-11-04); L18/L19 show timber behind their glass", impact: "appearance only; no piece, collider or envelope change" });
  b.revise({ item: "L20 wing length", original: "wings initially about 56 m long and 24 m wide at 120°, envelope 144 × 132; each wing retreats four times 56 → 48 → 40 → 32 → 24", revised: "wings 81 m from the core centre to the nose tip (65 m beyond the 16 m core), retreating 8 m at each of its four setbacks: 81 → 73 → 65 → 57 → 49", reason: "with 56 m wings the Y plan's bounding box is only 100 × 90; 81 m wings meet 144 × 132 (solved numerically from the outline); the 8 m step per setback is kept", impact: "the final wing stubs are longer than 24 m, so the crown's wing fins carry the sequence's end" });
  b.set({ comp: "base", stage: "base", band: "base", course: 0 });
  for (let k = 0; k < 3; k++) {
    const pts = wingOutline(k, WING0);
    for (let i = 0; i + 1 < pts.length; i++) for (const y of [0.25, 2.25, 4.25, 6.25, 7.75]) chain(b, "M", add(pts[i]!, [0, y, 0]), add(pts[i + 1]!, [0, y, 0]), { up: [0, 1, 0] });
    const d = wingDir(k);
    b.box(scale(d, (WING0 + coreR * 0.7) / 2), [(WING0 - coreR * 0.7) / 2, 4, W / 2], Math.atan2(-d[2], d[0]));
  }
  for (let i = 0; i < 6; i++) for (const y of [0.25, 7.75]) chain(b, "M", add(core[i]!, [0, y, 0]), add(core[(i + 1) % 6]!, [0, y, 0]), { up: [0, 1, 0] });
  b.cyl([0, 4, 0], coreR, 4);
  b.plan("base", "base", 1);
  b.footing([0, 0, 0]);
  // floors 1–72: core corners four M vertical chains with double M hexagonal top beams; each wing: double M mullions
  // every 4 m along both sides, a 12-segment nose, an M floor-edge ring, two radial M beam chains per floor
  b.set({ comp: "tower" });
  for (let f = 1; f <= 72; f++) {
    const y = fy(f);
    b.set({ stage: "columns", band: "core", course: f });
    for (const v of core) for (const [o1, o2] of [[0, 0], [0.52, 0], [0, 0.52], [0.52, 0.52]] as const) chain(b, "M", [v[0] * (1 - o1 / coreR), y, v[2] * (1 - o2 / coreR)], [v[0] * (1 - o1 / coreR), y + 4, v[2] * (1 - o2 / coreR)], { up: [0, 0, 1] });
    for (let i = 0; i < 6; i++) for (const dy of [3.25, 3.75]) chain(b, "M", add(core[i]!, [0, y + dy, 0]), add(core[(i + 1) % 6]!, [0, y + dy, 0]), { up: [0, 1, 0] });
    for (let k = 0; k < 3; k++) {
      const L = lenAt(k, f - 1);
      const pts = wingOutline(k, L);
      const d = wingDir(k);
      const s: V3 = [-d[2], 0, d[0]];
      b.set({ stage: "columns", band: "wing mullions", course: f });
      // side mullions every 4 m (double M)
      for (const sgn of [-1, 1]) {
        for (let t = coreR * 0.7; t <= L - W / 2 + 1e-6; t += 4) {
          const p = add(scale(d, t), scale(s, (sgn * W) / 2 + sgn * 0.3));
          for (const o of [0, 0.52]) chain(b, "M", [p[0] + s[0] * sgn * o, y, p[2] + s[2] * sgn * o], [p[0] + s[0] * sgn * o, y + 4, p[2] + s[2] * sgn * o], { up: s });
        }
      }
      // nose mullions: the curtain wall continues round the 12-segment nose (double M at each interior nose point,
      // 0.3 m outside the outline like the side mullions) — see the "L20 nose curtain wall" revision
      const tipC = add(scale(d, L - W / 2), [0, 0, 0]);
      for (let i = 2; i <= 12; i++) {
        const p = pts[i]!;
        const out = norm(sub([p[0], 0, p[2]], [tipC[0], 0, tipC[2]]));
        for (const o of [0.3, 0.82]) chain(b, "M", [p[0] + out[0] * o, y, p[2] + out[2] * o], [p[0] + out[0] * o, y + 4, p[2] + out[2] * o], { up: out });
      }
      // nose: 12 segments, and the M floor-edge ring around the whole wing outline
      b.set({ stage: "beams", band: "wing edges", course: f });
      for (let i = 0; i + 1 < pts.length; i++) chain(b, "M", add(pts[i]!, [0, y + 0.25, 0]), add(pts[i + 1]!, [0, y + 0.25, 0]), { up: [0, 1, 0], mode: "overhang" });
      // two radial M beam chains per wing per floor
      for (const sgn of [-0.25, 0.25]) chain(b, "M", add(scale(d, coreR * 0.7), add(scale(s, sgn * W), [0, y + 0.75, 0])), add(scale(d, L - 1), add(scale(s, sgn * W), [0, y + 0.75, 0])), { up: [0, 1, 0] });
    }
  }
  b.plan("columns", "core", 72);
  b.plan("columns", "wing mullions", 72);
  // wing glass and colliders per setback span: each wing between its setbacks is one prism
  for (let k = 0; k < 3; k++) {
    const d = wingDir(k);
    const s: V3 = [-d[2], 0, d[0]];
    const yawW = Math.atan2(-s[2], s[0]);
    let f0 = 1;
    for (let f = 1; f <= 73; f++) {
      const changes = f === 73 || lenAt(k, f - 1) !== lenAt(k, f0 - 1);
      if (!changes) continue;
      const L = lenAt(k, f0 - 1);
      const y0 = fy(f0);
      const y1 = fy(f - 1) + 4;
      const midL = (coreR * 0.7 + L) / 2;
      for (const sgn of [-1, 1]) {
        const c = add(scale(d, midL - W / 4), scale(s, (sgn * W) / 2));
        b.shell([c[0], (y0 + y1) / 2, c[2]], [(L - coreR * 0.7 - W / 2) / 2, (y1 - y0) / 2, 0.05], "glass", { yaw: Math.atan2(-d[2], d[0]) });
        void yawW;
      }
      // nose glass: one thin glass strip per nose segment, tangent to the arc
      const tip = scale(d, L - W / 2);
      for (let i = 0; i < 12; i++) {
        const a0 = -Math.PI / 2 + (Math.PI * i) / 12;
        const a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / 12;
        const p0 = add(tip, add(scale(d, (W / 2) * Math.cos(a0)), scale(s, (W / 2) * Math.sin(a0))));
        const p1 = add(tip, add(scale(d, (W / 2) * Math.cos(a1)), scale(s, (W / 2) * Math.sin(a1))));
        const m = scale(add(p0, p1), 0.5);
        const seg = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
        b.shell([m[0], (y0 + y1) / 2, m[2]], [seg / 2 + 0.05, (y1 - y0) / 2, 0.05], "glass", { yaw: Math.atan2(-(p1[2] - p0[2]), p1[0] - p0[0]) });
      }
      const cc = scale(d, midL);
      b.box([cc[0], (y0 + y1) / 2, cc[2]], [(L - coreR * 0.7) / 2, (y1 - y0) / 2, W / 2], Math.atan2(-d[2], d[0]));
      // the wing interior behind the glass: plank (lit timber tone), not shade — see "L20 wing interior" revision
      b.shell([cc[0], (y0 + y1) / 2, cc[2]], [(L - coreR * 0.7) / 2 - 1.5, (y1 - y0) / 2, W / 2 - 1.5], "plank", { yaw: Math.atan2(-d[2], d[0]) });
      f0 = f;
    }
  }
  b.cyl([0, fy(36) + 2, 0], coreR, 146);
  b.shellCyl([0, fy(36) + 2, 0], coreR - 1.2, 146, "plank");
  // setback roofs: at each of 12 wing-end roofs G(actualWidth, 8, 1, 1) decking, D rails and two M bracket groups
  b.set({ comp: "terraces" });
  for (let e = 1; e <= 12; e++) {
    const k = (e - 1) % 3;
    const f = e * 6;
    const Lnew = lenAt(k, f);
    const d = wingDir(k);
    const s: V3 = [-d[2], 0, d[0]];
    const y = fy(f) + 4;
    // the exposed roof is the strip between the new nose tip (Lnew) and the old one (Lnew + 8); the deck sits on
    // the lower span's top there, narrowed to stay inside the old rounded nose
    const c = scale(d, Lnew + 3.6);
    b.set({ stage: "beams", band: "setback terraces", course: e });
    // the old nose's half-width at Lnew + 4 (inside its 12 m rounding): √(12² − 8²) ≈ 8.9 → a 16 m-wide deck
    const half = Math.sqrt(Math.max(0, (W / 2) ** 2 - (Lnew + 7.2 - (Lnew + 8 - W / 2)) ** 2));
    const deckW = Math.max(8, 2 * Math.min(W / 2, half) - 1);
    b.at([c[0], 0, c[2]], Math.atan2(-d[2], d[0]), () => {
      b.with({ tier: 2 }, () => floorGrid(b, "D", 0, y + 0.25, 0, 7.2, deckW, 1));
      deck(b, "M", 0, y + 0.5, 0, 7.2, deckW, "z");
      b.box([0, y - 1.5, 0], [3.6, 2, deckW / 2]);
    });
    b.set({ stage: "details", band: "terrace rails", course: e });
    const p0 = add(scale(d, Lnew), scale(s, -deckW / 2 + 0.2));
    const p1 = add(scale(d, Lnew + 7.2), scale(s, -deckW / 2 + 0.2));
    const p2 = add(scale(d, Lnew + 7.2), scale(s, deckW / 2 - 0.2));
    const p3 = add(scale(d, Lnew), scale(s, deckW / 2 - 0.2));
    rails(b, [p0, p1, p2, p3], y + 0.5);
    for (const sgn of [-1, 1]) {
      const p = add(scale(d, Lnew + 3.6), scale(s, (sgn * deckW) / 3));
      b.set({ stage: "beams", band: "setback terraces" });
      for (const o of [-0.5, 0.5]) chain(b, "M", add(p, [s[0] * o, y - 4, s[2] * o]), add(add(p, scale(d, 3.5)), [s[0] * o, y - 0.3, s[2] * o]));
    }
    b.safe(`terrace-${e}`, [c[0], y + 0.5, c[2]], Math.atan2(d[0], d[2]));
  }
  b.plan("beams", "setback terraces", 12);
  // crown 296–320: six bands, wings disappear in sequence, core radius 16/13/10/7/4/2; per band six double-M sloping
  // edges, six D ring segments and six secondary ribs
  b.set({ comp: "crown", stage: "roof", band: "crown" });
  const rs = [16, 13, 10, 7, 4, 2, 1.2];
  for (let k = 0; k < 6; k++) {
    b.set({ course: k });
    const y0 = 296 + 4 * k;
    const h0 = ngon(6, rs[k]!, y0, 0, 0, Math.PI / 6);
    const h1 = ngon(6, rs[k + 1]!, y0 + 4, 0, 0, Math.PI / 6);
    for (let i = 0; i < 6; i++) {
      for (const o of [0, 0.52]) chain(b, "M", add(h0[i]!, [0, 0, o * 0]), add(h1[i]!, [0, 0, 0]).map((v, j) => (j === 0 ? v + o * Math.sign(h1[i]![0] || 1) * 0.0 : v)) as V3, { mode: "overhang" });
      chain(b, "D", h0[i]!, h0[(i + 1) % 6]!, { mode: "overhang", up: [0, 1, 0] });
      const m0 = lerp3(h0[i]!, h0[(i + 1) % 6]!, 0.5);
      const m1 = lerp3(h1[i]!, h1[(i + 1) % 6]!, 0.5);
      chain(b, "D", m0, m1, { mode: "overhang" });
    }
    // wings vanish in sequence within the first three bands: short fins on the remaining wings
    for (let w = k; w < 3; w++) {
      const d = wingDir(w);
      chain(b, "M", add(scale(d, rs[k]!), [0, y0, 0]), add(scale(d, rs[k]! + 6 - 2 * k), [0, y0 + 4, 0]), { up: [0, 1, 0] });
    }
    b.cyl([0, y0 + 2, 0], (rs[k]! + rs[k + 1]!) / 2, 2);
  }
  b.plan("roof", "crown", 6);
  // the broad viewing platform below the crown at 296 (top of floor 72)
  b.set({ stage: "beams", band: "viewing platform", course: 0 });
  // the broad platform is the roof of the core and the wing stubs at floor 72, around the crown's base
  b.with({ tier: 2 }, () => deck(b, "M", 0, 296.5, 0, 36, 36, "x", [{ x0: -15, x1: 15, z0: -15, z1: 15 }]));
  b.box([0, 296, 0], [18, 0.5, 18]);
  b.plan("beams", "viewing platform", 1);
  // spire 320–340: five 4 m bands, six M/B bundle chains around the centre, decreasing ring radius; final band finished
  b.set({ comp: "spire", stage: "roof", band: "spire" });
  for (let k = 0; k < 5; k++) {
    b.set({ course: k });
    const y0 = 320 + 4 * k;
    const r0 = 1.2 - 0.2 * k;
    const r1 = Math.max(0.15, 1.2 - 0.2 * (k + 1));
    const ra = ngon(6, r0, y0, 0, 0, 0);
    const rb = ngon(6, r1, y0 + 4, 0, 0, 0);
    for (let i = 0; i < 6; i++) chain(b, k < 2 && i % 2 === 0 ? "B" : "M", ra[i]!, k === 4 ? [0, 340 - 0.1, 0] : rb[i]!, { mode: "overhang" });
    if (k < 4) for (const t of [0.3, 0.75]) ring(b, "D", 0, y0 + 4 * t, 0, r0 + (r1 - r0) * t + 0.2, 6, 1);
  }
  b.plan("roof", "spire", 5);
  b.cyl([0, 330, 0], 1.2, 10);
  b.set({ comp: "main" });
  b.feature("three wings around a hexagonal core", [0, 40, -50]);
  b.feature("twelve setback terraces rotating A → B → C", [0, 150, -40]);
  b.feature("crown bands shrinking to the core and a spire", [0, 320, 0]);
  b.entry("plaza", [0, 0, -(WING0 + 30)], [0, 0, -(WING0 + 2)], 12, 8, true, "across the plaza to the entrance at wing A's nose");
  // the terrace spiral: each hop rises from one wing's terrace, out around the gap between wings, to the next
  for (let e = 1; e < 12; e++) {
    const ka = (e - 1) % 3;
    const kb = e % 3;
    const da = wingDir(ka);
    const db = wingDir(kb);
    const ya = fy(e * 6) + 4.5;
    const yb = fy((e + 1) * 6) + 4.5;
    const pa = scale(da, lenAt(ka, e * 6) + 3.6);
    const pb = scale(db, lenAt(kb, (e + 1) * 6) + 3.6);
    // fly out from the terrace, over the gap between wings (the bisector, beyond the noses), and in to the next
    const mid = scale(norm(add(da, db)), WING0 + 10);
    b.entry(`spiral-${e}a`, [pa[0], ya + 1, pa[2]], [mid[0], (ya + yb) / 2 + 1, mid[2]], 8, 8, false, `terrace ${e} → around the gap between wings`);
    b.entry(`spiral-${e}b`, [mid[0], (ya + yb) / 2 + 1, mid[2]], [pb[0], yb + 1, pb[2]], 8, 8, false, `→ terrace ${e + 1}`);
  }
  b.viewAt("ground", "ground", [10, 1.65, -88], [0, 160, 0], "at wing A's nose looking up the peak");
  b.viewAt("interior", "interior", [6, 296.5 + 1.65, -17], [0, 200, -400], "the broad platform below the crown, looking back along the valley");
  b.viewAt("high", "high", [-160, 370, -160], [0, 250, 0], "circling the crown");
  // on wing A's first terrace (floor 6: the wing retreats from 81 to 73 m, so the terrace is z −73 … −81), looking
  // up the wing's stepped face (z −60 at floor 18 was inside the wing)
  b.viewAt("detail", "detail", [0, fy(6) + 4 + 1.65, -77], [0, fy(30), -40], "on a setback terrace");
  b.safe("plaza", [0, 0, -(WING0 + 14)], 0);
  b.safe("platform", [0, 296.5, -17], Math.PI);
}

export const _re = { cone, sec };
