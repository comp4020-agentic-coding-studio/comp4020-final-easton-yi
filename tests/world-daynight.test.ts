// Day and night (courtyard/day-night directive §6–§7): the schedule's
// boundaries and midnight, the stored preference, the first frame at night
// (no daytime flash), manual blends and reduced motion, Auto's clock checks and
// the tab-return snap, and the environment the blend produces (one key light,
// the moon's fixed direction, candles only after dusk). Every case runs on an
// injected clock: the OS clock is never touched.
import { describe, expect, it } from "vitest";
import {
  AUTO_CHECK_MS,
  BLEND_REDUCED_S,
  BLEND_S,
  EnvironmentState,
  LIGHT_KEY,
  MOON_DIR,
  SUN_DIR,
  envParams,
  loadLightMode,
  saveLightMode,
  scheduledNight,
  scheduledPhase,
  targetNight,
} from "../src/client/world/daynight.ts";

/** A local date on a fixed day at h:m:s (device-local, as Auto reads it). */
const at = (h: number, m = 0, s = 0): Date => new Date(2026, 10, 7, h, m, s);
const fixed = (d: Date) => () => d;

function memoryStorage(initial: Record<string, string> = {}): Storage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k]! : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: () => null,
    get length() {
      return Object.keys(data).length;
    },
  };
}

describe("schedule", () => {
  it("names the four phases at their boundaries: 06 dawn, 08 day, 17 dusk, 19 night", () => {
    expect(scheduledPhase(at(5, 59, 59))).toBe("night");
    expect(scheduledPhase(at(6))).toBe("dawn");
    expect(scheduledPhase(at(7, 59, 59))).toBe("dawn");
    expect(scheduledPhase(at(8))).toBe("day");
    expect(scheduledPhase(at(16, 59, 59))).toBe("day");
    expect(scheduledPhase(at(17))).toBe("dusk");
    expect(scheduledPhase(at(18, 59, 59))).toBe("dusk");
    expect(scheduledPhase(at(19))).toBe("night");
  });

  it("is full night across midnight and full day through the day", () => {
    for (const d of [at(19), at(23, 59, 59), at(0), at(0, 0, 1), at(3, 30), at(5, 59)]) expect(scheduledNight(d), d.toTimeString()).toBe(1);
    for (const d of [at(8), at(12), at(16, 59)]) expect(scheduledNight(d), d.toTimeString()).toBe(0);
  });

  it("blends continuously and monotonically through dawn and dusk, half way at their middle", () => {
    expect(scheduledNight(at(7))).toBeCloseTo(0.5, 6);
    expect(scheduledNight(at(18))).toBeCloseTo(0.5, 6);
    let prev = scheduledNight(at(6));
    for (let m = 1; m <= 120; m++) {
      const n = scheduledNight(at(6, m));
      expect(n).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - n).toBeLessThan(0.02); // no jump: two hours, eased
      prev = n;
    }
    prev = scheduledNight(at(17));
    for (let m = 1; m <= 120; m++) {
      const n = scheduledNight(at(17, m));
      expect(n).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(n - prev).toBeLessThan(0.02);
      prev = n;
    }
    // the ends meet the held values without a step
    expect(scheduledNight(at(5, 59, 59))).toBe(1);
    expect(scheduledNight(at(6))).toBeCloseTo(1, 6);
    expect(scheduledNight(at(8))).toBe(0);
    expect(scheduledNight(at(19))).toBe(1);
  });

  it("Day and Night override the clock; Auto follows it", () => {
    expect(targetNight("day", at(23))).toBe(0);
    expect(targetNight("night", at(12))).toBe(1);
    expect(targetNight("auto", at(12))).toBe(0);
    expect(targetNight("auto", at(23))).toBe(1);
  });
});

