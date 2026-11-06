// World exploration collision and flight (main prompt §6, §13.2): high-speed
// impacts, wall sliding, corners, the coastline boundary and its
// intersection with the ceiling, slopes, pause/blur handling and the
// clamped frame step. Synthetic worlds keep each case exact.
import { describe, expect, it } from "vitest";
import { CAPSULE_HEIGHT, CAPSULE_SEGMENT, PLAYER, StaticGrid, clearAt, groundUnder, move, type World } from "../src/world/collision.ts";
import { AIR_PACE, Flight, MAX_DT, MAX_HORIZONTAL, WALK_SPEED, emptyInput } from "../src/world/flight.ts";
import { polygonSdf } from "../src/world/terrain.ts";

const SQUARE: [number, number][] = [
  [-500, -500],
  [500, -500],
  [500, 500],
  [-500, 500],
];
/** An L-shaped (non-convex) island, so the boundary can't be a radius from a centre. */
const L_SHAPE: [number, number][] = [
  [-400, -400],
  [400, -400],
  [400, 0],
  [0, 0],
  [0, 400],
  [-400, 400],
];

function flatWorld(poly: [number, number][] = SQUARE, ground = (_x: number, _z: number) => 0): World {
  return {
    ground,
    coast: (x, z) => polygonSdf(poly, x, z),
    coastNormal: (x, z) => {
      const e = 0.5;
      const gx = polygonSdf(poly, x + e, z) - polygonSdf(poly, x - e, z);
      const gz = polygonSdf(poly, x, z + e) - polygonSdf(poly, x, z - e);
      const l = Math.hypot(gx, gz) || 1;
      return [gx / l, gz / l];
    },
    ceiling: 640,
    seaFloor: 8,
    hard: 90,
    soft: 40,
  };
}

const wallGrid = (): StaticGrid => {
  const g = new StaticGrid(16);
  // a 0.6 m-thick wall across x = 20, spanning z −50…50, 10 m tall
  g.add("wall", [{ kind: "box", c: [20, 5, 0], h: [0.3, 5, 50], yaw: 0 }]);
  return g;
};

describe("capsule", () => {
  it("has the specified eye height, radius and a height computed from its endpoints", () => {
    expect(PLAYER.eye).toBe(1.65);
    expect(PLAYER.radius).toBe(0.35);
    // height = segment length + 2r
    expect(CAPSULE_SEGMENT[1] - CAPSULE_SEGMENT[0] + 2 * PLAYER.radius).toBeCloseTo(CAPSULE_HEIGHT, 9);
    expect(CAPSULE_HEIGHT).toBeGreaterThan(PLAYER.eye);
  });
});

