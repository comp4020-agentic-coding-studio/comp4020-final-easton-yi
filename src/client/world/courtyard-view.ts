// The home courtyard in the scene (courtyard/day-night directive §4–§5): the
// pond's basin (bed and banks drawn from the same profile the explorer stands
// on, where the terrain leaves its outline open), the still water over it, the
// platform, stepping stones, plinths and edge stones in the island's rock
// material (one merged mesh), and the white-flower meadow (one instanced
// mesh). Built once from the manifest's lighting section; disposed with the
// view. The candles are candles-view.ts's.
import * as THREE from "three";
import type { ManifestLighting } from "../../world/manifest.ts";
import { BANK_START, bedAt, flowers, pondOutline, type Courtyard, type Pond } from "../../world/courtyard.ts";
import { basinMaterial, flowerMaterial, pondWaterMaterial, type BasinUniforms } from "./materials.ts";
import { StoneMesh, addRock, addSlab } from "./stonework.ts";

/** Rebuild the pure Courtyard from the manifest (the generator wrote it from src/world/courtyard.ts). */
export function courtFromManifest(home: ManifestLighting["home"], spawn: readonly number[], yaw: number): Courtyard {
  const f: [number, number] = [-Math.sin(yaw), -Math.cos(yaw)];
  return {
    frame: { o: [spawn[0]!, spawn[2]!], y: spawn[1]!, f, l: [f[1], -f[0]] },
    pond: home.pond as Pond,
    slabs: home.slabs,
    edges: home.edges,
    candles: home.groups,
    patches: home.patches,
    meadowRocks: home.meadowRocks,
    routes: home.routes,
    approaches: home.approaches,
    bound: home.bound,
  };
}

/** Point the terrain shader's basin cut at this pond. */
export function setBasin(u: BasinUniforms, p: Pond): void {
  u.uBasinC.value.set(p.c[0], p.c[1]);
  u.uBasinU.value.set(p.u[0], p.u[1]);
  u.uBasinV.value.set(p.v[0], p.v[1]);
  u.uBasinAB.value.set(p.a, p.b);
  p.wave.forEach((w, i) => u.uBasinW.value[i]?.set(w[0], w[1], w[2]));
}

export interface CourtyardView {
  group: THREE.Group;
  water: ReturnType<typeof pondWaterMaterial>;
  flowers: { mesh: THREE.Mesh; uniforms: ReturnType<typeof flowerMaterial>["uniforms"]; count: number; total: number };
  stats: { flowers: number; stones: number; basinTriangles: number; stoneTriangles: number };
  /** Thin the meadow for a quality tier (a deterministic prefix of the placement; nothing moves). */
  setFlowerDensity(fraction: number, fadeFar: number): void;
  /** Distance culling: flowers beyond their fade, the whole courtyard beyond ~600 m (a few pixels there). */
  follow(cam: THREE.Vector3): void;
  dispose(): void;
}

/**
 * The basin: polar rings from the bed's centre out past the rim, heights from the pond's profile. Beyond the rim
 * the ring continues 0.6 m with a small negative skirt under the terrain, so the seam with the terrain (whose
 * fragments are discarded inside the outline) is covered from every angle.
 */
