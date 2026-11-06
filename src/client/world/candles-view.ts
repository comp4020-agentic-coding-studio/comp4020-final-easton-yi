// Candles in the scene (courtyard/day-night directive §8, §10): every cup on
// the island (home courtyard and the twenty landmarks) in one instanced cup
// mesh per region cell and one flame mesh per cell, plus a small fixed pool of
// real point lights that follows the explorer.
//
// Visible flames and actual lighting are separate. The flames and their glow
// are unlit additive quads (cheap, one draw call per cell, culled by cell);
// they light nothing. The timber, stone and flowers are lit only by the light
// pool: at most 8 / 4 / 2 non-shadowed point lights (High / Medium / Low),
// created once with the view and never reallocated; each frame the selector
// assigns them to the most relevant candle groups near the explorer:
//
//   - by distance (within the group's range plus a margin), weighted by the
//     group's weight (essential navigation groups first);
//   - room-aware: a group inside an interior zone is only chosen for an explorer
//     in that same zone (or close outside an opening of it), so light from a hall
//     doesn't leak through its wall onto the approach, and the reverse;
//   - with hysteresis: a group keeps its light until another scores clearly
//     better, and lights fade in and out over ~0.6 s (immediately with reduced
//     motion), so turning or crossing a boundary doesn't pop.
//
// Each light's range is limited to its group's (a few metres), and decays
// physically, so a light can't reach far through a wall.
//
// Cups stay day and night. `setLit(level)` (0 day … 1 night, from the
// environment) scales flames, glow and the light pool together.
import * as THREE from "three";
import type { CandleGroupData } from "../../world/courtyard.ts";
import { cupMaterial, flameMaterial } from "./materials.ts";

export interface CandleZoneW {
  id: string;
  c: [number, number, number];
  h: [number, number, number];
  yaw: number;
}

/** Light pool sizes per quality tier (directive §10: tuning ceilings, not targets). */
export const LIGHT_POOL = Object.freeze({ high: 8, medium: 4, low: 2 });
/** Decorative groups thin out on Low (navigation groups stay). */
export const LOW_DECOR_KEEP = 0.5;

