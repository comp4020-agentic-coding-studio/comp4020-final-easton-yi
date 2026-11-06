// Stone geometry for the gateways and the courtyard (courtyard/day-night
// directive §3–§4): dressed blocks with weathered, chamfered edges, flat
// slabs with battered sides, and low rocks from the island's own rock
// silhouettes. Everything of one material is merged into one geometry, so a
// gateway is one draw call (plus its membrane) and the courtyard's stone is one
// more. The material is the island's rock material, shared (environment.ts).
import * as THREE from "three";
import { rng } from "../../world/core.ts";
import type { EdgeStone, Slab } from "../../world/courtyard.ts";
import type { GatewayPlan, Stone } from "../../world/gateways.ts";

type Tri = number[];

/** Accumulates non-indexed triangles with flat normals (the rock material is flat-shaded anyway). */
export class StoneMesh {
  readonly pos: number[] = [];
  /** Add a convex planar polygon (counter-clockwise seen from outside). */
  poly(pts: readonly THREE.Vector3[]): void {
    for (let i = 1; i + 1 < pts.length; i++) this.tri(pts[0]!, pts[i]!, pts[i + 1]!);
  }
  /** Add a convex planar polygon facing away from `inside` (the solid's centre), whatever order its points are in. */
  face(pts: readonly THREE.Vector3[], inside: THREE.Vector3): void {
    const a = pts[0]!;
    const n = new THREE.Vector3().subVectors(pts[1]!, a).cross(new THREE.Vector3().subVectors(pts[2]!, a));
    const m = new THREE.Vector3();
    for (const p of pts) m.add(p);
    m.multiplyScalar(1 / pts.length).sub(inside);
    this.poly(n.dot(m) >= 0 ? pts : [...pts].reverse());
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  /** Append a geometry (non-indexed or indexed) transformed by m. */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const p = g.getAttribute("position");
    const idx = g.index;
    const v = new THREE.Vector3();
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals(); // non-indexed: per-face normals
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * A dressed block: a quad in the x–y plane extruded ±hz along z, every edge chamfered (a weathered arris), each
 * face given a little irregularity (its corners nudged a few centimetres) so no two blocks are identical.
 */
export function addBlock(out: StoneMesh, s: Stone, m: THREE.Matrix4): void {
  const r = rng(s.seed);
  const q = s.quad;
  // centroid and the block's own size, which bounds the chamfer
  const cx = (q[0]![0] + q[1]![0] + q[2]![0] + q[3]![0]) / 4;
  const cy = (q[0]![1] + q[1]![1] + q[2]![1] + q[3]![1]) / 4;
  const minEdge = Math.min(...q.map((p, i) => Math.hypot(q[(i + 1) % 4]![0] - p[0], q[(i + 1) % 4]![1] - p[1])), s.hz * 2);
  const ch = Math.min(0.09, minEdge * 0.12) * (0.7 + r() * 0.6);
  const zf = s.cz - s.hz;
  const zb = s.cz + s.hz;
  // inset outline (the faces' flat part) and full outline (where the chamfers meet the sides)
  const inset = q.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * ch * 1.4, y + (dy / d) * ch * 1.4] as [number, number];
  });
  const jit = (): number => (r() - 0.5) * 0.03;
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const front = inset.map(([x, y]) => V(x + jit(), y + jit(), zf + jit() * 0.5));
  const back = inset.map(([x, y]) => V(x + jit(), y + jit(), zb + jit() * 0.5));
  const midF = q.map(([x, y]) => V(x, y, zf + ch));
  const midB = q.map(([x, y]) => V(x, y, zb - ch));
  // faces, each turned to face away from the block's centre: front, back, the chamfer bands and the sides
  const inside = V(cx, cy, s.cz);
  out.face(front, inside);
  out.face(back, inside);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    out.face([front[i]!, front[j]!, midF[j]!, midF[i]!], inside);
    out.face([midF[i]!, midF[j]!, midB[j]!, midB[i]!], inside);
    out.face([midB[i]!, midB[j]!, back[j]!, back[i]!], inside);
  }
}

/** A flat-topped slab: its top polygon at `top`, the sides battered out to the base, the top's edge rounded by a bevel. */
export function addSlab(out: StoneMesh, s: Slab): void {
  const r = rng(s.seed);
  const n = s.poly.length;
  const cx = s.poly.reduce((a, p) => a + p[0], 0) / n;
  const cz = s.poly.reduce((a, p) => a + p[1], 0) / n;
  const bevel = 0.05;
  const topIn = s.poly.map(([x, z]) => {
    const dx = cx - x;
    const dz = cz - z;
    const d = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(x + (dx / d) * bevel, s.top + (r() - 0.5) * 0.012, z + (dz / d) * bevel);
  });
  const lip = s.poly.map(([x, z]) => new THREE.Vector3(x, s.top - bevel, z));
  const foot = s.poly.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(x + (dx / d) * s.batter, s.base, z + (dz / d) * s.batter);
  });
  // every face turned away from the slab's core (a point below the top's centre)
  const inside = new THREE.Vector3(cx, (s.top + s.base) / 2, cz);
  out.face(topIn, new THREE.Vector3(cx, s.top - 1, cz));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.face([topIn[i]!, topIn[j]!, lip[j]!, lip[i]!], inside);
    out.face([lip[i]!, lip[j]!, foot[j]!, foot[i]!], inside);
  }
}

/** A low stone from the island's rock silhouettes, scaled to its footprint and height, its base sunk to `base`. */
export function addRock(out: StoneMesh, s: EdgeStone, rocks: readonly THREE.BufferGeometry[], extraYaw = 0): void {
  const g = rocks[s.variant % 8]!;
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox!;
  const sx = (s.a * 2) / Math.max(0.01, bb.max.x - bb.min.x);
  const sz = (s.b * 2) / Math.max(0.01, bb.max.z - bb.min.z);
  // the rock's top lands at base + h; its lower part is below grade
  const sy = (s.h + 0.12) / Math.max(0.01, bb.max.y);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(s.c[0], s.base, s.c[1]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -s.yaw + extraYaw),
    new THREE.Vector3(sx, sy, sz),
  );
  out.add(g, m);
}

/** One gateway's stone in its own local frame (the portal group carries the position and yaw). */
export function gatewayGeometry(plan: GatewayPlan, rocks: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new StoneMesh();
  const id = new THREE.Matrix4();
  for (const s of plan.stones) addBlock(out, s, id);
  for (const f of plan.fill) {
    const g = rocks[f.variant % 8]!;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(f.c[0], f.c[1], f.c[2]),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw),
      new THREE.Vector3(f.s[0] / Math.max(0.01, bb.max.x - bb.min.x), f.s[1] / Math.max(0.01, bb.max.y), f.s[2] / Math.max(0.01, bb.max.z - bb.min.z)),
    );
    out.add(g, m);
  }
  return out.geometry();
}

/** The opening's membrane: the clear opening's outline, ear-clipped (the corbelled gate's stepped outline is not star-shaped). */
export function membraneGeometry(plan: GatewayPlan): THREE.BufferGeometry {
  const op = plan.opening.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(op, []);
  const pos: number[] = [];
  for (const [a, b, c] of tris) for (const k of [a, b, c]) pos.push(op[k!]!.x, op[k!]!.y, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export type { Tri };
