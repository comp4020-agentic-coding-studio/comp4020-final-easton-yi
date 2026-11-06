// Destination lettering for the three entrance portals (2026-11-06).
//
// Frosted-glass letters that hang in each portal's transparent membrane and
// belong to the world: they are geometry in the scene, so they follow the
// portal's perspective, and there is no per-frame text work. One mesh and one
// draw call carry all three labels, each with a front face and a back face
// (correctly oriented from either side); one single-channel (R8) atlas holds
// the glyph coverage, and the fragment shader derives everything else from it:
// a crisp letter edge, a luminous rim, a faint halo and a restrained shadow
// (blurred coverage read from the texture's own mip levels), so the effect is
// in the letters and there is no card behind them. No refraction, no extra
// render loop: the activation glow is eased by WorldView's existing frame.
//
// The layout (line breaks and size) is pure and unit-tested (world-portal-
// labels.test.ts); the caps below are checked against the portals' real
// geometry there, so "clear of the wooden frame" is measured, not assumed.
import * as THREE from "three";

export type PortalId = "explore" | "works" | "together";

/** World units per atlas pixel: 192 px per metre, so a 4.4 m line is about 845 px of glyphs. */
export const PX_PER_M = 192;
/** One label's cell in the atlas, in metres and pixels (5.0 × 3.5 m; 960 × 672 px). */
export const CELL_M: readonly [number, number] = [5.0, 3.5];
export const CELL_PX: readonly [number, number] = [960, 672];
/** Line height as a multiple of the font size (an em), and where the title block's centre sits above the cell's centre (m). */
export const LINE_H = 1.1;
export const TITLE_CENTER = 0.55;
/** The "Press E to enter" line: font size (m), gap below the title block (m), and widest it may be (m). */
export const HINT = Object.freeze({ font: 0.3, gap: 0.28, cap: 3.2 });
/** How far each face stands off the membrane (m): inside the frame's depth, so it never clips the sticks. */
export const FACE_OFFSET = 0.04;
/** Clear space kept between lettering and the frame (m): covers the halo and a slightly oblique view. */
export const FRAME_MARGIN = 0.35;

export interface LabelShape {
  /** World height (m above the portal's base) of the title block's centre: around the opening's visual middle. */
  cy: number;
  /** Largest font size (m per em) and tallest title block (m). */
  maxFont: number;
  maxBlock: number;
  /** Widest each line may be (m), by the number of lines: a pointed arch or an A-frame narrows toward the top. */
  caps: Readonly<Record<number, readonly number[]>>;
}

/**
 * Per portal shape. The arch and the A-frame taper, so their upper lines are narrower than their lower ones; the
 * post-and-lintel gate is straight. Checked against each portal's geometry by `world-portal-labels.test.ts`.
 */
export const LABEL_SHAPES: Readonly<Record<PortalId, LabelShape>> = Object.freeze({
  explore: { cy: 5.0, maxFont: 0.4, maxBlock: 2.0, caps: { 1: [4.2], 2: [3.9, 4.3], 3: [3.0, 3.8, 4.2] } },
  works: { cy: 5.0, maxFont: 0.4, maxBlock: 2.0, caps: { 1: [4.4], 2: [4.0, 4.4], 3: [3.8, 4.2, 4.4] } },
  together: { cy: 4.6, maxFont: 0.4, maxBlock: 2.0, caps: { 1: [4.0], 2: [3.3, 4.2], 3: [2.6, 3.4, 4.2] } },
});

export interface LabelLayout {
  lines: string[];
  /** Font size in metres per em. */
  font: number;
  /** Each line's width in metres at that size (≤ its cap). */
  widths: number[];
}

/** The title block's height (m). */
export const blockHeight = (lines: number, font: number): number => lines * LINE_H * font;

/**
 * Break `text` into lines and choose a font size so every line fits its cap: the largest size wins, and a tie
 * keeps the fewer lines. `emWidth` is a string's width in ems (the canvas measures it; tests pass a stand-in).
 */
