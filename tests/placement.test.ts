// Placement validity (PLACE-08, WORLD-02): touching is not intersecting.
// Face contact, edge contact, a gap, a shallow tolerated overlap and a deep
// intersection, for axis-aligned and rotated sticks, checked both by the
// authoritative Rapier query and the shared advisory SAT.
import { describe, expect, it } from "vitest";
import { currentPhysicsConfig } from "../src/shared/config.ts";
import { boxOverlap, quatFromYawPitchRoll, stickBox, tableOverlap, type Pose } from "../src/shared/geometry.ts";
import { initPhysics, PhysicsWorld } from "../src/server/core/physics.ts";

const cfg = currentPhysicsConfig();
const FLAT = quatFromYawPitchRoll(0, 0, 0);
const VERTICAL = quatFromYawPitchRoll(0, Math.PI / 2, 0);
await initPhysics();

const worldWith = (...poses: Pose[]): PhysicsWorld => {
  const w = PhysicsWorld.create(cfg);
  poses.forEach((p, i) => w.addStick({ id: `b${i}`, authorId: "u", createdBy: `c${i}`, seed: i, placedAt: 0 }, p));
  return w;
};

describe("against the table", () => {
  const w = worldWith();
  it.each([
    ["resting with the placement gap", { p: [0, 0.5 + 0.005, 0], q: FLAT }, null],
    ["exactly touching", { p: [0, 0.5, 0], q: FLAT }, null],
    ["shallow overlap within tolerance", { p: [0, 0.4995, 0], q: FLAT }, null],
    ["sunk into the table", { p: [0, 0.3, 0], q: FLAT }, "OUT_OF_BOUNDS"],
    ["vertical pillar standing on it", { p: [0, 4.005, 0], q: VERTICAL }, null],
  ] as const)("%s", (_name, pose, expected) => {
    expect(w.checkPlacement(pose as Pose).problem).toBe(expected);
  });

  it("overhanging the edge is allowed; outside the creation radius is not", () => {
    expect(w.checkPlacement({ p: [17, 0.505, 0], q: FLAT }).problem).toBe(null);
    expect(w.checkPlacement({ p: [19, 0.505, 0], q: FLAT }).problem).toBe("OUT_OF_BOUNDS");
  });

  it("below the table top beyond its edge is outside the creation bounds", () => {
    expect(w.checkPlacement({ p: [20, -3, 0], q: FLAT }).problem).toBe("OUT_OF_BOUNDS");
  });

  it("rejects non-finite and non-unit rotations", () => {
    expect(w.checkPlacement({ p: [NaN, 1, 0], q: FLAT }).problem).toBe("NON_FINITE");
    expect(w.checkPlacement({ p: [0, 1, 0], q: [0, 0, 0, 2] }).problem).toBe("NON_FINITE");
  });
});

describe("against another stick", () => {
  const base: Pose = { p: [0, 0.5 + 0.005, 0], q: FLAT };
  const w = worldWith(base);
  const rotated = quatFromYawPitchRoll(0.6, 0, 0.4);
  it.each([
    ["face contact on top", { p: [0, 1.5 + 0.005, 0], q: FLAT }, null],
    ["face contact exactly touching", { p: [0, 1.505, 0], q: FLAT }, null],
    ["side by side with a gap", { p: [0, 0.505, 1.01], q: FLAT }, null],
    ["shallow overlap within tolerance", { p: [0, 1.5035, 0], q: FLAT }, null],
    ["deep intersection", { p: [0.5, 0.9, 0], q: FLAT }, "COLLISION"],
    ["crossing at the same height", { p: [0, 0.505, 0], q: quatFromYawPitchRoll(Math.PI / 2, 0, 0) }, "COLLISION"],
    ["rotated, clear above", { p: [0, 2.6, 0], q: rotated }, null],
    ["rotated, through the middle", { p: [0, 0.8, 0], q: rotated }, "COLLISION"],
  ] as const)("%s", (_name, pose, expected) => {
    expect(w.checkPlacement(pose as Pose).problem).toBe(expected);
  });

  it("edge-on contact of a 45° rolled stick is touching, not intersecting", () => {
    const roll45 = quatFromYawPitchRoll(0, 0, Math.PI / 4);
    // Rolled 45°, the lowest edge sits √2/2 below the centre.
    const h = 1.005 + Math.SQRT1_2 + 0.005;
    expect(w.checkPlacement({ p: [0, h, 0], q: roll45 }).problem).toBe(null);
    expect(w.checkPlacement({ p: [0, h - 0.2, 0], q: roll45 }).problem).toBe("COLLISION");
  });

  it("the advisory SAT agrees with Rapier on these cases", () => {
    const dims = cfg.stick;
    const b = stickBox(base, dims);
    const cases: [Pose, boolean][] = [
      [{ p: [0, 1.505, 0], q: FLAT }, false],
      [{ p: [0, 0.505, 1.01], q: FLAT }, false],
      [{ p: [0.5, 0.9, 0], q: FLAT }, true],
      [{ p: [0, 0.8, 0], q: rotated }, true],
      [{ p: [0, 2.6, 0], q: rotated }, false],
    ];
    for (const [pose, hit] of cases) {
      expect(boxOverlap(b, stickBox(pose, dims)) > cfg.penetrationTolerance).toBe(hit);
      expect(w.checkPlacement(pose).problem === "COLLISION").toBe(hit);
    }
    expect(tableOverlap(stickBox({ p: [0, 0.3, 0], q: FLAT }, dims), cfg.table)).toBeGreaterThan(0.1);
    expect(tableOverlap(stickBox({ p: [0, 0.505, 0], q: FLAT }, dims), cfg.table)).toBeLessThanOrEqual(0);
  });
});

describe("same-tick placements", () => {
  it("a stick accepted before the next physics step still blocks an overlapping one", () => {
    const w = PhysicsWorld.create(cfg);
    const pose: Pose = { p: [2, 0.505, 2], q: FLAT };
    expect(w.checkPlacement(pose).problem).toBe(null);
    w.addStick({ id: "first", authorId: "u", createdBy: "c1", seed: 1, placedAt: 0 }, pose);
    // no w.step() in between: two submissions ordered within one tick
    expect(w.checkPlacement(pose).problem).toBe("COLLISION");
    w.free();
  });
});