describe("movement against static proxies", () => {
  it("never tunnels through a 0.6 m wall at boost speed, even with a long frame", () => {
    const w = flatWorld();
    const g = wallGrid();
    for (const dt of [1 / 60, 1 / 30, MAX_DT]) {
      const r = move(w, g, [0, 0, 0], [MAX_HORIZONTAL * 3, 0, 0], dt * 20, { flying: true });
      expect(r.feet[0], `dt ${dt}`).toBeLessThan(20 - 0.3 - PLAYER.radius + 1e-6);
      expect(r.collided).toBe(true);
    }
  });

  it("slides along a wall: the tangent motion is kept and the into-wall component removed", () => {
    const w = flatWorld();
    const g = wallGrid();
    const r = move(w, g, [19, 0, 0], [10, 0, 10], 1, { flying: false });
    expect(r.feet[0]).toBeLessThanOrEqual(20 - 0.3 - PLAYER.radius + 1e-6);
    expect(r.feet[2]).toBeGreaterThan(9); // slid ~10 m along z
    expect(r.vel[0]).toBeLessThanOrEqual(1e-9);
  });

  it("stops in an inside corner without jitter or escape", () => {
    const w = flatWorld();
    const g = new StaticGrid(16);
    g.add("corner", [
      { kind: "box", c: [10, 5, 0], h: [0.3, 5, 10], yaw: 0 },
      { kind: "box", c: [0, 5, 10], h: [10, 5, 0.3], yaw: 0 },
    ]);
    let f: [number, number, number] = [5, 0, 5];
    for (let i = 0; i < 120; i++) f = move(w, g, f, [8, 0, 8], 1 / 60, { flying: false }).feet;
    expect(f[0]).toBeLessThanOrEqual(10 - 0.3 - PLAYER.radius + 1e-6);
    expect(f[2]).toBeLessThanOrEqual(10 - 0.3 - PLAYER.radius + 1e-6);
    expect(clearAt(w, g, f).ok).toBe(true);
  });

  it("collides with rotated boxes and cylinders", () => {
    const w = flatWorld();
    const g = new StaticGrid(16);
    g.add("rot", [{ kind: "box", c: [20, 5, 0], h: [0.3, 5, 20], yaw: Math.PI / 4 }]);
    g.add("col", [{ kind: "cyl", c: [0, 5, 20], r: 2, hy: 5 }]);
    // the wall runs along the (1, 1) diagonal through (20, 0); moving +x meets it and slides along it
    const a = move(w, g, [0, 0, 0], [30, 0, 0], 0.7, { flying: true });
    expect(clearAt(w, g, a.feet).ok).toBe(true);
    // stays on the near side of the wall's plane: (x − 20) − z ≤ −(0.3 + r)·√2
    expect(a.feet[0] - 20 - a.feet[2]).toBeLessThanOrEqual(-(0.3 + PLAYER.radius) * Math.SQRT2 + 1e-6);
    expect(a.feet[2]).toBeGreaterThan(0.5); // and slid along it
    const b = move(w, g, [0, 0, 0], [0, 0, 30], 2, { flying: true });
    expect(Math.hypot(b.feet[0], b.feet[2] - 20)).toBeGreaterThanOrEqual(2 + PLAYER.radius - 1e-6);
  });

  it("walks up a ramp and stands on box tops within a step, but not on tall ones", () => {
    const w = flatWorld();
    const g = new StaticGrid(16);
    g.add("ramp", [{ kind: "ramp", c: [0, 3, 20], hx: 5, hz: 20, yaw: 0, y0: 0, y1: 6, floor: -0.5 }]);
    // walk up +z along the ramp
    let f: [number, number, number] = [0, 0, 0.5];
    for (let i = 0; i < 400; i++) f = move(w, g, f, [0, -5, 5], 1 / 60, { flying: false }).feet;
    expect(f[1]).toBeGreaterThan(4);
    expect(groundUnder(w, g, 0, 20, 10)).toBeCloseTo(3, 1);
    const g2 = new StaticGrid(16);
    g2.add("low", [{ kind: "box", c: [5, 0.15, 0], h: [1, 0.15, 1], yaw: 0 }]);
    g2.add("tall", [{ kind: "box", c: [10, 1, 0], h: [1, 1, 1], yaw: 0 }]);
    let p: [number, number, number] = [3, 0, 0];
    for (let i = 0; i < 120; i++) p = move(w, g2, p, [5, -5, 0], 1 / 60, { flying: false }).feet;
    // stepped onto the 0.3 m box, stopped at the 2 m one
    expect(p[0]).toBeLessThan(10 - 1 - PLAYER.radius + 1e-6);
  });

  it("drops motion when the substep budget runs out instead of skipping distance", () => {
    const w = flatWorld();
    const g = wallGrid();
    const r = move(w, g, [0, 0, 0], [1000, 0, 0], 1, { flying: true, maxSubsteps: 8 });
    // 8 substeps of r/2 = 1.4 m at most; the remaining ~998.6 m is dropped, not jumped
    expect(r.feet[0]).toBeLessThanOrEqual(8 * (PLAYER.radius / 2) + 1e-9);
    expect(r.dropped).toBeGreaterThan(990);
  });
});

