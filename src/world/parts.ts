// Shared structural parts (Appendix B2): straight chains, rectangle frames,
// floor grids, truss faces, polygon rings, arches, rib-and-ring domes, wall
// frames, shallow steps and the four column orders. Each part places preset
// stock through the Builder and returns how many pieces it placed, so recipes
// can check their counts against the paper formulas.
import { add, Builder, cross, defaultUp, dist, dot, len, norm, polar, scale, STOCKS, smaller, sub, type StockId, type V3 } from "./core.ts";


export const sec = (s: StockId): number => STOCKS[s].section;
export const stockOfU = (u: number): StockId => (u >= 8 ? "B" : u >= 4 ? "M" : "D");

export interface ChainOpts {
  /** Hint for the section's local y (e.g. up for deck boards, radial for column ribs). */
  up?: V3;
  /**
   * "downgrade" (default, the C rule): spans shorter than the stock use the
   * next smaller stock. "overhang": keep the stock and centre one piece over
   * the span (rings, arch voussoirs and laps where neighbours overlap by design).
   * "lap": keep the stock and lap it into the neighbouring courses (a B bundle
   * member in a 4 m pier segment), slid along its axis to stay inside `within`.
   */
  mode?: "downgrade" | "overhang" | "lap";
  /** For "lap": the allowed range along the chain's dominant axis (y for vertical members). */
  within?: [number, number];
}

/**
 * C(l,u): `ceil(l/u)` pieces from a to b, the end pieces flush with a and b
 * and the overlap spread evenly between them. Alternate pieces are offset by
 * 1 % of the section so overlapping faces never coincide (no z-fighting).
 */
export function chain(b: Builder, stock: StockId, a: V3, c: V3, o: ChainOpts = {}): number {
  const v = sub(c, a);
  const l = len(v);
  if (l < 1e-6) return 0;
  const x = scale(v, 1 / l);
  let s = stock;
  if (o.mode === "lap" && l < STOCKS[s].length - 1e-6) {
    const u = STOCKS[s].length;
    let m = scale(add(a, c), 0.5);
    const axis = Math.abs(x[1]) >= Math.max(Math.abs(x[0]), Math.abs(x[2])) ? 1 : Math.abs(x[0]) >= Math.abs(x[2]) ? 0 : 2;
    const [lo, hi] = o.within ?? [-Infinity, Infinity];
    const ax = Math.abs(x[axis]!);
    const half = (u / 2) * ax;
    const sgn = x[axis]! >= 0 ? 1 : -1;
    if (m[axis]! - half < lo) m = add(m, scale(x, (sgn * (lo - (m[axis]! - half))) / ax));
    if (m[axis]! + half > hi) m = add(m, scale(x, (sgn * (hi - (m[axis]! + half))) / ax));
    // alternate courses nudge the lap differently so overlaps never share faces
    b.piece(s, m, x, o.up, Math.round(a[axis]! * 4) % 2 ? 1 : -1);
    return 1;
  }
  if ((o.mode ?? "downgrade") === "downgrade") {
    while (l < STOCKS[s].length - 1e-6) {
      const sm = smaller(s);
      if (!sm) break;
      s = sm;
      b.downgrades++;
    }
    if (l < STOCKS[s].length - 1e-6) b.overhangs++; // a sub-metre independent span: reported, recipes avoid it
  }
  const u = STOCKS[s].length;
  // a chain may fall up to 1 % short of its span rather than add a piece for a few millimetres
  const n = Math.max(1, Math.ceil(l / u - 0.01));
  if (n === 1) {
    b.piece(s, scale(add(a, c), 0.5), x, o.up);
    return 1;
  }
  const step = (l - u) / (n - 1);
  b.chained(() => {
    for (let i = 0; i < n; i++) b.piece(s, add(a, scale(x, u / 2 + i * step)), x, o.up, i % 2 ? 1 : -1);
  });
  return n;
}

/** Side and up axes perpendicular to a direction, up as close to the hint as possible. */
export function frameOf(dir: V3, upHint?: V3): { x: V3; side: V3; up: V3 } {
  const x = norm(dir);
  let side = norm(cross(x, upHint ?? defaultUp(x)));
  if (len(side) < 1e-6) side = norm(cross(x, [1, 0, 0]));
  return { x, side, up: cross(side, x) };
}

/** Parallel chains offset (side, up) in metres from the a→c axis. */
export function bundle(b: Builder, stock: StockId, a: V3, c: V3, offsets: readonly (readonly [number, number])[], o: ChainOpts = {}): number {
  const f = frameOf(sub(c, a), o.up);
  let n = 0;
  for (const [sx, sy] of offsets) {
    const off = add(scale(f.side, sx), scale(f.up, sy));
    n += chain(b, stock, add(a, off), add(c, off), { ...o, up: f.up });
  }
  return n;
}

/** Offsets for a cols × rows square bundle of one stock, centred on the axis. */
export function grid2(cols: number, rows: number, s: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push([(i - (cols - 1) / 2) * s, (j - (rows - 1) / 2) * s]);
  return out;
}

// ---------------------------------------------------------------- frames and floors

/**
 * R(w,d,u,q): a rectangle frame whose OUTER envelope is w × d, centred at
 * (cx, cz), bottom face at y. q layers stack upward; alternate layers swap
 * which pair of sides runs through the corners, so joints are staggered and
 * no piece is instanced twice.
 */
