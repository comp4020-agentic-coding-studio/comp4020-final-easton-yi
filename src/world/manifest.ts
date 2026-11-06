// The world manifest: versions, hashes, regions, landmark placements, bounds,
// LOD files, collision, entries, viewpoints, safe points, portals, the
// coastline and the flight boundary. Built offline by scripts/world/build-world.ts
// and validated at runtime before anything is used.
import { z } from "zod";

const V3 = z.tuple([z.number(), z.number(), z.number()]).refine((v) => v.every(Number.isFinite), "non-finite vector");
const V2 = z.tuple([z.number(), z.number()]).refine((v) => v.every(Number.isFinite), "non-finite vector");
const Q = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const Hash = z.string().regex(/^[0-9a-f]{8}$/);
// relative same-origin paths only: no scheme, no leading slash, no "..", no backslashes
const Path = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine((p) => !p.split("/").includes(".."), "parent path");

export const ColliderS = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("box"), c: V3, h: V3, yaw: z.number() }),
  z.object({ kind: z.literal("cyl"), c: V3, r: z.number().positive(), hy: z.number().positive() }),
  z.object({ kind: z.literal("ramp"), c: V3, hx: z.number().positive(), hz: z.number().positive(), yaw: z.number(), y0: z.number(), y1: z.number(), floor: z.number() }),
]);
export type ManifestCollider = z.infer<typeof ColliderS>;

export const ShellS = z.object({ shape: z.enum(["box", "cyl"]), c: V3, h: V3, q: Q, kind: z.enum(["shade", "glass", "plank"]) });
export const WaterS = z.object({ c: V3, hx: z.number(), hz: z.number(), yaw: z.number(), speed: z.number(), note: z.string() });

/** One candle cup: base centre (x, y, z), diameter, height. */
const CupS = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).refine((v) => v.every(Number.isFinite), "non-finite cup");
export const CandleGroupS = z.object({
  id: z.string(),
  light: V3,
  range: z.number().positive(),
  weight: z.number().positive(),
  zone: z.string().nullable(),
  essential: z.boolean(),
  kind: z.string(),
  cups: z.array(CupS).min(1).max(7),
});
export type ManifestCandleGroup = z.infer<typeof CandleGroupS>;
const XZ = V2;
/**
 * The island's environmental lighting and the home courtyard (courtyard/day-night directive, 2026-11-06): candle
 * groups per landmark and around home, interior zones for room-aware light selection, and the courtyard's
 * description. Lighting data only: never part of a landmark asset, a work or the server's state.
 */
export const LightingS = z.object({
  version: z.literal(1),
  landmarks: z.array(z.object({
    id: z.string().regex(/^L\d\d$/),
    intent: z.string(),
    groups: z.array(CandleGroupS),
    /** World-space zones (yawed boxes): centre, half sizes, yaw. */
    zones: z.array(z.object({ id: z.string(), c: V3, h: V3, yaw: z.number() })),
  })).length(20),
  home: z.object({
    groups: z.array(CandleGroupS),
    pond: z.object({ c: XZ, u: XZ, v: XZ, a: z.number().positive(), b: z.number().positive(), wave: z.array(z.tuple([z.number(), z.number(), z.number()])), rim: z.number(), depth: z.number().positive(), water: z.number() }),
    slabs: z.array(z.object({ id: z.string(), kind: z.enum(["platform", "step", "candle", "plinth"]), poly: z.array(XZ).min(3), top: z.number(), base: z.number(), batter: z.number(), seed: z.number().int() })),
    edges: z.array(z.object({ id: z.string(), c: XZ, yaw: z.number(), a: z.number(), b: z.number(), h: z.number(), base: z.number(), variant: z.number().int(), seed: z.number().int() })),
    meadowRocks: z.array(z.object({ id: z.string(), c: XZ, yaw: z.number(), a: z.number(), b: z.number(), h: z.number(), base: z.number(), variant: z.number().int(), seed: z.number().int() })),
    patches: z.array(z.object({ id: z.string(), c: XZ, r: XZ })),
    routes: z.array(z.object({ id: z.string(), points: z.array(XZ), width: z.number() })),
    approaches: z.array(z.object({ id: z.string(), c: XZ, n: XZ, half: z.number(), depth: z.number() })),
    bound: z.object({ c: XZ, r: z.number() }),
  }),
});
export type ManifestLighting = z.infer<typeof LightingS>;

