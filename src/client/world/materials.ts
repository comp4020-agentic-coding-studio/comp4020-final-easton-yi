// World materials. The timber reuses the workshop's wood shading idea
// (procedural grain along each stick's length, end grain on its ends) but
// reads per-instance position and rotation attributes, so 1.2 million sticks
// need no per-instance matrices. Terrain, grass, water and shells are
// original procedural shaders: no external textures are required.
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

const QROT = /* glsl */ `
  vec3 sw_qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

/**
 * Box folding. A closed box shows at most three of its faces to an eye (one of each ±x, ±y, ±z pair), and
 * a front-sided material's shadow pass draws at most three (the ones facing away from the light). The
 * stick geometries therefore hold only the +x, +y, +z faces of a centred box (foldedBox / chainSleeve in
 * WorldView.ts); each vertex turns its face 180° about a perpendicular axis (negating the face's axis and
 * one in-plane axis, which keeps the winding) onto the opposite face whenever that is the one the pass
 * would draw. The faces drawn, their positions, normals and object-space shading coordinates are exactly
 * those of the full box, so the image and the shadow map are unchanged; half the triangles are submitted.
 * All four vertices of a face compute the same choice from the same per-instance inputs.
 * `eL` is the eye (camera pass) or the direction away from the light (shadow pass) in the stick's frame.
 * Instances are in world space: the meshes keep an identity model matrix.
 */
const FOLD = /* glsl */ `
  vec3 sw_fold(vec3 n, vec3 eL) { return vec3(1.0) - 2.0 * (dot(eL, n) < 0.0 ? 1.0 : 0.0) * (n + n.yzx); }
  vec3 sw_eyeLocal(vec4 q, vec3 p) { return sw_qrot(vec4(-q.xyz, q.w), cameraPosition - p); }
  // the shadow camera is the sun's orthographic camera: its +z row of the view matrix points toward the light
  vec3 sw_awayLocal(vec4 q) { return -sw_qrot(vec4(-q.xyz, q.w), vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])); }