export function rect(b: Builder, stock: StockId, cx: number, y: number, cz: number, w: number, d: number, q = 1, from = 0): number {
  const s = sec(stock);
  let n = 0;
  // `from` skips the lower layers (a caller can emit layers 0..from-1 and from..q-1 at different detail tiers)
  for (let k = from; k < q; k++) {
    const yy = y + s / 2 + k * s;
    const xRuns = k % 2 === 0;
    const hw = w / 2;
    const hd = d / 2;
    if (xRuns) {
      for (const z of [-hd + s / 2, hd - s / 2]) n += chain(b, stock, [cx - hw, yy, cz + z], [cx + hw, yy, cz + z], { up: [0, 1, 0] });
      for (const x of [-hw + s / 2, hw - s / 2]) n += chain(b, stock, [cx + x, yy, cz - hd + s], [cx + x, yy, cz + hd - s], { up: [0, 1, 0] });
    } else {
      for (const x of [-hw + s / 2, hw - s / 2]) n += chain(b, stock, [cx + x, yy, cz - hd], [cx + x, yy, cz + hd], { up: [0, 1, 0] });
      for (const z of [-hd + s / 2, hd - s / 2]) n += chain(b, stock, [cx - hw + s, yy, cz + z], [cx + hw - s, yy, cz + z], { up: [0, 1, 0] });
    }
  }
  return n;
}

/**
 * G(w,d,p,u): floor grid inside a w × d envelope. Upper layer (top face at
 * yTop): floor(d/p)+1 chains along x. Lower layer, directly below: floor(w/p)+1
 * chains along z.
 */
export function floorGrid(b: Builder, stock: StockId, cx: number, yTop: number, cz: number, w: number, d: number, p: number): number {
  const s = sec(stock);
  let n = 0;
  const nz = Math.floor(d / p + 1e-9) + 1;
  for (let i = 0; i < nz; i++) {
    const z = nz === 1 ? 0 : -d / 2 + s / 2 + (i * (d - s)) / (nz - 1);
    n += chain(b, stock, [cx - w / 2, yTop - s / 2, cz + z], [cx + w / 2, yTop - s / 2, cz + z], { up: [0, 1, 0] });
  }
  const nx = Math.floor(w / p + 1e-9) + 1;
  for (let i = 0; i < nx; i++) {
    const x = nx === 1 ? 0 : -w / 2 + s / 2 + (i * (w - s)) / (nx - 1);
    n += chain(b, stock, [cx + x, yTop - 1.5 * s, cz - d / 2], [cx + x, yTop - 1.5 * s, cz + d / 2], { up: [0, 1, 0] });
  }
  return n;
}

/**
 * Contiguous decking: boards along `axis` laid side by side over a w × d
 * rectangle, top face at yTop. A small gap (4 % of the section) keeps board
 * edges legible. Skip rectangles (holes, in the same local x/z) are left open.
 */
export function deck(
  b: Builder,
  stock: StockId,
  cx: number,
  yTop: number,
  cz: number,
  w: number,
  d: number,
  axis: "x" | "z" = "x",
  holes: readonly { x0: number; x1: number; z0: number; z1: number }[] = [],
): number {
  const s = sec(stock);
  const pitch = s * 1.04;
  const across = axis === "x" ? d : w;
  const along = axis === "x" ? w : d;
  const count = Math.max(1, Math.floor((across - s) / pitch + 1e-9) + 1);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : -across / 2 + s / 2 + (i * (across - s)) / (count - 1);
    // the board's run, split around holes
    let runs: [number, number][] = [[-along / 2, along / 2]];
    for (const h of holes) {
      const [a0, a1, c0, c1] = axis === "x" ? [h.x0 - cx, h.x1 - cx, h.z0 - cz, h.z1 - cz] : [h.z0 - cz, h.z1 - cz, h.x0 - cx, h.x1 - cx];
      if (t + s / 2 <= c0 || t - s / 2 >= c1) continue;
      const next: [number, number][] = [];
      for (const [r0, r1] of runs) {
        if (a1 <= r0 || a0 >= r1) next.push([r0, r1]);
        else {
          if (a0 > r0) next.push([r0, a0]);
          if (a1 < r1) next.push([a1, r1]);
        }
      }
      runs = next;
    }
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 0.5) continue;
      const a: V3 = axis === "x" ? [cx + r0, yTop - s / 2, cz + t] : [cx + t, yTop - s / 2, cz + r0];
      const c: V3 = axis === "x" ? [cx + r1, yTop - s / 2, cz + t] : [cx + t, yTop - s / 2, cz + r1];
      n += chain(b, stock, a, c, { up: [0, 1, 0] });
    }
  }
  return n;
}

/**
 * F(w,h,u,q): a truss face in the local x–y plane at depth z: two verticals,
 * top and bottom horizontals and an X of two diagonals, the diagonals offset
 * by one section in front of and behind the plane. `bottom: false` reuses the
 * previous course's top rail as this course's bottom rail.
 */
