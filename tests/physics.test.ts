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

describe("table rim contact (config v2, M-005)", () => {
  const rimCase = (w: PhysicsWorld): void => {
    // a stick lying across the curved rim with a second one resting across it
    place(w, { p: [-4.5, 0.505, 16.1], q: quatFromYawPitchRoll(-0.1, 0, 0) });
    place(w, { p: [-4.5, 1.51, 14], q: quatFromYawPitchRoll(Math.PI / 2, 0, 0) });
  };

  it("a stick resting only on the rim ring counts as table-supported", () => {
    const w = PhysicsWorld.create(cfg);
    const id = place(w, { p: [17, 4.005, 0], q: VERTICAL }); // stands on the ring (r 16.5–18)
    run(w, 600);
    expect(w.supportedFromTable().has(id)).toBe(true);
    expect(w.supportedHeight()).toBeCloseTo(8, 1);
    w.free();
  });

  it("a loaded stick across the rim settles instead of creeping", () => {
    const w = PhysicsWorld.create(cfg);
    expect(cfg.tableRim?.segments).toBe(128);
    rimCase(w);
    let quiet = 0;
    let stableAt = -1;
    for (let t = 0; t < 900 && stableAt < 0; t++) {
      w.step();
      quiet = w.isQuiet() ? quiet + 1 : 0;
      if (quiet >= 90) stableAt = t;
    }
    expect(stableAt).toBeGreaterThan(0);
    expect(stableAt).toBeLessThan(400);
    w.free();
  });

  it("works created under v1 keep their own (cylinder) table", async () => {
    const { PHYSICS_CONFIGS } = await import("../src/shared/config.ts");
    const v1 = PHYSICS_CONFIGS[1]!;
    expect(v1.tableRim).toBe(null);
    const w = PhysicsWorld.create(v1);
    place(w, { p: [0, 0.505, 0], q: FLAT });
    const copy = PhysicsWorld.restore(v1, w.snapshot(), w.envelope());
    run(copy, 300);
    expect(copy.pose(`s${n}`)!.p[1]).toBeCloseTo(0.5, 1);
    w.free();
    copy.free();
  });
});

