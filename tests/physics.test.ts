// Physics fixtures (PHYS-02..06, HEIGHT-01) run on the actual pinned Rapier
// build: deterministic initial conditions and step counts, observable poses
// and velocities, no mocked engine.
import { beforeAll, describe, expect, it } from "vitest";
import { currentPhysicsConfig } from "../src/shared/config.ts";
import { axes, quatFromYawPitchRoll, type Pose } from "../src/shared/geometry.ts";
import { initPhysics, PhysicsWorld } from "../src/server/core/physics.ts";

const cfg = currentPhysicsConfig();
const g = cfg.placementGap;
const VERTICAL = quatFromYawPitchRoll(0, Math.PI / 2, 0);
const FLAT = quatFromYawPitchRoll(0, 0, 0);
let n = 0;
const place = (w: PhysicsWorld, pose: Pose): string => {
  const id = `s${++n}`;
  w.addStick({ id, authorId: "u", createdBy: `c${n}`, seed: n, placedAt: 0 }, pose);
  return id;
};
const run = (w: PhysicsWorld, steps: number): void => {
  for (let i = 0; i < steps; i++) w.step();
};
const upness = (w: PhysicsWorld, id: string): number => axes(w.pose(id)!.q)[0][1];

beforeAll(() => initPhysics());

describe("isolated pillar", () => {
  it("stands upright on the table without hidden constraints", () => {
    const w = PhysicsWorld.create(cfg);
    const id = place(w, { p: [0, 4 + g, 0], q: VERTICAL });
    run(w, 600);
    expect(upness(w, id)).toBeGreaterThan(0.999);
    expect(w.pose(id)!.p[1]).toBeCloseTo(4, 1);
    expect(w.isQuiet()).toBe(true);
    expect(w.supportedHeight()).toBeCloseTo(8, 1);
    w.free();
  });
});

describe("two pillars and a beam", () => {
  it("settles as a bridge and reports its height", () => {
    const w = PhysicsWorld.create(cfg);
    const a = place(w, { p: [-3, 4 + g, 0], q: VERTICAL });
    const b = place(w, { p: [3, 4 + g, 0], q: VERTICAL });
    const beam = place(w, { p: [0, 8 + 2 * g + 0.5, 0], q: FLAT });
    run(w, 600);
    expect(upness(w, a)).toBeGreaterThan(0.995);
    expect(upness(w, b)).toBeGreaterThan(0.995);
    expect(w.pose(beam)!.p[1]).toBeCloseTo(8.5, 1);
    expect(w.isQuiet()).toBe(true);
    expect(w.supportedFromTable()).toEqual(new Set([a, b, beam]));
    expect(w.supportedHeight()).toBeCloseTo(9, 1);
    w.free();
  });
});

describe("falling", () => {
  it("an unsupported beam descends and lands on the table", () => {
    const w = PhysicsWorld.create(cfg);
    const id = place(w, { p: [0, 20, 0], q: FLAT });
    run(w, 1);
    expect(w.pose(id)!.p[1]).toBeLessThan(20);
    expect(w.isQuiet()).toBe(false);
    expect(w.supportedHeight()).toBe(0); // free fall is excluded from height
    run(w, 400);
    expect(w.pose(id)!.p[1]).toBeCloseTo(0.5, 1);
    w.free();
  });

  it("a high drop from the top of the creation bounds collides instead of tunnelling", () => {
    for (const q of [FLAT, VERTICAL, quatFromYawPitchRoll(0.7, 0.3, 0.2)]) {
      const w = PhysicsWorld.create(cfg);
      const id = place(w, { p: [0, 75, 0], q });
      run(w, 900);
      const p = w.pose(id)!.p;
      expect(p[1]).toBeGreaterThan(0.3); // still on top of the table
      expect(Math.hypot(p[0], p[2])).toBeLessThan(cfg.table.radius);
      w.free();
    }
  });

  it("a falling stick is not frozen in mid-air by sleeping", () => {
    const w = PhysicsWorld.create(cfg);
    const id = place(w, { p: [0, 40, 0], q: FLAT });
    // Zero initial velocity at the apex is the slowest moment.
    run(w, 2);
    expect(w.pose(id)!.p[1]).toBeLessThan(40);
    run(w, 30);
    // 32 steps = 0.533 s of free fall: 40 − ½·30·0.533² ≈ 35.73 (light damping).
    const t = 32 / 60;
    expect(w.pose(id)!.p[1]).toBeCloseTo(40 - 0.5 * 30 * t * t, 0);
    w.free();
  });
});

