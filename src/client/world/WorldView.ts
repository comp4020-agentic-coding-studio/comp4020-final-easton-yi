// The island world runtime (main prompt §9 WorldScene/WorldViewport,
// WorldStreamer and WorldInput). One renderer, one camera and one
// requestAnimationFrame loop. It never touches the workshop's renderer or
// physics, and disposes every listener, worker, GPU resource and the context
// itself when the page leaves.
import * as THREE from "three";
import { RECIPE_VERSION } from "../../world/landmarks.ts";
import { StaticGrid, groundUnder, clearAt, PLAYER, type World } from "../../world/collision.ts";
import { Flight, MAX_SPEED, emptyInput, type ControlState, type InputState, type SpeedMode } from "../../world/flight.ts";
import { polygonSdf } from "../../world/terrain.ts";
import type { ManifestLandmark, WorldManifest } from "../../world/manifest.ts";
import { STOCK_IDS, STOCKS } from "../../world/core.ts";
import type { WorkerRequest, WorkerResponse } from "./worker.ts";
import { cellBytes, type CellArrays } from "./decode.ts";
import { TerrainField, tileGeometry, TERRAIN_MATERIAL, createGrass, createSky, createSea, createFlow, createRiver, createClouds, createPortal, rockGeometries, ROCK_MATERIAL, type GrassField } from "./environment.ts";
import { chainMaterial, shellMaterials, timberMaterial } from "./materials.ts";
import { AutoQuality, effectivePixelRatio, type QualityMode, type QualityTier } from "../scene/quality.ts";
import { getGraphicsState, reportAppliedTier, subscribeGraphics } from "../graphics-setting.ts";
import { WORLD_QUALITY } from "./quality-world.ts";
import { releaseShared, sharedTexturesOf } from "../scene/release-shared.ts";
import { casterSphere, missesWindow } from "./shadow-cull.ts";
import { createPortalLabels, type PortalLabels } from "./portal-labels.ts";
import { basinUniforms } from "./materials.ts";
import { courtFromManifest, createCourtyard, setBasin, type CourtyardView } from "./courtyard-view.ts";
import { createCandles, type CandleView } from "./candles-view.ts";
import { courtExcludes, courtGround, type Courtyard } from "../../world/courtyard.ts";
import { gatewayColliders } from "../../world/gateways.ts";
import { EnvironmentState, AUTO_CHECK_MS, loadLightMode, type EnvironmentStatus, type LightMode } from "./daynight.ts";
import { applyEnvironment, createMoon } from "./lighting.ts";

export const WORLD_BASE = "/world-data/";

export interface WorldEvents {
  onState?: (s: WorldStatus) => void;
  onPortal?: (id: "explore" | "works" | "together") => void;
  onFault?: (message: string) => void;
  /** A pose to start from instead of the home spawn (Return to world); validated, with a safe-point fallback. */
  startPose?: WorldPose | null;
  /** The speed preset to start with. */
  speed?: SpeedMode;
  /** The day/night preference to start with (Auto by default); the environment is right before the first frame. */
  light?: LightMode;
  /** The local clock (tests inject one; the operating system's clock is never changed). */
  clock?: () => Date;
  /** The environment changed (mode, phase or a blend finished): for the stage's control. */
  onEnvironment?: (s: EnvironmentStatus) => void;
}

export interface WorldStatus {
  phase: "loading" | "ready" | "error" | "context-lost";
  control: ControlState;
  /** Loading progress 0–1 of the essential set (terrain near home + portals). */
  progress: number;
  message?: string;
  regionId: string;
  regionPrompt: string;
  /** Portal within ~6 m (label) and ~2 m (enter prompt). */
  nearPortal: { id: "explore" | "works" | "together"; label: string; close: boolean } | null;
  /** The nearest landmark within ~400 m, for a quiet plaque. */
  nearLandmark: { id: string; title: string; inspiration: string; distance: number } | null;
  /** A side route's start or end nearby, or a ridge reveal just passed (§4). */
  wayPrompt?: string | null;
  flying: boolean;
  boundary: number;
  /** Look lock (pointer lock) is engaged: an explicit opt-in, never automatic. */
  pointerLocked: boolean;
  landmarksReady: number;
  /** The selected speed preset (Walk / Run / Fly). */
  speed: SpeedMode;
}

export interface WorldPose {
  feet: [number, number, number];
  yaw: number;
  pitch: number;
}

type Disposer = () => void;

interface CellRuntime {
  data: CellArrays;
  centre: THREE.Vector3;
  /** 0 full pieces, 1 structural pieces, 2 chains, -1 hidden (the building isn't at the near level). */
  level: number;
  /** Built once while the landmark's detail is resident (level changes only change instance counts). */
  pieces: THREE.Mesh[];
  chains: THREE.Mesh | null;
  /** D pieces per octant (CellArrays.dOct), each with its own level (never finer than the cell's). */
  dMeshes: THREE.Mesh[];
  dLevels: number[];
}

type LoadState = "unloaded" | "loading" | "ready" | "error";

/**
 * One landmark's runtime. Two independently owned resources:
 *  - far: the strongest merged chains (silhouette, far and mid levels), loaded once and resident for the session;
 *  - detail: spatial cells of the real pieces, fetched only at the near level, kept in a byte- and
 *    count-bounded LRU with eviction hysteresis, and released (CPU arrays and GPU buffers) on eviction.
 * Collision is the manifest's semantic colliders and never depends on either.
 */
interface LandmarkRuntime {
  def: ManifestLandmark;
  far: { state: LoadState; requestId: number; retries: number; mesh: THREE.Mesh | null; counts: { all: number; long: number }; bytes: number };
  detail: { state: LoadState; requestId: number; retries: number; cells: CellRuntime[]; bytes: number; lastWanted: number };
  lod: 0 | 1 | 2 | 3; // 0 near (cells), 1 mid, 2 far, 3 silhouette (chain prefixes)
  centre: THREE.Vector3;
}

/** Detail residency counters (tests and the memory evidence; not shown in the UI). */
interface Residency {
  detailed: string[];
  detailBytes: number;
  farReady: number;
  pending: number;
  detailLoads: number;
  detailEvictions: number;
  detailCancels: number;
  cellMeshes: number;
  framesHeld: number;
  fencePending: boolean;
  contextRestores: number;
}

const TIER_FOR_LOD: readonly number[] = [2, 1, 0, -1];
/** The key light (sun or moon) stands this far from its target along its direction, for the shadow camera. */
const KEY_DISTANCE = 500;
/** How far ahead of the camera shadows are drawn at all (the shadow map's window is ±140 m around it). */
const SHADOW_REACH = 200;
/** Detail of a landmark that left the near level stays this long (re-entry hysteresis) unless the cache is over budget. */
const DETAIL_GRACE_MS = 20_000;
/** Terrain tiles are TILE × TILE chunks (512 m), one draw call each. */
const TILE = 4;
/** Near-level cell size (m) and the distances at which a cell shows all pieces / structural pieces. */
const CELL = 40;
/**
 * A landmark's colliders join the grid once the explorer is within its radius plus this reach, whatever its
 * visual assets are doing: over two seconds of travel at the fastest controlled speed, so even Fly + boost on a
 * slow connection can't reach a building before its collision does.
 */
/** Portal lettering is drawn only within this distance of a portal (m): the letters are ~1 px tall at 400 m. */
const LABEL_VISIBLE_M = 450;
const COLLIDER_REACH = Math.max(120, Math.ceil(MAX_SPEED * 2.4));

