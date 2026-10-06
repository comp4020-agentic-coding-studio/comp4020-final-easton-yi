// LOOK-04: the Auto graphics controller, driven with injected timestamps
// (no real waiting), plus preset resolution and the stored-mode fallback.
import { describe, expect, it } from "vitest";
import { GRAPHICS } from "../src/shared/config.ts";
import { AutoQuality, effectivePixelRatio, type QualityTier } from "../src/client/scene/quality.ts";
import { loadQualityMode } from "../src/client/graphics-setting.ts";

const K = GRAPHICS.auto;

/** Feed frames of a fixed interval for `ms`; returns the end time and any tier changes. */
function feed(c: AutoQuality, start: number, ms: number, dt: number, deferUpgrade = false): { t: number; changes: { t: number; tier: QualityTier }[] } {
  const changes: { t: number; tier: QualityTier }[] = [];
  let t = start;
  while (t < start + ms - 1e-9) {
    t += dt;
    const r = c.frame(t, { interval: dt, deferUpgrade });
    if (r) changes.push({ t, tier: r });
  }
  return { t, changes };
}

/** Drive a fresh Auto controller down to Low with sustained slow frames. */
function atLow(): { c: AutoQuality; t: number } {
  const c = new AutoQuality();
  const r = feed(c, 0, 20_000, 50);
  expect(c.tier).toBe("low");
  return { c, t: r.t };
}

describe("Auto downgrade", () => {
  it("sustained slow frames drop one tier at a time, after warm-up and two bad windows, and stop at Low", () => {
    const c = new AutoQuality();
    expect(c.tier).toBe("high");
    const r = feed(c, 0, 30_000, 50);
    // warm-up 2 s, then two 2 s windows: the first change lands at 6 s
    expect(r.changes[0]).toEqual({ t: K.warmupMs + 2 * K.windowMs, tier: "medium" });
    // a tier change restarts warm-up and the windows
    expect(r.changes[1]).toEqual({ t: 2 * (K.warmupMs + 2 * K.windowMs), tier: "low" });
    expect(r.changes).toHaveLength(2);
    expect(c.tier).toBe("low");
  });

  it("a brief slowdown, or bad windows that aren't consecutive, don't downgrade", () => {
    const c = new AutoQuality();
    let t = feed(c, 0, 4000, 16).t; // warm-up and one good window
    t = feed(c, t, 1000, 50).t; // one second of slow frames inside a 2 s window
    let r = feed(c, t, 3000, 16);
    expect(r.changes).toEqual([]);
    // bad, good, bad: the good window clears the count
    t = feed(c, r.t, 2000, 50).t;
    t = feed(c, t, 2000, 16).t;
    r = feed(c, t, 2000, 50);
    expect(r.changes).toEqual([]);
    expect(c.tier).toBe("high");
  });

  it("a window needs at least 70% slow intervals to count as bad", () => {
    const pattern = (slowPerFast: number): QualityTier[] => {
      const c = new AutoQuality();
      let t = feed(c, 0, K.warmupMs, 16).t;
      const changes: QualityTier[] = [];
      for (let i = 0; t < K.warmupMs + 4 * K.windowMs; i++) {
        const dt = i % (slowPerFast + 1) < slowPerFast ? 40 : 10;
        const r = c.frame((t += dt), { interval: dt, deferUpgrade: false });
        if (r) changes.push(r);
      }
      return changes;
    };
    expect(pattern(2)).toEqual([]); // 67% slow
    expect(pattern(3)).toEqual(["medium"]); // 75% slow
  });

  it("real foreground stalls count, however long", () => {
    const c = new AutoQuality();
    const t = feed(c, 0, K.warmupMs, 16).t;
    const r = feed(c, t, 4 * K.windowMs, 500);
    expect(r.changes.map((x) => x.tier)).toEqual(["medium"]);
  });

  it("downgrades still happen during a drag or collapse", () => {
    const c = new AutoQuality();
    const r = feed(c, 0, 7000, 50, true);
    expect(r.changes.map((x) => x.tier)).toEqual(["medium"]);
  });

  it("short slow interactions close together add up; separated by long pauses they don't", () => {
    const runs = (pauseMs: number): QualityTier => {
      const c = new AutoQuality();
      let t = feed(c, 0, K.warmupMs, 16).t;
      for (let i = 0; i < 20; i++) {
        t += pauseMs; // idle: nothing rendered
        c.frame(t, { interval: undefined, deferUpgrade: false }); // the wake-up frame
        t = feed(c, t, 1500, 60).t;
      }
      return c.tier;
    };
    expect(runs(3000)).toBe("low");
    expect(runs(K.evidenceMaxGapMs + 2000)).toBe("high");
  });
});