export function trussFace(b: Builder, stock: StockId, x0: number, y0: number, x1: number, y1: number, z: number, o: { bottom?: boolean; top?: boolean; sides?: boolean; diagonals?: boolean; normal?: V3 } = {}): number {
  const s = sec(stock);
  let n = 0;
  if (o.sides !== false) {
    n += chain(b, stock, [x0 + s / 2, y0, z], [x0 + s / 2, y1, z]);
    n += chain(b, stock, [x1 - s / 2, y0, z], [x1 - s / 2, y1, z]);
  }
  if (o.bottom !== false) n += chain(b, stock, [x0, y0 + s / 2, z], [x1, y0 + s / 2, z], { up: [0, 1, 0] });
  if (o.top !== false) n += chain(b, stock, [x0, y1 - s / 2, z], [x1, y1 - s / 2, z], { up: [0, 1, 0] });
  if (o.diagonals !== false) {
    n += chain(b, stock, [x0 + s, y0 + s, z - s], [x1 - s, y1 - s, z - s]);
    n += chain(b, stock, [x1 - s, y0 + s, z + s], [x0 + s, y1 - s, z + s]);
  }
  return n;
}

/** A truss face between two arbitrary bottom points and their tops (for sloping legs and curved walls). */
export function trussQuad(b: Builder, stock: StockId, a0: V3, b0: V3, a1: V3, b1: V3, o: { bottom?: boolean; top?: boolean; sides?: boolean; diagonals?: boolean; offset?: V3 } = {}): number {
  let n = 0;
  if (o.sides !== false) {
    n += chain(b, stock, a0, a1);
    n += chain(b, stock, b0, b1);
  }
  if (o.bottom !== false) n += chain(b, stock, a0, b0, { up: [0, 1, 0] });
  if (o.top !== false) n += chain(b, stock, a1, b1, { up: [0, 1, 0] });
  if (o.diagonals !== false) {
    const off = o.offset ?? [0, 0, 0];
    n += chain(b, stock, add(a0, off), add(b1, off));
    n += chain(b, stock, sub(b0, off), sub(a1, off));
  }
  return n;
}

/**
 * P(r,n,u,q): a regular n-gon ring of radius r (vertex radius) at height y
 * around (cx, cz), q layers stacked by one section, alternate layers turned
 * half a segment. Chords shorter than the stock keep the stock and overlap
 * into their neighbours.
 */
export function ring(b: Builder, stock: StockId, cx: number, y: number, cz: number, r: number, n: number, q = 1, o: { phase?: number; up?: V3; stagger?: boolean } = {}): number {
  const s = sec(stock);
  let count = 0;
  for (let k = 0; k < q; k++) {
    const ph = (o.phase ?? 0) + (o.stagger !== false && k % 2 ? Math.PI / n : 0);
    const yy = y + k * s;
    for (let i = 0; i < n; i++) {
      const a0 = ph + (2 * Math.PI * i) / n;
      const a1 = ph + (2 * Math.PI * (i + 1)) / n;
      const p0: V3 = [cx + r * Math.cos(a0), yy, cz + r * Math.sin(a0)];
      const p1: V3 = [cx + r * Math.cos(a1), yy, cz + r * Math.sin(a1)];
      count += chain(b, stock, p0, p1, { up: o.up ?? [0, 1, 0], mode: "overhang" });
    }
  }
  return count;
}

/** An elliptical ring through m points, equal arc length spacing. */
export function ellipseRing(b: Builder, stock: StockId, y: number, ax: number, az: number, m: number, o: { phase?: number } = {}): number {
  const pts = ellipsePoints(ax, az, m, o.phase ?? 0);
  let n = 0;
  for (let i = 0; i < m; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % m]!;
    n += chain(b, stock, [p[0], y, p[1]], [q[0], y, q[1]], { up: [0, 1, 0], mode: "overhang" });
  }
  return n;
}

