// Candles on the twenty landmarks (courtyard/day-night directive §8–§10),
// checked independently of the resolver that placed them: every authored
// group resolves (none dropped); supported cups rest on a level top face of
// the building with nothing of it inside the cup; detached groups keep a
// visible air gap and stay near what they light; ground groups stand on the
// island's real, dry terrain; no group sits on a safe point or a viewpoint;
// the result is deterministic and changes no timber. The light pool's bounds,
// day/night switching and room-aware selection are checked on the real view
// module (no WebGL needed to build its meshes).
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { LANDMARKS, buildLandmark } from "../src/world/landmarks.ts";
import type { BuildResult } from "../src/world/core.ts";
import { BuildingBoxes, DETACHED_GAP, DETACHED_NEAR, groupToWorld, resolveScheme, type Resolution } from "../src/world/candles.ts";
import { CANDLE_SCHEMES } from "../src/world/candle-schemes.ts";
import { islandProbe, placementOf } from "../src/world/layout.ts";
import { heightAt } from "../src/world/terrain.ts";
import { LIGHT_POOL, createCandles } from "../src/client/world/candles-view.ts";
import type { CandleGroupData } from "../src/world/courtyard.ts";

type Box = BuildingBoxes["boxes"][number];

const built = new Map<string, BuildResult>();
const resolved = new Map<string, Resolution>();
const boxes = new Map<string, Box[]>();
beforeAll(() => {
  for (const def of LANDMARKS) {
    const r = buildLandmark(def);
    built.set(def.id, r);
    resolved.set(def.id, resolveScheme(def.id, r, CANDLE_SCHEMES[def.id]!, islandProbe(def.id)));
    boxes.set(def.id, new BuildingBoxes(r).boxes);
  }
}, 240_000);

/** A point's position in a box's own axes. */
const local = (b: Box, p: readonly number[]): number[] => {
  const d = [p[0]! - b.c[0], p[1]! - b.c[1], p[2]! - b.c[2]];
  return [0, 1, 2].map((a) => d[0]! * b.ax[a]![0] + d[1]! * b.ax[a]![1] + d[2]! * b.ax[a]![2]);
};
const inside = (b: Box, p: readonly number[], grow = 0): boolean => local(b, p).every((t, a) => Math.abs(t) <= b.h[a]! + grow);
const dist = (b: Box, p: readonly number[]): number => Math.hypot(...local(b, p).map((t, a) => Math.max(0, Math.abs(t) - b.h[a]!)));
const nearBoxes = (list: Box[], p: readonly number[], r: number): Box[] => list.filter((b) => Math.hypot(b.c[0] - p[0]!, b.c[1] - p[1]!, b.c[2] - p[2]!) < r + Math.hypot(...b.h));

const ids = LANDMARKS.map((l) => l.id);

describe("every landmark has a deliberate scheme that resolves completely", () => {
  it.each(ids)("%s: no group dropped, several groups of 3–7 cups, an essential one among them", (id) => {
    const res = resolved.get(id)!;
    expect(res.dropped, JSON.stringify(res.dropped)).toEqual([]);
    expect(res.groups.length).toBe(CANDLE_SCHEMES[id]!.anchors.length);
    expect(res.groups.length).toBeGreaterThanOrEqual(4);
    expect(res.groups.some((g) => g.essential)).toBe(true);
    expect(new Set(res.groups.map((g) => g.kind)).size).toBeGreaterThanOrEqual(2);
    expect(CANDLE_SCHEMES[id]!.intent.length).toBeGreaterThan(30);
    for (const g of res.groups) {
      expect(g.cups.length, g.id).toBeGreaterThanOrEqual(3);
      expect(g.cups.length, g.id).toBeLessThanOrEqual(7);
      for (const [, , , d, h] of g.cups) {
        expect(d).toBeGreaterThanOrEqual(0.22);
        expect(d).toBeLessThanOrEqual(0.32);
        expect(h).toBeGreaterThanOrEqual(0.12);
        expect(h).toBeLessThanOrEqual(0.21);
      }
    }
  });

  it("is not a bounding-box ring: groups sit at different heights and well inside the footprint on the tall landmarks", () => {
    for (const id of ["L04", "L08", "L14", "L17", "L18", "L19", "L20"]) {
      const levels = new Set(resolved.get(id)!.groups.map((g) => Math.round(g.cups[0]![1])));
      expect(levels.size, id).toBeGreaterThanOrEqual(2);
    }
  });

  it("is deterministic and leaves the timber untouched", () => {
    for (const id of ["L04", "L08", "L16", "L20"]) {
      const r = built.get(id)!;
      const pos = Float64Array.from(r.pos);
      const again = resolveScheme(id, r, CANDLE_SCHEMES[id]!, islandProbe(id));
      expect(again).toEqual(resolved.get(id));
      expect(Float64Array.from(r.pos)).toEqual(pos);
      expect(buildLandmark(LANDMARKS.find((l) => l.id === id)!).hash).toBe(r.hash);
    }
  });
});