describe("boundary, ceiling and sea floor", () => {
  it("removes only the outward component at the hard limit: no bounce, tangent motion kept", () => {
    const w = flatWorld();
    const g = new StaticGrid();
    // start just inside the hard limit on the +x side and push outward and along z
    const f: [number, number, number] = [500 + 89.5, 20, 0];
    const r = move(w, g, f, [20, 0, 10], 0.5, { flying: true });
    expect(w.coast(r.feet[0], r.feet[2])).toBeLessThanOrEqual(w.hard + 1e-6);
    expect(r.vel[0]).toBeCloseTo(0, 6);
    expect(r.vel[2]).toBeCloseTo(10, 6);
    expect(r.feet[2]).toBeGreaterThan(4);
  });

  it("uses the true nearest boundary of a non-convex island, not a radius", () => {
    const w = flatWorld(L_SHAPE);
    // in the notch of the L (x > 0, z > 0) the coast is near even though the point is close to the centre
    expect(w.coast(100, 100)).toBeGreaterThan(0);
    expect(w.coast(-100, -100)).toBeLessThan(0);
    const g = new StaticGrid();
    const r = move(w, g, [50, 20, 50], [0, 0, 0], 0.1, { flying: true });
    expect(r.boundary).toBe(0); // 50 m outside the coast, inside the soft band start (50 < 90 − 40? no: 50 = soft start)
    const r2 = move(w, g, [80, 20, 80], [5, 0, 5], 0.1, { flying: true });
    expect(r2.boundary).toBeGreaterThan(0);
  });

  it("can always return inward where the ceiling and the horizontal limit meet", () => {
    const w = flatWorld();
    const g = new StaticGrid();
    const corner: [number, number, number] = [500 + 90, 640 - CAPSULE_HEIGHT, 0];
    const r = move(w, g, corner, [-15, -5, 0], 1, { flying: true });
    expect(r.feet[0]).toBeLessThan(corner[0] - 10);
    expect(r.feet[1]).toBeLessThan(corner[1]);
    const up = move(w, g, corner, [10, 20, 0], 1, { flying: true });
    expect(up.feet[1] + CAPSULE_HEIGHT).toBeLessThanOrEqual(640 + 1e-9);
    expect(w.coast(up.feet[0], up.feet[2])).toBeLessThanOrEqual(w.hard + 1e-6);
  });

  it("holds flight above the sea floor offshore but not over land", () => {
    const sea = (x: number): number => (x > 500 ? -30 : 0);
    const w = flatWorld(SQUARE, sea);
    const g = new StaticGrid();
    const off = move(w, g, [560, 9, 0], [0, -20, 0], 1, { flying: true });
    expect(off.feet[1]).toBeCloseTo(8, 6);
    const land = move(w, g, [0, 5, 0], [0, -20, 0], 1, { flying: true });
    expect(land.feet[1]).toBeCloseTo(0, 6);
  });
});

