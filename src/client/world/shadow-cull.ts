// The world-space bounding sphere a shadow caster can darken from, for WorldView.cullShadowCasters.
// An InstancedMesh's geometry sphere bounds one instance at the origin; its instances' bounds are the
// mesh's own `boundingSphere` (computeBoundingSphere), already in the mesh's local space. Reading the
// geometry's sphere there put every shell at the world origin, so the cull dropped all of them from the
// shadow pass and sunlight came through the colonnades they shade (triangles.md, "a regression found").
import * as THREE from "three";

export function casterSphere(o: THREE.Object3D, target: THREE.Sphere): THREE.Sphere {
  const inst = o as THREE.InstancedMesh;
  if (inst.isInstancedMesh) {
    if (!inst.boundingSphere) inst.computeBoundingSphere();
    return target.copy(inst.boundingSphere!).applyMatrix4(o.matrixWorld);
  }
  const g = (o as THREE.Mesh).geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  return target.copy(g.boundingSphere!).applyMatrix4(o.matrixWorld);
}

/** Whether a caster's sphere misses a light-space window [x0, x1] × [y0, y1] on axes lx, ly. */
export function missesWindow(s: THREE.Sphere, lx: THREE.Vector3, ly: THREE.Vector3, x0: number, x1: number, y0: number, y1: number): boolean {
  const u = s.center.dot(lx);
  const v = s.center.dot(ly);
  return u + s.radius < x0 || u - s.radius > x1 || v + s.radius < y0 || v - s.radius > y1;
}
