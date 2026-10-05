// The authoritative physics world for one work (PHYS-01). Ordinary dynamic
// cuboid bodies on a fixed cylinder table: no joints, locked axes, kinematic
// conversion or upright torques (PHYS-02). Browsers only render its output.
import RAPIER from "@dimforge/rapier3d-compat";
import type { PhysicsConfig } from "../../shared/config.ts";
import {
  boxCorners,
  isFiniteVec,
  outsideRetention,
  quatNormalize,
  stickBox,
  withinPlacementBounds,
  type Pose,
  type Quat,
  type Vec3,
} from "../../shared/geometry.ts";

let ready: Promise<void> | null = null;
export const initPhysics = (): Promise<void> => (ready ??= RAPIER.init());

export interface StickMeta {
  id: string;
  authorId: string;
  /** commandId of the placement that created it. */
  createdBy: string;
  seed: number;
  handle: number;
  placedAt: number;
}

export interface BodyState {
  id: string;
  p: Vec3;
  q: Quat;
  sleeping: boolean;
}

export interface CollisionEvent {
  /** Unique within the stream: `${tick}:${index}`. */
  id: string;
  p: Vec3;
  strength: number;
}

export type PlacementProblem = "NON_FINITE" | "OUT_OF_BOUNDS" | "COLLISION" | "CAPACITY";

const combine = (rule: PhysicsConfig["combineRule"]): RAPIER.CoefficientCombineRule =>
  RAPIER.CoefficientCombineRule[rule];

export class PhysicsWorld {
  readonly cfg: PhysicsConfig;
  world: RAPIER.World;
  sticks = new Map<string, StickMeta>();
  private byHandle = new Map<number, StickMeta>();
  private events = new RAPIER.EventQueue(true);
  tableCollider: number;
  tick = 0;
  private eventIndex = 0;

  private constructor(cfg: PhysicsConfig, world: RAPIER.World, tableCollider: number) {
    this.cfg = cfg;
    this.world = world;
    this.tableCollider = tableCollider;
    this.applyParameters();
  }