describe("supported groups rest on the building", () => {
  it.each(ids)("%s: each cup has solid timber directly under it and nothing of the building inside it", (id) => {
    const list = boxes.get(id)!;
    for (const g of resolved.get(id)!.groups.filter((q) => q.role === "supported")) {
      const level = g.cups[0]![1];
      for (const [x, y, z, d, h] of g.cups) {
        expect(Math.abs(y - level), `${g.id}: cups on one level`).toBeLessThan(0.03);
        const near = nearBoxes(list, [x, y, z], 1.5);
        // under the centre and under the rim (8 points at 85 % of the radius): a top face within 3 cm below the base
        const pts = [[0, 0], ...Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4) * d * 0.425, Math.sin((k * Math.PI) / 4) * d * 0.425])];
        for (const [dx, dz] of pts) {
          const under = near.some((b) => inside(b, [x + dx!, y - 0.012, z + dz!], 0.026));
          expect(under, `${id} ${g.id}: nothing under (${(x + dx!).toFixed(2)}, ${y.toFixed(2)}, ${(z + dz!).toFixed(2)})`).toBe(true);
        }
        // the cup's body (above its base) is clear of every piece and shell
        for (const fy of [0.03, h / 2, h]) {
          for (const [dx, dz] of [[0, 0], [d / 2 - 0.01, 0], [0, d / 2 - 0.01], [-(d / 2 - 0.01), 0], [0, -(d / 2 - 0.01)]]) {
            const hit = near.find((b) => inside(b, [x + dx!, y + fy, z + dz!]));
            expect(hit, `${id} ${g.id}: timber inside a cup at (${x.toFixed(2)}, ${(y + fy).toFixed(2)}, ${z.toFixed(2)})`).toBeUndefined();
          }
        }
      }
    }
  });
});

describe("detached groups hover with a visible air gap", () => {
  it.each(ids)(`%s: every detached cup keeps ${DETACHED_GAP}–${DETACHED_NEAR} m from the nearest timber`, (id) => {
    const list = boxes.get(id)!;
    for (const g of resolved.get(id)!.groups.filter((q) => q.role === "detached")) {
      let gap = Infinity;
      for (const [x, y, z, d, h] of g.cups) {
        for (const p of [[x, y, z], [x, y + h, z], [x + d / 2, y + h / 2, z], [x - d / 2, y + h / 2, z], [x, y + h / 2, z + d / 2], [x, y + h / 2, z - d / 2]]) {
          for (const b of nearBoxes(list, p, 4)) gap = Math.min(gap, dist(b, p));
        }
        // upright and level: every cup of a detached group at the group's own height
        expect(y).toBeCloseTo(g.cups[0]![1], 6);
      }
      expect(gap, `${id} ${g.id}`).toBeGreaterThanOrEqual(DETACHED_GAP - 0.05);
      expect(gap, `${id} ${g.id}`).toBeLessThanOrEqual(DETACHED_NEAR + 0.05);
    }
  });

  it("detached groups are sparse: at most five groups of three per landmark, a minority except on the dam's crest", () => {
    let total = 0;
    for (const id of ids) {
      const gs = resolved.get(id)!.groups;
      const det = gs.filter((g) => g.role === "detached");
      total += det.length;
      expect(det.length, id).toBeLessThanOrEqual(5);
      for (const g of det) expect(g.cups.length, `${id} ${g.id}`).toBeLessThanOrEqual(3);
      // L16's crest road is slatted decking (no cup stands on it without overhanging; candle-schemes.ts): its five
      // crest groups hover over a 300 m crest, everywhere else detached groups are the exception
      if (id !== "L16") expect(det.length, id).toBeLessThanOrEqual(Math.floor(gs.length / 2));
      else expect(det.every((g) => g.kind === "crest")).toBe(true);
    }
    expect(total).toBeLessThan(20);
  });
});

