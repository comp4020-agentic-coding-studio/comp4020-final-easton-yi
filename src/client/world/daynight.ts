// Day and night on the island (courtyard/day-night directive §6–§7,
// 2026-11-06). Pure: no DOM and no three.js, so the schedule, the stored
// preference and the blended environment are unit-tested with an injected
// clock (tests/world-daynight.test.ts). WorldView owns one EnvironmentState
// and applies its parameters to the scene (lighting.ts); nothing here
// allocates lights or touches the world's assets.
//
// The viewing preference is local: it never reaches the server, other
// collaborators, physics or works.

export type LightMode = "auto" | "day" | "night";
export const LIGHT_MODES: readonly LightMode[] = ["auto", "day", "night"];
export const LIGHT_KEY = "stillwood.worldLight.v1";
export const isLightMode = (v: unknown): v is LightMode => LIGHT_MODES.includes(v as LightMode);

/**
 * The artistic schedule (device-local time, hours). Not astronomical: the island has no latitude. Auto blends
 * across the two transitions and holds day or night between them.
 *
 *   06:00–08:00 dawn · 08:00–17:00 day · 17:00–19:00 dusk · 19:00–06:00 night
 */
export const SCHEDULE = Object.freeze({ dawnStart: 6, dawnEnd: 8, duskStart: 17, duskEnd: 19 });
/** A manual change blends over this long (s); with reduced motion, this long. */
export const BLEND_S = 4;
export const BLEND_REDUCED_S = 0.25;
/** How often Auto looks at the clock while the page is visible (ms): the transitions take two hours. */
export const AUTO_CHECK_MS = 60_000;

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Minutes since local midnight (seconds included). */
export const minutesOf = (d: Date): number => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

/** How much of the night (0 day … 1 night) the schedule gives at this local time. */
export function scheduledNight(d: Date): number {
  const m = minutesOf(d);
  const s = SCHEDULE;
  if (m < s.dawnStart * 60) return 1;
  if (m < s.dawnEnd * 60) return 1 - smooth((m - s.dawnStart * 60) / ((s.dawnEnd - s.dawnStart) * 60));
  if (m < s.duskStart * 60) return 0;
  if (m < s.duskEnd * 60) return smooth((m - s.duskStart * 60) / ((s.duskEnd - s.duskStart) * 60));
  return 1;
}

/** The named phase at a local time: what Auto calls it. */
export function scheduledPhase(d: Date): "dawn" | "day" | "dusk" | "night" {
  const m = minutesOf(d);
  const s = SCHEDULE;
  if (m >= s.dawnStart * 60 && m < s.dawnEnd * 60) return "dawn";
  if (m >= s.dawnEnd * 60 && m < s.duskStart * 60) return "day";
  if (m >= s.duskStart * 60 && m < s.duskEnd * 60) return "dusk";
  return "night";
}