describe("flight controller", () => {
  const world = flatWorld();
  const grid = new StaticGrid();

  it("moves along the camera's horizontal direction; looking up never forces upward travel", () => {
    const f = new Flight({ feet: [0, 0, 0], yaw: 0, pitch: 1.4 });
    f.state = "exploring";
    const input = emptyInput();
    input.move = [0, 1];
    for (let i = 0; i < 60; i++) f.step(1 / 60, input, world, grid, i * 16);
    expect(f.feet[1]).toBeCloseTo(0, 6);
    expect(f.feet[2]).toBeLessThan(-1); // forward is −z at yaw 0
  });

  it("Walk keeps the original controller's walk, fly and boost speeds with delta-aware acceleration (frame-rate independent)", () => {
    const run = (hz: number, fly: boolean, boost: boolean): number => {
      const f = new Flight({ feet: [0, 1, 0], yaw: 0, pitch: 0 });
      f.state = "exploring";
      const input = emptyInput("walk");
      input.move = [0, 1];
      input.boost = boost;
      if (fly) {
        input.ascend = true;
        f.step(1 / hz, input, world, grid, 0);
        input.ascend = false;
      }
      for (let i = 0; i < hz * 3; i++) f.step(1 / hz, input, world, grid, i);
      return Math.hypot(f.vel[0], f.vel[2]);
    };
    // the pre-preset controller's numbers (SPEED = { walk: 5, fly: 15, boost: 32 })
    expect(run(60, false, false)).toBeCloseTo(WALK_SPEED, 1);
    expect(run(60, false, false)).toBeCloseTo(5, 1);
    expect(run(60, true, false)).toBeCloseTo(AIR_PACE.cruise, 1);
    expect(run(60, true, true)).toBeCloseTo(AIR_PACE.boost, 1);
    expect(Math.abs(run(30, true, true) - run(144, true, true))).toBeLessThan(0.2);
  });

  it("clamps a long frame (a suspended tab) instead of integrating the whole gap", () => {
    const f = new Flight({ feet: [0, 0, 0], yaw: 0, pitch: 0 });
    f.state = "exploring";
    const input = emptyInput("walk");
    input.move = [0, 1];
    f.step(1 / 60, input, world, grid, 0);
    const z0 = f.feet[2];
    f.step(30, input, world, grid, 30_000); // 30 s gap
    expect(Math.abs(f.feet[2] - z0)).toBeLessThanOrEqual(WALK_SPEED * MAX_DT + 1e-6);
  });

  it("holds still in every non-exploring state", () => {
    for (const state of ["idle", "paused", "transitioning", "error", "leaving"] as const) {
      const f = new Flight({ feet: [0, 0, 0], yaw: 0, pitch: 0 });
      f.state = state;
      const input = emptyInput();
      input.move = [1, 1];
      input.ascend = true;
      for (let i = 0; i < 30; i++) f.step(1 / 60, input, world, grid, i);
      expect(f.feet, state).toEqual([0, 0, 0]);
    }
  });

  it("descends and lands on a standable surface, ending flight", () => {
    const f = new Flight({ feet: [0, 0, 0], yaw: 0, pitch: 0 });
    f.state = "exploring";
    const input = emptyInput();
    input.ascend = true;
    for (let i = 0; i < 60; i++) f.step(1 / 60, input, world, grid, i);
    expect(f.flying).toBe(true);
    expect(f.feet[1]).toBeGreaterThan(3);
    input.ascend = false;
    input.descend = true;
    for (let i = 0; i < 400; i++) f.step(1 / 60, input, world, grid, i);
    expect(f.flying).toBe(false);
    expect(f.feet[1]).toBeCloseTo(0, 3);
  });

  it("slows outward motion progressively in the soft band", () => {
    const f = new Flight({ feet: [500 + 55, 20, 0], yaw: -Math.PI / 2, pitch: 0 }); // facing +x (outward)
    f.state = "exploring";
    f.flying = true;
    const input = emptyInput();
    input.move = [0, 1];
    const speeds: number[] = [];
    for (let i = 0; i < 60 * 20; i++) {
      f.step(1 / 60, input, world, grid, i);
      speeds.push(f.vel[0]);
      expect(world.coast(f.feet[0], f.feet[2])).toBeLessThanOrEqual(world.hard + 1e-6);
    }
    // after the initial acceleration, outward speed only falls as the boundary nears
    const peak = speeds.indexOf(Math.max(...speeds));
    for (let i = peak + 1; i < speeds.length; i++) expect(speeds[i]!).toBeLessThanOrEqual(speeds[i - 1]! + 1e-9);
    expect(speeds[speeds.length - 1]!).toBeLessThan(0.5);
    expect(f.boundary).toBeGreaterThan(0.9);
  });

  it("detects non-finite positions as a fault for recovery", () => {
    const f = new Flight({ feet: [0, 0, 0], yaw: 0, pitch: 0 });
    f.state = "exploring";
    f.feet = [NaN, 0, 0];
    f.step(1 / 60, emptyInput(), world, grid, 0);
    expect(f.fault).not.toBeNull();
    f.teleport({ feet: [1, 0, 1], yaw: 0, pitch: 0 });
    expect(f.fault).toBeNull();
    expect(f.vel).toEqual([0, 0, 0]);
  });
});