describe("imbalance and cascades", () => {
  it("a far off-centre beam topples off its pillar while a centred one stays", () => {
    const off = PhysicsWorld.create(cfg);
    place(off, { p: [0, 4 + g, 0], q: VERTICAL });
    const beam = place(off, { p: [3.6, 8 + 2 * g + 0.5, 0], q: FLAT });
    run(off, 600);
    expect(off.pose(beam)!.p[1]).toBeLessThan(6);
    off.free();

    const centred = PhysicsWorld.create(cfg);
    place(centred, { p: [0, 4 + g, 0], q: VERTICAL });
    const beam2 = place(centred, { p: [0, 8 + 2 * g + 0.5, 0], q: FLAT });
    run(centred, 600);
    expect(centred.pose(beam2)!.p[1]).toBeCloseTo(8.5, 1);
    centred.free();
  });

  it("progressive off-centre loading eventually loses support", () => {
    // Same pillar; the beam is placed at increasing offsets. Small offsets
    // hold (the contact patch is under the centre of mass), far ones fall.
    const results: Record<number, boolean> = {};
    for (const dx of [0, 0.3, 2, 3, 3.8]) {
      const w = PhysicsWorld.create(cfg);
      place(w, { p: [0, 4 + g, 0], q: VERTICAL });
      const beam = place(w, { p: [dx, 8 + 2 * g + 0.5, 0], q: FLAT });
      run(w, 600);
      results[dx] = w.pose(beam)!.p[1] > 8;
      w.free();
    }
    expect(results[0]).toBe(true);
    expect(results[0.3]).toBe(true);
    expect(results[3.8]).toBe(false);
  });

  it("pushing one pillar wakes and drops the beam; a separate stick is untouched", () => {
    const w = PhysicsWorld.create(cfg);
    const a = place(w, { p: [-3, 4 + g, 0], q: VERTICAL });
    place(w, { p: [3, 4 + g, 0], q: VERTICAL });
    const beam = place(w, { p: [0, 8 + 2 * g + 0.5, 0], q: FLAT });
    const far = place(w, { p: [0, 0.5 + g, 12], q: FLAT });
    run(w, 600);
    expect(w.allSleeping()).toBe(true);
    const farBefore = w.pose(far)!.p;
    expect(w.applyPush(a, [-3, 7, 0.5], [0, 0, -1])).toBe(true);
    run(w, 600);
    expect(w.pose(beam)!.p[1]).toBeLessThan(8);
    expect(w.pose(far)!.p).toEqual(farBefore);
    w.free();
  });

  it("removing a support with test tools makes what rested on it fall", () => {
    const w = PhysicsWorld.create(cfg);
    const a = place(w, { p: [-3, 4 + g, 0], q: VERTICAL });
    place(w, { p: [3, 4 + g, 0], q: VERTICAL });
    const beam = place(w, { p: [0, 8 + 2 * g + 0.5, 0], q: FLAT });
    run(w, 600);
    expect(w.allSleeping()).toBe(true);
    w.removeStick(a);
    run(w, 600);
    expect(w.pose(beam)!.p[1]).toBeLessThan(8);
    w.free();
  });
});

describe("height counterexamples", () => {
  it("side-by-side sticks lying on the table do not stack into height", () => {
    const w = PhysicsWorld.create(cfg);
    place(w, { p: [0, 0.5 + g, 0], q: FLAT });
    place(w, { p: [0, 0.5 + g, 1 + g], q: FLAT });
    run(w, 300);
    expect(w.supportedHeight()).toBeCloseTo(1, 1);
    w.free();
  });

  it("a stick held up only by side contact against a pillar does not add height", () => {
    const w = PhysicsWorld.create(cfg);
    place(w, { p: [0, 4 + g, 0], q: VERTICAL });
    // Leaning stick: foot on the table, upper end resting on the pillar's side.
    const lean = Math.atan2(7, 3);
    place(w, { p: [-0.5 - 1.6, 3.6, 0], q: quatFromYawPitchRoll(0, lean, 0) });
    run(w, 600);
    expect(w.supportedHeight()).toBeLessThanOrEqual(8.1);
    w.free();
  });

  it("cleanup removes sticks that fall below the retention region", () => {
    const w = PhysicsWorld.create(cfg);
    const id = place(w, { p: [21, 5, 0], q: FLAT }); // beyond the table edge
    let removed: string[] = [];
    for (let i = 0; i < 600 && removed.length === 0; i++) {
      w.step();
      removed = w.cleanup();
    }
    expect(removed).toEqual([id]);
    expect(w.sticks.size).toBe(0);
    w.free();
  });
});

describe("native snapshot restore", () => {
  it("restores moving bodies with velocities and continues identically", () => {
    const w = PhysicsWorld.create(cfg);
    place(w, { p: [-3, 4 + g, 0], q: VERTICAL });
    place(w, { p: [3, 4 + g, 0], q: VERTICAL });
    place(w, { p: [0.4, 14, 0.2], q: quatFromYawPitchRoll(0.3, 0.1, 0) });
    place(w, { p: [8, 0.5 + g, 0], q: FLAT });
    run(w, 25); // the beam is mid-fall
    expect(w.isQuiet()).toBe(false);
    const bytes = w.snapshot();
    const copy = PhysicsWorld.restore(cfg, bytes, w.envelope());
    expect(copy.tick).toBe(w.tick);
    expect(copy.bodies()).toEqual(w.bodies());
    run(w, 240);
    run(copy, 240);
    const a = w.bodies();
    const b = copy.bodies();
    expect(b.map((s) => s.id)).toEqual(a.map((s) => s.id));
    for (let i = 0; i < a.length; i++) {
      for (let k = 0; k < 3; k++) expect(b[i]!.p[k]).toBeCloseTo(a[i]!.p[k]!, 6);
      for (let k = 0; k < 4; k++) expect(b[i]!.q[k]).toBeCloseTo(a[i]!.q[k]!, 6);
      expect(b[i]!.sleeping).toBe(a[i]!.sleeping);
    }
    w.free();
    copy.free();
  });

  it("restores sleeping state", () => {
    const w = PhysicsWorld.create(cfg);
    place(w, { p: [0, 0.5 + g, 0], q: FLAT });
    run(w, 300);
    expect(w.allSleeping()).toBe(true);
    const copy = PhysicsWorld.restore(cfg, w.snapshot(), w.envelope());
    expect(copy.allSleeping()).toBe(true);
    w.free();
    copy.free();
  });
});
