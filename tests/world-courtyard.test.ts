// The home courtyard (courtyard/day-night directive §4–§5): the pond's place
// and size in the spawn's frame, its shallow water over an explicit bed, the
// platform and stepping stones, the routes around it and to every gateway
// (dry, 3 m wide, with clear approaches), the stones' and candles' heights,
// and the white-flower meadow (local, deterministic, off every route).
import { describe, expect, it } from "vitest";
import {
  BANK_START,
  CUP_EDGE_MARGIN,
  CUP_SIZES,
  POND,
  bedAt,
  courtExcludes,
  courtGround,
  courtyard,
  flowerAllowed,
  flowers,
  frameOf,
  inApproach,
  inWater,
  insidePoly,
  polySdf,
  polylineDistance,
  pondOutline,
  pondRho,
  waterlineRho,
  type Courtyard,
  type XZ,
} from "../src/world/courtyard.ts";
import { home } from "../src/world/layout.ts";
import { heightAt } from "../src/world/terrain.ts";

const h = home();
const court: Courtyard = courtyard(h.spawn, h.yaw, h.portals);
const ground = (x: number, z: number): number => courtGround(court, x, z, heightAt(x, z));

describe("the pond", () => {
  it("is centred 14–16 m forward and 4–5 m left of the spawn, about 12 × 8 m", () => {
    const [F, L] = frameOf(court.frame, court.pond.c[0], court.pond.c[1]);
    expect(F).toBeGreaterThanOrEqual(14);
    expect(F).toBeLessThanOrEqual(16);
    expect(L).toBeGreaterThanOrEqual(4);
    expect(L).toBeLessThanOrEqual(5);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < 720; i++) {
      const p = pondOutline(court.pond, (i / 720) * Math.PI * 2);
      const du = (p[0] - court.pond.c[0]) * court.pond.u[0] + (p[1] - court.pond.c[1]) * court.pond.u[1];
      const dv = (p[0] - court.pond.c[0]) * court.pond.v[0] + (p[1] - court.pond.c[1]) * court.pond.v[1];
      minU = Math.min(minU, du); maxU = Math.max(maxU, du);
      minV = Math.min(minV, dv); maxV = Math.max(maxV, dv);
    }
    expect(maxU - minU).toBeGreaterThan(11);
    expect(maxU - minU).toBeLessThan(13.5);
    expect(maxV - minV).toBeGreaterThan(7);
    expect(maxV - minV).toBeLessThan(9);
  });

  it("holds 0.15–0.25 m of water over a visible bed, the surface just below the rim", () => {
    const p = court.pond;
    const depth = p.water - (p.rim - p.depth);
    expect(depth).toBeGreaterThanOrEqual(0.15);
    expect(depth).toBeLessThanOrEqual(0.25);
    expect(p.rim - p.water).toBeGreaterThan(0.01); // the water never stands proud of the bank
    expect(p.rim - p.water).toBeLessThan(0.08);
    // the bed is flat in the middle and rises smoothly to the rim (no step, no hole)
    expect(bedAt(p, 0)).toBeCloseTo(p.rim - p.depth, 9);
    expect(bedAt(p, BANK_START)).toBeCloseTo(p.rim - p.depth, 9);
    expect(bedAt(p, 1)).toBeCloseTo(p.rim, 9);
    let prev = bedAt(p, BANK_START);
    for (let r = BANK_START; r <= 1; r += 0.01) {
      expect(bedAt(p, r)).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = bedAt(p, r);
    }
    expect(bedAt(p, waterlineRho(p))).toBeCloseTo(p.water, 4);
  });

  it("is on the home pad: the terrain is level with its rim all around (the basin is local)", () => {
    for (let i = 0; i < 64; i++) {
      for (const s of [0, 0.5, 1, 1.15]) {
        const [x, z] = s === 0 ? court.pond.c : pondOutline(court.pond, (i / 64) * Math.PI * 2, s);
        expect(Math.abs(heightAt(x, z) - court.pond.rim), `${s} @ ${i}`).toBeLessThan(0.02);
      }
    }
  });

  it("is ground the explorer stands in: the bed inside the outline, the terrain outside, continuous at the rim", () => {
    const p = court.pond;
    for (let i = 0; i < 48; i++) {
      const phi = (i / 48) * Math.PI * 2;
      const [xi, zi] = pondOutline(p, phi, 0.999);
      const [xo, zo] = pondOutline(p, phi, 1.001);
      // just inside and just outside the outline meet (no ledge, no hole), unless a stone sits there
      expect(Math.abs(courtGround(court, xi, zi, p.rim) - courtGround(court, xo, zo, p.rim))).toBeLessThan(0.35);
      expect(courtGround(court, xi, zi, p.rim)).toBeGreaterThanOrEqual(p.rim - 0.01);
    }
    // the deepest bed is under water: the explorer stands in it ankle-deep, not on the surface
    let deep = 0;
    for (let u = -5; u <= 5; u += 0.5) for (let v = -3; v <= 3; v += 0.5) {
      const x = p.c[0] + p.u[0] * u + p.v[0] * v;
      const z = p.c[1] + p.u[1] * u + p.v[1] * v;
      if (inWater(court, x, z)) {
        expect(courtGround(court, x, z, p.rim)).toBeLessThan(p.water);
        deep++;
      }
    }
    expect(deep).toBeGreaterThan(40);
  });
});