describe("the stored preference", () => {
  it("round-trips each mode under its own key", () => {
    const st = memoryStorage();
    for (const m of ["auto", "day", "night"] as const) {
      saveLightMode(m, st);
      expect(st.data[LIGHT_KEY]).toBe(m);
      expect(loadLightMode(st)).toBe(m);
    }
  });

  it("falls back to Auto when missing, invalid or unavailable, and never throws", () => {
    expect(loadLightMode(memoryStorage())).toBe("auto");
    expect(loadLightMode(memoryStorage({ [LIGHT_KEY]: "dusk" }))).toBe("auto");
    expect(loadLightMode(null)).toBe("auto");
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadLightMode(throwing)).toBe("auto");
    expect(() => saveLightMode("night", throwing)).not.toThrow();
    // an invalid value is never written
    const st = memoryStorage();
    saveLightMode("noon" as never, st);
    expect(st.data[LIGHT_KEY]).toBeUndefined();
  });
});

describe("one authoritative environment", () => {
  it("starts at the right environment on the first frame: a night load is night, with no blend from day", () => {
    const e = new EnvironmentState("auto", fixed(at(23, 15)));
    expect(e.night).toBe(1);
    expect(e.blending).toBe(false);
    expect(e.step(0)).toBe(false);
    expect(new EnvironmentState("night", fixed(at(12))).night).toBe(1);
    expect(new EnvironmentState("day", fixed(at(2))).night).toBe(0);
    // an invalid stored mode is Auto
    expect(new EnvironmentState("x" as never, fixed(at(2))).mode).toBe("auto");
  });

  it(`a manual change blends over ${BLEND_S} s (within the directive's 3–5 s), eased and without overshoot`, () => {
    expect(BLEND_S).toBeGreaterThanOrEqual(3);
    expect(BLEND_S).toBeLessThanOrEqual(5);
    const e = new EnvironmentState("day", fixed(at(12)));
    expect(e.setMode("night", 1000)).toBe(true);
    expect(e.blending).toBe(true);
    let prev = e.night;
    const seen: number[] = [];
    for (let t = 1000; t <= 1000 + BLEND_S * 1000; t += 100) {
      expect(e.step(t)).toBe(true);
      expect(e.night).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(e.night).toBeLessThanOrEqual(1);
      prev = e.night;
      seen.push(e.night);
    }
    expect(seen[Math.floor(seen.length / 2)]).toBeGreaterThan(0.3);
    expect(seen[Math.floor(seen.length / 2)]).toBeLessThan(0.7);
    expect(e.night).toBe(1);
    expect(e.blending).toBe(false);
    expect(e.step(1000 + BLEND_S * 1000 + 100)).toBe(false); // the frame loop can rest
    expect(e.status()).toMatchObject({ mode: "night", phase: "night", night: 1, target: 1, blending: false });
  });

  it("reduced motion shortens the blend to a near-instant change", () => {
    expect(BLEND_REDUCED_S).toBeLessThan(0.5);
    const e = new EnvironmentState("day", fixed(at(12)));
    e.reducedMotion = true;
    e.setMode("night", 0);
    e.step(BLEND_REDUCED_S * 1000);
    expect(e.night).toBe(1);
    expect(e.blending).toBe(false);
  });

  it("choosing the mode already shown changes nothing; reversing mid-blend continues from where it is", () => {
    const e = new EnvironmentState("day", fixed(at(12)));
    expect(e.setMode("day", 0)).toBe(false);
    expect(e.blending).toBe(false);
    e.setMode("night", 0);
    e.step(2000);
    const mid = e.night;
    expect(mid).toBeGreaterThan(0.2);
    e.setMode("day", 2000);
    e.step(2000);
    expect(e.night).toBeCloseTo(mid, 9); // no jump back to either end
    e.step(2000 + BLEND_S * 1000);
    expect(e.night).toBe(0);
  });

  it("Auto checks the clock at a low frequency and follows a transition in progress", () => {
    expect(AUTO_CHECK_MS).toBeGreaterThanOrEqual(30_000);
    let now = at(17, 30);
    const e = new EnvironmentState("auto", () => now);
    const n0 = e.night;
    expect(n0).toBeGreaterThan(0);
    expect(n0).toBeLessThan(0.5);
    now = at(17, 31);
    expect(e.refresh(60_000)).toBe(true);
    expect(e.night).toBeGreaterThan(n0);
    expect(e.status().phase).toBe("dusk");
    // held day: nothing to do
    now = at(12);
    e.refresh(120_000, true);
    now = at(12, 1);
    expect(e.refresh(180_000)).toBe(false);
  });

  it("a tab returning after hours snaps to the clock instead of replaying the missed transition", () => {
    let now = at(16, 0);
    const e = new EnvironmentState("auto", () => now);
    expect(e.night).toBe(0);
    now = at(21, 30);
    expect(e.refresh(5 * 3600_000, true)).toBe(true);
    expect(e.night).toBe(1);
    expect(e.blending).toBe(false);
  });

  it("setClock swaps the injected clock and snaps", () => {
    const e = new EnvironmentState("auto", fixed(at(12)));
    e.setClock(fixed(at(2)), 0);
    expect(e.night).toBe(1);
    expect(e.status().phase).toBe("night");
    e.setClock(fixed(at(18)), 0);
    expect(e.night).toBeCloseTo(0.5, 6);
    expect(e.status().phase).toBe("dusk");
  });
});

