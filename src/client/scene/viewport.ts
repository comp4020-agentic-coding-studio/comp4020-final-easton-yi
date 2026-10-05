// The 3D viewport. It owns the Three.js scene directly. It renders
// authoritative stick transforms (interpolated ~100 ms behind arrival, never
// extrapolated), the local held ghost and its handles, and partners' ghosts.
// Each window controls its own camera; nothing arriving from the network
// moves it (CAM-01).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { woodMaterial, tableMaterial } from "./wood.ts";
import {
  beginCenterDrag,
  centerDrag,
  draftEnds,
  draftPose,
  endpointPitch,
  endpointYaw,
  heightDrag,
  PITCH_TARGETS,
  snapAngle,
  YAW_TARGETS,
  type CenterDragStart,
  type Dims,
  type Draft,
  type Handle,
  type Ray,
  type TableDims,
} from "../placement-math.ts";
import { boxCorners, stickBox, type Vec3 } from "../../shared/geometry.ts";
import type { WireBody } from "../../shared/protocol.ts";

export const PERSON_COLORS = ["#2F6FB2", "#B5532E", "#7A4FA3", "#2E8A6B", "#A8862A", "#B23A6E", "#4C6A1E", "#3D5A80"];
export const PERSON_SHAPES = ["●", "▲", "■", "◆", "★", "✚", "⬟", "⬢"];

interface Sample {
  t: number;
  p: THREE.Vector3;
  q: THREE.Quaternion;
}

export interface ViewportEvents {
  onDraftChange?: (d: Draft, phase: "start" | "move" | "end", handle: Handle) => void;
  onSelect?: (stickId: string | null, point: Vec3 | null) => void;
  onCameraGestureEnd?: () => void;
  onParallelFallback?: (active: boolean) => void;
}

export type ViewName = "default" | "top" | "side";

