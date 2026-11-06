// Development inspector renderer (brief §7.3, Appendix C1.3): one landmark's
// real detail asset in a Three.js viewport with the world's timber, sun and
// shadows, filtered by stage, course and component, with fixed review cameras
// (plan, front, side, 45°, eye height 1.65 m, detail). Rendering is on demand
// (OrbitControls change / selection change), one frame in flight at a time.
// Not part of the player experience; only reachable with the test flag.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { decodeLandmark, type DecodedLandmark } from "../../../world/format.ts";
import { STAGES, STOCK_IDS, STOCKS } from "../../../world/core.ts";
import { shellMaterials, timberMaterial } from "../materials.ts";
import type { ManifestLandmark } from "../../../world/manifest.ts";
import { releaseShared, sharedTexturesOf } from "../../scene/release-shared.ts";

export type ReviewCamera = "plan" | "front" | "side" | "45" | "eye" | "detail";

export interface Selection {
  stages: boolean[];
  /** One course-table index (the manifest's `courses`), or null for all courses. */
  course: number | null;
  /** Component indices to show, or null for all. */
  components: Set<number> | null;
}

export interface Counts {
  shown: number;
  B: number;
  M: number;
  D: number;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
}

export class InspectView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
  private controls: OrbitControls;
  private controlsRoot: Node;
  private sun = new THREE.DirectionalLight(new THREE.Color("#fff1dc"), 2.6);
  private box: THREE.BoxGeometry[] = [];
  private mats: { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }[] = [];
  private meshes: THREE.Mesh[] = [];
  private ground: THREE.Mesh;
  private shellMats = shellMaterials();
  private shellGeo = { box: new THREE.BoxGeometry(2, 2, 2), cyl: new THREE.CylinderGeometry(1, 1, 2, 20, 1, false) };
  private shells: THREE.InstancedMesh[] = [];
  private data: DecodedLandmark | null = null;
  private raf = 0;
  private resize: ResizeObserver;
  private host: HTMLElement;
  private centre = new THREE.Vector3();
  private size = new THREE.Vector3(1, 1, 1);
  disposed = false;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    this.renderer.domElement.className = "inspect-canvas";
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#c9dbe4");
    this.scene.add(new THREE.HemisphereLight(new THREE.Color("#dbe9f2"), new THREE.Color("#6b6a4c"), 0.8));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.4;
    this.scene.add(this.sun, this.sun.target);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color("#8b9a6a"), roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    for (const sid of STOCK_IDS) {
      const s = STOCKS[sid];
      this.box.push(new THREE.BoxGeometry(s.length, s.section, s.section));
      this.mats.push(timberMaterial(s.length));
    }
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controlsRoot = this.renderer.domElement.getRootNode();
    this.controls.addEventListener("change", this.invalidate);
    this.resize = new ResizeObserver(() => this.syncSize());
    this.resize.observe(host);
    this.syncSize();
  }

  /** Load a detail asset (SWLM v3) already fetched by the page. */
  setAsset(buffer: ArrayBuffer): void {
    this.data = decodeLandmark(buffer);
  }

  /** The landmark's rear shading shells (local space), as the world draws them; [] hides them. */
  setShells(list: ManifestLandmark["shells"]): void {
    for (const m of this.shells) {
      this.scene.remove(m);
      m.dispose();
    }
    this.shells = [];
    const by = new Map<string, ManifestLandmark["shells"]>();
    for (const sh of list) {
      const k = `${sh.shape}|${sh.kind}`;
      by.set(k, [...(by.get(k) ?? []), sh]);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [k, items] of by) {
      const [shape, kind] = k.split("|") as ["box" | "cyl", "shade" | "plank" | "glass"];
      const mesh = new THREE.InstancedMesh(this.shellGeo[shape], this.shellMats[kind], items.length);
      items.forEach((sh, i) => {
        q.set(sh.q[0], sh.q[1], sh.q[2], sh.q[3]);
        m4.compose(new THREE.Vector3(sh.c[0], sh.c[1], sh.c[2]), q, new THREE.Vector3(sh.h[0], sh.h[1], sh.h[2]));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = kind !== "glass";
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.shells.push(mesh);
    }
    this.invalidate();
  }

  get decoded(): DecodedLandmark | null {
    return this.data;
  }

  /** Rebuild the shown pieces for a selection; returns counts and the shown bounds. */
  select(sel: Selection): Counts {
    const d = this.data;
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
    if (!d) return { shown: 0, B: 0, M: 0, D: 0, bounds: null };
    const inv = 1 / d.scale;
    const keep = new Uint8Array(d.count);
    const per = [0, 0, 0];
    const stockOf = (i: number): number => {
      let t = 0;
      while (t < 2 && i >= d.tierStart[t + 1]!) t++;
      const r = d.stockRuns[t]!;
      return i >= r[2]! ? 2 : i >= r[1]! ? 1 : 0;
    };
    const stock = new Uint8Array(d.count);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < d.count; i++) {
      if (!sel.stages[d.stage[i]!]) continue;
      if (sel.components && !sel.components.has(d.comp[i]!)) continue;
      if (sel.course !== null && d.course[i] !== sel.course) continue;
      keep[i] = 1;
      const st = stockOf(i);
      stock[i] = st;
      per[st]!++;
      for (let a = 0; a < 3; a++) {
        const v = d.pos[i * 3 + a]! * inv + d.min[a]!;
        if (v < min[a]!) min[a] = v;
        if (v > max[a]!) max[a] = v;
      }
    }
    for (let st = 0; st < 3; st++) {
      const n = per[st]!;
      if (!n) continue;
      const pos = new Float32Array(n * 3);
      const quat = new Float32Array(n * 4);
      const seed = new Float32Array(n);
      let k = 0;
      for (let i = 0; i < d.count; i++) {
        if (!keep[i] || stock[i] !== st) continue;
        for (let a = 0; a < 3; a++) pos[k * 3 + a] = d.pos[i * 3 + a]! * inv + d.min[a]!;
        for (let a = 0; a < 4; a++) quat[k * 4 + a] = d.quat[i * 4 + a]! / 32767;
        seed[k] = (i * 7919) % 10007;
        k++;
      }
      const g = new THREE.InstancedBufferGeometry();
      const base = this.box[st]!;
      g.index = base.index;
      g.setAttribute("position", base.getAttribute("position"));
      g.setAttribute("normal", base.getAttribute("normal"));
      g.setAttribute("iPos", new THREE.InstancedBufferAttribute(pos, 3));
      g.setAttribute("iQuat", new THREE.InstancedBufferAttribute(quat, 4));
      g.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seed, 1));
      g.instanceCount = n;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2), Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2 + 8);
      const mesh = new THREE.Mesh(g, this.mats[st]!.material);
      mesh.customDepthMaterial = this.mats[st]!.depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    const shown = per[0]! + per[1]! + per[2]!;
    const bounds = shown ? { min: min as [number, number, number], max: max as [number, number, number] } : null;
    if (bounds) {
      this.centre.set((min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2);
      this.size.set(Math.max(1, max[0]! - min[0]!), Math.max(1, max[1]! - min[1]!), Math.max(1, max[2]! - min[2]!));
      const span = Math.max(this.size.x, this.size.z) * 3 + 60;
      this.ground.scale.set(span, span, 1);
      this.ground.position.set(this.centre.x, Math.min(0, min[1]!) - 0.02, this.centre.z);
      const r = Math.hypot(this.size.x, this.size.y, this.size.z) / 2 + 4;
      const sc = this.sun.shadow.camera;
      sc.left = sc.bottom = -r;
      sc.right = sc.top = r;
      sc.near = 1;
      sc.far = r * 4;
      sc.updateProjectionMatrix();
      this.sun.target.position.copy(this.centre);
      this.sun.position.copy(this.centre).add(new THREE.Vector3(-0.45, 0.62, -0.64).multiplyScalar(r * 2));
    }
    this.invalidate();
    return { shown, B: per[0]!, M: per[1]!, D: per[2]!, bounds };
  }

  /** Fixed review cameras around the current selection's bounds. */
  view(kind: ReviewCamera): void {
    const c = this.centre;
    const s = this.size;
    const r = Math.max(s.x, s.y, s.z);
    const fit = (r / 2 / Math.tan((55 * Math.PI) / 360)) * 1.25;
    const minY = c.y - s.y / 2;
    if (kind === "plan") {
      this.camera.position.set(c.x, c.y + fit + s.y / 2, c.z + 0.01);
      this.controls.target.copy(c);
    } else if (kind === "front") {
      this.camera.position.set(c.x, c.y, c.z - fit - s.z / 2);
      this.controls.target.copy(c);
    } else if (kind === "side") {
      this.camera.position.set(c.x + fit + s.x / 2, c.y, c.z);
      this.controls.target.copy(c);
    } else if (kind === "45") {
      const d = (fit + Math.max(s.x, s.z) / 2) * 0.8;
      this.camera.position.set(c.x + d, c.y + d * 0.6, c.z - d);
      this.controls.target.copy(c);
    } else if (kind === "eye") {
      // a person standing in front, 1.65 m eye height, looking at the middle: scale reads from the ground
      const back = Math.max(6, s.z / 2 + Math.min(40, s.y * 0.6));
      this.camera.position.set(c.x, Math.max(0, minY) + 1.65, c.z - back);
      this.controls.target.set(c.x, Math.max(0, minY) + Math.min(s.y * 0.55, 60), c.z);
    } else {
      // close in on the front-right corner, always from outside the selection's bounds (a large
      // building's smallest dimension would otherwise put the camera inside its roof)
      const d = Math.max(4, Math.min(s.x, s.y, s.z) * 1.4 + 3);
      const y = c.y + s.y * 0.35;
      this.camera.position.set(c.x + s.x / 2 + d * 0.35, y, c.z - s.z / 2 - d * 0.6);
      this.controls.target.set(c.x + s.x * 0.25, y - s.y * 0.1, c.z - s.z * 0.25);
    }
    this.controls.update();
    this.invalidate();
  }

  private syncSize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate = (): void => {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
    });
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    const c = this.controls as unknown as { _interceptControlDown?: EventListener; _interceptControlUp?: EventListener };
    if (c._interceptControlDown) this.controlsRoot.removeEventListener("keydown", c._interceptControlDown, { capture: true });
    if (c._interceptControlUp) this.controlsRoot.removeEventListener("keyup", c._interceptControlUp, { capture: true });
    this.controls.removeEventListener("change", this.invalidate);
    this.controls.dispose();
    const shared = sharedTexturesOf(this.renderer, this.scene);
    for (const m of this.meshes) m.geometry.dispose();
    for (const m of this.shells) m.dispose();
    this.shellGeo.box.dispose();
    this.shellGeo.cyl.dispose();
    for (const m of Object.values(this.shellMats)) m.dispose();
    for (const g of this.box) g.dispose();
    for (const m of this.mats) {
      m.material.dispose();
      m.depth.dispose();
    }
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    releaseShared(shared);
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export { STAGES };
