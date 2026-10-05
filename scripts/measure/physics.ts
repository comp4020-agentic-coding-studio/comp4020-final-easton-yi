// Measures worker-side physics costs at the declared capacity (200 sticks):
// step time while everything is awake and collapsing, native snapshot size,
// snapshot and restore time. Prints JSON; results are recorded in
// docs/measurements.md with the machine they ran on.
import { currentPhysicsConfig } from "../../src/shared/config.ts";
import { quatFromYawPitchRoll } from "../../src/shared/geometry.ts";
import { initPhysics, PhysicsWorld } from "../../src/server/core/physics.ts";

await initPhysics();
const cfg = currentPhysicsConfig();
const w = PhysicsWorld.create(cfg);
// A log-cabin tower: layers of 4 sticks alternating direction, 50 layers.
let n = 0;
for (let layer = 0; layer < 50; layer++) {
  const y = 0.5 + 0.005 + layer * 1.005;
  for (const off of [-3, -1, 1, 3]) {
    const yaw = layer % 2 ? Math.PI / 2 : 0;
    const p: [number, number, number] = layer % 2 ? [off, y, 0] : [0, y, off];
    w.addStick({ id: `s${n}`, authorId: "u", createdBy: `c${n}`, seed: n, placedAt: 0 }, { p, q: quatFromYawPitchRoll(yaw, 0, 0) });
    n++;
  }
}
const time = (f: () => void): number => {
  const t = performance.now();
  f();
  return performance.now() - t;
};
const stepTimes: number[] = [];
for (let i = 0; i < 120; i++) stepTimes.push(time(() => w.step()));
// knock it over so all bodies are awake and colliding
w.applyPush("s100", [0, 25, 4], [0, 0, -1]);
for (let i = 0; i < 40; i++) w.applyPush(`s${i * 5}`, w.pose(`s${i * 5}`)!.p, [1, 0, 0.3]);
const collapse: number[] = [];
for (let i = 0; i < 600; i++) collapse.push(time(() => w.step()));
let bytes: Uint8Array = new Uint8Array();
const snapMs = time(() => (bytes = w.snapshot()));
let restored: PhysicsWorld | null = null;
const restoreMs = time(() => (restored = PhysicsWorld.restore(cfg, bytes, w.envelope())));
const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)]!;
console.log(
  JSON.stringify(
    {
      sticks: w.sticks.size,
      settledStepMs: { p50: pct(stepTimes, 0.5), p95: pct(stepTimes, 0.95) },
      collapseStepMs: { p50: pct(collapse, 0.5), p95: pct(collapse, 0.95), max: Math.max(...collapse) },
      snapshotBytes: bytes.length,
      snapshotMs: snapMs,
      restoreMs,
      rssMiB: Math.round(process.memoryUsage().rss / 1048576),
    },
    null,
    1,
  ),
);
void restored;
