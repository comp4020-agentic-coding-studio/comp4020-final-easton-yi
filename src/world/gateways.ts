// The three entrance gateways in weathered stone (courtyard/day-night directive
// §3, 2026-11-06), replacing the timber frames. Pure layout: each gateway is a
// list of dressed stone blocks in its portal's local frame (x across the
// opening, y up from the portal's base, z through it; local −z faces the
// spawn), the clear opening's outline and the collision boxes that follow the
// visible stone. The renderer builds the stones from these blocks
// (environment.ts createPortal), the label layout is measured against them
// (world-portal-labels.test.ts) and the tests check stability and clearance.
//
//   explore   a high pointed arch: tapering piers, an impost course and a
//             two-centred voussoir ring closed by a keystone
//   works     a substantial lintel: two coursed piers on a base course, a
//             monolithic lintel and a capping course
//   together  a paired-support corbelled gate: two coursed supports whose
//             upper courses step inward over the ones below until a capstone
//             spans them (a stable stone answer to the old leaning frame)
//
// Same positions, orientation, approximate outer size and clear passage as
// the timber frames: the opening is 5.3 m wide (the timber posts' colliders
// left ±2.6 m) and 9.4–10.4 m high at its centre.
import { rng } from "./core.ts";

export type GatewayId = "explore" | "works" | "together";

/** A stone in the gateway's local frame. `quad`: its four corners in the x–y plane (counter-clockwise), extruded ±hz. */
export interface Stone {
  quad: [number, number][];
  /** Half depth through the gateway (z) and the depth's centre. */
  hz: number;
  cz: number;
  /** Structural (bears load, collides) or a fill stone (small, at the foot, decorative). */
  kind: "block" | "fill";
  seed: number;
}

/** A collision box in the gateway's local frame (axis-aligned there; the portal's yaw turns it into the world). */
export interface LocalBox {
  c: [number, number, number];
  h: [number, number, number];
}

export interface GatewayPlan {
  id: GatewayId;
  stones: Stone[];
  /** Small rock-family stones at the feet: local centre, size and variant (rockGeometries 0–7). */
  fill: { c: [number, number, number]; s: [number, number, number]; yaw: number; variant: number }[];
  /** The clear opening (counter-clockwise polygon in x–y), inset a little from the stone: the membrane's shape. */
  opening: [number, number][];
  colliders: LocalBox[];
  /** Overall outer half-width and height (for reports and tests). */
  outer: { half: number; height: number };
}

/** Half the clear opening's width, kept from the timber frames' colliders. */
export const OPEN_HALF = 2.65;

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/**
 * A pier of courses from y0 to y1, its inner face at `inner` (distance from the centre line, x > 0 on the right),
 * outer face tapering from outer0 at y0 to outer1 at y1. Alternate courses are split into two stones at a varying
 * point so the vertical joints stagger; mirrored for the left pier (side −1).
 */
function pier(stones: Stone[], side: 1 | -1, inner: number, outer0: number, outer1: number, courses: readonly number[], hz: number, seed: number): void {
  const r = rng(seed);
  let y = courses[0]!;
  const y1 = courses[courses.length - 1]!;
  for (let i = 1; i < courses.length; i++) {
    const ya = y;
    const yb = courses[i]!;
    const oa = outer0 + ((outer1 - outer0) * (ya - courses[0]!)) / (y1 - courses[0]!);
    const ob = outer0 + ((outer1 - outer0) * (yb - courses[0]!)) / (y1 - courses[0]!);
    const split = i % 2 === 0 && oa - inner > 1.1;
    const sx = (x: number): number => side * x;
    const quadOf = (xa0: number, xa1: number, xb0: number, xb1: number): [number, number][] => {
      // corners: bottom inner, bottom outer, top outer, top inner (counter-clockwise seen from −z for side +1)
      const q: [number, number][] = [
        [sx(xa0), ya],
        [sx(xa1), ya],
        [sx(xb1), yb],
        [sx(xb0), yb],
      ];
      return side > 0 ? q : [q[1]!, q[0]!, q[3]!, q[2]!];
    };
    if (split) {
      const t = 0.38 + r() * 0.24;
      const ma = inner + (oa - inner) * t;
      const mb = inner + (ob - inner) * t;
      stones.push({ quad: quadOf(inner, ma, inner, mb), hz, cz: 0, kind: "block", seed: seed * 31 + i * 2 });
      stones.push({ quad: quadOf(ma, oa, mb, ob), hz, cz: 0, kind: "block", seed: seed * 31 + i * 2 + 1 });
    } else {
      // a through-stone; every third course sits a little proud in depth (bond stones)
      stones.push({ quad: quadOf(inner, oa, inner, ob), hz: hz + (i % 3 === 1 ? 0.04 : 0), cz: 0, kind: "block", seed: seed * 31 + i * 2 });
    }
    y = yb;
  }
}

