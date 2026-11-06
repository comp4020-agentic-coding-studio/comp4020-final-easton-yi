// Environment pieces for the island: terrain chunks with LOD and skirts,
// instanced grass clumps, rock silhouettes, sky, sea, cloud masses and the
// home portals. Geometry is built from the shared terrain data, so the ground
// the player stands on is the ground that is drawn.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { rng } from "../../world/core.ts";
import type { WorldManifest } from "../../world/manifest.ts";
import { grassMaterial, rockMaterial, terrainMaterial, waterMaterial } from "./materials.ts";

// ---------------------------------------------------------------- terrain

/** Bilinear height from a chunk's (n + 1)² grid in world coordinates. */
export class TerrainField {
  readonly chunks = new Map<number, Float32Array>();
  private t: WorldManifest["terrain"];
  constructor(t: WorldManifest["terrain"]) {
    this.t = t;
  }
  set(index: number, h: Float32Array): void {
    this.chunks.set(index, h);
  }
  has(index: number): boolean {
    return this.chunks.has(index);
  }
  indexAt(x: number, z: number): number {
    const cx = Math.floor((x - this.t.min[0]) / this.t.chunk);
    const cz = Math.floor((z - this.t.min[1]) / this.t.chunk);
    if (cx < 0 || cz < 0 || cx >= this.t.chunksX || cz >= this.t.chunksZ) return -1;
    return cz * this.t.chunksX + cx;
  }
  /** Ground height, or NaN when the chunk isn't loaded. Outside the grid: the sea floor. */
  height(x: number, z: number): number {
    const idx = this.indexAt(x, z);
    if (idx < 0) return -40;
    const h = this.chunks.get(idx);
    if (!h) return NaN;
    const n = this.t.n;
    const cx = idx % this.t.chunksX;
    const cz = Math.floor(idx / this.t.chunksX);
    const fx = ((x - this.t.min[0] - cx * this.t.chunk) / this.t.chunk) * n;
    const fz = ((z - this.t.min[1] - cz * this.t.chunk) / this.t.chunk) * n;
    const i = Math.max(0, Math.min(n - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(n - 1, Math.floor(fz)));
    const u = fx - i;
    const v = fz - j;
    const a = h[j * (n + 1) + i]!;
    const b = h[j * (n + 1) + i + 1]!;
    const c = h[(j + 1) * (n + 1) + i]!;
    const d = h[(j + 1) * (n + 1) + i + 1]!;
    // the same triangle split the mesh uses (diagonal from (i, j) to (i + 1, j + 1))
    if (u >= v) return a + (b - a) * u + (d - b) * v;
    return a + (d - c) * u + (c - a) * v;
  }
  private errs = new Map<number, Float32Array>();
  /**
   * Geometric error of a chunk drawn every `step` grid cells: the largest vertical distance between a
   * full-resolution sample and the coarser surface (bilinear over the coarse cell, a bound on the triangle
   * surface's error at the shared nodes). Index 0..3 for steps 1, 2, 4, 8; cached per chunk (heights don't change).
   */
  stepError(index: number): Float32Array | null {
    const hit = this.errs.get(index);
    if (hit) return hit;
    const h = this.chunks.get(index);
    if (!h) return null;
    const n = this.t.n;
    const W = n + 1;
    const out = new Float32Array(4);
    for (let k = 1; k < 4; k++) {
      const st = 1 << k;
      let e = 0;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const i0 = Math.min(n - st, Math.floor(i / st) * st);
        const j0 = Math.min(n - st, Math.floor(j / st) * st);
        const u = (i - i0) / st;
        const v = (j - j0) / st;
        const a = h[j0 * W + i0]!;
        const b = h[j0 * W + i0 + st]!;
        const c = h[(j0 + st) * W + i0]!;
        const d = h[(j0 + st) * W + i0 + st]!;
        const coarse = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        e = Math.max(e, Math.abs(coarse - h[j * W + i]!));
      }
      out[k] = Math.max(e, out[k - 1]!);
    }
    this.errs.set(index, out);
    return out;
  }
  /** Grid coordinates of a chunk. */
  origin(index: number): [number, number] {
    const cx = index % this.t.chunksX;
    const cz = Math.floor(index / this.t.chunksX);
    return [this.t.min[0] + cx * this.t.chunk, this.t.min[1] + cz * this.t.chunk];
  }
}