describe("the blended environment", () => {
  it("has one key light: the sun by day, the moon by night, swapping at mid-twilight when both are dark", () => {
    const day = envParams(0);
    const night = envParams(1);
    expect(day.key.moon).toBe(false);
    expect(night.key.moon).toBe(true);
    expect(day.key.dir.map((v) => +v.toFixed(6))).toEqual(SUN_DIR.map((v) => +v.toFixed(6)));
    expect(night.key.dir).toEqual([...MOON_DIR]);
    // the change-over happens with the key light (nearly) off: no visible jump of shadows
    expect(envParams(0.4999).key.intensity).toBeLessThan(0.02);
    expect(envParams(0.5001).key.intensity).toBeLessThan(0.02);
  });

  it("keeps the moon fixed and upper right of the home view, above the horizon", () => {
    expect(Math.hypot(...MOON_DIR)).toBeCloseTo(1, 9);
    expect(MOON_DIR[1]).toBeGreaterThan(0.25); // well above the skyline (≈ 19°)
    for (const n of [0.6, 0.8, 1]) expect(envParams(n).key.dir).toEqual([...MOON_DIR]);
    // cool moonlight: blue above red
    const c = envParams(1).key.color;
    expect(c[2]).toBeGreaterThan(c[0]);
  });

  it("night is cool and lit, not crushed: the hemisphere fill stays up and the exposure doesn't drop", () => {
    const n = envParams(1);
    expect(n.hemi.intensity).toBeGreaterThan(0.8);
    expect(n.hemi.sky[2]).toBeGreaterThan(n.hemi.sky[0]);
    expect(Math.max(...n.hemi.sky)).toBeGreaterThan(0.5);
    expect(n.exposure).toBeGreaterThanOrEqual(envParams(0).exposure);
  });

  it("candle flames are off by day and through early dusk, full at night, monotone between", () => {
    expect(envParams(0).candles).toBe(0);
    expect(envParams(0.3).candles).toBe(0);
    expect(envParams(1).candles).toBe(1);
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const c = envParams(i / 100).candles;
      expect(c).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = c;
    }
  });

  it("is continuous in every parameter (no flash anywhere along the blend)", () => {
    const flat = (n: number): number[] => {
      const p = envParams(n);
      return [...p.hemi.sky, ...p.hemi.ground, p.hemi.intensity, ...p.fog, p.exposure, p.skyNight, ...p.clouds.tint, p.clouds.alpha, p.portal, p.candles, p.key.intensity, ...p.key.color.map((v) => v * p.key.intensity)];
    };
    let prev = flat(0);
    for (let i = 1; i <= 400; i++) {
      const cur = flat(i / 400);
      for (let k = 0; k < cur.length; k++) expect(Math.abs(cur[k]! - prev[k]!), `param ${k} at ${i / 400}`).toBeLessThan(0.06);
      prev = cur;
    }
  });

  it("gives the stage's CSS background for the first paint as a hex colour, dark at night", () => {
    expect(envParams(0).css).toMatch(/^#[0-9a-f]{6}$/);
    const lum = (h: string): number => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(envParams(1).css)).toBeLessThan(lum(envParams(0).css) / 3);
  });
});