describe("warm-up, idle and hidden exclusion", () => {
  it("ignores the first 2 s of measured time after entering Auto", () => {
    const c = new AutoQuality();
    expect(c.debug().warmupLeft).toBe(K.warmupMs);
    const t = feed(c, 0, K.warmupMs, 100).t; // very slow, but warming up (e.g. shader compilation)
    const r = feed(c, t, 2 * K.windowMs - 100, 16);
    expect(r.changes).toEqual([]);
    expect(c.debug().consecutiveBad).toBe(0);
  });

  it("wake-up frames measure nothing and never decide", () => {
    const { c, t } = atLow();
    let now = t;
    for (let i = 0; i < 2000; i++) expect(c.frame((now += 16), { interval: undefined, deferUpgrade: false })).toBeNull();
    expect(c.debug().goodMs).toBe(0);
    expect(c.tier).toBe("low");
  });

  it("warm-up survives pauses and is restored by returning to the tab", () => {
    const c = new AutoQuality();
    let t = feed(c, 0, 1500, 16).t;
    c.frame((t += 3000), { interval: undefined, deferUpgrade: false });
    t = feed(c, t, 500, 16).t;
    expect(c.debug().warmupLeft).toBe(0);
    c.resume(); // back from a hidden tab
    expect(c.debug()).toMatchObject({ warmupLeft: K.warmupMs, goodMs: 0, consecutiveBad: 0 });
  });
});

/**
 * One cycle (~14 s) of ordinary building: a 1.2 s orbit and its 0.9 s of
 * damping, three button presses (single frames), a 0.8 s ghost drag and 1.5 s
 * of a placed stick falling, with idle pauses of 1.5–4 s between.
 */
function ordinaryCycle(c: AutoQuality, start: number, dt: number, pauseScale = 1): { t: number; changes: QualityTier[] } {
  let t = start;
  const changes: QualityTier[] = [];
  const run = (ms: number, defer: boolean): void => {
    c.frame((t += dt), { interval: undefined, deferUpgrade: defer }); // wake-up frame
    for (let e = 0; e < ms; e += dt) {
      const r = c.frame((t += dt), { interval: dt, deferUpgrade: defer });
      if (r) changes.push(r);
    }
  };
  run(1200, true);
  run(900, false);
  t += 2500 * pauseScale;
  for (let i = 0; i < 3; i++) c.frame((t += 600), { interval: undefined, deferUpgrade: false });
  t += 1500 * pauseScale;
  run(800, true);
  run(1500, true);
  t += 4000 * pauseScale;
  return { t, changes };
}

