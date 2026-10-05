// Procedural wood (LOOK-01): longitudinal grain along the stick's local X on
// the four long faces, concentric end grain on the two ±X faces, warm and
// restrained per-stick variation from a deterministic seed. Computed in the
// shader from object-space position, so no texture is stretched over every
// face and no external asset is needed. Purely visual: every stick has the
// same physical properties.
import * as THREE from "three";

const NOISE = /* glsl */ `
  float sw_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sw_noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(sw_hash(i), sw_hash(i + vec2(1.0, 0.0)), u.x), mix(sw_hash(i + vec2(0.0, 1.0)), sw_hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float sw_fbm(vec2 p) { return 0.55 * sw_noise(p) + 0.3 * sw_noise(p * 2.1) + 0.15 * sw_noise(p * 4.3); }
`;

export function woodMaterial(opts: { instanced: boolean; base?: string } = { instanced: true }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.base ?? "#BC9167"), roughness: 0.72, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         ${opts.instanced ? "attribute float aSeed;" : "uniform float aSeed;"}
         varying vec3 vObjPos; varying vec3 vObjNormal; varying float vSeed;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vObjPos = position; vObjNormal = normal; vSeed = aSeed;`,
      );
    if (!opts.instanced) shader.uniforms.aSeed = { value: 0 };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vObjPos; varying vec3 vObjNormal; varying float vSeed;
         ${NOISE}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         {
           float s = fract(vSeed * 0.000137);
           vec3 n = abs(normalize(vObjNormal));
           vec3 light = vec3(0.86, 0.68, 0.49);
           vec3 dark = vec3(0.62, 0.43, 0.27);
           float g;
           if (n.x > 0.6) {
             // end grain: growth rings around an off-centre pith
             vec2 c = vObjPos.yz + vec2(0.9 + s * 0.6, -0.7 + s * 0.5);
             float r = length(c) * 7.0 + sw_fbm(c * 3.0 + s * 10.0) * 1.4;
             g = smoothstep(0.15, 0.85, abs(fract(r) - 0.5) * 2.0);
             light *= 0.93; dark *= 0.88;
           } else {
             // long faces: stripes along X, gently wandering
             float across = n.y > 0.6 ? vObjPos.z : vObjPos.y;
             float wander = sin(vObjPos.x * 0.35 + s * 6.28) * 0.18 + sw_fbm(vec2(vObjPos.x * 0.6, across * 2.0 + s * 9.0)) * 0.35;
             float stripe = (across + wander) * 9.0 + s * 4.0;
             g = smoothstep(0.2, 0.9, abs(fract(stripe) - 0.5) * 2.0);
             g = mix(g, sw_fbm(vec2(vObjPos.x * 3.0, across * 30.0)), 0.25);
           }
           vec3 wood = mix(dark, light, g);
           wood *= 0.94 + 0.12 * s; // per-stick warmth, no physical meaning
           diffuseColor.rgb = wood * (diffuseColor.rgb / vec3(0.737, 0.569, 0.404));
         }`,
      );
  };
  mat.customProgramCacheKey = () => (opts.instanced ? "wood-instanced" : "wood-single");
  return mat;
}

/** Pale, slightly textured tabletop. */
export function tableMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#E4DACA"), roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vObjPos;\n${NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.rgb *= 0.96 + 0.06 * sw_fbm(vObjPos.xz * 0.35) + 0.02 * sw_noise(vObjPos.xz * 6.0);`,
      );
  };
  mat.customProgramCacheKey = () => "table";
  return mat;
}