function basinGeometry(p: Pond): THREE.BufferGeometry {
  const rings = [0, 0.25, 0.5, 0.65, BANK_START, 0.84, 0.9, 0.95, 1.0];
  const seg = 72;
  const pos: number[] = [];
  const wet: number[] = [];
  const idx: number[] = [];
  for (const [ri, rho] of rings.entries()) {
    for (let k = 0; k < seg; k++) {
      const phi = (k / seg) * Math.PI * 2;
      const q = pondOutline(p, phi, Math.max(rho, 1e-4));
      const y = bedAt(p, rho);
      pos.push(q[0], y, q[1]);
      wet.push(1 - Math.max(0, Math.min(1, (rho - BANK_START) / (1 - BANK_START))) * 0.85 + (ri === rings.length - 1 ? -0.15 : 0));
    }
  }
  // the skirt: 0.6 m beyond the rim at the rim's height (meets the terrain), then down under it
  for (const [extra, dy] of [[0.6, 0], [0.6, -0.4]] as const) {
    for (let k = 0; k < seg; k++) {
      const phi = (k / seg) * Math.PI * 2;
      const rim = pondOutline(p, phi, 1);
      const dx = rim[0] - p.c[0];
      const dz = rim[1] - p.c[1];
      const d = Math.hypot(dx, dz) || 1;
      pos.push(rim[0] + (dx / d) * extra, p.rim - 0.004 + dy, rim[1] + (dz / d) * extra);
      wet.push(0);
    }
  }
  const nRings = rings.length + 2;
  for (let r = 0; r + 1 < nRings; r++) {
    for (let k = 0; k < seg; k++) {
      const a = r * seg + k;
      const b = r * seg + ((k + 1) % seg);
      const c = (r + 1) * seg + k;
      const d = (r + 1) * seg + ((k + 1) % seg);
      // counter-clockwise from above (y up): a, c, b and b, c, d
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aWet", new THREE.Float32BufferAttribute(wet, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** The water surface: the outline at the waterline, a little inside the rim. */
function waterGeometry(p: Pond): THREE.BufferGeometry {
  // where the bank rises through the water surface
  let lo = BANK_START;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (bedAt(p, m) < p.water) lo = m;
    else hi = m;
  }
  const rho = (lo + hi) / 2 + 0.004;
  const seg = 72;
  const pos: number[] = [p.c[0], p.water, p.c[1]];
  const idx: number[] = [];
  for (let k = 0; k < seg; k++) {
    const q = pondOutline(p, (k / seg) * Math.PI * 2, rho);
    pos.push(q[0], p.water, q[1]);
  }
  for (let k = 0; k < seg; k++) idx.push(0, 1 + ((k + 1) % seg), 1 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** One flower: a fine stem (a thin crossed pair of quads), five rounded petals and a small centre, at unit height 0.2 m. */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], k: number): void => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) part.push(k);
  };
  const h = 0.2;
  const w = 0.007;
  quad([-w, 0, 0], [w, 0, 0], [w, h, 0], [-w, h, 0], 0);
  quad([0, 0, -w], [0, 0, w], [0, h, w], [0, h, -w], 0);
  // petals: five ovals as fans around the head, tilted slightly up
  const head = h + 0.004;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const P = (r: number, side: number, lift: number): number[] => [ca * r - sa * side, head + lift, sa * r + ca * side];
    const n = 3;
    for (let j = 0; j < n; j++) {
      const t0 = j / n;
      const t1 = (j + 1) / n;
      const wid = (t: number): number => 0.014 * Math.sin(Math.PI * t) + 0.003;
      const r0 = 0.005 + 0.027 * t0;
      const r1 = 0.005 + 0.027 * t1;
      quad(P(r0, -wid(t0), 0.005 * t0), P(r1, -wid(t1), 0.005 * t1), P(r1, wid(t1), 0.005 * t1), P(r0, wid(t0), 0.005 * t0), 1);
    }
  }
  // the centre
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2;
    pos.push(0, head + 0.006, 0, Math.cos(a1) * 0.008, head + 0.004, Math.sin(a1) * 0.008, Math.cos(a0) * 0.008, head + 0.004, Math.sin(a0) * 0.008);
    part.push(2, 2, 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  g.computeBoundingSphere();
  return g;
}