describe("Auto recovery", () => {
  it("raises one tier after 15 s of good windows, then waits out the upgrade cooldown", () => {
    const { c, t } = atLow(); // warm-up already spent at Low
    const r = feed(c, t, 60_000, 16);
    expect(r.changes[0]!.tier).toBe("medium");
    expect(r.changes[0]!.t - t).toBeGreaterThanOrEqual(K.recoverSustainMs);
    expect(r.changes[0]!.t - t).toBeLessThan(K.recoverSustainMs + K.windowMs);
    expect(r.changes[1]!.tier).toBe("high");
    expect(r.changes[1]!.t - r.changes[0]!.t).toBeGreaterThanOrEqual(K.upgradeCooldownMs);
    expect(r.changes).toHaveLength(2);
  });

  it("ordinary short interactions are enough to recover, but not when they're far apart", () => {
    const { c, t } = atLow();
    let now = t;
    const changes: { at: number; tier: QualityTier }[] = [];
    while (now - t < 10 * 60_000) {
      const r = ordinaryCycle(c, now, 16.7);
      for (const tier of r.changes) changes.push({ at: r.t - t, tier });
      now = r.t;
    }
    expect(changes.map((x) => x.tier)).toEqual(["medium", "high"]);
    expect(changes[1]!.at).toBeLessThan(3 * 60_000);

    // the same activity with pauses over evidenceMaxGapMs never accumulates
    const far = atLow();
    now = far.t;
    const none: QualityTier[] = [];
    while (now - far.t < 10 * 60_000) {
      const r = ordinaryCycle(far.c, now, 16.7, 4);
      none.push(...r.changes);
      now = r.t;
    }
    expect(none).toEqual([]);
  });

  it("a rolling p90 above 20 ms never upgrades (so a 30 Hz-capped browser stays put)", () => {
    const { c, t } = atLow();
    let now = t;
    // 85% at 16 ms, 15% at 25 ms: p90 is 25 ms
    for (let i = 0; i < 4000; i++) {
      const dt = i % 20 < 17 ? 16 : 25;
      expect(c.frame((now += dt), { interval: dt, deferUpgrade: false })).toBeNull();
    }
    expect(feed(c, now, 60_000, 1000 / 30).changes).toEqual([]);
    expect(c.tier).toBe("low");
  });

  it("a window that isn't good resets accumulated recovery time", () => {
    const { c, t } = atLow();
    let r = feed(c, t, 10_000, 16);
    expect(r.changes).toEqual([]);
    expect(c.debug().goodMs).toBeGreaterThanOrEqual(8000);
    r = feed(c, r.t, K.windowMs, 25); // a rough window: not bad, not good
    expect(c.debug().goodMs).toBe(0);
    const after = feed(c, r.t, 60_000, 16);
    expect(after.changes[0]!.t - r.t).toBeGreaterThanOrEqual(K.recoverSustainMs);
  });

  it("evidence older than a long pause is discarded instead of upgrading later", () => {
    const { c, t } = atLow();
    let now = feed(c, t, 14_000, 16).t;
    expect(c.debug().goodMs).toBeGreaterThanOrEqual(12_000);
    now += K.evidenceMaxGapMs + 1000;
    c.frame(now, { interval: undefined, deferUpgrade: false });
    const r = feed(c, now, 60_000, 16);
    expect(r.changes[0]!.t - now).toBeGreaterThanOrEqual(K.recoverSustainMs);
  });

  it("returning to the tab discards evidence and warms up again", () => {
    const { c, t } = atLow();
    const now = feed(c, t, 14_000, 16).t;
    c.resume();
    const r = feed(c, now, 60_000, 16);
    expect(r.changes[0]!.t - now).toBeGreaterThanOrEqual(K.warmupMs + K.recoverSustainMs);
  });

  it("never goes above High or below Low", () => {
    const c = new AutoQuality();
    expect(feed(c, 0, 120_000, 8).changes).toEqual([]);
    expect(c.tier).toBe("high");
    const { c: low, t } = atLow();
    expect(feed(low, t, 60_000, 200).changes).toEqual([]);
    expect(low.tier).toBe("low");
  });
});

describe("deferred upgrades", () => {
  it("wait during a drag, camera gesture or collapse, then happen on the next measured safe frame", () => {
    const { c, t } = atLow();
    const r = feed(c, t, 25_000, 16, true);
    expect(r.changes).toEqual([]);
    expect(c.debug().goodMs).toBeGreaterThanOrEqual(K.recoverSustainMs);
    // a wake-up frame is not a measurement, so it can't upgrade even when safe
    expect(c.frame(r.t + 2000, { interval: undefined, deferUpgrade: false })).toBeNull();
    expect(c.frame(r.t + 2016, { interval: 16, deferUpgrade: false })).toBe("medium");
  });

  it("don't survive a long pause", () => {
    const { c, t } = atLow();
    const r = feed(c, t, 25_000, 16, true);
    const later = r.t + K.evidenceMaxGapMs + 1000;
    c.frame(later, { interval: undefined, deferUpgrade: false });
    expect(c.frame(later + 16, { interval: 16, deferUpgrade: false })).toBeNull();
    expect(c.debug().goodMs).toBe(0);
  });
});

