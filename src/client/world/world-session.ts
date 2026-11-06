// Lightweight world state kept between pages (interaction brief §3, §6): the
// selected speed preset (per browser, like the graphics setting) and where the
// explorer left the island (per tab), so "Return to world" can bring them back
// to the same route, position, heading and speed. Only these few numbers are
// kept; the renderer is disposed on leaving as before. Every read is validated.
import { isSpeedMode, type SpeedMode } from "../../world/flight.ts";
import type { WorldPose } from "./WorldView.ts";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const SPEED_KEY = "stillwood.worldSpeed.v1";
export const RETURN_KEY = "stillwood.worldReturn.v1";
/** First entry starts at Run (the brief's default). */
export const DEFAULT_SPEED: SpeedMode = "run";
/** A remembered exit older than this is ignored (the island is entered afresh from home). */
export const RETURN_TTL_MS = 12 * 60 * 60 * 1000;
/** Larger than the island (its coast lies within about ±1.6 km): beyond this a stored pose is corrupt. */
const POSE_LIMIT = 10_000;

export type WorldRoute = "/" | "/world/";

export interface WorldReturn {
  /** The page the island was on: the home page's embedded world or the standalone /world/. */
  route: WorldRoute;
  pose: WorldPose;
  /** When the explorer left (ms since the epoch). */
  at: number;
}

const store = (kind: "localStorage" | "sessionStorage"): StorageLike | null => {
  try {
    return (globalThis as unknown as Record<string, StorageLike | undefined>)[kind] ?? null;
  } catch {
    return null; // access itself throws when storage is blocked
  }
};

/** The remembered speed preset; missing, invalid or unavailable storage means Run. */
export function loadSpeed(storage: StorageLike | null = store("localStorage")): SpeedMode {
  try {
    const v = storage?.getItem(SPEED_KEY);
    return isSpeedMode(v) ? v : DEFAULT_SPEED;
  } catch {
    return DEFAULT_SPEED;
  }
}

export function saveSpeed(mode: SpeedMode, storage: StorageLike | null = store("localStorage")): void {
  if (!isSpeedMode(mode)) return;
  try {
    storage?.setItem(SPEED_KEY, mode);
  } catch {
    // storage unavailable: the choice still applies until the page closes
  }
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function parsePose(v: unknown): WorldPose | null {
  const p = v as { feet?: unknown; yaw?: unknown; pitch?: unknown } | null;
  if (!p || typeof p !== "object" || !Array.isArray(p.feet) || p.feet.length !== 3) return null;
  if (!p.feet.every((n) => finite(n) && Math.abs(n) <= POSE_LIMIT)) return null;
  if (!finite(p.yaw) || !finite(p.pitch) || Math.abs(p.yaw) > 1000 || Math.abs(p.pitch) > 2) return null;
  return { feet: [p.feet[0] as number, p.feet[1] as number, p.feet[2] as number], yaw: p.yaw, pitch: p.pitch };
}

export function saveReturn(r: WorldReturn, storage: StorageLike | null = store("sessionStorage")): void {
  if (!parsePose(r.pose) || (r.route !== "/" && r.route !== "/world/")) return;
  try {
    storage?.setItem(RETURN_KEY, JSON.stringify({ route: r.route, pose: r.pose, at: r.at }));
  } catch {
    // storage unavailable: Return to world simply isn't offered
  }
}

/** Where the explorer left the island in this tab, if it's recent and well formed. */
export function loadReturn(storage: StorageLike | null = store("sessionStorage"), now = Date.now()): WorldReturn | null {
  try {
    const raw = storage?.getItem(RETURN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { route?: unknown; pose?: unknown; at?: unknown };
    const pose = parsePose(v.pose);
    if (!pose || (v.route !== "/" && v.route !== "/world/") || !finite(v.at)) return null;
    if (v.at > now + 60_000 || now - v.at > RETURN_TTL_MS) return null;
    return { route: v.route, pose, at: v.at };
  } catch {
    return null;
  }
}

export function clearReturn(storage: StorageLike | null = store("sessionStorage")): void {
  try {
    storage?.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
}