/** m points on an ellipse at equal arc length, starting at angle `phase` (0 = +x). */
export function ellipsePoints(ax: number, az: number, m: number, phase = 0): [number, number][] {
  const N = 4096;
  const cum: number[] = [0];
  let prev: [number, number] = [ax * Math.cos(phase), az * Math.sin(phase)];
  for (let i = 1; i <= N; i++) {
    const t = phase + (2 * Math.PI * i) / N;
    const p: [number, number] = [ax * Math.cos(t), az * Math.sin(t)];
    cum.push(cum[i - 1]! + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  const total = cum[N]!;
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < m; k++) {
    const target = (total * k) / m;
    while (j < N && cum[j + 1]! < target) j++;
    const f = (target - cum[j]!) / (cum[j + 1]! - cum[j]! || 1);
    const t = phase + (2 * Math.PI * (j + f)) / N;
    out.push([ax * Math.cos(t), az * Math.sin(t)]);
  }
  return out;
}

/** Outward unit normal of an ellipse at a point on it. */
export const ellipseNormal = (p: [number, number], ax: number, az: number): [number, number] => {
  const nx = p[0] / (ax * ax);
  const nz = p[1] / (az * az);
  const l = Math.hypot(nx, nz) || 1;
  return [nx / l, nz / l];
};

/**
 * Hidden ring ties of `n` members of `stock` inside a shaft whose free inner
 * radius is rIn, in a segment from ya to yb. A plain ring when its members
 * stay within 0.15 m of the circle; a star polygon {n/k} when the stock is
 * longer than the chords but shorter than the diameter; otherwise inclined
 * internal ties (a 4 m member can't lie flat in a 3 m bore). Returns pieces
 * and which arrangement was used.
 */
export function tieRing(b: Builder, stock: StockId, cx: number, cz: number, rIn: number, n: number, ya: number, yb: number, phase = 0): { pieces: number; kind: "ring" | "star" | "inclined" } {
  const u = STOCKS[stock].length;
  const ym = (ya + yb) / 2;
  const chord = 2 * rIn * Math.sin(Math.PI / n);
  const poke = Math.sqrt(rIn * rIn * Math.cos(Math.PI / n) ** 2 + (u / 2) ** 2) - rIn;
  if (chord >= u - 1e-6 || poke < 0.15) return { pieces: ring(b, stock, cx, ym, cz, rIn * Math.cos(Math.PI / n), n, 1, { phase, stagger: false }), kind: "ring" };
  if (2 * rIn >= u) {
    // star polygon: pick the step whose chord is closest to (but not over) the stock length, then fit the radius
    let k = 1;
    for (let kk = 1; kk <= Math.floor(n / 2); kk++) if (2 * rIn * Math.sin((kk * Math.PI) / n) <= u + 1e-9) k = kk;
    const r = Math.min(rIn, u / (2 * Math.sin((k * Math.PI) / n)));
    let pieces = 0;
    for (let i = 0; i < n; i++) {
      const a0 = phase + (2 * Math.PI * i) / n;
      const a1 = a0 + (2 * Math.PI * k) / n;
      pieces += chain(b, stock, [cx + r * Math.cos(a0), ym, cz + r * Math.sin(a0)], [cx + r * Math.cos(a1), ym, cz + r * Math.sin(a1)], { up: [0, 1, 0], mode: "overhang" });
    }
    return { pieces, kind: "star" };
  }
  // inclined: each member climbs while turning, its horizontal chord kept inside the bore
  const h = yb - ya;
  let c = Math.min(2 * rIn * 0.98, 0.7 * u);
  let v = Math.sqrt(Math.max(0, u * u - c * c));
  if (v > h * 0.96) {
    v = h * 0.96;
    c = Math.min(2 * rIn * 0.98, Math.sqrt(u * u - v * v));
  }
  const dA = 2 * Math.asin(Math.min(1, c / (2 * rIn)));
  let pieces = 0;
  for (let i = 0; i < n; i++) {
    const a0 = phase + (2 * Math.PI * i) / n;
    const a1 = a0 + dA;
    const p0: V3 = [cx + rIn * Math.cos(a0), ym - v / 2, cz + rIn * Math.sin(a0)];
    const p1: V3 = [cx + rIn * Math.cos(a1), ym + v / 2, cz + rIn * Math.sin(a1)];
    b.piece(stock, scale(add(p0, p1), 0.5), sub(p1, p0), [0, 1, 0], i % 2 ? 1 : -1);
    pieces++;
  }
  return { pieces, kind: "inclined" };
}

// ---------------------------------------------------------------- arches

export interface ArchShape {
  /** Points on the intrados and extrados (local x across the span, y up from the springing) and the outward normal. */
  at(t: number): { inner: [number, number]; outer: [number, number]; n: [number, number] };
  outerLength: number;
  kind: "semicircular" | "segmental" | "pointed";
}

/** The arch curve for a clear span w and rise, with ring thickness t. Pointed when rise > w/2. */
export function archShape(w: number, rise: number, t: number): ArchShape {
  const hw = w / 2;
  if (rise > hw + 1e-6) {
    // two-centred pointed arch: centres at (±c, 0), radius R = hw + c
    const c = (rise * rise - hw * hw) / (2 * hw);
    const R = hw + c;
    const apex = Math.atan2(rise, -c); // angle of the apex seen from the left arc's centre (c, 0)
    const half = (u: number): { inner: [number, number]; outer: [number, number]; n: [number, number] } => {
      const th = Math.PI + (apex - Math.PI) * u;
      const n: [number, number] = [Math.cos(th), Math.sin(th)];
      return { inner: [c + R * n[0], R * n[1]], outer: [c + (R + t) * n[0], (R + t) * n[1]], n };
    };
    const outerLength = 2 * (R + t) * Math.abs(Math.PI - apex);
    return {
      kind: "pointed",
      outerLength,
      at: (u) => {
        if (u <= 0.5) return half(u * 2);
        const m = half((1 - u) * 2);
        return { inner: [-m.inner[0], m.inner[1]], outer: [-m.outer[0], m.outer[1]], n: [-m.n[0], m.n[1]] };
      },
    };
  }
  const R = (hw * hw + rise * rise) / (2 * rise);
  const cy = rise - R;
  // the springing angles on the upper arc. Not atan2(−cy, ±hw): for a semicircle cy is 0, −cy is −0 and
  // atan2(−0, −hw) = −π, which ran the arc through the bottom of the circle (every semicircular arch hung
  // upside down until 2026-11-04: L05's lower tier, L13's transept vault, L08's and L10's arcades)
  const a = Math.asin(Math.min(1, Math.max(-1, -cy / R)));
  const th0 = Math.PI - a;
  const th1 = a;
  return {
    kind: Math.abs(rise - hw) < 1e-6 ? "semicircular" : "segmental",
    outerLength: (R + t) * Math.abs(th0 - th1),
    at: (u) => {
      const th = th0 + (th1 - th0) * u;
      const n: [number, number] = [Math.cos(th), Math.sin(th)];
      return { inner: [R * n[0], cy + R * n[1]], outer: [R * n[0] + t * n[0], cy + (R + t) * n[1]], n };
    },
  };
}

export interface ArchOpts {
  /** Extra soffit boards along the depth at every segment (counted in their own band by the caller). */
  soffit?: StockId | null;
  /** Depth ties stock (default M, the A rule's C(d,4)). */
  tieStock?: StockId;
  /** Collider: solid ring segments as boxes (default true). */
  collide?: boolean;
  /** A shading shell between the faces (default true). */
  shell?: boolean;
}

/**
 * A(w,rise,t,d,u): an arch of clear span w in the local x–y plane, springing
 * at y = 0, faces at z = ±d/2. Chords ≤ 0.8u on the extrados fix N. Each face
 * has inner and outer tangent members (4N) and a radial chain per segment
 * (2N·C(t,u)); a depth tie every four segments (ceil(N/4)·C(d,4)).
 */
export function arch(b: Builder, w: number, rise: number, t: number, d: number, u: number, o: ArchOpts = {}): { pieces: number; N: number; shape: ArchShape } {
  const stock = stockOfU(u);
  const s = sec(stock);
  const shape = archShape(w, rise, t);
  let N = Math.max(2, Math.ceil(shape.outerLength / (0.8 * u)));
  if (shape.kind === "pointed" && N % 2) N++;
  let n = 0;
  const pts = Array.from({ length: N + 1 }, (_, k) => shape.at(k / N));
  for (const z of [-d / 2 + s / 2, d / 2 - s / 2]) {
    for (let k = 0; k < N; k++) {
      const p = pts[k]!;
      const q = pts[k + 1]!;
      // tangent members ride just inside the curves so the opening stays clear
      const inA: V3 = [p.inner[0] + p.n[0] * (s / 2), p.inner[1] + p.n[1] * (s / 2), z];
      const inB: V3 = [q.inner[0] + q.n[0] * (s / 2), q.inner[1] + q.n[1] * (s / 2), z];
      const outA: V3 = [p.outer[0] - p.n[0] * (s / 2), p.outer[1] - p.n[1] * (s / 2), z];
      const outB: V3 = [q.outer[0] - q.n[0] * (s / 2), q.outer[1] - q.n[1] * (s / 2), z];
      n += chain(b, stock, inA, inB, { mode: "overhang", up: [0, 0, 1] });
      n += chain(b, stock, outA, outB, { mode: "overhang", up: [0, 0, 1] });
      // radial at the segment's middle (wedge joint)
      const m = shape.at((k + 0.5) / N);
      n += chain(b, stock, [m.inner[0], m.inner[1], z], [m.outer[0], m.outer[1], z], { up: [0, 0, 1], mode: t < u ? "downgrade" : "overhang" });
    }
  }
  // a thin shading shell inside the ring between the faces (§7.1: rear shading allowed);
  // the faces' tangent and radial members stay the visible construction
  if (o.shell !== false) {
    const segs = Math.max(4, Math.min(24, Math.round(shape.outerLength / 3)));
    for (let k = 0; k < segs; k++) {
      const p0 = shape.at(k / segs);
      const p1 = shape.at((k + 1) / segs);
      const mx = (p0.inner[0] + p0.outer[0] + p1.inner[0] + p1.outer[0]) / 4;
      const my = (p0.inner[1] + p0.outer[1] + p1.inner[1] + p1.outer[1]) / 4;
      const dx = (p1.inner[0] + p1.outer[0] - p0.inner[0] - p0.outer[0]) / 2;
      const dy = (p1.inner[1] + p1.outer[1] - p0.inner[1] - p0.outer[1]) / 2;
      const segLen = Math.hypot(dx, dy);
      b.shell([mx, my, 0], [segLen / 2 + 0.05, (t * 0.82) / 2, d / 2 - s * 1.2], "plank", { roll: Math.atan2(dy, dx) });
    }
  }
  const tie = o.tieStock ?? "M";
  for (let k = 0; k <= N; k += 4) {
    const p = pts[k]!;
    const at: [number, number] = [(p.inner[0] + p.outer[0]) / 2, (p.inner[1] + p.outer[1]) / 2];
    n += chain(b, tie, [at[0], at[1], -d / 2], [at[0], at[1], d / 2], { up: [p.n[0], p.n[1], 0] });
  }
  if (o.soffit) {
    const ss = sec(o.soffit);
    for (let k = 0; k <= N; k++) {
      const p = shape.at(k / N);
      const at: [number, number] = [p.inner[0] + p.n[0] * ss * 0.5, p.inner[1] + p.n[1] * ss * 0.5];
      n += chain(b, o.soffit, [at[0], at[1], -d / 2 + s], [at[0], at[1], d / 2 - s], { up: [p.n[0], p.n[1], 0] });
    }
  }
  if (o.collide !== false) {
    // a few chunky boxes along the ring (≥ 0.5 thick), never filling the opening
    const segs = Math.max(4, Math.min(16, Math.round(shape.outerLength / 6)));
    // Boxes are yaw-only, so each ring segment becomes the box spanning its
    // extrados ends and the higher of its intrados ends: the opening below
    // the intrados stays clear (at worst a sliver under the springing).
    for (let k = 0; k < segs; k++) {
      const q0 = shape.at(k / segs);
      const q1 = shape.at((k + 1) / segs);
      const minX = Math.min(q0.inner[0], q0.outer[0], q1.inner[0], q1.outer[0]);
      const maxX = Math.max(q0.inner[0], q0.outer[0], q1.inner[0], q1.outer[0]);
      const lowY = Math.max(q0.inner[1], q1.inner[1]);
      const topY = Math.max(q0.outer[1], q1.outer[1]);
      const hy = Math.max(0.3, (topY - lowY) / 2);
      b.box([(minX + maxX) / 2, lowY + hy, 0], [Math.max(0.3, (maxX - minX) / 2), hy, d / 2], 0);
    }
  }
  return { pieces: n, N, shape };
}

// ---------------------------------------------------------------- domes

export interface DomeProfile {
  /** Ring j = 0…k: radius and height. */
  rings: readonly { r: number; y: number }[];
}

/**
 * DOME: m meridional ribs following the profile's points (each rib segment a
 * chain of its actual chord), double chains spaced one section apart along
 * the inward normal, and a ring at every profile point whose segment count
 * keeps chords within the stock.
 */
export function dome(
  b: Builder,
  cx: number,
  cz: number,
  profile: DomeProfile,
  m: number,
  o: { ribStock?: StockId; ribDouble?: boolean; ringStock?: StockId; phase?: number; ringEvery?: number; arc?: [number, number]; ribBand?: string; ringBand?: string; skipRings?: (j: number) => boolean } = {},
): { ribs: number; rings: number } {
  const ribStock = o.ribStock ?? "M";
  const ringStock = o.ringStock ?? "M";
  const s = sec(ribStock);
  const ph = o.phase ?? 0;
  const [a0, a1] = o.arc ?? [0, 2 * Math.PI];
  const full = Math.abs(a1 - a0 - 2 * Math.PI) < 1e-9;
  const ribCount = full ? m : m + 1;
  let ribs = 0;
  let rings = 0;
  const pr = profile.rings;
  for (let i = 0; i < ribCount; i++) {
    const a = ph + a0 + ((a1 - a0) * i) / m;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let j = 0; j + 1 < pr.length; j++) {
      if (o.ribBand) b.set({ band: o.ribBand, course: j + 1 });
      const p = pr[j]!;
      const q = pr[j + 1]!;
      const A: V3 = [cx + p.r * ca, p.y, cz + p.r * sa];
      const B: V3 = [cx + q.r * ca, q.y, cz + q.r * sa];
      ribs += chain(b, ribStock, A, B, { up: [ca, 0, sa] });
      if (o.ribDouble !== false) {
        // second chain along the inward surface normal
        const tdir = norm(sub(B, A));
        const nrm = norm(cross(tdir, [-sa, 0, ca]));
        const inward = dot(nrm, [ca, 0, sa]) > 0 ? scale(nrm, -s * 1.02) : scale(nrm, s * 1.02);
        ribs += chain(b, ribStock, add(A, inward), add(B, inward), { up: [ca, 0, sa] });
      }
    }
  }
  const every = o.ringEvery ?? 1;
  for (let j = 0; j < pr.length; j++) {
    if (j % every !== 0 && j !== pr.length - 1) continue;
    if (o.skipRings?.(j)) continue;
    const p = pr[j]!;
    if (p.r < 0.3) continue;
    if (o.ringBand) b.set({ band: o.ringBand, course: j });
    const u = STOCKS[ringStock].length;
    const segs = Math.max(m, Math.ceil((2 * Math.PI * p.r) / u / 4) * 4);
    if (full) rings += ring(b, ringStock, cx, p.y, cz, p.r, segs, 1, { phase: ph, stagger: false });
    else {
      const k = Math.max(2, Math.ceil(((a1 - a0) * p.r) / u));
      for (let i = 0; i < k; i++) {
        const t0 = ph + a0 + ((a1 - a0) * i) / k;
        const t1 = ph + a0 + ((a1 - a0) * (i + 1)) / k;
        rings += chain(b, ringStock, [cx + p.r * Math.cos(t0), p.y, cz + p.r * Math.sin(t0)], [cx + p.r * Math.cos(t1), p.y, cz + p.r * Math.sin(t1)], { mode: "overhang", up: [0, 1, 0] });
      }
    }
  }
  return { ribs, rings };
}

