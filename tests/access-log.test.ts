// OPS-03/OPS-04, AUTH-02, Crit 10: a refused attempt on someone else's work is
// a server log line naming the actor, the action and the work, and changes
// nothing. Before this, the server refused owner-only HTTP calls and a
// stranger's room join correctly but logged neither
// (docs/evidence/crit-10-verification.md, C10-08).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { Client, Window, sleep } from "../spec/helpers.ts";

const dirs: string[] = [];
const procs: ChildProcess[] = [];
const windows: Window[] = [];
afterAll(() => {
  for (const w of windows) w.close();
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

async function startServer(): Promise<{ url: string; lines: () => any[] }> {
  const dir = mkdtempSync(join(tmpdir(), "stillwood-accesslog-"));
  dirs.push(dir);
  const port = 19850 + Math.floor(Math.random() * 100);
  const proc = spawn(process.execPath, [process.env.SERVER_ENTRY ?? "src/server/main.ts"], {
    env: { PATH: process.env.PATH!, HOME: dir, PORT: String(port), DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.push(proc);
  let out = "";
  proc.stdout!.on("data", (d) => (out += String(d)));
  const lines = (): any[] =>
    out
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/readyz`)).ok) return { url, lines };
    } catch {
      // not up
    }
    await sleep(100);
  }
  throw new Error("server did not start");
}

it("logs who was refused what on whose work, and the work is unchanged", async () => {
  const server = await startServer();
  const owner = await new Client(server.url).register("Owner");
  const editor = await new Client(server.url).register("Editor");
  const stranger = await new Client(server.url).register("Stranger");
  const workId = await owner.createWork("Owned");
  const inv = await owner.req("POST", `/api/works/${workId}/invite`);
  const token = new URLSearchParams(String(inv.body.path).split("#")[1]).get("token")!;
  expect((await editor.req("POST", "/api/invites/accept", { token })).status).toBe(200);

  // the editor goes around the UI to owner-only endpoints
  expect((await editor.req("PATCH", `/api/works/${workId}`, { title: "Mine now" })).status).toBe(403);
  expect((await editor.req("POST", `/api/works/${workId}/trash`)).status).toBe(403);
  expect((await editor.req("DELETE", `/api/works/${workId}/members/${owner.user!.id}`)).status).toBe(403);
  // the stranger tries the work over HTTP and the socket
  expect((await stranger.req("PATCH", `/api/works/${workId}`, { title: "Taken" })).status).toBe(404);
  const w = await Window.open(stranger);
  windows.push(w);
  w.send({ type: "room.join", workId });
  expect((await w.waitFor((m) => m.type === "error")).code).toBe("NOT_FOUND");

  const work = (await owner.req("GET", `/api/works/${workId}`)).body;
  expect(work.title).toBe("Owned");
  expect(work.trashedAt ?? null).toBeNull();
  expect(work.members.map((m: any) => m.userId).sort()).toEqual([owner.user!.id, editor.user!.id].sort());

  await sleep(100);
  const denied = server
    .lines()
    .filter((l) => l.outcome === "rejected" && l.workId === workId)
    .map((l) => `${l.event} ${l.action ?? ""} ${l.actorId} ${l.code}`.replace("  ", " "));
  expect(denied).toEqual([
    `access.denied works.rename ${editor.user!.id} NOT_OWNER`,
    `access.denied works.trash ${editor.user!.id} NOT_OWNER`,
    `access.denied members.remove ${editor.user!.id} NOT_OWNER`,
    `access.denied works.rename ${stranger.user!.id} NOT_FOUND`,
    `room.join ${stranger.user!.id} NOT_FOUND`,
  ]);
  // no title, token or digest reaches these lines
  const raw = JSON.stringify(server.lines().filter((l) => l.outcome === "rejected"));
  for (const secret of ["Mine now", "Taken", token]) expect(raw).not.toContain(secret);
});
