// Pure geometry shared by the browser (advisory preview) and the server
// (authoritative checks run against Rapier itself). Tuples keep this free of
// any engine or renderer types. A stick's local long axis is X, its centre is
// the origin and its endpoints are ±L/2 (WORLD-01).

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

export interface Pose {
  p: Vec3;
  q: Quat;
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};

export const quatMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const quatNormalize = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(l > 1e-9) || !Number.isFinite(l)) return [0, 0, 0, 1];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

/** Canonical sign (w ≥ 0, or first non-zero component positive) so equal rotations compare equal. */
export const quatCanonical = (q: Quat): Quat => {
  const n = quatNormalize(q);
  for (const c of [n[3], n[0], n[1], n[2]]) {
    if (Math.abs(c) > 1e-12) return c < 0 ? [-n[0], -n[1], -n[2], -n[3]] : n;
  }
  return n;
};

export const quatAxisAngle = (axis: Vec3, angle: number): Quat => {
  const a = normalize(axis);
  const s = Math.sin(angle / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
};

export const rotate = (q: Quat, v: Vec3): Vec3 => {
  const u: Vec3 = [q[0], q[1], q[2]];
  const w = q[3];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, w)), cross(u, t));
};

/** Columns of the rotation matrix = the stick's local X, Y, Z axes in world space. */
export const axes = (q: Quat): [Vec3, Vec3, Vec3] => [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])];

export interface Direction {
  /** Horizontal azimuth, radians, measured from +X toward +Z. */
  yaw: number;
  /** Elevation above the horizontal plane, radians, in [-π/2, π/2]. */
  pitch: number;
}

export const directionVector = ({ yaw, pitch }: Direction): Vec3 => [
  Math.cos(pitch) * Math.cos(yaw),
  Math.sin(pitch),
  Math.cos(pitch) * Math.sin(yaw),
];

/**
 * Rotation taking local +X to the direction (yaw, pitch), then rolling `roll`
 * radians about local X. Built from yaw and pitch directly rather than from the
 * direction vector, so it stays well-defined when the stick is vertical.
 */
export const quatFromYawPitchRoll = (yaw: number, pitch: number, roll: number): Quat => {
  // yaw rotates about world Y; +X toward +Z is a negative rotation about Y.
  const qYaw = quatAxisAngle([0, 1, 0], -yaw);
  const qPitch = quatAxisAngle([0, 0, 1], pitch);
  const qRoll = quatAxisAngle([1, 0, 0], roll);
  return quatCanonical(quatMul(quatMul(qYaw, qPitch), qRoll));
};

/** Inverse of quatFromYawPitchRoll; near vertical, yaw falls back to `lastYaw`. */
export const yawPitchRollFromQuat = (q: Quat, lastYaw = 0): { yaw: number; pitch: number; roll: number } => {
  const [x, y, z] = axes(q);
  const pitch = Math.asin(Math.max(-1, Math.min(1, x[1])));
  const horiz = Math.hypot(x[0], x[2]);
  const yaw = horiz > 1e-4 ? Math.atan2(x[2], x[0]) : lastYaw;
  // Roll: compare actual local Y with the zero-roll local Y for this yaw/pitch.
  const ref = axes(quatFromYawPitchRoll(yaw, pitch, 0));
  const roll = Math.atan2(dot(y, ref[2]), dot(y, ref[1]));
  void z;
  return { yaw, pitch, roll };
};

export const endpoints = (pose: Pose, len: number): [Vec3, Vec3] => {
  const dx = scale(rotate(pose.q, [1, 0, 0]), len / 2);
  return [sub(pose.p, dx), add(pose.p, dx)]; // [A = local −X end, B = local +X end]
};

export interface Box {
  center: Vec3;
  axes: [Vec3, Vec3, Vec3];
  half: Vec3;
}

export const stickBox = (pose: Pose, dims: { length: number; width: number; height: number }): Box => ({
  center: pose.p,
  axes: axes(pose.q),
  half: [dims.length / 2, dims.height / 2, dims.width / 2],
});

export const boxCorners = (b: Box): Vec3[] => {
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        out.push(
          add(
            add(add(b.center, scale(b.axes[0], sx * b.half[0])), scale(b.axes[1], sy * b.half[1])),
            scale(b.axes[2], sz * b.half[2]),
          ),
        );
      }
  return out;
};

const projectRadius = (b: Box, axis: Vec3): number =>
  b.half[0] * Math.abs(dot(b.axes[0], axis)) +
  b.half[1] * Math.abs(dot(b.axes[1], axis)) +
  b.half[2] * Math.abs(dot(b.axes[2], axis));

/**
 * Separating-axis test over the 15 candidate axes. Returns the smallest
 * overlap found (penetration depth estimate, > 0 means overlapping) or a
 * negative number giving the largest separation. Touching faces return ~0.
 */
export const boxOverlap = (a: Box, b: Box): number => {
  const d = sub(b.center, a.center);
  const candidates: Vec3[] = [...a.axes, ...b.axes];
  for (const u of a.axes)
    for (const v of b.axes) {
      const c = cross(u, v);
      if (length(c) > 1e-6) candidates.push(normalize(c));
    }
  let minOverlap = Infinity;
  for (const axis of candidates) {
    const overlap = projectRadius(a, axis) + projectRadius(b, axis) - Math.abs(dot(d, axis));
    if (overlap < minOverlap) minOverlap = overlap;
  }
  return minOverlap;
};

/** Penetration depth of a box into the table cylinder (top at y=top), or ≤0 if clear. */
export const tableOverlap = (b: Box, table: { radius: number; thickness: number; top: number }): number => {
  const lowest = Math.min(...boxCorners(b).map((c) => c[1]));
  if (lowest >= table.top) return table.top - lowest;
  // Below the top surface: does any part of the box reach inside the radius at
  // a height within the slab? Sample the box's lowest face densely enough for
  // advisory use; the server's Rapier contact query is the authority.
  let worst = -Infinity;
  const n = 16;
  for (let i = 0; i <= n; i++)
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const t = -1 + (2 * i) / n;
        const pt = add(
          add(add(b.center, scale(b.axes[0], t * b.half[0])), scale(b.axes[1], sy * b.half[1])),
          scale(b.axes[2], sz * b.half[2]),
        );
        const r = Math.hypot(pt[0], pt[2]);
        if (pt[1] < table.top && pt[1] > table.top - table.thickness && r < table.radius) {
          worst = Math.max(worst, Math.min(table.top - pt[1], table.radius - r));
        }
      }
  return worst === -Infinity ? 0 : worst;
};

export const isFiniteVec = (v: readonly number[]): boolean => v.every((c) => Number.isFinite(c));

export const withinPlacementBounds = (
  b: Box,
  bounds: { minY: number; maxY: number; radius: number },
  tolerance = 0,
): boolean =>
  boxCorners(b).every((c) => c[1] >= bounds.minY - tolerance - 1e-9 && c[1] <= bounds.maxY && Math.hypot(c[0], c[2]) <= bounds.radius);

/** Whole AABB below `belowY` or wholly outside the retention radius (WORLD-03). */
export const outsideRetention = (b: Box, bounds: { belowY: number; radius: number }): boolean => {
  const cs = boxCorners(b);
  const maxY = Math.max(...cs.map((c) => c[1]));
  if (maxY < bounds.belowY) return true;
  const minR = Math.min(...cs.map((c) => Math.hypot(c[0], c[2])));
  const reach = length([b.half[0], b.half[1], b.half[2]]);
  return minR > bounds.radius && Math.hypot(b.center[0], b.center[2]) - reach > bounds.radius;
};
