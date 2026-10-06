// The graphics quality choice (LOOK-04), a per-browser preference like mute.
// Only the selected mode is stored; the tier Auto is currently using belongs
// to the live viewport, which reports it here once it has been applied.
import { useSyncExternalStore } from "react";
import { GRAPHICS } from "../shared/config.ts";
import { parseQualityMode, type QualityMode, type QualityTier } from "./scene/quality.ts";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access itself can throw when storage is blocked
  }
};

/** Missing, invalid or unavailable storage all mean Auto. */
export function loadQualityMode(storage: StorageLike | null = defaultStorage()): QualityMode {
  try {
    return parseQualityMode(storage?.getItem(GRAPHICS.storageKey)) ?? "auto";
  } catch {
    return "auto";
  }
}

export interface GraphicsState {
  mode: QualityMode;
  /** The tier the open 3D view has actually applied, or null without one. */
  applied: QualityTier | null;
}

let state: GraphicsState = { mode: loadQualityMode(), applied: null };
let appliedBy: object | null = null;
const listeners = new Set<() => void>();
const emit = (next: GraphicsState): void => {
  state = next;
  listeners.forEach((l) => l());
};

export const getGraphicsState = (): GraphicsState => state;

export const subscribeGraphics = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function setQualityMode(mode: QualityMode): void {
  try {
    defaultStorage()?.setItem(GRAPHICS.storageKey, mode);
  } catch {
    // storage may be unavailable; the choice still applies until reload
  }
  if (mode !== state.mode) emit({ ...state, mode });
}

/** Called by a viewport after it has applied a tier, so the UI never shows a merely requested one. */
export function reportAppliedTier(owner: object, tier: QualityTier | null): void {
  if (tier === null && appliedBy !== owner) return; // a disposed viewport can't clear a newer one
  appliedBy = tier === null ? null : owner;
  if (tier !== state.applied) emit({ ...state, applied: tier });
}

export const useGraphicsQuality = (): GraphicsState => useSyncExternalStore(subscribeGraphics, getGraphicsState);
