// Physics step cost of the table colliders (Crit 9 follow-up, M-009b): the M-005
// shape of workload, a 150-stick mat on the table plus 50 sticks dropped onto it,
// stepped for 12 s simulated, under each physics config version.
//   node scripts/crit9/table-bench.ts
import { initPhysics, PhysicsWorld } from "../../src/server/core/physics.ts";
import { PHYSICS_CONFIGS } from "../../src/shared/config.ts";

await initPhysics();
const q = (yaw: number): [number, number, number, number] => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
for (const v of [2, 3]) {
  const cfg = PHYSICS_CONFIGS[v]!;
  const pw = PhysicsWorld.create(cfg);
  let n = 0;
  const add = (p: [number, number, number], yaw: number): void => void pw.addStick({ id: `s${n++}`, authorId: "a", createdBy: "c", seed: n, placedAt: 0 }, { p, q: q(yaw) });
  // mat: rows of sticks across the whole table, two layers crossed
  for (let layer = 0; layer < 2; layer++) {
    for (let i = -7; i <= 7 && n < 150; i++) {
      for (const off of [-8.5, 0, 8.5]) {
        const a = i * 2.1;
        const p: [number, number, number] = layer === 0 ? [off, 0.505, a] : [a, 1.515, off];
        if (Math.hypot(p[0], p[2]) < 13 && n < 150) add(p, layer === 0 ? 0 : Math.PI / 2);
      }
    }
  }
  const mat = n;
  for (let k = 0; k < 50; k++) add([((k * 7) % 21) - 10, 6 + (k % 5) * 1.2, ((k * 11) % 21) - 10], k * 0.37);
  const times: number[] = [];
  for (let s = 0; s < 12 * 60; s++) {
    const t0 = performance.now();
    pw.step();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const pct = (p: number): string => times[Math.ceil(p * times.length) - 1]!.toFixed(2);
  let awake = 0;
  for (const m of pw.sticks.values()) if (!pw.world.getRigidBody(m.handle)!.isSleeping()) awake++;
  console.log(JSON.stringify({ config: v, sticks: pw.sticks.size, mat, dropped: 50, steps: times.length, stepMs: { p50: pct(0.5), p95: pct(0.95), max: pct(1) }, awakeAfter12s: awake }));
  pw.free();
}
