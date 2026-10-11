// Physics config v3 through a work's life on real servers (Crit 9 final
// verification): a v3 work settles over the former problem zones, saves a
// version, survives a restart, resumes and restores, all as v3; a v2 work in
// the same database keeps v2 and its cylinder behaviour (no automatic upgrade).
// Disposable data directory; the spawned server needs no build and no hooks.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Client, FLAT, PASSWORD, Window, sleep } from "../spec/helpers.ts";
import { openDatabase } from "../src/server/db/db.ts";
import { createStore, makeEnvelope } from "../src/server/core/store.ts";
import { initPhysics, PhysicsWorld } from "../src/server/core/physics.ts";
import { PHYSICS_CONFIGS } from "../src/shared/config.ts";

const dirs: string[] = [];
const procs: ChildProcess[] = [];
const windows: Window[] = [];
afterAll(() => {
  for (const w of windows) w.close();
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let nextPort = 19600 + Math.floor(Math.random() * 150);
async function startServer(dataDir: string) {
  const port = nextPort++;
  const proc = spawn(process.execPath, [process.env.SERVER_ENTRY ?? "src/server/main.ts"], {
    env: { PATH: process.env.PATH!, HOME: dataDir, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.push(proc);
  const exited = new Promise((r) => proc.on("exit", r));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/readyz`)).ok) return { url, proc, exited };
    } catch {
      // not up
    }
    await sleep(100);
  }
  throw new Error("server did not start");
}

const tangential = (deg: number, r: number, y = 0.505) => {
  const a = (deg * Math.PI) / 180;
  const yaw = -(a + Math.PI / 2);
  return { p: [r * Math.cos(a), y, r * Math.sin(a)] as [number, number, number], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] as [number, number, number, number] };
};

describe("physics config through save, restart and resume", () => {
  it("v3 works stay v3 and settle over the former problem zones; v2 works keep v2", async () => {
    await initPhysics();
    const dir = mkdtempSync(join(tmpdir(), "stillwood-cfg-"));
    dirs.push(dir);
    const s1 = await startServer(dir);
    const a = await new Client(s1.url).register("Config owner");
    const w3 = await a.createWork("v3 work");
    const win = await Window.open(a, w3);
    windows.push(win);
    for (const [deg, r] of [[45, 13], [5.625, 15.8], [225, 14]] as [number, number][]) {
      expect((await win.result(win.command("place", { pose: tangential(deg, r) }))).outcome).toBe("accepted");
      await sleep(600);
    }
    await win.waitFor((m) => m.type === "save.status" && m.save === "saved", 15_000);
    const vid = win.command("snapshot.create", { title: "settled v3", whenSettled: true });
    const version = await win.waitFor((m) => m.type === "command.result" && m.commandId === vid && m.outcome !== "pending", 20_000);
    expect(version.outcome).toBe("accepted");
    const before = (await a.state(w3)).body;
    win.close();
    s1.proc.kill("SIGTERM");
    await s1.exited;

    // while stopped: what was stored, and a v2 work as an older server would have written it
    const db = openDatabase(dir);
    const store = createStore(db);
    const row = (id: string) => db.prepare("SELECT physics_config_version AS v, physics_config AS c FROM works WHERE id = ?").get(id) as { v: number; c: string };
    expect(row(w3).v).toBe(3);
    expect(JSON.parse(row(w3).c).tableCore).toEqual({ squares: 8, radius: 16.5 });
    expect(db.prepare("SELECT config_version AS v FROM work_states WHERE work_id = ?").get(w3)).toEqual({ v: 3 });
    expect(db.prepare("SELECT DISTINCT config_version AS v FROM snapshots WHERE work_id = ?").all(w3)).toEqual([{ v: 3 }]);
    const v2 = PHYSICS_CONFIGS[2]!;
    const w2 = randomUUID();
    const pw = PhysicsWorld.create(v2);
    pw.addStick({ id: randomUUID(), authorId: a.user!.id, createdBy: randomUUID(), seed: 1, placedAt: Date.now() }, { ...tangential(45, 13, 0.5) });
    store.tx(() => {
      store.q.insertWork.run(w2, a.user!.id, "v2 work", JSON.stringify(v2), 2, Date.now(), Date.now());
      store.q.insertMember.run(w2, a.user!.id, "owner", Date.now());
      store.writeState(w2, makeEnvelope(pw.snapshot(), { ...pw.envelope(), pushTainted: false, moving: false }, v2), Date.now());
    });
    pw.free();
    db.close();

    const s2 = await startServer(dir);
    const a2 = new Client(s2.url);
    expect((await a2.login(a.user!.handle, PASSWORD)).status).toBe(200);
    // the v3 work reloads with the same sticks resting on the surface, and resumes
    const after = (await a2.state(w3)).body;
    expect(after.sticks.map((x: { id: string }) => x.id).sort()).toEqual(before.sticks.map((x: { id: string }) => x.id).sort());
    for (const b of after.bodies as [string, number, number, number][]) expect(b[2]).toBeCloseTo(0.5, 2);
    const win2 = await Window.open(a2, w3);
    windows.push(win2);
    expect((await win2.result(win2.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }))).outcome).toBe("accepted");
    await sleep(600);
    expect((await win2.result(win2.command("restore", { snapshotId: version.snapshotId }))).outcome).toBe("accepted");
    // the v2 work keeps its own table: the same resting stick sinks into its cylinder, as before v3
    const win3 = await Window.open(a2, w2);
    windows.push(win3);
    await sleep(4000);
    const y2 = (await a2.state(w2)).body.bodies[0][2] as number;
    expect(y2).toBeLessThan(0.35);
    win2.close();
    win3.close();
    s2.proc.kill("SIGTERM");
    await s2.exited;
    const db2 = openDatabase(dir);
    expect(db2.prepare("SELECT physics_config_version AS v FROM works WHERE id = ?").get(w2)).toEqual({ v: 2 });
    expect(db2.prepare("SELECT config_version AS v FROM work_states WHERE work_id = ?").get(w2)).toEqual({ v: 2 });
    expect(db2.prepare("SELECT physics_config_version AS v FROM works WHERE id = ?").get(w3)).toEqual({ v: 3 });
    db2.close();
  }, 120_000);
});