export function createCourtyard(court: Courtyard, rockMaterial: THREE.Material, rocks: readonly THREE.BufferGeometry[], ground: (x: number, z: number) => number): CourtyardView {
  const group = new THREE.Group();
  group.name = "courtyard";
  const p = court.pond;
  // basin
  const basinGeo = basinGeometry(p);
  const basinMat = basinMaterial();
  const basin = new THREE.Mesh(basinGeo, basinMat);
  basin.receiveShadow = true;
  basin.castShadow = false;
  group.add(basin);
  // water
  const water = pondWaterMaterial();
  const waterMesh = new THREE.Mesh(waterGeometry(p), water.material);
  waterMesh.renderOrder = 1;
  waterMesh.receiveShadow = true;
  group.add(waterMesh);
  // stones: slabs (platform, stepping stones, candle stones, plinths), edge stones and meadow rocks, one mesh
  const sm = new StoneMesh();
  for (const s of court.slabs) addSlab(sm, s);
  for (const e of court.edges) addRock(sm, e, rocks);
  for (const e of court.meadowRocks) addRock(sm, e, rocks);
  const stoneGeo = sm.geometry();
  const stones = new THREE.Mesh(stoneGeo, rockMaterial);
  stones.castShadow = true;
  stones.receiveShadow = true;
  group.add(stones);
  // flowers: instanced over the deterministic placement, roots on the ground
  const list = flowers(court);
  const base = flowerGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", base.getAttribute("position"));
  geo.setAttribute("aPart", base.getAttribute("aPart"));
  const iFlower = new Float32Array(list.length * 4);
  const iShape = new Float32Array(list.length * 3);
  // a stable order that keeps every patch's look when thinned: a hash of each flower's seed, so a prefix is an even sample
  const order = list.map((f, i) => ({ f, i, k: (f.s * 7919 + f.yaw * 104729) % 1 })).sort((a, b) => a.k - b.k);
  order.forEach(({ f }, j) => {
    iFlower.set([f.x, ground(f.x, f.z) - 0.01, f.z, f.yaw], j * 4);
    iShape.set([f.h / 0.2, f.lean, f.s], j * 3);
  });
  geo.setAttribute("iFlower", new THREE.InstancedBufferAttribute(iFlower, 4));
  geo.setAttribute("iShape", new THREE.InstancedBufferAttribute(iShape, 3));
  geo.instanceCount = list.length;
  // bounds: the meadow's extent (for camera culling: no flower is drawn when the home is out of view)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of list) {
    x0 = Math.min(x0, f.x);
    x1 = Math.max(x1, f.x);
    z0 = Math.min(z0, f.z);
    z1 = Math.max(z1, f.z);
  }
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, p.rim, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0) / 2 + 1);
  const fm = flowerMaterial();
  let flowerFar = 46;
  const centre = new THREE.Vector3(court.bound.c[0], p.rim, court.bound.c[1]);
  const meadowR = court.bound.r;
  const flowerMesh = new THREE.Mesh(geo, fm.material);
  flowerMesh.castShadow = false;
  flowerMesh.receiveShadow = true;
  flowerMesh.name = "flowers";
  group.add(flowerMesh);
  const view: CourtyardView = {
    group,
    water,
    flowers: { mesh: flowerMesh, uniforms: fm.uniforms, count: list.length, total: list.length },
    stats: { flowers: list.length, stones: court.slabs.length + court.edges.length + court.meadowRocks.length, basinTriangles: (basinGeo.index?.count ?? 0) / 3, stoneTriangles: stoneGeo.getAttribute("position").count / 3 },
    setFlowerDensity(fraction, fadeFar) {
      const n = Math.max(0, Math.min(list.length, Math.round(list.length * fraction)));
      geo.instanceCount = n;
      view.flowers.count = n;
      fm.uniforms.uFade.value.set(fadeFar * 0.62, fadeFar);
      flowerFar = fadeFar;
    },
    follow(cam) {
      const d = cam.distanceTo(centre);
      flowerMesh.visible = d < flowerFar + meadowR + 2;
      group.visible = d < 600;
    },
    dispose() {
      basinGeo.dispose();
      basinMat.dispose();
      waterMesh.geometry.dispose();
      water.material.dispose();
      stoneGeo.dispose();
      base.dispose();
      geo.dispose();
      fm.material.dispose();
    },
  };
  return view;
}