/** Fill stones around a pier's foot (front and back, outer side), partly sunk. */
function feet(plan: GatewayPlan, side: 1 | -1, inner: number, outer: number, hz: number, seed: number): void {
  const r = rng(seed);
  const spots: [number, number][] = [
    [outer + 0.25, -hz - 0.1],
    [outer + 0.3, hz + 0.05],
    [(inner + outer) / 2 + 0.2, -hz - 0.35],
    [outer - 0.2, hz + 0.4],
  ];
  for (const [x, z] of spots) {
    const s = 0.28 + r() * 0.22;
    plan.fill.push({ c: [side * x, -0.06, z + (r() - 0.5) * 0.15], s: [s * (1.1 + r() * 0.4), s * (0.55 + r() * 0.25), s * (0.9 + r() * 0.3)], yaw: r() * Math.PI * 2, variant: Math.floor(r() * 8) });
  }
}

function explore(): GatewayPlan {
  const plan: GatewayPlan = { id: "explore", stones: [], fill: [], opening: [], colliders: [], outer: { half: 0, height: 0 } };
  const hz = 0.75;
  const spring = 6.4;
  // base course (wider, sunk below grade), then courses up to the impost
  for (const side of [1, -1] as const) {
    plan.stones.push({ quad: side > 0 ? rect(OPEN_HALF - 0.08, -0.35, 4.15, 0.55) : rect(-4.15, -0.35, -OPEN_HALF + 0.08, 0.55), hz: hz + 0.16, cz: 0, kind: "block", seed: side > 0 ? 11 : 12 });
    pier(plan.stones, side, OPEN_HALF, 3.95, 3.78, [0.55, 1.6, 2.5, 3.55, 4.45, 5.45, 6.0], hz, side > 0 ? 13 : 14);
    // the impost: a course that projects a little on the outside, where the arch springs
    plan.stones.push({ quad: side > 0 ? rect(OPEN_HALF - 0.05, 6.0, 3.92, spring) : rect(-3.92, 6.0, -OPEN_HALF + 0.05, spring), hz: hz + 0.08, cz: 0, kind: "block", seed: side > 0 ? 15 : 16 });
    feet(plan, side, OPEN_HALF, 4.15, hz + 0.16, side > 0 ? 17 : 18);
  }
  // the voussoir ring: a two-centred pointed arch, intrados half-span OPEN_HALF, rise 4.0, ring 1.15 thick
  const rise = 4.0;
  const e = (rise * rise - OPEN_HALF * OPEN_HALF) / (2 * OPEN_HALF);
  const R = OPEN_HALF + e;
  const t = 1.15;
  const thApex = Math.acos(e / R);
  const n = 6;
  const keyHalf = 0.11; // the keystone takes this much angle from each side's last voussoir
  for (const side of [1, -1] as const) {
    const cx = -side * e;
    const P = (rad: number, th: number): [number, number] => [cx + side * rad * Math.cos(th), spring + rad * Math.sin(th)];
    for (let i = 0; i < n; i++) {
      const th0 = (i / n) * (thApex - keyHalf);
      const th1 = ((i + 1) / n) * (thApex - keyHalf);
      const q: [number, number][] = [P(R, th0), P(R + t, th0), P(R + t, th1), P(R, th1)];
      plan.stones.push({ quad: side > 0 ? q : [q[1]!, q[0]!, q[3]!, q[2]!], hz: hz - 0.04, cz: 0, kind: "block", seed: 40 + (side > 0 ? 0 : 20) + i });
    }
  }
  // the keystone: spans the apex, a little taller than the ring
  {
    const th = thApex - keyHalf;
    const a: [number, number] = [-e + R * Math.cos(th), spring + R * Math.sin(th)];
    const b: [number, number] = [-e + (R + t + 0.12) * Math.cos(th), spring + (R + t + 0.12) * Math.sin(th)];
    plan.stones.push({ quad: [[-a[0], a[1]], [a[0], a[1]], [b[0], b[1]], [-b[0], b[1]]], hz: hz + 0.04, cz: 0, kind: "block", seed: 70 });
  }
  // the opening: up the piers to the springing, around the intrados to the keystone's bed
  const inset = 0.04;
  const thTop = thApex - keyHalf;
  const op: [number, number][] = [[-(OPEN_HALF - inset), 0.02], [OPEN_HALF - inset, 0.02]];
  for (let i = 0; i <= 16; i++) {
    const th = (i / 16) * thTop;
    op.push([-e + (R - inset) * Math.cos(th), spring + (R - inset) * Math.sin(th) - (i === 16 ? inset : 0)]);
  }
  for (let i = 16; i >= 0; i--) {
    const th = (i / 16) * thTop;
    op.push([e - (R - inset) * Math.cos(th), spring + (R - inset) * Math.sin(th) - (i === 16 ? inset : 0)]);
  }
  plan.opening = dedupe(op);
  // colliders: the piers to the impost, then the arch in 0.8 m bands (each band's box starts at the intrados at its
  // lower edge: never inside the opening the stone leaves at that height)
  for (const side of [1, -1] as const) {
    plan.colliders.push(boxX(side, OPEN_HALF, 4.05, 0, spring, hz + 0.1));
    for (let y = spring; y < spring + rise + t * 0.85; y += 0.8) {
      const yt = Math.min(y + 0.8, spring + rise + t);
      const xi = intradosX(e, R, spring, y);
      const xo = Math.max(xi + 0.6, extradosX(e, R + t, spring, y));
      if (xi <= 0.25) {
        plan.colliders.push({ c: [0, (y + yt) / 2, 0], h: [Math.max(0.6, xo), (yt - y) / 2 + 0.05, hz] });
        break;
      }
      plan.colliders.push(boxX(side, xi, xo, y, yt, hz));
    }
  }
  plan.outer = { half: 4.15, height: spring + Math.sqrt((R + t + 0.12) ** 2 - e * e) };
  return plan;
}

