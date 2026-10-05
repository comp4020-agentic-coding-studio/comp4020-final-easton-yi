// SAVE-10..SAVE-12, AT-17..AT-19: trash and permanent deletion across real
// process restarts, against disposable data directories, with the datastore
// read directly afterwards. fail-writes is a test-only hook (refused in production).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Client, FLAT, Window, sleep } from "../spec/helpers.ts";

const dirs: string[] = [];
const procs: ChildProcess[] = [];
afterAll(() => {
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let nextPort = 18700 + Math.floor(Math.random() * 500);
interface Server {
  url: string;
  proc: ChildProcess;
  exited: Promise<number | null>;
}

async function startServer(dataDir: string): Promise<Server> {
  const port = nextPort++;
  const proc = spawn(process.execPath, [process.env.SERVER_ENTRY ?? "src/server/main.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ENABLE_TEST_HOOKS: "1", NODE_ENV: "test" },
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
      if ((await fetch(`${url}/readyz`)).ok) return { url, proc, exited };
    } catch {
      // not up
    }
    await sleep(100);
  }
  throw new Error(`server did not start: ${logs.join("")}`);
}

const kill = async (s: Server): Promise<void> => {
  s.proc.kill("SIGKILL");
  await s.exited;
};

const disposable = (): string => {
  const d = mkdtempSync(join(tmpdir(), "stillwood-life-"));
  dirs.push(d);
  return d;
};

const relogin = async (url: string, c: Client): Promise<Client> => {
  const fresh = new Client(url);
  expect((await fresh.login(c.user!.handle, "correct horse battery")).status).toBe(200);
  return fresh;
};

/** Owner + editor, two settled sticks, a named version and a public exhibit. */
async function populated(url: string) {
  const owner = await new Client(url).register("Owner");
  const workId = await owner.createWork("Lifecycle work");
  const w = await Window.open(owner, workId);
  for (const z of [0, 3]) expect((await w.result(w.command("place", { pose: { p: [0, 0.505, z], q: FLAT } }))).outcome).toBe("accepted");
  await w.waitFor((m) => m.type === "save.status" && m.save === "saved", 20_000);
  const v = await w.result(w.command("snapshot.create", { title: "v1" }));
  const pub = await owner.req("POST", `/api/works/${workId}/exhibits`, { snapshotId: v.snapshotId, title: "Lifecycle exhibit", framing: { yaw: 0, pitch: 1, distance: 40, targetY: 2 } });
  expect(pub.status).toBe(200);
  const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
  const ed = await new Client(url).register("Editor");
  expect((await ed.req("POST", "/api/invites/accept", { token })).status).toBe(200);
  expect((await ed.req("PUT", `/api/favorites/${pub.body.id}`)).status).toBe(200);
  const sticks = (await owner.state(workId)).body.sticks.map((s: { id: string }) => s.id).sort();
  return { owner, ed, workId, w, exhibitId: pub.body.id as string, snapshotId: v.snapshotId as string, sticks };
}

describe("trash across restarts", () => {
  it("stays in the owner's trash after SIGKILL; restore afterwards keeps the scene", async () => {
    const dir = disposable();
    const s1 = await startServer(dir);
    const { owner, ed, workId, w, exhibitId, sticks } = await populated(s1.url);
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);
    w.close();
    await kill(s1);

    const s2 = await startServer(dir);
    const o2 = await relogin(s2.url, owner);
    const e2 = await relogin(s2.url, ed);
    expect((await o2.req("GET", "/api/trash")).body.works.map((x: { id: string }) => x.id)).toEqual([workId]);
    expect((await o2.req("GET", "/api/works")).body.works).toEqual([]);
    expect((await e2.req("GET", "/api/works")).body.works).toEqual([]);
    expect((await e2.state(workId)).status).toBe(410);
    expect((await new Client(s2.url).req("GET", `/api/exhibits/${exhibitId}`)).body.error.code).toBe("WITHDRAWN");
    // no room was resurrected by the restart
    expect((await o2.req("GET", `/api/test/room/${workId}`)).body).toBeNull();

    expect((await o2.req("POST", `/api/works/${workId}/trash/restore`)).status).toBe(200);
    expect((await o2.state(workId)).body.sticks.map((s: { id: string }) => s.id).sort()).toEqual(sticks);
    expect((await e2.state(workId)).status).toBe(200);
    await kill(s2);
  });

  it("a failed write leaves the work active, live and public; the retry succeeds", async () => {
    const dir = disposable();
    const s = await startServer(dir);
    const { owner, ed, workId, w, exhibitId } = await populated(s.url);
    await owner.req("POST", "/api/test/fail-writes", { on: true });
    const r = await owner.req("POST", `/api/works/${workId}/trash`);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("SAVE_FAILED");
    await owner.req("POST", "/api/test/fail-writes", { on: false });
    expect((await owner.req("GET", "/api/works")).body.works.map((x: { id: string }) => x.id)).toContain(workId);
    expect((await new Client(s.url).req("GET", `/api/exhibits/${exhibitId}`)).status).toBe(200);
    expect((await owner.req("GET", `/api/test/room/${workId}`)).body).not.toBeNull();
    expect((await owner.req("GET", `/api/works/${workId}/invite`)).body.invite).not.toBeNull();
    expect((await ed.state(workId)).status).toBe(200);
    expect(w.messages.some((m) => m.type === "access.ended")).toBe(false);
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);
    w.close();
    await kill(s);
  });
});

