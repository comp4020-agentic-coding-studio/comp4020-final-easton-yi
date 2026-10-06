// Graphics quality (LOOK-04): the selected mode, the effective tier it
// resolves to, and the Auto controller that moves between tiers. Nothing here
// touches Three.js or the DOM, so decisions can be tested with injected
// timestamps; the viewport applies whatever tier this returns.
import { GRAPHICS } from "../../shared/config.ts";

export type QualityTier = "high" | "medium" | "low";
export type QualityMode = "auto" | QualityTier;

export const QUALITY_MODES: readonly QualityMode[] = ["auto", "high", "medium", "low"];
/** Ordered lowest first, so a tier's index is its level. */
const LEVELS: readonly QualityTier[] = ["low", "medium", "high"];

export const parseQualityMode = (v: unknown): QualityMode | null => (QUALITY_MODES.includes(v as QualityMode) ? (v as QualityMode) : null);

/** The caps are ceilings: a 1× screen is never supersampled. */
export function effectivePixelRatio(tier: QualityTier, devicePixelRatio: number, coarsePointer: boolean): number {
  const t = GRAPHICS.tiers[tier];
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, coarsePointer ? t.coarsePixelRatioCap : t.pixelRatioCap);
}

export interface FrameInfo {
  /**
   * The interval since the previous frame when this frame continues an
   * animated run; undefined for the first frame after an idle gap, a restart
   * or a return to the tab, which says nothing about rendering speed.
   */
  interval?: number;
  /** A local drag, a camera gesture or moving sticks: upgrades wait. */
  deferUpgrade: boolean;
}

type Tuning = typeof GRAPHICS.auto;

/**
 * Auto: two consecutive bad windows drop one tier; consecutive good windows
 * adding up to recoverSustainMs raise one tier, with cooldowns and a growing
 * backoff so it can't oscillate. Manual modes are fixed.
 *
 * Only intervals between frames of one continuous animated run are measured
 * (camera motion, drags, moving sticks, easing ghosts). Windows are made of
 * that measured time, so short interactions add up, but a pause longer than
 * evidenceMaxGapMs, a hidden tab or a tier change discards the evidence, and
 * decisions are only taken on a measured frame.
 */
export class AutoQuality {
  mode: QualityMode = "auto";
  tier: QualityTier = "high";
  private readonly k: Tuning;

  private warmupLeft = 0;
  private lastMeasuredAt = -Infinity;
  // current window of measured time
  private winElapsed = 0;
  private winCount = 0;
  private winSlow = 0;
  private winFast = 0;
  private consecutiveBad = 0;
  private goodMs = 0;
  // upgrade bookkeeping
  private lastUpgradeAt = -Infinity;
  private upgradeBlockedUntil = -Infinity;
  private failedUpgrades = 0;
  private lastChange: "up" | "down" | null = null;

  constructor(tuning: Partial<Tuning> = {}) {
    this.k = { ...GRAPHICS.auto, ...tuning };
    this.setMode("auto");
  }

  /** Manual modes stop adaptation at once; Auto starts at High with fresh statistics. */
  setMode(mode: QualityMode): QualityTier {
    this.mode = mode;
    this.tier = mode === "auto" ? "high" : mode;
    this.lastUpgradeAt = -Infinity;
    this.upgradeBlockedUntil = -Infinity;
    this.failedUpgrades = 0;
    this.lastChange = null;
    this.restart();
    return this.tier;
  }

  /** Back from a hidden tab: warm up again and forget evidence from before. */
  resume(): void {
    this.restart();
  }

  /** Feed one rendered frame; returns the new tier when Auto decides to change it. */
  frame(now: number, f: FrameInfo): QualityTier | null {
    if (this.mode !== "auto" || f.interval === undefined) return null; // a wake-up frame measures nothing
    const dt = f.interval;
    // the interval starts at the previous frame; a long pause before it makes earlier evidence stale
    if (now - dt - this.lastMeasuredAt > this.k.evidenceMaxGapMs) this.resetEvidence();
    this.lastMeasuredAt = now;
    if (this.warmupLeft > 0) {
      this.warmupLeft -= dt; // shader compilation after a tier change lands here
      return null;
    }

    // a real stall still counts, however long
    this.winElapsed += dt;
    this.winCount++;
    if (dt > this.k.slowFrameMs) this.winSlow++;
    if (dt <= this.k.recoverP90Ms) this.winFast++;
    if (this.winElapsed >= this.k.windowMs) {
      const bad = this.winSlow >= this.k.badWindowShare * this.winCount;
      const good = this.winFast >= Math.ceil(0.9 * this.winCount); // p90 within recoverP90Ms
      this.consecutiveBad = bad ? this.consecutiveBad + 1 : 0;
      this.goodMs = good ? this.goodMs + this.winElapsed : 0;
      this.resetWindow();
      if (this.consecutiveBad >= this.k.badWindowsToDowngrade && this.tier !== "low") return this.change(now, -1);
    }

    if (this.goodMs < this.k.recoverSustainMs || this.tier === "high" || f.deferUpgrade) return null;
    return this.canUpgrade(now) ? this.change(now, 1) : null;
  }

  /** Test and instrumentation view; not used for decisions. */
  debug(): { warmupLeft: number; consecutiveBad: number; goodMs: number; failedUpgrades: number } {
    return { warmupLeft: Math.max(0, this.warmupLeft), consecutiveBad: this.consecutiveBad, goodMs: this.goodMs, failedUpgrades: this.failedUpgrades };
  }

  private canUpgrade(now: number): boolean {
    return this.failedUpgrades < this.k.maxFailedUpgrades && now - this.lastUpgradeAt >= this.k.upgradeCooldownMs && now >= this.upgradeBlockedUntil;
  }

  private change(now: number, dir: 1 | -1): QualityTier {
    const level = Math.max(0, Math.min(LEVELS.length - 1, LEVELS.indexOf(this.tier) + dir));
    this.tier = LEVELS[level]!;
    if (dir > 0) {
      this.lastUpgradeAt = now;
      this.lastChange = "up";
    } else {
      // the normal downgrade rule reversed an upgrade: back off, longer each time, then stop trying
      if (this.lastChange === "up") {
        this.failedUpgrades++;
        this.upgradeBlockedUntil = now + this.k.failedUpgradeBackoffMs * 2 ** (this.failedUpgrades - 1);
      }
      this.lastChange = "down";
    }
    this.restart();
    return this.tier;
  }

  private restart(): void {
    this.warmupLeft = this.k.warmupMs;
    this.resetEvidence();
  }

  private resetEvidence(): void {
    this.resetWindow();
    this.consecutiveBad = 0;
    this.goodMs = 0;
  }

  private resetWindow(): void {
    this.winElapsed = 0;
    this.winCount = 0;
    this.winSlow = 0;
    this.winFast = 0;
  }
}
