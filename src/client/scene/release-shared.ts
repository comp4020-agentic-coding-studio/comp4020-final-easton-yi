// Releases the one texture three.js shares between every WebGLRenderer.
//
// three r186 keeps a module-level DFG lookup texture ("DFG_LUT", 16×16) for
// physically based materials and hands the same object to every renderer.
// Each renderer's WebGLTextures adds a "dispose" listener to it on first
// upload and removes that listener only when the texture itself is disposed —
// which renderer.dispose() never does, because the renderer doesn't own it.
// The listener's closure holds the renderer's GL context and canvas, so every
// renderer ever created stayed reachable: one canvas and one GL context per
// world or workshop mount (docs/evidence/world/memory-incident.md, §8).
//
// Disposing the shared texture after the renderer is gone runs every
// remaining listener (each frees its own GPU copy and unhooks itself); the
// object stays valid, and the next renderer uploads it again on first use.
import type * as THREE from "three";

type Uniforms = Record<string, { value: unknown } | undefined>;

/** Find the shared DFG texture through any material this renderer has drawn (call before materials are disposed). */
export function sharedTexturesOf(renderer: THREE.WebGLRenderer, scene: THREE.Object3D): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  const props = renderer.properties as unknown as { get(o: object): { uniforms?: Uniforms } | undefined };
  scene.traverse((o) => {
    if (found.size) return;
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      const lut = props.get(m)?.uniforms?.dfgLUT?.value as THREE.Texture | null | undefined;
      if (lut && (lut as { isTexture?: boolean }).isTexture) found.add(lut);
    }
  });
  return [...found];
}

/** After renderer.dispose(): drop every renderer's listener on the shared textures. */
export function releaseShared(textures: readonly THREE.Texture[]): void {
  for (const t of textures) t.dispose();
}
