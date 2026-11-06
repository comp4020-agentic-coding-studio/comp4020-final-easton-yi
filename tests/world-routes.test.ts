// Side routes and ridge reveals (brief §4), checked on the generated terrain with the final placements:
// one side route per region that leaves and rejoins the valley route, clear of every footprint and the
// coast, walkable (no long pitch steeper than 30 %) or, for the gorge, a flight line above the ground;
// and three reveals where a landmark is mostly hidden from the valley and then seen whole. Also the dam's river:
// its water in a channel all the way from the stilling basin to the sea.
import { describe, expect, it } from "vitest";
import { REVEALS, SIDE_ROUTES, checkReveal, checkSideRoute, flightHeights, sidePoints } from "../src/world/routes.ts";
import { COAST, REGIONS, heightAt, polygonSdf, riverAt, rivers } from "../src/world/terrain.ts";
import { LANDMARKS, buildLandmark } from "../src/world/landmarks.ts";
import { footprint, placements, toWorld } from "../src/world/layout.ts";

describe("side routes", () => {
  it("there is at least one per region, A to E", () => {
    for (const r of REGIONS.filter((x) => x.id !== "home")) expect(SIDE_ROUTES.some((s) => s.region === r.id), `region ${r.id}`).toBe(true);
  });

  it.each(SIDE_ROUTES.map((r) => [r.id] as const))("%s leaves and rejoins the valley, keeps clear of buildings and the coast, and is walkable or flown", (id) => {
    const r = SIDE_ROUTES.find((x) => x.id === id)!;
    const c = checkSideRoute(r);
    expect(c.problems, c.problems.join("; ")).toEqual([]);
    expect(c.rejoins).toBe(true);
    expect(c.separation).toBeGreaterThanOrEqual(80);
    expect(c.clearance).toBeGreaterThanOrEqual(18);
    expect(c.length).toBeGreaterThanOrEqual(300);
    // the route leaves and rejoins inside its own region's stretch of the valley (D crosses into E at the gorge's far rim)
    const reg = REGIONS.find((x) => x.id === r.region)!;
    expect(r.from).toBeGreaterThanOrEqual(reg.s0);
    expect(r.from).toBeLessThan(reg.s1);
  });

  it("the gorge flight stays at least 12 m above the ground along its whole line", () => {
    const r = SIDE_ROUTES.find((x) => x.mode === "fly")!;
    const pts = sidePoints(r);
    const fh = flightHeights(r);
    expect(fh.length).toBe(pts.length);
    pts.forEach(([x, z], i) => expect(fh[i]! - heightAt(x, z)).toBeGreaterThanOrEqual(12 - 1e-6));
  });
});

describe("ridge and turn reveals", () => {
  it("there are three, each for a different landmark", () => {
    expect(REVEALS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(REVEALS.map((r) => r.landmark)).size).toBe(REVEALS.length);
    for (const r of REVEALS) expect(LANDMARKS.some((l) => l.id === r.landmark)).toBe(true);
  });

  it.each(REVEALS.map((r) => [r.id] as const))("%s: the landmark is mostly hidden from the valley first and then seen whole (terrain occlusion)", (id) => {
    const r = REVEALS.find((x) => x.id === id)!;
    const c = checkReveal(r);
    expect(r.shown).toBeGreaterThan(r.hidden);
    expect(c.hidden, `${r.landmark} ${(c.hidden * 100).toFixed(0)} % visible at ${r.hidden}`).toBeLessThanOrEqual(0.6);
    expect(c.shown, `${r.landmark} ${(c.shown * 100).toFixed(0)} % visible at ${r.shown}`).toBeGreaterThanOrEqual(0.85);
  });
});

describe("the dam's river (§4 downstream channel, §7.4 receiving body)", () => {
  // placements() sets the pads and the rivers
  const ps = placements();
  const r = rivers().find((x) => x.id === "L16-river")!;

  it("starts where L16's channel water ends (with its training walls), below it: water falls over the end sill", () => {
    const l16 = ps.find((p) => p.id === "L16")!;
    const channel = buildLandmark(LANDMARKS.find((l) => l.id === "L16")!).water.find((w) => /channel/.test(w.note))!;
    const end = toWorld(l16, [channel.c[0], channel.c[1], channel.c[2] + channel.hz]);
    expect(Math.hypot(r.points[0]![0] - end[0], r.points[0]![1] - end[2])).toBeLessThan(0.5);
    expect(r.water[0]!).toBeLessThan(end[1]);
    expect(end[1] - r.water[0]!).toBeLessThanOrEqual(1.5);
  });

  it("falls monotonically and meets the sea at sea level beyond the coastline", () => {
    for (let i = 1; i < r.water.length; i++) expect(r.water[i]!).toBeLessThanOrEqual(r.water[i - 1]!);
    expect(r.water[r.water.length - 1]).toBe(0);
    const [x, z] = r.points[r.points.length - 1]!;
    expect(polygonSdf(COAST, x, z), "the mouth is outside the coastline (in the sea)").toBeGreaterThan(0);
  });

  it("its water is always in a channel: the ground under the water is below it and the banks rise above it", () => {
    const samples = (): [number, number, number][] => {
      const out: [number, number, number][] = [];
      for (let i = 0; i + 1 < r.points.length; i++) {
        const [ax, az] = r.points[i]!;
        const [bx, bz] = r.points[i + 1]!;
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 8);
        for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, r.water[i]! + ((r.water[i + 1]! - r.water[i]!) * k) / n]);
      }
      return out;
    };
    let checked = 0;
    for (const [x, z, w] of samples()) {
      if (polygonSdf(COAST, x, z) > -25) continue; // the mouth: sea and cliff foot
      checked++;
      // under the water: ground at or below it (never water standing over grass)
      expect(heightAt(x, z), `bed at (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThanOrEqual(w + 1e-6);
      // either bank, beyond the bed: ground above the water (the river is contained)
      const i = r.points.findIndex((p, k) => k + 1 < r.points.length && Math.hypot(p[0] - x, p[1] - z) + Math.hypot(r.points[k + 1]![0] - x, r.points[k + 1]![1] - z) <= Math.hypot(r.points[k + 1]![0] - p[0], r.points[k + 1]![1] - p[1]) + 0.5);
      const a = r.points[Math.max(0, i)]!;
      const b = r.points[Math.max(0, i) + 1]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / l;
      const nz = (b[0] - a[0]) / l;
      for (const s of [-1, 1]) {
        const off = r.floorHalf + 8;
        expect(heightAt(x + nx * off * s, z + nz * off * s), `bank at (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeGreaterThan(w);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("keeps clear of every other building's footprint and the side routes' ground", () => {
    for (const p of ps.filter((q) => q.id !== "L16")) {
      const q = footprint(p, 0);
      for (const [x, z] of r.points) expect(Math.hypot(x - p.position[0], z - p.position[2]) > 0 && !inside(q, x, z), `${p.id}`).toBe(true);
      // and no footprint corner lies within the river's bed
      for (const [x, z] of q) expect(riverAt(r, x, z).across, `${p.id} corner`).toBeGreaterThan(r.floorHalf + 10);
    }
    for (const sr of SIDE_ROUTES.filter((x) => x.mode !== "fly")) {
      for (const [x, z] of sidePoints(sr)) expect(riverAt(r, x, z).across, `${sr.id} at (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeGreaterThan(r.floorHalf);
    }
  });
});

function inside(q: [number, number][], x: number, z: number): boolean {
  let ins = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, zi] = q[i]!;
    const [xj, zj] = q[j]!;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
