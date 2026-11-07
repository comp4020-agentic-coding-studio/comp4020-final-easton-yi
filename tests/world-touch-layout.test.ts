// Phone/tablet layout helpers (mobile/tablet layout brief, 2026-11-07): the control model follows the primary
// input, never width; the compact label and its information panel describe the actual landmark (or the region
// when none is near), never stale content; a region change is announced once, not repeatedly at a boundary.
import { describe, expect, it } from "vitest";
import { LABEL_RANGE_M, RegionAnnouncer, TOUCH_LAYOUT_QUERY, infoButtonName, infoSubject, prefersTouchLayout, restingLabel, subjectKey } from "../src/client/world/touch-layout.ts";

/** A matchMedia stand-in that evaluates the two features the layout depends on. */
const media = (f: { pointer: "fine" | "coarse"; hover: "hover" | "none"; anyPointerCoarse?: boolean; width?: number }) => (q: string) => {
  const has = (feat: string): boolean => {
    if (feat === "(pointer: coarse)") return f.pointer === "coarse";
    if (feat === "(pointer: fine)") return f.pointer === "fine";
    if (feat === "(hover: none)") return f.hover === "none";
    if (feat === "(hover: hover)") return f.hover === "hover";
    if (feat === "(any-pointer: coarse)") return !!f.anyPointerCoarse;
    const m = /\(max-width: (\d+)px\)/.exec(feat);
    if (m) return (f.width ?? 1920) <= Number(m[1]);
    throw new Error(`unexpected media feature ${feat}`);
  };
  return { matches: q.split(" and ").every((part) => has(part.trim())) };
};

describe("which control model a device gets", () => {
  it("the query is capability-based (primary pointer and hover) with no width feature", () => {
    expect(TOUCH_LAYOUT_QUERY).toBe("(pointer: coarse) and (hover: none)");
    expect(TOUCH_LAYOUT_QUERY).not.toMatch(/width|height/);
  });
  it("a phone or tablet (coarse primary pointer, no hover) gets the touch layout, at any width", () => {
    for (const width of [360, 390, 844, 1024, 1366]) expect(prefersTouchLayout(media({ pointer: "coarse", hover: "none", width })), `${width}`).toBe(true);
  });
  it("a narrow desktop window keeps the desktop model", () => {
    expect(prefersTouchLayout(media({ pointer: "fine", hover: "hover", width: 390 }))).toBe(false);
  });
  it("a laptop with a touch screen but a trackpad as primary input keeps the desktop model (touch alone never switches)", () => {
    expect(prefersTouchLayout(media({ pointer: "fine", hover: "hover", anyPointerCoarse: true }))).toBe(false);
  });
  it("an ambiguous report (coarse but able to hover, e.g. some TV/stylus setups) keeps the desktop model", () => {
    expect(prefersTouchLayout(media({ pointer: "coarse", hover: "hover" }))).toBe(false);
  });
  it("no matchMedia, or one that throws, keeps the desktop model", () => {
    expect(prefersTouchLayout(undefined)).toBe(false);
    expect(prefersTouchLayout(() => {
      throw new Error("blocked");
    })).toBe(false);
  });
});

const REGION_A = { id: "A", name: "Origins Meadow", prompt: "Beams cross between columns" };
const LOTUS = { id: "L02", title: "Lotus Column Forest", inspiration: "the Karnak hypostyle hall", distance: 40 };

describe("the compact label and its information subject", () => {
  it("a landmark within range is the subject, with its region's observation kept", () => {
    const s = infoSubject(LOTUS, REGION_A)!;
    expect(s.kind).toBe("landmark");
    expect(restingLabel(s)).toBe("Lotus Column Forest");
    expect(infoButtonName(s)).toBe("About Lotus Column Forest");
    expect(s.kind === "landmark" && s.landmark.inspiration).toBe("the Karnak hypostyle hall");
    expect(s.region.prompt).toBe("Beams cross between columns");
  });
  it("the label uses the actual title for every landmark, not an example", () => {
    const s = infoSubject({ ...LOTUS, id: "L14", title: "Four-Leg Wind Tower" }, REGION_A)!;
    expect(restingLabel(s)).toBe("Four-Leg Wind Tower");
    expect(infoButtonName(s)).toBe("About Four-Leg Wind Tower");
  });
  it("beyond the plaque's range the region is the subject (no stale landmark)", () => {
    const s = infoSubject({ ...LOTUS, distance: LABEL_RANGE_M + 1 }, REGION_A)!;
    expect(s.kind).toBe("region");
    expect(restingLabel(s)).toBe("Origins Meadow");
    expect(infoButtonName(s)).toBe("About Origins Meadow");
  });
  it("no landmark and no region observation: nothing (no empty button)", () => {
    expect(infoSubject(null, { id: "x", name: null, prompt: "" })).toBeNull();
    expect(infoSubject(undefined, undefined)).toBeNull();
  });
  it("subject keys are stable per landmark and per region", () => {
    expect(subjectKey(infoSubject(LOTUS, REGION_A))).toBe("l:L02");
    expect(subjectKey(infoSubject(null, REGION_A))).toBe("r:A");
    expect(subjectKey(null)).toBe("");
  });
});

describe("region announcements", () => {
  it("never announces the starting region; announces a new region once it has been held", () => {
    const a = new RegionAnnouncer(1000, 60_000);
    expect(a.update("home", 0)).toBeNull();
    expect(a.update("home", 5000)).toBeNull();
    expect(a.update("A", 6000)).toBeNull(); // just arrived
    expect(a.update("A", 6500)).toBeNull(); // not yet held
    expect(a.update("A", 7100)).toBe("A");
    expect(a.update("A", 9000)).toBeNull(); // once
  });
  it("standing on a boundary (flipping back and forth) announces nothing", () => {
    const a = new RegionAnnouncer(1000, 60_000);
    a.update("A", 0);
    let said = 0;
    for (let t = 100; t < 20_000; t += 300) if (a.update(t % 600 < 300 ? "A" : "B", t)) said++;
    expect(said).toBe(0);
  });
  it("re-entering a region soon after is not announced again; after the repeat window it may be", () => {
    const a = new RegionAnnouncer(1000, 60_000);
    a.update("A", 0);
    a.update("B", 1000);
    expect(a.update("B", 2500)).toBe("B");
    a.update("A", 3000);
    a.update("B", 10_000);
    expect(a.update("B", 12_000)).toBeNull();
    a.update("A", 70_000);
    a.update("B", 80_000);
    expect(a.update("B", 81_500)).toBe("B");
  });
  it("reset makes the next region a fresh start (not announced)", () => {
    const a = new RegionAnnouncer(1000, 60_000);
    a.update("A", 0);
    a.reset();
    expect(a.update("C", 5000)).toBeNull();
    expect(a.update("C", 9000)).toBeNull();
  });
});
