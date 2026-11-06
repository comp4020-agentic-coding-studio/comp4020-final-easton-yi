// Portal destination lettering (2026-11-06): the layout is pure and the
// "clear of the wooden frame" claim is measured against each portal's real
// geometry (createPortal), not assumed. A stand-in for text measurement
// (the canvas measures real fonts at runtime and shrinks lines to fit their
// caps, so the caps are what must clear the frame).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createPortal } from "../src/client/world/environment.ts";
import { CELL_M, FACE_OFFSET, FRAME_MARGIN, HINT, LABEL_SHAPES, LINE_H, TITLE_CENTER, blockHeight, hintCentre, hintText, layoutLabel, splitV, type PortalId } from "../src/client/world/portal-labels.ts";
import { home } from "../src/world/layout.ts";
import { readFileSync } from "node:fs";

/** A bold sans-serif's average advance, with narrow letters: close enough to size the stand-in lines. */
const NARROW = new Set("iljtfI.,' ");
const em = (s: string): number => [...s].reduce((a, ch) => a + (NARROW.has(ch) ? 0.3 : ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 0.72 : ch === "m" || ch === "w" ? 0.9 : 0.58), 0);

/** The portal's merged frame triangles (wood and dark sticks), in portal-local space (x across, y up, z through). */
function frameTriangles(id: PortalId): number[][][] {
  const p = createPortal(id, "#ffffff");
  p.group.updateMatrixWorld(true);
  const tris: number[][][] = [];
  p.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m.material as THREE.Material).transparent) return; // the membrane isn't frame
    const pos = m.geometry.getAttribute("position");
    for (let i = 0; i + 2 < pos.count; i += 3) tris.push([0, 1, 2].map((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]));
  });
  p.dispose();
  return tris;
}

/** Half-width of the clear opening at height y: the nearest frame to the centre line on either side. */
function clearHalf(tris: number[][][], y: number): number {
  let left = -Infinity;
  let right = Infinity;
  for (const t of tris) {
    // where the triangle's edges cross the height y
    const xs: number[] = [];
    for (let e = 0; e < 3; e++) {
      const a = t[e]!;
      const b = t[(e + 1) % 3]!;
      if ((a[1]! - y) * (b[1]! - y) <= 0 && a[1] !== b[1]) xs.push(a[0]! + ((b[0]! - a[0]!) * (y - a[1]!)) / (b[1]! - a[1]!));
      else if (a[1] === y && b[1] === y) xs.push(a[0]!, b[0]!);
    }
    if (!xs.length) continue;
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    if (hi < 0) left = Math.max(left, hi); // a frame member left of the centre: its inner edge
    else if (lo > 0) right = Math.min(right, lo);
    else {
      left = Math.max(left, 0);
      right = Math.min(right, 0); // a member across the centre (a lintel) closes the opening here
    }
  }
  return Math.min(-left, right);
}

describe("destinations", () => {
  const ps = home().portals;

  it("each portal's label is its actual destination's user-facing name", () => {
    const names: Record<string, string> = { explore: "Explore the World", works: "My Works", together: "Build Together" };
    for (const p of ps) expect(p.label, p.id).toBe(names[p.id]);
    expect(ps.map((p) => p.id).sort()).toEqual(["explore", "together", "works"]);
    // and each leads where its label says: the bridge (it imports the router, which needs a window, so read as text)
    const bridge = readFileSync(new URL("../src/client/world/bridge.ts", import.meta.url), "utf8");
    expect(bridge).toMatch(/id === "works"\) return \{ kind: "page", href: "\/works\/" \}/);
    expect(bridge).toMatch(/id === "together"\) return \{ kind: "page", href: signedIn \? "\/works\/\?new=1"/);
    expect(bridge).toMatch(/return \{ kind: "explore", href: "\/world\/" \}/);
  });

  it("the spatial order is not assumed: My Works, Explore, Build Together from the layout's own ids", () => {
    expect(ps.map((p) => p.id)).toEqual(["works", "explore", "together"]);
  });
});

