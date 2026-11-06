// Applies the one environment state (daynight.ts) to the scene, every part
// together (courtyard/day-night directive §6–§7): the key light (one shadowed
// directional light: the sun by day, the moon by night, so the shadow work is
// never doubled), the hemisphere fill, fog and background, the Sky shader,
// clouds, sea, rivers, the pond, the portal membranes and lettering, the
// candles, and the moon itself. Nothing is rebuilt or reloaded: only uniforms,
// colours and intensities change, and the same lights are reused.
//
// The moon is a soft disc and halo on a sky-facing quad in a fixed world
// direction (MOON_DIR), placed far beyond the island and following the camera's
// position (like the sky dome), never its rotation; it's drawn with the depth
// test, behind everything, so terrain and buildings hide it. The moonlight
// comes from that same direction.
import * as THREE from "three";
import { MOON_DIR, envParams, type EnvParams } from "./daynight.ts";

export interface LitScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  key: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh | null;
  /** Things that take a night amount (uNight) and/or a light level. */
  sea?: { uniforms: Record<string, { value: unknown }> } | null;
  flows?: { uniforms: Record<string, { value: unknown }> }[];
  pond?: { uniforms: { uNight: { value: number }; uSky: { value: THREE.Color } } } | null;
  clouds?: { setNight(tint: [number, number, number], alpha: number): void } | null;
  membranes?: THREE.MeshBasicMaterial[];
  labels?: { setNight(n: number): void } | null;
  candles?: { setLit(l: number): void } | null;
  stage?: HTMLElement | null;
}

// inside the camera's far plane on every tier (Low: fogFar 4600 + 400), so the moon is never clipped away
const DIST = 3600;

/** The moon: one quad (disc + halo in the fragment shader), one draw call, no texture. */
export function createMoon(): { mesh: THREE.Mesh; uniforms: { uAlpha: { value: number } }; follow(cam: THREE.Vector3): void; dispose(): void } {
  const size = 280; // at 3.6 km: the quad ≈ 4.4°, the disc ≈ 1.4° (restrained, but legible at phone width)
  const geo = new THREE.PlaneGeometry(size, size);
  const uniforms = { uAlpha: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float disc = smoothstep(0.31, 0.295, r);
        // modest surface detail: soft maria, darker on one side
        float m = n(p * 4.0 + 3.0) * 0.6 + n(p * 9.0) * 0.4;
        vec3 surface = mix(vec3(0.93, 0.95, 1.0), vec3(0.74, 0.78, 0.86), smoothstep(0.45, 0.75, m) * 0.7);
        surface *= 0.92 + 0.08 * smoothstep(0.3, -0.3, p.x + p.y);
        float halo = pow(max(0.0, 1.0 - r), 3.0) * 0.32 * (1.0 - disc);
        vec3 col = surface * disc * 1.25 + vec3(0.62, 0.70, 0.90) * halo;
        float a = clamp(disc + halo, 0.0, 1.0) * uAlpha;
        if (a < 0.002) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "moon";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1; // after the sky dome, before the island (and depth-tested against it)
  mesh.visible = false;
  const dir = new THREE.Vector3(...MOON_DIR);
  return {
    mesh,
    uniforms,
    follow(cam) {
      mesh.position.copy(cam).addScaledVector(dir, DIST);
      mesh.lookAt(cam);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

const col = (c: THREE.Color, v: readonly number[]): THREE.Color => c.setRGB(v[0]!, v[1]!, v[2]!, THREE.SRGBColorSpace);
const tmp = new THREE.Color();

/**
 * Apply one environment to the scene. `fog` is the scene's current Fog (quality changes replace it); `moon` may be
 * null before the static scene is built. Returns the parameters applied (stats).
 */
export function applyEnvironment(s: LitScene, night: number, moon: ReturnType<typeof createMoon> | null): EnvParams {
  const e = envParams(night);
  // key light: direction and colour; the shadow camera follows it (WorldView positions it relative to the camera)
  col(s.key.color, e.key.color);
  s.key.intensity = e.key.intensity;
  s.key.userData.dir = e.key.dir;
  // hemisphere fill
  col(s.hemi.color, e.hemi.sky);
  col(s.hemi.groundColor, e.hemi.ground);
  s.hemi.intensity = e.hemi.intensity;
  // fog and the background behind the sky
  if (s.scene.fog instanceof THREE.Fog) col(s.scene.fog.color, e.fog);
  if (s.scene.background instanceof THREE.Color) col(s.scene.background, e.fog);
  s.renderer.toneMappingExposure = e.exposure;
  // the Sky shader: its sun goes below the horizon at night; the night tint is a separate overlay (sky-night uniform)
  const sky = s.sky as (THREE.Mesh & { material: THREE.ShaderMaterial }) | null;
  if (sky) {
    const u = sky.material.uniforms;
    (u["sunPosition"]!.value as THREE.Vector3).set(e.skySun[0], e.skySun[1], e.skySun[2]);
    if (u["uNight"]) u["uNight"].value = e.skyNight;
    // the disc of the scattering sun is hidden at night and while it sets behind the island's west
    u["showSunDisc"]!.value = e.key.moon ? 0 : 1;
  }
  if (s.sea?.uniforms["uNight"]) s.sea.uniforms["uNight"].value = night;
  for (const f of s.flows ?? []) if (f.uniforms["uNight"]) f.uniforms["uNight"].value = night;
  if (s.pond) {
    s.pond.uniforms.uNight.value = night;
    col(s.pond.uniforms.uSky.value, e.fog);
  }
  s.clouds?.setNight(e.clouds.tint, e.clouds.alpha);
  for (const m of s.membranes ?? []) {
    // the membranes are unlit tints: keep them restrained at night
    if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
    m.opacity = (m.userData.baseOpacity as number) * e.portal;
  }
  s.labels?.setNight(night);
  s.candles?.setLit(e.candles);
  if (moon) {
    moon.uniforms.uAlpha.value = Math.max(0, Math.min(1, (night - 0.4) / 0.4));
    moon.mesh.visible = moon.uniforms.uAlpha.value > 0.001;
  }
  if (s.stage) s.stage.style.backgroundColor = e.css;
  void tmp;
  return e;
}