`;

/**
 * Timber for instanced sticks. Geometry is a unit-length box scaled per stock
 * (one geometry per stock), oriented by the instance quaternion `iQuat` and
 * placed at `iPos`. Shadow depth uses the same transform (customDepthMaterial).
 */
/**
 * Merged structural chains for the distance levels: a unit box scaled per
 * instance (length, section, section) with a simplified grain (the stripes
 * still run along the member). Never used near the camera.
 */
export function chainMaterial(): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#B48A62"), roughness: 0.8, metalness: 0 });
  const pre = `attribute vec3 iPos;\nattribute vec4 iQuat;\nattribute vec3 iScale;\nvarying vec3 vLocal;\n${QROT}${FOLD}`;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${pre}`)
      .replace("#include <beginnormal_vertex>", "vec3 sw_f = sw_fold(normal, sw_eyeLocal(iQuat, iPos));\nvec3 objectNormal = sw_qrot(iQuat, normalize(normal * sw_f / max(iScale, vec3(0.01))));")
      .replace("#include <begin_vertex>", "vec3 transformed = sw_qrot(iQuat, position * sw_f * iScale) + iPos;\nvLocal = position * sw_f * iScale;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vLocal;\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n{ float g = smoothstep(0.2, 0.9, abs(fract((vLocal.y + vLocal.z) * 4.0 + sw_noise(vec2(vLocal.x * 0.4, 0.0))) - 0.5) * 2.0); diffuseColor.rgb = mix(vec3(0.62, 0.44, 0.29), vec3(0.84, 0.66, 0.47), g); }`);
  };
  mat.customProgramCacheKey = () => "timber-chain";
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute vec3 iPos;\nattribute vec4 iQuat;\nattribute vec3 iScale;\n${QROT}${FOLD}`)
      .replace("#include <begin_vertex>", "vec3 transformed = sw_qrot(iQuat, position * sw_fold(normal, sw_awayLocal(iQuat)) * iScale) + iPos;");
  };
  depth.customProgramCacheKey = () => "timber-chain-depth";
  return { material: mat, depth };
}

export function timberMaterial(stockLength: number): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#BC9167"), roughness: 0.74, metalness: 0 });
  const vertexPrelude = `
    attribute vec3 iPos;
    attribute vec4 iQuat;
    attribute float iSeed;
    varying vec3 vObjPos; varying vec3 vObjNormal; varying float vSeed;
    ${QROT}${FOLD}
  `;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${vertexPrelude}`)
      .replace("#include <beginnormal_vertex>", `vec3 sw_f = sw_fold(normal, sw_eyeLocal(iQuat, iPos));\nvec3 objectNormal = sw_qrot(iQuat, normal * sw_f);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif`)
      .replace("#include <begin_vertex>", `vec3 transformed = sw_qrot(iQuat, position * sw_f) + iPos;\nvObjPos = position * sw_f; vObjNormal = normal * sw_f; vSeed = iSeed;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vObjPos; varying vec3 vObjNormal; varying float vSeed;\n${NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         {
           float s = fract(vSeed * 0.000137);
           vec3 n = abs(normalize(vObjNormal));
           vec3 light = vec3(0.86, 0.68, 0.49);
           vec3 dark = vec3(0.60, 0.42, 0.27);
           float L = ${stockLength.toFixed(1)};
           float g;
           if (n.x > 0.6) {
             vec2 c = vObjPos.yz * (8.0 / L) + vec2(0.9 + s * 0.6, -0.7 + s * 0.5);
             float r = length(c) * 7.0 + sw_fbm(c * 3.0 + s * 10.0) * 1.4;
             g = smoothstep(0.15, 0.85, abs(fract(r) - 0.5) * 2.0);
             light *= 0.92; dark *= 0.86;
           } else {
             float across = (n.y > 0.6 ? vObjPos.z : vObjPos.y) * (8.0 / L);
             float along = vObjPos.x * (8.0 / L);
             float wander = sin(along * 0.35 + s * 6.28) * 0.18 + sw_fbm(vec2(along * 0.6, across * 2.0 + s * 9.0)) * 0.35;
             float stripe = (across + wander) * 9.0 + s * 4.0;
             g = smoothstep(0.2, 0.9, abs(fract(stripe) - 0.5) * 2.0);
             g = mix(g, sw_fbm(vec2(along * 3.0, across * 30.0)), 0.25);
           }
           vec3 wood = mix(dark, light, g);
           wood *= 0.9 + 0.18 * s;
           diffuseColor.rgb = wood;
         }`,
      );
  };
  mat.customProgramCacheKey = () => `timber-${stockLength}`;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute vec3 iPos;\nattribute vec4 iQuat;\n${QROT}${FOLD}`)
      .replace("#include <begin_vertex>", `vec3 transformed = sw_qrot(iQuat, position * sw_fold(normal, sw_awayLocal(iQuat))) + iPos;`);
  };
  depth.customProgramCacheKey = () => "timber-depth";
  return { material: mat, depth };
}

/**
 * Terrain: slope- and height-driven blend of meadow grass, green-gold upland
 * grass, soil and cool grey-blue rock, with three scales of variation (30–100 m
 * colour patches, medium grass/soil mottling, fine detail), triplanar on
 * steep faces so cliffs never show stretched texture.
 */
export function terrainMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\n${NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         {
           vec3 nrm = normalize(vWNormal);
           float slope = degrees(acos(clamp(nrm.y, -1.0, 1.0)));
           // triplanar weights for steep faces
           vec3 w = abs(nrm); w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z);
           float rockN = sw_fbm(vWPos.zy * 0.08) * w.x + sw_fbm(vWPos.xz * 0.08) * w.y + sw_fbm(vWPos.xy * 0.08) * w.z;
           float rockF = sw_noise(vWPos.zy * 0.9) * w.x + sw_noise(vWPos.xz * 0.9) * w.y + sw_noise(vWPos.xy * 0.9) * w.z;
           float big = sw_fbm(vWPos.xz * 0.012);
           float mid = sw_fbm(vWPos.xz * 0.11);
           float fine = sw_noise(vWPos.xz * 1.7);
           vec3 meadow = mix(vec3(0.33, 0.47, 0.20), vec3(0.45, 0.55, 0.23), big);
           vec3 upland = mix(vec3(0.52, 0.55, 0.27), vec3(0.62, 0.58, 0.33), mid);
           vec3 soil = vec3(0.45, 0.36, 0.25);
           vec3 rock = mix(vec3(0.40, 0.43, 0.47), vec3(0.56, 0.58, 0.61), rockN) * (0.88 + 0.2 * rockF);
           vec3 sand = vec3(0.74, 0.68, 0.52);
           float h = vWPos.y;
           vec3 grass = mix(meadow, upland, smoothstep(70.0, 150.0, h + 20.0 * big));
           grass *= 0.9 + 0.18 * mid + 0.06 * fine;
           // grass → mixed 25–40°, rock above 40°, soil in the transition
           float toSoil = smoothstep(22.0, 32.0, slope + 6.0 * (mid - 0.5));
           float toRock = smoothstep(34.0, 44.0, slope + 8.0 * (rockN - 0.5));
           vec3 col = mix(grass, soil, toSoil * 0.7);
           col = mix(col, rock, toRock);
           // beaches and wet shore near sea level
           col = mix(col, sand, smoothstep(3.5, 0.5, h) * (1.0 - toRock));
           col = mix(col, col * 0.62, smoothstep(0.6, -0.4, h));
           diffuseColor.rgb = col;
         }`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.97, 0.85, smoothstep(34.0, 44.0, degrees(acos(clamp(normalize(vWNormal).y, -1.0, 1.0)))));");
  };
  mat.customProgramCacheKey = () => "terrain";
  return mat;
}