describe("label layout", () => {
  it("wraps each destination to its portal and keeps every line within its cap", () => {
    for (const id of Object.keys(LABEL_SHAPES) as PortalId[]) {
      for (const label of ["Explore the World", "My Works", "Build Together"]) {
        const shape = LABEL_SHAPES[id];
        const L = layoutLabel(label, em, shape);
        expect(L.lines.join(" "), `${id} keeps every word in order`).toBe(label);
        expect(L.font, `${id}/${label}`).toBeGreaterThan(0.1); // nonzero and visible up close
        expect(L.font).toBeLessThanOrEqual(shape.maxFont);
        expect(blockHeight(L.lines.length, L.font)).toBeLessThanOrEqual(shape.maxBlock + 1e-9);
        const caps = shape.caps[L.lines.length]!;
        L.widths.forEach((w, i) => expect(w, `${id}/${label} line ${i}`).toBeLessThanOrEqual(caps[i]! + 1e-9));
      }
    }
  });

  it("uses the largest size that fits, preferring fewer lines when sizes tie", () => {
    const L = layoutLabel("My Works", em, LABEL_SHAPES.works);
    expect(L.lines).toEqual(["My Works"]); // short enough for one line at full size
    const long = layoutLabel("Explore the World", em, { ...LABEL_SHAPES.together, maxFont: 1.0 });
    expect(long.lines.length).toBeGreaterThan(1); // a narrow A-frame wraps it
  });

  it("places the hint below the title block, clear of it, inside the cell", () => {
    for (const lines of [1, 2, 3]) {
      const font = 0.7;
      const titleBottom = TITLE_CENTER - blockHeight(lines, font) / 2;
      const hintTop = hintCentre(lines, font) + (LINE_H * HINT.font) / 2;
      expect(hintTop, `${lines} lines`).toBeLessThan(titleBottom);
      expect(hintCentre(lines, font) - (LINE_H * HINT.font) / 2).toBeGreaterThan(-CELL_M[1] / 2);
      expect(TITLE_CENTER + blockHeight(lines, font) / 2).toBeLessThan(CELL_M[1] / 2);
      const v = splitV(lines, font);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("the hint wording follows the device: the existing walk-through hint on touch", () => {
    expect(hintText(false)).toBe("Press E to enter");
    expect(hintText(true)).toBe("Walk through to enter");
  });
});

describe("clear of the wooden frame (measured on each portal's geometry)", () => {
  it.each(["explore", "works", "together"] as PortalId[])("%s: every line's cap, plus the margin, fits the opening over every height it can occupy", (id) => {
    const tris = frameTriangles(id);
    const shape = LABEL_SHAPES[id];
    const L = LINE_H;
    for (const [kStr, caps] of Object.entries(shape.caps)) {
      const k = Number(kStr);
      const fmax = Math.min(shape.maxFont, shape.maxBlock / (k * L));
      for (let i = 0; i < k; i++) {
        // the heights line i can occupy for any font size up to fmax (the block is centred on cy)
        const lo = shape.cy + Math.min(0, L * fmax * (k / 2 - i - 1));
        const hi = shape.cy + Math.max(0, L * fmax * (k / 2 - i));
        let narrowest = Infinity;
        for (let y = lo; y <= hi + 1e-9; y += 0.05) narrowest = Math.min(narrowest, clearHalf(tris, y));
        expect(caps[i]! / 2 + FRAME_MARGIN, `${id}, ${k} lines, line ${i}: cap ${caps[i]} m needs ${(caps[i]! / 2 + FRAME_MARGIN).toFixed(2)} m, opening is ${narrowest.toFixed(2)} m half-wide between y ${lo.toFixed(2)} and ${hi.toFixed(2)}`).toBeLessThanOrEqual(narrowest + 1e-9);
      }
    }
  });

  it.each(["explore", "works", "together"] as PortalId[])("%s: the label stands inside the frame's depth, in the opening's visual middle", (id) => {
    const tris = frameTriangles(id);
    const shape = LABEL_SHAPES[id];
    // inside the sticks' depth (the frame is at least ±0.25 m thick through the portal)
    expect(FACE_OFFSET).toBeLessThan(0.25);
    // "around its visual middle": the opening is about 0.4–10.2 m tall and its widest, most open part is mid-height
    const top = Math.max(...tris.flat().map((v) => v[1]!));
    expect(top).toBeGreaterThan(10);
    expect(shape.cy).toBeGreaterThan(4);
    expect(shape.cy).toBeLessThan(5.6);
    // the title block never reaches the ground rail or the head of the opening
    expect(shape.cy - shape.maxBlock / 2).toBeGreaterThan(2.5);
    expect(shape.cy + shape.maxBlock / 2).toBeLessThan(8);
  });
});