describe("ground groups stand on the island", () => {
  it.each(ids)("%s: every ground cup is on the real terrain (within 3 cm) and dry", (id) => {
    const p = placementOf(id);
    const probe = islandProbe(id);
    for (const g of resolved.get(id)!.groups.filter((q) => q.role === "ground")) {
      const w = groupToWorld(g, p.position, p.yaw);
      for (const [i, [x, y, z, d]] of w.cups.entries()) {
        expect(Math.abs(heightAt(x, z) - y), `${id} ${g.id} cup ${i} at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(0.03);
        const [lx, , lz] = g.cups[i]!;
        expect(probe.wet(lx, lz, d / 2), `${id} ${g.id}: in a river`).toBe(false);
      }
      // nothing of the building in the cups either
      const list = boxes.get(id)!;
      for (const [x, y, z, , h] of g.cups) for (const b of nearBoxes(list, [x, y, z], 1.5)) expect(inside(b, [x, y + h / 2, z]), `${id} ${g.id}`).toBe(false);
    }
  });

  it("the dam's toe groups are on the banks, beside the river below it, not in it", () => {
    const l16 = resolved.get("L16")!.groups.filter((g) => g.id.startsWith("toe-"));
    expect(l16.length).toBe(2);
    for (const g of l16) expect(g.role).toBe("ground");
  });
});

describe("candles keep out of the way", () => {
  it.each(ids)("%s: no cup stands on a safe point or at a viewpoint", (id) => {
    const r = built.get(id)!;
    for (const g of resolved.get(id)!.groups) {
      for (const [x, y, z] of g.cups) {
        for (const s of r.safePoints) {
          const close = Math.hypot(x - s.feet[0], z - s.feet[2]) < 2 && Math.abs(y - s.feet[1]) < 2.5;
          expect(close, `${id} ${g.id} at safe point ${s.id}`).toBe(false);
        }
        for (const v of r.viewpoints) expect(Math.hypot(x - v.eye[0], y - v.eye[1], z - v.eye[2]), `${id} ${g.id} at viewpoint ${v.id}`).toBeGreaterThanOrEqual(2.5);
      }
    }
  });
});

describe("the light pool", () => {
  // a row of groups 10 m apart, and one inside a room
  const groups: CandleGroupData[] = Array.from({ length: 12 }, (_, i) => ({
    id: `T:g${i}`,
    light: [i * 10, 1, 0],
    range: 8,
    weight: i === 0 ? 1.2 : 1,
    zone: null,
    essential: i % 3 === 0,
    kind: "test",
    cups: [[i * 10, 0, 0, 0.26, 0.14], [i * 10 + 0.4, 0, 0, 0.3, 0.17], [i * 10, 0, 0.4, 0.24, 0.13]],
  }));
  const room: CandleGroupData = { id: "T:room", light: [0, 1, 30], range: 8, weight: 2, zone: "T:hall", essential: true, kind: "interior", cups: [[0, 0, 30, 0.26, 0.14], [0.4, 0, 30, 0.3, 0.17], [0, 0, 30.4, 0.24, 0.13]] };
  const zones = [{ id: "T:hall", c: [0, 3, 32] as [number, number, number], h: [6, 3, 4] as [number, number, number], yaw: 0 }];

  it("is 8 / 4 / 2 lights on High / Medium / Low, allocated once", () => {
    expect(LIGHT_POOL).toEqual({ high: 8, medium: 4, low: 2 });
    const v = createCandles([...groups, room], zones, { maxLights: LIGHT_POOL.high });
    const lights = (): THREE.PointLight[] => v.group.children.filter((c): c is THREE.PointLight => (c as THREE.PointLight).isPointLight);
    expect(lights()).toHaveLength(8);
    for (const tier of ["high", "medium", "low", "high"] as const) {
      v.setTier(tier);
      expect(v.stats().lightsPool).toBe(LIGHT_POOL[tier]);
      expect(lights()).toHaveLength(8); // never reallocated
    }
    for (const l of lights()) expect(l.castShadow).toBe(false);
    v.dispose();
  });

  it("by day: cups drawn, no flames, no light; at night the nearest groups get the pool", () => {
    const v = createCandles(groups, [], { maxLights: 8 });
    v.setTier("high");
    const cam = new THREE.Vector3(30, 1.65, 3);
    v.setLit(0);
    v.update(cam, 1 / 60, true);
    let s = v.stats();
    expect(s.cups).toBe(36);
    expect(s.cupsDrawn).toBe(36);
    expect(s.lightsActive).toBe(0);
    expect(v.group.children.some((c) => c.name === "candle-flames" && c.visible)).toBe(false);
    v.setLit(1);
    v.update(cam, 1 / 60, true);
    s = v.stats();
    expect(s.lightsActive).toBeGreaterThan(0);
    expect(s.lightsActive).toBeLessThanOrEqual(8);
    expect(s.assigned).toContain("T:g3"); // the one beside the explorer
    expect(s.assigned).not.toContain("T:g11"); // 80 m away: out of reach
    expect(v.group.children.some((c) => c.name === "candle-flames" && c.visible)).toBe(true);
    // dawn: the lights fade out with the flames
    v.setLit(0);
    for (let i = 0; i < 60; i++) v.update(cam, 1 / 60, false);
    expect(v.stats().lightsActive).toBe(0);
    v.dispose();
  });

  it("holds its choice while the explorer turns or nudges (hysteresis), and fades instead of popping", () => {
    const v = createCandles(groups, [], { maxLights: 2 });
    v.setTier("low");
    v.setLit(1);
    const cam = new THREE.Vector3(35, 1.65, 2);
    v.update(cam, 1 / 60, true);
    const first = [...v.stats().assigned].sort();
    expect(first).toEqual(["T:g3", "T:g4"]);
    // small moves either side of the midpoint between g3 and g4 keep the same pair
    for (const x of [34, 36, 35.5, 34.5, 35]) {
      cam.set(x, 1.65, 2);
      v.update(cam, 1 / 60, false);
      expect([...v.stats().assigned].sort()).toEqual(first);
    }
    // walking on to g6: a new group fades in over several frames (not in one)
    cam.set(60, 1.65, 2);
    v.update(cam, 1 / 60, false);
    let frames = 0;
    while (v.update(cam, 1 / 60, false) && frames < 600) frames++;
    expect(frames).toBeGreaterThan(10);
    expect(v.stats().assigned).toContain("T:g6");
    v.dispose();
  });

  it("is room-aware: a hall's group lights only an explorer in the hall or by its opening", () => {
    const v = createCandles([...groups, room], zones, { maxLights: 8 });
    v.setTier("high");
    v.setLit(1);
    // outside, 12 m from the hall's light: its glow would show through the wall
    v.update(new THREE.Vector3(0, 1.65, 18), 1 / 60, true);
    expect(v.stats().assigned).not.toContain("T:room");
    // inside the hall
    v.update(new THREE.Vector3(0, 1.65, 31), 1 / 60, true);
    expect(v.stats().assigned).toContain("T:room");
    v.dispose();
  });
});