export class WorldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private events: WorldEvents;
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (r: WorkerResponse) => void>();
  private disposers: Disposer[] = [];
  private disposed = false;

  manifest: WorldManifest | null = null;
  private terrain: TerrainField | null = null;
  /** Terrain tiles of TILE × TILE chunks, keyed by tile index. */
  private terrainMeshes = new Map<number, { mesh: THREE.Mesh; steps: string }>();
  private terrainMat: THREE.MeshStandardMaterial;
  private terrainRequested = new Set<number>();
  private grid = new StaticGrid(32);
  private world: World | null = null;
  flight: Flight | null = null;
  readonly input: InputState = emptyInput();
  private landmarks = new Map<string, LandmarkRuntime>();
  private timber: { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }[] = [];
  private boxGeo: THREE.BufferGeometry[] = [];
  /**
   * Merged chains run along local +x and are drawn as an open sleeve: the four
   * long faces of a unit box without its ±x end caps (8 triangles, not 12).
   * The caps are at most a section square (≤ 1 m) at the end of a chain many
   * metres long, sub-pixel at the mid and far levels where chains are drawn,
   * and every chain end abuts or overlaps another member; measured, they were
   * a third of the home view's chain triangles (docs/evidence/world/triangles.md).
   */
  private unitBox = chainSleeve();
  private chainMat = chainMaterial();
  private shellMats = shellMaterials();
  private shellGeo = { box: new THREE.BoxGeometry(2, 2, 2), cyl: new THREE.CylinderGeometry(1, 1, 2, 20, 1, false) };
  /** The cylinder shell meshes (their shared geometry follows the tier's shellSegments). */
  private shellCyls: THREE.InstancedMesh[] = [];
  private grass: GrassField | null = null;
  private grassAt = new THREE.Vector2(Infinity, Infinity);
  private rocks: THREE.Mesh[] = [];
  private placeRocks: (() => void) | null = null;
  private sea: ReturnType<typeof createSea> | null = null;
  private flows: ReturnType<typeof createFlow>[] = [];
  private clouds: ReturnType<typeof createClouds> | null = null;
  private portals: { id: "explore" | "works" | "together"; label: string; group: THREE.Group; pos: THREE.Vector3; normal: THREE.Vector3; armed: boolean; dispose(): void }[] = [];
  /** Frosted destination lettering in the portals' membranes: one mesh, one atlas (portal-labels.ts). */
  private labels: PortalLabels | null = null;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh | null = null;
  /** The one environment state (day/night); every lit part follows it (lighting.ts). */
  readonly env: EnvironmentState;
  private moon: ReturnType<typeof createMoon> | null = null;
  private basin = basinUniforms();
  private court: Courtyard | null = null;
  private courtView: CourtyardView | null = null;
  private candles: CandleView | null = null;
  private keyDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
  private envChecked = 0;
  private envTimer: ReturnType<typeof setInterval> | null = null;

  private status: WorldStatus = { phase: "loading", control: "idle", progress: 0, regionId: "home", regionPrompt: "", nearPortal: null, nearLandmark: null, flying: false, boundary: 0, pointerLocked: false, landmarksReady: 0, speed: "walk" };
  private raf = 0;
  /** The world's region intersects the browser viewport (scrolled away: no frames, as for a hidden tab). */
  private onScreen = true;
  /**
   * When Look lock last ended (performance.now()). The Esc that releases pointer lock may reach the page just
   * after the lock is gone; the stage ignores an Esc this close to a release instead of also pausing.
   */
  lookUnlockedAt = -Infinity;
  private lastFrame = 0;
  private animating = false;
  /**
   * GPU frame pacing (docs/evidence/world/memory-incident.md): at most one
   * submitted frame may be unfinished. Without it, a renderer slower than the
   * display (software GL, a weak GPU) gets a new frame queued on every RAF and
   * the browser buffers the backlog in the page's renderer process without
   * bound: ~50 MiB per frame on SwiftShader, until the machine runs out.
   */
  private gpuFence: WebGLSync | null = null;
  private fenceSince = 0;
  private lastSubmit = 0;
  /** Frames skipped because the previous frame was still on the GPU (diagnostics). */
  private framesHeld = 0;
  /** webglcontextrestored events handled (diagnostics). */
  private contextRestores = 0;
  private auto = new AutoQuality();
  private tier: QualityTier = "high";
  private unsubscribeGraphics: () => void;
  private resizeObserver: ResizeObserver;
  private renders = 0;
  private transitionLock = false;
  private portalCooldownUntil = 0;
  reducedMotion = matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  /** For tests and the development inspector only (never shown in the UI). */
  readonly debug = { frames: 0, drawCalls: 0, triangles: 0, lastFrameMs: 0, instancesDrawn: 0, worldMs: [] as number[] };

  constructor(container: HTMLElement, events: WorldEvents = {}) {
    this.container = container;
    this.events = events;
    if (events.speed) this.input.speed = this.status.speed = events.speed;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "world-canvas";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    // not focusable itself: the stage's labelled container is the one keyboard focus target for world controls
    container.appendChild(this.renderer.domElement);
    // the world's own camera: eye height 1.65, FOV 55°, near 0.15, far covering the island (§5.1)
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.15, 6400);
    this.camera.rotation.order = "YXZ";
    this.scene.fog = new THREE.Fog(new THREE.Color("#c9d9df"), 1600, 6000);
    this.scene.background = new THREE.Color("#9cc3d8");
    this.terrainMat = TERRAIN_MATERIAL(this.basin);
    // the environment is decided before anything is drawn: the first frame at night is already night
    this.env = new EnvironmentState(events.light ?? loadLightMode(), events.clock);
    this.env.reducedMotion = this.reducedMotion;

    const sunDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
    this.hemi = new THREE.HemisphereLight(new THREE.Color("#dbe9f2"), new THREE.Color("#6b6a4c"), 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(new THREE.Color("#fff1dc"), 2.4);
    this.sun.position.copy(sunDir).multiplyScalar(400);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -140;
    sc.right = sc.top = 140;
    sc.near = 10;
    sc.far = 1400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.sky = createSky(sunDir.clone());
    this.scene.add(this.sky);
    this.moon = createMoon();
    this.scene.add(this.moon.mesh);
    this.applyEnv();

    // shared box geometry per stock: unit section scaled to the stock (length along x)
    for (const sid of STOCK_IDS) {
      const s = STOCKS[sid];
      this.boxGeo.push(foldedBox(s.length, s.section));
      this.timber.push(timberMaterial(s.length));
    }

    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const cb = this.pending.get(e.data.id);
      if (!cb) return; // cancelled or stale: never applied
      this.pending.delete(e.data.id);
      cb(e.data);
    };
    this.worker.onerror = () => this.fail("The world's loader stopped unexpectedly.");

    const canvas = this.renderer.domElement;
    const onLost = (e: Event): void => {
      e.preventDefault();
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      // a fence belongs to the lost context: forget it (deleting it on the restored context would be an error)
      this.gpuFence = null;
      this.releaseControl("paused");
      this.setStatus({ phase: "context-lost", message: "The graphics context was lost. Trying to restore it…" });
    };
    const onRestored = (): void => {
      // three re-uploads buffers on use; rebuild what lives only on the GPU
      this.gpuFence = null;
      this.labels?.rebuild(); // the lettering atlas is re-uploaded from its canvas, which is released after upload
      this.contextRestores++;
      this.setStatus({ phase: this.manifest ? "ready" : "loading", message: undefined });
      this.invalidate();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    this.disposers.push(() => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    });
    const onVis = (): void => {
      if (document.hidden) {
        this.releaseControl("paused");
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      } else {
        this.auto.resume();
        this.lastFrame = 0;
        // back on the tab: the clock may have moved on; snap to it rather than replaying the missed transition
        this.refreshEnv(true);
        this.invalidate();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    // Auto looks at the clock once a minute while the page is visible (no frames: it only invalidates on a change)
    this.envTimer = setInterval(() => {
      if (!document.hidden) this.refreshEnv(false);
    }, AUTO_CHECK_MS);
    this.disposers.push(() => {
      if (this.envTimer) clearInterval(this.envTimer);
      this.envTimer = null;
    });
    const onBlur = (): void => this.releaseControl("paused");
    window.addEventListener("blur", onBlur);
    const onLock = (): void => {
      const locked = document.pointerLockElement === canvas;
      const was = this.status.pointerLocked;
      this.status.pointerLocked = locked;
      // Esc (or the browser) released the cursor: stop moving and stay in free-cursor exploring. Never re-lock.
      if (was && !locked) {
        this.lookUnlockedAt = performance.now();
        this.suspendInput();
      }
      this.emit();
    };
    document.addEventListener("pointerlockchange", onLock);
    this.disposers.push(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onLock);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    });
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(container);
    // scrolled out of the page's view: render nothing (input suspension is the stage's, and separate)
    if (typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        if (e) this.setOnScreen(e.isIntersecting);
      });
      io.observe(container);
      this.disposers.push(() => io.disconnect());
    }
    this.unsubscribeGraphics = subscribeGraphics(() => this.applyMode(getGraphicsState().mode));
    this.applyMode(getGraphicsState().mode, true);
    void this.load();
  }

  // ---------------------------------------------------------------- worker requests

  private request<T extends WorkerResponse>(msg: Omit<WorkerRequest, "id"> & { type: WorkerRequest["type"] }): { id: number; promise: Promise<T> } {
    const id = this.nextId++;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, (r) => (r.type === "error" ? reject(new Error(r.message)) : resolve(r as T)));
    });
    this.worker.postMessage({ ...msg, id } as WorkerRequest);
    return { id, promise };
  }

  private cancel(id: number): void {
    if (!this.pending.has(id)) return;
    this.pending.delete(id);
    this.worker.postMessage({ type: "cancel", id } satisfies WorkerRequest);
  }

  // ---------------------------------------------------------------- loading

  private async load(): Promise<void> {
    // tell the page at once: until the manifest arrives (slow networks) it would otherwise show a
    // disabled control with no explanation
    this.setStatus({ phase: "loading", progress: 0 });
    try {
      const m = await this.request<Extract<WorkerResponse, { type: "manifest" }>>({ type: "manifest", base: WORLD_BASE, recipeVersion: RECIPE_VERSION } as never).promise;
      if (this.disposed) return;
      this.manifest = m.manifest;
      this.terrain = new TerrainField(m.manifest.terrain);
      const coast = m.manifest.coast as [number, number][];
      const field = this.terrain;
      // the courtyard's basin, platform and stones are part of the ground the explorer stands on (courtyard.ts)
      this.court = courtFromManifest(m.manifest.lighting.home, m.manifest.home.spawn, m.manifest.home.yaw);
      setBasin(this.basin, this.court.pond);
      const court = this.court;
      this.world = {
        ground: (x, z) => {
          const h = field.height(x, z);
          return Number.isFinite(h) ? courtGround(court, x, z, h) : -40;
        },
        coast: (x, z) => polygonSdf(coast, x, z),
        coastNormal: (x, z) => {
          const e = 1;
          const gx = polygonSdf(coast, x + e, z) - polygonSdf(coast, x - e, z);
          const gz = polygonSdf(coast, x, z + e) - polygonSdf(coast, x, z - e);
          const l = Math.hypot(gx, gz) || 1;
          return [gx / l, gz / l];
        },
        ceiling: m.manifest.boundary.ceiling,
        seaFloor: m.manifest.boundary.seaFloor,
        hard: m.manifest.boundary.hard,
        soft: m.manifest.boundary.soft,
      };
      const h = m.manifest.home;
      this.flight = new Flight({ feet: [h.spawn[0], h.spawn[1], h.spawn[2]], yaw: h.yaw, pitch: -0.03 });
      this.flight.reducedMotion = this.reducedMotion;
      this.placeCamera();
      this.buildStatic(m.manifest);
      await this.request({ type: "terrain", base: WORLD_BASE, path: m.manifest.terrain.path, hash: m.manifest.terrain.hash } as never).promise;
      if (this.disposed) return;
      // the whole heightfield arrives in one transfer (≈ 1.6 MB of floats); then tiles are built nearest first
      const all = await this.request<Extract<WorkerResponse, { type: "chunks" }>>({ type: "chunks" } as never).promise;
      if (this.disposed) return;
      const t = m.manifest.terrain;
      const total = t.chunksX * t.chunksZ;
      for (let k = 0; k < total; k++) {
        this.terrain.set(k, all.heights.subarray(k * all.per, (k + 1) * all.per));
        this.terrainRequested.add(k);
      }
      this.setStatus({ progress: 0.5 });
      // Return to world: the remembered pose, checked against the terrain, the boundary and nearby buildings'
      // collision now that they're known; anything doubtful falls back to the nearest declared safe point
      const start = this.events.startPose ? this.validStart(this.events.startPose) : null;
      if (start) {
        this.flight.teleport({ feet: start.feet, yaw: start.yaw, pitch: start.pitch, flying: start.flying });
        this.placeCamera();
      }
      const at = start?.feet ?? h.spawn;
      this.buildTilesAround(at[0]!, at[2]!);
      if (this.disposed) return;
      this.setStatus({ phase: "ready", progress: 1 });
      this.updateStreaming(true);
      this.lastFollow.set(Infinity, 0, 0);
      this.followCamera();
      this.invalidate();
    } catch (e) {
      this.fail(`The island couldn't load: ${(e as Error).message}`);
    }
  }

  private fail(message: string): void {
    if (this.disposed) return;
    this.releaseControl("error");
    this.setStatus({ phase: "error", message });
  }

  /** Retry after an error (keeps everything already loaded). */
  retry(): void {
    if (this.status.phase !== "error") return;
    for (const lm of this.landmarks.values()) {
      for (const r of [lm.far, lm.detail]) if (r.state === "error") {
        r.state = "unloaded";
        r.retries = 0;
      }
    }
    this.setStatus({ phase: this.manifest ? "ready" : "loading", message: undefined, control: "idle" });
    if (!this.manifest) void this.load();
    else this.updateStreaming(true);
  }

  /** Build every terrain tile, nearest first (heights are all resident; geometry is cheap per tile). */
  private buildTilesAround(x: number, z: number): void {
    if (!this.manifest) return;
    const t = this.manifest.terrain;
    const tilesX = Math.ceil(t.chunksX / TILE);
    const tilesZ = Math.ceil(t.chunksZ / TILE);
    const order: { tile: number; d: number }[] = [];
    for (let tz = 0; tz < tilesZ; tz++) for (let tx = 0; tx < tilesX; tx++) {
      const cx = t.min[0] + (tx + 0.5) * TILE * t.chunk;
      const cz = t.min[1] + (tz + 0.5) * TILE * t.chunk;
      order.push({ tile: tz * tilesX + tx, d: Math.hypot(cx - x, cz - z) });
    }
    order.sort((a, b) => a.d - b.d);
    for (const o of order) this.updateTile(o.tile);
  }

  private async ensureTerrainAround(x: number, z: number, radius: number, essential: boolean): Promise<void> {
    if (!this.manifest || !this.terrain) return;
    const t = this.manifest.terrain;
    const want: { idx: number; d: number }[] = [];
    for (let cz = 0; cz < t.chunksZ; cz++) for (let cx = 0; cx < t.chunksX; cx++) {
      const idx = cz * t.chunksX + cx;
      if (this.terrainRequested.has(idx)) continue;
      const ox = t.min[0] + (cx + 0.5) * t.chunk;
      const oz = t.min[1] + (cz + 0.5) * t.chunk;
      const d = Math.hypot(ox - x, oz - z);
      if (d <= radius) want.push({ idx, d });
    }
    want.sort((a, b) => a.d - b.d);
    let done = 0;
    const total = want.length;
    // bounded concurrency
    const queue = [...want];
    const runOne = async (): Promise<void> => {
      for (;;) {
        const job = queue.shift();
        if (!job || this.disposed) return;
        if (this.terrainRequested.has(job.idx)) continue;
        this.terrainRequested.add(job.idx);
        const r = await this.request<Extract<WorkerResponse, { type: "chunk" }>>({ type: "chunk", index: job.idx } as never).promise;
        if (this.disposed) return;
        this.terrain!.set(job.idx, r.heights);
        this.updateTerrainMesh(job.idx);
        done++;
        if (essential) this.setStatus({ progress: Math.min(0.99, done / Math.max(1, total)) });
        this.invalidate();
      }
    };
    await Promise.all(Array.from({ length: 4 }, runOne));
  }

  /**
   * A chunk's grid step. The distance rings give the coarsest step allowed (1 within terrainNear, 2 within 2.5×,
   * 4 within 6×, else 8), each chunk from its own distance. Where that step's geometric error, projected at the
   * chunk's distance, exceeds the tier's terrainErrorPx drawing-buffer pixels, the chunk is refined until it doesn't (or
   * reaches the full grid), never beyond the step the old per-tile rule would have given it (`tileRing`).
   * The threshold is per tier (quality-world.ts terrainErrorPx: 1.5 / 2 / 3 px at High / Medium / Low, whose DPR caps
   * are 1.5 / 1.25 / 1).
   * Smooth meadows go coarse with distance; cliffs and ridges, whose slope shading needs the normals, keep the
   * detail they had. Before 2026-11-04 a whole 512 m tile took the step of its nearest corner.
   */
  private terrainStep(dist: number, idx?: number, tileRing?: number): number {
    const q = WORLD_QUALITY[this.tier];
    const ringOf = (d: number): number => (d < q.terrainNear ? 0 : d < q.terrainNear * 2.5 ? 1 : d < q.terrainNear * 6 ? 2 : 3);
    let k = ringOf(dist);
    const err = idx === undefined ? null : this.terrain?.stepError(idx);
    if (err) {
      // drawing-buffer pixels per metre at this distance
      const px = this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * Math.max(dist, 1));
      const floor = tileRing ?? 0;
      while (k > floor && err[k]! * px > q.terrainErrorPx) k--;
    }
    return 1 << k;
  }

  /** The tile containing a chunk; tiles are TILE × TILE chunks. */
  private tileOf(idx: number): number {
    const t = this.manifest!.terrain;
    const cx = idx % t.chunksX;
    const cz = Math.floor(idx / t.chunksX);
    return Math.floor(cz / TILE) * Math.ceil(t.chunksX / TILE) + Math.floor(cx / TILE);
  }

  private updateTerrainMesh(idx: number): void {
    if (!this.manifest) return;
    this.updateTile(this.tileOf(idx));
  }

  private updateTile(tile: number): void {
    if (!this.manifest || !this.terrain) return;
    const t = this.manifest.terrain;
    const tilesX = Math.ceil(t.chunksX / TILE);
    const tx = tile % tilesX;
    const tz = Math.floor(tile / tilesX);
    const cx0 = tx * TILE;
    const cz0 = tz * TILE;
    const n = Math.min(TILE, t.chunksX - cx0, t.chunksZ - cz0);
    // every chunk of the tile must be loaded first
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (!this.terrain.has((cz0 + j) * t.chunksX + cx0 + i)) return;
    const ox = t.min[0] + cx0 * t.chunk;
    const oz = t.min[1] + cz0 * t.chunk;
    const cam = this.camera.position;
    // each chunk's own step from its own distance (a whole 512 m tile at 4 m spacing because one corner was
    // near the camera was a third of the terrain's triangles; docs/evidence/world/triangles.md)
    const steps: number[] = [];
    // the old rule's step for the whole tile (from its nearest edge): the finest any chunk is refined to
    const size = t.chunk * n;
    const tileRing = Math.log2(this.terrainStep(Math.hypot(Math.max(0, Math.abs(cam.x - (ox + size / 2)) - size / 2), Math.max(0, Math.abs(cam.z - (oz + size / 2)) - size / 2))));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = ox + (i + 0.5) * t.chunk;
      const cz = oz + (j + 0.5) * t.chunk;
      const dx = Math.max(0, Math.abs(cam.x - cx) - t.chunk / 2);
      const dz = Math.max(0, Math.abs(cam.z - cz) - t.chunk / 2);
      steps.push(this.terrainStep(Math.hypot(dx, dz), (cz0 + j) * t.chunksX + cx0 + i, tileRing));
    }
    const key = steps.join(",");
    const cur = this.terrainMeshes.get(tile);
    if (cur && cur.steps === key) return;
    const geo = tileGeometry(this.terrain, t, cx0, cz0, n, steps);
    if (!geo) return;
    if (cur) {
      cur.mesh.geometry.dispose();
      cur.mesh.geometry = geo;
      cur.steps = key;
    } else {
      const mesh = new THREE.Mesh(geo, this.terrainMat);
      mesh.position.set(ox, 0, oz);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.terrainMeshes.set(tile, { mesh, steps: key });
    }
  }

  /** Everything that doesn't stream: sea, clouds, portals, island silhouettes of all 20 landmarks, rocks. */
  private buildStatic(m: WorldManifest): void {
    // the island's rock silhouettes and material, shared by the rocks, the gateways and the courtyard's stones
    this.rockGeos = rockGeometries();
    this.rockMat = ROCK_MATERIAL();
    this.sea = createSea();
    this.scene.add(this.sea.mesh);
    // the island underside: a dark skirt below the coast so low flight never shows a paper-thin island
    const ring = new THREE.Shape(m.coast.map(([x, z]) => new THREE.Vector2(x, -z)));
    const under = new THREE.Mesh(new THREE.ShapeGeometry(ring, 4), new THREE.MeshStandardMaterial({ color: new THREE.Color("#3d4a45"), roughness: 1 }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -14;
    this.scene.add(under);
    this.clouds = createClouds(WORLD_QUALITY[this.tier].cloudClusters);
    this.scene.add(this.clouds.mesh);
    // portals
    const accents: Record<string, string> = { explore: "#7fc4c9", works: "#e2b46a", together: "#9fd18f" };
    for (const p of m.home.portals) {
      const built = createPortal(p.id, accents[p.id]!, { rock: this.rockMat, rocks: this.rockGeos });
      built.group.position.set(p.position[0], p.position[1], p.position[2]);
      built.group.rotation.y = p.yaw;
      this.scene.add(built.group);
      this.membranes.push(built.membrane);
      const normal = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      this.portals.push({ id: p.id, label: p.label, group: built.group, pos: new THREE.Vector3(...p.position), normal, armed: true, dispose: built.dispose });
      // the visible stone collides (gateways.ts: piers, arch bands, lintel, corbels); the opening between is a trigger
      this.grid.add(`portal-${p.id}`, gatewayColliders(p.id, p.position, p.yaw));
    }
    // destination lettering: presentation only (no collision, no picking, no navigation of its own)
    this.labels = createPortalLabels(m.home.portals, { touch: matchMedia("(pointer: coarse)").matches, anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()) });
    this.scene.add(this.labels.mesh);
    // all twenty landmarks: silhouette shells at once (cheap distant forms), collision for their pads
    this.buildAllShells(m);
    for (const def of m.landmarks) {
      const lb = def.localBounds;
      const centreLocal = new THREE.Vector3((lb.min[0] + lb.max[0]) / 2, (lb.min[1] + lb.max[1]) / 2, (lb.min[2] + lb.max[2]) / 2);
      const c = Math.cos(def.placement.yaw);
      const s = Math.sin(def.placement.yaw);
      const centre = new THREE.Vector3(def.placement.position[0] + centreLocal.x * c + centreLocal.z * s, def.placement.position[1] + centreLocal.y, def.placement.position[2] - centreLocal.x * s + centreLocal.z * c);
      this.landmarks.set(def.id, {
        def,
        far: { state: "unloaded", requestId: 0, retries: 0, mesh: null, counts: { all: 0, long: 0 }, bytes: 0 },
        detail: { state: "unloaded", requestId: 0, retries: 0, cells: [], bytes: 0, lastWanted: 0 },
        lod: 3,
        centre,
      });
      for (const w of def.water) {
        const f = createFlow(w);
        this.flows.push(f);
        this.scene.add(f.mesh);
      }
    }
    for (const r of m.rivers) {
      const f = createRiver(r.points, r.halfWidth);
      this.flows.push(f);
      this.scene.add(f.mesh);
    }
    this.buildRocks(m);
    this.buildWaymarks(m);
    this.grass = createGrass(WORLD_QUALITY.high.grass);
    this.scene.add(this.grass.mesh);
    // the home courtyard (pond, stones, flowers) and every candle on the island, with the light pool
    if (this.court) {
      const field = this.terrain!;
      const court = this.court;
      this.courtView = createCourtyard(court, this.rockMat, this.rockGeos, (x, z) => {
        const h = field.height(x, z);
        return courtGround(court, x, z, Number.isFinite(h) ? h : court.pond.rim);
      });
      this.scene.add(this.courtView.group);
    }
    const lit = m.lighting;
    const groups = [...lit.home.groups, ...lit.landmarks.flatMap((l) => l.groups)];
    const zones = lit.landmarks.flatMap((l) => l.zones);
    this.candles = createCandles(groups, zones, { maxLights: 8 });
    this.scene.add(this.candles.group);
    this.applyQualityToEnvironment();
    this.applyEnv();
  }
  private rockGeos: THREE.BufferGeometry[] = [];
  private rockMat: THREE.MeshStandardMaterial | null = null as unknown as THREE.MeshStandardMaterial;
  private membranes: THREE.MeshBasicMaterial[] = [];

  /**
   * The rear shading shells of all twenty landmarks, in world space: one instanced mesh per landmark × shape ×
   * finish (44 meshes), each with its own bounds so the camera and the shadow box cull the landmarks out of view
   * (one island-wide mesh per finish cast ~106k shadow triangles from every viewpoint; docs/evidence/world/
   * triangles.md). Grouping them per region at Low was tried: 22 fewer draw calls at the home view but ~60k more
   * triangles (a region's mesh draws whole when any of it is in view), so it was taken out. They are also each
   * building's distant silhouette, so all twenty read from afar without their sticks resident.
   */
  private buildAllShells(m: WorldManifest): void {
    const byKey = new Map<string, { def: ManifestLandmark; s: ManifestLandmark["shells"][number] }[]>();
    for (const def of m.landmarks) for (const s of def.shells) {
      const k = `${def.id}|${s.shape}|${s.kind}`;
      const a = byKey.get(k) ?? [];
      a.push({ def, s });
      byKey.set(k, a);
    }
    const m4 = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const place = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const [k, list] of byKey) {
      const [, shape, kind] = k.split("|") as [string, "box" | "cyl", "shade" | "plank" | "glass"];
      const mesh = new THREE.InstancedMesh(this.shellGeo[shape], this.shellMats[kind], list.length);
      if (shape === "cyl") this.shellCyls.push(mesh);
      list.forEach(({ def, s }, i) => {
        q.set(s.q[0], s.q[1], s.q[2], s.q[3]);
        v.set(s.c[0], s.c[1], s.c[2]);
        sc.set(s.h[0], s.h[1], s.h[2]);
        local.compose(v, q, sc);
        place.makeRotationY(def.placement.yaw).setPosition(def.placement.position[0], def.placement.position[1], def.placement.position[2]);
        m4.multiplyMatrices(place, local);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = kind !== "glass";
      mesh.receiveShadow = true;
      mesh.renderOrder = kind === "glass" ? 3 : 0;
      this.scene.add(mesh);
    }
  }

  /**
   * Side-route waymarks (§4): along walked side routes a pair of 4 m M posts with an M lintel every ~32 m, and at a
   * flight route's two ends a taller gate of stacked posts, all real stock pieces in the timber material. Instanced in
   * one mesh per island grid cell (like the rocks) so far ones are culled.
   */
  private buildWaymarks(m: WorldManifest): void {
    const byCell = new Map<number, { pos: number[]; quat: number[] }>();
    const s45 = Math.SQRT1_2;
    const cellOf = (x: number, z: number): number => Math.min(3, Math.max(0, Math.floor((x + 1450) / 725))) + 4 * Math.min(1, Math.max(0, Math.floor((z + 800) / 800)));
    const add = (x: number, y: number, z: number, q: [number, number, number, number]): void => {
      const c = cellOf(x, z);
      const e = byCell.get(c) ?? { pos: [], quat: [] };
      e.pos.push(x, y, z);
      e.quat.push(...q);
      byCell.set(c, e);
    };
    const gate = (x: number, y: number, z: number, dx: number, dz: number, posts: number): void => {
      // two posts 2.6 m apart across the path, `posts` stacked 4 m pieces high, a lintel across the top
      const l = Math.hypot(dx, dz) || 1;
      const sx = -dz / l;
      const sz = dx / l;
      for (const side of [-1.3, 1.3]) for (let k = 0; k < posts; k++) add(x + sx * side, y + 2 + 4 * k, z + sz * side, [0, 0, s45, s45]);
      const yaw = Math.atan2(-sz, sx);
      add(x, y + 4 * posts + 0.25, z, [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
    };
    for (const r of m.sideRoutes) {
      const pts = r.points;
      if (r.mode === "fly") {
        for (const [a, b] of [[0, 1], [pts.length - 1, pts.length - 2]] as const) {
          const p = pts[a]!;
          const q = pts[b]!;
          gate(p[0], p[1], p[2], q[0] - p[0], q[2] - p[2], 3); // flight routes' end points are on the ground (build-world)
        }
        continue;
      }
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i]!;
        const q = pts[Math.min(pts.length - 1, i + 1)]!;
        gate(p[0], p[1], p[2], q[0] - p[0], q[2] - p[2], 1);
      }
    }
    for (const [, e] of byCell) {
      const n = e.pos.length / 3;
      const pos = new Float32Array(e.pos);
      const quat = new Float32Array(e.quat);
      const seed = new Float32Array(n).map((_, i) => (i * 7919) % 10007);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, pos[i * 3]!); x1 = Math.max(x1, pos[i * 3]!);
        y0 = Math.min(y0, pos[i * 3 + 1]!); y1 = Math.max(y1, pos[i * 3 + 1]!);
        z0 = Math.min(z0, pos[i * 3 + 2]!); z1 = Math.max(z1, pos[i * 3 + 2]!);
      }
      const centre = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const geo = this.instancedGeo(this.boxGeo[1]!, { iPos: [pos, 3], iQuat: [quat, 4], iSeed: [seed, 1] }, n, new THREE.Sphere(centre, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 4));
      const mesh = new THREE.Mesh(geo, this.timber[1]!.material);
      mesh.customDepthMaterial = this.timber[1]!.depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.waymarks = true;
      this.scene.add(mesh);
      this.waymarks.push(mesh);
    }
  }
  private waymarks: THREE.Mesh[] = [];

  private buildRocks(m: WorldManifest): void {
    const geos = this.rockGeos;
    const mat = this.rockMat!;
    const field = this.terrain!;
    // scatter after terrain arrives: deterministic positions along cliff feet, ridges and the coast
    const r = ((seed: number) => () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    })(m.seed + 99);
    const per = WORLD_QUALITY[this.tier].rocksPerType;
    const coast = m.coast as [number, number][];
    const fp = m.landmarks.map((l) => ({ x: l.placement.position[0], z: l.placement.position[2], r: Math.hypot(l.targetSize[0], l.targetSize[1]) / 2 + 30 }));
    const route = m.route.points;
    const home = m.home;
    // The scatter is baked once into one static mesh per island grid cell (ROCK_GRID), all eleven
    // shapes together: frustum culling (camera and the ±140 m shadow box) then skips out-of-view
    // cells, and a cell is one draw call. One island-wide instanced mesh per shape drew all ~990
    // rocks in both passes from everywhere (docs/evidence/world/triangles.md). The per-shape loops,
    // RNG order and transforms are unchanged, so the same rocks stand in the same places.
    const [gx, gz] = ROCK_GRID;
    const cellOf = (x: number, z: number): number => {
      const i = Math.min(gx - 1, Math.max(0, Math.floor(((x + 1450) / 2900) * gx)));
      const j = Math.min(gz - 1, Math.max(0, Math.floor(((z + 800) / 1600) * gz)));
      return i + gx * j;
    };
    const place = (): void => {
      const cells: { k: number; m4: THREE.Matrix4 }[][] = Array.from({ length: gx * gz }, () => []);
      for (let k = 0; k < geos.length; k++) {
        let n = 0;
        const q = new THREE.Quaternion();
        for (let tries = 0; tries < per * 12 && n < per; tries++) {
          const x = (r() - 0.5) * 2900;
          const z = (r() - 0.5) * 1600;
          const sd = polygonSdf(coast, x, z);
          // cliff feet and coast (−60…5), and ridge shoulders (high ground), not quiet meadows
          const y = field.height(x, z);
          if (!Number.isFinite(y)) continue;
          const coastal = sd > -70 && sd < 6;
          const ridge = y > 105;
          if (!coastal && !ridge && r() > 0.08) continue;
          if (fp.some((f) => Math.hypot(x - f.x, z - f.z) < f.r)) continue;
          // nor in a riverbed or on its bank's foot
          if (m.rivers.some((rv) => riverDistance(rv.points, x, z) < rv.halfWidth + 8)) continue;
          // keep the home terrace and its outlook clear
          if (Math.hypot(x - home.spawn[0], z - home.spawn[2]) < 160) continue;
          let nearRoute = false;
          for (let i = 0; i < route.length; i += 3) if (Math.hypot(route[i]![0] - x, route[i]![1] - z) < 26) {
            nearRoute = true;
            break;
          }
          if (nearRoute) continue;
          const s = (k >= 8 ? 1.2 : 2.5) + r() * (k >= 8 ? 1.5 : coastal ? 8 : 3.5);
          q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3));
          cells[cellOf(x, z)]!.push({ k, m4: new THREE.Matrix4().compose(new THREE.Vector3(x, y - s * 0.25, z), q, new THREE.Vector3(s, s, s)) });
          n++;
        }
      }
      const nm = new THREE.Matrix3();
      const v = new THREE.Vector3();
      for (const list of cells) {
        if (!list.length) continue;
        let verts = 0;
        for (const it of list) verts += geos[it.k]!.getAttribute("position").count;
        const pos = new Float32Array(verts * 3);
        const nor = new Float32Array(verts * 3);
        let o = 0;
        for (const it of list) {
          const g = geos[it.k]!;
          const gp = g.getAttribute("position");
          const gn = g.getAttribute("normal");
          nm.getNormalMatrix(it.m4);
          for (let i = 0; i < gp.count; i++, o += 3) {
            v.fromBufferAttribute(gp, i).applyMatrix4(it.m4);
            pos[o] = v.x;
            pos[o + 1] = v.y;
            pos[o + 2] = v.z;
            v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
            nor[o] = v.x;
            nor[o + 1] = v.y;
            nor[o + 2] = v.z;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.rocks.push(mesh);
        this.scene.add(mesh);
      }
    };
    this.placeRocks = place;
    // the baked cell meshes are in the scene: dispose()'s traverse frees their geometry; the shared rock
    // geometries and material (also used by the gateways and the courtyard) are freed in dispose()
  }

  private rocksPlaced = false;

  // ---------------------------------------------------------------- landmark streaming and LOD

  /**
   * Distance from the camera to the landmark's bounds (its yawed local box),
   * zero inside. A sphere about the centre made long buildings (L13's 320 m
   * glasshouse, L16's dam) count as distant from their own doorsteps.
   */
  private boundsDistance(lm: LandmarkRuntime, camPos: THREE.Vector3): number {
    const p = lm.def.placement;
    const dx = camPos.x - p.position[0];
    const dz = camPos.z - p.position[2];
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    // world → local: inverse of (x, z) ↦ (x c + z s, −x s + z c)
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const ly = camPos.y - p.position[1];
    const b = lm.def.localBounds;
    const ox = Math.max(b.min[0] - lx, 0, lx - b.max[0]);
    const oy = Math.max(b.min[1] - ly, 0, ly - b.max[1]);
    const oz = Math.max(b.min[2] - lz, 0, lz - b.max[2]);
    return Math.hypot(ox, oy, oz);
  }

  private lodFor(lm: LandmarkRuntime, camPos: THREE.Vector3): 0 | 1 | 2 | 3 {
    const q = WORLD_QUALITY[this.tier];
    const d = this.boundsDistance(lm, camPos);
    // hysteresis: moving to a finer level needs to be 10 % closer than the threshold
    const cur = lm.lod;
    const th = [q.nearDist, q.midDist, q.farDist];
    for (let lvl = 0; lvl < 3; lvl++) {
      const limit = th[lvl]! * (lvl < cur ? 0.9 : 1.1);
      if (d < limit) return lvl as 0 | 1 | 2;
    }
    return 3;
  }

  private detailLoads = 0;
  private detailEvictions = 0;
  private detailCancels = 0;

  /**
   * Load priority: every landmark's far file (nearest first, two at a time) →
   * the nearest landmarks' detail (one decode/upload at a time) → eviction of
   * detail beyond the residency budget. Called on movement, on load completion
   * and on quality changes; cheap when nothing changes.
   */
  private updateStreaming(force = false): void {
    if (!this.manifest) return;
    const cam = this.camera.position;
    const q = WORLD_QUALITY[this.tier];
    const now = performance.now();
    const list = [...this.landmarks.values()].map((lm) => ({ lm, lod: this.lodFor(lm, cam), d: cam.distanceTo(lm.centre) }));
    list.sort((a, b) => a.d - b.d);
    // full detail for the closest `nearCount` buildings only
    let nearUsed = 0;
    for (const it of list) {
      if (it.lod === 0 && nearUsed >= q.nearCount) it.lod = 1;
      if (it.lod === 0) nearUsed++;
    }
    // 1. far files: always wanted, nearest first
    let farLoading = list.filter((it) => it.lm.far.state === "loading").length;
    for (const it of list) {
      if (farLoading >= 2) break;
      if (it.lm.far.state === "unloaded") {
        farLoading++;
        this.loadFar(it.lm);
      }
    }
    // 2. detail: wanted at the near level; one in flight; a load that is no longer wanted is cancelled
    for (const it of list) if (it.lod === 0) it.lm.detail.lastWanted = now;
    const wanted = list.filter((it) => it.lod === 0 && it.lm.far.state === "ready");
    for (const it of list) {
      const dt = it.lm.detail;
      if (dt.state === "loading" && it.lod > 1) {
        this.cancel(dt.requestId);
        dt.requestId = 0;
        dt.state = "unloaded";
        this.detailCancels++;
      }
    }
    const detailLoading = list.some((it) => it.lm.detail.state === "loading");
    if (!detailLoading) {
      const next = wanted.find((it) => it.lm.detail.state === "unloaded");
      if (next) {
        // make room first, so the new arrays never stack on top of a full cache
        this.evictDetail(now, next.lm);
        this.loadDetail(next.lm);
      }
    }
    // 3. apply levels
    for (const it of list) {
      const lm = it.lm;
      if (lm.far.state !== "ready") {
        lm.lod = it.lod;
        continue;
      }
      if (force || lm.lod !== it.lod) this.applyLod(lm, it.lod);
      else if (it.lod === 0) this.updateCells(lm);
    }
    // 4. residency budget (hysteresis: only landmarks unused for DETAIL_GRACE_MS, unless over budget)
    this.evictDetail(now, null);
    this.status.landmarksReady = list.filter((it) => it.lm.far.state === "ready").length;
  }

  /**
   * Release detail beyond the residency budget: the least recently wanted
   * first. A landmark wanted within DETAIL_GRACE_MS (or the one about to load)
   * is kept unless the cache is over its count or byte budget; the landmark
   * currently at the near level is never evicted.
   */
  private evictDetail(now: number, incoming: LandmarkRuntime | null): void {
    const q = WORLD_QUALITY[this.tier];
    const resident = [...this.landmarks.values()].filter((l) => l.detail.state === "ready" && l !== incoming);
    resident.sort((a, b) => a.detail.lastWanted - b.detail.lastWanted);
    const slots = q.detailMax - (incoming ? 1 : 0);
    let count = resident.length;
    let bytes = resident.reduce((a, l) => a + l.detail.bytes, 0);
    for (const l of resident) {
      if (l.lod === 0) continue;
      const over = count > slots || bytes > q.detailBytes;
      const idle = now - l.detail.lastWanted > DETAIL_GRACE_MS;
      if (!over && !idle) continue;
      count--;
      bytes -= l.detail.bytes;
      this.dropDetail(l);
      this.detailEvictions++;
    }
  }

  private loadFar(lm: LandmarkRuntime): void {
    const f = lm.far;
    f.state = "loading";
    const def = lm.def;
    const { id, promise } = this.request<Extract<WorkerResponse, { type: "far" }>>({ type: "far", base: WORLD_BASE, landmark: def.id, path: def.far.path, hash: def.far.hash, position: def.placement.position, yaw: def.placement.yaw } as never);
    f.requestId = id;
    promise
      .then((r) => {
        if (this.disposed || f.requestId !== id) return; // stale
        const c = r.chains;
        const geo = this.instancedGeo(this.unitBox, { iPos: [c.pos, 3], iQuat: [c.quat, 4], iScale: [c.scale, 3] }, 0, new THREE.Sphere(lm.centre.clone(), lm.def.radius + 4));
        const mesh = new THREE.Mesh(geo, this.chainMat.material);
        mesh.customDepthMaterial = this.chainMat.depth;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        f.mesh = mesh;
        f.counts = { all: c.count, long: c.long };
        f.bytes = c.pos.byteLength + c.quat.byteLength + c.scale.byteLength;
        f.state = "ready";
        // collision follows the manifest, never visual detail
        if (!this.grid.has(lm.def.id)) this.grid.add(lm.def.id, lm.def.collision);
        this.applyLod(lm, lm.lod);
        this.invalidate();
        this.updateStreaming();
      })
      .catch(() => {
        if (this.disposed || f.requestId !== id) return;
        f.retries++;
        f.state = f.retries < 3 ? "unloaded" : "error";
        if (f.state === "error") this.events.onFault?.(`${lm.def.title} couldn't load. The rest of the island is still here.`);
        else setTimeout(() => this.updateStreaming(), 1000 * f.retries);
      });
  }

  private loadDetail(lm: LandmarkRuntime): void {
    const dt = lm.detail;
    dt.state = "loading";
    const def = lm.def;
    const { id, promise } = this.request<Extract<WorkerResponse, { type: "detail" }>>({ type: "detail", base: WORLD_BASE, landmark: def.id, path: def.asset.path, hash: def.asset.hash, position: def.placement.position, yaw: def.placement.yaw, cell: CELL } as never);
    dt.requestId = id;
    promise
      .then((r) => {
        // a result for a cancelled or superseded request is dropped (its arrays are garbage once this returns)
        if (this.disposed || dt.requestId !== id) return;
        dt.cells = r.cells.map((d) => ({ data: d, centre: new THREE.Vector3(...d.centre), level: -1, pieces: [], chains: null, dMeshes: [], dLevels: (d.dOct ?? []).map(() => -1) }));
        dt.bytes = cellBytes(r.cells);
        dt.state = "ready";
        dt.retries = 0;
        this.detailLoads++;
        // through applyLod, not updateCells alone: at the near level the far mesh was standing in (the mid
        // prefix) while the detail loaded, and must stop drawing now that the cells do. Before 2026-11-04 it
        // kept drawing, so a landmark reached before its detail arrived was drawn twice in both passes
        // (+48k camera and +48k shadow triangles each; triangles.md).
        if (lm.lod === 0) this.applyLod(lm, 0);
        this.invalidate();
        this.updateStreaming();
      })
      .catch(() => {
        if (this.disposed || dt.requestId !== id) return;
        dt.retries++;
        // detail is optional: the far level keeps showing the building
        dt.state = dt.retries < 3 ? "unloaded" : "error";
        if (dt.state !== "error") setTimeout(() => this.updateStreaming(), 1000 * dt.retries);
        else this.updateStreaming();
      });
  }

  private instancedGeo(base: THREE.BufferGeometry, attrs: Record<string, [Float32Array, number]>, count: number, sphere: THREE.Sphere): THREE.InstancedBufferGeometry {
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.getAttribute("position"));
    geo.setAttribute("normal", base.getAttribute("normal"));
    for (const [k, [a, n]] of Object.entries(attrs)) geo.setAttribute(k, new THREE.InstancedBufferAttribute(a, n));
    geo.instanceCount = count;
    geo.boundingSphere = sphere;
    return geo;
  }

  /** Detach the shared base attributes (owned by the view) before disposing an instanced geometry. */
  private freeGeo(g: THREE.BufferGeometry): void {
    g.index = null;
    g.deleteAttribute("position");
    g.deleteAttribute("normal");
    g.dispose();
  }

  /**
   * Levels: 0 near (cells: real pieces close to the camera, merged chains in
   * the building's distant parts; the far chains while detail is loading),
   * 1 mid (up to midChains of the far file), 2 far (up to farChains),
   * 3 silhouette (the long chains only, capped).
   */
  private applyLod(lm: LandmarkRuntime, lod: 0 | 1 | 2 | 3): void {
    lm.lod = lod;
    const q = WORLD_QUALITY[this.tier];
    const detail = lod === 0 && lm.detail.state === "ready";
    if (lm.far.mesh) {
      const g = lm.far.mesh.geometry as THREE.InstancedBufferGeometry;
      // at the near level without detail yet, the mid prefix stands in
      const lvl = lod === 0 && !detail ? 1 : lod;
      const n = lvl === 1 ? q.midChains : lvl === 2 ? q.farChains : lvl === 3 ? Math.min(lm.far.counts.long, q.silhouetteChains) : 0;
      const count = Math.min(lm.far.counts.all, n);
      if (g.instanceCount !== count) g.instanceCount = count;
      lm.far.mesh.visible = count > 0;
      lm.far.mesh.castShadow = lvl === 1 && q.shadowMap > 0;
    }
    if (detail) this.updateCells(lm);
    else
      for (const c of lm.detail.cells) {
        this.setCellLevel(c, -1);
        c.dLevels.forEach((_, i) => this.setOctantLevel(c, i, -1));
      }
    this.invalidate();
  }

  /** Near level: each cell picks its own detail from the camera's distance. */
  private updateCells(lm: LandmarkRuntime): void {
    if (lm.detail.state !== "ready") return;
    const q = WORLD_QUALITY[this.tier];
    const cam = this.camera.position;
    const level = (d: number, cur: number): number => (d < q.cellFull * (cur > 0 ? 0.9 : 1.1) ? 0 : d < q.cellStruct * (cur > 1 ? 0.9 : 1.1) ? 1 : 2);
    const v = new THREE.Vector3();
    for (const c of lm.detail.cells) {
      const want = level(Math.max(0, cam.distanceTo(c.centre) - c.data.radius), c.level);
      this.setCellLevel(c, want);
      // D per octant: the same rule from each octant's own bounds (it lies inside the cell, so never finer)
      c.data.dOct?.forEach((o, i) => {
        const d = Math.max(0, cam.distanceTo(v.set(o.centre[0], o.centre[1], o.centre[2])) - o.radius);
        this.setOctantLevel(c, i, want < 0 || want === 2 ? want : Math.max(want, level(d, c.dLevels[i]!)));
      });
    }
  }

  /** One octant's D pieces at a level (0 all tiers, 1 structural tiers, otherwise none). Meshes are made on first use. */
  private setOctantLevel(c: CellRuntime, i: number, level: number): void {
    if (c.dLevels[i] === level) return;
    c.dLevels[i] = level;
    const o = c.data.dOct![i]!;
    if (level >= 0 && level <= 1 && !c.dMeshes.length) {
      // all of the cell's D octant meshes at once (views into the cell's D arrays: no copies)
      const st = c.data.stocks[2]!;
      for (const oc of c.data.dOct!) {
        const a = oc.start;
        const b = oc.tierEnd[2];
        const sphere = new THREE.Sphere(new THREE.Vector3(...oc.centre), oc.radius + 1);
        const geo = this.instancedGeo(this.boxGeo[2]!, { iPos: [st.pos.subarray(a * 3, b * 3), 3], iQuat: [st.quat.subarray(a * 4, b * 4), 4], iSeed: [st.seed.subarray(a, b), 1] }, 0, sphere);
        const mesh = new THREE.Mesh(geo, this.timber[2]!.material);
        mesh.customDepthMaterial = this.timber[2]!.depth;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.userData.stock = 2;
        mesh.visible = false;
        this.scene.add(mesh);
        c.dMeshes.push(mesh);
      }
    }
    const m = c.dMeshes[i];
    if (!m) return;
    const g = m.geometry as THREE.InstancedBufferGeometry;
    g.instanceCount = level === 0 ? o.tierEnd[2] - o.start : level === 1 ? o.tierEnd[1] - o.start : 0;
    m.visible = g.instanceCount > 0;
  }

  /**
   * A cell's meshes are created the first time it is shown and kept while its
   * landmark's detail is resident: later level changes only change instance
   * counts and visibility (no buffer is rebuilt or re-uploaded). They are
   * freed together with the cell's arrays when the detail is evicted.
   */
  private setCellLevel(c: CellRuntime, level: number): void {
    if (c.level === level) return;
    c.level = level;
    if (level >= 0 && level <= 1 && !c.pieces.length) {
      const sphere = new THREE.Sphere(c.centre.clone(), c.data.radius + 1);
      c.data.stocks.forEach((st, k) => {
        if (!st.seed.length) return;
        if (k === 2 && c.data.dOct) return; // D is drawn per octant (setOctantLevel)
        const geo = this.instancedGeo(this.boxGeo[k]!, { iPos: [st.pos, 3], iQuat: [st.quat, 4], iSeed: [st.seed, 1] }, 0, sphere.clone());
        const mesh = new THREE.Mesh(geo, this.timber[k]!.material);
        mesh.customDepthMaterial = this.timber[k]!.depth;
        mesh.receiveShadow = true;
        mesh.userData.stock = k;
        this.scene.add(mesh);
        c.pieces.push(mesh);
      });
    }
    if (level === 2 && !c.chains && c.data.chains.count) {
      const ch = c.data.chains;
      const geo = this.instancedGeo(this.unitBox, { iPos: [ch.pos, 3], iQuat: [ch.quat, 4], iScale: [ch.scale, 3] }, ch.count, new THREE.Sphere(c.centre.clone(), c.data.radius + 1));
      c.chains = new THREE.Mesh(geo, this.chainMat.material);
      c.chains.customDepthMaterial = this.chainMat.depth;
      c.chains.receiveShadow = true;
      this.scene.add(c.chains);
    }
    const shadows = WORLD_QUALITY[this.tier].shadowMap > 0;
    for (const m of c.pieces) {
      const k = m.userData.stock as number;
      const st = c.data.stocks[k]!;
      const g = m.geometry as THREE.InstancedBufferGeometry;
      g.instanceCount = level === 0 ? st.tierEnd[2] : level === 1 ? st.tierEnd[1] : 0;
      m.visible = g.instanceCount > 0;
      m.castShadow = level === 0 && k < 2 && shadows;
    }
    if (c.chains) c.chains.visible = level === 2;
  }

  /** Free a cell's meshes (GPU buffers of its own attributes; the shared base geometry and materials stay). */
  private freeCell(c: CellRuntime): void {
    for (const m of c.pieces) {
      this.scene.remove(m);
      this.freeGeo(m.geometry);
    }
    c.pieces = [];
    for (const m of c.dMeshes) {
      this.scene.remove(m);
      this.freeGeo(m.geometry);
    }
    c.dMeshes = [];
    c.dLevels = c.dLevels.map(() => -1);
    if (c.chains) {
      this.scene.remove(c.chains);
      this.freeGeo(c.chains.geometry);
      c.chains = null;
    }
    c.level = -1;
  }

  /** Evict a landmark's detail: GPU buffers and CPU arrays both go; a later visit fetches it again (HTTP-cached). */
  private dropDetail(lm: LandmarkRuntime): void {
    const dt = lm.detail;
    if (dt.state === "loading") {
      this.cancel(dt.requestId);
      this.detailCancels++;
    }
    for (const c of dt.cells) this.freeCell(c);
    dt.cells = [];
    dt.bytes = 0;
    dt.requestId = 0;
    if (dt.state !== "error") dt.state = "unloaded";
    if (lm.lod === 0) this.applyLod(lm, 0); // the far chains stand in
  }

  private dropFar(lm: LandmarkRuntime): void {
    const f = lm.far;
    if (f.state === "loading") this.cancel(f.requestId);
    if (f.mesh) {
      this.scene.remove(f.mesh);
      this.freeGeo(f.mesh.geometry);
      f.mesh = null;
    }
    f.state = "unloaded";
    // collision stays: changing detail never removes a validated passage
  }

  residency(): Residency {
    const ls = [...this.landmarks.values()];
    return {
      detailed: ls.filter((l) => l.detail.state === "ready").map((l) => l.def.id),
      detailBytes: ls.reduce((a, l) => a + l.detail.bytes, 0),
      farReady: ls.filter((l) => l.far.state === "ready").length,
      pending: this.pending.size,
      detailLoads: this.detailLoads,
      detailEvictions: this.detailEvictions,
      detailCancels: this.detailCancels,
      cellMeshes: ls.reduce((a, l) => a + l.detail.cells.reduce((b, c) => b + c.pieces.length + c.dMeshes.length + (c.chains ? 1 : 0), 0), 0),
      framesHeld: this.framesHeld,
      fencePending: this.gpuFence !== null,
      contextRestores: this.contextRestores,
    };
  }

  // ---------------------------------------------------------------- control
  //
  // Explicit states (interaction brief §8): `status.control` is exploring vs. paused/idle/transitioning;
  // `status.pointerLocked` is Look lock vs. free cursor; `input.speed` is the preset. Presentation (embedded or
  // fullscreen) and focus belong to the stage. Every path that stops input goes through clearInput().

  /**
   * Explicit gesture-driven control start (never automatic). The cursor stays free: Look lock is a separate,
   * deliberate action (requestLookLock). `pointerLock: true` is kept for callers that ask for both at once.
   */
  takeControl(opts: { pointerLock?: boolean } = {}): void {
    if (!this.flight || this.status.phase !== "ready") return;
    this.clearInput();
    this.status.control = "exploring";
    this.flight.state = "exploring";
    this.lastFrame = 0;
    this.emit();
    if (opts.pointerLock) this.requestLookLock();
    this.invalidate();
  }

  /**
   * Look lock: pointer lock on the canvas, only from a user gesture while exploring. Resolves to whether it
   * engaged; on failure (unsupported, refused, too soon after an Esc release) the cursor simply stays free.
   */
  async requestLookLock(): Promise<boolean> {
    const canvas = this.renderer.domElement;
    if (this.status.control !== "exploring" || typeof canvas.requestPointerLock !== "function") return false;
    if (document.pointerLockElement === canvas) return true;
    try {
      // older engines return undefined rather than a promise; the pointerlockchange event reports the outcome
      await (canvas.requestPointerLock() as Promise<void> | undefined);
    } catch {
      return false;
    }
    return document.pointerLockElement === canvas;
  }

  /** Release Look lock (the cursor returns); exploring continues in free-cursor mode, with held input cleared. */
  releaseLookLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.suspendInput();
  }

  /** Pause, menus opening, blur, hidden or navigation: clear held input, stop moving, release Look lock. */
  releaseControl(to: ControlState = "paused"): void {
    this.clearInput();
    if (this.flight) {
      this.flight.vel = [0, 0, 0];
      this.flight.state = to === "exploring" ? "paused" : to;
    }
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    if (this.status.control !== to) {
      this.status.control = to;
      this.emit();
    }
    this.invalidate();
  }

  /**
   * Stop moving without leaving exploring: held keys, drag and look deltas are dropped and the explorer
   * decelerates as when keys are released (scrolling the page, focus leaving the world, Look lock released).
   */
  suspendInput(): void {
    this.clearInput();
    this.invalidate();
  }

  /** Drop every held input. The speed preset is a setting, not held input, and is kept. */
  clearInput(): void {
    const i = this.input;
    i.move[0] = i.move[1] = 0;
    i.ascend = i.descend = i.boost = false;
    i.look[0] = i.look[1] = 0;
  }

  /** Select Walk, Run or Fly: no pause, no change of position or heading; velocity eases to the new target. */
  setSpeed(mode: SpeedMode): void {
    if (this.input.speed === mode) return;
    this.input.speed = mode;
    this.status.speed = mode;
    this.emit();
    this.invalidate();
  }

  /** The explorer's pose (for Return to world), or null before the island has loaded. */
  pose(): WorldPose | null {
    const f = this.flight;
    if (!f || this.status.phase !== "ready") return null;
    return { feet: [f.feet[0], f.feet[1], f.feet[2]], yaw: f.yaw, pitch: f.pitch };
  }

  /**
   * A remembered pose made safe: finite, inside the hard boundary and under the ceiling, lifted onto the
   * ground, and clear of the colliders of every building around it; otherwise the nearest declared safe point.
   * Portals around the result are disarmed so a pose saved on a portal's threshold doesn't re-enter it.
   */
  private validStart(p: WorldPose): { feet: [number, number, number]; yaw: number; pitch: number; flying: boolean } | null {
    if (!this.world || !this.manifest) return null;
    const ok = Array.isArray(p.feet) && p.feet.length === 3 && p.feet.every(Number.isFinite) && Number.isFinite(p.yaw) && Number.isFinite(p.pitch);
    if (!ok) return this.safeStart(null);
    this.addCollidersAround(p.feet[0], p.feet[2]);
    const feet: [number, number, number] = [p.feet[0], p.feet[1], p.feet[2]];
    const ground = groundUnder(this.world, this.grid, feet[0], feet[2], feet[1] + 0.5);
    if (feet[1] < ground) feet[1] = ground;
    const inside = this.world.coast(feet[0], feet[2]) <= this.world.hard - 1 && feet[1] + PLAYER.eye < this.world.ceiling;
    if (!inside || !clearAt(this.world, this.grid, [feet[0], feet[1] + 0.02, feet[2]]).ok) return this.safeStart(feet);
    this.disarmPortalsNear(feet);
    return { feet, yaw: p.yaw, pitch: Math.max(-1.5, Math.min(1.5, p.pitch)), flying: feet[1] > ground + 1 };
  }

  private safeStart(near: readonly number[] | null): { feet: [number, number, number]; yaw: number; pitch: number; flying: boolean } | null {
    const sp = near ? this.nearestSafePoint(near) : null;
    if (!sp || !this.world) return null; // no usable pose: the home spawn
    this.addCollidersAround(sp.feet[0]!, sp.feet[2]!);
    const feet: [number, number, number] = [sp.feet[0]!, sp.feet[1]!, sp.feet[2]!];
    const ground = groundUnder(this.world, this.grid, feet[0], feet[2], feet[1] + 0.5);
    if (feet[1] < ground) feet[1] = ground;
    this.disarmPortalsNear(feet);
    this.events.onFault?.("Your last position wasn't safe any more, so you're at the nearest safe point.");
    return { feet, yaw: sp.yaw, pitch: 0, flying: false };
  }

  /** Collision for every landmark around a point (independent of its visual assets). */
  private addCollidersAround(x: number, z: number, reach = 60): void {
    for (const lm of this.landmarks.values()) {
      const d = Math.hypot(lm.centre.x - x, lm.centre.z - z);
      if (d < lm.def.radius + reach && !this.grid.has(lm.def.id)) this.grid.add(lm.def.id, lm.def.collision);
    }
  }

  private disarmPortalsNear(feet: readonly number[]): void {
    for (const p of this.portals) if (Math.hypot(feet[0]! - p.pos.x, feet[2]! - p.pos.z) <= 4) p.armed = false;
  }

  /** Teleport to a world safe point, a landmark viewpoint or home; loads the destination first. */
  async jumpTo(target: { feet: number[]; yaw: number; pitch?: number }, opts: { land?: boolean } = {}): Promise<boolean> {
    if (!this.flight || !this.world || this.transitionLock) return false;
    this.transitionLock = true;
    const prev = this.status.control;
    this.releaseControl("transitioning");
    try {
      await this.ensureTerrainAround(target.feet[0]!, target.feet[2]!, 300, false);
      // load collision for any landmark around the destination before moving
      this.addCollidersAround(target.feet[0]!, target.feet[2]!);
      const feet: [number, number, number] = [target.feet[0]!, target.feet[1]!, target.feet[2]!];
      const ground = groundUnder(this.world, this.grid, feet[0], feet[2], feet[1] + 0.5);
      if (feet[1] < ground) feet[1] = ground;
      // a recovery (a safe point) stands on the surface under the point: some recipe safe points sit above the
      // loaded terrain where a pad ends or a river is cut (docs/10-day-night/10-02-courtyard-report.md), and
      // "return to a safe point" must not leave the explorer hovering there
      if (opts.land) feet[1] = ground;
      // a destination in the air (a flight viewpoint) is reached flying: the explorer hovers there instead of dropping
      this.flight.teleport({ feet, yaw: target.yaw, pitch: target.pitch ?? 0, flying: !opts.land && feet[1] > ground + 1 });
      this.placeCamera();
      // terrain steps, grass and streaming follow the new pose now: tick() only follows the camera when a frame's
      // own movement changed it, so a teleport left the departure point's terrain detail until the explorer walked
      this.followCamera();
      this.updateStreaming(true);
      this.status.control = prev === "exploring" ? "paused" : prev === "transitioning" ? "paused" : prev;
      this.flight.state = this.status.control;
      this.emit();
      return true;
    } finally {
      this.transitionLock = false;
      this.invalidate();
    }
  }

  /**
   * The nearest usable safe point to the camera, or to a given position (stable ids from the manifest). Candidates
   * are tried nearest first; one whose capsule, stood on the surface under it, overlaps a building's collision
   * (two route points fall inside the dam's body) is skipped. If none of the nearest few is clear, the nearest
   * is returned as before.
   */
  nearestSafePoint(at?: readonly number[]): { feet: number[]; yaw: number; id: string } | null {
    if (!this.manifest || !this.flight || !this.world) return null;
    const f = at ?? this.flight.feet;
    const ranked = this.manifest.safePoints
      .map((s) => ({ s, d: Math.hypot(s.feet[0] - f[0], s.feet[1] - f[1], s.feet[2] - f[2]) }))
      .sort((a, b) => a.d - b.d);
    if (!ranked.length) return null;
    for (const { s } of ranked.slice(0, 6)) if (this.safePointClear(s.feet)) return s;
    return ranked[0]!.s;
  }

  /**
   * Test probe (opt-in, read-only): the standable surface under a point and whether a capsule there is clear, with
   * the same loaded terrain and collision that movement and recovery use. Loads nearby building collision.
   */
  probeGround(x: number, z: number, fromY: number): number {
    if (!this.world) return NaN;
    this.addCollidersAround(x, z);
    return groundUnder(this.world, this.grid, x, z, fromY);
  }
  probeClear(feet: readonly number[]): boolean {
    if (!this.world) return false;
    this.addCollidersAround(feet[0]!, feet[2]!);
    return clearAt(this.world, this.grid, [feet[0]!, feet[1]!, feet[2]!]).ok;
  }

  /** A safe point stood on the surface under it: a clear, standable capsule (loaded terrain and nearby collision). */
  private safePointClear(p: readonly number[]): boolean {
    if (!this.world || !this.terrain) return true; // nothing loaded to test against: keep the declared point
    const idx = this.terrain.indexAt(p[0]!, p[2]!);
    if (idx >= 0 && !this.terrain.has(idx)) return true; // terrain not resident yet: jumpTo loads it; trust the point
    this.addCollidersAround(p[0]!, p[2]!);
    const ground = groundUnder(this.world, this.grid, p[0]!, p[2]!, p[1]! + 0.5);
    return clearAt(this.world, this.grid, [p[0]!, Math.max(p[1]!, ground) + 0.02, p[2]!]).ok;
  }

  goHome(): Promise<boolean> {
    const h = this.manifest?.home;
    if (!h) return Promise.resolve(false);
    return this.jumpTo({ feet: h.spawn, yaw: h.yaw, pitch: -0.03 });
  }

  /** Arm the transition lock for a portal handled outside (navigation), with a cooldown. */
  beginPortalTransition(): boolean {
    const now = performance.now();
    if (this.transitionLock || now < this.portalCooldownUntil) return false;
    this.transitionLock = true;
    this.portalCooldownUntil = now + 1500;
    this.releaseControl("leaving");
    return true;
  }
  endPortalTransition(): void {
    this.transitionLock = false;
    this.releaseControl("paused");
  }

  // ---------------------------------------------------------------- frame

  invalidate = (): void => {
    if (this.disposed || this.raf || document.hidden || !this.onScreen || this.status.phase === "context-lost") return;
    this.raf = requestAnimationFrame(this.tick);
  };

  /** The world scrolled into or out of the page's view: frames stop while it's off screen and resume after. */
  private setOnScreen(on: boolean): void {
    if (this.onScreen === on) return;
    this.onScreen = on;
    if (!on) {
      // nothing should move unseen (the stage also suspends input); the loop ends at its next frame
      this.suspendInput();
      return;
    }
    this.lastFrame = 0;
    this.auto.resume();
    this.invalidate();
  }

  private placeCamera(): void {
    if (!this.flight) return;
    const e = this.flight.eye();
    this.camera.position.set(e[0], e[1], e[2]);
    this.camera.rotation.set(this.flight.pitch, this.flight.yaw, 0);
    this.camera.updateMatrixWorld();
  }

  /** True when the last submitted frame has finished on the GPU (or a stuck fence has waited over a second). */
  private gpuReady(now: number): boolean {
    const f = this.gpuFence;
    if (!f) return true;
    const gl = this.renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) return true;
    if (gl.isContextLost()) {
      this.gpuFence = null;
      return true;
    }
    const status = gl.getSyncParameter(f, gl.SYNC_STATUS);
    if (status !== gl.SIGNALED && now - this.fenceSince < 1000) return false;
    gl.deleteSync(f);
    this.gpuFence = null;
    return true;
  }

  private dropFence(): void {
    const f = this.gpuFence;
    this.gpuFence = null;
    const gl = this.renderer.getContext();
    if (f && gl instanceof WebGL2RenderingContext && !gl.isContextLost()) gl.deleteSync(f);
  }

  private fenceFrame(now: number): void {
    const gl = this.renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext) || gl.isContextLost()) return;
    this.gpuFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.fenceSince = now;
    gl.flush();
  }

  private tick = (now: number): void => {
    this.raf = 0;
    // a frame queued before the context was lost (e.g. by the fence's held-frame path) must not draw into it;
    // nor does a frame for a world scrolled out of view (setOnScreen restarts the loop)
    if (this.disposed || document.hidden || !this.onScreen || this.status.phase === "context-lost") return;
    const t0 = performance.now();
    const dt = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    let animating = false;
    if (this.flight && this.world && this.status.phase === "ready") {
      const f = this.flight;
      const before = [...f.feet];
      const yaw0 = f.yaw;
      const pitch0 = f.pitch;
      // collision must be ready around the player before moving into it
      const idx = this.terrain!.indexAt(f.feet[0], f.feet[2]);
      const ready = idx < 0 || this.terrain!.has(idx);
      if (ready) f.step(dt, this.input, this.world, this.grid, now);
      if (f.fault) {
        const msg = f.fault;
        f.fault = null;
        const sp = this.nearestSafePoint();
        if (sp) void this.jumpTo(sp, { land: true });
        this.events.onFault?.(`You were returned to a safe point (${msg}).`);
      }
      this.placeCamera();
      const moved = Math.hypot(f.feet[0] - before[0]!, f.feet[1] - before[1]!, f.feet[2] - before[2]!) > 1e-5 || f.yaw !== yaw0 || f.pitch !== pitch0;
      const speed = Math.hypot(f.vel[0], f.vel[1], f.vel[2]);
      animating = this.status.control === "exploring" && (moved || speed > 0.01 || this.input.move[0] !== 0 || this.input.move[1] !== 0 || this.input.ascend || this.input.descend);
      this.updateProximity();
      if (this.status.flying !== f.flying || Math.abs(this.status.boundary - f.boundary) > 0.05) {
        this.status.flying = f.flying;
        this.status.boundary = f.boundary;
        this.emit();
      }
      // terrain LOD and grass follow the camera (cheap checks; rebuilds only on movement)
      if (moved || this.renders === 0) this.followCamera();
    }
    // the portal lettering's glow eases over about a fifth of a second (instantly for reduced motion); frames
    // continue only while it is changing, so a resting view still stops its loop
    const labelsMoving = this.labels?.step(dt, this.reducedMotion || this.renders === 0) ?? false;
    // the environment's blend (a manual Day/Night change eases over a few seconds inside this same loop)
    const envMoving = this.env.step(now);
    if (envMoving) this.applyEnv();
    // ambient motion: clouds, water and grass sway (disabled for reduced motion; also only while exploring)
    const ambient = !this.reducedMotion && this.status.control === "exploring";
    const ts = now / 1000;
    if (this.sea) this.sea.uniforms.uTime.value = ts;
    for (const fl of this.flows) fl.uniforms.uTime.value = ts;
    if (this.grass) {
      this.grass.uniforms.uTime.value = ambient ? ts : this.grass.uniforms.uTime.value;
      this.grass.uniforms.uWind.value = this.reducedMotion ? 0 : 1;
    }
    if (this.courtView) {
      const fu = this.courtView.flowers.uniforms;
      fu.uTime.value = ambient ? ts : fu.uTime.value;
      fu.uWind.value = this.reducedMotion ? 0 : 1;
      const wu = this.courtView.water.uniforms;
      wu.uTime.value = ambient ? ts : wu.uTime.value;
      wu.uRipple.value = this.reducedMotion || WORLD_QUALITY[this.tier].pondRipples === false ? 0 : 1;
    }
    // candles: flicker only while exploring (and never with reduced motion); the light pool follows the camera
    let candlesMoving = false;
    if (this.candles) {
      this.candles.setTime(ambient ? ts : 0, ambient && WORLD_QUALITY[this.tier].flameFlicker);
      candlesMoving = this.candles.update(this.camera.position, Math.min(dt, 0.1), this.reducedMotion || this.renders === 0);
    }
    if (this.moon) this.moon.follow(this.camera.position);
    this.courtView?.follow(this.camera.position);
    if (ambient && this.clouds) this.clouds.drift(ts);
    // the previous frame still on the GPU: keep simulating, submit nothing, look again next RAF
    if (!this.gpuReady(now)) {
      this.framesHeld++;
      this.animating = true;
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    // shadows follow the camera; the key light (the sun, or the moon at night) shines from the environment's direction
    const c = this.camera.position;
    this.sun.target.position.set(c.x, c.y - 20, c.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.keyDir, KEY_DISTANCE);
    const skipped = this.cullShadowCasters();
    this.renderer.render(this.scene, this.camera);
    for (const o of skipped) o.castShadow = true;
    skipped.length = 0;
    this.fenceFrame(now);
    this.renders++;
    const info = this.renderer.info.render;
    this.debug.frames++;
    this.debug.drawCalls = info.calls;
    this.debug.triangles = info.triangles;
    this.debug.lastFrameMs = performance.now() - t0;
    // the adaptive tier sees the time between submitted frames (held frames are part of a slow frame, not fast ones)
    const interval = this.lastSubmit && this.animating ? now - this.lastSubmit : undefined;
    this.lastSubmit = now;
    const nextTier = this.auto.frame(now, { interval, deferUpgrade: animating });
    if (nextTier) this.applyTier(nextTier);
    this.animating = animating || ambient || labelsMoving || envMoving || candlesMoving;
    if (this.animating) this.raf = requestAnimationFrame(this.tick);
  };

  private lastFollow = new THREE.Vector3(Infinity, 0, 0);
  private followCamera(): void {
    const c = this.camera.position;
    if (c.distanceTo(this.lastFollow) < 6) return;
    this.lastFollow.copy(c);
    // collision ahead of the explorer at any speed, before (and independent of) the building's visual assets
    if (this.manifest) this.addCollidersAround(c.x, c.z, COLLIDER_REACH);
    for (const tile of this.terrainMeshes.keys()) this.updateTile(tile);
    this.updateStreaming();
    if (!this.rocksPlaced && this.terrain && this.status.phase === "ready" && this.terrainRequested.size >= (this.manifest?.terrain.chunksX ?? 0) * (this.manifest?.terrain.chunksZ ?? 0) && this.terrain.chunks.size === this.terrainRequested.size) {
      this.rocksPlaced = true;
      this.placeRocks?.();
      this.placeRocks = null;
    }
    // grass around the camera, rebuilt every ~10 m
    if (this.grass && this.terrain && this.manifest && Math.hypot(c.x - this.grassAt.x, c.z - this.grassAt.y) > 10) {
      this.grassAt.set(c.x, c.z);
      const q = WORLD_QUALITY[this.tier];
      const fps = this.manifest.landmarks.map((l) => ({ l, c: Math.cos(l.placement.yaw), s: Math.sin(l.placement.yaw) }));
      const safe = this.manifest.safePoints;
      const field = this.terrain;
      const court = this.court;
      const excluded = (x: number, z: number): boolean => {
        for (const { l, c: cy, s } of fps) {
          const dx = x - l.placement.position[0];
          const dz = z - l.placement.position[2];
          const lx = dx * cy - dz * s;
          const lz = dx * s + dz * cy;
          if (Math.abs(lx) < l.targetSize[0] / 2 + 3 && Math.abs(lz) < l.targetSize[1] / 2 + 3) return true;
        }
        for (const p of this.portals) if (Math.hypot(x - p.pos.x, z - p.pos.z) < 6) return true;
        // the courtyard: no grass in the pond or its banks, on the stones or in the meadow's flowers
        if (court && courtExcludes(court, x, z)) return true;
        for (const s2 of safe) if (Math.abs(x - s2.feet[0]) < 2.5 && Math.abs(z - s2.feet[2]) < 2.5) return true;
        // no grass in a riverbed
        for (const r of this.manifest!.rivers) if (riverDistance(r.points, x, z) < r.halfWidth + 1) return true;
        return false;
      };
      this.grass.rebuild(c.x, c.z, q.grassRadius, q.grass, (x, z) => field.height(x, z), excluded);
      this.grass.uniforms.uFade.value.set(q.grassRadius * 0.55, q.grassRadius);
    }
  }

  private updateProximity(): void {
    if (!this.flight || !this.manifest) return;
    const f = this.flight.feet;
    // portals: label within ~6 m, enter prompt within ~2 m, crossing the threshold enters once
    let near: WorldStatus["nearPortal"] = null;
    const inRange = this.portals.map(() => false);
    const inEnter = this.portals.map(() => false);
    let nearest = Infinity;
    for (const [k, p] of this.portals.entries()) {
      const dx = f[0] - p.pos.x;
      const dz = f[2] - p.pos.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      const side = dx * p.normal.x + dz * p.normal.z; // + = the approach side
      if (dist < 6) near = { id: p.id, label: p.label, close: dist < 2.2 };
      inRange[k] = dist < 6;
      inEnter[k] = dist < 2.2;
      // leave-trigger-to-rearm: re-arm once outside 4 m
      if (dist > 4) p.armed = true;
      const lateral = Math.abs(-dx * p.normal.z + dz * p.normal.x);
      if (p.armed && lateral < 3 && Math.abs(side) < 0.6 && f[1] - p.pos.y < 9 && this.status.control === "exploring") {
        p.armed = false;
        this.events.onPortal?.(p.id);
      }
    }
    // the lettering brightens with the same two ranges the HUD uses (labels are in `portals` order)
    this.labels?.setActive(inRange, inEnter);
    // beyond this the letters are about a pixel tall: skip the draw (a flight over the island never pays for them)
    if (this.labels) this.labels.mesh.visible = nearest < LABEL_VISIBLE_M;
    const changed = (near?.id ?? null) !== (this.status.nearPortal?.id ?? null) || (near?.close ?? false) !== (this.status.nearPortal?.close ?? false);
    // region and landmark plaque
    let region = "home";
    let prompt = this.manifest.regions[0]?.prompt ?? "";
    let best: WorldStatus["nearLandmark"] = null;
    let bestD = Infinity;
    for (const lm of this.landmarks.values()) {
      const d = Math.hypot(lm.centre.x - f[0], lm.centre.z - f[2]) - lm.def.radius * 0.5;
      if (d < bestD) {
        bestD = d;
        best = { id: lm.def.id, title: lm.def.title, inspiration: lm.def.inspiration, distance: Math.max(0, d) };
      }
    }
    const homeD = Math.hypot(f[0] - this.manifest.home.spawn[0], f[2] - this.manifest.home.spawn[2]);
    if (best && homeD > 120) {
      region = this.landmarks.get(best.id)!.def.regionId;
      prompt = this.manifest.regions.find((r) => r.id === region)?.prompt ?? "";
    }
    const plaque = best && best.distance < 400 ? best : null;
    // side routes (start or end within 25 m) and reveals (40 m from the point where the landmark comes into view;
    // the prompt stays until 120 m away)
    let way: string | null = null;
    for (const r of this.manifest.sideRoutes) {
      const a = r.points[0]!;
      const b = r.points[r.points.length - 1]!;
      if (Math.hypot(f[0] - a[0], f[2] - a[2]) < 25 || Math.hypot(f[0] - b[0], f[2] - b[2]) < 25) way = `Side route: ${r.name}${r.mode === "fly" ? " (flight)" : ""}`;
    }
    for (const r of this.manifest.reveals) {
      const d = Math.hypot(f[0] - r.shown[0], f[2] - r.shown[2]);
      const keep = this.status.wayPrompt?.startsWith(this.landmarks.get(r.landmark)?.def.title ?? "\u0000") && d < 120;
      if (d < 40 || keep) way = `${this.landmarks.get(r.landmark)?.def.title ?? r.landmark} comes into view`;
    }
    if (changed || region !== this.status.regionId || (plaque?.id ?? null) !== (this.status.nearLandmark?.id ?? null) || way !== (this.status.wayPrompt ?? null)) {
      this.status.nearPortal = near;
      this.status.regionId = region;
      this.status.regionPrompt = prompt;
      this.status.nearLandmark = plaque;
      this.status.wayPrompt = way;
      this.emit();
    } else this.status.nearPortal = near;
  }

  // ---------------------------------------------------------------- environment (day/night)

  /** Push the environment's current state into every lit part of the scene (no rebuild, no new lights). */
  private applyEnv(): void {
    const e = applyEnvironment(
      {
        renderer: this.renderer,
        scene: this.scene,
        key: this.sun,
        hemi: this.hemi,
        sky: this.sky,
        sea: this.sea,
        flows: this.flows,
        pond: this.courtView?.water ?? null,
        clouds: this.clouds,
        membranes: this.membranes,
        labels: this.labels,
        candles: this.candles,
        stage: this.container.closest(".world-stage") as HTMLElement | null,
      },
      this.env.night,
      this.moon,
    );
    this.keyDir.set(e.key.dir[0], e.key.dir[1], e.key.dir[2]);
  }

  /** Re-read the clock (Auto). `snap` after a return to the tab: no replay of a transition that happened unseen. */
  private refreshEnv(snap: boolean): void {
    const was = this.env.status();
    if (this.env.refresh(performance.now(), snap)) {
      this.applyEnv();
      this.invalidate();
    }
    const now = this.env.status();
    if (was.phase !== now.phase || was.mode !== now.mode) this.events.onEnvironment?.(now);
    this.envChecked++;
  }

  /** Choose Auto / Day / Night: blends over a few seconds (immediately with reduced motion). A local preference only. */
  setLightMode(mode: LightMode): void {
    this.env.reducedMotion = this.reducedMotion;
    this.env.setMode(mode, performance.now());
    this.events.onEnvironment?.(this.env.status());
    this.invalidate();
  }

  environment(): EnvironmentStatus {
    return this.env.status();
  }

  /** Tests and review only: replace the clock (the environment snaps to it). The operating system's clock is untouched. */
  setClock(clock: () => Date): void {
    this.env.setClock(clock, performance.now());
    this.applyEnv();
    this.events.onEnvironment?.(this.env.status());
    this.invalidate();
  }

  /** The tier's share of the courtyard's flowers and the candle pool's size. */
  private applyQualityToEnvironment(): void {
    const q = WORLD_QUALITY[this.tier];
    this.courtView?.setFlowerDensity(q.flowerDensity, q.flowerFade);
    this.candles?.setTier(this.tier);
  }

  // ---------------------------------------------------------------- quality (reuses the existing preference)

  private applyMode(mode: QualityMode, initial = false): void {
    if (this.disposed || (!initial && mode === this.auto.mode)) return;
    this.applyTier(this.auto.setMode(mode));
  }

  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    const q = WORLD_QUALITY[tier];
    const shadows = q.shadowMap > 0;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      if (!shadows) {
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) mat.needsUpdate = true;
      });
    }
    if (shadows && this.sun.shadow.mapSize.x !== q.shadowMap) this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    // shell cylinders: fewer radial segments on lower tiers (one shared geometry, swapped for all of them)
    const segs = (this.shellGeo.cyl.parameters as { radialSegments: number }).radialSegments;
    if (segs !== q.shellSegments) {
      const old = this.shellGeo.cyl;
      this.shellGeo.cyl = new THREE.CylinderGeometry(1, 1, 2, q.shellSegments, 1, false);
      for (const m of this.shellCyls) m.geometry = this.shellGeo.cyl;
      old.dispose();
    }
    this.scene.fog = new THREE.Fog(new THREE.Color("#c9d9df"), q.fogNear, q.fogFar);
    this.applyQualityToEnvironment();
    this.applyEnv();
    this.camera.far = q.fogFar + 400;
    this.camera.updateProjectionMatrix();
    this.applied = null;
    this.syncSize();
    this.grassAt.set(Infinity, Infinity);
    this.lastFollow.set(Infinity, 0, 0);
    reportAppliedTier(this, tier);
    if (this.manifest) this.updateStreaming(true);
    this.invalidate();
  }

  private applied: { w: number; h: number; pr: number } | null = null;
  private syncSize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(effectivePixelRatio(this.tier, window.devicePixelRatio, matchMedia("(pointer: coarse)").matches), WORLD_QUALITY[this.tier].dprCap);
    if (this.applied && this.applied.w === w && this.applied.h === h && this.applied.pr === pr) return;
    this.renderer.setDrawingBufferSize(w, h, pr);
    this.applied = { w, h, pr };
    // resize keeps position and orientation; only aspect, projection and layout change (§5.1)
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  // ---------------------------------------------------------------- status

  private setStatus(s: Partial<WorldStatus>): void {
    Object.assign(this.status, s);
    this.emit();
  }
  private emit(): void {
    this.events.onState?.({ ...this.status });
  }
  getStatus(): WorldStatus {
    return { ...this.status };
  }

  /** Test probe (opt-in): renders, draw calls, triangles, loaded landmarks, pose, GPU resources. */
  stats(): Record<string, unknown> {
    const info = this.renderer.info;
    return {
      renders: this.renders,
      tier: this.tier,
      mode: this.auto.mode,
      drawCalls: this.debug.drawCalls,
      triangles: this.debug.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      landmarksReady: [...this.landmarks.values()].filter((l) => l.far.state === "ready").map((l) => l.def.id),
      residency: this.residency(),
      lods: Object.fromEntries([...this.landmarks.values()].map((l) => [l.def.id, l.lod])),
      // per landmark: far-mesh instances drawn and whether detail cells are resident (a near-level
      // landmark with resident detail must draw no far instances: no double draw)
      farDrawn: Object.fromEntries([...this.landmarks.values()].map((l) => [l.def.id, l.far.mesh && l.far.mesh.visible ? (l.far.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount : 0])),
      detailReady: [...this.landmarks.values()].filter((l) => l.detail.state === "ready").map((l) => l.def.id),
      terrainChunks: this.terrainMeshes.size,
      // the terrain LOD's anchor (where steps were last chosen) and the step drawn under the camera
      terrainHere: this.terrainHere(),
      colliders: this.grid.count,
      feet: this.flight?.feet,
      yaw: this.flight?.yaw,
      pitch: this.flight?.pitch,
      flying: this.flight?.flying,
      control: this.status.control,
      phase: this.status.phase,
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      raf: this.raf !== 0,
      onScreen: this.onScreen,
      speed: this.input.speed,
      lookLocked: this.status.pointerLocked,
      vel: this.flight?.vel,
      colliderOwners: this.grid.ownerCount(),
      portalLabels: this.labels ? { info: this.labels.info, state: this.labels.state(), textureBytes: this.labels.textureBytes } : null,
      grass: (this.grass?.mesh.geometry as THREE.InstancedBufferGeometry | undefined)?.instanceCount ?? 0,
      environment: { ...this.env.status(), keyDir: this.keyDir.toArray().map((v) => Math.round(v * 1000) / 1000), keyIntensity: Math.round(this.sun.intensity * 1000) / 1000, moon: this.moon?.mesh.visible ?? false, checks: this.envChecked },
      candles: this.candles?.stats() ?? null,
      courtyard: this.courtView ? { ...this.courtView.stats, flowersDrawn: this.courtView.flowers.count } : null,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  private terrainHere(): { anchorDist: number; step: number | null } {
    const c = this.camera.position;
    const t = this.manifest?.terrain;
    let step: number | null = null;
    if (t && this.terrain) {
      const idx = this.terrain.indexAt(c.x, c.z);
      if (idx >= 0) {
        const cx = idx % t.chunksX;
        const cz = Math.floor(idx / t.chunksX);
        const tilesX = Math.ceil(t.chunksX / TILE);
        const tile = Math.floor(cz / TILE) * tilesX + Math.floor(cx / TILE);
        const n = Math.min(TILE, t.chunksX - Math.floor(cx / TILE) * TILE);
        const key = this.terrainMeshes.get(tile)?.steps.split(",");
        const v = key?.[(cz % TILE) * n + (cx % TILE)];
        step = v === undefined ? null : Number(v);
      }
    }
    return { anchorDist: Number.isFinite(this.lastFollow.x) ? Math.round(c.distanceTo(this.lastFollow) * 10) / 10 : Infinity, step };
  }

  /**
   * Exact shadow-caster culling for this frame. The sun is directional, so a caster can only darken
   * points inside its own footprint across the light (its light-space x/y extent). The shadow map
   * covers a fixed ±140 m window around the camera, and only the part of it the camera can see,
   * out to the shadow distance, ever shows a shadow. A caster whose bounding sphere misses that
   * visible part, in light-space x/y, cannot change a visible pixel. It is switched off for this
   * frame only (the caller restores castShadow after rendering), so the LOD rules that decide who
   * casts are untouched. Depth along the light is ignored, which keeps every caster up-sun of the
   * view. Measured: 4–37 % of the shadow pass at the demanding views (triangles.md).
   */
  private cullShadowCasters(): THREE.Object3D[] {
    const out = this.shadowSkipped;
    if (!this.renderer.shadowMap.enabled) return out;
    const cam = this.camera;
    const L = this.lightAxes();
    const tanY = Math.tan((cam.fov * Math.PI) / 360);
    const tanX = tanY * cam.aspect;
    const p = this.tmpV;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const d of [cam.near, SHADOW_REACH]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      p.set(sx * tanX * d, sy * tanY * d, -d).applyMatrix4(cam.matrixWorld);
      const u = p.dot(L.x);
      const v = p.dot(L.y);
      if (u < x0) x0 = u;
      if (u > x1) x1 = u;
      if (v < y0) y0 = v;
      if (v > y1) y1 = v;
    }
    // the shadow map's own window (the shadow camera's ortho box, centred on the target)
    const sc = this.sun.shadow.camera;
    const tu = this.sun.target.position.dot(L.x);
    const tv = this.sun.target.position.dot(L.y);
    x0 = Math.max(x0, tu + sc.left);
    x1 = Math.min(x1, tu + sc.right);
    y0 = Math.max(y0, tv + sc.bottom);
    y1 = Math.min(y1, tv + sc.top);
    const sph = this.tmpSphere;
    this.scene.traverseVisible((o) => {
      if (!o.castShadow || !(o as THREE.Mesh).isMesh) return;
      // an InstancedMesh (the shells) is bounded by its own sphere, not its unit geometry's (shadow-cull.ts)
      if (missesWindow(casterSphere(o, sph), L.x, L.y, x0, x1, y0, y1)) {
        o.castShadow = false;
        out.push(o);
      }
    });
    return out;
  }

  /** Light-space axes for the current sun (z toward the light). */
  private lightAxes(): { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 } {
    const a = this.lightAxesCache;
    a.z.copy(this.sun.position).sub(this.sun.target.position).normalize();
    a.x.set(0, 1, 0).cross(a.z).normalize();
    a.y.copy(a.z).cross(a.x);
    return a;
  }
  private readonly shadowSkipped: THREE.Object3D[] = [];
  private readonly lightAxesCache = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpSphere = new THREE.Sphere();

  /**
   * Test probe (opt-in, measurement only): renders one extra frame with
   * per-object accounting and returns the triangles drawn by category and
   * pass (the shadow-map pass versus the camera pass). Normal frames never
   * run this; the hooks are removed before it returns.
   */
  triangleBreakdown(): { total: number; calls: number; byCategory: Record<string, { camera: number; shadow: number; calls: number }>; byLandmark: Record<string, { camera: number; shadow: number }>; cells: { landmark: string; level: number; inView: boolean; dist: number; pieces: number[] }[]; camera: Record<string, unknown>; shadowUnseen: number } {
    const cat = new Map<THREE.Object3D, string>();
    // per landmark and cell level as well (byLandmark), and whether each detail cell's bounds are in the camera frustum
    const lmOf = new Map<THREE.Object3D, string>();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const cells: { landmark: string; level: number; inView: boolean; dist: number; pieces: number[] }[] = [];
    for (const l of this.landmarks.values()) {
      if (l.far.mesh) {
        cat.set(l.far.mesh, `far:L${l.lod}`);
        lmOf.set(l.far.mesh, `${l.def.id}:far`);
      }
      for (const c of l.detail.cells) {
        const lvl = `cell${c.level}`;
        for (const m of c.pieces) {
          cat.set(m, `detail:${["B", "M", "D"][m.userData.stock as number]}`);
          lmOf.set(m, `${l.def.id}:${lvl}:${["B", "M", "D"][m.userData.stock as number]}`);
        }
        c.dMeshes.forEach((m, i) => {
          cat.set(m, "detail:D");
          lmOf.set(m, `${l.def.id}:cell${c.dLevels[i]}:D`);
        });
        if (c.chains) {
          cat.set(c.chains, "detail:chains");
          lmOf.set(c.chains, `${l.def.id}:${lvl}:chains`);
        }
        if (c.level >= 0) {
          const sph = new THREE.Sphere(c.centre, c.data.radius);
          cells.push({ landmark: l.def.id, level: c.level, inView: frustum.intersectsSphere(sph), dist: Math.round(Math.max(0, this.camera.position.distanceTo(c.centre) - c.data.radius)), pieces: [...c.pieces, ...c.dMeshes].map((m) => (m.geometry as THREE.InstancedBufferGeometry).instanceCount) });
        }
      }
    }
    for (const m of this.terrainMeshes.values()) cat.set(m.mesh, "terrain");
    for (const r of this.rocks) cat.set(r, "rocks");
    if (this.grass) cat.set(this.grass.mesh, "grass");
    if (this.clouds) cat.set(this.clouds.mesh, "clouds");
    if (this.sea) cat.set(this.sea.mesh, "sea");
    if (this.sky) cat.set(this.sky, "sky");
    for (const f of this.flows) cat.set(f.mesh, "water");
    for (const p of this.portals) p.group.traverse((o) => cat.set(o, "portals"));
    if (this.labels) cat.set(this.labels.mesh, "portals");
    if (this.courtView) {
      this.courtView.group.traverse((o) => cat.set(o, "courtyard"));
      cat.set(this.courtView.flowers.mesh, "flowers");
    }
    if (this.candles) this.candles.group.traverse((o) => cat.set(o, (o as THREE.Mesh).name === "candle-flames" ? "flames" : "candles"));
    if (this.moon) cat.set(this.moon.mesh, "moon");
    this.scene.traverse((o) => {
      if (!cat.has(o) && o instanceof THREE.InstancedMesh && (o.material as THREE.Material) && Object.values(this.shellMats).includes(o.material as THREE.Material)) cat.set(o, "shells");
    });
    const out: Record<string, { camera: number; shadow: number; calls: number }> = {};
    const byLandmark: Record<string, { camera: number; shadow: number }> = {};
    const hooked: [THREE.Object3D, THREE.Object3D["onAfterRender"], THREE.Object3D["onAfterShadow"]][] = [];
    const count = (o: THREE.Object3D, geometry: THREE.BufferGeometry, group: THREE.Group | null | { count?: number }, pass: "camera" | "shadow"): void => {
      const idx = geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0);
      const draw = (group as { count?: number } | null)?.count ?? idx;
      const inst = o instanceof THREE.InstancedMesh ? o.count : geometry instanceof THREE.InstancedBufferGeometry ? (geometry.instanceCount ?? 0) : 1;
      const e = (out[cat.get(o) ?? "other"] ??= { camera: 0, shadow: 0, calls: 0 });
      const tris = (Math.min(draw, idx) / 3) * inst;
      e[pass] += tris;
      e.calls++;
      const lk = lmOf.get(o);
      if (lk) (byLandmark[lk] ??= { camera: 0, shadow: 0 })[pass] += tris;
    };
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Points) && !(o instanceof THREE.Line)) return;
      const prevR = o.onAfterRender;
      const prevS = o.onAfterShadow;
      hooked.push([o, prevR, prevS]);
      o.onAfterRender = function (r, s, camera, geometry, material, group) {
        count(o, geometry, group, "camera");
        prevR.call(this, r, s, camera, geometry, material, group);
      };
      // three r186 draws shadow casters through onBeforeShadow/onAfterShadow, not onAfterRender
      o.onAfterShadow = function (r, obj, camera, shadowCamera, geometry, depthMaterial, group) {
        count(o, geometry, group, "shadow");
        prevS.call(this, r, obj, camera, shadowCamera, geometry, depthMaterial, group);
      };
    });
    // shadow casters by whether their light-space footprint can reach the visible slice (the old box ∩ the view's
    // light-space bounds out to 140 m): a diagnostic for how much of the shadow pass could never be seen
    const Lz = this.sun.position.clone().sub(this.sun.target.position).normalize();
    const Lx = new THREE.Vector3(0, 1, 0).cross(Lz).normalize();
    const Ly = Lz.clone().cross(Lx);
    const cam = this.camera;
    const tanY = Math.tan((cam.fov * Math.PI) / 360);
    const tanX = tanY * cam.aspect;
    let vx0 = Infinity, vx1 = -Infinity, vy0 = Infinity, vy1 = -Infinity;
    const pt = new THREE.Vector3();
    for (const d of [cam.near, 140]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      pt.set(sx * tanX * d, sy * tanY * d, -d).applyMatrix4(cam.matrixWorld);
      vx0 = Math.min(vx0, pt.dot(Lx)); vx1 = Math.max(vx1, pt.dot(Lx)); vy0 = Math.min(vy0, pt.dot(Ly)); vy1 = Math.max(vy1, pt.dot(Ly));
    }
    const cu = cam.position.dot(Lx), cv = cam.position.dot(Ly);
    vx0 = Math.max(vx0, cu - 140); vx1 = Math.min(vx1, cu + 140); vy0 = Math.max(vy0, cv - 140); vy1 = Math.min(vy1, cv + 140);
    const unseen = { shadow: 0 };
    const sph = new THREE.Sphere();
    const reach = (o: THREE.Object3D): boolean => {
      const g = (o as THREE.Mesh).geometry;
      if (!g?.boundingSphere) return true;
      sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      const u = sph.center.dot(Lx), v = sph.center.dot(Ly);
      return u + sph.radius >= vx0 && u - sph.radius <= vx1 && v + sph.radius >= vy0 && v - sph.radius <= vy1;
    };
    for (const [o] of hooked) {
      const prevS = o.onAfterShadow;
      const r = reach(o);
      o.onAfterShadow = function (rr, obj, camera, shadowCamera, geometry, depthMaterial, group) {
        if (!r) {
          const idx = geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0);
          const inst = o instanceof THREE.InstancedMesh ? o.count : geometry instanceof THREE.InstancedBufferGeometry ? (geometry.instanceCount ?? 0) : 1;
          unseen.shadow += (idx / 3) * inst;
        }
        prevS.call(this, rr, obj, camera, shadowCamera, geometry, depthMaterial, group);
      };
    }
    // the probe frame applies the same per-frame shadow-caster culling as tick()
    const skippedProbe = this.cullShadowCasters();
    this.renderer.render(this.scene, this.camera);
    for (const o of skippedProbe) o.castShadow = true;
    skippedProbe.length = 0;
    for (const [o, r, sh] of hooked) {
      o.onAfterRender = r;
      o.onAfterShadow = sh;
    }
    const info = this.renderer.info.render;
    for (const e of Object.values(out)) {
      e.camera = Math.round(e.camera);
      e.shadow = Math.round(e.shadow);
    }
    for (const e of Object.values(byLandmark)) {
      e.camera = Math.round(e.camera);
      e.shadow = Math.round(e.shadow);
    }
    const camera = { position: this.camera.position.toArray().map((v) => Math.round(v * 100) / 100), quaternion: this.camera.quaternion.toArray(), fov: this.camera.fov, aspect: this.camera.aspect };
    return { total: info.triangles, calls: info.calls, byCategory: out, byLandmark, cells, camera, shadowUnseen: Math.round(unseen.shadow) };
  }

  /** Clearance at a point (tests): uses the live collision. */
  clearAt(feet: [number, number, number]): { ok: boolean; reason?: string } {
    if (!this.world) return { ok: false, reason: "not loaded" };
    return clearAt(this.world, this.grid, feet);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.dropFence();
    for (const id of this.pending.keys()) this.worker.postMessage({ type: "cancel", id } satisfies WorkerRequest);
    this.pending.clear();
    this.worker.terminate();
    this.resizeObserver.disconnect();
    this.unsubscribeGraphics();
    reportAppliedTier(this, null);
    for (const d of this.disposers) d();
    // the renderer-shared DFG texture pins every renderer through its dispose listeners: find it while materials are live
    const shared = sharedTexturesOf(this.renderer, this.scene);
    for (const lm of this.landmarks.values()) {
      this.dropDetail(lm);
      this.dropFar(lm);
    }
    this.landmarks.clear();
    for (const p of this.portals) p.dispose();
    if (this.labels) {
      // before the scene walk and the renderer: its atlas texture carries the renderer's dispose listener
      this.scene.remove(this.labels.mesh);
      this.labels.dispose();
      this.labels = null;
    }
    this.grass?.dispose();
    this.clouds?.dispose();
    if (this.courtView) {
      this.scene.remove(this.courtView.group);
      this.courtView.dispose();
      this.courtView = null;
    }
    if (this.candles) {
      this.scene.remove(this.candles.group);
      this.candles.dispose();
      this.candles = null;
    }
    if (this.moon) {
      this.scene.remove(this.moon.mesh);
      this.moon.dispose();
      this.moon = null;
    }
    const sharedGeo = new Set<THREE.BufferGeometry>([...this.boxGeo, this.unitBox, this.shellGeo.box, this.shellGeo.cyl]);
    this.scene.traverse((o) => {
      // instanced meshes carry the renderer's own dispose listener (WebGLObjects) until disposed themselves
      if (o instanceof THREE.InstancedMesh) o.dispose();
      const m = o as THREE.Mesh;
      if (m.geometry && !sharedGeo.has(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    for (const g of this.boxGeo) g.dispose();
    this.unitBox.dispose();
    this.chainMat.material.dispose();
    this.chainMat.depth.dispose();
    this.shellGeo.box.dispose();
    this.shellGeo.cyl.dispose();
    for (const t of this.timber) {
      t.material.dispose();
      t.depth.dispose();
    }
    for (const m of Object.values(this.shellMats)) m.dispose();
    this.rockGeos.forEach((g) => g.dispose());
    this.rockMat?.dispose();
    this.terrainMat.dispose();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    releaseShared(shared);
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export { PLAYER };

/** Horizontal distance from (x, z) to a river's centre line (manifest points are [x, water, z]). */
function riverDistance(points: readonly number[][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const ax = points[i]![0]!;
    const az = points[i]![2]!;
    const vx = points[i + 1]![0]! - ax;
    const vz = points[i + 1]![2]! - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/** Rock meshes per type: a grid over the island (x × z cells) so out-of-view rocks are culled in both passes. */
const ROCK_GRID = [4, 2] as const;

/**
 * A centred box keeping only some of its faces (BoxGeometry builds them in the order +x, −x, +y, −y, +z, −z,
 * six indices each). The timber and chain shaders fold each kept +axis face onto its −axis twin when that is
 * the one facing the eye or (shadow pass) away from the light (materials.ts, FOLD).
 */
function boxFaces(l: number, s: number, faces: readonly number[]): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(l, s, s);
  const index = Array.from(box.index!.array);
  const keep = faces.flatMap((f) => index.slice(f * 6, f * 6 + 6));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", box.getAttribute("position"));
  g.setAttribute("normal", box.getAttribute("normal"));
  g.setIndex(keep);
  box.index = null;
  box.dispose();
  return g;
}

/** A piece: the +x, +y, +z faces of its stock's box (6 triangles; the shader shows the three that face the eye). */
function foldedBox(length: number, section: number): THREE.BufferGeometry {
  return boxFaces(length, section, [0, 2, 4]);
}

/**
 * A merged chain: a unit box scaled per instance, without its ±x end caps (a cap is at most a 1 m square at the
 * end of a many-metre chain, sub-pixel where chains are drawn, and chain ends abut other members), and folded:
 * the +y and +z faces only (4 triangles).
 */
function chainSleeve(): THREE.BufferGeometry {
  return boxFaces(1, 1, [2, 4]);
}
