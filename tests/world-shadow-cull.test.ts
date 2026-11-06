// Shadow-caster culling (WorldView.cullShadowCasters) must test each caster where its triangles are. An
// InstancedMesh (the landmarks' shading shells) has a unit geometry at the origin; its instances' bounds are
// the mesh's own bounding sphere. Testing the geometry's sphere culled every shell, everywhere.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { casterSphere, missesWindow } from "../src/client/world/shadow-cull.ts";

describe("shadow-caster bounds", () => {
  // a shell group 2 km from the origin: two unit boxes scaled to a 30 m colonnade wall
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2);
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(2000, 10, -1500), new THREE.Quaternion(), new THREE.Vector3(30, 20, 2));
  mesh.setMatrixAt(0, m);
  m.compose(new THREE.Vector3(2000, 10, -1470), new THREE.Quaternion(), new THREE.Vector3(30, 20, 2));
  mesh.setMatrixAt(1, m);
  mesh.computeBoundingSphere();
  mesh.updateMatrixWorld(true);
  const lx = new THREE.Vector3(1, 0, 0);
  const ly = new THREE.Vector3(0, 0, 1);

  it("an instanced caster's sphere encloses its instances, not the unit geometry at the origin", () => {
    const s = casterSphere(mesh, new THREE.Sphere());
    expect(s.center.distanceTo(new THREE.Vector3(2000, 10, -1485))).toBeLessThan(1);
    expect(s.radius).toBeGreaterThan(15);
  });

  it("is kept when the visible window lies over it, and culled when the window is elsewhere", () => {
    const s = casterSphere(mesh, new THREE.Sphere());
    expect(missesWindow(s, lx, ly, 1900, 2100, -1600, -1400)).toBe(false);
    expect(missesWindow(s, lx, ly, -100, 100, -100, 100)).toBe(true);
  });

  it("a plain mesh uses its geometry's sphere moved by its world matrix", () => {
    const plain = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
    plain.position.set(-300, 0, 800);
    plain.updateMatrixWorld(true);
    const s = casterSphere(plain, new THREE.Sphere());
    expect(s.center.x).toBeCloseTo(-300, 6);
    expect(s.center.z).toBeCloseTo(800, 6);
  });
});
