// Speed presets (interaction brief §3): Walk/Run/Fly targets, the boost cap,
// diagonal normalisation, switching without a pause or a change of heading,
// look sensitivity independent of speed, and collision and the island
// boundary at the fastest controlled speed, at low frame rates and against
// real landmark colliders (no tunnelling).
import { beforeAll, describe, expect, it } from "vitest";
import { CAPSULE_HEIGHT, PLAYER, StaticGrid, clearAt, type World } from "../src/world/collision.ts";
import { AIR_PACE, Flight, MAX_DT, MAX_HORIZONTAL, MAX_SPEED, MAX_VERTICAL, SPEED_FACTOR, SPEED_MODES, WALK_SPEED, emptyInput, horizontalSpeed, isSpeedMode, verticalSpeed, type SpeedMode } from "../src/world/flight.ts";
import { polygonSdf } from "../src/world/terrain.ts";
import { LANDMARKS, buildLandmark } from "../src/world/landmarks.ts";
import type { BuildResult } from "../src/world/core.ts";

const SQUARE: [number, number][] = [
  [-500, -500],
  [500, -500],
  [500, 500],
  [-500, 500],
];
const flatWorld = (): World => ({
  ground: () => 0,
  coast: (x, z) => polygonSdf(SQUARE, x, z),
  coastNormal: (x, z) => {
    const e = 0.5;
    const gx = polygonSdf(SQUARE, x + e, z) - polygonSdf(SQUARE, x - e, z);
    const gz = polygonSdf(SQUARE, x, z + e) - polygonSdf(SQUARE, x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  },
  ceiling: 640,
  seaFloor: 8,
  hard: 90,
  soft: 40,
});

/** Steady horizontal speed after 3 s of holding forward (optionally a diagonal), on foot or flying. */
function steady(mode: SpeedMode, opts: { boost?: boolean; fly?: boolean; move?: [number, number]; hz?: number } = {}): number {
  const world = flatWorld();
  const grid = new StaticGrid();
  const hz = opts.hz ?? 60;
  const f = new Flight({ feet: [0, 1, 0], yaw: 0, pitch: 0 });
  f.state = "exploring";
  const input = emptyInput(mode);
  input.boost = !!opts.boost;
  if (opts.fly) {
    input.ascend = true;
    f.step(1 / hz, input, world, grid, 0);
    input.ascend = false;
  }
  input.move = opts.move ?? [0, 1];
  for (let i = 0; i < hz * 3; i++) f.step(1 / hz, input, world, grid, i);
  return Math.hypot(f.vel[0], f.vel[2]);
}

describe("speed presets", () => {
  it("Walk is the current pace; Run is 3× and Fly 7× it, on foot", () => {
    expect(WALK_SPEED).toBe(5);
    expect(SPEED_FACTOR).toEqual({ walk: 1, run: 3, fly: 7 });
    expect(steady("walk")).toBeCloseTo(5, 1);
    expect(steady("run")).toBeCloseTo(15, 1);
    expect(steady("fly")).toBeCloseTo(35, 1);
  });

  it("are ordered Walk < Run < Fly on foot, and Walk ≤ Run < Fly airborne, boosted or not", () => {
    for (const boost of [false, true]) {
      for (const fly of [false, true]) {
        const [w, r, f] = SPEED_MODES.map((m) => horizontalSpeed(m, boost, fly));
        expect(w!, `walk ≤ run (boost ${boost}, fly ${fly})`).toBeLessThanOrEqual(r!);
        expect(r!, `run < fly (boost ${boost}, fly ${fly})`).toBeLessThan(f!);
        if (!fly) expect(w!).toBeLessThan(r!);
      }
    }
  });

  it("Walk airborne keeps the original flight pace (15, boosted 32)", () => {
    expect(steady("walk", { fly: true })).toBeCloseTo(AIR_PACE.cruise, 1);
    expect(steady("walk", { fly: true, boost: true })).toBeCloseTo(AIR_PACE.boost, 1);
  });

  it("boost is ×1.8 of the preset and never exceeds the documented maximum (Fly + boost = 45 m/s, not 7 × the old boost)", () => {
    expect(horizontalSpeed("walk", true)).toBeCloseTo(9, 9);
    expect(horizontalSpeed("run", true)).toBeCloseTo(27, 9);
    expect(horizontalSpeed("fly", true)).toBe(MAX_HORIZONTAL);
    expect(MAX_HORIZONTAL).toBe(45);
    for (const m of SPEED_MODES) for (const b of [false, true]) for (const fl of [false, true]) expect(horizontalSpeed(m, b, fl)).toBeLessThanOrEqual(MAX_HORIZONTAL);
    expect(steady("fly", { boost: true, fly: true })).toBeLessThanOrEqual(MAX_HORIZONTAL + 1e-9);
    expect(steady("fly", { boost: true, fly: true })).toBeCloseTo(45, 1);
  });

  it("climb and descent: original rates in Walk and Run, faster in Fly, all capped", () => {
    expect(verticalSpeed("walk", false)).toBeCloseTo(10.5, 9);
    expect(verticalSpeed("walk", true)).toBeCloseTo(15, 9);
    expect(verticalSpeed("run", false)).toBeCloseTo(10.5, 9);
    expect(verticalSpeed("fly", false)).toBeCloseTo(17.5, 9);
    expect(verticalSpeed("fly", true)).toBeLessThanOrEqual(MAX_VERTICAL);
    expect(MAX_SPEED).toBeCloseTo(Math.hypot(45, 24), 9);
  });

  it("normalises diagonal input so it never exceeds the selected speed", () => {
    for (const m of SPEED_MODES) {
      const straight = steady(m);
      const diagonal = steady(m, { move: [1, 1] });
      expect(diagonal, m).toBeLessThanOrEqual(straight + 1e-6);
      expect(diagonal, m).toBeCloseTo(straight, 1);
    }
  });

  it("selecting Fly on the ground neither starts flight nor rises nor turns", () => {
    const world = flatWorld();
    const grid = new StaticGrid();
    const f = new Flight({ feet: [0, 0, 0], yaw: 0.7, pitch: -0.1 });
    f.state = "exploring";
    const input = emptyInput("walk");
    for (let i = 0; i < 30; i++) f.step(1 / 60, input, world, grid, i);
    input.speed = "fly";
    for (let i = 0; i < 120; i++) f.step(1 / 60, input, world, grid, i);
    expect(f.flying).toBe(false);
    expect(f.feet).toEqual([0, 0, 0]);
    expect(f.yaw).toBe(0.7);
    expect(f.pitch).toBe(-0.1);
  });

  it("switching speed mid-move keeps position and heading and eases (no jump) to the new speed", () => {
    const world = flatWorld();
    const grid = new StaticGrid();
    const f = new Flight({ feet: [0, 0, 0], yaw: 0.3, pitch: 0 });
    f.state = "exploring";
    const input = emptyInput("walk");
    input.move = [0, 1];
    for (let i = 0; i < 120; i++) f.step(1 / 60, input, world, grid, i);
    const at = [...f.feet];
    const v0 = Math.hypot(f.vel[0], f.vel[2]);
    input.speed = "fly";
    f.step(1 / 60, input, world, grid, 121);
    // one frame later: same heading, moved about one frame's worth, velocity only part of the way up
    expect(f.yaw).toBe(0.3);
    expect(Math.hypot(f.feet[0] - at[0]!, f.feet[2] - at[2]!)).toBeLessThan(1);
    const v1 = Math.hypot(f.vel[0], f.vel[2]);
    expect(v1).toBeGreaterThan(v0);
    expect(v1).toBeLessThan(horizontalSpeed("fly", false));
    // and then reaches it
    for (let i = 0; i < 180; i++) f.step(1 / 60, input, world, grid, 122 + i);
    expect(Math.hypot(f.vel[0], f.vel[2])).toBeCloseTo(35, 1);
    // decelerates smoothly when the key is released
    input.move = [0, 0];
    f.step(1 / 60, input, world, grid, 400);
    const after = Math.hypot(f.vel[0], f.vel[2]);
    expect(after).toBeGreaterThan(20);
    expect(after).toBeLessThan(35);
  });

  it("look sensitivity doesn't depend on speed: the same look delta turns the same amount in every preset", () => {
    const world = flatWorld();
    const grid = new StaticGrid();
    const turns = SPEED_MODES.map((m) => {
      const f = new Flight({ feet: [0, 0, 0], yaw: 0, pitch: 0 });
      f.state = "exploring";
      const input = emptyInput(m);
      input.move = [0, 1];
      input.look = [0.25, -0.1];
      f.step(1 / 60, input, world, grid, 0);
      return [f.yaw, f.pitch];
    });
    expect(turns[1]).toEqual(turns[0]);
    expect(turns[2]).toEqual(turns[0]);
  });

  it("validates stored values", () => {
    expect(SPEED_MODES.every(isSpeedMode)).toBe(true);
    for (const bad of ["", "sprint", "FLY", null, undefined, 3, {}]) expect(isSpeedMode(bad)).toBe(false);
    // an invalid preset in the input never produces a faster speed than Walk
    const world = flatWorld();
    const grid = new StaticGrid();
    const f = new Flight({ feet: [0, 0, 0], yaw: 0, pitch: 0 });
    f.state = "exploring";
    const input = emptyInput("walk");
    (input as { speed: unknown }).speed = "warp";
    input.move = [0, 1];
    for (let i = 0; i < 180; i++) f.step(1 / 60, input, world, grid, i);
    expect(Math.hypot(f.vel[0], f.vel[2])).toBeCloseTo(WALK_SPEED, 1);
  });
});

describe("collision and boundaries at the fastest speed, at low frame rates", () => {
  // a wall 0.6 m thick, in the way of a run at full Fly + boost
  const wall = (): StaticGrid => {
    const g = new StaticGrid(16);
    g.add("wall", [{ kind: "box", c: [0, 5, -60], h: [50, 5, 0.3], yaw: 0 }]);
    return g;
  };

  it.each([60, 20, 10, 1 / MAX_DT])("Fly + boost into a 0.6 m wall at %d fps never passes through it", (hz) => {
    const world = flatWorld();
    const grid = wall();
    const f = new Flight({ feet: [0, 1, 0], yaw: 0, pitch: 0 }); // facing −z, toward the wall
    f.state = "exploring";
    f.flying = true;
    const input = emptyInput("fly");
    input.boost = true;
    input.move = [0, 1];
    for (let i = 0; i < hz * 6; i++) {
      f.step(1 / hz, input, world, grid, i);
      expect(f.feet[2], `step ${i}`).toBeGreaterThan(-60 + 0.3 + PLAYER.radius - 1e-6);
    }
    expect(f.feet[2]).toBeCloseTo(-60 + 0.3 + PLAYER.radius, 2);
  });

  it("a long stall at Fly + boost is clamped (no burst through anything)", () => {
    const world = flatWorld();
    const grid = wall();
    const f = new Flight({ feet: [0, 1, -50], yaw: 0, pitch: 0 });
    f.state = "exploring";
    f.flying = true;
    const input = emptyInput("fly");
    input.boost = true;
    input.move = [0, 1];
    for (let i = 0; i < 120; i++) f.step(1 / 60, input, world, grid, i);
    const z0 = f.feet[2];
    f.step(5, input, world, grid, 10_000);
    expect(Math.abs(f.feet[2] - z0)).toBeLessThanOrEqual(MAX_HORIZONTAL * MAX_DT + 1e-6);
    expect(f.feet[2]).toBeGreaterThan(-60 + 0.3 + PLAYER.radius - 1e-6);
  });

  it.each([60, 10])("the island's hard boundary holds at Fly + boost, %d fps", (hz) => {
    const world = flatWorld();
    const grid = new StaticGrid();
    const f = new Flight({ feet: [400, 20, 0], yaw: -Math.PI / 2, pitch: 0 }); // facing +x, outward
    f.state = "exploring";
    f.flying = true;
    const input = emptyInput("fly");
    input.boost = true;
    input.move = [0, 1];
    for (let i = 0; i < hz * 20; i++) {
      f.step(1 / hz, input, world, grid, i);
      expect(world.coast(f.feet[0], f.feet[2])).toBeLessThanOrEqual(world.hard + 1e-6);
      expect(f.fault).toBeNull();
    }
  });

  it("the ceiling holds at the fastest climb", () => {
    const world = flatWorld();
    const grid = new StaticGrid();
    const f = new Flight({ feet: [0, 600, 0], yaw: 0, pitch: 0 });
    f.state = "exploring";
    f.flying = true;
    const input = emptyInput("fly");
    input.boost = true;
    input.ascend = true;
    for (let i = 0; i < 10 * 60; i++) f.step(1 / 10, input, world, grid, i);
    expect(f.feet[1] + CAPSULE_HEIGHT).toBeLessThanOrEqual(world.ceiling + 1e-6);
  });
});

describe("real landmark colliders at the fastest speed", () => {
  // L06 (the ring theatre, 2,420 colliders: thin walls, piers, steps) and L16 (the dam, 1,007): the densest sets
  const built = new Map<string, BuildResult>();
  beforeAll(() => {
    for (const id of ["L06", "L16"]) built.set(id, buildLandmark(LANDMARKS.find((l) => l.id === id)!));
  }, 120_000);
  const open: World = { ground: () => -1e6, coast: () => -1000, coastNormal: () => [1, 0], ceiling: 10000, seaFloor: -1e6, hard: 90, soft: 40 };

  it.each(["L06", "L16"])("%s: Fly + boost runs at 10 fps from 16 headings and heights never end inside a collider", (id) => {
    const r = built.get(id)!;
    const g = new StaticGrid(24);
    g.add(id, r.colliders);
    const b = r.coreBounds;
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const R = Math.hypot(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2 + 40;
    let runs = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const h of [b.min[1] + 2, (b.min[1] + b.max[1]) / 2, b.max[1] - 3]) {
        // start outside, flying straight at the centre
        const start: [number, number, number] = [cx + Math.sin(a) * R, h, cz + Math.cos(a) * R];
        if (!clearAt(open, g, start).ok) continue;
        const f = new Flight({ feet: start, yaw: a, pitch: 0 }); // forward (−sin a, −cos a) points at the centre
        f.state = "exploring";
        f.flying = true;
        const input = emptyInput("fly");
        input.boost = true;
        input.move = [0, 1];
        for (let i = 0; i < 60; i++) {
          f.step(MAX_DT, input, open, g, i);
          const c = clearAt(open, g, [f.feet[0], f.feet[1] + 0.02, f.feet[2]]);
          expect(c.ok, `${id} heading ${k}, height ${h.toFixed(1)}, step ${i}: ${c.reason}`).toBe(true);
        }
        runs++;
      }
    }
    expect(runs).toBeGreaterThan(20);
  });
});
