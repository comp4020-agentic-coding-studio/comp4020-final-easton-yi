// The three stone gateways (courtyard/day-night directive §3): each stands
// where its timber frame stood with about the same outer size and the same
// clear passage; its stones bear on the ones below (no floating structural
// rock); its colliders follow the visible stone and never close the opening;
// and the passage can be crossed, and the stone can't be, at the fastest
// controlled speed and at low frame rates.
import { describe, expect, it } from "vitest";
import { PLAYER, StaticGrid, clearAt, type World } from "../src/world/collision.ts";
import { Flight, MAX_DT, emptyInput } from "../src/world/flight.ts";
import { OPEN_HALF, gatewayColliders, gatewayPlan, openingHalfAt, type GatewayId } from "../src/world/gateways.ts";
import { home } from "../src/world/layout.ts";
import { polygonSdf } from "../src/world/terrain.ts";

const IDS: GatewayId[] = ["explore", "works", "together"];

/** The y-extent and x-extent of a stone's quad. */
const ext = (q: readonly [number, number][]): { x0: number; x1: number; y0: number; y1: number } => ({
  x0: Math.min(...q.map((p) => p[0])),
  x1: Math.max(...q.map((p) => p[0])),
  y0: Math.min(...q.map((p) => p[1])),
  y1: Math.max(...q.map((p) => p[1])),
});

describe("form and size", () => {
  it("keeps the timber frames' clear passage: 5.3 m wide at the foot, at least 9 m high at the centre", () => {
    expect(OPEN_HALF * 2).toBeCloseTo(5.3, 6);
    for (const id of IDS) {
      // the walking band: full width up to a head's height and well above
      for (const y of [0.1, 1, 2, 3, 4]) expect(openingHalfAt(id, y), `${id} at ${y} m`).toBeGreaterThan(OPEN_HALF - 0.1);
      // the opening's highest point (the membrane's top)
      const top = Math.max(...gatewayPlan(id).opening.map((p) => p[1]));
      expect(top, id).toBeGreaterThan(9);
      expect(top, id).toBeLessThan(10.6);
    }
  });

  it("keeps an outer size close to the 6 × 9 m timber frames (not enlarged)", () => {
    for (const id of IDS) {
      const o = gatewayPlan(id).outer;
      expect(o.half * 2, id).toBeGreaterThan(7);
      expect(o.half * 2, id).toBeLessThan(10.5);
      expect(o.height, id).toBeGreaterThan(9.5);
      expect(o.height, id).toBeLessThan(13);
    }
  });

  it("keeps three distinct silhouettes: a pointed arch, a lintel, stepped corbels", () => {
    const top = (id: GatewayId): number => Math.max(...gatewayPlan(id).opening.map((p) => p[1]));
    // the arch narrows continuously above its springing; the lintel's opening is a rectangle; the corbels step
    const ex = gatewayPlan("explore");
    expect(openingHalfAt("explore", 8)).toBeLessThan(OPEN_HALF - 0.3);
    // closed at the top by the keystone's narrow bed (not a flat lintel's full span)
    expect(openingHalfAt("explore", top("explore") - 0.3)).toBeLessThan(OPEN_HALF / 2);
    expect(gatewayPlan("works").opening).toHaveLength(4);
    expect(openingHalfAt("works", top("works") - 0.2)).toBeGreaterThan(OPEN_HALF - 0.1);
    const steps = new Set(gatewayPlan("together").opening.map((p) => Math.abs(p[0]).toFixed(2)));
    expect(steps.size).toBeGreaterThanOrEqual(5);
    expect(ex.stones.length).toBeGreaterThan(20);
  });

  it("uses several sizes of stone, not one repeated block", () => {
    for (const id of IDS) {
      const sizes = new Set(gatewayPlan(id).stones.map((s) => {
        const e = ext(s.quad);
        return `${(e.x1 - e.x0).toFixed(1)}×${(e.y1 - e.y0).toFixed(1)}`;
      }));
      expect(sizes.size, id).toBeGreaterThan(5);
      expect(gatewayPlan(id).fill.length, id).toBeGreaterThan(0);
    }
  });
});