describe("table core: resting near the edge on a diagonal (config v3, Crit 9 follow-up)", () => {
  // Positions Rapier's cylinder supports only at one point (outside |x|+|z| <= 16.5): under v2
  // a stick resting there sank ~0.28 u and vibrated at ~1 u/s forever, so the room never settled.
  const diagonal: [number, number][] = [
    [45, 13], [45, 14], [45, 15], [33.75, 14], [33.75, 15], [22.5, 15], [135, 14], [225, 13], [315, 15],
  ];
  const restAt = (c: typeof cfg, deg: number, r: number) => {
    const w = PhysicsWorld.create(c);
    const a = (deg * Math.PI) / 180;
    // long axis tangential (rotation about +Y by -(a + 90°)), so the whole stick stays at about radius r
    const yaw = -(a + Math.PI / 2);
    const id = place(w, { p: [r * Math.cos(a), 0.505, r * Math.sin(a)], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] });
    let quiet = 0;
    let stableAt = -1;
    let minY = Infinity;
    for (let t = 0; t < 900 && stableAt < 0; t++) {
      w.step();
      minY = Math.min(minY, w.pose(id)!.p[1]);
      quiet = w.isQuiet() ? quiet + 1 : 0;
      if (quiet >= 90) stableAt = t;
    }
    const y = w.pose(id)!.p[1];
    w.free();
    return { stableAt, y, minY };
  };

  it("new works use the square core plus a ring that overlaps its notches", () => {
    expect(cfg.physicsConfigVersion).toBe(3);
    expect(cfg.tableCore).toEqual({ squares: 8, radius: 16.5 });
    expect(cfg.tableRim).toEqual({ innerRadius: 14.5, segments: 128 });
    const w = PhysicsWorld.create(cfg);
    expect(w.tableColliders()).toHaveLength(9); // 8 squares + the ring
    w.free();
  });

  it("supports exactly the rendered tabletop: no holes inside the 128-gon, nothing beyond it", async () => {
    const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
    const w = PhysicsWorld.create(cfg);
    w.world.step();
    const apothem = 18 * Math.cos(Math.PI / 128);
    let holes = 0;
    let overhang = 0;
    // the outer band, where the squares' notches (r 15.09–16.5) and the visible edge are
    for (let deg = 0; deg < 360; deg += 0.25) {
      for (let r = 14; r <= 18.3; r += 0.05) {
        const a = (deg * Math.PI) / 180;
        const x = r * Math.cos(a);
        const z = r * Math.sin(a);
        const k = Math.floor(((a + 2 * Math.PI) % (2 * Math.PI)) / ((2 * Math.PI) / 128));
        const mid = (k + 0.5) * ((2 * Math.PI) / 128);
        const d = apothem - (x * Math.cos(mid) + z * Math.sin(mid));
        const hit = w.world.castRay(new RAPIER.Ray({ x, y: 0.5, z }, { x: 0, y: -1, z: 0 }), 0.6, true);
        if (d > 0.01 && !(hit && Math.abs(hit.timeOfImpact - 0.5) < 1e-3)) holes++;
        if (d < -0.01 && hit) overhang++;
      }
    }
    w.free();
    expect(holes).toBe(0);
    expect(overhang).toBe(0);
  });

  it.each(diagonal)("a stick resting at %s° r=%s never sinks into the table and settles", (deg, r) => {
    const { stableAt, y, minY } = restAt(cfg, deg, r);
    expect(minY).toBeGreaterThan(0.49);
    expect(stableAt).toBeGreaterThan(0);
    expect(stableAt).toBeLessThan(200);
    expect(y).toBeCloseTo(0.5, 2);
  });

  // between two square corners (5.625° off a corner), where only the ring holds a stick up
  it.each([[5.625, 15.6], [5.625, 16.1], [50.625, 15.8], [196.875, 16.0]])("a stick resting in a notch at %s° r=%s settles on the surface", (deg, r) => {
    const { stableAt, minY } = restAt(cfg, deg, r);
    expect(minY).toBeGreaterThan(0.49);
    expect(stableAt).toBeGreaterThan(0);
    expect(stableAt).toBeLessThan(200);
  });

  it("a stick standing on end in a notch stays standing", () => {
    const w = PhysicsWorld.create(cfg);
    const a = (5.625 * Math.PI) / 180;
    const id = place(w, { p: [15.8 * Math.cos(a), 4.005, 15.8 * Math.sin(a)], q: VERTICAL });
    run(w, 300);
    expect(w.pose(id)!.p[1]).toBeCloseTo(4, 1);
    expect(upness(w, id)).toBeGreaterThan(0.99);
    w.free();
  });

  it("a stick crossing the core/ring seam radially settles flat", () => {
    const w = PhysicsWorld.create(cfg);
    const a = (33.75 * Math.PI) / 180;
    const yaw = -a; // long axis radial
    const id = place(w, { p: [14.5 * Math.cos(a), 0.505, 14.5 * Math.sin(a)], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] });
    run(w, 300);
    expect(w.pose(id)!.p[1]).toBeCloseTo(0.5, 2);
    expect(w.isQuiet()).toBe(true);
    w.free();
  });

  it("sticks beyond the supported edge still fall", () => {
    const w = PhysicsWorld.create(cfg);
    const off = place(w, { p: [20, 0.505, 0], q: FLAT }); // wholly past the edge (x 16–24 on the axis is partly over it; see next)
    const yaw = -Math.PI / 4;
    const tip = place(w, { p: [22 * Math.SQRT1_2, 0.505, 22 * Math.SQRT1_2], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] }); // radial, centre of mass 4 u past the edge
    const clear = place(w, { p: [0, 0.505, 23], q: FLAT }); // tangential at r 23: nothing under it
    run(w, 240);
    expect(w.pose(off)!.p[1]).toBeLessThan(-1);
    expect(w.pose(tip)!.p[1]).toBeLessThan(-1);
    expect(w.pose(clear)!.p[1]).toBeLessThan(-1);
    w.free();
  });

  it("works created under v2 keep their cylinder, and with it the original sinking (no retroactive change)", async () => {
    const { PHYSICS_CONFIGS } = await import("../src/shared/config.ts");
    const v2 = PHYSICS_CONFIGS[2]!;
    expect(v2.tableCore ?? null).toBe(null);
    const { stableAt, minY } = restAt(v2, 45, 13); // deterministic: the engine is
    expect(minY).toBeLessThan(0.35);
    expect(stableAt).toBe(-1);
  });
});

