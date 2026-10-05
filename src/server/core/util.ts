import { createHash } from "node:crypto";

export class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly rate: number;
  private readonly burst: number;
  constructor(rate: number, burst: number) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.last = Date.now();
  }
  take(now = Date.now()): { ok: boolean; retryAfterMs: number } {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { ok: true, retryAfterMs: 0 };
    }
    return { ok: false, retryAfterMs: Math.ceil(((1 - this.tokens) / this.rate) * 1000) };
  }
}

/** Stable JSON (sorted keys) so equal requests hash equally. */
export const stableJson = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
};

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Round for the wire: 4 decimals is 0.0001 u, far below anything visible. */
export const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