export function targetNight(mode: LightMode, d: Date): number {
  return mode === "day" ? 0 : mode === "night" ? 1 : scheduledNight(d);
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const local = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** The remembered mode; missing, invalid or unavailable storage means Auto. */
export function loadLightMode(storage: StorageLike | null = local()): LightMode {
  try {
    const v = storage?.getItem(LIGHT_KEY);
    return isLightMode(v) ? v : "auto";
  } catch {
    return "auto";
  }
}
export function saveLightMode(mode: LightMode, storage: StorageLike | null = local()): void {
  if (!isLightMode(mode)) return;
  try {
    storage?.setItem(LIGHT_KEY, mode);
  } catch {
    // unavailable: the choice applies until the page closes
  }
}

// ---------------------------------------------------------------- the blended environment

export type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Three-key blend day → twilight → night by n (twilight at n = 0.5). */
const tri = (day: RGB, tw: RGB, night: RGB, n: number): RGB => (n < 0.5 ? mix(day, tw, smooth(n / 0.5)) : mix(tw, night, smooth((n - 0.5) / 0.5)));
const triN = (day: number, tw: number, night: number, n: number): number => (n < 0.5 ? lerp(day, tw, smooth(n / 0.5)) : lerp(tw, night, smooth((n - 0.5) / 0.5)));

/** The day sun's direction (toward the sun), unchanged from the original island. */
export const SUN_DIR: readonly [number, number, number] = norm([-0.45, 0.62, -0.64]);
/**
 * The moon: a fixed world direction, 30° to the right of the home view and 19° up, so from the spawn it hangs in
 * the upper right of the frame, clear of the skyline's towers (6° up at most from home) and of the gateways.
 */
export const MOON_DIR: readonly [number, number, number] = norm([0.755, 0.326, 0.569]);

function norm(v: readonly number[]): [number, number, number] {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}

export interface EnvParams {
  /** 0 day … 1 night. */
  night: number;
  /** 0 … 1, strongest mid-transition (dawn or dusk). */
  twilight: number;
  /** The key light: one shadowed directional light, the sun by day and the moon by night (never both). */
  key: { dir: [number, number, number]; color: RGB; intensity: number; moon: boolean };
  hemi: { sky: RGB; ground: RGB; intensity: number };
  fog: RGB;
  exposure: number;
  /** The Sky shader's sun (below the horizon at night) and the night overlay's strength. */
  skySun: [number, number, number];
  skyNight: number;
  clouds: { tint: RGB; alpha: number };
  /** Portal membranes and lettering: their light level (unlit materials follow the scene). */
  portal: number;
  /** Candle flames, glow and light, 0 off … 1 full. Cups are always there. */
  candles: number;
  /** The stage's CSS background before the first frame and behind loading (sRGB hex). */
  css: string;
}

const C = {
  hemiSky: [hex("#dbe9f2"), hex("#e3c3ad"), hex("#7387b4")] as const,
  hemiGround: [hex("#6b6a4c"), hex("#5b4b42"), hex("#2e3340")] as const,
  fog: [hex("#c9d9df"), hex("#c6aea4"), hex("#1d2635")] as const,
  css: [hex("#9cc3d8"), hex("#b99b95"), hex("#141c2b")] as const,
  sun: [hex("#fff1dc"), hex("#ffb47a")] as const,
  moon: hex("#aebfe6"),
  clouds: [hex("#ffffff"), hex("#f2c9b0"), hex("#3a4560")] as const,
};

/**
 * Every environment parameter for a night amount n. Dawn and dusk share the same blend: the sun lowers toward the
 * horizon and dims to nothing at n = 0.5, where the key light changes over to the moon (its direction never
 * sweeps across the sky while it is bright), and the moon then rises in strength. Twilight is carried by the
 * warmer hemisphere and fog.
 */
export function envParams(n: number): EnvParams {
  const night = Math.max(0, Math.min(1, n));
  const twilight = Math.sin(Math.PI * night) ** 2;
  let key: EnvParams["key"];
  if (night < 0.5) {
    const t = night / 0.5;
    // lower the sun from its day elevation (≈ 38°) toward 3° as it dims, keeping its azimuth
    const el0 = Math.asin(SUN_DIR[1]);
    const el = lerp(el0, (3 * Math.PI) / 180, smooth(t));
    const h = Math.hypot(SUN_DIR[0], SUN_DIR[2]);
    const dir: [number, number, number] = [(SUN_DIR[0] / h) * Math.cos(el), Math.sin(el), (SUN_DIR[2] / h) * Math.cos(el)];
    key = { dir, color: mix(C.sun[0], C.sun[1], smooth(t)), intensity: 2.4 * (1 - smooth(t)) ** 1.15, moon: false };
  } else {
    const t = (night - 0.5) / 0.5;
    key = { dir: [...MOON_DIR], color: C.moon, intensity: 1.3 * smooth(t), moon: true };
  }
  const skySun: [number, number, number] = night < 0.5 ? key.dir : (() => {
    // the scattering sun sinks below the horizon behind the scene: the Sky shader darkens with it
    const t = (night - 0.5) / 0.5;
    const el = lerp((3 * Math.PI) / 180, (-14 * Math.PI) / 180, smooth(t));
    const h = Math.hypot(SUN_DIR[0], SUN_DIR[2]);
    return [(SUN_DIR[0] / h) * Math.cos(el), Math.sin(el), (SUN_DIR[2] / h) * Math.cos(el)];
  })();
  const cssRgb = tri(C.css[0], C.css[1], C.css[2], night);
  return {
    night,
    twilight,
    key,
    hemi: { sky: tri(C.hemiSky[0], C.hemiSky[1], C.hemiSky[2], night), ground: tri(C.hemiGround[0], C.hemiGround[1], C.hemiGround[2], night), intensity: triN(0.85, 0.62, 1.05, night) },
    fog: tri(C.fog[0], C.fog[1], C.fog[2], night),
    exposure: triN(0.92, 0.96, 1.15, night),
    skySun,
    skyNight: smooth((night - 0.35) / 0.55),
    clouds: { tint: tri(C.clouds[0], C.clouds[1], C.clouds[2], night), alpha: triN(1, 0.95, 0.62, night) },
    portal: triN(1, 0.85, 0.5, night),
    candles: smooth((night - 0.3) / 0.45),
    css: `#${cssRgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`,
  };
}

// ---------------------------------------------------------------- the one authoritative state

export interface EnvironmentStatus {
  mode: LightMode;
  /** What is shown now (0 day … 1 night), and where it is heading. */
  night: number;
  target: number;
  /** The phase's name for the UI: Auto's scheduled phase, or the fixed mode. */
  phase: "dawn" | "day" | "dusk" | "night";
  blending: boolean;
}

/**
 * One environment for one world view. `step()` advances a blend inside the view's existing frame loop (true while
 * it is still changing, so the loop keeps framing); `refresh()` re-reads the clock (Auto's low-frequency check and
 * a return to the tab) and snaps rather than replaying a missed transition.
 */
export class EnvironmentState {
  mode: LightMode;
  private clock: () => Date;
  night: number;
  private from = 0;
  private to = 0;
  private t0 = 0;
  private dur = 0;
  private blendingNow = false;
  reducedMotion = false;

  constructor(mode: LightMode, clock: () => Date = () => new Date()) {
    this.mode = isLightMode(mode) ? mode : "auto";
    this.clock = clock;
    // the first frame already shows the right environment: no daytime flash at night
    this.night = targetNight(this.mode, this.clock());
    this.to = this.night;
  }

  /** Choose a mode: blends over BLEND_S (BLEND_REDUCED_S with reduced motion). Returns true when anything changes. */
  setMode(mode: LightMode, now: number): boolean {
    if (!isLightMode(mode)) return false;
    this.mode = mode;
    return this.blendTo(targetNight(mode, this.clock()), now, this.reducedMotion ? BLEND_REDUCED_S : BLEND_S);
  }

  /** Re-read the clock. A small drift (Auto inside a transition) follows at once; a jump (a tab returning) snaps. */
  refresh(now: number, snap = false): boolean {
    const target = targetNight(this.mode, this.clock());
    if (snap) {
      const changed = Math.abs(target - this.night) > 1e-4 || this.blendingNow;
      this.night = this.to = target;
      this.blendingNow = false;
      return changed;
    }
    if (Math.abs(target - this.to) < 1e-4) return false;
    if (this.blendingNow) {
      // a manual blend in progress keeps going; its end follows the clock
      this.to = target;
      return true;
    }
    this.night = this.to = target;
    return true;
  }

  private blendTo(target: number, now: number, seconds: number): boolean {
    if (Math.abs(target - this.night) < 1e-4 && !this.blendingNow) {
      this.to = target;
      return false;
    }
    this.from = this.night;
    this.to = target;
    this.t0 = now;
    this.dur = seconds * 1000;
    this.blendingNow = true;
    return true;
  }

  /** Advance a blend; true while it is still changing. */
  step(now: number): boolean {
    if (!this.blendingNow) return false;
    const t = this.dur > 0 ? (now - this.t0) / this.dur : 1;
    if (t >= 1) {
      this.night = this.to;
      this.blendingNow = false;
      return true; // one last frame at the target
    }
    this.night = this.from + (this.to - this.from) * smooth(Math.max(0, t));
    return true;
  }

  get blending(): boolean {
    return this.blendingNow;
  }

  /** Swap the clock (tests and the review probe); the environment snaps to it. */
  setClock(clock: () => Date, now: number): void {
    this.clock = clock;
    this.refresh(now, true);
  }

  status(): EnvironmentStatus {
    const phase = this.mode === "auto" ? scheduledPhase(this.clock()) : this.mode;
    return { mode: this.mode, night: this.night, target: this.to, phase, blending: this.blendingNow };
  }
}