  static create(cfg: PhysicsConfig): PhysicsWorld {
    const world = new RAPIER.World({ x: cfg.gravity[0], y: cfg.gravity[1], z: cfg.gravity[2] });
    const table = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, cfg.table.top - cfg.table.thickness / 2, 0),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cylinder(cfg.table.thickness / 2, cfg.table.radius)
        .setFriction(cfg.friction)
        .setRestitution(cfg.restitution)
        .setFrictionCombineRule(combine(cfg.combineRule))
        .setRestitutionCombineRule(combine(cfg.combineRule)),
      table,
    );
    return new PhysicsWorld(cfg, world, collider.handle);
  }

  /** Restore a native snapshot plus the app envelope captured at the same tick. */
  static restore(cfg: PhysicsConfig, bytes: Uint8Array, meta: { sticks: StickMeta[]; tick: number; tableCollider: number }): PhysicsWorld {
    const world = RAPIER.World.restoreSnapshot(bytes);
    if (!world) throw new Error("native snapshot could not be restored");
    const pw = new PhysicsWorld(cfg, world, meta.tableCollider);
    pw.tick = meta.tick;
    for (const s of meta.sticks) {
      const body = world.getRigidBody(s.handle);
      if (!body) throw new Error(`snapshot is missing body for stick ${s.id}`);
      pw.sticks.set(s.id, s);
      pw.byHandle.set(s.handle, s);
    }
    if (pw.sticks.size !== world.bodies.len() - 1) throw new Error("snapshot body count does not match its envelope");
    return pw;
  }

  private applyParameters(): void {
    const w = this.world;
    w.timestep = this.cfg.fixedStep;
    w.numSolverIterations = this.cfg.solverIterations;
    w.maxCcdSubsteps = this.cfg.maxCcdSubsteps;
    w.lengthUnit = this.cfg.lengthUnit;
  }

  free(): void {
    this.world.free();
    this.events.free();
  }

  snapshot(): Uint8Array {
    return this.world.takeSnapshot();
  }

  envelope(): { sticks: StickMeta[]; tick: number; tableCollider: number } {
    return { sticks: [...this.sticks.values()], tick: this.tick, tableCollider: this.tableCollider };
  }

  private stickShape(): RAPIER.Cuboid {
    const s = this.cfg.stick;
    return new RAPIER.Cuboid(s.length / 2, s.height / 2, s.width / 2);
  }

  /**
   * Server-side placement validation (PLACE-08, SYNC-03). Solid intersection is
   * decided by Rapier's signed contact distance, so touching or a shallow
   * overlap within tolerance passes and a meaningful penetration does not.
   * Being unsupported is never a problem here.
   */
  checkPlacement(pose: Pose, ignore?: Set<string>): { problem: PlacementProblem | null; depth: number } {
    if (!isFiniteVec(pose.p) || !isFiniteVec(pose.q)) return { problem: "NON_FINITE", depth: 0 };
    const qn = Math.hypot(...pose.q);
    if (Math.abs(qn - 1) > 1e-3) return { problem: "NON_FINITE", depth: 0 };
    const box = stickBox(pose, this.cfg.stick);
    if (!withinPlacementBounds(box, this.cfg.placementBounds, this.cfg.penetrationTolerance)) return { problem: "OUT_OF_BOUNDS", depth: 0 };
    const shape = this.stickShape();
    const pos = { x: pose.p[0], y: pose.p[1], z: pose.p[2] };
    const rot = { x: pose.q[0], y: pose.q[1], z: pose.q[2], w: pose.q[3] };
    // Narrow-phase only: Rapier's broad-phase is refreshed by step(), so a
    // stick accepted earlier in the same tick would be invisible to an AABB
    // query. ≤200 sticks makes the direct pairwise check cheap.
    let depth = 0;
    const probe = (collider: RAPIER.Collider): void => {
      const contact = collider.contactShape(shape, pos, rot, 0.01);
      if (contact && -contact.distance > depth) depth = -contact.distance;
    };
    probe(this.world.getCollider(this.tableCollider));
    const reach = this.cfg.stick.length + 2;
    for (const meta of this.sticks.values()) {
      if (ignore?.has(meta.id)) continue;
      const body = this.world.getRigidBody(meta.handle);
      if (!body) continue;
      const t = body.translation();
      if (Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z) > reach) continue;
      probe(body.collider(0));
    }
    if (depth > this.cfg.penetrationTolerance) return { problem: "COLLISION", depth };
    return { problem: null, depth };
  }

  /** Adds a placed stick with zero initial velocity (PLACE-09). Does not step. */
  addStick(meta: Omit<StickMeta, "handle">, pose: Pose): StickMeta {
    const s = this.cfg.stick;
    const q = quatNormalize(pose.q);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pose.p[0], pose.p[1], pose.p[2])
        .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
        .setLinearDamping(this.cfg.linearDamping)
        .setAngularDamping(this.cfg.angularDamping)
        .setCcdEnabled(this.cfg.ccd),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(s.length / 2, s.height / 2, s.width / 2)
        .setDensity(s.mass / (s.length * s.width * s.height))
        .setFriction(this.cfg.friction)
        .setRestitution(this.cfg.restitution)
        .setFrictionCombineRule(combine(this.cfg.combineRule))
        .setRestitutionCombineRule(combine(this.cfg.combineRule))
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(this.cfg.soundForceThreshold),
      body,
    );
    const full: StickMeta = { ...meta, handle: body.handle };
    this.sticks.set(full.id, full);
    this.byHandle.set(full.handle, full);
    return full;
  }

  /** Test tools only (PHYS-06): remove a support. Not a product feature. */
  removeStick(id: string): boolean {
    const meta = this.sticks.get(id);
    if (!meta) return false;
    const body = this.world.getRigidBody(meta.handle);
    if (body) this.world.removeRigidBody(body);
    this.sticks.delete(id);
    this.byHandle.delete(meta.handle);
    // Removing a body wakes its contacts in Rapier; also wake everything nearby
    // explicitly so nothing resting on it can stay asleep in mid-air (PHYS-04).
    this.world.forEachRigidBody((b) => b.isDynamic() && b.wakeUp());
    return true;
  }

  pose(id: string): Pose | null {
    const meta = this.sticks.get(id);
    const body = meta && this.world.getRigidBody(meta.handle);
    if (!body) return null;
    const t = body.translation();
    const r = body.rotation();
    return { p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] };
  }

  /** Bounded push: fixed impulse = mass × pushSpeed at a point near the surface (PUSH-02). */
  applyPush(id: string, point: Vec3, dir: Vec3): boolean {
    const meta = this.sticks.get(id);
    const body = meta && this.world.getRigidBody(meta.handle);
    if (!body) return false;
    const h = Math.hypot(dir[0], dir[2]);
    if (!(h > 1e-6)) return false;
    const mag = this.cfg.stick.mass * this.cfg.pushSpeed;
    body.applyImpulseAtPoint(
      { x: (dir[0] / h) * mag, y: 0, z: (dir[2] / h) * mag },
      { x: point[0], y: point[1], z: point[2] },
      true,
    );
    return true;
  }

  /** Distance from a point to the stick's surface (for validating push contact points). */
  surfaceDistance(id: string, point: Vec3): number {
    const meta = this.sticks.get(id);
    if (!meta) return Infinity;
    const body = this.world.getRigidBody(meta.handle);
    const collider = body?.collider(0);
    if (!collider) return Infinity;
    const proj = collider.projectPoint({ x: point[0], y: point[1], z: point[2] }, false);
    if (!proj) return Infinity;
    return Math.hypot(proj.point.x - point[0], proj.point.y - point[1], proj.point.z - point[2]);
  }

  step(): CollisionEvent[] {
    this.world.step(this.events);
    this.tick++;
    const out: CollisionEvent[] = [];
    this.events.drainContactForceEvents((e) => {
      const strength = e.maxForceMagnitude();
      const c1 = this.world.getCollider(e.collider1());
      const t = c1?.translation();
      if (t && out.length < 8) {
        out.push({ id: `${this.tick}:${this.eventIndex++}`, p: [t.x, t.y, t.z], strength });
      }
    });
    return out;
  }

  /** Remove sticks whose whole bounding volume left the retention region (WORLD-03). */
  cleanup(): string[] {
    const removed: string[] = [];
    for (const [id] of this.sticks) {
      const pose = this.pose(id);
      if (pose && outsideRetention(stickBox(pose, this.cfg.stick), this.cfg.removalBounds)) removed.push(id);
    }
    for (const id of removed) this.removeStick(id);
    return removed;
  }

  bodies(): BodyState[] {
    const out: BodyState[] = [];
    for (const meta of this.sticks.values()) {
      const body = this.world.getRigidBody(meta.handle);
      if (!body) continue;
      const t = body.translation();
      const r = body.rotation();
      out.push({ id: meta.id, p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w], sleeping: body.isSleeping() });
    }
    return out;
  }

  /** True when every body is asleep or under the stable speed thresholds right now. */
  isQuiet(): boolean {
    for (const meta of this.sticks.values()) {
      const body = this.world.getRigidBody(meta.handle);
      if (!body || body.isSleeping()) continue;
      const v = body.linvel();
      const w = body.angvel();
      if (Math.hypot(v.x, v.y, v.z) >= this.cfg.stableLinear) return false;
      if (Math.hypot(w.x, w.y, w.z) >= this.cfg.stableAngular) return false;
    }
    return true;
  }

  allSleeping(): boolean {
    for (const meta of this.sticks.values()) {
      const body = this.world.getRigidBody(meta.handle);
      if (body && !body.isSleeping()) return false;
    }
    return true;
  }

  private isSlow(handle: number): boolean {
    const body = this.world.getRigidBody(handle);
    if (!body) return false;
    if (body.isSleeping()) return true;
    const v = body.linvel();
    const w = body.angvel();
    return Math.hypot(v.x, v.y, v.z) < this.cfg.stableLinear && Math.hypot(w.x, w.y, w.z) < this.cfg.stableAngular;
  }

  /**
   * Support graph used for "stable structure height" (HEIGHT-01). A directed
   * edge lower→upper exists when they are in actual contact, the contact
   * normal pushing the upper body has y ≥ 0.5, the lower body's centre is
   * lower (the table is the root) and a contact point lies below the upper
   * centre. Side-to-side contacts do not count. A game estimate, not an
   * engineering load analysis.
   */
  supportedFromTable(): Set<string> {
    const reached = new Set<number>();
    const queue: number[] = [];
    const tableBody = this.world.getCollider(this.tableCollider)!.parent()!.handle;
    const centerY = (bodyHandle: number): number =>
      bodyHandle === tableBody ? -Infinity : this.world.getRigidBody(bodyHandle)!.translation().y;
    const edgesFrom = (colliderHandle: number): number[] => {
      const collider = this.world.getCollider(colliderHandle);
      const lowerBody = collider.parent()!.handle;
      const lowerY = centerY(lowerBody);
      const out: number[] = [];
      this.world.contactPairsWith(collider, (other) => {
        const upperBody = other.parent()?.handle;
        if (upperBody === undefined || upperBody === tableBody) return;
        const upperY = centerY(upperBody);
        if (!(lowerY < upperY)) return;
        let supports = false;
        this.world.contactPair(collider, other, (manifold, flipped) => {
          if (manifold.numSolverContacts() === 0) return;
          // normal() points from the manifold's collider1 to collider2; when
          // flipped, collider1 is `other`, so negate to point lower → upper.
          const n = manifold.normal();
          const ny = flipped ? -n.y : n.y;
          if (ny < 0.5) return;
          for (let i = 0; i < manifold.numSolverContacts(); i++) {
            const pt = manifold.solverContactPoint(i);
            if (pt && pt.y <= upperY + 1e-3) supports = true;
          }
        });
        if (supports) out.push(other.handle);
      });
      return out;
    };
    queue.push(this.tableCollider);
    const seenColliders = new Set<number>([this.tableCollider]);
    while (queue.length) {
      const c = queue.shift()!;
      for (const next of edgesFrom(c)) {
        if (seenColliders.has(next)) continue;
        const body = this.world.getCollider(next).parent()!.handle;
        if (!this.isSlow(body)) continue;
        seenColliders.add(next);
        reached.add(body);
        queue.push(next);
      }
    }
    const ids = new Set<string>();
    for (const h of reached) {
      const meta = this.byHandle.get(h);
      if (meta) ids.add(meta.id);
    }
    return ids;
  }

  /** Highest top vertex among stationary table-supported sticks, in u above the table. */
  supportedHeight(): number {
    let top = 0;
    for (const id of this.supportedFromTable()) {
      const pose = this.pose(id);
      if (!pose) continue;
      for (const c of boxCorners(stickBox(pose, this.cfg.stick))) top = Math.max(top, c[1] - this.cfg.table.top);
    }
    return Math.round(top * 100) / 100;
  }

  /** Detect NaN / runaway values (OPS-01). */
  healthy(): boolean {
    for (const b of this.bodies()) {
      if (!isFiniteVec(b.p) || !isFiniteVec(b.q)) return false;
      if (Math.abs(b.p[0]) > 1e5 || Math.abs(b.p[1]) > 1e5 || Math.abs(b.p[2]) > 1e5) return false;
    }
    return true;
  }
}