describe("platform, stepping stones and candle stones", () => {
  const slab = (kind: string) => court.slabs.filter((s) => s.kind === kind);

  it("has one low central platform about 3–4 m across, its top a little above the water", () => {
    const [pl] = slab("platform");
    expect(pl).toBeDefined();
    const xs = pl!.poly.map((q) => q[0]);
    const zs = pl!.poly.map((q) => q[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    expect(span).toBeGreaterThanOrEqual(3);
    expect(span).toBeLessThanOrEqual(4.2);
    expect(pl!.top - court.pond.water).toBeGreaterThan(0.05);
    expect(pl!.top - court.pond.water).toBeLessThan(0.3);
    const c: XZ = [xs.reduce((a, v) => a + v, 0) / xs.length, zs.reduce((a, v) => a + v, 0) / zs.length];
    expect(pondRho(court.pond, c[0], c[1])).toBeLessThan(0.4);
    expect(ground(c[0], c[1])).toBeCloseTo(pl!.top, 6);
  });

  it("stepping stones lead from the bank to the platform in safe strides, flat and above the water", () => {
    const steps = slab("step");
    expect(steps.length).toBeGreaterThanOrEqual(2);
    const centre = (poly: readonly XZ[]): XZ => [poly.reduce((a, q) => a + q[0], 0) / poly.length, poly.reduce((a, q) => a + q[1], 0) / poly.length];
    const chain: XZ[] = [];
    // start from the bank (just outside the waterline) along the line to the first stone
    const first = centre(steps[0]!.poly);
    chain.push(first);
    for (const s of steps.slice(1)) chain.push(centre(s.poly));
    for (const s of steps) {
      expect(s.top).toBeGreaterThan(court.pond.water);
      expect(s.top - court.pond.water).toBeLessThan(0.15);
    }
    // edge-to-edge gaps of an easy stride (under 0.8 m): bank → first stone → … → platform
    const gap = (a: readonly XZ[], b: readonly XZ[]): number => Math.max(0, Math.min(...a.map(([x, z]) => polySdf(b, x, z)), ...b.map(([x, z]) => polySdf(a, x, z))));
    for (let i = 1; i < steps.length; i++) expect(gap(steps[i - 1]!.poly, steps[i]!.poly), `step ${i} → ${i + 1}`).toBeLessThan(0.8);
    const pl = slab("platform")[0]!;
    expect(gap(steps[steps.length - 1]!.poly, pl.poly), "last step → platform").toBeLessThan(0.8);
    let toBank = Infinity;
    for (let i = 0; i < 720; i++) {
      const b = pondOutline(court.pond, (i / 720) * Math.PI * 2, waterlineRho(court.pond));
      toBank = Math.min(toBank, polySdf(steps[0]!.poly, b[0], b[1]));
    }
    expect(toBank, "dry bank → first step").toBeLessThan(0.8);
    void first;
  });

  it("no slab or stone is tall: nothing stands more than 0.35 m above the rim (the lettering and skyline stay open)", () => {
    for (const s of court.slabs) expect(s.top - court.pond.rim, s.id).toBeLessThan(0.35);
    for (const e of [...court.edges, ...court.meadowRocks]) expect(e.base + e.h - court.pond.rim, e.id).toBeLessThan(0.35);
  });
});

describe("routes and approaches", () => {
  it("keeps a 3 m primary route from the spawn around the pond to every gateway", () => {
    const ids = court.routes.map((r) => r.id).sort();
    expect(ids).toEqual(["ring", "spawn", "to-explore", "to-together", "to-works"]);
    for (const r of court.routes) expect(r.width, r.id).toBeGreaterThanOrEqual(3);
    // the spawn route starts at the spawn; each branch ends at its gateway's approach
    const s = court.routes.find((r) => r.id === "spawn")!;
    expect(Math.hypot(s.points[0]![0] - h.spawn[0], s.points[0]![1] - h.spawn[2])).toBeLessThan(0.01);
    for (const a of court.approaches) {
      const r = court.routes.find((q) => q.id === `to-${a.id}`)!;
      const end = r.points[r.points.length - 1]!;
      expect(inApproach(a, end[0], end[1], 0.01), a.id).toBe(true);
    }
  });

  it("never crosses water: every point across each route's full width is dry ground at pad level", () => {
    for (const r of court.routes) {
      for (let i = 0; i + 1 < r.points.length; i++) {
        const [ax, az] = r.points[i]!;
        const [bx, bz] = r.points[i + 1]!;
        const l = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (bz - az) / l;
        const nz = -(bx - ax) / l;
        for (let t = 0; t <= 1; t += 0.1) {
          for (const o of [-r.width / 2, 0, r.width / 2]) {
            const x = ax + (bx - ax) * t + nx * o;
            const z = az + (bz - az) * t + nz * o;
            expect(pondRho(court.pond, x, z), `${r.id} ${i} ${t.toFixed(1)} ${o}`).toBeGreaterThan(1);
            expect(inWater(court, x, z)).toBe(false);
          }
        }
      }
    }
  });

  it("keeps about 4 m of clear approach in front of each threshold: no slab, edge stone or flower in it", () => {
    for (const a of court.approaches) {
      expect(a.depth).toBeGreaterThanOrEqual(4);
      expect(a.half * 2).toBeGreaterThanOrEqual(6); // wider than the 5.3 m opening
      for (const s of court.slabs) for (const [x, z] of s.poly) expect(inApproach(a, x, z), `${a.id} vs ${s.id}`).toBe(false);
      for (const e of [...court.edges, ...court.meadowRocks]) expect(inApproach(a, e.c[0], e.c[1], 0.3), `${a.id} vs ${e.id}`).toBe(false);
      for (const g of court.candles) for (const c of g.cups) expect(inApproach(a, c[0], c[2]), `${a.id} vs ${g.id}`).toBe(false);
    }
  });

  it("puts nothing on the routes: slabs, stones and candles keep off the walking width", () => {
    const blocked = (x: number, z: number, r = 0): string | null => {
      for (const q of court.routes) if (polylineDistance(q.points, x, z) < q.width / 2 - 0.1 - r) return q.id;
      return null;
    };
    for (const s of court.slabs) {
      if (s.kind === "step" || s.kind === "platform") continue; // in the pond
      const c: XZ = [s.poly.reduce((a, q) => a + q[0], 0) / s.poly.length, s.poly.reduce((a, q) => a + q[1], 0) / s.poly.length];
      expect(blocked(c[0], c[1]), s.id).toBeNull();
    }
    for (const e of court.meadowRocks) expect(blocked(e.c[0], e.c[1]), e.id).toBeNull();
  });
});

describe("candles at home", () => {
  it("stand in groups of 3–7 white cups of the specified size, on their stones", () => {
    expect(court.candles.length).toBeGreaterThanOrEqual(6);
    for (const g of court.candles) {
      expect(g.cups.length, g.id).toBeGreaterThanOrEqual(3);
      expect(g.cups.length, g.id).toBeLessThanOrEqual(7);
      for (const [x, y, z, d, hh] of g.cups) {
        expect(d).toBeGreaterThanOrEqual(0.22);
        expect(d).toBeLessThanOrEqual(0.32);
        expect(hh).toBeGreaterThanOrEqual(0.12);
        expect(hh).toBeLessThanOrEqual(0.21); // a group's centre cup is 2 cm taller than the 0.19 m range top
        // the cup's base is the ground under it (its slab's top), and the slab carries its whole footprint
        expect(ground(x, z)).toBeCloseTo(y, 6);
        const slab = court.slabs.find((s) => insidePoly(s.poly, x, z, d / 2 + CUP_EDGE_MARGIN - 1e-9));
        expect(slab, `${g.id}: a cup at (${x.toFixed(2)}, ${z.toFixed(2)}) overhangs its stone`).toBeDefined();
        expect(slab!.top).toBeCloseTo(y, 6);
      }
      // cups never overlap one another
      for (let i = 0; i < g.cups.length; i++) for (let j = i + 1; j < g.cups.length; j++) {
        const a = g.cups[i]!;
        const b = g.cups[j]!;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2]), g.id).toBeGreaterThan((a[3] + b[3]) / 2);
      }
    }
    expect(CUP_SIZES.every(([d, hh]) => d >= 0.22 && d <= 0.32 && hh >= 0.12 && hh <= 0.2)).toBe(true);
  });

  it("marks each gateway's approach with a group either side, outside the opening", () => {
    for (const p of h.portals) {
      const gs = court.candles.filter((g) => g.id.startsWith(`gate-${p.id}-`));
      expect(gs.length, p.id).toBe(2);
      for (const g of gs) {
        expect(g.essential).toBe(true);
        for (const c of g.cups) {
          const dx = c[0] - p.position[0]!;
          const dz = c[2] - p.position[2]!;
          expect(Math.abs(dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)), g.id).toBeGreaterThan(4.5); // beside the 5.3 m opening, not in it
        }
      }
    }
  });
});

