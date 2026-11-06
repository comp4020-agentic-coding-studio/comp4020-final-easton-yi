// How the existing graphics quality tiers (LOOK-04: Auto/High/Medium/Low)
// apply to the island. Same preference, same Auto controller; these are the
// world's presets per tier (main prompt §10's initial targets). Grass,
// shadows and clouds are reduced before routes, collision or input.
import type { QualityTier } from "../scene/quality.ts";

export interface WorldTier {
  /** Device pixel ratio ceiling (never supersampled). */
  dprCap: number;
  shadowMap: number;
  /** Grass clumps near the camera, and the radius they cover. */
  grass: number;
  grassRadius: number;
  cloudClusters: number;
  rocksPerType: number;
  /** Radial segments of the rear-shell cylinders (drums, towers): their silhouette's smoothness. */
  shellSegments: number;
  /** Full terrain resolution within this distance; coarser beyond. */
  terrainNear: number;
  /** Largest projected terrain height error (drawing-buffer pixels) a coarser chunk step may add. */
  terrainErrorPx: number;
  /** Landmark LOD distances (beyond the building's radius): near, mid, far. */
  nearDist: number;
  midDist: number;
  farDist: number;
  /** At most this many buildings at the near level (cells) at once. */
  nearCount: number;
  /**
   * Detail residency: at most this many landmarks' per-piece cells (CPU arrays
   * and GPU buffers) resident at once, and at most this many bytes of their
   * instance arrays, LRU-evicted with hysteresis. The far files of all 20 stay.
   */
  detailMax: number;
  detailBytes: number;
  /** Near-level cells: all pieces within cellFull, structural pieces within cellStruct, merged chains beyond. */
  cellFull: number;
  cellStruct: number;
  /** Whole-building merged-chain prefixes for the mid, far and silhouette levels (4 triangles each, folded); at most FAR_CHAINS (the far file). */
  midChains: number;
  farChains: number;
  silhouetteChains: number;
  fogNear: number;
  fogFar: number;
  /**
   * The home meadow's flowers: the share of the placement drawn (a deterministic, even sample, so nothing moves),
   * and the distance by which they have faded (sinking into the grass, not popping). Courtyard/day-night §5, §10.
   */
  flowerDensity: number;
  flowerFade: number;
  /** The pond's slow ripples, and the candle flames' flicker (reduced first on Low, before any navigation light). */
  pondRipples: boolean;
  flameFlicker: boolean;
}

const MIB = 1024 * 1024;

export const WORLD_QUALITY: Record<QualityTier, WorldTier> = {
  high: { dprCap: 1.5, shadowMap: 2048, grass: 40_000, grassRadius: 80, cloudClusters: 60, rocksPerType: 90, shellSegments: 20, terrainNear: 180, terrainErrorPx: 1.5, nearDist: 90, midDist: 420, farDist: 1100, nearCount: 2, detailMax: 3, detailBytes: 96 * MIB, cellFull: 55, cellStruct: 120, midChains: 6000, farChains: 3500, silhouetteChains: 1600, fogNear: 1600, fogFar: 6000, flowerDensity: 1, flowerFade: 46, pondRipples: true, flameFlicker: true },
  medium: { dprCap: 1.25, shadowMap: 1024, grass: 15_000, grassRadius: 60, cloudClusters: 40, rocksPerType: 60, shellSegments: 16, terrainNear: 140, terrainErrorPx: 2, nearDist: 75, midDist: 340, farDist: 900, nearCount: 2, detailMax: 2, detailBytes: 64 * MIB, cellFull: 40, cellStruct: 90, midChains: 6000, farChains: 2500, silhouetteChains: 1200, fogNear: 1400, fogFar: 5200, flowerDensity: 0.65, flowerFade: 38, pondRipples: true, flameFlicker: true },
  low: { dprCap: 1, shadowMap: 0, grass: 3_000, grassRadius: 40, cloudClusters: 24, rocksPerType: 36, shellSegments: 12, terrainNear: 110, terrainErrorPx: 3, nearDist: 60, midDist: 240, farDist: 600, nearCount: 1, detailMax: 2, detailBytes: 40 * MIB, cellFull: 28, cellStruct: 60, midChains: 3500, farChains: 1500, silhouetteChains: 800, fogNear: 1200, fogFar: 4600, flowerDensity: 0.38, flowerFade: 30, pondRipples: false, flameFlicker: false },
};