/**
 * A terrain tile: a square of `tiles` × `tiles` chunks starting at chunk
 * (cx0, cz0), each chunk sampled every `steps[j * tiles + i]` grid cells (its
 * own distance from the camera picks it), all in one mesh (one draw call).
 * Heights come from the shared field (identical boundary samples between
 * chunks and tiles); normals are central differences of the field itself, so
 * shading is continuous across edges. A 6 m skirt hides any gap where
 * neighbouring chunks use different steps (on chunk edges between steps and
 * on the tile's own edges). The triangle
 * diagonal matches TerrainField.height. Positions are relative to the tile's
 * corner.
 */
export function tileGeometry(field: TerrainField, t: WorldManifest["terrain"], cx0: number, cz0: number, tiles: number, steps: readonly number[]): THREE.BufferGeometry | null {
  const x0 = t.min[0] + cx0 * t.chunk;
  const z0 = t.min[1] + cz0 * t.chunk;
  let nv = 0;
  for (const st of steps) {
    const c = t.n / st;
    nv += (c + 1) * (c + 1) + 4 * (c + 1);
  }
  const verts = new Float32Array(nv * 3);
  const norms = new Float32Array(verts.length);
  const idx: number[] = [];
  let missing = false;
  const h = (x: number, z: number): number => {
    const v = field.height(x, z);
    if (!Number.isFinite(v)) missing = true;
    return Number.isFinite(v) ? v : 0;
  };
  let vi = 0;
  for (let cj = 0; cj < tiles; cj++) for (let ci = 0; ci < tiles; ci++) {
    const cells = t.n / steps[cj * tiles + ci]!;
    const d = t.chunk / cells;
    const ox = ci * t.chunk;
    const oz = cj * t.chunk;
    const base = vi;
    for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) {
      const lx = ox + i * d;
      const lz = oz + j * d;
      const x = x0 + lx;
      const z = z0 + lz;
      // sample at exact grid nodes to share edges bit-for-bit
      verts[vi * 3] = lx;
      verts[vi * 3 + 1] = h(x, z);
      verts[vi * 3 + 2] = lz;
      const e = Math.max(1, d * 0.5);
      const nx = h(x - e, z) - h(x + e, z);
      const nz = h(x, z - e) - h(x, z + e);
      const ny = 2 * e;
      const l = Math.hypot(nx, ny, nz);
      norms[vi * 3] = nx / l;
      norms[vi * 3 + 1] = ny / l;
      norms[vi * 3 + 2] = nz / l;
      vi++;
    }
    if (missing) return null;
    const W = cells + 1;
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const a = base + j * W + i;
      idx.push(a, a + W, a + W + 1, a, a + W + 1, a + 1);
    }
    // skirts
    const edge = (list: number[]): void => {
      const start = vi;
      for (const v of list) {
        verts[vi * 3] = verts[v * 3]!;
        verts[vi * 3 + 1] = verts[v * 3 + 1]! - 6;
        verts[vi * 3 + 2] = verts[v * 3 + 2]!;
        norms[vi * 3] = norms[v * 3]!;
        norms[vi * 3 + 1] = norms[v * 3 + 1]!;
        norms[vi * 3 + 2] = norms[v * 3 + 2]!;
        vi++;
      }
      for (let q = 0; q + 1 < list.length; q++) idx.push(list[q]!, start + q, list[q + 1]!, list[q + 1]!, start + q, start + q + 1);
    };
    // only where a crack can open: the tile's own edges (the next tile may differ) and chunk edges between steps
    const here = steps[cj * tiles + ci]!;
    const differs = (i: number, j: number): boolean => i < 0 || j < 0 || i >= tiles || j >= tiles || steps[j * tiles + i] !== here;
    if (differs(ci, cj - 1)) edge(Array.from({ length: W }, (_, i) => base + i).reverse());
    if (differs(ci, cj + 1)) edge(Array.from({ length: W }, (_, i) => base + cells * W + i));
    if (differs(ci - 1, cj)) edge(Array.from({ length: W }, (_, j) => base + j * W));
    if (differs(ci + 1, cj)) edge(Array.from({ length: W }, (_, j) => base + j * W + cells).reverse());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(verts.subarray(0, vi * 3), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(norms.subarray(0, vi * 3), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export const TERRAIN_MATERIAL = (): THREE.MeshStandardMaterial => terrainMaterial();

// ---------------------------------------------------------------- grass

/** A low-poly clump: five crossed blades, root at y = 0, tip at ~0.7. */
function clumpGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const r = rng(7);
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI + r() * 0.4;
    const lean = (r() - 0.5) * 0.25;
    const w = 0.035 + r() * 0.02;
    const h = 0.32 + r() * 0.26;
    const ox = (r() - 0.5) * 0.25;
    const oz = (r() - 0.5) * 0.25;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const P = (x: number, y: number): number[] => [ox + c * x + lean * y, y, oz + s * x];
    // a tapered blade of two triangles
    pos.push(...P(-w, 0), ...P(w, 0), ...P(w * 0.4, h * 0.6));
    pos.push(...P(-w, 0), ...P(w * 0.4, h * 0.6), ...P(-w * 0.3, h * 0.65));
    pos.push(...P(-w * 0.3, h * 0.65), ...P(w * 0.4, h * 0.6), ...P(0.02, h));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export interface GrassField {
  mesh: THREE.Mesh;
  uniforms: ReturnType<typeof grassMaterial>["uniforms"];
  /** Re-seed clumps around a centre; returns the count placed. */
  rebuild(cx: number, cz: number, radius: number, budget: number, height: (x: number, z: number) => number, excluded: (x: number, z: number) => boolean): number;
  dispose(): void;
}

/**
 * Near grass: clumps scattered on a jittered grid around the camera (fixed
 * seed per cell, so revisiting shows the same clumps), thinned on steep and
 * high ground and on paths, clustered at bases, and excluded from footprints,
 * routes and safe points. One draw call.
 */
export function createGrass(max: number): GrassField {
  const geo = new THREE.InstancedBufferGeometry();
  const base = clumpGeometry();
  geo.setAttribute("position", base.getAttribute("position"));
  geo.setAttribute("normal", base.getAttribute("normal"));
  const clump = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const scaleA = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  clump.setUsage(THREE.DynamicDrawUsage);
  scaleA.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("iClump", clump);
  geo.setAttribute("iScale", scaleA);
  geo.instanceCount = 0;
  const { material, uniforms } = grassMaterial();
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const cell = 1.6;
  return {
    mesh,
    uniforms,
    rebuild(cx, cz, radius, budget, height, excluded) {
      let n = 0;
      const i0 = Math.floor((cx - radius) / cell);
      const i1 = Math.floor((cx + radius) / cell);
      const j0 = Math.floor((cz - radius) / cell);
      const j1 = Math.floor((cz + radius) / cell);
      const limit = Math.min(max, budget);
      for (let j = j0; j <= j1 && n < limit; j++) {
        for (let i = i0; i <= i1 && n < limit; i++) {
          // deterministic per cell
          let s = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0;
          const r = (): number => {
            s = (s + 0x6d2b79f5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
          const x = (i + r()) * cell;
          const z = (j + r()) * cell;
          const d2 = (x - cx) ** 2 + (z - cz) ** 2;
          if (d2 > radius * radius) continue;
          const y = height(x, z);
          if (!Number.isFinite(y) || y < 1.2 || y > 175) continue;
          // slope from neighbouring samples: thin on steep ground
          const dx = height(x + 1, z) - y;
          const dz = height(x, z + 1) - y;
          const slope = Math.hypot(dx, dz);
          if (slope > 0.7) continue;
          const density = (slope > 0.45 ? 0.35 : 1) * (0.55 + 0.45 * Math.sin(x * 0.05 + z * 0.031) * Math.cos(z * 0.043 - x * 0.02));
          if (r() > density) continue;
          if (excluded(x, z)) continue;
          clump.setXYZW(n, x, y - 0.02, z, r() * Math.PI * 2);
          // clumps right at the viewer's feet stay small so they don't fill the frame
          const near = Math.min(1, Math.sqrt(d2) / 6);
          scaleA.setX(n, (0.7 + r() * 0.55) * (0.45 + 0.55 * near));
          n++;
        }
      }
      clump.needsUpdate = true;
      scaleA.needsUpdate = true;
      geo.instanceCount = n;
      return n;
    },
    dispose() {
      geo.dispose();
      base.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------- rocks

/** 8 distinct rock silhouettes and 3 rubble clusters, built from seeded deformed polyhedra. */
export function rockGeometries(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) {
    const r = rng(1000 + k);
    const rubble = k >= 8;
    if (rubble) {
      // a cluster of small stones merged into one geometry
      const parts: THREE.BufferGeometry[] = [];
      for (let p = 0; p < 6 + Math.floor(r() * 5); p++) {
        const g = new THREE.IcosahedronGeometry(0.4 + r() * 0.6, 0);
        g.scale(1 + r() * 0.6, 0.5 + r() * 0.4, 1 + r() * 0.6);
        g.translate((r() - 0.5) * 4, 0.1, (r() - 0.5) * 4);
        const ni = g.index ? g.toNonIndexed() : g;
        parts.push(ni);
        if (ni !== g) g.dispose();
      }
      const merged = mergeNonIndexed(parts);
      parts.forEach((p) => p.dispose());
      merged.computeVertexNormals();
      out.push(merged);
      continue;
    }
    const g = new THREE.IcosahedronGeometry(1, k % 3 === 0 ? 2 : 1);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const stretch = [1 + r() * 1.2, 0.5 + r() * 0.9, 1 + r() * 0.8];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const n = 0.75 + 0.5 * Math.abs(Math.sin(v.x * 3.1 + k) * Math.cos(v.z * 2.3 - k) + Math.sin(v.y * 4.7));
      v.multiplyScalar(n * 0.8);
      v.set(v.x * stretch[0]!, Math.max(-0.2, v.y) * stretch[1]!, v.z * stretch[2]!);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    const ni = g.index ? g.toNonIndexed() : g;
    if (ni !== g) g.dispose();
    ni.computeVertexNormals();
    out.push(ni);
  }
  return out;
}

function mergeNonIndexed(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const p of parts) total += p.getAttribute("position").count;
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    const a = p.getAttribute("position").array as Float32Array;
    pos.set(a, o);
    o += a.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
}

export const ROCK_MATERIAL = (): THREE.MeshStandardMaterial => rockMaterial();

// ---------------------------------------------------------------- sky, sea, clouds

export function createSky(sun: THREE.Vector3): Sky {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u["turbidity"]!.value = 4.5;
  u["rayleigh"]!.value = 1.6;
  u["mieCoefficient"]!.value = 0.004;
  u["mieDirectionalG"]!.value = 0.82;
  u["sunPosition"]!.value.copy(sun);
  return sky;
}

export function createSea(): { mesh: THREE.Mesh; uniforms: { uTime: { value: number } } } {
  const { material, uniforms } = waterMaterial({ flow: false });
  const geo = new THREE.PlaneGeometry(9000, 6000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = 0;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}

/** A flowing water strip (river, channel, spillway outflow). */
export function createFlow(w: { c: number[]; hx: number; hz: number; yaw: number }): { mesh: THREE.Mesh; uniforms: { uTime: { value: number } } } {
  const { material, uniforms } = waterMaterial({ flow: true });
  const geo = new THREE.PlaneGeometry(w.hx * 2, w.hz * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(w.c[0]!, w.c[1]!, w.c[2]!);
  mesh.rotation.y = w.yaw;
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}

/**
 * A river ribbon along a centre line (points carry the water height), `half` metres either side, subdivided every
 * ~8 m so the falling surface follows the bed. uv.y runs downstream in units of 20 m (the flow shader's stripe
 * scale for a rectangle's 0…1), so the animation moves toward the sea at the same speed as the channel's.
 */
export function createRiver(points: readonly number[][], half: number): { mesh: THREE.Mesh; uniforms: { uTime: { value: number } } } {
  const { material, uniforms } = waterMaterial({ flow: true });
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  const pts: number[][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0]! - a[0]!, b[2]! - a[2]!) / 8));
    for (let k = 0; k < n; k++) pts.push([a[0]! + ((b[0]! - a[0]!) * k) / n, a[1]! + ((b[1]! - a[1]!) * k) / n, a[2]! + ((b[2]! - a[2]!) * k) / n]);
  }
  pts.push(points[points.length - 1]!);
  pts.forEach((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)]!;
    const o = pts[Math.max(0, i - 1)]!;
    const dx = q[0]! - o[0]!;
    const dz = q[2]! - o[2]!;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    if (i > 0) along += Math.hypot(p[0]! - pts[i - 1]![0]!, p[2]! - pts[i - 1]![2]!);
    pos.push(p[0]! + nx * half, p[1]!, p[2]! + nz * half, p[0]! - nx * half, p[1]!, p[2]! - nz * half);
    uv.push(0, along / 20, 1, along / 20);
    if (i > 0) {
      const a = (i - 1) * 2;
      // counter-clockwise seen from above (front faces up): left(i−1), left(i), right(i−1); right(i−1), left(i), right(i)
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}

/**
 * Cloud masses: soft camera-facing billboards in three layers (distant masses,
 * mid-distance ridge bands, low valley mist), all in one instanced mesh with a
 * generated texture (nothing downloaded). Counts follow quality.
 */
export function createClouds(count: number, seed = 31): { mesh: THREE.Mesh; dispose(): void; drift(t: number): void } {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.5)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const r = rng(seed);
  const centres: number[] = [];
  const sizes: number[] = [];
  const tints: number[] = [];
  for (let i = 0; i < count; i++) {
    const layer = i % 3;
    const cl = [(r() - 0.5) * 5200, layer === 0 ? 420 + r() * 240 : layer === 1 ? 230 + r() * 120 : 70 + r() * 30, (r() - 0.5) * 3400];
    // keep viewing windows over the central valley for the distant masses
    if (layer !== 2 && Math.abs(cl[2]!) < 500 && Math.abs(cl[0]!) < 1300) cl[2] = cl[2]! + Math.sign(cl[2]! || 1) * 600;
    if (layer === 2 && Math.abs(cl[2]!) < 450 && Math.abs(cl[0]!) < 1300) cl[2] = cl[2]! + Math.sign(cl[2]! || 1) * 500; // mist over the sea and valley edges, not in the route
    const puffs = layer === 2 ? 3 : 5;
    for (let p = 0; p < puffs; p++) {
      const size = layer === 0 ? 180 + r() * 220 : layer === 1 ? 110 + r() * 120 : 140 + r() * 120;
      centres.push(cl[0]! + (r() - 0.5) * size * 1.6, cl[1]! + (r() - 0.5) * size * 0.2, cl[2]! + (r() - 0.5) * size * 1.2);
      sizes.push(size * (1.4 + r() * 0.8), size * (layer === 2 ? 0.25 : 0.55 + r() * 0.3));
      tints.push(layer === 2 ? 0.35 : 0.9);
    }
  }
  const n = sizes.length / 2;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute("position", quad.getAttribute("position"));
  geo.setAttribute("uv", quad.getAttribute("uv"));
  const cAttr = new THREE.InstancedBufferAttribute(new Float32Array(centres), 3);
  geo.setAttribute("iCentre", cAttr);
  geo.setAttribute("iSize", new THREE.InstancedBufferAttribute(new Float32Array(sizes), 2));
  geo.setAttribute("iAlpha", new THREE.InstancedBufferAttribute(new Float32Array(tints), 1));
  geo.instanceCount = n;
  const uniforms = { map: { value: tex }, uDrift: { value: 0 }, fogColor: { value: new THREE.Color("#c9d9df") }, fogNear: { value: 900 }, fogFar: { value: 4200 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
      attribute vec3 iCentre; attribute vec2 iSize; attribute float iAlpha;
      uniform float uDrift;
      varying vec2 vUv; varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vAlpha = iAlpha;
        vec3 c = iCentre; c.x += mod(uDrift * (1.5 + fract(iCentre.z * 0.013) * 2.0), 400.0) - 200.0;
        vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
        mvPosition.xy += position.xy * iSize;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv; varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(map, vUv);
        gl_FragColor = vec4(vec3(1.0), t.a * vAlpha);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return {
    mesh,
    drift(t) {
      uniforms.uDrift.value = t;
    },
    dispose() {
      tex.dispose();
      mat.dispose();
      geo.dispose();
      quad.dispose();
    },
  };
}

// ---------------------------------------------------------------- portals

/**
 * A portal: a substantial timber gateway in the island's stick language,
 * each with its own form so they can't be mistaken for one another or for
 * a borrowed shrine gate: Explore is a tall lattice arch, My Works a
 * bundled-post frame with a stepped lintel, Build Together two leaning
 * frames meeting overhead. Merged into one mesh per material; a soft
 * threshold plane marks the trigger.
 */
export function createPortal(id: "explore" | "works" | "together", accent: string): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color("#ad8259"), roughness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color("#73543a"), roughness: 0.85 });
  const parts: { w: THREE.BufferGeometry[]; d: THREE.BufferGeometry[] } = { w: [], d: [] };
  const stick = (len: number, sec: number, kind: "w" | "d", a: THREE.Vector3, b: THREE.Vector3): void => {
    // a stick from a to b (length must equal |b − a|), section sec
    const dir = b.clone().sub(a);
    const g = new THREE.BoxGeometry(len, sec, sec);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts[kind].push(g);
  };
  const seg = (a: THREE.Vector3, b: THREE.Vector3, sec: number, kind: "w" | "d", unit = 4): void => {
    // lay a straight chain of unit-length sticks from a to b (C rule)
    const l = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(l / unit - 0.01));
    const dir = b.clone().sub(a).normalize();
    if (n === 1) return stick(l, sec, kind, a, b);
    const st = (l - unit) / (n - 1);
    for (let i = 0; i < n; i++) {
      const c = a.clone().addScaledVector(dir, unit / 2 + i * st);
      stick(unit, sec, kind, c.clone().addScaledVector(dir, -unit / 2), c.clone().addScaledVector(dir, unit / 2));
    }
  };
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const post = (x: number, h: number): void => {
    for (const [ox, oz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]] as const) seg(V(x + ox, 0, oz), V(x + ox, h, oz), 0.5, "w");
    for (let y = 1.5; y < h; y += 3) for (const s2 of [-1, 1]) seg(V(x - 0.8, y, s2 * 0.6), V(x + 0.8, y, s2 * 0.6), 0.125, "d", 1);
    seg(V(x - 1.2, 0.25, 0), V(x + 1.2, 0.25, 0), 1, "d", 8);
  };
  if (id === "explore") {
    // a tall pointed lattice arch: two curved ribs of 4 m sticks with D cross ties
    for (const z of [-0.6, 0.6]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const a = Math.PI * t;
        pts.push(V(-3.6 * Math.cos(a) * (1 - 0.15 * Math.sin(a)), 11.5 * Math.sin(a) ** 0.8, z));
      }
      for (let i = 0; i < 12; i++) stick(pts[i]!.distanceTo(pts[i + 1]!), 0.5, "w", pts[i]!, pts[i + 1]!);
      if (z > 0) for (let i = 1; i < 12; i += 2) seg(V(pts[i]!.x, pts[i]!.y, -0.6), V(pts[i]!.x, pts[i]!.y, 0.6), 0.125, "d", 1);
    }
    for (const sx of [-1, 1]) seg(V(sx * 3.6, 0, -1), V(sx * 3.6, 0, 1), 1, "d", 8);
  } else if (id === "works") {
    // bundled posts and a stepped lintel (three projecting layers)
    post(-3.6, 10);
    post(3.6, 10);
    for (let k = 0; k < 3; k++) for (const z of [-0.3, 0.3]) seg(V(-4.6 - k * 0.4, 10.25 + k * 0.5, z), V(4.6 + k * 0.4, 10.25 + k * 0.5, z), 0.5, "w");
  } else {
    // two leaning frames meeting overhead, a shared ridge
    for (const sx of [-1, 1]) for (const z of [-0.8, 0.8]) seg(V(sx * 4.4, 0, z), V(sx * 0.6, 11.5, z), 0.5, "w");
    for (const y of [3, 6, 9]) for (const sx of [-1, 1]) {
      const x = sx * (4.4 - (3.8 * y) / 11.5);
      seg(V(x, y, -0.8), V(x, y, 0.8), 0.125, "d", 1);
    }
    seg(V(0, 11.75, -1.4), V(0, 11.75, 1.4), 0.5, "w");
  }
  const wg = mergeAll(parts.w);
  const dg = mergeAll(parts.d);
  parts.w.forEach((g) => g.dispose());
  parts.d.forEach((g) => g.dispose());
  const wm = new THREE.Mesh(wg, wood);
  const dm = new THREE.Mesh(dg, dark);
  for (const m of [wm, dm]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const tmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const threshold = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 9.4), tmat);
  threshold.position.set(0, 4.8, 0);
  group.add(threshold);
  return {
    group,
    dispose() {
      wg.dispose();
      dg.dispose();
      threshold.geometry.dispose();
      wood.dispose();
      dark.dispose();
      tmat.dispose();
    },
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ni = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of ni) total += g.getAttribute("position").count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of ni) {
    pos.set(g.getAttribute("position").array as Float32Array, o);
    nor.set(g.getAttribute("normal").array as Float32Array, o);
    o += g.getAttribute("position").count * 3;
  }
  ni.forEach((g, i) => g !== list[i] && g.dispose());
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
