// The test-only socket drop (/api/test/drop-sockets) exists only when the
// process starts with NODE_ENV other than "production" AND ENABLE_TEST_HOOKS=1,
// and even then drops only the calling session's own sockets. Disposable data
// directories; the spawned servers need no build.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Client, Window, sleep } from "../spec/helpers.ts";

const dirs: string[] = [];
const procs: ChildProcess[] = [];
const windows: Window[] = [];
afterAll(() => {
  for (const w of windows) w.close();
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let nextPort = 19750 + Math.floor(Math.random() * 100);
async function startServer(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "stillwood-hooks-"));
  dirs.push(dir);
  const port = nextPort++;
  const proc = spawn(process.execPath, [process.env.SERVER_ENTRY ?? "src/server/main.ts"], {
    env: { PATH: process.env.PATH!, HOME: dir, PORT: String(port), DATA_DIR: dir, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.push(proc);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/readyz`)).ok) return { url, proc };
    } catch {
      // not up
    }
    await sleep(100);
  }
  throw new Error("server did not start");
}

const drop = (c: Client) => c.req("POST", "/api/test/drop-sockets", { how: "terminate" });
const closed = (w: Window): Promise<number> => new Promise((r) => (w.ws.readyState === w.ws.CLOSED ? r(-1) : w.ws.once("close", (code) => r(code))));

describe("test-only socket drop", () => {
  it.each([
    ["production, even with ENABLE_TEST_HOOKS=1", { NODE_ENV: "production", COOKIE_SECURE: "0", ENABLE_TEST_HOOKS: "1" }],
    ["default startup (no NODE_ENV, no flag)", {}],
    ["test mode without the flag", { NODE_ENV: "test" }],
  ])("doesn't exist in %s", async (_name, env) => {
    const s = await startServer(env);
    const a = await new Client(s.url).register("Hook probe");
    const w = await Window.open(a);
    windows.push(w);
    const r = await drop(a);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
    expect((await a.req("GET", "/api/test/room/x")).status).toBe(404);
    // the probe's own socket is untouched
    w.send({ type: "heartbeat" });
    await w.waitFor((m) => m.type === "heartbeat.ok");
    s.proc.kill("SIGKILL");
  });

  it("with explicit test configuration, drops only the caller's own sockets", async () => {
    const s = await startServer({ NODE_ENV: "test", ENABLE_TEST_HOOKS: "1" });
    const a = await new Client(s.url).register("Caller");
    const b = await new Client(s.url).register("Bystander");
    const wa = await Window.open(a);
    const wb = await Window.open(b);
    windows.push(wa, wb);
    // nobody signed in: refused, nothing dropped
    const anon = await new Client(s.url).req("POST", "/api/test/drop-sockets", { how: "terminate" });
    expect(anon.status).toBe(401);
    const aClosed = closed(wa);
    const r = await drop(a);
    expect(r.body).toEqual({ dropped: 1 });
    expect(await aClosed).toBe(1006); // terminated without a close frame
    // the other person's socket still works
    wb.send({ type: "heartbeat" });
    await wb.waitFor((m) => m.type === "heartbeat.ok");
    expect(wb.ws.readyState).toBe(wb.ws.OPEN);
    s.proc.kill("SIGKILL");
  });
});