/** Sphere-cap rings: base radius r0 at y0 rising h, k rings; returns profile points (j = 0…k). */
export function sphereCap(r0: number, y0: number, h: number, k: number): DomeProfile {
  const R = (r0 * r0 + h * h) / (2 * h);
  const cy = y0 + h - R;
  const rings: { r: number; y: number }[] = [];
  for (let j = 0; j <= k; j++) {
    const y = y0 + (h * j) / k;
    rings.push({ r: Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy))), y });
  }
  return { rings };
}

// ---------------------------------------------------------------- walls and steps

export interface Opening {
  /** Along the wall: from x0 to x1 (local), and from y0 to y1. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * WALL(L,H,p): a framed wall along local x from 0 to L, centred on z = 0,
 * bottom at y0. Verticals every p, horizontal frames at the given course
 * heights, staggered horizontal facing between frames except inside
 * openings (whose frames are kept), an X brace every second bay without an
 * opening. Colliders: boxes for the solid parts only.
 */
export function wall(
  b: Builder,
  L: number,
  y0: number,
  H: number,
  p: number,
  o: { stock?: StockId; facing?: StockId | null; facingStep?: number; courses?: number[]; openings?: Opening[]; thickness?: number; braces?: boolean; collide?: boolean; z?: number } = {},
): number {
  const st = o.stock ?? "M";
  const s = sec(st);
  const z = o.z ?? 0;
  const ops = o.openings ?? [];
  const bays = Math.max(1, Math.round(L / p));
  const pitch = L / bays;
  let n = 0;
  const inOpening = (x: number, y: number): boolean => ops.some((q) => x > q.x0 + 1e-6 && x < q.x1 - 1e-6 && y > q.y0 + 1e-6 && y < q.y1 - 1e-6);
  // verticals (skipped where they would stand inside an opening)
  for (let i = 0; i <= bays; i++) {
    const x = Math.min(L - s / 2, Math.max(s / 2, i * pitch));
    const blocked = ops.filter((q) => x > q.x0 && x < q.x1);
    let ranges: [number, number][] = [[y0, y0 + H]];
    for (const q of blocked) {
      const next: [number, number][] = [];
      for (const [a, c] of ranges) {
        if (q.y1 <= a || q.y0 >= c) next.push([a, c]);
        else {
          if (q.y0 > a) next.push([a, q.y0]);
          if (q.y1 < c) next.push([q.y1, c]);
        }
      }
      ranges = next;
    }
    for (const [a, c] of ranges) if (c - a > 0.4) n += chain(b, st, [x, a, z], [x, c, z], { up: [0, 0, 1] });
  }
  // horizontal frames
  const courses = o.courses ?? [y0 + s / 2, y0 + H - s / 2];
  for (const y of courses) n += hRun(b, st, 0, L, y, z, ops, inOpening);
  // opening frames
  for (const q of ops) {
    n += chain(b, st, [q.x0 - s / 2, Math.max(y0, q.y0), z], [q.x0 - s / 2, Math.min(y0 + H, q.y1 + s), z], { up: [0, 0, 1] });
    n += chain(b, st, [q.x1 + s / 2, Math.max(y0, q.y0), z], [q.x1 + s / 2, Math.min(y0 + H, q.y1 + s), z], { up: [0, 0, 1] });
    if (q.y1 < y0 + H - s) n += chain(b, st, [q.x0 - s, q.y1 + s / 2, z], [q.x1 + s, q.y1 + s / 2, z], { up: [0, 1, 0] });
    if (q.y0 > y0 + s) n += chain(b, st, [q.x0 - s, q.y0 - s / 2, z], [q.x1 + s, q.y0 - s / 2, z], { up: [0, 1, 0] });
  }
  // staggered facing: horizontal boards on the outer face (z − section)
  if (o.facing !== null) {
    const f = o.facing ?? "M";
    const fs = sec(f);
    const step = o.facingStep ?? fs * 2.2;
    let k = 0;
    for (let y = y0 + fs; y < y0 + H - fs / 2; y += step, k++) {
      const shift = k % 2 ? STOCKS[f].length / 2 : 0;
      n += hRun(b, f, -shift > -0.01 ? 0 : 0, L, y, z - s / 2 - fs / 2, ops, inOpening, shift);
    }
  }
  // braces every second bay with no opening
  if (o.braces !== false) {
    for (let i = 0; i < bays; i += 2) {
      const xa = i * pitch;
      const xb = (i + 1) * pitch;
      if (ops.some((q) => q.x1 > xa && q.x0 < xb)) continue;
      n += chain(b, st, [xa + s, y0 + s, z + s], [xb - s, y0 + H - s, z + s]);
    }
  }
  if (o.collide !== false) {
    const th = Math.max(0.6, o.thickness ?? 1);
    // vertical strips between openings, plus lintel/sill blocks
    const cuts = [0, ...ops.flatMap((q) => [q.x0, q.x1]), L].sort((a, c) => a - c);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const xa = cuts[i]!;
      const xb = cuts[i + 1]!;
      if (xb - xa < 0.05) continue;
      const mid = (xa + xb) / 2;
      const inside = ops.filter((q) => mid > q.x0 && mid < q.x1);
      let ranges: [number, number][] = [[y0, y0 + H]];
      for (const q of inside) {
        const next: [number, number][] = [];
        for (const [a, c] of ranges) {
          if (q.y1 <= a || q.y0 >= c) next.push([a, c]);
          else {
            if (q.y0 > a) next.push([a, q.y0]);
            if (q.y1 < c) next.push([q.y1, c]);
          }
        }
        ranges = next;
      }
      for (const [a, c] of ranges) if (c - a > 0.3) b.box([mid, (a + c) / 2, z], [(xb - xa) / 2, Math.max(0.3, (c - a) / 2), th / 2]);
    }
  }
  return n;
}

