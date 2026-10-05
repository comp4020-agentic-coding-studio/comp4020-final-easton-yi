// Pure placement maths for the held ghost (PLACE-02..08). No Three.js types,
// so it is unit-tested directly. A draft is a centre plus yaw/pitch/roll;
// the quaternion is derived, never edited directly, so vertical sticks have
// no singularity (the last valid yaw is kept).
import { INPUT } from "../shared/config.ts";
import {
  add,
  boxCorners,
  boxOverlap,
  directionVector,
  quatFromYawPitchRoll,
  scale,
  stickBox,
  sub,
  tableOverlap,
  withinPlacementBounds,
  type Box,
  type Pose,
  type Vec3,
} from "../shared/geometry.ts";

export interface Dims {
  length: number;
  width: number;
  height: number;
}
export interface TableDims {
  radius: number;
  thickness: number;
  top: number;
}

export interface Draft {
  center: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
}

export type Handle = "center" | "height" | "endA" | "endB" | "pitchA" | "pitchB";
/** Which point stays fixed for keyboard rotations and presets. */
export type Pivot = "center" | "A" | "B";

const HALF_PI = Math.PI / 2;
export const clampPitch = (p: number): number => Math.max(-HALF_PI, Math.min(HALF_PI, p));
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export const draftPose = (d: Draft): Pose => ({ p: d.center, q: quatFromYawPitchRoll(d.yaw, d.pitch, d.roll) });

export const draftEnds = (d: Draft, len: number): { A: Vec3; B: Vec3 } => {
  const half = scale(directionVector({ yaw: d.yaw, pitch: d.pitch }), len / 2);
  return { A: sub(d.center, half), B: add(d.center, half) };
};

/** Change direction while keeping `pivot` fixed (center, or one endpoint). */
export const reorient = (d: Draft, len: number, pivot: Pivot, yaw: number, pitch: number, roll = d.roll): Draft => {
  pitch = clampPitch(pitch);
  const dir = directionVector({ yaw, pitch });
  if (pivot === "center") return { ...d, yaw, pitch, roll };
  const ends = draftEnds(d, len);
  // A is the local −X end, B the +X end: centre = A + L/2·dir = B − L/2·dir
  const center = pivot === "A" ? add(ends.A, scale(dir, len / 2)) : sub(ends.B, scale(dir, len / 2));
  return { center, yaw, pitch, roll };
};

export const presetHorizontal = (d: Draft, len: number, pivot: Pivot): Draft => reorient(d, len, pivot, d.yaw, 0);
export const presetVertical = (d: Draft, len: number, pivot: Pivot): Draft =>
  // Standing up: when pivoting on an end, that end becomes the foot.
  reorient(d, len, pivot, d.yaw, pivot === "B" ? -HALF_PI : HALF_PI);

export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

export const rayPlaneY = (ray: Ray, y: number): Vec3 | null => {
  if (Math.abs(ray.dir[1]) < 1e-9) return null;
  const t = (y - ray.origin[1]) / ray.dir[1];
  if (t <= 0) return null;
  return add(ray.origin, scale(ray.dir, t));
};

/** Screen-space basis used when the work plane is nearly edge-on (PLACE-06). */
export interface ScreenBasis {
  /** world units per CSS pixel at the draft's depth */
  unitsPerPixel: number;
  /** camera right and forward, projected on XZ and normalised */
  right: Vec3;
  forward: Vec3;
}

export interface CenterDragStart {
  start: Draft;
  planeY: number;
  /** pointer hit on the plane minus centre, preserved so the stick doesn't jump to the pointer */
  grabOffset: Vec3;
  startPx: [number, number];
  lastPx: [number, number];
  fallback: boolean;
}

export const beginCenterDrag = (d: Draft, ray: Ray, px: [number, number]): CenterDragStart => {
  const planeY = d.center[1];
  const hit = Math.abs(ray.dir[1]) >= INPUT.parallelRayThreshold ? rayPlaneY(ray, planeY) : null;
  return {
    start: d,
    planeY,
    grabOffset: hit ? sub(hit, d.center) : [0, 0, 0],
    startPx: px,
    lastPx: px,
    fallback: !hit,
  };
};

/**
 * Whole-stick translation on the XZ plane at the starting height. When the
 * ray is nearly parallel to that plane a ray hit would be at "infinity", so
 * movement switches to bounded screen-projection increments instead (and the
 * caller suggests the top view).
 */