const prefersReducedMotion = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private container: HTMLElement;
  private labels: HTMLElement;
  private dims: Dims;
  private table: TableDims;
  private events: ViewportEvents;
  private mode: "workshop" | "exhibit";

  private geometry: THREE.BufferGeometry;
  private sticks: THREE.InstancedMesh;
  private seedAttr: THREE.InstancedBufferAttribute;
  private ids: string[] = [];
  private index = new Map<string, number>();
  private samples = new Map<string, Sample[]>();
  private selectedOutline: THREE.LineSegments;
  private selected: string | null = null;

  private draft: Draft | null = null;
  private draftGroup = new THREE.Group();
  private draftMesh: THREE.Mesh;
  private draftOutline: THREE.LineSegments;
  private draftShadowLine: THREE.Line;
  private handles = new Map<Handle, THREE.Mesh>();
  private draftEditable = false;
  private draftStatus: "ok" | "warn" | "bad" | "pending" = "ok";

  private remote = new Map<string, { group: THREE.Group; label: HTMLElement; target: Draft | null; pose: { p: THREE.Vector3; q: THREE.Quaternion } }>();
  private pushArrow: THREE.ArrowHelper | null = null;

  private drag: {
    handle: Handle;
    pointerId: number;
    startPx: [number, number];
    startDraft: Draft;
    center?: CenterDragStart;
    yawSnap: number | null;
    pitchSnap: number | null;
  } | null = null;
  private orbitActive = false;
  inputMode: "observe" | "adjust" = "observe";
  snapping = true;
  reducedMotion = prefersReducedMotion();
  private raf = 0;
  private disposed = false;
  private lastFrame = performance.now();
  private slowFrames = 0;
  private quality = 2;
  private transition: { from: { t: THREE.Vector3; p: THREE.Vector3 }; to: { t: THREE.Vector3; p: THREE.Vector3 }; start: number } | null = null;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, opts: { dims: Dims; table: TableDims; mode: "workshop" | "exhibit" } & ViewportEvents) {
    this.container = container;
    this.dims = opts.dims;
    this.table = opts.table;
    this.events = opts;
    this.mode = opts.mode;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio()));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = "scene-canvas";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);
    this.labels = document.createElement("div");
    this.labels.className = "scene-labels";
    this.labels.setAttribute("aria-hidden", "true");
    container.appendChild(this.labels);

    this.scene.background = new THREE.Color("#F4F1EA");
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.2, 600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.025;
    this.controls.maxPolarAngle = 1.5;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 160;
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = 0.12;
    this.controls.zoomSpeed = 0.8;
    this.controls.rotateSpeed = 0.7;
    this.controls.addEventListener("start", () => (this.orbitActive = true));
    this.controls.addEventListener("end", () => {
      if (this.orbitActive) this.events.onCameraGestureEnd?.();
      this.orbitActive = false;
    });
    this.setView("default", true);

    // lights
    this.scene.add(new THREE.HemisphereLight("#fffaf0", "#b9ab92", 0.85));
    const sun = new THREE.DirectionalLight("#fff4e2", 2.2);
    sun.position.set(22, 46, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.near = 1;
    sc.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    this.scene.add(sun.target);

    // table: its cylinder matches the collider exactly (WORLD-02)
    const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(this.table.radius, this.table.radius, this.table.thickness, 128), tableMaterial());
    tableMesh.position.y = this.table.top - this.table.thickness / 2;
    tableMesh.receiveShadow = true;
    tableMesh.castShadow = true;
    this.scene.add(tableMesh);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.ShadowMaterial({ opacity: 0.08 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = this.table.top - this.table.thickness - 9;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // real sticks: one instanced mesh, small visual bevel (≤ 0.03 u)
    this.geometry = new RoundedBoxGeometry(this.dims.length, this.dims.height, this.dims.width, 2, 0.03);
    this.sticks = new THREE.InstancedMesh(this.geometry, woodMaterial({ instanced: true }), 256);
    this.seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(256), 1);
    this.geometry.setAttribute("aSeed", this.seedAttr);
    this.sticks.count = 0;
    this.sticks.castShadow = true;
    this.sticks.receiveShadow = true;
    this.sticks.frustumCulled = false;
    this.scene.add(this.sticks);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(this.dims.length + 0.06, this.dims.height + 0.06, this.dims.width + 0.06));
    this.selectedOutline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: "#1f3a2a" }));
    this.selectedOutline.visible = false;
    this.scene.add(this.selectedOutline);

    // local ghost
    this.draftMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.dims.length, this.dims.height, this.dims.width),
      new THREE.MeshStandardMaterial({ color: "#C9A27A", transparent: true, opacity: 0.45, depthWrite: false, roughness: 0.8 }),
    );
    this.draftMesh.castShadow = true;
    this.draftOutline = new THREE.LineSegments(edges.clone(), new THREE.LineBasicMaterial({ color: "#1f3a2a" }));
    this.draftGroup.add(this.draftMesh, this.draftOutline);
    this.draftGroup.visible = false;
    this.scene.add(this.draftGroup);
    this.draftShadowLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: "#476451", dashSize: 0.3, gapSize: 0.2 }),
    );
    this.draftShadowLine.visible = false;
    this.scene.add(this.draftShadowLine);
    const handleMat = (c: string): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.95 });
    const sphere = new THREE.SphereGeometry(0.32, 20, 14);
    const cone = new THREE.ConeGeometry(0.28, 0.6, 16);
    for (const h of ["endA", "endB"] as const) this.handles.set(h, new THREE.Mesh(sphere, handleMat("#2F5F45")));
    for (const h of ["pitchA", "pitchB"] as const) this.handles.set(h, new THREE.Mesh(cone, handleMat("#8A5A2B")));
    const heightHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 10), handleMat("#3D5A80"));
    const tipUp = new THREE.Mesh(cone, handleMat("#3D5A80"));
    tipUp.position.y = 0.75;
    const tipDown = new THREE.Mesh(cone, handleMat("#3D5A80"));
    tipDown.position.y = -0.75;
    tipDown.rotation.x = Math.PI;
    heightHandle.add(tipUp, tipDown);
    this.handles.set("height", heightHandle);
    for (const m of this.handles.values()) {
      m.renderOrder = 10;
      m.visible = false;
      this.scene.add(m);
    }

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown, { capture: true });
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("lostpointercapture", this.onPointerUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", this.cancelDrag);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  private maxPixelRatio(): number {
    return matchMedia("(pointer: coarse)").matches ? 1.5 : 2;
  }

  // ---------------------------------------------------------------- authoritative sticks

  /** Replace everything with a full authoritative state (join, resync, restore). */
  setBodies(bodies: WireBody[], seeds: Map<string, number>): void {
    this.ids = [];
    this.index.clear();
    this.samples.clear();
    this.addBodies(bodies, seeds);
    if (this.selected && !this.index.has(this.selected)) this.select(null);
  }

  addBodies(bodies: WireBody[], seeds: Map<string, number>): void {
    const t = performance.now();
    for (const b of bodies) {
      if (this.index.has(b[0])) continue;
      const i = this.ids.length;
      this.ids.push(b[0]);
      this.index.set(b[0], i);
      this.seedAttr.setX(i, seeds.get(b[0]) ?? i * 7919);
      this.samples.set(b[0], [{ t: t - 1000, p: new THREE.Vector3(b[1], b[2], b[3]), q: new THREE.Quaternion(b[4], b[5], b[6], b[7]) }]);
    }
    this.seedAttr.needsUpdate = true;
    this.sticks.count = this.ids.length;
  }

  removeBodies(ids: string[]): void {
    const remove = new Set(ids);
    const keep = this.ids.filter((id) => !remove.has(id));
    const seeds = new Map(keep.map((id) => [id, this.seedAttr.getX(this.index.get(id)!)]));
    const samples = new Map(keep.map((id) => [id, this.samples.get(id)!]));
    this.ids = keep;
    this.index = new Map(keep.map((id, i) => [id, i]));
    this.samples = samples;
    keep.forEach((id, i) => this.seedAttr.setX(i, seeds.get(id)!));
    this.seedAttr.needsUpdate = true;
    this.sticks.count = keep.length;
    if (this.selected && remove.has(this.selected)) this.select(null);
  }

  /** A full authoritative frame: buffered and rendered ~100 ms behind arrival. */
  pushFrame(bodies: WireBody[]): void {
    const t = performance.now();
    for (const b of bodies) {
      const list = this.samples.get(b[0]);
      if (!list) continue;
      list.push({ t, p: new THREE.Vector3(b[1], b[2], b[3]), q: new THREE.Quaternion(b[4], b[5], b[6], b[7]) });
      if (list.length > 12) list.splice(0, list.length - 12);
    }
  }

  /** Current rendered pose of a stick (for focus, push and the advisory obstacle set). */
  stickPose(id: string): { p: Vec3; q: [number, number, number, number] } | null {
    const list = this.samples.get(id);
    const last = list?.[list.length - 1];
    if (!last) return null;
    return { p: [last.p.x, last.p.y, last.p.z], q: [last.q.x, last.q.y, last.q.z, last.q.w] };
  }

  allPoses(): { id: string; p: Vec3; q: [number, number, number, number] }[] {
    return this.ids.map((id) => ({ id, ...this.stickPose(id)! }));
  }

  // ---------------------------------------------------------------- ghosts

  setDraft(d: Draft | null, opts: { editable: boolean; status: "ok" | "warn" | "bad" | "pending" }): void {
    this.draft = d;
    this.draftEditable = opts.editable;
    this.draftStatus = opts.status;
    const color = { ok: "#1f3a2a", warn: "#8a5a00", bad: "#a02a1e", pending: "#5f6b63" }[opts.status];
    (this.draftOutline.material as THREE.LineBasicMaterial).color.set(color);
    (this.draftMesh.material as THREE.MeshStandardMaterial).opacity = opts.status === "pending" ? 0.3 : 0.45;
    (this.draftMesh.material as THREE.MeshStandardMaterial).color.set(opts.status === "bad" ? "#d29a8c" : "#C9A27A");
    this.syncDraft();
  }

  private syncDraft(): void {
    const d = this.draft;
    this.draftGroup.visible = !!d;
    this.draftShadowLine.visible = !!d;
    for (const m of this.handles.values()) m.visible = !!d && this.draftEditable;
    if (!d) return;
    const pose = draftPose(d);
    this.draftGroup.position.set(...pose.p);
    this.draftGroup.quaternion.set(...pose.q);
    const ends = draftEnds(d, this.dims.length);
    const lift = new THREE.Vector3(0, 1.1, 0);
    this.handles.get("endA")!.position.set(...ends.A);
    this.handles.get("endB")!.position.set(...ends.B);
    this.handles.get("pitchA")!.position.set(...ends.A).add(lift);
    this.handles.get("pitchB")!.position.set(...ends.B).add(lift);
    const perp = new THREE.Vector3(-Math.sin(d.yaw), 0, Math.cos(d.yaw)).multiplyScalar(1.7);
    this.handles.get("height")!.position.set(...pose.p).add(perp);
    // dashed guide straight down to whatever is below (or the table plane)
    const lowest = Math.min(...boxCorners(stickBox(pose, this.dims)).map((c) => c[1]));
    const below = this.surfaceBelow(pose.p);
    const g = this.draftShadowLine.geometry as THREE.BufferGeometry;
    g.setFromPoints([new THREE.Vector3(pose.p[0], lowest, pose.p[2]), new THREE.Vector3(pose.p[0], below, pose.p[2])]);
    this.draftShadowLine.computeLineDistances();
  }

  private surfaceBelow(p: Vec3): number {
    const ray = new THREE.Raycaster(new THREE.Vector3(p[0], 200, p[2]), new THREE.Vector3(0, -1, 0));
    ray.far = 400;
    const hits = ray.intersectObject(this.sticks, false).filter((h) => h.point.y < p[1]);
    const top = Math.hypot(p[0], p[2]) <= this.table.radius ? this.table.top : this.table.top - this.table.thickness - 9;
    return hits.length ? Math.max(top, hits[0]!.point.y) : top;
  }

  setRemoteDrafts(list: { leaseId: string; displayName: string; color: number; pose: { p: Vec3; q: [number, number, number, number] } }[]): void {
    const seen = new Set<string>();
    for (const r of list) {
      seen.add(r.leaseId);
      let entry = this.remote.get(r.leaseId);
      const color = PERSON_COLORS[r.color % PERSON_COLORS.length]!;
      if (!entry) {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(this.dims.length, this.dims.height, this.dims.width),
          new THREE.MeshStandardMaterial({ color: "#E8DCCB", transparent: true, opacity: 0.32, depthWrite: false }),
        );
        const outline = new THREE.LineSegments(this.selectedOutline.geometry, new THREE.LineBasicMaterial({ color }));
        group.add(mesh, outline);
        this.scene.add(group);
        const label = document.createElement("div");
        label.className = "ghost-label";
        label.style.setProperty("--person", color);
        this.labels.appendChild(label);
        entry = { group, label, target: null, pose: { p: new THREE.Vector3(...r.pose.p), q: new THREE.Quaternion(...r.pose.q) } };
        this.remote.set(r.leaseId, entry);
      }
      entry.label.textContent = `${PERSON_SHAPES[r.color % PERSON_SHAPES.length]} ${r.displayName}`;
      entry.pose.p.set(...r.pose.p);
      entry.pose.q.set(...r.pose.q);
    }
    for (const [id, e] of this.remote) {
      if (seen.has(id)) continue;
      this.scene.remove(e.group);
      e.label.remove();
      this.remote.delete(id);
    }
  }

  setPushArrow(point: Vec3 | null, dir: Vec3 | null): void {
    if (this.pushArrow) {
      this.scene.remove(this.pushArrow);
      this.pushArrow = null;
    }
    if (!point || !dir) return;
    const d = new THREE.Vector3(dir[0], 0, dir[2]).normalize();
    const origin = new THREE.Vector3(...point).sub(d.clone().multiplyScalar(3));
    this.pushArrow = new THREE.ArrowHelper(d, origin, 3, 0xa02a1e, 0.9, 0.5);
    this.scene.add(this.pushArrow);
  }

  // ---------------------------------------------------------------- selection

  select(id: string | null): void {
    this.selected = id;
    this.selectedOutline.visible = !!id;
  }

  // ---------------------------------------------------------------- camera

  private spherical(): THREE.Spherical {
    return new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
  }

  private moveCamera(target: THREE.Vector3, position: THREE.Vector3, instant = false): void {
    if (instant || this.reducedMotion) {
      this.transition = null;
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.controls.update();
      return;
    }
    this.transition = { from: { t: this.controls.target.clone(), p: this.camera.position.clone() }, to: { t: target.clone(), p: position.clone() }, start: performance.now() };
  }

  setView(view: ViewName, instant = false): void {
    const s = this.spherical();
    const radius = Number.isFinite(s.radius) && s.radius > 1 ? s.radius : 62;
    const theta = view === "default" ? Math.PI / 4 : Number.isFinite(s.theta) ? s.theta : Math.PI / 4;
    const phi = { default: 0.95, top: 0.03, side: 1.45 }[view];
    const target = this.controls.target.clone();
    if (view === "default") target.set(0, Math.max(2, target.y), 0);
    const pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(view === "default" ? Math.max(radius, 40) : radius, phi, theta)).add(target);
    this.moveCamera(target, pos, instant);
  }

  zoom(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const r = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, offset.length() * factor));
    this.moveCamera(this.controls.target.clone(), this.controls.target.clone().add(offset.setLength(r)));
  }

  raiseTarget(dy: number): void {
    const t = this.controls.target.clone();
    t.y = Math.max(0, Math.min(80, t.y + dy));
    const delta = t.clone().sub(this.controls.target);
    this.moveCamera(t, this.camera.position.clone().add(delta));
  }

  targetHeight(): number {
    return this.controls.target.y;
  }

  /** Frame the whole work, or the table if it's empty (CAM-02). */
  fitAll(instant = false): void {
    const box = new THREE.Box3(new THREE.Vector3(-this.table.radius, this.table.top - 1, -this.table.radius), new THREE.Vector3(this.table.radius, this.table.top + 2, this.table.radius));
    for (const id of this.ids) {
      const pose = this.stickPose(id)!;
      for (const c of boxCorners(stickBox(pose, this.dims))) box.expandByPoint(new THREE.Vector3(...c));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const s = this.spherical();
    const fov = (this.camera.fov * Math.PI) / 180;
    const fit = sphere.radius / Math.sin(Math.min(fov, fov * this.camera.aspect) / 2);
    const target = sphere.center.clone();
    target.y = Math.max(0, target.y * 0.8);
    const pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(Math.min(this.controls.maxDistance, fit * 1.05), Number.isFinite(s.phi) ? Math.min(s.phi, 1.3) : 0.95, Number.isFinite(s.theta) ? s.theta : Math.PI / 4)).add(target);
    this.moveCamera(target, pos, instant);
  }

  focus(id: string): void {
    const pose = this.stickPose(id);
    if (!pose) return;
    const target = new THREE.Vector3(...pose.p);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(16);
    this.moveCamera(target, target.clone().add(offset));
  }

  focusDraft(): void {
    if (!this.draft) return;
    const target = new THREE.Vector3(...this.draft.center);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(Math.max(18, Math.min(40, this.camera.position.distanceTo(this.controls.target))));
    this.moveCamera(target, target.clone().add(offset));
  }

  /** Apply a saved exhibit framing. */
  frame(f: { yaw: number; pitch: number; distance: number; targetY: number }): void {
    const target = new THREE.Vector3(0, f.targetY, 0);
    this.moveCamera(target, new THREE.Vector3().setFromSpherical(new THREE.Spherical(f.distance, Math.max(0.03, Math.min(1.5, f.pitch)), f.yaw)).add(target), true);
  }

  currentFraming(): { yaw: number; pitch: number; distance: number; targetY: number } {
    const s = this.spherical();
    return { yaw: s.theta, pitch: s.phi, distance: s.radius, targetY: this.controls.target.y };
  }

  /** Keep the camera out of sticks so zooming can't put you inside one (CAM-03). */
  private protectCamera(): void {
    const cam = this.camera.position;
    const toCam = cam.clone().sub(this.controls.target);
    for (const id of this.ids) {
      const pose = this.stickPose(id)!;
      const local = cam.clone().sub(new THREE.Vector3(...pose.p)).applyQuaternion(new THREE.Quaternion(...pose.q).invert());
      const m = 0.6;
      if (Math.abs(local.x) < this.dims.length / 2 + m && Math.abs(local.y) < this.dims.height / 2 + m && Math.abs(local.z) < this.dims.width / 2 + m) {
        // step outward along the view ray until clear
        for (let k = 1; k < 40; k++) {
          const candidate = this.controls.target.clone().add(toCam.clone().multiplyScalar(1 + k * 0.08));
          const l2 = candidate.clone().sub(new THREE.Vector3(...pose.p)).applyQuaternion(new THREE.Quaternion(...pose.q).invert());
          if (!(Math.abs(l2.x) < this.dims.length / 2 + m && Math.abs(l2.y) < this.dims.height / 2 + m && Math.abs(l2.z) < this.dims.width / 2 + m)) {
            cam.copy(candidate);
            break;
          }
        }
      }
    }
    if (cam.y < this.table.top + 0.4 && Math.hypot(cam.x, cam.z) < this.table.radius + 0.5) cam.y = this.table.top + 0.4;
  }

  // ---------------------------------------------------------------- input

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private ray(e: PointerEvent): Ray {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this.ndc(e), this.camera);
    return { origin: rc.ray.origin.toArray() as Vec3, dir: rc.ray.direction.toArray() as Vec3 };
  }

  private screen(p: THREE.Vector3): [number, number] {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = p.clone().project(this.camera);
    return [((v.x + 1) / 2) * r.width + r.left, ((1 - v.y) / 2) * r.height + r.top];
  }

  private unitsPerPixel(at: Vec3): number {
    const dist = this.camera.position.distanceTo(new THREE.Vector3(...at));
    return (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / this.renderer.domElement.clientHeight;
  }

  /** Handle > draft > real stick > background (PLACE-05). */
  private pick(e: PointerEvent): { kind: "handle"; handle: Handle } | { kind: "draft" } | { kind: "stick"; id: string; point: Vec3 } | { kind: "none" } {
    if (this.draft && this.draftEditable) {
      const touch = e.pointerType === "touch";
      const minPx = touch ? 30 : 20;
      let best: { h: Handle; d: number } | null = null;
      for (const [h, m] of this.handles) {
        const [sx, sy] = this.screen(m.position);
        const d = Math.hypot(sx - e.clientX, sy - e.clientY);
        // the pick region may exceed the visible handle but is capped so the
        // stick's middle stays grabbable (ACCESS-02)
        const radiusPx = Math.min(touch ? 44 : 30, Math.max(minPx, 0.45 / this.unitsPerPixel(m.position.toArray() as Vec3)));
        if (d <= radiusPx && (!best || d < best.d)) best = { h, d };
      }
      if (best) return { kind: "handle", handle: best.h };
    }
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this.ndc(e), this.camera);
    if (this.draft && this.draftEditable && rc.intersectObject(this.draftMesh, false).length) return { kind: "draft" };
    const hit = rc.intersectObject(this.sticks, false)[0];
    if (hit && hit.instanceId != null && this.ids[hit.instanceId]) return { kind: "stick", id: this.ids[hit.instanceId]!, point: hit.point.toArray() as Vec3 };
    return { kind: "none" };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode === "exhibit") return;
    const hit = this.pick(e);
    const adjustTouch = e.pointerType === "touch" && this.inputMode === "adjust" && this.draft && this.draftEditable;
    let handle: Handle | null = null;
    if (hit.kind === "handle") handle = hit.handle;
    else if (hit.kind === "draft") handle = "center";
    else if (adjustTouch) handle = "center"; // Adjust mode: a drag anywhere moves the ghost
    if (handle && this.draft) {
      if (e.pointerType === "touch" && this.inputMode === "observe") return; // Observe never grabs
      e.stopPropagation();
      e.preventDefault();
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.drag = { handle, pointerId: e.pointerId, startPx: [e.clientX, e.clientY], startDraft: this.draft, yawSnap: null, pitchSnap: null };
      if (handle === "center") this.drag.center = beginCenterDrag(this.draft, this.ray(e), [e.clientX, e.clientY]);
      this.container.classList.add("dragging");
      this.events.onDraftChange?.(this.draft, "start", handle);
      return;
    }
    if (hit.kind === "stick") {
      this.pendingSelect = { id: hit.id, point: hit.point, x: e.clientX, y: e.clientY };
    } else {
      this.pendingSelect = { id: null, point: null, x: e.clientX, y: e.clientY };
    }
  };
  private pendingSelect: { id: string | null; point: Vec3 | null; x: number; y: number } | null = null;

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId || !this.draft) return;
    e.preventDefault();
    const d = this.drag;
    const len = this.dims.length;
    let next: Draft = this.draft;
    const dy = e.clientY - d.startPx[1];
    switch (d.handle) {
      case "center": {
        const cam = this.camera;
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
        const forward = new THREE.Vector3().subVectors(this.controls.target, cam.position).setY(0).normalize();
        const r = centerDrag(d.center!, this.draft, this.ray(e), [e.clientX, e.clientY], { unitsPerPixel: this.unitsPerPixel(this.draft.center), right: right.toArray() as Vec3, forward: forward.toArray() as Vec3 });
        next = r.draft;
        this.events.onParallelFallback?.(r.fallback);
        break;
      }
      case "height":
        next = heightDrag(d.startDraft, dy, this.unitsPerPixel(d.startDraft.center));
        break;
      case "endA":
      case "endB": {
        next = endpointYaw(this.draft, len, d.handle === "endA" ? "A" : "B", this.ray(e));
        if (this.snapping) {
          const s = snapAngle(next.yaw, YAW_TARGETS, d.yawSnap);
          d.yawSnap = s.active;
          if (s.angle !== next.yaw) next = this.withYaw(next, s.angle, d.handle === "endA" ? "B" : "A");
        }
        break;
      }
      case "pitchA":
      case "pitchB": {
        const which = d.handle === "pitchA" ? "A" : "B";
        next = endpointPitch(d.startDraft, len, which, dy);
        if (this.snapping) {
          const s = snapAngle(next.pitch, PITCH_TARGETS, d.pitchSnap);
          d.pitchSnap = s.active;
          if (s.angle !== next.pitch) next = this.withPitch(d.startDraft, s.angle, which === "A" ? "B" : "A");
        }
        break;
      }
    }
    this.draft = next;
    this.syncDraft();
    this.events.onDraftChange?.(next, "move", d.handle);
  };

  private withYaw(d: Draft, yaw: number, pivot: "A" | "B"): Draft {
    const ends = draftEnds(d, this.dims.length);
    const fixed = pivot === "A" ? ends.A : ends.B;
    const dir: Vec3 = [Math.cos(d.pitch) * Math.cos(yaw), Math.sin(d.pitch), Math.cos(d.pitch) * Math.sin(yaw)];
    const h = this.dims.length / 2;
    const center: Vec3 = pivot === "A" ? [fixed[0] + dir[0] * h, fixed[1] + dir[1] * h, fixed[2] + dir[2] * h] : [fixed[0] - dir[0] * h, fixed[1] - dir[1] * h, fixed[2] - dir[2] * h];
    return { ...d, yaw, center };
  }

  private withPitch(d: Draft, pitch: number, pivot: "A" | "B"): Draft {
    const ends = draftEnds(d, this.dims.length);
    const fixed = pivot === "A" ? ends.A : ends.B;
    const dir: Vec3 = [Math.cos(pitch) * Math.cos(d.yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(d.yaw)];
    const h = this.dims.length / 2;
    const center: Vec3 = pivot === "A" ? [fixed[0] + dir[0] * h, fixed[1] + dir[1] * h, fixed[2] + dir[2] * h] : [fixed[0] - dir[0] * h, fixed[1] - dir[1] * h, fixed[2] - dir[2] * h];
    return { ...d, pitch, center };
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.pointerId) {
      this.finishDrag();
      return;
    }
    const p = this.pendingSelect;
    this.pendingSelect = null;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6 && e.type === "pointerup") {
      this.select(p.id);
      this.events.onSelect?.(p.id, p.point);
    }
  };

  private finishDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try {
      this.renderer.domElement.releasePointerCapture(d.pointerId);
    } catch {
      // already released
    }
    this.controls.enabled = true;
    this.container.classList.remove("dragging");
    this.events.onParallelFallback?.(false);
    if (this.draft) this.events.onDraftChange?.(this.draft, "end", d.handle);
  }

  /** Blur or disposal: end any drag cleanly; never submits anything. */
  cancelDrag = (): void => {
    this.finishDrag();
    this.pendingSelect = null;
  };

  setInputMode(m: "observe" | "adjust"): void {
    this.inputMode = m;
    // touch Adjust: one finger moves the ghost; pinch still zooms
    this.controls.touches = m === "adjust" ? { ONE: undefined as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  }

  // ---------------------------------------------------------------- frame loop

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    // Resize keeps target, distance and the held draft (CAM-04).
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tmpM = new THREE.Matrix4();
  private tmpP = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private one = new THREE.Vector3(1, 1, 1);

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    this.adaptQuality(dt);
    if (this.transition) {
      const k = Math.min(1, (now - this.transition.start) / 450);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.controls.target.lerpVectors(this.transition.from.t, this.transition.to.t, e);
      this.camera.position.lerpVectors(this.transition.from.p, this.transition.to.p, e);
      if (k >= 1) this.transition = null;
    }
    this.controls.update();
    this.protectCamera();
    const renderAt = now - 100;
    for (let i = 0; i < this.ids.length; i++) {
      const list = this.samples.get(this.ids[i]!)!;
      let a = list[0]!;
      let b = a;
      for (let k = list.length - 1; k >= 0; k--) {
        if (list[k]!.t <= renderAt) {
          a = list[k]!;
          b = list[k + 1] ?? a;
          break;
        }
      }
      if (renderAt < list[0]!.t) a = b = list[0]!;
      const span = b.t - a.t;
      const f = span > 0 ? Math.min(1, Math.max(0, (renderAt - a.t) / span)) : 1;
      this.tmpP.lerpVectors(a.p, b.p, f);
      this.tmpQ.slerpQuaternions(a.q, b.q, f);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.one);
      this.sticks.setMatrixAt(i, this.tmpM);
      if (this.ids[i] === this.selected) {
        this.selectedOutline.position.copy(this.tmpP);
        this.selectedOutline.quaternion.copy(this.tmpQ);
      }
    }
    this.sticks.instanceMatrix.needsUpdate = true;
    this.sticks.computeBoundingSphere();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cRect = this.container.getBoundingClientRect();
    for (const e of this.remote.values()) {
      // ease remote ghosts toward their latest pose (presentation only)
      e.group.position.lerp(e.pose.p, this.reducedMotion ? 1 : 0.35);
      e.group.quaternion.slerp(e.pose.q, this.reducedMotion ? 1 : 0.35);
      const [sx, sy] = this.screen(e.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      e.label.style.transform = `translate(${sx - cRect.left}px, ${sy - cRect.top}px) translate(-50%, -100%)`;
      e.label.style.display = sx < rect.left || sx > rect.right || sy < rect.top || sy > rect.bottom ? "none" : "";
    }
    // handles keep a constant on-screen size
    for (const m of this.handles.values()) {
      if (!m.visible) continue;
      const s = Math.max(0.6, Math.min(3, this.unitsPerPixel(m.position.toArray() as Vec3) * 30));
      m.scale.setScalar(s);
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** Degrade decoration first: shadows, then pixel ratio (OPS-02). Never input or collisions. */
  private adaptQuality(dt: number): void {
    if (document.hidden) return;
    if (dt > 34) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90 && this.quality > 0) {
      this.slowFrames = 0;
      this.quality--;
      if (this.quality === 1) {
        this.renderer.shadowMap.enabled = false;
        this.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) m.needsUpdate = true;
        });
      } else {
        this.renderer.setPixelRatio(1);
        this.resize();
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.cancelDrag();
    this.resizeObserver.disconnect();
    window.removeEventListener("blur", this.cancelDrag);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
  }
}