export const LandmarkS = z.object({
  id: z.string().regex(/^L\d\d$/),
  regionId: z.enum(["A", "B", "C", "D", "E"]),
  recipeVersion: z.string(),
  kind: z.literal("world-preset"),
  title: z.string(),
  inspiration: z.string(),
  period: z.string(),
  organization: z.string(),
  targetSize: V3,
  actualSize: V3,
  placement: z.object({ position: V3, yaw: z.number(), routeDistance: z.number(), offset: z.number() }),
  localBounds: z.object({ min: V3, max: V3 }),
  /** Radius of the local bounding sphere about the bounds centre. */
  radius: z.number().positive(),
  pieces: z.object({ total: z.number().int().positive(), B: z.number().int(), M: z.number().int(), D: z.number().int(), byTier: z.tuple([z.number().int(), z.number().int(), z.number().int()]) }),
  asset: z.object({ path: Path, hash: Hash, bytes: z.number().int().positive(), contentHash: Hash }),
  /** The far file: the strongest merged chains only (always resident); `asset` is fetched near the camera and evicted. */
  far: z.object({ path: Path, hash: Hash, bytes: z.number().int().positive(), chains: z.number().int().nonnegative() }),
  bands: z.array(z.string()),
  /** Component names referenced by the detail asset's `comp` channel (development inspector only). */
  components: z.array(z.string()),
  /** The detail asset's course table: [stage, band, course] per `course` index (development inspector only). */
  courses: z.array(z.tuple([z.string(), z.string(), z.number().int()])),
  shells: z.array(ShellS),
  water: z.array(WaterS),
  collision: z.array(ColliderS),
  entries: z.array(z.object({ id: z.string(), a: V3, b: V3, width: z.number(), height: z.number(), main: z.boolean(), note: z.string() })),
  viewpoints: z.array(z.object({ id: z.string(), kind: z.enum(["ground", "interior", "high", "detail", "side"]), eye: V3, yaw: z.number(), pitch: z.number(), note: z.string().optional() })),
  safePoints: z.array(z.object({ id: z.string(), feet: V3, yaw: z.number() })),
  features: z.array(z.string()).min(3),
  revisions: z.array(z.object({ item: z.string(), original: z.string(), revised: z.string(), reason: z.string(), impact: z.string() })),
  bom: z.object({ path: Path }),
});
export type ManifestLandmark = z.infer<typeof LandmarkS>;

export const ManifestS = z.object({
  format: z.literal("stillwood-world/1"),
  recipeVersion: z.string(),
  seed: z.number().int(),
  generatedAt: z.string(),
  route: z.object({ length: z.number(), points: z.array(V2) }),
  /** Side routes (§4: one per region, rejoining the valley): walked on the terrain or, for "fly", a flight line. */
  sideRoutes: z.array(z.object({ id: z.string(), region: z.string(), name: z.string(), mode: z.enum(["walk", "fly"]), from: z.number(), to: z.number(), length: z.number(), points: z.array(V3), note: z.string() })).default([]),
  /** Rivers cut into the terrain (§4, §7.4): centre line with the water's height at each point, and the water's half-width. */
  rivers: z.array(z.object({ id: z.string(), points: z.array(V3), halfWidth: z.number(), note: z.string() })).default([]),
  /** Ridge/turn reveals (§4): a landmark mostly hidden from the valley at `hidden` and fully seen at `shown`. */
  reveals: z.array(z.object({ id: z.string(), landmark: z.string(), hidden: V3, shown: V3, visibleHidden: z.number(), visibleShown: z.number(), note: z.string() })).default([]),
  regions: z.array(z.object({ id: z.string(), name: z.string(), s0: z.number(), s1: z.number(), prompt: z.string() })),
  coast: z.array(V2).min(8),
  boundary: z.object({ soft: z.number().positive(), hard: z.number().positive(), ceiling: z.number(), seaFloor: z.number(), highestTop: z.number() }),
  terrain: z.object({
    chunk: z.number().positive(),
    min: V2,
    chunksX: z.number().int().positive(),
    chunksZ: z.number().int().positive(),
    /** Samples per chunk edge (grid is n + 1 square). */
    n: z.number().int().positive(),
    heightMin: z.number(),
    heightScale: z.number().positive(),
    path: Path,
    hash: Hash,
    bytes: z.number().int().positive(),
  }),
  home: z.object({ spawn: V3, yaw: z.number(), portals: z.array(z.object({ id: z.enum(["explore", "works", "together"]), label: z.string(), position: V3, yaw: z.number(), opening: V2 })) }),
  safePoints: z.array(z.object({ id: z.string(), feet: V3, yaw: z.number(), regionId: z.string() })),
  landmarks: z.array(LandmarkS).length(20),
  lighting: LightingS,
  totals: z.object({ pieces: z.number().int(), bytes: z.number().int() }),
});
export type WorldManifest = z.infer<typeof ManifestS>;

/** Parse and check the cross-references the schema can't (unique ids, version agreement). */
export function parseManifest(raw: unknown, expectedRecipeVersion?: string): WorldManifest {
  const m = ManifestS.parse(raw);
  const ids = new Set<string>();
  for (const l of m.landmarks) {
    if (ids.has(l.id)) throw new Error(`duplicate landmark ${l.id}`);
    ids.add(l.id);
    if (l.recipeVersion !== m.recipeVersion) throw new Error(`${l.id} recipe version ${l.recipeVersion} ≠ manifest ${m.recipeVersion}`);
  }
  for (let i = 1; i <= 20; i++) if (!ids.has(`L${String(i).padStart(2, "0")}`)) throw new Error(`missing L${String(i).padStart(2, "0")}`);
  const sp = new Set<string>();
  for (const s of m.safePoints) {
    if (sp.has(s.id)) throw new Error(`duplicate safe point ${s.id}`);
    sp.add(s.id);
  }
  if (expectedRecipeVersion && m.recipeVersion !== expectedRecipeVersion) throw new Error(`world assets ${m.recipeVersion}, client expects ${expectedRecipeVersion}`);
  return m;
}
