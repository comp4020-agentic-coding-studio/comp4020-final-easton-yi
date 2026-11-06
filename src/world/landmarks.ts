// The twenty preset landmarks: identity, target envelope (Appendix A), the
// recipe that builds each, and the validation every generated building must
// pass. Shared by the offline generator, the browser worker and the tests.
import { viewContent, viewOk } from "./viewcheck.ts";
import { Builder, STOCKS, STOCK_IDS, type BuildResult, type V3 } from "./core.ts";
import { L01, L02, L03, L04 } from "./recipes/regionA.ts";
import { L05, L06, L07, L08 } from "./recipes/regionB.ts";
import { L09, L10, L11, L12 } from "./recipes/regionC.ts";
import { L13, L14, L15, L16 } from "./recipes/regionD.ts";
import { L17, L18, L19, L20 } from "./recipes/regionE.ts";

/** Bump when any recipe's geometry changes; generated assets carry it. */
export const RECIPE_VERSION = "2026-11-03.1";

export type RegionId = "A" | "B" | "C" | "D" | "E";

export interface LandmarkDef {
  id: string;
  region: RegionId;
  title: string;
  /** "World preset · Inspired by …" — never a claim of reproduction or player authorship. */
  inspiration: string;
  period: string;
  /** W × D × H (x × z × y), metres. */
  target: [number, number, number];
  organization: string;
  build: (b: Builder) => void;
  /** Tolerance for the envelope check (default 0.01 = ±1 %); a looser one is a recorded revision. */
  tolerance?: number;
}

export const LANDMARKS: readonly LandmarkDef[] = [
  { id: "L01", region: "A", title: "First Lintel Ring", inspiration: "Stonehenge-like lintels and rings", period: "prehistoric", target: [72, 56, 32], organization: "Three foundation bands, 20 outer posts, five inner portal pairs and staggered lintels", build: L01 },
  { id: "L02", region: "A", title: "Lotus Column Forest", inspiration: "the Karnak hypostyle hall", period: "ancient Egypt", target: [144, 104, 44], organization: "Low side aisles, a high central hall, 48 bundled-stem columns with bud and open crowns", build: L02 },
  { id: "L03", region: "A", title: "Ridge Doric Temple", inspiration: "the Parthenon's column order", period: "ancient Greece", target: [96, 184, 52], organization: "Three-level platform, 46 outer columns, architrave/frieze/cornice and pitched pediments", build: L03 },
  { id: "L04", region: "A", title: "Volute Terrace Palace", inspiration: "the Erechtheion's Ionic language", period: "ancient Greece", target: [112, 128, 56], organization: "Unequal terraces, main hall and side porch, volutes and stepped roofs", build: L04 },
  { id: "L05", region: "B", title: "Triple Aqueduct", inspiration: "the Pont du Gard's stacked arches", period: "ancient Rome", target: [300, 20, 68], organization: "Three unequal arcade tiers, 6/11/35 openings and a top water channel", build: L05 },
  { id: "L06", region: "B", title: "Ring Theatre", inspiration: "the Colosseum", period: "ancient Rome", target: [240, 196, 78], organization: "Three arcade levels, an upper wall band, ring corridors and seating", build: L06 },
  { id: "L07", region: "B", title: "Oculus Hall", inspiration: "the Pantheon", period: "ancient Rome", target: [112, 144, 86], organization: "Portico, rotunda, hemispherical dome, five coffer bands and an open oculus", build: L07 },
  { id: "L08", region: "B", title: "Floating Dome Hall", inspiration: "Hagia Sophia's pendentives", period: "Byzantine", target: [136, 176, 96], organization: "Four piers and arches, pendentives, a central dome and two half-domes", build: L08 },
  { id: "L09", region: "C", title: "Double-Ring Sea Castle", inspiration: "Carcassonne's walls and towers", period: "medieval", target: [176, 152, 108], organization: "Two wall rings, eight outer towers, a six-storey keep, conical roofs and crenellations", build: L09 },
  { id: "L10", region: "C", title: "Pointed-Arch Cloud Nave", inspiration: "Amiens Cathedral's ribs and flying buttresses", period: "Gothic", target: [112, 216, 128], organization: "Eight nave bays, two-level aisles, pointed windows, twin towers and a central spire", build: L10 },
  { id: "L11", region: "C", title: "Eight-Lobed Dome Palace", inspiration: "Florence Cathedral's dome", period: "Renaissance", target: [128, 184, 144], organization: "Hall, octagonal drum, double-shell eight-lobed dome and lantern", build: L11 },
  { id: "L12", region: "C", title: "Embrace Square", inspiration: "St Peter's colonnade and dome", period: "Baroque", target: [280, 240, 154], organization: "Four-deep curved colonnades, a central facade, drum and dome", build: L12 },
  { id: "L13", region: "D", title: "Lattice Conservatory", inspiration: "the Crystal Palace's modular framing", period: "mid-19th century", target: [320, 160, 96], organization: "Low wings, a high nave and a transverse barrel vault; deliberately broad", build: L13 },
  { id: "L14", region: "D", title: "Four-Leg Wind Tower", inspiration: "the Eiffel Tower", period: "late 19th century", target: [100, 100, 188], organization: "Four curved tapering legs, two major platforms, converging lattice and summit", build: L14 },
  { id: "L15", region: "D", title: "Setback Crown", inspiration: "the Empire State Building's verticality", period: "1930s", target: [112, 88, 212], organization: "Eight lower floors, 20 middle floors, 12 tower floors, four crown floors and a mast", build: L15 },
  { id: "L16", region: "D", title: "Curved Gorge Dam", inspiration: "Hoover Dam's arch-gravity form", period: "1930s", target: [360, 160, 160], organization: "Curved thickness transition, crest road, four intake towers, powerhouses and a fin spillway", build: L16, tolerance: 0.02 },
  { id: "L17", region: "E", title: "Vertical Court Tower", inspiration: "the Seagram Building's facade rhythm", period: "postwar modernism", target: [80, 56, 244], organization: "An open lobby, 52 floors and an equipment crown; depth-separated mullions and bands", build: L17 },
  { id: "L18", region: "E", title: "Nine-Bundle Cloud Tower", inspiration: "the Willis Tower's bundled tubes", period: "1970s", target: [90, 90, 276], organization: "Nine square tubes terminating at different levels over 60 floors", build: L18 },
  { id: "L19", region: "E", title: "Prismatic Brace Tower", inspiration: "the Bank of China Tower", period: "1980s–90s", target: [88, 88, 304], organization: "Four triangular parts, 64 floor bands, eight-floor brace modules and sloping crowns", build: L19 },
  { id: "L20", region: "E", title: "Three-Wing Skyline Peak", inspiration: "the Burj Khalifa's wing setbacks", period: "21st century", target: [144, 132, 340], organization: "Three wings and a hexagonal core, 72 floors, six-floor setback cycles and a spire", build: L20, tolerance: 0.035 },
];