/** x of the pointed arch's intrados (right half) at height y; 0 above the apex. */
function intradosX(e: number, R: number, spring: number, y: number): number {
  const dy = y - spring;
  if (dy <= 0) return OPEN_HALF;
  if (dy >= R) return 0;
  return Math.max(0, -e + Math.sqrt(R * R - dy * dy));
}
function extradosX(e: number, Ro: number, spring: number, y: number): number {
  const dy = Math.max(0, y - spring);
  if (dy >= Ro) return 0;
  return Math.max(0, -e + Math.sqrt(Ro * Ro - dy * dy));
}
/** A box across x from |xa| to |xb| on one side, y from y0 to y1, ±hz deep. */
function boxX(side: 1 | -1, xa: number, xb: number, y0: number, y1: number, hz: number): LocalBox {
  const hx = Math.max(0.3, (xb - xa) / 2);
  return { c: [side * (xa + hx), (y0 + y1) / 2, 0], h: [hx, (y1 - y0) / 2, hz] };
}

function works(): GatewayPlan {
  const plan: GatewayPlan = { id: "works", stones: [], fill: [], opening: [], colliders: [], outer: { half: 0, height: 0 } };
  const hz = 0.8;
  const top = 9.4;
  for (const side of [1, -1] as const) {
    plan.stones.push({ quad: side > 0 ? rect(OPEN_HALF - 0.1, -0.35, 4.8, 0.6) : rect(-4.8, -0.35, -OPEN_HALF + 0.1, 0.6), hz: hz + 0.16, cz: 0, kind: "block", seed: side > 0 ? 81 : 82 });
    pier(plan.stones, side, OPEN_HALF, 4.55, 4.35, [0.6, 1.75, 2.75, 3.95, 5.0, 6.15, 7.2, 8.35, top], hz, side > 0 ? 83 : 84);
    feet(plan, side, OPEN_HALF, 4.8, hz + 0.16, side > 0 ? 85 : 86);
  }
  // the lintel: one stone across, its ends bearing on the piers
  plan.stones.push({ quad: rect(-5.0, top, 5.0, top + 1.25), hz: hz + 0.06, cz: 0, kind: "block", seed: 87 });
  // a capping course: two stones, the joint off the centre line, set back a little
  plan.stones.push({ quad: rect(-4.55, top + 1.25, 0.35, top + 1.95), hz: hz - 0.1, cz: 0, kind: "block", seed: 88 });
  plan.stones.push({ quad: rect(0.35, top + 1.25, 4.6, top + 1.95), hz: hz - 0.1, cz: 0, kind: "block", seed: 89 });
  const inset = 0.04;
  plan.opening = rect(-(OPEN_HALF - inset), 0.02, OPEN_HALF - inset, top - inset);
  for (const side of [1, -1] as const) plan.colliders.push(boxX(side, OPEN_HALF, 4.7, 0, top, hz + 0.1));
  plan.colliders.push({ c: [0, top + 0.95, 0], h: [5.0, 0.95, hz + 0.06] });
  plan.outer = { half: 5.0, height: top + 1.95 };
  return plan;
}

