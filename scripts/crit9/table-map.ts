// Crit 9 follow-up (F4): does one stick resting on the table (y = 0.5, axis
// tangential) settle, by angle and radius, under a physics config version?
//   CFG=2 node scripts/crit9/table-map.ts   (and CFG=3)
import { initPhysics, PhysicsWorld } from "../../src/server/core/physics.ts";
import { PHYSICS_CONFIGS } from "../../src/shared/config.ts";
await initPhysics();
const cfg = PHYSICS_CONFIGS[Number(process.env.CFG ?? 2)]!;
// one stick resting normally (y = 0.5), axis tangential so its whole length stays at about the same radius
const rows: string[] = [];
for (const deg of (process.env.ANGLES ?? "0,11.25,22.5,33.75,45").split(",").map(Number)) {
  const line: string[] = [];
  for (const r of (process.env.RADII ?? "4,8,10,11,12,13,14,15,15.8").split(",").map(Number)) {
    const a = (deg * Math.PI) / 180;
    const yaw = -(a + Math.PI / 2); // tangential
    const pw = PhysicsWorld.create(cfg);
    pw.addStick({ id: "s", authorId: "a", createdBy: "c", seed: 1, placedAt: 0 }, { p: [r * Math.cos(a), 0.5, r * Math.sin(a)], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] });
    let run = 0, settled: number | null = null;
    for (let k = 1; k <= 900 && settled == null; k++) { pw.step(); run = pw.isQuiet() ? run + 1 : 0; if (run >= 90) settled = k / 60; }
    const y = pw.world.getRigidBody(pw.sticks.get("s")!.handle)!.translation().y;
    // |x|+|z| of the stick's centre vs the cylinder radius: > 16.5 means outside the square with corners on the axes
    const l1 = r * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
    line.push(`r${r}:${settled == null ? `STUCK(y=${y.toFixed(2)})` : `ok`}${l1 > 16.5 ? "*" : ""}`);
    pw.free();
  }
  rows.push(`${deg}°  ${line.join("  ")}`);
}
console.log(rows.join("\n"));
console.log("* = centre outside the square |x|+|z| ≤ 16.5");