export const landmarkById = (id: string): LandmarkDef | undefined => LANDMARKS.find((l) => l.id === id);

export function buildLandmark(def: LandmarkDef): BuildResult {
  const b = new Builder(def.id);
  def.build(b);
  return b.finalize();
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Validation {
  id: string;
  ok: boolean;
  checks: Check[];
  size: [number, number, number];
  deviation: [number, number, number];
}

const finite = (a: ArrayLike<number>): boolean => {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return false;
  return true;
};

/**
 * Geometric acceptance (main prompt §13.2, Appendix C2): finite transforms,
 * unit quaternions, allowed stock only, actual bounds against the target
 * envelope, every planned course present in the BOM, BOM totals equal to the
 * piece count, no exact duplicates kept, entries/viewpoints/safe points and
 * at least three identity features, colliders of sane size.
 */
export function validate(def: LandmarkDef, r: BuildResult): Validation {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string): void => void checks.push({ name, ok, detail });
  add("pieces", r.count > 1000, `${r.count} pieces`);
  add("finite transforms", finite(r.pos) && finite(r.quat), "all positions and quaternions finite");
  let worstQ = 0;
  for (let i = 0; i < r.count; i++) {
    const n = Math.hypot(r.quat[i * 4]!, r.quat[i * 4 + 1]!, r.quat[i * 4 + 2]!, r.quat[i * 4 + 3]!);
    worstQ = Math.max(worstQ, Math.abs(n - 1));
  }
  add("valid rotations", worstQ < 1e-4, `max |‖q‖ − 1| = ${worstQ.toExponential(1)}`);
  let badStock = 0;
  for (let i = 0; i < r.count; i++) if (r.stock[i]! > 2) badStock++;
  add("allowed stock only", badStock === 0, `B/M/D only (${r.totals.B}/${r.totals.M}/${r.totals.D})`);
  const size: [number, number, number] = [r.coreBounds.max[0] - r.coreBounds.min[0], r.coreBounds.max[2] - r.coreBounds.min[2], r.coreBounds.max[1] - r.coreBounds.min[1]];
  const dev = size.map((s, i) => s / def.target[i]! - 1) as [number, number, number];
  const tol = def.tolerance ?? 0.01;
  add("envelope", dev.every((d) => Math.abs(d) <= tol + 1e-9), `W×D×H ${size.map((s) => s.toFixed(1)).join(" × ")} vs ${def.target.join(" × ")} (${dev.map((d) => (d * 100).toFixed(1) + "%").join(", ")}; tolerance ±${(tol * 100).toFixed(1)}%)`);
  add("foundation at 0", Math.abs(r.coreBounds.min[1]) < 0.6, `lowest core piece at y = ${r.coreBounds.min[1].toFixed(2)}`);
  // every declared band course appears in the BOM
  const have = new Map<string, Set<number>>();
  for (const row of r.bom) {
    const k = `${row.stage}|${row.band}`;
    if (!have.has(k)) have.set(k, new Set());
    if (row.B + row.M + row.D > 0) have.get(k)!.add(row.course);
  }
  const missing: string[] = [];
  for (const p of r.plans) {
    const got = have.get(`${p.stage}|${p.band}`);
    if (!got || got.size < Math.min(p.courses, 1)) missing.push(`${p.band} (none)`);
    else if (got.size < p.courses) missing.push(`${p.band} (${got.size}/${p.courses} courses)`);
  }
  add("planned courses present", missing.length === 0, missing.length ? `missing: ${missing.join("; ")}` : `${r.plans.length} planned bands all present`);
  const bomSum = r.bom.reduce((s, row) => s + row.B + row.M + row.D, 0);
  add("BOM covers every piece", bomSum === r.count && r.totals.B + r.totals.M + r.totals.D === r.count, `BOM ${bomSum} = pieces ${r.count}`);
  // exact duplicates are dropped at build time; verify none slipped through (hash identical transforms)
  const seen = new Set<string>();
  let dupes = 0;
  for (let i = 0; i < r.count; i++) {
    const k = `${r.stock[i]}|${Math.round(r.pos[i * 3]! * 1000)}|${Math.round(r.pos[i * 3 + 1]! * 1000)}|${Math.round(r.pos[i * 3 + 2]! * 1000)}|${Math.round(r.quat[i * 4]! * 1e4)}|${Math.round(r.quat[i * 4 + 1]! * 1e4)}|${Math.round(r.quat[i * 4 + 2]! * 1e4)}|${Math.round(r.quat[i * 4 + 3]! * 1e4)}`;
    if (seen.has(k)) dupes++;
    seen.add(k);
  }
  add("no exact duplicates", dupes === 0, `${r.duplicates} coincident duplicates removed at build; ${dupes} remaining`);
  add("entries", r.entries.length >= 1 && r.entries.some((e) => e.main), `${r.entries.length} marked routes (${r.entries.filter((e) => e.main).length} main)`);
  const kinds = new Set(r.viewpoints.map((v) => v.kind));
  add("viewpoints", kinds.has("ground") && kinds.has("high") && (kinds.has("interior") || kinds.has("detail")), `${[...kinds].join(", ")}`);
  // what each viewpoint shows: not blocked at the lens, the building in frame (src/world/viewcheck.ts)
  const content = viewContent(r);
  const badViews = content.filter((v) => !viewOk(v));
  add("viewpoint content", badViews.length === 0, badViews.length ? badViews.map((v) => `${v.kind}: ${(v.blocked * 100).toFixed(0)} % blocked at the lens, building in ${(v.building * 100).toFixed(0)} %`).join("; ") : content.map((v) => `${v.kind} ${(v.building * 100).toFixed(0)} %`).join(", "));
  add("safe points", r.safePoints.length >= 1, `${r.safePoints.length} safe points`);
  add("identity features", r.features.length >= 3, r.features.map((f) => f.name).join("; "));
  const badCol = r.colliders.filter((c) => {
    if (c.kind === "box") return !finite([...c.c, ...c.h, c.yaw]) || Math.min(...c.h) <= 0;
    if (c.kind === "cyl") return !finite([...c.c, c.r, c.hy]) || c.r <= 0 || c.hy <= 0;
    return !finite([...c.c, c.hx, c.hz, c.yaw, c.y0, c.y1, c.floor]);
  }).length;
  add("colliders", r.colliders.length >= 8 && badCol === 0, `${r.colliders.length} proxies (${badCol} invalid)`);
  add("finite outputs", [...r.entries.flatMap((e) => [...e.a, ...e.b]), ...r.viewpoints.flatMap((v) => [...v.eye, v.yaw, v.pitch]), ...r.safePoints.flatMap((s) => [...s.feet, s.yaw])].every(Number.isFinite), "entries, viewpoints and safe points finite");
  return { id: def.id, ok: checks.every((c) => c.ok), checks, size, deviation: dev };
}

/** Rows of the course-level BOM, grouped band → B/M/D, for reports. */
export function bandTable(r: BuildResult): { stage: string; band: string; courses: number; B: number; M: number; D: number }[] {
  const m = new Map<string, { stage: string; band: string; courses: Set<number>; B: number; M: number; D: number }>();
  for (const row of r.bom) {
    const k = `${row.stage}|${row.band}`;
    const e = m.get(k) ?? { stage: row.stage, band: row.band, courses: new Set<number>(), B: 0, M: 0, D: 0 };
    e.courses.add(row.course);
    e.B += row.B;
    e.M += row.M;
    e.D += row.D;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ stage: e.stage, band: e.band, courses: e.courses.size, B: e.B, M: e.M, D: e.D }));
}

export const stockName = (i: number): string => STOCK_IDS[i]!;
export const stockLength = (i: number): number => STOCKS[STOCK_IDS[i]!].length;
export type { V3 };