describe("permanent deletion in the datastore", () => {
  it("a failed transaction removes nothing; a successful one removes every work-scoped row and nothing else, surviving restart", async () => {
    const dir = disposable();
    const s1 = await startServer(dir);
    const { owner, ed, workId, w, exhibitId } = await populated(s1.url);
    w.close();
    // the editor's unrelated work, and a favorite the owner holds
    const other = await ed.createWork("Unrelated");
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);

    await owner.req("POST", "/api/test/fail-writes", { on: true });
    const failed = await owner.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Lifecycle work" });
    expect(failed.status).toBe(503);
    await owner.req("POST", "/api/test/fail-writes", { on: false });
    expect((await owner.req("GET", "/api/trash")).body.works[0]).toMatchObject({ id: workId, versionCount: 1, exhibitCount: 1, editorCount: 1 });

    expect((await owner.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Lifecycle work" })).status).toBe(200);
    await kill(s1);

    const db = new Database(join(dir, "stillwood.db"), { readonly: true });
    try {
      const n = (sql: string, ...args: unknown[]): number => (db.prepare(sql).get(...args) as { n: number }).n;
      for (const table of ["work_states", "previous_work_states", "snapshots", "exhibits", "memberships", "invites", "command_receipts"]) {
        expect(n(`SELECT COUNT(*) AS n FROM ${table} WHERE work_id = ?`, workId)).toBe(0);
      }
      expect(n("SELECT COUNT(*) AS n FROM works WHERE id = ?", workId)).toBe(0);
      expect(n("SELECT COUNT(*) AS n FROM invite_acceptances a LEFT JOIN invites i ON i.id = a.invite_id WHERE i.id IS NULL")).toBe(0);
      expect(n("SELECT COUNT(*) AS n FROM users WHERE id IN (?, ?)", owner.user!.id, ed.user!.id)).toBe(2);
      expect(n("SELECT COUNT(*) AS n FROM works WHERE id = ?", other)).toBe(1);
      expect(n("SELECT COUNT(*) AS n FROM memberships WHERE work_id = ?", other)).toBe(1);
      // the favorite is an id-only row; no title or geometry kept for it
      expect(n("SELECT COUNT(*) AS n FROM favorites WHERE exhibit_id = ?", exhibitId)).toBe(1);
      const tomb = db.prepare("SELECT * FROM work_tombstones WHERE work_id = ?").get(workId) as Record<string, unknown>;
      expect(Object.keys(tomb).sort()).toEqual(["deleted_at", "owner_id", "work_id"]);
      expect(db.pragma("foreign_key_check")).toEqual([]);
      expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      db.close();
    }

    const s2 = await startServer(dir);
    const o2 = await relogin(s2.url, owner);
    expect((await o2.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Lifecycle work" })).body.alreadyDeleted).toBe(true);
    expect((await o2.state(workId)).status).toBe(404);
    const e2 = await relogin(s2.url, ed);
    expect((await e2.state(other)).status).toBe(200);
    await kill(s2);
  });
});

describe("exhibit limit on existing data", () => {
  it("over the limit from older data: republish keeps its ID and geometry and is allowed; creating another is refused", async () => {
    const dir = disposable();
    const s1 = await startServer(dir);
    const { owner, workId, w, exhibitId, snapshotId } = await populated(s1.url);
    w.close();
    const frozen = (await new Client(s1.url).req("GET", `/api/exhibits/${exhibitId}`)).body.geometry;
    expect((await owner.req("POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: true })).status).toBe(200);
    await kill(s1);
    // rows the earlier public-only count allowed: 30 public + 1 withdrawn = 31 stored
    const legacy = Array.from({ length: 30 }, () => randomUUID());
    const db = new Database(join(dir, "stillwood.db"));
    try {
      const src = db.prepare("SELECT * FROM exhibits WHERE id = ?").get(exhibitId) as Record<string, unknown>;
      const ins = db.prepare(
        "INSERT INTO exhibits (id, work_id, snapshot_id, title, description, framing, attribution, geometry, height, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (let i = 0; i < 30; i++) ins.run(legacy[i], workId, snapshotId, `Legacy ${i}`, "", src.framing, src.attribution, src.geometry, src.height, Date.now());
    } finally {
      db.close();
    }
    const s2 = await startServer(dir);
    const o2 = await relogin(s2.url, owner);
    const stored = async () => (await o2.req("GET", `/api/works/${workId}/exhibits`)).body.exhibits.length;
    expect(await stored()).toBe(31);
    // republish uses no new slot
    expect((await o2.req("POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: false })).status).toBe(200);
    const back = await new Client(s2.url).req("GET", `/api/exhibits/${exhibitId}`);
    expect(back.status).toBe(200);
    expect(back.body.id).toBe(exhibitId);
    expect(back.body.geometry).toEqual(frozen);
    // withdrawing and republishing a legacy one works too, and the count never moves
    expect((await o2.req("POST", `/api/exhibits/${legacy[0]}/withdraw`, { withdrawn: true })).status).toBe(200);
    expect((await o2.req("POST", `/api/exhibits/${legacy[0]}/withdraw`, { withdrawn: false })).status).toBe(200);
    expect(await stored()).toBe(31);
    // creating another is refused
    const pub = await o2.req("POST", `/api/works/${workId}/exhibits`, { snapshotId, title: "One more", framing: { yaw: 0, pitch: 1, distance: 40, targetY: 2 } });
    expect(pub.status).toBe(409);
    expect(pub.body.error.code).toBe("LIMIT");
    expect(await stored()).toBe(31);
    await kill(s2);
  });
});
