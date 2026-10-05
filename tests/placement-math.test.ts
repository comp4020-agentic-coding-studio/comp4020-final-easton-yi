// PLACE-02..08 maths, independent of the renderer.
import { describe, expect, it } from "vitest";
import { currentPhysicsConfig, INPUT } from "../src/shared/config.ts";
import { axes, length, stickBox, sub, quatFromYawPitchRoll, yawPitchRollFromQuat } from "../src/shared/geometry.ts";
import {
  beginCenterDrag,
  centerDrag,
  draftEnds,
  draftPose,
  endpointPitch,
  endpointYaw,
  presetHorizontal,
  presetVertical,
  reorient,
  snapAngle,
  snapDown,
  spawnDraft,
  validate,
  YAW_TARGETS,
  type Draft,
  type Obstacle,
} from "../src/client/placement-math.ts";

const cfg = currentPhysicsConfig();
const L = cfg.stick.length;
const dims = cfg.stick;
const table = cfg.table;
const close = (a: number[], b: number[], d = 6): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, d));
const flat = (x: number, y: number, z: number, yaw = 0): Draft => ({ center: [x, y, z], yaw, pitch: 0, roll: 0 });
const obstacle = (id: string, d: Draft): Obstacle => ({ id, box: stickBox(draftPose(d), dims) });

describe("endpoints keep the opposite end and the length fixed", () => {
  it.each(["A", "B"] as const)("dragging end %s around", (which) => {
    let d = flat(1, 3, -2, 0.3);
    const fixedBefore = draftEnds(d, L)[which === "A" ? "B" : "A"];
    for (const [x, z] of [[10, 4], [-6, 9], [0, -12], [7, -7]]) {
      const y = draftEnds(d, L)[which][1];
      // a ray straight down through (x, ?, z)
      d = endpointYaw(d, L, which, { origin: [x, y + 20, z], dir: [0, -1, 0] });
      const ends = draftEnds(d, L);
      close(ends[which === "A" ? "B" : "A"], fixedBefore);
      expect(length(sub(ends.B, ends.A))).toBeCloseTo(L, 6);
      // the moved end points at the pointer's azimuth
      const m = ends[which];
      const az = Math.atan2(m[2] - fixedBefore[2], m[0] - fixedBefore[0]);
      expect(Math.cos(az - Math.atan2(z - fixedBefore[2], x - fixedBefore[0]))).toBeCloseTo(1, 6);
    }
  });

  it("pitching an end about the other keeps the pivot and clamps at vertical", () => {
    const d = flat(0, 5, 0, 0.7);
    const A = draftEnds(d, L).A;
    const up = endpointPitch(d, L, "B", -60); // drag up 60 px
    close(draftEnds(up, L).A, A);
    expect(draftEnds(up, L).B[1]).toBeGreaterThan(5);
    const vertical = endpointPitch(d, L, "B", -10_000);
    expect(vertical.pitch).toBeCloseTo(Math.PI / 2, 9);
    close(draftEnds(vertical, L).A, A);
    expect(vertical.yaw).toBe(0.7); // last valid yaw is retained
  });

  it("raising end A lowers the stick's pitch and keeps B fixed", () => {
    const d = flat(0, 5, 0);
    const B = draftEnds(d, L).B;
    const up = endpointPitch(d, L, "A", -60);
    close(draftEnds(up, L).B, B);
    expect(draftEnds(up, L).A[1]).toBeGreaterThan(5);
  });
});

describe("near vertical", () => {
  it("yaw stays stable through a vertical stick (no pole jump)", () => {
    const v: Draft = { center: [0, 4, 0], yaw: 1.1, pitch: Math.PI / 2, roll: 0 };
    const q = draftPose(v).q;
    expect(axes(q)[0][1]).toBeCloseTo(1, 9);
    expect(yawPitchRollFromQuat(q, 1.1).yaw).toBe(1.1);
    // tiny pitch changes either side produce tiny pose changes
    const a = draftPose({ ...v, pitch: Math.PI / 2 - 1e-4 }).q;
    const b = draftPose(v).q;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3])).toBeLessThan(1e-3);
  });

  it("quaternions round-trip for ordinary and rolled orientations", () => {
    for (const [y, p, r] of [[0.4, 0.2, 0], [-2, -0.5, 0.7], [3, 1.2, -1]]) {
      const back = yawPitchRollFromQuat(quatFromYawPitchRoll(y!, p!, r!));
      expect(Math.cos(back.yaw - y!)).toBeCloseTo(1, 6);
      expect(back.pitch).toBeCloseTo(p!, 6);
      expect(Math.cos(back.roll - r!)).toBeCloseTo(1, 6);
    }
  });
});

describe("presets", () => {
  it("vertical about end A stands the stick on A; horizontal about the centre keeps the centre", () => {
    const d = flat(2, 3, 1, 0.5);
    const A = draftEnds(d, L).A;
    const v = presetVertical(d, L, "A");
    close(draftEnds(v, L).A, A);
    expect(draftEnds(v, L).B[1]).toBeCloseTo(A[1] + L, 9);
    const h = presetHorizontal(v, L, "center");
    close(h.center, v.center);
    expect(h.pitch).toBe(0);
  });

  it("reorient about the centre never moves the centre", () => {
    const d = flat(2, 3, 1, 0.5);
    close(reorient(d, L, "center", 2, 0.4).center, d.center);
  });
});