export function layoutLabel(text: string, emWidth: (s: string) => number, shape: LabelShape): LabelLayout {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const maxLines = Math.min(words.length, Math.max(...Object.keys(shape.caps).map(Number)));
  let best: (LabelLayout & { score: number }) | null = null;
  for (let k = 1; k <= maxLines; k++) {
    const caps = shape.caps[k];
    if (!caps || caps.length !== k) continue;
    // every way of cutting the words into k runs
    const cuts = (from: number, left: number): number[][] => {
      if (left === 1) return [[words.length]];
      const out: number[][] = [];
      for (let c = from + 1; c <= words.length - (left - 1); c++) for (const rest of cuts(c, left - 1)) out.push([c, ...rest]);
      return out;
    };
    for (const cut of cuts(0, k)) {
      const lines: string[] = [];
      let at = 0;
      for (const end of cut) {
        lines.push(words.slice(at, end).join(" "));
        at = end;
      }
      const em = lines.map(emWidth);
      let font = Math.min(shape.maxFont, shape.maxBlock / (k * LINE_H));
      for (let i = 0; i < k; i++) font = Math.min(font, caps[i]! / em[i]!);
      const layout = { lines, font, widths: em.map((e) => e * font), score: font - k * 0.01 };
      if (!best || layout.score > best.score) best = layout;
    }
  }
  if (!best) throw new Error(`no layout for "${text}"`);
  return { lines: best.lines, font: best.font, widths: best.widths };
}

/** Where the "Press E" line sits, in metres above the cell's centre, for a title block of `lines` lines at `font`. */
export function hintCentre(lines: number, font: number): number {
  return TITLE_CENTER - blockHeight(lines, font) / 2 - HINT.gap - (LINE_H * HINT.font) / 2;
}

/** Cell-local v (0 bottom … 1 top) of the boundary between the title and the hint: the middle of the gap. */
export function splitV(lines: number, font: number): number {
  const y = TITLE_CENTER - blockHeight(lines, font) / 2 - HINT.gap / 2;
  return 0.5 + y / CELL_M[1];
}

export interface PortalLabelInput {
  id: PortalId;
  /** The destination's user-facing name (the manifest's label). */
  label: string;
  position: readonly number[];
  yaw: number;
}

export interface PortalLabelInfo {
  id: PortalId;
  text: string;
  hint: string;
  lines: string[];
  fontM: number;
  widthsM: number[];
}

export interface PortalLabels {
  mesh: THREE.Mesh;
  info: PortalLabelInfo[];
  /**
   * The activation state per portal: `near` (within the existing label range, about 6 m) brightens the letters
   * gently; `close` (within the existing enter range, about 2.2 m, where E works) brightens them fully and shows
   * the hint line.
   */
  setActive(near: readonly boolean[], close: readonly boolean[]): void;
  /** Ease the glow toward the active flags; true while any label is still changing (the caller keeps framing). */
  step(dt: number, snap: boolean): boolean;
  state(): { glow: number; hint: number }[];
  /** Redraw and re-upload the atlas (after a lost WebGL context is restored). */
  rebuild(): void;
  /** GPU bytes of the atlas (base level; mip levels add a third). */
  textureBytes: number;
  dispose(): void;
}

const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const TITLE_FONT = "700";
const HINT_FONT = "600";
const ACCENT: Record<PortalId, string> = { explore: "#7fc4c9", works: "#e2b46a", together: "#9fd18f" };