/** The corbelled gate's courses: [y0, y1, inner x]. Straight to 5.1 m (the lettering's height), then stepping in. */
export const CORBEL: readonly (readonly [number, number, number])[] = [
  [0.6, 1.45, OPEN_HALF],
  [1.45, 2.3, OPEN_HALF],
  [2.3, 3.2, OPEN_HALF],
  [3.2, 4.1, OPEN_HALF],
  [4.1, 5.1, OPEN_HALF],
  [5.1, 5.95, 2.32],
  [5.95, 6.8, 1.98],
  [6.8, 7.65, 1.64],
  [7.65, 8.5, 1.3],
  [8.5, 9.35, 0.96],
];

function together(): GatewayPlan {
  const plan: GatewayPlan = { id: "together", stones: [], fill: [], opening: [], colliders: [], outer: { half: 0, height: 0 } };
  const hz = 0.75;
  const base = 4.7;
  const topOuter = 2.75;
  const yTop = CORBEL[CORBEL.length - 1]![1];
  const outerAt = (y: number): number => base - ((base - topOuter) * y) / yTop;
  for (const side of [1, -1] as const) {
    plan.stones.push({ quad: side > 0 ? rect(OPEN_HALF - 0.1, -0.35, base + 0.2, 0.6) : rect(-(base + 0.2), -0.35, -OPEN_HALF + 0.1, 0.6), hz: hz + 0.16, cz: 0, kind: "block", seed: side > 0 ? 91 : 92 });
    const r = rng(side > 0 ? 93 : 94);
    CORBEL.forEach(([y0, y1, xin], i) => {
      const oa = outerAt(y0);
      const ob = outerAt(y1);
      const sx = (x: number): number => side * x;
      const q = (a0: number, a1: number, b0: number, b1: number): [number, number][] => {
        const qq: [number, number][] = [[sx(a0), y0], [sx(a1), y0], [sx(b1), y1], [sx(b0), y1]];
        return side > 0 ? qq : [qq[1]!, qq[0]!, qq[3]!, qq[2]!];
      };
      if (i % 2 === 1 && ob - xin > 1.2) {
        const t = 0.4 + r() * 0.2;
        const ma = xin + (oa - xin) * t;
        const mb = xin + (ob - xin) * t;
        plan.stones.push({ quad: q(xin, ma, xin, mb), hz, cz: 0, kind: "block", seed: 900 + i * 2 + (side > 0 ? 0 : 50) });
        plan.stones.push({ quad: q(ma, oa, mb, ob), hz, cz: 0, kind: "block", seed: 901 + i * 2 + (side > 0 ? 0 : 50) });
      } else plan.stones.push({ quad: q(xin, oa, xin, ob), hz: hz + (i % 3 === 0 ? 0.04 : 0), cz: 0, kind: "block", seed: 900 + i * 2 + (side > 0 ? 0 : 50) });
      plan.colliders.push(boxX(side, xin, Math.max(oa, xin + 0.6), y0 - (i === 0 ? 0.6 : 0), y1, hz + 0.1));
    });
    feet(plan, side, OPEN_HALF, base + 0.2, hz + 0.16, side > 0 ? 95 : 96);
  }
  // the capstone spans the last corbels; a crown stone on top
  const capHalf = topOuter * 0.66;
  plan.stones.push({ quad: rect(-capHalf, yTop, capHalf, yTop + 1.1), hz: hz + 0.05, cz: 0, kind: "block", seed: 97 });
  plan.stones.push({ quad: [[-1.0, yTop + 1.1], [1.0, yTop + 1.1], [0.62, yTop + 1.8], [-0.62, yTop + 1.8]], hz: hz - 0.12, cz: 0, kind: "block", seed: 98 });
  plan.colliders.push({ c: [0, yTop + 0.9, 0], h: [capHalf, 0.9, hz + 0.05] });
  // the opening: the stepped corbel outline (inset), closed under the capstone
  const inset = 0.04;
  const right: [number, number][] = [[OPEN_HALF - inset, 0.02]];
  for (const [y0, y1, xin] of CORBEL) {
    right.push([xin - inset, y0 + (y0 > 0.6 ? inset : 0)]);
    right.push([xin - inset, y1 - inset]);
  }
  const op: [number, number][] = [[-(OPEN_HALF - inset), 0.02], ...right, ...right.slice().reverse().map(([x, y]) => [-x, y] as [number, number])];
  plan.opening = dedupe(op.slice(0, -1));
  plan.outer = { half: base + 0.2, height: yTop + 1.8 };
  return plan;
}