describe("the white-flower meadow", () => {
  const list = flowers(court);

  it("is deterministic: the same flowers on every call", () => {
    expect(flowers(court)).toEqual(list);
    expect(flowers(courtyard(h.spawn, h.yaw, h.portals))).toEqual(list);
  });

  it("is local and modest: roughly 40–70 m² in front of the courtyard, fuller on the left", () => {
    const cells = new Set(list.map((f) => `${Math.floor(f.x)},${Math.floor(f.z)}`));
    expect(cells.size).toBeGreaterThanOrEqual(35);
    expect(cells.size).toBeLessThanOrEqual(75);
    let left = 0;
    for (const f of list) {
      const [F, L] = frameOf(court.frame, f.x, f.z);
      expect(F, "in front of the spawn").toBeGreaterThan(1);
      expect(F, "nearer than the pond's far side").toBeLessThan(15);
      expect(Math.abs(L)).toBeLessThan(10);
      if (L > 0) left++;
    }
    expect(left / list.length).toBeGreaterThan(0.55);
  });

  it("keeps out of the pond, the spawn, every route, every approach and every stone", () => {
    for (const f of list) {
      expect(flowerAllowed(court, f.x, f.z)).toBe(true);
      expect(pondRho(court.pond, f.x, f.z)).toBeGreaterThan(1.1);
      const [F, L] = frameOf(court.frame, f.x, f.z);
      expect(Math.hypot(F, L)).toBeGreaterThan(2.5);
      for (const r of court.routes) expect(polylineDistance(r.points, f.x, f.z)).toBeGreaterThan(r.width / 2);
      for (const a of court.approaches) expect(inApproach(a, f.x, f.z)).toBe(false);
    }
  });

  it("stands on the terrain (roots on the ground) with small stems of modest variation", () => {
    for (const f of list) {
      expect(f.h).toBeGreaterThanOrEqual(0.12);
      expect(f.h).toBeLessThanOrEqual(0.25);
      expect(Math.abs(f.lean)).toBeLessThan(0.2);
      // nothing but the terrain under it: the root height the renderer uses is the ground
      expect(ground(f.x, f.z)).toBeCloseTo(heightAt(f.x, f.z), 9);
    }
  });

  it("thins the grass out of the pond and its banks, but not the island at large", () => {
    expect(courtExcludes(court, court.pond.c[0], court.pond.c[1])).toBe(true);
    expect(courtExcludes(court, h.spawn[0] + 200, h.spawn[2])).toBe(false);
  });

  it("follows POND's documented proposal values (the evidence quotes them)", () => {
    expect(POND).toMatchObject({ F: 15.5, L: 4.5 });
  });
});