function measurer(weight: string): (s: string) => number {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${weight} 100px ${FAMILY}`;
  return (s) => ctx.measureText(s).width / 100;
}

export function hintText(touch: boolean): string {
  return touch ? "Walk through to enter" : "Press E to enter";
}

const VERT = /* glsl */ `
  attribute float aIdx;
  varying vec2 vUv;
  varying vec2 vAtlas;
  varying float vIdx;
  void main() {
    vUv = uv;
    vIdx = aIdx;
    // cell k of COUNT, stacked top to bottom (the canvas is flipped on upload: its top row is v = 1)
    vAtlas = vec2(uv.x, (1.0 - (aIdx + 1.0) / float(COUNT)) + uv.y / float(COUNT));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 uTexSize;
  uniform vec4 uL[COUNT];    // glow 0..1, hint 0..1, split v, unused
  uniform vec3 uTint[COUNT]; // the portal's accent, a few per cent of the glass
  varying vec2 vUv;
  varying vec2 vAtlas;
  varying float vIdx;

  vec4 over(vec4 s, vec4 d) {
    float a = s.a + d.a * (1.0 - s.a);
    return vec4((s.rgb * s.a + d.rgb * d.a * (1.0 - s.a)) / max(a, 1e-4), a);
  }

  void main() {
    int i = int(vIdx + 0.5);
    vec4 L = uL[i];
    float glow = L.x;

    // the minification the texture unit would pick: blur radii are added to it, so the effect keeps its
    // proportions at any distance (it is the same fraction of a letter near and far)
    vec2 dx = dFdx(vAtlas * uTexSize);
    vec2 dy = dFdy(vAtlas * uTexSize);
    float m = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));

    float c = texture2D(map, vAtlas).r;                        // glyph coverage
    float w = clamp(fwidth(c) * 0.8, 0.03, 0.45);
    float letter = smoothstep(0.5 - w, 0.5 + w, c);            // a crisp edge at any magnification
    float soft = textureLod(map, vAtlas, m + 1.5).r;           // narrow blur: the rim and the luminous edge
    float wide = textureLod(map, vAtlas, m + 3.0).r;           // wide blur: a faint halo
    float sh = textureLod(map, vAtlas + vec2(-2.5, 5.0) / uTexSize, m + 2.0).r; // coverage shifted down and right

    // the title is always on; the hint line (below the split) fades in with the glow
    float region = mix(L.y, 1.0, smoothstep(L.z - 0.012, L.z + 0.012, vUv.y));

    vec3 milk = mix(vec3(0.90, 0.95, 0.98), uTint[i], 0.10);
    float rimIn = letter * (1.0 - smoothstep(0.45, 0.98, soft)); // bright just inside the edge, clear in the middle

    // Pale glass on pale sky needs a darker support than light alone can give: a tight, deep-teal shadow hugs the
    // letters (the blurred coverage, offset a little down and right), so the milky letters read on bright sky
    // and on dark stone alike. It is restrained: it fades quickly and has no hard edge.
    float support = max(sh * 0.85, soft * 0.55);
    vec4 acc = vec4(0.0);
    acc = over(vec4(0.03, 0.09, 0.12, clamp(support * 0.82, 0.0, 0.8) * (1.0 - letter)), acc);    // shadow / support
    acc = over(vec4(0.86, 0.96, 1.00, wide * (0.05 + 0.20 * glow) * (1.0 - letter)), acc);        // faint halo, stronger when active
    acc = over(vec4(milk, letter * (0.86 + 0.12 * glow)), acc);                                   // the frosted letter
    acc = over(vec4(vec3(1.0), rimIn * (0.60 + 0.35 * glow)), acc);                               // luminous glassy edge, inside
    gl_FragColor = vec4(acc.rgb, acc.a * region);
    #include <colorspace_fragment>
  }`;

export function createPortalLabels(portals: readonly PortalLabelInput[], opts: { touch: boolean; anisotropy: number }): PortalLabels {
  const n = portals.length;
  const measureTitle = measurer(TITLE_FONT);
  const measureHint = measurer(HINT_FONT);
  const hint = hintText(opts.touch);
  const hintFont = Math.min(HINT.font, HINT.cap / measureHint(hint));
  const layouts = portals.map((p) => layoutLabel(p.label, measureTitle, LABEL_SHAPES[p.id]));
  const info: PortalLabelInfo[] = portals.map((p, k) => ({ id: p.id, text: p.label, hint, lines: layouts[k]!.lines, fontM: layouts[k]!.font, widthsM: layouts[k]!.widths }));

  const canvas = document.createElement("canvas");
  canvas.width = CELL_PX[0];
  canvas.height = CELL_PX[1] * n;

  /** White text on black: the red channel is the glyph coverage. */
  const draw = (): void => {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    portals.forEach((_, k) => {
      const L = layouts[k]!;
      const cx = CELL_PX[0] / 2;
      const cellY = k * CELL_PX[1] + CELL_PX[1] / 2; // canvas y of the cell's centre
      const line = (text: string, weight: string, fontM: number, centreM: number): void => {
        const px = fontM * PX_PER_M;
        ctx.font = `${weight} ${px}px ${FAMILY}`;
        const cap = ctx.measureText("H").actualBoundingBoxAscent || px * 0.72;
        // centre the capitals (the eye reads a line's middle at half its cap height)
        ctx.fillText(text, cx, cellY - centreM * PX_PER_M + cap / 2);
      };
      const block = blockHeight(L.lines.length, L.font);
      L.lines.forEach((t, i) => line(t, TITLE_FONT, L.font, TITLE_CENTER + block / 2 - (i + 0.5) * LINE_H * L.font));
      line(hint, HINT_FONT, hintFont, hintCentre(L.lines.length, L.font));
    });
  };
  draw();

  const tex = new THREE.CanvasTexture(canvas);
  // a single channel: 1 byte per texel, not 4 (the red channel of the canvas)
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = opts.anisotropy;
  // after the first upload the canvas's own backing store is dead weight: shrink it. A restored WebGL context
  // redraws it (rebuild), because three re-uploads from the canvas.
  const release = (): void => {
    canvas.width = canvas.height = 1;
  };
  tex.onUpdate = release;

  // ---- geometry: per portal a front face (+z of the portal) and a back face (−z), in world space
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const which: number[] = [];
  const W = CELL_M[0];
  const H = CELL_M[1];
  portals.forEach((p, k) => {
    const cos = Math.cos(p.yaw);
    const sin = Math.sin(p.yaw);
    // the cell's centre height puts the title block's centre at the shape's cy
    const y0 = p.position[1]! + LABEL_SHAPES[p.id].cy - TITLE_CENTER;
    const world = (x: number, y: number, z: number): [number, number, number] => [p.position[0]! + x * cos + z * sin, y0 + y, p.position[2]! - x * sin + z * cos];
    // front: seen from +z, u runs along +x. back: seen from −z, u runs along −x, so the text reads the right way round
    const faces: { z: number; xs: [number, number] }[] = [
      { z: FACE_OFFSET, xs: [-W / 2, W / 2] },
      { z: -FACE_OFFSET, xs: [W / 2, -W / 2] },
    ];
    for (const f of faces) {
      const base = pos.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
        pos.push(...world(f.xs[u]!, (v - 0.5) * H, f.z));
        uvs.push(u, v);
        which.push(k);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("aIdx", new THREE.Float32BufferAttribute(which, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const states = portals.map((_, k) => new THREE.Vector4(0, 0, splitV(layouts[k]!.lines.length, layouts[k]!.font), 0));
  const tints = portals.map((p) => {
    const c = new THREE.Color(ACCENT[p.id]);
    return new THREE.Vector3(c.r, c.g, c.b);
  });
  const mat = new THREE.ShaderMaterial({
    defines: { COUNT: n },
    uniforms: { map: { value: tex }, uTexSize: { value: new THREE.Vector2(CELL_PX[0], CELL_PX[1] * n) }, uL: { value: states }, uTint: { value: tints } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "portal-labels";
  // after the membranes (renderOrder 0), the water (1), the clouds (2) and glazing (3); the lettering is the topmost glass
  mesh.renderOrder = 4;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // lettering never takes part in picking
  mesh.raycast = () => undefined;

  const targetGlow = portals.map(() => 0);
  const targetHint = portals.map(() => 0);
  /** Glow in range, and fully inside the enter range. */
  const GLOW_NEAR = 0.45;
  const EASE = 9; // 1/s: about a fifth of a second to settle
  let disposed = false;

  return {
    mesh,
    info,
    textureBytes: CELL_PX[0] * CELL_PX[1] * n,
    setActive(near, close) {
      for (let k = 0; k < n; k++) {
        targetGlow[k] = close[k] ? 1 : near[k] ? GLOW_NEAR : 0;
        targetHint[k] = close[k] ? 1 : 0;
      }
    },
    step(dt, snap) {
      let moving = false;
      for (let k = 0; k < n; k++) {
        const s = states[k]!;
        const g = targetGlow[k]!;
        const h = targetHint[k]!;
        if (snap) {
          s.x = g;
          s.y = h;
        } else {
          const a = 1 - Math.exp(-EASE * Math.max(0, Math.min(dt, 0.1)));
          s.x += (g - s.x) * a;
          s.y += (h - s.y) * a;
          if (Math.abs(g - s.x) < 0.005) s.x = g;
          if (Math.abs(h - s.y) < 0.005) s.y = h;
        }
        if (s.x !== g || s.y !== h) moving = true;
      }
      return moving;
    },
    state: () => states.map((s) => ({ glow: s.x, hint: s.y })),
    rebuild() {
      if (disposed) return;
      canvas.width = CELL_PX[0];
      canvas.height = CELL_PX[1] * n;
      draw();
      tex.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      tex.dispose(); // unhooks the renderer's dispose listener on the texture
      geo.dispose();
      mat.dispose();
      canvas.width = canvas.height = 1;
    },
  };
}