/** One cup's shape: a squat cylinder with a rolled rim and an inset wax top (unit diameter and height). */
function cupGeometry(): THREE.BufferGeometry {
  // a lathe profile (r, y, wax flag): outer wall up to the rim, over the rim, down the inside, the wax surface
  // ten sides: at a cup's size (0.22–0.32 m) the facets read as a round cup from a couple of metres on; no bottom
  // (it stands on its surface)
  const seg = 10;
  const prof: [number, number, number][] = [
    [0.5, 0.0, 0],
    [0.5, 0.94, 0],
    [0.485, 1.0, 0],
    [0.44, 1.0, -1], // the rim's inner lip (warm at night)
    [0.43, 0.86, 1], // the wax, 14 % below the rim
    [0.0, 0.86, 1],
  ];
  const pos: number[] = [];
  const wax: number[] = [];
  for (let i = 0; i + 1 < prof.length; i++) {
    const [r0, y0, w0] = prof[i]!;
    const [r1, y1, w1] = prof[i + 1]!;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      const P = (r: number, y: number, a: number): number[] => [Math.cos(a) * r, y, Math.sin(a) * r];
      // outward-facing quads (the profile runs bottom-centre → outside → over → inside → wax centre)
      const A = P(r0, y0, a0), B = P(r0, y0, a1), C = P(r1, y1, a1), D = P(r1, y1, a0);
      pos.push(...A, ...C, ...B, ...A, ...D, ...C);
      const w = Math.min(w0, w1) < 0 ? -1 : Math.max(w0, w1);
      for (let q = 0; q < 6; q++) wax.push(w);
    }
  }
  // the wick: a short dark stick standing from the wax (a thin crossed pair of quads; flag 2 = wick colour)
  const ww = 0.008 / 0.27; // ≈ 8 mm at a typical 0.27 m cup (the cup's diameter scales x and z)
  const wy0 = 0.86;
  const wy1 = 0.86 + 0.13; // ≈ 2 cm above the wax at a typical 0.15 m height
  for (const [ax, az] of [[1, 0], [0, 1]] as const) {
    const A = [-ww * ax, wy0, -ww * az], B = [ww * ax, wy0, ww * az], C = [ww * ax, wy1, ww * az], D = [-ww * ax, wy1, -ww * az];
    pos.push(...A, ...B, ...C, ...A, ...C, ...D, ...A, ...C, ...B, ...A, ...D, ...C);
    for (let q = 0; q < 12; q++) wax.push(2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aWax", new THREE.Float32BufferAttribute(wax, 1));
  g.computeVertexNormals();
  return g;
}

/** The flame and glow quads: two unit quads (uv 0–1), the second flagged as glow. */
function flameGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  // glow first (drawn under the flame), then the flame
  const glow = [1, 1, 1, 1, 0, 0, 0, 0];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aGlow", new THREE.Float32BufferAttribute(glow, 1));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

interface Cell {
  cups: THREE.Mesh;
  flames: THREE.Mesh;
  /** Instances for this cell, and how many are drawn on Low (essential groups first). */
  total: number;
  low: number;
  /** The cell's bounds: nothing of it is drawn when the explorer is beyond CUP_DRAW_DISTANCE of them. */
  sphere: THREE.Sphere;
  near: boolean;
}

export interface CandleView {
  group: THREE.Group;
  /** Assign the light pool for this frame. Returns true while a light is still fading (the caller keeps framing). */
  update(camera: THREE.Vector3, dt: number, snap: boolean): boolean;
  setLit(level: number): void;
  setTier(tier: "high" | "medium" | "low"): void;
  setTime(t: number, flicker: boolean): void;
  stats(): { groups: number; cups: number; cells: number; lightsActive: number; lightsPool: number; cellsDrawn: number; cupsDrawn: number; assigned: string[]; lit: number };
  dispose(): void;
}

/** Cups and flames are drawn within this distance (m): a 0.3 m cup is under a pixel beyond it at 1080 p. */
export const CUP_DRAW_DISTANCE = 160;

export function createCandles(groups: readonly CandleGroupData[], zones: readonly CandleZoneW[], opts: { maxLights: number }): CandleView {
  const root = new THREE.Group();
  root.name = "candles";
  const cupGeo = cupGeometry();
  const flameGeo = flameGeometry();
  const cupMat = cupMaterial();
  const flame = flameMaterial();
  // ---- instances by cell, essential groups first in each (so Low's prefix keeps navigation)
  // one cup mesh and one flame mesh per landmark (and one for the home courtyard): each is culled with its building
  const byCell = new Map<string, { g: CandleGroupData; essential: boolean }[]>();
  for (const g of groups) {
    const k = g.id.split(":")[0]!;
    const a = byCell.get(k) ?? [];
    a.push({ g, essential: g.essential });
    byCell.set(k, a);
  }
  const cells: Cell[] = [];
  let totalCups = 0;
  for (const [, list] of byCell) {
    list.sort((a, b) => Number(b.essential) - Number(a.essential));
    const cups = list.flatMap((e) => e.g.cups.map((c) => ({ c, essential: e.essential })));
    // Low keeps every essential cup and about half of the decorative ones (whole groups never vanish: cup order is per group)
    let decor = 0;
    const decorTotal = cups.filter((c) => !c.essential).length;
    const low = cups.filter((c) => c.essential || decor++ < Math.ceil(decorTotal * LOW_DECOR_KEEP)).length;
    const n = cups.length;
    totalCups += n;
    const iCup = new Float32Array(n * 4);
    const iH = new Float32Array(n);
    const iSeed = new Float32Array(n);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    cups.forEach(({ c }, i) => {
      iCup.set([c[0], c[1], c[2], c[3]], i * 4);
      iH[i] = c[4];
      iSeed[i] = (i * 0.618034) % 1;
      x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]);
      y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]);
      z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]);
    });
    const sphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 1);
    const mk = (base: THREE.BufferGeometry): THREE.InstancedBufferGeometry => {
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
      g.setAttribute("iCup", new THREE.InstancedBufferAttribute(iCup, 4));
      g.setAttribute("iH", new THREE.InstancedBufferAttribute(iH, 1));
      g.setAttribute("iSeed", new THREE.InstancedBufferAttribute(iSeed, 1));
      g.instanceCount = n;
      g.boundingSphere = sphere.clone();
      return g;
    };
    const cm = new THREE.Mesh(mk(cupGeo), cupMat.material);
    cm.castShadow = false; // squat cups 0.15 m tall: their shadow is a few pixels; not worth the shadow pass
    cm.receiveShadow = true;
    cm.name = "candle-cups";
    const fm = new THREE.Mesh(mk(flameGeo), flame.material);
    fm.renderOrder = 5;
    fm.frustumCulled = true;
    fm.visible = false;
    fm.name = "candle-flames";
    root.add(cm, fm);
    cells.push({ cups: cm, flames: fm, total: n, low, sphere, near: true });
  }
  // ---- the light pool: created once, never reallocated (a light's count changes three's programs; its values don't)
  const pool: { light: THREE.PointLight; group: CandleGroupData | null; level: number; target: number }[] = [];
  for (let i = 0; i < opts.maxLights; i++) {
    const l = new THREE.PointLight(new THREE.Color("#ffb066"), 0, 6, 2);
    l.castShadow = false;
    l.visible = true; // always in the scene: toggling visibility would recompile every lit program
    root.add(l);
    pool.push({ light: l, group: null, level: 0, target: 0 });
  }
  let lit = 0;
  let active = opts.maxLights;
  let tierNow: "high" | "medium" | "low" = "high";
  /** A cell's instances: none beyond the draw distance (with 10 % hysteresis), else the tier's count. */
  const applyCell = (c: Cell, cam: THREE.Vector3 | null): void => {
    if (cam) {
      const d = Math.max(0, cam.distanceTo(c.sphere.center) - c.sphere.radius);
      c.near = d < CUP_DRAW_DISTANCE * (c.near ? 1.1 : 1);
    }
    const n = !c.near ? 0 : tierNow === "low" ? c.low : c.total;
    (c.cups.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    (c.flames.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    c.cups.visible = n > 0;
    c.flames.visible = n > 0 && lit > 0.002;
  };
  const zoneOf = (p: THREE.Vector3): string | null => {
    for (const z of zones) {
      const dx = p.x - z.c[0];
      const dz = p.z - z.c[2];
      const c = Math.cos(z.yaw);
      const s = Math.sin(z.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= z.h[0] && Math.abs(p.y - z.c[1]) <= z.h[1] && Math.abs(lz) <= z.h[2]) return z.id;
    }
    return null;
  };
  const tmp = new THREE.Vector3();
  const BASE_INTENSITY = 5; // candela per group (physically based units; several cups together)
  return {
    group: root,
    update(cam, dt, snap) {
      for (const c of cells) applyCell(c, cam);
      if (lit <= 0.001) {
        let fading = false;
        for (const s of pool) {
          if (s.level > 0) {
            s.level = snap ? 0 : Math.max(0, s.level - dt / 0.6);
            fading ||= s.level > 0;
          }
          s.light.intensity = s.level * BASE_INTENSITY * lit;
        }
        return fading;
      }
      const here = zoneOf(cam);
      // score every group in reach: closer and weightier is better; a different interior zone is excluded
      const scored: { g: CandleGroupData; score: number }[] = [];
      for (const g of groups) {
        tmp.set(g.light[0], g.light[1], g.light[2]);
        const d = tmp.distanceTo(cam);
        const reach = g.range + 14;
        if (d > reach) continue;
        if (g.zone !== here) {
          // light from inside a room reaches an explorer outside only near the room's openings (close by), and the
          // reverse: within 6 m of it; otherwise its light would show through the wall
          if (d > 6) continue;
        }
        if (active < LIGHT_POOL.high && !g.essential && d > g.range) continue;
        scored.push({ g, score: (g.weight * g.range) / (d + 2) });
      }
      scored.sort((a, b) => b.score - a.score);
      const want = scored.slice(0, active).map((s) => s.g);
      // hysteresis: a held group stays unless it fell out of the wanted set by more than a margin
      const holdMargin = 1.25;
      const scoreOf = new Map(scored.map((s) => [s.g, s.score]));
      const cutoff = scored[Math.min(active, scored.length) - 1]?.score ?? 0;
      const held = new Set<CandleGroupData>();
      pool.forEach((s, i) => {
        if (i >= active) {
          s.target = 0;
          return;
        }
        const sc = s.group ? scoreOf.get(s.group) : undefined;
        if (s.group && sc !== undefined && sc * holdMargin >= cutoff) {
          s.target = 1;
          held.add(s.group);
        } else s.target = 0;
      });
      for (const g of want) {
        if (held.has(g)) continue;
        // a free slot: one that is off (or fading out and nearly dark)
        const slot = pool.slice(0, active).find((s) => s.target === 0 && s.level < 0.05);
        if (!slot) break;
        slot.group = g;
        slot.target = 1;
        slot.level = snap ? 1 : 0;
        slot.light.position.set(g.light[0], g.light[1], g.light[2]);
        slot.light.distance = g.range;
        held.add(g);
      }
      let fading = false;
      for (const s of pool) {
        const rate = dt / 0.6;
        if (snap) s.level = s.target;
        else if (s.level < s.target) s.level = Math.min(s.target, s.level + rate);
        else if (s.level > s.target) s.level = Math.max(s.target, s.level - rate);
        if (s.level !== s.target) fading = true;
        if (s.level === 0 && s.target === 0) s.group = null;
        s.light.intensity = s.level * BASE_INTENSITY * lit * (s.group?.weight ?? 1);
      }
      return fading;
    },
    setLit(level) {
      lit = Math.max(0, Math.min(1, level));
      cupMat.uniforms.uLit.value = lit;
      flame.uniforms.uLit.value = lit;
      for (const c of cells) applyCell(c, null);
    },
    setTier(tier) {
      active = Math.min(opts.maxLights, LIGHT_POOL[tier]);
      tierNow = tier;
      for (const c of cells) applyCell(c, null);
      flame.uniforms.uGlow.value = tier === "low" ? 0.6 : 1;
    },
    setTime(t, flicker) {
      flame.uniforms.uTime.value = t;
      flame.uniforms.uFlicker.value = flicker ? 1 : 0;
    },
    stats() {
      return {
        groups: groups.length,
        cups: totalCups,
        cells: cells.length,
        lightsActive: pool.filter((s) => s.level > 0).length,
        lightsPool: active,
        cellsDrawn: cells.filter((c) => c.near).length,
        cupsDrawn: cells.reduce((a, c) => a + (c.cups.visible ? (c.cups.geometry as THREE.InstancedBufferGeometry).instanceCount : 0), 0),
        assigned: pool.filter((s) => s.group && s.level > 0).map((s) => s.group!.id),
        lit,
      };
    },
    dispose() {
      for (const c of cells) {
        for (const m of [c.cups, c.flames]) {
          const g = m.geometry as THREE.InstancedBufferGeometry;
          g.index = null;
          for (const k of Object.keys(g.attributes)) g.deleteAttribute(k);
          g.dispose();
        }
      }
      cupGeo.dispose();
      flameGeo.dispose();
      cupMat.material.dispose();
      flame.material.dispose();
      for (const s of pool) s.light.dispose();
    },
  };
}
