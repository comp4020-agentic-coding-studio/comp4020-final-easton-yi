// Bounded settling diagnostic (Crit 9 follow-up, F4). Rebuilds the browser
// timing loop's construction in-process with the product's own code: the
// real Room (its advance() is the server's settled decision), PhysicsWorld and
// the client's spawnDraft, at the recorded click times of a run. No server,
// no network, no database.
//   node scripts/crit9/settle-diag.ts <timing-samples.csv> [--config 2] [--cap 180] [--jitter-trials 0] [--probe] [--out file.json]
import { readFileSync, writeFileSync } from "node:fs";
import { initPhysics, PhysicsWorld } from "../../src/server/core/physics.ts";
import { Room } from "../../src/server/core/room.ts";
import { PHYSICS_CONFIGS, TRANSPORT } from "../../src/shared/config.ts";
import { draftPose, spawnDraft } from "../../src/client/placement-math.ts";
import { stickBox } from "../../src/shared/geometry.ts";

const args = process.argv.slice(2);
const csv = args[0];
if (!csv) throw new Error("usage: settle-diag.ts <timing-samples.csv> [--cap s] [--jitter-trials n] [--out f]");
const opt = (k: string, d: number): number => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const CAP_S = opt("--cap", 180);
const TRIALS = opt("--jitter-trials", 0);
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

const cfg = PHYSICS_CONFIGS[opt("--config", 2)]!; // physics config version to rebuild with
const DT_MS = 1000 / 60;
const LAG_STEPS = Math.round(TRANSPORT.interpolationDelayMs / DT_MS); // the client spawns against poses ~100 ms old
const YAW = Math.atan2(-1, 1); // default camera at spherical theta = π/4 around the origin (viewport.fitAll)

const [head, ...lines] = readFileSync(csv, "utf8").trim().split("\n");
const cols = head!.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
const clicks = rows.filter((r) => r.accepted === "true").map((r) => Number(r.clickAt));
const offsets = clicks.map((t) => t - clicks[0]!);

interface Trial {
  label: string;
  placed: number;
  rejected: number;
  settleAfterLastMs: number | null;
  stepsAfterLast: number;
  overloadDrops: number;
  sunk: Record<string, unknown>[];
  probes: Record<string, unknown>[];
  awakeTrace: { tSinceLastMs: number; awake: number; notQuiet: Record<string, unknown>[] }[];
  final: { awake: number; notQuiet: number; maxV: number; maxW: number; quietStreakMs: number | null };
}

await initPhysics();