function dedupe(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push(p);
  }
  return out;
}

const PLANS = new Map<GatewayId, GatewayPlan>();
export function gatewayPlan(id: GatewayId): GatewayPlan {
  let p = PLANS.get(id);
  if (!p) {
    p = id === "explore" ? explore() : id === "works" ? works() : together();
    PLANS.set(id, p);
  }
  return p;
}

/** A gateway's colliders in the world (boxes yawed with the portal), the form StaticGrid takes. */
export function gatewayColliders(id: GatewayId, position: readonly number[], yaw: number): { kind: "box"; c: [number, number, number]; h: [number, number, number]; yaw: number }[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return gatewayPlan(id).colliders.map((b) => ({
    kind: "box" as const,
    c: [position[0]! + b.c[0] * c + b.c[2] * s, position[1]! + b.c[1], position[2]! - b.c[0] * s + b.c[2] * c],
    h: [b.h[0], b.h[1], b.h[2]],
    yaw,
  }));
}

/** Half-width of the clear opening at height y (from the opening polygon), for the lettering's layout checks. */
export function openingHalfAt(id: GatewayId, y: number): number {
  const op = gatewayPlan(id).opening;
  let best = 0;
  for (let i = 0; i < op.length; i++) {
    const [ax, ay] = op[i]!;
    const [bx, by] = op[(i + 1) % op.length]!;
    if ((ay - y) * (by - y) > 0 || ay === by) continue;
    const x = ax + ((bx - ax) * (y - ay)) / (by - ay);
    if (x > 0) best = Math.max(best, x);
  }
  return best;
}
