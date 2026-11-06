// Offline LOD simulator: for a landmark's real detail asset and a camera pose, count the piece instances drawn per
// stock under different near-level selection rules (40 m cells; D in 20 m octants; projected-size thresholds).
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { detailToCells } from "../../src/client/world/decode.ts";
import { decodeLandmark } from "../../src/world/format.ts";

const [id, camJson, ...rest] = process.argv.slice(2);
const m = JSON.parse(readFileSync("dist/client/world-data/manifest.json", "utf8"));
const lm = m.landmarks.find((l: { id: string }) => l.id === id);
const buf = readFileSync(`dist/client/world-data/${lm.asset.path}`);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const cam = JSON.parse(camJson!);
const camera = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.1, 6000);
camera.position.fromArray(cam.position);
camera.quaternion.fromArray(cam.quaternion);
camera.updateMatrixWorld();
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
const cp = camera.position;
const { cells } = detailToCells(ab, lm.placement, 40);
const CELL_FULL = Number(rest[0] ?? 55), CELL_STRUCT = Number(rest[1] ?? 120);
// (a) current rule
let a = [0, 0, 0];
for (const c of cells) {
  const ctr = new THREE.Vector3(...c.centre);
  if (!frustum.intersectsSphere(new THREE.Sphere(ctr, c.radius))) continue;
  const d = Math.max(0, cp.distanceTo(ctr) - c.radius);
  const lvl = d < CELL_FULL ? 0 : d < CELL_STRUCT ? 1 : 2;
  c.stocks.forEach((st, k) => (a[k]! += lvl === 0 ? st.tierEnd[2] : lvl === 1 ? st.tierEnd[1] : 0));
}
// (b) per-piece ideal: each piece drawn iff its own distance passes the same rule (upper bound of what spatial refinement can save)
// plus a D-specific distance (projected D section ≥ px pixels)
const pxRad = (2 * Math.tan((cam.fov * Math.PI) / 360)) / 562;
const dD = (px: number) => 0.125 / (px * pxRad);
const rules: [string, (st: number, tier: number, dist: number) => boolean][] = [
  ["per-piece, same distances", (st, tier, d) => (d < CELL_FULL ? true : d < CELL_STRUCT ? tier <= 1 : false)],
  [`per-piece, D only while ≥1.5 px (${dD(1.5).toFixed(0)} m)`, (st, tier, d) => (st === 2 && d > dD(1.5) ? false : d < CELL_FULL ? true : d < CELL_STRUCT ? tier <= 1 : false)],
  [`per-piece, D only while ≥1 px (${dD(1).toFixed(0)} m)`, (st, tier, d) => (st === 2 && d > dD(1) ? false : d < CELL_FULL ? true : d < CELL_STRUCT ? tier <= 1 : false)],
];
// octant (20 m) variant for D: level of each D piece by its 20 m sub-block's distance
const out: Record<string, number[]> = {};
const v = new THREE.Vector3();
for (const [name] of rules) out[name] = [0, 0, 0];
const oct: Record<string, number[]> = { "D in 20 m octants, D while ≥1.5 px": [0, 0, 0], "D in 20 m octants, same distances": [0, 0, 0] };
for (const c of cells) {
  const ctr = new THREE.Vector3(...c.centre);
  const cellVis = frustum.intersectsSphere(new THREE.Sphere(ctr, c.radius));
  const dCell = Math.max(0, cp.distanceTo(ctr) - c.radius);
  const lvlCell = dCell < CELL_FULL ? 0 : dCell < CELL_STRUCT ? 1 : 2;
  c.stocks.forEach((st, k) => {
    const n = st.tierEnd[2];
    // octant bounds for D
    const ob = new Map<number, { min: number[]; max: number[] }>();
    const okey = (i: number) => (st.pos[i * 3]! > c.centre[0] ? 1 : 0) | (st.pos[i * 3 + 1]! > c.centre[1] ? 2 : 0) | (st.pos[i * 3 + 2]! > c.centre[2] ? 4 : 0);
    if (k === 2) for (let i = 0; i < n; i++) {
      const o = ob.get(okey(i)) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (let a2 = 0; a2 < 3; a2++) { o.min[a2] = Math.min(o.min[a2]!, st.pos[i * 3 + a2]! - 0.5); o.max[a2] = Math.max(o.max[a2]!, st.pos[i * 3 + a2]! + 0.5); }
      ob.set(okey(i), o);
    }
    for (let i = 0; i < n; i++) {
      const tier = i < st.tierEnd[0] ? 0 : i < st.tierEnd[1] ? 1 : 2;
      v.set(st.pos[i * 3]!, st.pos[i * 3 + 1]!, st.pos[i * 3 + 2]!);
      const d = cp.distanceTo(v);
      const inView = frustum.containsPoint(v) || frustum.intersectsSphere(new THREE.Sphere(v, 4));
      if (inView) for (const [name, f] of rules) if (f(k, tier, d)) out[name]![k]!++;
      if (k !== 2) {
        if (cellVis && (lvlCell === 0 || (lvlCell === 1 && tier <= 1))) { oct["D in 20 m octants, D while ≥1.5 px"]![k]!++; oct["D in 20 m octants, same distances"]![k]!++; }
      } else {
        const o = ob.get(okey(i))!;
        const oc = new THREE.Vector3((o.min[0]! + o.max[0]!) / 2, (o.min[1]! + o.max[1]!) / 2, (o.min[2]! + o.max[2]!) / 2);
        const orad = Math.hypot(o.max[0]! - oc.x, o.max[1]! - oc.y, o.max[2]! - oc.z);
        if (!frustum.intersectsSphere(new THREE.Sphere(oc, orad))) continue;
        const dO = Math.max(0, cp.distanceTo(oc) - orad);
        const lvl = dO < CELL_FULL ? 0 : dO < CELL_STRUCT ? 1 : 2;
        if (lvl === 0 || (lvl === 1 && tier <= 1)) oct["D in 20 m octants, same distances"]![k]!++;
        if (dO <= dD(1.5) && (lvl === 0 || (lvl === 1 && tier <= 1))) oct["D in 20 m octants, D while ≥1.5 px"]![k]!++;
      }
    }
  });
}
const fmt = (x: number[]) => `B ${x[0]} M ${x[1]} D ${x[2]} → ${((x[0]! + x[1]! + x[2]!) * 12).toLocaleString("en")} camera tris`;
console.log(`${id}  current (40 m cells): ${fmt(a)}`);
for (const [k, x] of Object.entries(oct)) console.log(`${id}  ${k}: ${fmt(x)}`);
for (const [k, x] of Object.entries(out)) console.log(`${id}  ${k}: ${fmt(x)}`);