function run(label: string, schedule: number[]): Trial {
  const pw = PhysicsWorld.create(cfg);
  const row = { id: "diag", owner_id: "o", title: "diag", archived: 0, world_epoch: 1, command_seq: 0, best_height: 0, stable_height: 0, stick_count: 0, physics_config: "{}", physics_config_version: cfg.physicsConfigVersion, created_at: 0, updated_at: 0, trashed_at: null };
  const room = new Room(row, pw, null);
  const noop = (): void => undefined;
  let now = 0;
  room.lastStepAt = now;
  const history: { id: string; p: [number, number, number]; q: [number, number, number, number] }[][] = [];
  const order: string[] = [];
  const sunk = new Map<string, { atMs: number; y: number; radius: number; prevSpeed: number }>();
  const speed = new Map<string, number>();
  const tick = (): void => {
    now += DT_MS;
    room.advance(now, noop, () => true);
    for (const m of room.pw.sticks.values()) {
      const b = room.pw.world.getRigidBody(m.handle);
      if (!b) continue;
      const t = b.translation();
      const r = b.rotation();
      const tilt = Math.abs(2 * (r.x * r.y + r.w * r.z));
      // a nearly flat stick over the table whose centre is clearly below the 0.5 rest height has sunk in
      if (!sunk.has(m.id) && tilt < 0.1 && Math.hypot(t.x, t.z) < cfg.table.radius && t.y < 0.4) sunk.set(m.id, { atMs: Math.round(now), y: +t.y.toFixed(3), radius: +Math.hypot(t.x, t.z).toFixed(2), prevSpeed: +(speed.get(m.id) ?? 0).toFixed(2) });
      const v = b.linvel();
      speed.set(m.id, Math.hypot(v.x, v.y, v.z));
    }
    history.push(room.pw.bodies().map((b) => ({ id: b.id, p: b.p, q: b.q })));
    if (history.length > 30) history.shift();
  };
  const place = (): boolean => {
    const lagged = history[Math.max(0, history.length - 1 - LAG_STEPS)] ?? [];
    const obstacles = lagged.map((s) => ({ id: s.id, box: stickBox({ p: s.p, q: s.q }, cfg.stick) }));
    const s = spawnDraft([0, 0, 0], YAW, cfg.stick, obstacles, cfg.table, cfg.placementGap);
    const pose = draftPose(s.draft);
    if (room.pw.checkPlacement(pose).problem) return false; // the server would refuse it (COLLISION etc.)
    const id = `s${order.length}`;
    room.pw.addStick({ id, authorId: "a", createdBy: id, seed: 1, placedAt: now }, pose);
    order.push(id);
    room.stable = false;
    room.markMoving();
    return true;
  };
  // the work already held one settled stick (placed in M03) before the loop
  place();
  for (let i = 0; i < 600 && !room.stable; i++) tick();
  let rejected = 0;
  const start = now;
  for (const at of schedule) {
    while (now - start < at) tick();
    if (!place()) rejected++;
  }
  const last = now;
  const trace: Trial["awakeTrace"] = [];
  const snapshot = () =>
    [...room.pw.sticks.values()]
      .map((m, i) => {
        const b = room.pw.world.getRigidBody(m.handle)!;
        const v = b.linvel();
        const w = b.angvel();
        return { i, sleeping: b.isSleeping(), v: Math.hypot(v.x, v.y, v.z), w: Math.hypot(w.x, w.y, w.z), y: b.translation().y };
      });
  // where a moving body is and what it touches: the table cylinder, the rim ring mesh, or sticks
  const cyl = room.pw.tableCollider;
  const rimHandles = new Set(room.pw.tableColliders().map((c) => c.handle).filter((h) => h !== cyl));
  const detail = (i: number): Record<string, unknown> => {
    const m = [...room.pw.sticks.values()][i]!;
    const b = room.pw.world.getRigidBody(m.handle)!;
    const t = b.translation();
    const r = b.rotation();
    // the stick's long axis is local X; its tilt from horizontal in degrees
    const ax = { x: 1 - 2 * (r.y * r.y + r.z * r.z), y: 2 * (r.x * r.y + r.w * r.z), z: 2 * (r.x * r.z - r.w * r.y) };
    const touches = { cylinder: 0, rim: 0, sticks: 0 };
    const col = b.collider(0);
    room.pw.world.contactPairsWith(col, (other) => {
      const h = other.handle;
      if (h === cyl) touches.cylinder++;
      else if (rimHandles.has(h)) touches.rim++;
      else touches.sticks++;
    });
    const contacts: { with: string; normalY: number; deepest: number; points: number }[] = [];
    room.pw.world.contactPairsWith(col, (other) => {
      room.pw.world.contactPair(col, other, (manifold, flipped) => {
        let deepest = 0;
        for (let k = 0; k < manifold.numContacts(); k++) deepest = Math.min(deepest, manifold.contactDist(k));
        const n = manifold.normal();
        contacts.push({ with: other.handle === cyl ? "cylinder" : rimHandles.has(other.handle) ? "rim" : "stick", normalY: +((flipped ? -1 : 1) * n.y).toFixed(3), deepest: +deepest.toFixed(3), points: manifold.numContacts() });
      });
    });
    const half = 4;
    const ends = [1, -1].map((sgn) => +Math.hypot(t.x + sgn * half * ax.x, t.z + sgn * half * ax.z).toFixed(2));
    return { x: +t.x.toFixed(2), z: +t.z.toFixed(2), radius: +Math.hypot(t.x, t.z).toFixed(2), endRadii: ends, tiltDeg: +((Math.asin(Math.min(1, Math.abs(ax.y))) * 180) / Math.PI).toFixed(1), touches, contacts };
  };
  let steps = 0;
  while (!room.stable && now - last < CAP_S * 1000) {
    tick();
    steps++;
    if (steps % 120 === 0 && trace.length < 200) {
      const s = snapshot();
      trace.push({
        tSinceLastMs: Math.round(now - last),
        awake: s.filter((b) => !b.sleeping).length,
        notQuiet: s.filter((b) => !b.sleeping && (b.v >= cfg.stableLinear || b.w >= cfg.stableAngular)).map((b) => ({ i: b.i, v: +b.v.toFixed(4), w: +b.w.toFixed(4), y: +b.y.toFixed(2), ...detail(b.i) })),
      });
    }
  }
  // --probe: from a world that hasn't settled, restore copies and see what lets it settle (diagnosis only)
  const probes: Record<string, unknown>[] = [];
  if (args.includes("--probe") && !room.stable) {
    const bytes = room.pw.snapshot();
    const env = room.pw.envelope();
    const stuck = snapshot().filter((b) => !b.sleeping).sort((a, b) => b.v - a.v)[0]!;
    const stuckId = [...room.pw.sticks.keys()][stuck.i]!;
    const variants: [string, (p: PhysicsWorld) => void][] = [
      ["control (8 iterations)", () => undefined],
      ["16 solver iterations", (p) => (p.world.numSolverIterations = 16)],
      ["32 solver iterations", (p) => (p.world.numSolverIterations = 32)],
      ["4 internal PGS iterations", (p) => (p.world.numInternalPgsIterations = 4)],
      ["sticks touching it removed (diagnosis)", (p) => {
        const col = p.world.getRigidBody(p.sticks.get(stuckId)!.handle)!.collider(0);
        const touching: string[] = [];
        p.world.contactPair; // keep type
        p.world.contactPairsWith(col, (o) => {
          for (const [id, m] of p.sticks) if (m.handle === o.parent()?.handle && id !== stuckId) touching.push(id);
        });
        for (const id of touching) p.removeStick(id);
      }],
    ];
    {
      // the same pose alone in a fresh world, at rest: does geometry alone trap it?
      const sb = room.pw.world.getRigidBody(room.pw.sticks.get(stuckId)!.handle)!;
      const t = sb.translation();
      const r = sb.rotation();
      const pose = { p: [t.x, t.y, t.z] as [number, number, number], q: [r.x, r.y, r.z, r.w] as [number, number, number, number] };
      const fresh = PhysicsWorld.create(cfg);
      fresh.addStick({ id: "x", authorId: "a", createdBy: "x", seed: 1, placedAt: 0 }, pose);
      let run = 0;
      let settledS: number | null = null;
      for (let k = 1; k <= 1800 && settledS == null; k++) {
        fresh.step();
        run = fresh.isQuiet() ? run + 1 : 0;
        if (run >= 90) settledS = +(k / 60).toFixed(2);
      }
      const fb = fresh.world.getRigidBody(fresh.sticks.get("x")!.handle)!;
      const fv = fb.linvel();
      probes.push({ variant: "same pose alone in a fresh world, at rest", pose, settledWithin30sAfterS: settledS, stuckBodySpeed: +Math.hypot(fv.x, fv.y, fv.z).toFixed(3), stuckBodyY: +fb.translation().y.toFixed(3) });
      fresh.free();
    }
    for (const [name, apply] of variants) {
      const p = PhysicsWorld.restore(cfg, bytes, env);
      apply(p);
      let run = 0;
      let settledS: number | null = null;
      for (let k = 1; k <= 1800 && settledS == null; k++) {
        p.step();
        run = p.isQuiet() ? run + 1 : 0;
        if (run >= 90) settledS = +(k / 60).toFixed(2);
      }
      const b = p.world.getRigidBody(p.sticks.get(stuckId)!.handle)!;
      const v = b.linvel();
      probes.push({ variant: name, settledWithin30sAfterS: settledS, stuckBodySpeed: +Math.hypot(v.x, v.y, v.z).toFixed(3), stuckBodyY: +b.translation().y.toFixed(3) });
      p.free();
    }
  }
  const s = snapshot();
  const result: Trial = {
    probes,
    label,
    placed: order.length,
    rejected,
    settleAfterLastMs: room.stable ? Math.round(now - last) : null,
    stepsAfterLast: steps,
    overloadDrops: room.overloads,
    sunk: [...sunk.entries()].map(([id, e]) => ({ id, ...e, sinceLastPlacementMs: Math.round(e.atMs - last) })),
    awakeTrace: trace,
    final: {
      awake: s.filter((b) => !b.sleeping).length,
      notQuiet: s.filter((b) => !b.sleeping && (b.v >= cfg.stableLinear || b.w >= cfg.stableAngular)).length,
      maxV: +Math.max(...s.map((b) => b.v)).toFixed(4),
      maxW: +Math.max(...s.map((b) => b.w)).toFixed(4),
      quietStreakMs: room.quietSince == null ? null : Math.round(now - room.quietSince),
    },
  };
  room.pw.free();
  return result;
}

const results: Trial[] = [run("recorded", offsets)];
// optional: the same schedule with each interval jittered by up to ±150 ms (seeded, reproducible)
let seed = 12345;
const rand = (): number => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
for (let t = 0; t < TRIALS; t++) {
  let acc = 0;
  const sched = offsets.map((o, i) => (i === 0 ? 0 : (acc += Math.max(80, o - offsets[i - 1]! + (rand() - 0.5) * 300))));
  results.push(run(`jitter-${t}`, sched));
}
const brief = results.map((r) => ({ label: r.label, placed: r.placed, rejected: r.rejected, settleAfterLastMs: r.settleAfterLastMs, final: r.final }));
console.log(JSON.stringify(brief));
if (OUT) writeFileSync(OUT, JSON.stringify({ csv, config: cfg.physicsConfigVersion, capS: CAP_S, lagSteps: LAG_STEPS, yaw: YAW, results }, null, 1));
