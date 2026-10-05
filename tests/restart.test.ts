// AT-07, AT-08, SAVE-02, SAVE-03, OPS-01: real process termination around the
// placement transaction, against a disposable data directory. The crash
// points are test-only hooks (ENABLE_TEST_HOOKS, refused in production).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Client, FLAT, Window, sleep } from "../spec/helpers.ts";

const dirs: string[] = [];
const procs: ChildProcess[] = [];
afterAll(() => {
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let nextPort = 18100 + Math.floor(Math.random() * 500);
interface Server {
  url: string;
  proc: ChildProcess;
  exited: Promise<number | null>;
  logs: string[];
}

async function startServer(dataDir: string, env: Record<string, string> = {}): Promise<Server> {
  const port = nextPort++;
  const entry = process.env.SERVER_ENTRY ?? "src/server/main.ts";
  const proc = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ENABLE_TEST_HOOKS: "1", NODE_ENV: "test", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.push(proc);
  const logs: string[] = [];
  proc.stdout!.on("data", (d) => logs.push(String(d)));
  proc.stderr!.on("data", (d) => logs.push(String(d)));
  const exited = new Promise<number | null>((r) => proc.on("exit", (code, signal) => r(code ?? (signal ? -1 : null))));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/readyz`)).ok) return { url, proc, exited, logs };
    } catch {
      // not up
    }
    await sleep(100);
  }
  throw new Error(`server did not start: ${logs.join("")}`);
}

const disposable = (): string => {
  const d = mkdtempSync(join(tmpdir(), "stillwood-"));
  dirs.push(d);
  return d;
};

/** One account + work on a fresh server, with an editor window open. */
async function setup(server: Server): Promise<{ c: Client; workId: string; w: Window; password: string }> {
  const c = await new Client(server.url).register("Crash tester");
  const workId = await c.createWork("Crash work");
  const w = await Window.open(c, workId);
  return { c, workId, w, password: "correct horse battery" };
}

async function relogin(url: string, c: Client): Promise<Client> {
  const fresh = new Client(url);
  const r = await fresh.login(c.user!.handle, "correct horse battery");
  expect(r.status).toBe(200);
  return fresh;
}

describe("crash around the placement transaction", () => {
  it("killed before commit: nothing acknowledged, nothing saved", async () => {
    const dir = disposable();
    const s1 = await startServer(dir, { CRASH_AT: "before-commit" });
    const { c, workId, w } = await setup(s1);
    const commandId = w.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } });
    expect(await s1.exited).toBe(-1);
    const s2 = await startServer(dir);
    const c2 = await relogin(s2.url, c);
    expect((await c2.req("GET", `/api/commands/${commandId}`)).body.outcome).toBe("unknown");
    expect((await c2.state(workId)).body.sticks).toHaveLength(0);
    s2.proc.kill("SIGKILL");
  });

  it("killed after commit, before the reply: the same ID finds the saved result; no duplicate", async () => {
    const dir = disposable();
    const s1 = await startServer(dir, { CRASH_AT: "after-commit" });
    const { c, workId, w } = await setup(s1);
    const pose = { p: [0, 0.505, 0], q: FLAT };
    const commandId = w.command("place", { pose });
    expect(await s1.exited).toBe(-1);
    const s2 = await startServer(dir);
    const c2 = await relogin(s2.url, c);
    const q = await c2.req("GET", `/api/commands/${commandId}`);
    expect(q.body.outcome).toBe("accepted");
    const state = (await c2.state(workId)).body;
    expect(state.sticks.map((x: { id: string }) => x.id)).toEqual([q.body.stickId]);
    // resubmitting the original intention with its original ID is answered from the receipt
    const w2 = await Window.open(c2, workId);
    w2.command("place", { pose }, commandId);
    expect((await w2.result(commandId)).stickId).toBe(q.body.stickId);
    expect((await c2.state(workId)).body.sticks).toHaveLength(1);
    w2.close();
    s2.proc.kill("SIGKILL");
  });

  it("killed after the reply: the acknowledged stick is there after restart", async () => {
    const dir = disposable();
    const s1 = await startServer(dir, { CRASH_AT: "after-reply" });
    const { c, workId, w } = await setup(s1);
    const r = await c.command(workId, "place", { pose: { p: [2, 0.505, 2], q: FLAT } }, { leaseId: w.snapshot.lease.leaseId });
    expect(r.body.outcome).toBe("accepted");
    expect(await s1.exited).toBe(-1);
    const s2 = await startServer(dir);
    const c2 = await relogin(s2.url, c);
    expect((await c2.state(workId)).body.sticks.map((x: { id: string }) => x.id)).toEqual([r.body.stickId]);
    s2.proc.kill("SIGKILL");
  });
});

describe("motion across restarts", () => {
  it("SIGKILL mid-fall resumes from the latest checkpoint, not from the start", async () => {
    const dir = disposable();
    const s1 = await startServer(dir);
    const { c, workId, w } = await setup(s1);
    // A long fall from near the top of the creation bounds: ~2.3 s at g=30.
    const r = await w.result(w.command("place", { pose: { p: [0, 78, 0], q: FLAT } }));
    expect(r.outcome).toBe("accepted");
    await sleep(1300); // a couple of 500 ms checkpoints while falling
    s1.proc.kill("SIGKILL");
    await s1.exited;
    const s2 = await startServer(dir);
    const c2 = await relogin(s2.url, c);
    const state = (await c2.state(workId)).body;
    expect(state.sticks).toHaveLength(1);
    const y = state.bodies[0][2];
    expect(y).toBeLessThan(77); // progressed beyond the placement pose
    expect(y).toBeGreaterThan(0.4);
    // and it keeps moving to the table on the new process
    const w2 = await Window.open(c2, workId);
    const landed = await w2.waitFor((m) => m.type === "save.status" && m.save === "saved", 15_000);
    expect(landed.save).toBe("saved");
    const final = (await c2.state(workId)).body.bodies[0];
    expect(final[2]).toBeCloseTo(0.5, 0);
    w2.close();
    s2.proc.kill("SIGKILL");
  });

  it("graceful SIGTERM saves and exits cleanly; the next process has the same work", async () => {
    const dir = disposable();
    const s1 = await startServer(dir);
    const { c, workId, w } = await setup(s1);
    const r = await w.result(w.command("place", { pose: { p: [0, 30, 0], q: FLAT } }));
    expect(r.outcome).toBe("accepted");
    await sleep(200);
    s1.proc.kill("SIGTERM");
    expect(await s1.exited).toBe(0);
    expect(s1.logs.join("")).toContain('"event":"world.save"');
    const s2 = await startServer(dir);
    const c2 = await relogin(s2.url, c);
    expect((await c2.state(workId)).body.sticks).toHaveLength(1);
    s2.proc.kill("SIGKILL");
  });
});

describe("storage failure", () => {
  it("a failed write produces no success and no body left simulating", async () => {
    const dir = disposable();
    const s = await startServer(dir);
    const { c, workId, w } = await setup(s);
    await c.req("POST", "/api/test/fail-writes", { on: true });
    const r = await w.result(w.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }));
    expect(r.outcome).toBe("rejected");
    expect(r.code).toBe("SAVE_FAILED");
    const room = await c.req("GET", `/api/test/room/${workId}`);
    expect(room.body.sticks).toBe(0);
    expect(room.body.paused).toBe("SAVE_FAILED");
    // while paused, nothing else is accepted
    const r2 = await w.result(w.command("place", { pose: { p: [3, 0.505, 0], q: FLAT } }));
    expect(r2.code).toBe("ROOM_PAUSED");
    await c.req("POST", "/api/test/fail-writes", { on: false });
    const r3 = await w.result(w.command("place", { pose: { p: [3, 0.505, 0], q: FLAT } }, randomUUID()));
    expect(r3.outcome).toBe("accepted");
    expect((await c.state(workId)).body.sticks).toHaveLength(1);
    w.close();
    s.proc.kill("SIGKILL");
  });
});