export const centerDrag = (s: CenterDragStart, current: Draft, ray: Ray, px: [number, number], basis: ScreenBasis): { draft: Draft; fallback: boolean } => {
  const steep = Math.abs(ray.dir[1]) >= INPUT.parallelRayThreshold;
  const hit = steep && !s.fallback ? rayPlaneY(ray, s.planeY) : null;
  if (hit) {
    const c = sub(hit, s.grabOffset);
    s.lastPx = px;
    return { draft: { ...current, center: [c[0], s.planeY, c[2]] }, fallback: false };
  }
  // Fallback: incremental, clamped per event, from the current pose (no jump).
  const dx = px[0] - s.lastPx[0];
  const dy = px[1] - s.lastPx[1];
  s.lastPx = px;
  let move = add(scale(basis.right, dx * basis.unitsPerPixel), scale(basis.forward, -dy * basis.unitsPerPixel));
  const m = Math.hypot(move[0], move[2]);
  if (m > INPUT.parallelMaxStep) move = scale(move, INPUT.parallelMaxStep / m);
  s.fallback = true;
  return { draft: { ...current, center: [current.center[0] + move[0], s.planeY, current.center[2] + move[2]] }, fallback: true };
};

export const heightDrag = (start: Draft, dyPx: number, unitsPerPixel: number): Draft => ({
  ...start,
  center: [start.center[0], start.center[1] - dyPx * unitsPerPixel, start.center[2]],
});

/**
 * Endpoint yaw (PLACE-03): the opposite endpoint is fixed and the length is
 * preserved; the moved end follows the pointer's azimuth on its own
 * horizontal plane, keeping the current elevation.
 */
export const endpointYaw = (d: Draft, len: number, which: "A" | "B", ray: Ray): Draft => {
  const ends = draftEnds(d, len);
  const moving = which === "A" ? ends.A : ends.B;
  const pivot = which === "A" ? "B" : "A";
  const fixed = which === "A" ? ends.B : ends.A;
  const hit = rayPlaneY(ray, moving[1]);
  if (!hit) return d;
  const h = [hit[0] - fixed[0], hit[2] - fixed[2]];
  if (Math.hypot(h[0]!, h[1]!) < 0.05) return d; // pointer over the pivot: direction undefined
  const phi = Math.atan2(h[1]!, h[0]!);
  // For B the local +X direction points at the moved end; for A it points away.
  const yaw = which === "B" ? phi : wrap(phi + Math.PI);
  return reorient(d, len, pivot, yaw, d.pitch);
};

/** Endpoint pitch: screen displacement raises/lowers the moved end about the fixed one. */
export const endpointPitch = (start: Draft, len: number, which: "A" | "B", dyPx: number, radiansPerPixel = Math.PI / 360): Draft => {
  const delta = -dyPx * radiansPerPixel; // drag up = raise the moved end
  const pitch = which === "B" ? start.pitch + delta : start.pitch - delta;
  return reorient(start, len, which === "A" ? "B" : "A", start.yaw, clampPitch(pitch));
};

/** Gentle angle snapping with hysteresis (PLACE-07). Returns the snapped angle and the active target. */
export const snapAngle = (angle: number, targets: number[], active: number | null): { angle: number; active: number | null } => {
  const acquire = (INPUT.snapAcquireDeg * Math.PI) / 180;
  const release = (INPUT.snapReleaseDeg * Math.PI) / 180;
  if (active != null && Math.abs(wrap(angle - active)) <= release) return { angle: active, active };
  for (const t of targets) if (Math.abs(wrap(angle - t)) <= acquire) return { angle: t, active: t };
  return { angle, active: null };
};
export const YAW_TARGETS = [0, HALF_PI, Math.PI, -HALF_PI, -Math.PI];
export const PITCH_TARGETS = [0, HALF_PI, -HALF_PI];

export interface Obstacle {
  id: string;
  box: Box;
}

export const draftBox = (d: Draft, dims: Dims): Box => stickBox(draftPose(d), dims);

/** Deepest overlap of the draft with the table or any real stick (advisory, mirrors the server rule). */
export const worstOverlap = (box: Box, obstacles: Obstacle[], table: TableDims): { depth: number; with: string | null } => {
  let depth = tableOverlap(box, table);
  let withId: string | null = depth > 0 ? "table" : null;
  for (const o of obstacles) {
    const dc = sub(o.box.center, box.center);
    if (Math.hypot(dc[0], dc[1], dc[2]) > 9.2) continue;
    const ov = boxOverlap(box, o.box);
    if (ov > depth) {
      depth = ov;
      withId = o.id;
    }
  }
  return { depth, with: withId };
};

/**
 * "Snap to support": move the whole draft straight down, stopping at the
 * first contact and leaving the placement gap. Never moves real sticks,
 * never passes through anything, and gives up beyond `maxDistance`.
 */
