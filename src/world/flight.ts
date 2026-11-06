// First-person movement (main prompt §5; speed presets from the interaction
// brief §3): Walk/Run/Fly presets and boost with delta-aware acceleration and
// damping, horizontal-XZ forward motion separate from vertical motion,
// explicit control states, and the soft boundary. Pure: no DOM, no three.js;
// the viewport feeds it input and elapsed time.
import { CAPSULE_HEIGHT, PLAYER, groundUnder, move, type StaticGrid, type Vec3, type World } from "./collision.ts";

/**
 * Speed presets (interaction brief §3). Walk is the original controller,
 * unchanged: 5 m/s on foot (9 with boost) and the original flight pace once
 * airborne (15 m/s, 32 with boost). Run and Fly multiply the walking pace by
 * 3 and 7 on foot and in the air, and never fall below that original flight
 * pace, so Walk ≤ Run ≤ Fly everywhere. A preset never starts flight by
 * itself (only ascend does, as before); gravity, landing and collision are
 * unchanged.
 *
 *            on foot (boost)   airborne (boost)   climb/descend (boost)
 *   Walk       5   (9)          15   (32)          10.5 (15)
 *   Run       15  (27)          15   (32)          10.5 (15)
 *   Fly       35  (45)          35   (45)          17.5 (24)
 *
 * Boost (Shift, or the touch Boost toggle) is the original ×1.8, never past
 * MAX_HORIZONTAL: Fly + boost is 45 m/s, not 7 × the old 32 m/s boost.
 */
export type SpeedMode = "walk" | "run" | "fly";
export const SPEED_MODES: readonly SpeedMode[] = ["walk", "run", "fly"];
export const WALK_SPEED = 5;
export const SPEED_FACTOR: Readonly<Record<SpeedMode, number>> = Object.freeze({ walk: 1, run: 3, fly: 7 });
export const BOOST_FACTOR = 1.8;
/** The original controller's airborne pace (its SPEED.fly / SPEED.boost), kept as a floor while flying. */
export const AIR_PACE = Object.freeze({ cruise: 15, boost: 32 });
export const MAX_HORIZONTAL = 45;
const CLIMB: Readonly<Record<SpeedMode, number>> = Object.freeze({ walk: 10.5, run: 10.5, fly: 17.5 });
const CLIMB_BOOST = 15 / 10.5;
export const MAX_VERTICAL = 24;
/** The fastest controlled speed (horizontal and vertical caps together); falling keeps its own terminal speed. */
export const MAX_SPEED = Math.hypot(MAX_HORIZONTAL, MAX_VERTICAL);

export const isSpeedMode = (v: unknown): v is SpeedMode => SPEED_MODES.includes(v as SpeedMode);
/** Horizontal target speed (m/s) for a preset, boosted or not, on foot or airborne. */
export function horizontalSpeed(mode: SpeedMode, boost: boolean, flying = false): number {
  const preset = WALK_SPEED * SPEED_FACTOR[mode] * (boost ? BOOST_FACTOR : 1);
  const floor = flying ? (boost ? AIR_PACE.boost : AIR_PACE.cruise) : 0;
  return Math.min(MAX_HORIZONTAL, Math.max(preset, floor));
}
/** Ascend/descend speed (m/s) while flying. */
export const verticalSpeed = (mode: SpeedMode, boost: boolean): number => Math.min(MAX_VERTICAL, CLIMB[mode] * (boost ? CLIMB_BOOST : 1));

/** Acceleration toward the target velocity (1/s) and the damping when no input is held. */
const ACCEL = 8;
const DAMP = 6;
const GRAVITY = 24;
/** Longest frame step integrated; a longer gap (a hidden tab, a stall) is clamped, never accumulated. */
export const MAX_DT = 0.1;

export type ControlState = "idle" | "exploring" | "paused" | "transitioning" | "error" | "leaving";

export interface InputState {
  /** −1…1 strafe (right +) and forward (+). Normalised by the controller. */
  move: [number, number];
  ascend: boolean;
  descend: boolean;
  boost: boolean;
  /** Toggle mode for boost (touch / accessibility). */
  boostLatched: boolean;
  /** Look deltas in radians accumulated since the last frame (mouse, drag, keys). */
  look: [number, number];
  /** The selected speed preset (a setting: clearing held input keeps it). */
  speed: SpeedMode;
}

export const emptyInput = (speed: SpeedMode = "walk"): InputState => ({ move: [0, 0], ascend: false, descend: false, boost: false, boostLatched: false, look: [0, 0], speed });

export interface Pose {
  feet: Vec3;
  yaw: number;
  pitch: number;
}

export class Flight {
  feet: Vec3;
  vel: Vec3 = [0, 0, 0];
  yaw: number;
  pitch: number;
  flying = false;
  grounded = true;
  state: ControlState = "idle";
  /** The last yaw whose forward vector was valid (extreme pitch never zeroes movement). */
  private lastYaw: number;
  boundary = 0;
  /** Set when recovery is needed (non-finite, out of bounds, abnormal fall). */
  fault: string | null = null;
  private fallStart: number | null = null;
  reducedMotion = false;

  constructor(pose: Pose) {
    this.feet = [...pose.feet];
    this.yaw = pose.yaw;
    this.pitch = pose.pitch;
    this.lastYaw = pose.yaw;
  }