/** Grass clumps: instanced blades anchored at the root, tips swayed by a shared wind field. */
export function grassMaterial(): { material: THREE.MeshStandardMaterial; uniforms: { uTime: { value: number }; uWind: { value: number }; uFade: { value: THREE.Vector2 } } } {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uFade: { value: new THREE.Vector2(40, 80) } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute vec4 iClump; // x, y, z, yaw
         attribute float iScale;
         uniform float uTime; uniform float uWind; uniform vec2 uFade;
         varying float vTip; varying float vShade; varying float vFade;
         ${NOISE}`,
      )
      .replace(
        "#include <begin_vertex>",
        `float t = clamp(position.y / 0.58, 0.0, 1.0);
         vTip = t;
         float c = cos(iClump.w), s = sin(iClump.w);
         vec3 p = vec3(position.x * c + position.z * s, position.y, -position.x * s + position.z * c) * iScale;
         vec3 base = iClump.xyz;
         // shared wind field: a slow travelling wave plus gusts; only the tip moves
         float gust = sw_noise(base.xz * 0.02 + vec2(uTime * 0.07, uTime * 0.05));
         float wave = sin(dot(base.xz, vec2(0.11, 0.07)) + uTime * 1.6) * 0.5 + 0.5;
         float bend = uWind * (0.25 + 0.55 * gust) * (0.6 + 0.4 * wave) * t * t;
         p.x += bend * 0.6; p.z += bend * 0.35;
         vec3 transformed = base + p;
         vShade = 0.75 + 0.25 * sw_noise(base.xz * 0.37);
         float d = distance(cameraPosition.xz, base.xz);
         vFade = 1.0 - smoothstep(uFade.x, uFade.y, d);
         transformed.y -= (1.0 - vFade) * 0.8 * iScale; // sink fading clumps instead of popping`,
      )
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTip; varying float vShade; varying float vFade;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         vec3 rootC = vec3(0.24, 0.36, 0.14);
         vec3 tipC = vec3(0.58, 0.64, 0.30);
         diffuseColor.rgb = mix(rootC, tipC, vTip) * vShade;
         if (vFade < 0.02) discard;`,
      )
      // blades are lit like the ground they grow from: both faces use the same upward normal
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.15, 1.0, 0.1, 0.0)).xyz);");
  };
  mat.customProgramCacheKey = () => "grass";
  return { material: mat, uniforms };
}

/** Sea and inland water: depth tint, normal variation, highlights and shoreline foam, flow direction for rivers. */
export function waterMaterial(opts: { flow: boolean }): { material: THREE.MeshStandardMaterial; uniforms: { uTime: { value: number } } } {
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#2f7f86"), roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.9 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec2 vUv2;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvUv2 = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\nvarying vec2 vUv2;\n${NOISE}`)
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
         {
           vec2 flowUv = ${opts.flow ? "vec2(vUv2.x * 6.0, vUv2.y * 20.0 - uTime * 0.9)" : "vWPos.xz * 0.05 + vec2(uTime * 0.02, uTime * 0.013)"};
           float n1 = sw_fbm(flowUv * 1.0);
           float n2 = sw_fbm(flowUv * 2.7 + 3.1);
           vec3 bump = normalize(vec3((n1 - 0.5) * 0.35, 1.0, (n2 - 0.5) * 0.35));
           normal = normalize((viewMatrix * vec4(bump, 0.0)).xyz);
         }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float deep = ${opts.flow ? "0.4" : "smoothstep(0.0, 1.0, sw_fbm(vWPos.xz * 0.004))"};
         diffuseColor.rgb = mix(vec3(0.20, 0.58, 0.58), vec3(0.10, 0.33, 0.42), deep);
         ${opts.flow ? "diffuseColor.rgb += vec3(0.5) * smoothstep(0.65, 0.9, sw_fbm(vec2(vUv2.x * 9.0, vUv2.y * 30.0 - uTime * 1.6)));" : ""}`,
      );
  };
  mat.customProgramCacheKey = () => (opts.flow ? "water-flow" : "water-sea");
  return { material: mat, uniforms };
}

/** Rear shading shells: shade (dark interior), plank (timber-toned infill) and glass (pale, translucent). */
export function shellMaterials(): Record<"shade" | "plank" | "glass", THREE.Material> {
  const plank = new THREE.MeshStandardMaterial({ color: new THREE.Color("#8d6a4a"), roughness: 0.85, metalness: 0 });
  plank.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\ndiffuseColor.rgb *= 0.86 + 0.18 * sw_noise(vec2(vWPos.y * 2.0, (vWPos.x + vWPos.z) * 0.3));`);
  };
  plank.customProgramCacheKey = () => "shell-plank";
  return {
    shade: new THREE.MeshStandardMaterial({ color: new THREE.Color("#3a2c22"), roughness: 0.95, metalness: 0 }),
    plank,
    glass: new THREE.MeshStandardMaterial({ color: new THREE.Color("#b9d2d6"), roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false }),
  };
}

/** Rock: faceted, cool grey-blue with triplanar mottling. */
export function rockMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#7d848c"), roughness: 0.92, metalness: 0, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vUp;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvUp = normalize(mat3(modelMatrix) * objectNormal);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vUp;\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\ndiffuseColor.rgb *= 0.8 + 0.3 * sw_fbm(vWPos.xz * 0.3 + vWPos.y * 0.2);\n// moss on the upward faces\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.50, 0.30), smoothstep(0.75, 0.95, normalize(vUp).y) * 0.35);`);
  };
  mat.customProgramCacheKey = () => "rock";
  return mat;
}