/** A horizontal run along x from x0 to x1 at (y, z), broken around openings. */
function hRun(b: Builder, st: StockId, x0: number, x1: number, y: number, z: number, ops: Opening[], inOpening: (x: number, y: number) => boolean, shift = 0): number {
  const cuts: [number, number][] = [];
  let start: number | null = null;
  const stepX = 0.25;
  for (let x = x0; x <= x1 + 1e-9; x += stepX) {
    const open = inOpening(x, y);
    if (!open && start === null) start = x;
    if ((open || x + stepX > x1 + 1e-9) && start !== null) {
      cuts.push([start, open ? x - stepX : x1]);
      start = null;
    }
  }
  void ops;
  let n = 0;
  const u = STOCKS[st].length;
  for (const [a, c] of cuts) {
    if (c - a < 0.3) continue;
    if (shift > 0 && c - a > u * 1.5) {
      // staggered joints: a short lead piece then the main run
      n += chain(b, st, [a, y, z], [a + shift, y, z], { up: [0, 1, 0] });
      n += chain(b, st, [a + shift, y, z], [c, y, z], { up: [0, 1, 0] });
    } else n += chain(b, st, [a, y, z], [c, y, z], { up: [0, 1, 0] });
  }
  return n;
}

/**
 * Broad shallow steps (main prompt §7.2): a flight rising `rise` over
 * `count` risers of ≤ 0.3 along local +z from z0, `width` wide, treads
 * decked with `stock`. A continuous ramp collider replaces per-step collision,
 * so the eye height glides instead of bouncing.
 */
