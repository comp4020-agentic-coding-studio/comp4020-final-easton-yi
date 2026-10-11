// Crit 9 final verification: where does each physics config's table actually
// support something, compared with the rendered tabletop (a regular 128-gon of
// circumradius 18, top at y = 0, vertices at multiples of 2.8125°)? A ray is
// cast straight down from y = 0.5 at each sample point; "supported" means it
// hits a table collider at y ≈ 0.
//   node scripts/crit9/table-coverage.ts [configVersion ...]   (default: 2 3)
import RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics, PhysicsWorld } from "../../src/server/core/physics.ts";
import { PHYSICS_CONFIGS } from "../../src/shared/config.ts";

await initPhysics();
const versions = process.argv.slice(2).map(Number);
const N = 128;
const R = 18;
/** Inside the rendered 128-gon: distance to the nearest edge line along its normal. */
const insidePolygon = (x: number, z: number): number => {
  const a = Math.atan2(z, x);
  const k = Math.floor(a / ((2 * Math.PI) / N));
  const mid = (k + 0.5) * ((2 * Math.PI) / N);
  const apothem = R * Math.cos(Math.PI / N);
  return apothem - (x * Math.cos(mid) + z * Math.sin(mid)); // > 0 inside
};

for (const v of versions.length ? versions : [2, 3]) {
  const cfg = PHYSICS_CONFIGS[v]!;
  const pw = PhysicsWorld.create(cfg);
  pw.world.step(); // build the query pipeline
  let offHeight = 0; // hits that aren't at the tabletop height (ray precision), counted apart from misses
  const supportedAt = (x: number, z: number): boolean => {
    const hit = pw.world.castRay(new RAPIER.Ray({ x, y: 0.5, z }, { x: 0, y: -1, z: 0 }), 0.6, true);
    if (hit && Math.abs(hit.timeOfImpact - 0.5) >= 1e-3) offHeight++;
    return !!hit;
  };
  let inside = 0;
  let holes = 0;
  let outside = 0;
  let overhang = 0;
  let deepestHole = 0; // how far inside the visible edge a hole reaches
  const holeRadii: number[] = [];
  const step = 0.05;
  for (let x = -18.2; x <= 18.2; x += step) {
    for (let z = -18.2; z <= 18.2; z += step) {
      const d = insidePolygon(x, z);
      const s = supportedAt(x, z);
      if (d > 0.01) {
        inside++;
        if (!s) {
          holes++;
          deepestHole = Math.max(deepestHole, d);
          holeRadii.push(Math.hypot(x, z));
        }
      } else if (d < -0.01) {
        outside++;
        if (s) overhang++;
      }
    }
  }
  holeRadii.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      config: v,
      grid: `${step} u`,
      insideVisibleTop: inside,
      unsupportedInside: holes,
      unsupportedAreaU2: +(holes * step * step).toFixed(2),
      holeRadiusRange: holes ? [+holeRadii[0]!.toFixed(2), +holeRadii[holeRadii.length - 1]!.toFixed(2)] : null,
      deepestHoleFromVisibleEdgeU: +deepestHole.toFixed(2),
      outsideVisibleTop: outside,
      supportedOutside: overhang,
      hitsNotAtTopHeight: offHeight,
    }),
  );
  pw.free();
}
