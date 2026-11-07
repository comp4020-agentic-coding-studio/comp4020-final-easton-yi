// Phone and tablet exploration layout (mobile/tablet layout brief, 2026-11-07). Pure helpers, no DOM writes:
// which control model a device gets, what the compact landmark label and its information panel show, and when a
// region change may briefly announce its observation.
//
// Control model. The touch layout is chosen by the device's *primary* input, never by width: a coarse primary
// pointer that cannot hover (a phone or tablet held in the hand). A narrow desktop window keeps the desktop
// model (its primary pointer is fine), a large touch tablet in landscape (1366 CSS px wide) gets the touch
// model, and a laptop with a touch screen whose primary input is a trackpad or mouse keeps the desktop model:
// touch capability alone (any-pointer: coarse) never switches it. A hybrid whose browser reports its primary
// pointer as coarse with no hover (some convertibles in tablet mode) gets the touch model, which is the right
// one for a hand-held screen; one that reports a fine primary pointer stays on desktop. No claim is made beyond
// what the browser reports.
//
// Text. The region observation (`regionPrompt`) and the landmark plaque (title, "World preset", inspiration)
// are shown by location, as before; signed-in or not makes no difference.

/** The media query for the touch layout: primary pointer coarse and no hover on the primary input. */
export const TOUCH_LAYOUT_QUERY = "(pointer: coarse) and (hover: none)";

type MatchMedia = (q: string) => { matches: boolean };

/** True when the browser reports a hand-held touch device as its primary input (see the file comment). */
export function prefersTouchLayout(mm: MatchMedia | undefined = typeof matchMedia === "function" ? matchMedia : undefined): boolean {
  if (!mm) return false;
  try {
    return mm(TOUCH_LAYOUT_QUERY).matches;
  } catch {
    return false;
  }
}

/** The plaque's distance limit (m): within it the landmark label is shown (the same limit the HUD used). */
export const LABEL_RANGE_M = 250;

export interface RegionInfo {
  id: string;
  name: string | null;
  prompt: string;
}

export interface LandmarkInfo {
  id: string;
  title: string;
  inspiration: string;
}

/** What the information control describes: a landmark (with its region's observation) or, with none near, the region. */
export type InfoSubject =
  | { kind: "landmark"; landmark: LandmarkInfo; region: RegionInfo }
  | { kind: "region"; region: RegionInfo };

/**
 * The subject for the current position. A landmark within LABEL_RANGE_M wins (the same rule as the plaque); else
 * the region, if it has an observation; else nothing (no empty button, no stale landmark).
 */
export function infoSubject(
  nearLandmark: { id: string; title: string; inspiration: string; distance: number } | null | undefined,
  region: RegionInfo | null | undefined,
): InfoSubject | null {
  const r: RegionInfo = region ?? { id: "", name: null, prompt: "" };
  if (nearLandmark && nearLandmark.distance < LABEL_RANGE_M && nearLandmark.title) {
    return { kind: "landmark", landmark: { id: nearLandmark.id, title: nearLandmark.title, inspiration: nearLandmark.inspiration }, region: r };
  }
  if (r.prompt) return { kind: "region", region: r };
  return null;
}

/** The resting label's text (without the information button). "Preset" keeps authored landmarks apart from player exhibits. */
export function restingLabel(s: InfoSubject): string {
  return s.kind === "landmark" ? s.landmark.title : (s.region.name ?? "About this place");
}

/** The information button's accessible name. */
export function infoButtonName(s: InfoSubject): string {
  return s.kind === "landmark" ? `About ${s.landmark.title}` : `About ${s.region.name ?? "this place"}`;
}

/** A stable key: the panel keeps showing this subject while open even if the explorer drifts to another. */
export function subjectKey(s: InfoSubject | null): string {
  if (!s) return "";
  return s.kind === "landmark" ? `l:${s.landmark.id}` : `r:${s.region.id}`;
}

/**
 * When a region change may show its observation briefly (a toast that then collapses). Standing on a boundary
 * flips the region back and forth; this gate only announces a region that has been held for `settleMs`, never
 * the same region twice within `repeatMs`, and never the starting region on entry.
 */
export class RegionAnnouncer {
  private current: string | null = null;
  private since = 0;
  private announced = new Map<string, number>();
  private readonly settleMs: number;
  private readonly repeatMs: number;
  constructor(settleMs = 1200, repeatMs = 60_000) {
    this.settleMs = settleMs;
    this.repeatMs = repeatMs;
  }

  /** Feed the region at time `now` (ms). Returns the region id to announce now, or null. */
  update(regionId: string, now: number): string | null {
    if (this.current === null) {
      // the starting region: never announced, but counts as seen
      this.current = regionId;
      this.since = now;
      this.announced.set(regionId, now);
      return null;
    }
    if (regionId !== this.current) {
      this.current = regionId;
      this.since = now;
      return null;
    }
    if (now - this.since < this.settleMs) return null;
    const last = this.announced.get(regionId);
    if (last !== undefined && now - last < this.repeatMs) return null;
    this.announced.set(regionId, now);
    return regionId;
  }

  /** Forget the starting point (a jump or a fresh start of exploring is a new entry). */
  reset(): void {
    this.current = null;
  }
}