export function steps(b: Builder, x: number, y0: number, z0: number, width: number, rise: number, o: { riser?: number; tread?: number; stock?: StockId; dir?: 1 | -1; edges?: boolean } = {}): { pieces: number; run: number; count: number } {
  const riser = o.riser ?? 0.25;
  const count = Math.max(1, Math.ceil(rise / riser - 1e-9));
  const r = rise / count;
  const tread = o.tread ?? 1.5;
  const st = o.stock ?? "M";
  const s = sec(st);
  const dir = o.dir ?? 1;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const top = y0 + r * (i + 1);
    const za = z0 + dir * i * tread;
    const zb = za + dir * tread;
    // nosing: a doubled board at the front edge, then the tread deck
    n += chain(b, st, [x - width / 2, top - s / 2, za + (dir * s) / 2], [x + width / 2, top - s / 2, za + (dir * s) / 2], { up: [0, 1, 0] });
    n += chain(b, st, [x - width / 2, top - (3 * s) / 2, za + (dir * s) / 2], [x + width / 2, top - (3 * s) / 2, za + (dir * s) / 2], { up: [0, 1, 0] });
    const boards = Math.max(1, Math.floor((tread - s) / (s * 1.04)));
    for (let k = 1; k <= boards; k++) {
      const zz = za + dir * (s / 2 + k * s * 1.04);
      if (dir * (zz - zb) > -s / 2) break;
      n += chain(b, st, [x - width / 2, top - s / 2, zz], [x + width / 2, top - s / 2, zz], { up: [0, 1, 0] });
    }
    if (o.edges !== false) for (const sx of [-1, 1]) n += chain(b, st, [x + sx * (width / 2 - s / 2), top - s / 2, za], [x + sx * (width / 2 - s / 2), top - s / 2, zb], { up: [0, 1, 0] });
  }
  const run = count * tread;
  const zEnd = z0 + dir * run;
  b.ramp([x, (y0 + y0 + rise) / 2, (z0 + zEnd) / 2], width / 2, run / 2, dir > 0 ? 0 : Math.PI, y0, y0 + rise, y0 - 0.5);
  return { pieces: n, run, count };
}