export const snapDown = (d: Draft, dims: Dims, obstacles: Obstacle[], table: TableDims, tol: number, gap: number, maxDistance: number = INPUT.supportSnapMax): { draft: Draft; moved: number } | null => {
  const at = (t: number): number => worstOverlap(draftBox({ ...d, center: [d.center[0], d.center[1] - t, d.center[2]] }, dims), obstacles, table).depth;
  if (at(0) > tol) return null; // already intersecting: nothing sensible to snap to
  if (at(maxDistance + gap) <= 0) return null; // no support within reach
  // first contact time by bisection; obstacles are ≥1 u thick and the search is
  // ≤ maxDistance, so the step can't skip over one.
  let lo = 0;
  let hi = maxDistance + gap;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > 0) hi = mid;
    else lo = mid;
  }
  const moved = Math.max(0, lo - gap);
  return { draft: { ...d, center: [d.center[0], d.center[1] - moved, d.center[2]] }, moved };
};

/** A support this close below still counts as "ready": the stick settles onto it. */
export const SHORT_DROP = 0.25;

export type Validity =
  | { kind: "ready"; supported: true; drop: number }
  | { kind: "unsupported" }
  | { kind: "intersecting"; with: string | null; depth: number }
  | { kind: "out-of-bounds"; reason: "below" | "above" | "far" }
  | { kind: "invalid" }
  | { kind: "capacity" };

export const validate = (
  d: Draft,
  dims: Dims,
  obstacles: Obstacle[],
  table: TableDims,
  bounds: { minY: number; maxY: number; radius: number },
  tol: number,
  full: boolean,
): Validity => {
  const pose = draftPose(d);
  if (![...pose.p, ...pose.q].every(Number.isFinite)) return { kind: "invalid" };
  if (full) return { kind: "capacity" };
  const box = stickBox(pose, dims);
  if (!withinPlacementBounds(box, bounds, tol)) {
    const cs = boxCorners(box);
    const reason = cs.some((c) => c[1] < bounds.minY - tol) ? "below" : cs.some((c) => c[1] > bounds.maxY) ? "above" : "far";
    return { kind: "out-of-bounds", reason };
  }
  const w = worstOverlap(box, obstacles, table);
  if (w.depth > tol) return { kind: "intersecting", with: w.with, depth: w.depth };
  // "Ready" if something lies within a short drop straight below; a longer
  // fall is "unsupported". A hint about contact, never a promise of
  // stability (PLACE-08).
  const touchesAt = (t: number): boolean => worstOverlap(stickBox({ p: [pose.p[0], pose.p[1] - t, pose.p[2]], q: pose.q }, dims), obstacles, table).depth > 0;
  if (!touchesAt(SHORT_DROP)) return { kind: "unsupported" };
  let lo = 0;
  let hi = SHORT_DROP;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (touchesAt(mid)) hi = mid;
    else lo = mid;
  }
  return { kind: "ready", supported: true, drop: lo };
};

/** Find a legal initial spot near `near`, lifting above whatever is there (PLACE-01). */
export const spawnDraft = (near: Vec3, yaw: number, dims: Dims, obstacles: Obstacle[], table: TableDims, gap: number): { draft: Draft; legal: boolean } => {
  const base: Draft = { center: [near[0], table.top + dims.height / 2 + gap + 0.1, near[2]], yaw, pitch: 0, roll: 0 };
  const tryAt = (x: number, z: number): Draft | null => {
    let d: Draft = { ...base, center: [x, base.center[1], z] };
    for (let k = 0; k < 90; k++) {
      const w = worstOverlap(draftBox(d, dims), obstacles, table);
      if (w.depth <= 0) return d;
      d = { ...d, center: [d.center[0], d.center[1] + 1, d.center[2]] };
    }
    return null;
  };
  const spots: [number, number][] = [[near[0], near[2]]];
  for (let r = 2; r <= 12; r += 2) for (let a = 0; a < 8; a++) spots.push([near[0] + r * Math.cos((a * Math.PI) / 4), near[2] + r * Math.sin((a * Math.PI) / 4)]);
  for (const [x, z] of spots) {
    const d = tryAt(x, z);
    if (d && d.center[1] < 79) {
      // Settle just above the highest thing below, then lift by a hair.
      const dropped = snapDown(d, dims, obstacles, table, 0.002, gap, 1.2);
      return { draft: dropped ? { ...dropped.draft, center: [dropped.draft.center[0], dropped.draft.center[1] + 0.1, dropped.draft.center[2]] } : d, legal: true };
    }
  }
  return { draft: base, legal: false };
};
