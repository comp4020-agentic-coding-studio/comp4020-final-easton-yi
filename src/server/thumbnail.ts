// Gallery previews drawn from the exhibit's actual frozen geometry: an
// isometric SVG of projected cuboid faces, depth-sorted. A thumbnail only; the
// exhibit page renders the real 3D scene.
import { boxCorners, stickBox, type Pose } from "../shared/geometry.ts";

interface Geometry {
  stick: { length: number; width: number; height: number };
  table: { radius: number };
  sticks: { p: number[]; q: number[]; seed: number }[];
}

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const project = (v: number[]): [number, number] => [(v[0]! - v[2]!) * COS, (v[0]! + v[2]!) * SIN - v[1]!];
const num = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : "0");

// corner index = sx*4 + sy*2 + sz with s ∈ {0: −, 1: +} (matches boxCorners order)
const FACES: [number[], "end" | "side" | "top"][] = [
  [[0, 1, 3, 2], "end"], // −X
  [[4, 6, 7, 5], "end"], // +X
  [[0, 4, 5, 1], "side"], // −Y
  [[2, 3, 7, 6], "top"], // +Y
  [[0, 2, 6, 4], "side"], // −Z
  [[1, 5, 7, 3], "side"], // +Z
];

const shade = (seed: number, kind: "end" | "side" | "top", light: number): string => {
  const v = ((seed % 1000) / 1000 - 0.5) * 0.12;
  const base = { end: [168, 120, 78], side: [188, 145, 103], top: [212, 172, 128] }[kind];
  const f = (0.75 + 0.35 * light) * (1 + v);
  return `rgb(${base.map((c) => Math.max(0, Math.min(255, Math.round(c * f)))).join(",")})`;
};

export function thumbnailSvg(g: Geometry): string {
  const polys: { depth: number; pts: [number, number][]; fill: string }[] = [];
  const view = [1, 1, 1].map((c) => c / Math.sqrt(3)); // towards the viewer
  const lightDir = [0.3, 0.9, 0.3];
  for (const s of g.sticks) {
    const pose: Pose = { p: s.p as Pose["p"], q: s.q as Pose["q"] };
    const corners = boxCorners(stickBox(pose, g.stick));
    for (const [idx, kind] of FACES) {
      const pts = idx.map((i) => corners[i]!);
      const a = pts[0]!;
      const b = pts[1]!;
      const c = pts[2]!;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
      const center = pts.reduce((acc, p) => [acc[0]! + p[0] / 4, acc[1]! + p[1] / 4, acc[2]! + p[2] / 4], [0, 0, 0]);
      const out = [center[0]! - pose.p[0], center[1]! - pose.p[1], center[2]! - pose.p[2]];
      if (n[0]! * out[0]! + n[1]! * out[1]! + n[2]! * out[2]! < 0) n = n.map((x) => -x);
      const facing = n[0]! * view[0]! + n[1]! * view[1]! + n[2]! * view[2]!;
      if (facing <= 0) continue;
      const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      const light = Math.max(0, (n[0]! * lightDir[0]! + n[1]! * lightDir[1]! + n[2]! * lightDir[2]!) / len);
      polys.push({
        depth: center[0]! * view[0]! + center[1]! * view[1]! + center[2]! * view[2]!,
        pts: pts.map(project),
        fill: shade(s.seed, kind === "end" ? "end" : n[1]! / len > 0.7 ? "top" : "side", light),
      });
    }
  }
  polys.sort((a, b) => a.depth - b.depth);
  const r = g.table.radius;
  const all = polys.flatMap((p) => p.pts);
  const xs = [...all.map((p) => p[0]), -r * 1.42 * COS, r * 1.42 * COS];
  const ys = [...all.map((p) => p[1]), -r * 1.42 * SIN, r * 1.42 * SIN + 2];
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  const table = `<ellipse cx="0" cy="1" rx="${num(r * 1.414 * COS)}" ry="${num(r * 1.414 * SIN)}" fill="#cbbfa8"/><ellipse cx="0" cy="0" rx="${num(r * 1.414 * COS)}" ry="${num(r * 1.414 * SIN)}" fill="#e3d9c6"/>`;
  const body = polys
    .map((p) => `<polygon points="${p.pts.map((q) => `${num(q[0])},${num(q[1])}`).join(" ")}" fill="${p.fill}" stroke="#6b4a2d" stroke-width="0.05" stroke-linejoin="round"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(minX)} ${num(minY)} ${num(maxX - minX)} ${num(maxY - minY)}" role="img" aria-label="Preview of the exhibited structure">${table}${body}</svg>`;
}
