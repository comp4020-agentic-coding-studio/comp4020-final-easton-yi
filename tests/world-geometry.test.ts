// Client geometry built in Node (three.js, no WebGL): the river ribbon faces up and sits at its water heights,
// terrain tiles with per-chunk steps keep identical edges where chunks meet and close every step change with a
// skirt, and the folded stick geometries hold exactly the faces the shaders mirror (triangles.md).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TerrainField, createRiver, tileGeometry } from "../src/client/world/environment.ts";
import type { WorldManifest } from "../src/world/manifest.ts";

describe("river ribbon", () => {
  // a bend: east, then north-east, then north, falling 10 m
  const pts = [
    [0, 10, 0],
    [40, 8, 0],
    [80, 5, 40],
    [80, 0, 100],
  ];
  const { mesh } = createRiver(pts, 12);
  const g = mesh.geometry;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const idx = g.index!;

  it("every triangle faces up (a front-sided water material is seen from above)", () => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    expect(idx.count / 3).toBeGreaterThan(10);
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t));
      b.fromBufferAttribute(pos, idx.getX(t + 1));
      c.fromBufferAttribute(pos, idx.getX(t + 2));
      n.crossVectors(b.clone().sub(a), c.clone().sub(a));
      expect(n.y, `triangle ${t / 3}`).toBeGreaterThan(0);
    }
  });

  it("is 2 × half wide and follows the water's height along the centre line", () => {
    for (let i = 0; i + 1 < pos.count; i += 2) {
      const l = new THREE.Vector3().fromBufferAttribute(pos, i);
      const r = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      expect(Math.hypot(l.x - r.x, l.z - r.z)).toBeCloseTo(24, 3);
      expect(l.y).toBeCloseTo(r.y, 6);
      expect(l.y).toBeLessThanOrEqual(10 + 1e-6);
      expect(l.y).toBeGreaterThanOrEqual(0 - 1e-6);
    }
    // ends at the last point's height
    expect(pos.getY(pos.count - 1)).toBeCloseTo(0, 6);
  });
});

describe("terrain tile with per-chunk steps", () => {
  const t = { chunk: 128, min: [0, 0], chunksX: 4, chunksZ: 4, n: 32, heightMin: 0, heightScale: 1, path: "x", hash: "x", bytes: 1 } as unknown as WorldManifest["terrain"];
  const field = new TerrainField(t);
  // a rough field: a ridge plus ripples, so coarse and fine steps differ
  for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) {
    const h = new Float32Array(33 * 33);
    for (let j = 0; j <= 32; j++) for (let i = 0; i <= 32; i++) {
      const x = cx * 128 + i * 4;
      const z = cz * 128 + j * 4;
      h[j * 33 + i] = 40 * Math.exp(-(((x - 256) / 90) ** 2)) + 3 * Math.sin(x / 13) * Math.cos(z / 17);
    }
    field.set(cz * 4 + cx, h);
  }

  it("samples the field exactly at every vertex (shared edges are bit-identical heights)", () => {
    const steps = [1, 2, 4, 8, 2, 1, 1, 4, 8, 8, 2, 1, 4, 2, 1, 8];
    const g = tileGeometry(field, t, 0, 0, 4, steps)!;
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    let surface = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const h = field.height(p.getX(i), p.getZ(i));
      if (Math.abs(y - h) < 1e-4) surface++;
      else expect(h - y, "a skirt vertex hangs 6 m below its edge").toBeCloseTo(6, 3);
    }
    expect(surface).toBeGreaterThan(p.count / 2);
  });

  it("puts a skirt on every chunk edge whose neighbour has another step, and on the tile's own edges", () => {
    const count = (steps: number[]): number => tileGeometry(field, t, 0, 0, 4, steps)!.index!.count / 3;
    const cells = (steps: number[]): number => steps.reduce((a, s) => a + 2 * (32 / s) ** 2, 0);
    // all chunks equal: only the 16 outer chunk edges carry skirts (2 triangles per edge segment)
    const even = Array(16).fill(4);
    expect(count(even) - cells(even)).toBe(16 * 2 * (32 / 4));
    // one chunk finer than its four neighbours: its four edges and the neighbours' facing edges add skirts
    const one = [...even];
    one[5] = 1;
    const extra = count(one) - cells(one) - 16 * 2 * (32 / 4);
    expect(extra).toBe(4 * 2 * 32 + 4 * 2 * 8);
  });
});

describe("folded stick geometry (the shaders mirror the kept faces)", () => {
  it("a stick holds the +x, +y, +z faces of its box and a chain sleeve the +y, +z faces", async () => {
    // the same construction WorldView uses: BoxGeometry faces are +x, −x, +y, −y, +z, −z, six indices each
    const box = new THREE.BoxGeometry(4, 0.5, 0.5);
    const index = Array.from(box.index!.array);
    const nrm = box.getAttribute("normal") as THREE.BufferAttribute;
    const faceNormal = (f: number): number[] => {
      const v = index[f * 6]!;
      return [nrm.getX(v), nrm.getY(v), nrm.getZ(v)];
    };
    expect([0, 2, 4].map(faceNormal)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    // the fold mirrors a face through its own axis and one in-plane axis (n + n.yzx): it lands on the opposite face
    for (const f of [0, 2, 4]) {
      const n = faceNormal(f);
      const m = [1 - 2 * (n[0]! + n[1]!), 1 - 2 * (n[1]! + n[2]!), 1 - 2 * (n[2]! + n[0]!)];
      for (let k = 0; k < 6; k++) {
        const v = index[f * 6 + k]!;
        const p = [box.getAttribute("position").getX(v) * m[0]!, box.getAttribute("position").getY(v) * m[1]!, box.getAttribute("position").getZ(v) * m[2]!];
        // the mirrored vertex is a vertex of the opposite face (its coordinate on the face axis negated)
        const axis = n.findIndex((x) => x !== 0);
        const half = [2, 0.25, 0.25][axis]!;
        expect(p[axis]!).toBeCloseTo(-half, 6);
      }
      // winding is kept: two axes negated is a rotation, not a reflection
      expect(m.filter((x) => x < 0).length).toBe(2);
    }
    box.dispose();
  });
});