describe("structure", () => {
  it("every structural stone bears on the ground or on stone below it (nothing floats)", () => {
    for (const id of IDS) {
      const stones = gatewayPlan(id).stones.map((s) => ({ s, e: ext(s.quad) }));
      for (const { s, e } of stones) {
        if (e.y0 <= 0) continue; // on (or sunk into) the ground
        // a stone below whose top meets this one's bed over some width
        const bearing = stones.some(({ s: o, e: f }) => o !== s && Math.abs(f.y1 - e.y0) < 0.02 && Math.min(f.x1, e.x1) - Math.max(f.x0, e.x0) > 0.2);
        // a voussoir rests on its neighbour along the ring (its bed is a sloped joint): it shares an edge with one
        const sharesEdge = stones.some(({ s: o }) => o !== s && o.quad.some((p) => s.quad.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)));
        expect(bearing || sharesEdge, `${id}: stone at x ${e.x0.toFixed(2)}…${e.x1.toFixed(2)}, y ${e.y0.toFixed(2)}`).toBe(true);
      }
    }
  });

  it("the corbels never step out further than the course below can carry (stable stepping, not a leaning stack)", () => {
    const st = gatewayPlan("together").stones.map((s) => ext(s.quad)).filter((e) => e.x0 > 0);
    for (const e of st) {
      if (e.y0 <= 0.6) continue;
      const below = st.filter((f) => Math.abs(f.y1 - e.y0) < 0.02);
      if (!below.length) continue; // the capstone spans both sides (checked above)
      const inner = Math.min(...below.map((f) => f.x0));
      // each course oversails the one below by at most 0.4 m (about a third of its bed)
      expect(inner - e.x0).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("colliders follow the stone and leave the opening", () => {
  it("no collider reaches into the clear opening at any height", () => {
    for (const id of IDS) {
      const plan = gatewayPlan(id);
      for (const b of plan.colliders) {
        // within the box's height, clear of the 4 cm chamfer where the opening's outline turns a corbel's corner
        for (const y of [b.c[1] - b.h[1] + 0.06, b.c[1], b.c[1] + b.h[1] - 0.06]) {
          const half = openingHalfAt(id, y);
          if (half <= 0) continue;
          const inner = Math.abs(b.c[0]) - b.h[0];
          // a collider spanning the centre is above the opening's top at this height (the arch's last band, the lintel)
          if (b.c[0] === 0) expect(y, `${id} centre box at ${y.toFixed(2)}`).toBeGreaterThan(Math.max(...plan.opening.map((p) => p[1])) - 0.6);
          else expect(inner, `${id} box at y ${y.toFixed(2)}`).toBeGreaterThanOrEqual(half - 0.05);
        }
      }
    }
  });

  it("the colliders cover the visible stone: every structural stone's centre is inside one (no walking into rock)", () => {
    for (const id of IDS) {
      const plan = gatewayPlan(id);
      for (const s of plan.stones) {
        const e = ext(s.quad);
        if (e.y1 <= 0.65) continue; // the base course is underfoot (the walkable step)
        const cx = (e.x0 + e.x1) / 2;
        const cy = (e.y0 + e.y1) / 2;
        const inside = plan.colliders.some((b) => Math.abs(cx - b.c[0]) <= b.h[0] + 0.15 && Math.abs(cy - b.c[1]) <= b.h[1] + 0.15);
        expect(inside, `${id}: stone centred (${cx.toFixed(2)}, ${cy.toFixed(2)})`).toBe(true);
      }
    }
  });

  it("the world colliders turn with each portal's yaw and stand at its position", () => {
    for (const p of home().portals) {
      const cols = gatewayColliders(p.id as GatewayId, p.position, p.yaw);
      expect(cols.length).toBe(gatewayPlan(p.id as GatewayId).colliders.length);
      for (const c of cols) {
        expect(c.yaw).toBe(p.yaw);
        expect(Math.hypot(c.c[0] - p.position[0]!, c.c[2] - p.position[2]!)).toBeLessThan(6);
      }
    }
  });
});

describe("crossing at the fastest speed", () => {
  const flat = (y: number): World => ({
    ground: () => y,
    coast: (x, z) => polygonSdf([[-5000, -5000], [5000, -5000], [5000, 5000], [-5000, 5000]], x, z),
    coastNormal: () => [1, 0],
    ceiling: 10000,
    seaFloor: -1e6,
    hard: 90,
    soft: 40,
  });

  it.each(IDS.flatMap((id) => [60, 10].map((hz) => [id, hz] as const)))("%s: Run + boost straight through the opening at %d fps passes cleanly", (id, hz) => {
    const p = home().portals.find((q) => q.id === id)!;
    const world = flat(p.position[1]!);
    const grid = new StaticGrid(16);
    grid.add(`portal-${id}`, gatewayColliders(id, p.position, p.yaw));
    // start 12 m in front (toward the spawn: local −z), run along local +z
    const n = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    const start: [number, number, number] = [p.position[0]! + n[0]! * 12, p.position[1]!, p.position[2]! + n[1]! * 12];
    const f = new Flight({ feet: start, yaw: p.yaw, pitch: 0 }); // forward is (−sin yaw, −cos yaw) = n … so face away
    f.yaw = p.yaw + Math.PI;
    f.state = "exploring";
    const input = emptyInput("run");
    input.boost = true;
    input.move = [0, 1];
    for (let i = 0; i < hz * 4; i++) {
      f.step(1 / hz, input, world, grid, i);
      expect(clearAt(world, grid, [f.feet[0], f.feet[1] + 0.02, f.feet[2]]).ok, `${id} step ${i}`).toBe(true);
    }
    // it got through: now behind the gateway, and not deflected sideways into a pier
    const dx = f.feet[0] - p.position[0]!;
    const dz = f.feet[2] - p.position[2]!;
    expect(dx * n[0]! + dz * n[1]!).toBeLessThan(-6);
    expect(Math.abs(dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw))).toBeLessThan(0.5);
  });

  it.each(IDS.flatMap((id) => [60, 1 / MAX_DT].map((hz) => [id, hz] as const)))("%s: Fly + boost at a pier at %d fps never enters the stone", (id, hz) => {
    const p = home().portals.find((q) => q.id === id)!;
    const world = flat(p.position[1]!);
    const grid = new StaticGrid(16);
    grid.add(`portal-${id}`, gatewayColliders(id, p.position, p.yaw));
    const n = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    const side = [Math.cos(p.yaw), -Math.sin(p.yaw)];
    for (const [sx, h] of [[1, 2], [-1, 2], [1, 5], [0, 11]] as const) {
      // aimed at the right or left pier (3.6 m off centre) at 2 or 5 m, or the top over the opening
      const off = sx * 3.6;
      const start: [number, number, number] = [p.position[0]! + n[0]! * 14 + side[0]! * off, p.position[1]! + h, p.position[2]! + n[1]! * 14 + side[1]! * off];
      const f = new Flight({ feet: start, yaw: p.yaw + Math.PI, pitch: 0 });
      f.state = "exploring";
      f.flying = true;
      const input = emptyInput("fly");
      input.boost = true;
      input.move = [0, 1];
      for (let i = 0; i < hz * 3; i++) {
        f.step(1 / hz, input, world, grid, i);
        const c = clearAt(world, grid, [f.feet[0], f.feet[1] + 0.02, f.feet[2]]);
        expect(c.ok, `${id} pier ${sx} at ${h} m, step ${i}: ${c.reason}`).toBe(true);
      }
      // stopped in front of the stone (never through it)
      const dx = f.feet[0] - p.position[0]!;
      const dz = f.feet[2] - p.position[2]!;
      if (sx !== 0) expect(dx * n[0]! + dz * n[1]!, `${id} pier ${sx}`).toBeGreaterThan(0.6 + PLAYER.radius - 0.05);
    }
  });
});