describe("no oscillation", () => {
  it("an upgrade reversed by a downgrade backs off, doubling, and stops after three", () => {
    // a device that is smooth at Medium but too slow at High, used continuously for 30 minutes
    const { c, t } = atLow();
    let now = t;
    const changes: { t: number; tier: QualityTier }[] = [];
    while (now - t < 30 * 60_000) {
      const dt = c.tier === "high" ? 50 : 16;
      const r = c.frame((now += dt), { interval: dt, deferUpgrade: false });
      if (r) changes.push({ t: now, tier: r });
    }
    const ups = changes.filter((x) => x.tier === "high");
    expect(ups).toHaveLength(K.maxFailedUpgrades);
    expect(c.debug().failedUpgrades).toBe(K.maxFailedUpgrades);
    expect(c.tier).toBe("medium");
    // the gaps between attempts grow: at least 60 s, then 120 s
    const downs = changes.filter((x, i) => x.tier === "medium" && i > 0);
    expect(ups[1]!.t - downs[0]!.t).toBeGreaterThanOrEqual(K.failedUpgradeBackoffMs);
    expect(ups[2]!.t - downs[1]!.t).toBeGreaterThanOrEqual(2 * K.failedUpgradeBackoffMs);
    expect(changes.length).toBeLessThanOrEqual(2 + 2 * K.maxFailedUpgrades);
  });
});

describe("manual modes", () => {
  it("are never changed by performance, and re-entering Auto starts at High with fresh statistics", () => {
    const c = new AutoQuality();
    for (const m of ["high", "medium", "low"] as const) {
      expect(c.setMode(m)).toBe(m);
      expect(feed(c, 0, 60_000, 80).changes).toEqual([]);
      expect(feed(c, 60_000, 60_000, 8).changes).toEqual([]);
      expect(c.tier).toBe(m);
    }
    expect(c.setMode("auto")).toBe("high");
    expect(c.debug()).toEqual({ warmupLeft: K.warmupMs, consecutiveBad: 0, goodMs: 0, failedUpgrades: 0 });
  });

  it("the latest of rapid mode changes wins", () => {
    const c = new AutoQuality();
    c.setMode("low");
    c.setMode("auto");
    c.setMode("medium");
    expect(c.tier).toBe("medium");
    expect(c.frame(1, { interval: 500, deferUpgrade: false })).toBeNull();
  });
});

describe("presets and stored mode", () => {
  it("High keeps the original caps, and caps never supersample a low-DPR screen", () => {
    expect(effectivePixelRatio("high", 3, false)).toBe(2);
    expect(effectivePixelRatio("high", 3, true)).toBe(1.5); // the coarse-pointer cap stays 1.5
    expect(effectivePixelRatio("high", 1, false)).toBe(1);
    expect(effectivePixelRatio("medium", 2, false)).toBe(1.5);
    expect(effectivePixelRatio("medium", 1.25, false)).toBe(1.25);
    expect(effectivePixelRatio("low", 2, true)).toBe(1);
    expect(effectivePixelRatio("low", Number.NaN, false)).toBe(1);
    expect(GRAPHICS.tiers.high.shadowMapSize).toBe(2048);
    expect(GRAPHICS.tiers.medium.shadowMapSize).toBe(1024);
    expect(GRAPHICS.tiers.low.shadowMapSize).toBe(0);
  });

  it("only valid stored values are used; anything else, or no storage, is Auto", () => {
    const store = (v: string | null) => ({ getItem: () => v, setItem: () => undefined });
    expect(loadQualityMode(store("low"))).toBe("low");
    expect(loadQualityMode(store("medium"))).toBe("medium");
    expect(loadQualityMode(store("ultra"))).toBe("auto");
    expect(loadQualityMode(store(null))).toBe("auto");
    expect(loadQualityMode(null)).toBe("auto");
    expect(
      loadQualityMode({
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => undefined,
      }),
    ).toBe("auto");
  });
});