  eye(): Vec3 {
    return [this.feet[0], this.feet[1] + PLAYER.eye, this.feet[2]];
  }

  /** Forward on the horizontal plane (−sin yaw, 0, −cos yaw), never zero. */
  forward(): [number, number] {
    const f: [number, number] = [-Math.sin(this.yaw), -Math.cos(this.yaw)];
    if (!Number.isFinite(f[0]) || !Number.isFinite(f[1])) return [-Math.sin(this.lastYaw), -Math.cos(this.lastYaw)];
    this.lastYaw = this.yaw;
    return f;
  }

  /** Teleport (safe point, landmark jump, return home): clears velocity and any fault. */
  /** Place the explorer. An in-air pose (a flight viewpoint) arrives flying and hovers; otherwise it stands. */
  teleport(p: Pose & { flying?: boolean }): void {
    this.feet = [...p.feet];
    this.yaw = p.yaw;
    this.pitch = p.pitch;
    this.vel = [0, 0, 0];
    this.fault = null;
    this.fallStart = null;
    this.flying = p.flying ?? false;
  }

  /**
   * Advance by dt seconds. Only "exploring" moves; every other state holds
   * still (and has had its input cleared by the input layer).
   */
  step(dt: number, input: InputState, world: World, grid: StaticGrid, now: number): void {
    if (this.state !== "exploring") {
      this.vel = [0, 0, 0];
      return;
    }
    const t = Math.min(MAX_DT, Math.max(0, dt));
    if (t === 0) return;
    // look
    this.yaw += input.look[0];
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + input.look[1]));
    input.look[0] = 0;
    input.look[1] = 0;
    // target velocity: horizontal from the camera's yaw only; vertical separate
    let [mx, mz] = input.move;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const fwd = this.forward();
    const right: [number, number] = [-fwd[1], fwd[0]];
    const boosting = input.boost || input.boostLatched;
    if (input.ascend && !this.flying) {
      this.flying = true;
      this.grounded = false;
    }
    const mode = isSpeedMode(input.speed) ? input.speed : "walk";
    const speed = horizontalSpeed(mode, boosting, this.flying);
    const tx = (fwd[0] * mz + right[0] * mx) * speed;
    const tz = (fwd[1] * mz + right[1] * mx) * speed;
    let ty: number;
    if (this.flying) ty = ((input.ascend ? 1 : 0) - (input.descend ? 1 : 0)) * verticalSpeed(mode, boosting);
    else ty = this.vel[1] - GRAVITY * t;
    // the soft boundary: progressively reduce outward speed from the soft band to the hard limit
    const sd = world.coast(this.feet[0], this.feet[2]);
    let txb = tx;
    let tzb = tz;
    const softStart = world.hard - world.soft;
    if (sd > softStart) {
      const [nx, nz] = world.coastNormal(this.feet[0], this.feet[2]);
      const out = txb * nx + tzb * nz;
      if (out > 0) {
        const k = Math.max(0, 1 - (sd - softStart) / world.soft);
        txb -= nx * out * (1 - k);
        tzb -= nz * out * (1 - k);
      }
    }
    // delta-aware approach to the target (exponential), damping when idle
    const a = 1 - Math.exp(-(ml > 0.01 ? ACCEL : DAMP) * t);
    this.vel[0] += (txb - this.vel[0]) * a;
    this.vel[2] += (tzb - this.vel[2]) * a;
    if (this.flying) this.vel[1] += (ty - this.vel[1]) * (1 - Math.exp(-ACCEL * t));
    else this.vel[1] = Math.max(-60, ty);
    // the documented ceiling on controlled speed, whatever the inputs (collision sub-steps are sized from it)
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    if (hs > MAX_HORIZONTAL) {
      this.vel[0] *= MAX_HORIZONTAL / hs;
      this.vel[2] *= MAX_HORIZONTAL / hs;
    }
    if (this.flying) this.vel[1] = Math.max(-MAX_VERTICAL, Math.min(MAX_VERTICAL, this.vel[1]));
    const before = this.feet[1];
    const r = move(world, grid, this.feet, this.vel, t, { flying: this.flying });
    this.feet = r.feet;
    this.vel = r.vel;
    this.boundary = r.boundary;
    // landing: descending near a standable surface ends flight smoothly
    if (this.flying && input.descend && !input.ascend) {
      const under = groundUnder(world, grid, this.feet[0], this.feet[2], this.feet[1]);
      if (this.feet[1] - under < 0.3) {
        this.flying = false;
        this.vel[1] = 0;
      }
    }
    if (this.flying && r.grounded && !input.ascend && input.descend) this.flying = false;
    this.grounded = !this.flying && r.grounded;
    // faults: non-finite, far outside, an abnormal fall
    if (!this.feet.every(Number.isFinite)) this.fault = "lost position";
    else if (world.coast(this.feet[0], this.feet[2]) > world.hard + 50) this.fault = "outside the island";
    else if (!this.flying && !this.grounded && this.feet[1] < before - 0.01) {
      this.fallStart ??= now;
      if (now - this.fallStart > 6000) this.fault = "fell for too long";
    } else this.fallStart = null;
    void CAPSULE_HEIGHT;
  }
}