describe("center drag", () => {
  const basis = { unitsPerPixel: 0.05, right: [1, 0, 0] as [number, number, number], forward: [0, 0, -1] as [number, number, number] };
  it("keeps the grab offset so the stick doesn't jump to the pointer", () => {
    const d = flat(0, 2, 0);
    const ray0 = { origin: [3, 22, 0] as [number, number, number], dir: [0, -1, 0] as [number, number, number] };
    const s = beginCenterDrag(d, ray0, [100, 100]);
    const same = centerDrag(s, d, ray0, [100, 100], basis);
    close(same.draft.center, d.center);
    const moved = centerDrag(s, d, { origin: [5, 22, 1], dir: [0, -1, 0] }, [120, 110], basis);
    close(moved.draft.center, [2, 2, 1]);
    expect(moved.draft.yaw).toBe(d.yaw);
  });

  it("falls back to bounded screen increments when the ray is nearly parallel", () => {
    const d = flat(0, 2, 0);
    const grazing = { origin: [0, 2.2, 40] as [number, number, number], dir: [0, -0.01, -1] as [number, number, number] };
    const s = beginCenterDrag(d, grazing, [100, 100]);
    expect(s.fallback).toBe(true);
    const r = centerDrag(s, d, grazing, [104, 100], basis);
    expect(r.fallback).toBe(true);
    close(r.draft.center, [0.2, 2, 0]); // 4 px × 0.05
    // a huge flick is clamped per event
    const big = centerDrag(s, r.draft, grazing, [5000, 100], basis);
    expect(Math.hypot(big.draft.center[0] - 0.2, big.draft.center[2])).toBeCloseTo(INPUT.parallelMaxStep, 6);
  });
});

describe("snapping", () => {
  it("acquires at 3°, holds until 5°", () => {
    const deg = Math.PI / 180;
    const a = snapAngle(2.5 * deg, YAW_TARGETS, null);
    expect(a.angle).toBe(0);
    const held = snapAngle(4.5 * deg, YAW_TARGETS, a.active);
    expect(held.angle).toBe(0);
    const released = snapAngle(5.5 * deg, YAW_TARGETS, held.active);
    expect(released.active).toBe(null);
    expect(released.angle).toBeCloseTo(5.5 * deg, 9);
  });

  it("snap to support moves only down, stops at first contact with the gap, and respects the limit", () => {
    const base = obstacle("base", flat(0, 0.505, 0));
    const above = flat(0, 1.505 + 0.15, 0);
    const r = snapDown(above, dims, [base], table, cfg.penetrationTolerance, cfg.placementGap)!;
    expect(r.draft.center[1]).toBeCloseTo(1.505 + 0.005, 3);
    expect(r.draft.center[0]).toBe(0);
    // too far away: refuses rather than dropping through
    expect(snapDown(flat(0, 3, 0), dims, [base], table, cfg.penetrationTolerance, cfg.placementGap)).toBe(null);
    // a long beam over a support at its far end stops on that support, not the table
    const pillar = obstacle("pillar", { center: [3.5, 4.005, 0], yaw: 0, pitch: Math.PI / 2, roll: 0 });
    const beam = flat(0, 8.005 + 0.5 + 0.1, 0);
    const b = snapDown(beam, dims, [pillar], table, cfg.penetrationTolerance, cfg.placementGap)!;
    expect(b.draft.center[1]).toBeCloseTo(8.005 + 0.5 + 0.005, 3);
  });
});

describe("validity", () => {
  const b = cfg.placementBounds;
  const tol = cfg.penetrationTolerance;
  it("distinguishes ready, unsupported, intersecting and out of bounds", () => {
    const base = obstacle("base", flat(0, 0.505, 0));
    expect(validate(flat(0, 1.51, 0), dims, [base], table, b, tol, false).kind).toBe("ready");
    expect(validate(flat(0, 6, 0), dims, [base], table, b, tol, false).kind).toBe("unsupported");
    // a short drop onto a support is still "ready", and says how far it drops
    const short = validate(flat(0, 1.505 + 0.2, 0), dims, [base], table, b, tol, false);
    expect(short.kind).toBe("ready");
    expect(short.kind === "ready" && short.drop).toBeCloseTo(0.2, 2);
    expect(validate(flat(0, 1.505 + 0.3, 0), dims, [base], table, b, tol, false).kind).toBe("unsupported");
    const hit = validate(flat(0.5, 0.8, 0), dims, [base], table, b, tol, false);
    expect(hit.kind).toBe("intersecting");
    expect(hit.kind === "intersecting" && hit.with).toBe("base");
    expect(validate(flat(30, 2, 0), dims, [base], table, b, tol, false).kind).toBe("out-of-bounds");
    expect(validate(flat(0, 6, 0), dims, [], table, b, tol, true).kind).toBe("capacity");
  });

  it("spawns a legal ghost above an occupied spot instead of inside it", () => {
    const base = obstacle("base", flat(0, 0.505, 0));
    const s = spawnDraft([0, 0, 0], 0, dims, [base], table, cfg.placementGap);
    expect(s.legal).toBe(true);
    expect(validate(s.draft, dims, [base], table, b, tol, false).kind).not.toBe("intersecting");
    expect(s.draft.center[1]).toBeGreaterThan(1.5);
    expect(s.draft.center[1]).toBeLessThan(1.8);
  });
});