/** A square post bundle (four corner chains) of a given stock from y0 to y1 with ring frames every `every`. */
export function postBundle(b: Builder, stock: StockId, cx: number, cz: number, y0: number, y1: number, w: number, d: number, o: { every?: number; frameStock?: StockId; perCorner?: number; braces?: boolean } = {}): number {
  const s = sec(stock);
  let n = 0;
  const pc = o.perCorner ?? 1;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = cx + sx * (w / 2 - s / 2);
      const z = cz + sz * (d / 2 - s / 2);
      n += chain(b, stock, [x, y0, z], [x, y1, z], { up: [0, 0, 1] });
      if (pc >= 2) n += chain(b, stock, [x - sx * s, y0, z], [x - sx * s, y1, z], { up: [0, 0, 1] });
      if (pc >= 3) n += chain(b, stock, [x, y0, z - sz * s], [x, y1, z - sz * s], { up: [0, 0, 1] });
      if (pc >= 4) n += chain(b, stock, [x - sx * s, y0, z - sz * s], [x - sx * s, y1, z - sz * s], { up: [0, 0, 1] });
    }
  }
  if (o.every) {
    const fs = o.frameStock ?? stock;
    for (let y = y0 + o.every; y < y1 - 0.1; y += o.every) n += rect(b, fs, cx, y - sec(fs), cz, w, d, 1);
  }
  return n;
}

/** Distance helper re-exported for recipes. */
export { dist, polar };

/** Arc-length parameterisation of an ellipse (semi-axes ax along x, az along z), starting at angle `phase`, counter-clockwise seen from +y. */
export function ellipseArc(ax: number, az: number, phase = 0, n = 4096): { total: number; at: (s: number) => { p: [number, number]; t: [number, number]; out: [number, number] } } {
  const cum = new Float64Array(n + 1);
  const pt = (k: number): [number, number] => {
    const a = phase + (2 * Math.PI * k) / n;
    return [ax * Math.cos(a), az * Math.sin(a)];
  };
  let prev = pt(0);
  for (let k = 1; k <= n; k++) {
    const q = pt(k);
    cum[k] = cum[k - 1]! + Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  const total = cum[n]!;
  return {
    total,
    at: (s) => {
      const t0 = ((s % total) + total) % total;
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid]! <= t0) lo = mid;
        else hi = mid;
      }
      const f = (t0 - cum[lo]!) / (cum[lo + 1]! - cum[lo]! || 1);
      const a = phase + (2 * Math.PI * (lo + f)) / n;
      const p: [number, number] = [ax * Math.cos(a), az * Math.sin(a)];
      const tx = -ax * Math.sin(a);
      const tz = az * Math.cos(a);
      const tl = Math.hypot(tx, tz) || 1;
      const ox = p[0] / (ax * ax);
      const oz = p[1] / (az * az);
      const ol = Math.hypot(ox, oz) || 1;
      return { p, t: [tx / tl, tz / tl], out: [ox / ol, oz / ol] };
    },
  };
}

/** The yaw that turns local +x onto the horizontal direction (dx, dz) (Builder.at convention). */
export const yawForX = (dx: number, dz: number): number => Math.atan2(-dz, dx);
