// ADR-0007 end to end on disposable servers with test hooks: the datastore is
// read directly afterwards, failures are injected inside the transaction, other
// requests are run at a latched point between the password check and the
// commit, and processes are killed right after the commit.
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { Client, FLAT, PASSWORD, Window, sleep } from "../spec/helpers.ts";
import { checksum } from "../src/server/core/store.ts";

const dirs: string[] = [];
const procs: ChildProcess[] = [];
const windows: Window[] = [];
afterAll(() => {
  for (const w of windows) w.close();
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let nextPort = 19300 + Math.floor(Math.random() * 500);
interface Server {
  url: string;
  proc: ChildProcess;
  exited: Promise<number | null>;
}

async function startServer(dataDir: string, env: Record<string, string> = {}): Promise<Server> {
  const port = nextPort++;
  const proc = spawn(process.execPath, [process.env.SERVER_ENTRY ?? "src/server/main.ts"], {
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
  const d = mkdtempSync(join(tmpdir(), "stillwood-acct-"));
  dirs.push(d);
  return d;
};

const relogin = async (url: string, c: Client): Promise<Client> => {
  const fresh = new Client(url);
  expect((await fresh.login(c.user!.handle, PASSWORD)).status).toBe(200);
  return fresh;
};

const open = async (c: Client, workId?: string): Promise<Window> => {
  const w = await Window.open(c, workId);
  windows.push(w);
  return w;
};

const del = (c: Client, password = PASSWORD) => c.req("POST", "/api/account/delete", { password });
const subject = (id: string): string => createHash("sha256").update(`stillwood.account-deletion\0${id}`).digest("hex");
const FRAMING = { yaw: 0, pitch: 1, distance: 40, targetY: 2 };

async function place(w: Window, p: [number, number, number]): Promise<string> {
  const r = await w.result(w.command("place", { pose: { p, q: FLAT } }));
  expect(r.outcome).toBe("accepted");
  return r.stickId;
}

async function version(w: Window, title: string): Promise<string> {
  const id = w.command("snapshot.create", { title, whenSettled: true });
  const r = await w.waitFor((m) => m.type === "command.result" && m.commandId === id && m.outcome !== "pending", 20_000);
  expect(r.outcome).toBe("accepted");
  return r.snapshotId;
}

async function invite(owner: Client, workId: string, guest: Client): Promise<void> {
  const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
  expect((await guest.req("POST", "/api/invites/accept", { token })).status).toBe(200);
}

/** Every table, every column, every row: where the account's ID, handle or name still appears. */
function residue(dir: string, a: { id: string; handle: string; name: string }): string[] {
  const db = new Database(join(dir, "stillwood.db"), { readonly: true });
  const found: string[] = [];
  try {
    for (const { name: table } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]) {
      for (const row of db.prepare(`SELECT * FROM "${table}"`).iterate() as Iterable<Record<string, unknown>>) {
        for (const [col, v] of Object.entries(row)) {
          const hit = typeof v === "string" ? [a.id, a.handle, a.name].some((n) => v.includes(n)) : Buffer.isBuffer(v) && [a.id, a.handle, a.name].some((n) => v.includes(Buffer.from(n)));
          if (hit) found.push(`${table}.${col}`);
        }
      }
    }
  } finally {
    db.close();
  }
  return found;
}

const identity = (c: Client, name: string) => ({ id: c.user!.id, handle: c.user!.handle, name });

/**
 * A with works in every state (one shared with B, with versions, a published
 * and a withdrawn exhibit, a pending invitation and a third party's favorite),
 * an earlier permanently deleted work, three sessions, and contributions to
 * two of B's works, one of which B has trashed.
 */
async function populated(url: string) {
  const name = `Quillon ${randomUUID().slice(0, 8)}`;
  const a = await new Client(url).register(name);
  const b = await new Client(url).register("Partner");
  const c = await new Client(url).register("Bystander");

  const active = await a.createWork("A active");
  await invite(a, active, b);
  const aw = await open(a, active);
  await place(aw, [0, 0.505, 0]);
  const bInA = await open(b, active);
  await place(bInA, [0, 0.505, 3]);
  const aVersion = await version(aw, "A's version");
  const published = (await a.req("POST", `/api/works/${active}/exhibits`, { snapshotId: aVersion, title: "A published", framing: FRAMING })).body.id as string;
  const withdrawn = (await a.req("POST", `/api/works/${active}/exhibits`, { snapshotId: aVersion, title: "A withdrawn", framing: FRAMING })).body.id as string;
  expect((await a.req("POST", `/api/exhibits/${withdrawn}/withdraw`, { withdrawn: true })).status).toBe(200);
  expect((await c.req("PUT", `/api/favorites/${published}`)).status).toBe(200);
  expect((await a.req("POST", `/api/works/${active}/invite`)).status).toBe(200); // pending, unused
  aw.close();
  bInA.close();

  const archived = await a.createWork("A archived");
  expect((await a.req("POST", `/api/works/${archived}/archive`, { archived: true })).status).toBe(200);
  const trashed = await a.createWork("A trashed");
  expect((await a.req("POST", `/api/works/${trashed}/trash`)).status).toBe(200);
  const purged = await a.createWork("A purged earlier");
  expect((await a.req("POST", `/api/works/${purged}/trash`)).status).toBe(200);
  expect((await a.req("POST", `/api/works/${purged}/delete-permanently`, { title: "A purged earlier" })).status).toBe(200);

  const mine = await b.createWork("B keeps this");
  await invite(b, mine, a);
  const bw = await open(b, mine);
  const aInB = await open(a, mine);
  const aStick = await place(aInB, [0, 0.505, 0]);
  await place(bw, [0, 0.505, 3]);
  const versionByA = await version(aInB, "Saved by A");
  const bExhibit = (await b.req("POST", `/api/works/${mine}/exhibits`, { snapshotId: versionByA, title: "B's exhibit", framing: FRAMING })).body.id as string;
  expect((await a.req("PUT", `/api/favorites/${bExhibit}`)).status).toBe(200);
  aInB.close();

  const shelved = await b.createWork("B shelved");
  await invite(b, shelved, a);
  const aInShelf = await open(a, shelved);
  const shelfStick = await place(aInShelf, [0, 0.505, 0]);
  aInShelf.close();
  expect((await b.req("POST", `/api/works/${shelved}/trash`)).status).toBe(200);

  await relogin(url, a);
  await relogin(url, a);
  return { name, a, b, c, bw, owned: [active, archived, trashed], purged, active, mine, shelved, aStick, shelfStick, versionByA, published, withdrawn, bExhibit };
}

describe("complete deletion in the datastore", () => {
  it("leaves no row or nested field naming the account, keeps the partner's works whole, and survives restart", async () => {
    const dir = disposable();
    const s = await startServer(dir);
    const f = await populated(s.url);
    const r = await del(f.a);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ deleted: true, worksDeleted: 3, storage: { walTruncated: true } });
    f.bw.close();
    await kill(s);

    expect(residue(dir, identity(f.a, f.name))).toEqual([]);
    const db = new Database(join(dir, "stillwood.db"), { readonly: true });
    try {
      const n = (sql: string, ...args: unknown[]): number => (db.prepare(sql).get(...args) as { n: number }).n;
      for (const w of [...f.owned, f.purged]) {
        for (const t of ["work_states", "previous_work_states", "snapshots", "exhibits", "memberships", "invites", "command_receipts"]) {
          expect(n(`SELECT COUNT(*) AS n FROM ${t} WHERE work_id = ?`, w)).toBe(0);
        }
        expect(n("SELECT COUNT(*) AS n FROM works WHERE id = ?", w)).toBe(0);
      }
      expect(n("SELECT COUNT(*) AS n FROM work_tombstones")).toBe(0); // the earlier purge's tombstone named A
      expect(n("SELECT COUNT(*) AS n FROM favorites WHERE exhibit_id IN (?, ?)", f.published, f.withdrawn)).toBe(0); // the bystander's favorite too
      expect(n("SELECT COUNT(*) AS n FROM invite_acceptances a LEFT JOIN invites i ON i.id = a.invite_id WHERE i.id IS NULL")).toBe(0);
      expect(db.prepare("SELECT subject_digest FROM account_deletions").all()).toEqual([{ subject_digest: subject(f.a.user!.id) }]);
      expect(n("SELECT COUNT(*) AS n FROM users")).toBe(2);

      // B's works: de-identified, and every rewritten envelope still passes its integrity check
      for (const table of ["work_states", "previous_work_states"]) {
        for (const row of db.prepare(`SELECT * FROM ${table} WHERE work_id IN (?, ?)`).all(f.mine, f.shelved) as { blob: Buffer; meta: string; checksum: string }[]) {
          expect(checksum(row.blob, row.meta)).toBe(row.checksum);
        }
      }
      const authors = (workId: string): string[] =>
        (JSON.parse((db.prepare("SELECT meta FROM work_states WHERE work_id = ?").get(workId) as { meta: string }).meta).sticks as { authorId: string }[]).map((s) => s.authorId).sort();
      expect(authors(f.mine)).toEqual([f.b.user!.id, "deleted-user"].sort());
      expect(authors(f.shelved)).toEqual(["deleted-user"]); // trashed by B, still de-identified
      const snaps = db.prepare("SELECT * FROM snapshots WHERE work_id = ?").all(f.mine) as { id: string; blob: Buffer; meta: string; checksum: string; creator_id: string | null; geometry: string }[];
      for (const s of snaps) expect(checksum(s.blob, s.meta)).toBe(s.checksum);
      expect(snaps.find((s) => s.id === f.versionByA)!.creator_id).toBeNull();
      expect(JSON.parse(snaps.find((s) => s.id === f.versionByA)!.geometry).sticks.map((s: { authorId: string }) => s.authorId)).toContain("deleted-user");
      expect(JSON.parse((db.prepare("SELECT attribution FROM exhibits WHERE id = ?").get(f.bExhibit) as { attribution: string }).attribution).sort()).toEqual(["Deleted user", "Partner"]);
      expect(db.pragma("foreign_key_check")).toEqual([]);
      expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      db.close();
    }

    // after a restart, B's works load, restore and come back from the trash, de-identified
    const s2 = await startServer(dir);
    const b2 = await relogin(s2.url, f.b);
    const c2 = await relogin(s2.url, f.c);
    expect((await b2.state(f.mine)).body.sticks.find((x: { id: string }) => x.id === f.aStick)).toMatchObject({ authorId: "deleted-user", authorName: "Deleted user" });
    expect((await b2.command(f.mine, "restore", { snapshotId: f.versionByA })).body.outcome).toBe("accepted");
    expect((await b2.state(f.mine)).body.sticks.find((x: { id: string }) => x.id === f.aStick)?.authorName).toBe("Deleted user");
    expect((await b2.req("POST", `/api/works/${f.shelved}/trash/restore`)).status).toBe(200);
    expect((await b2.state(f.shelved)).body.sticks.map((x: { id: string; authorName: string }) => [x.id, x.authorName])).toEqual([[f.shelfStick, "Deleted user"]]);
    expect((await c2.req("GET", "/api/favorites")).body.favorites).toEqual([]);
    for (const w of f.owned) expect((await b2.state(w)).status).toBe(404);
    expect((await new Client(s2.url).login(f.a.user!.handle, PASSWORD)).status).toBe(401);
    await kill(s2);
  }, 120_000);
});

describe("atomicity", () => {
  it("a failure inside the transaction deletes nothing and leaves live rooms running; the retry succeeds", async () => {
    const dir = disposable();
    const s = await startServer(dir);
    const name = `Rollback ${randomUUID().slice(0, 8)}`;
    const a = await new Client(s.url).register(name);
    const b = await new Client(s.url).register("Partner");
    const ownW = await a.createWork("A's own");
    await invite(a, ownW, b);
    const theirs = await b.createWork("B's");
    await invite(b, theirs, a);
    const aw = await open(a, ownW);
    const bInA = await open(b, ownW);
    const aInB = await open(a, theirs);
    const aStick = await place(aInB, [0, 0.505, 0]);
    const v = await version(aInB, "by A");
    const ex = (await b.req("POST", `/api/works/${theirs}/exhibits`, { snapshotId: v, title: "B's", framing: FRAMING })).body.id;

    for (const at of ["after-owned-works", "after-deidentify"]) {
      await a.req("POST", "/api/test/account-fault", { at });
      const r = await del(a);
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("SAVE_FAILED");
      expect(r.body.error.message).toMatch(/Nothing was deleted/);
      expect((await a.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id).sort()).toEqual([ownW, theirs].sort());
      expect((await b.state(ownW)).status).toBe(200);
      expect((await b.state(theirs)).body.sticks.find((x: { id: string }) => x.id === aStick).authorName).toBe(name);
      expect((await b.req("GET", `/api/works/${theirs}/versions`)).body.versions.find((x: { id: string }) => x.id === v).creatorName).toBe(name);
      expect((await new Client(s.url).req("GET", `/api/exhibits/${ex}`)).body.attribution).toContain(name);
    }
    // nothing in memory was touched: every window is still connected and can build
    for (const w of [aw, bInA, aInB]) expect(w.messages.some((m) => m.type === "access.ended")).toBe(false);
    await place(aw, [0, 0.505, 3]);
    await place(bInA, [0, 0.505, 6]);

    await a.req("POST", "/api/test/account-fault", { at: null });
    expect((await del(a)).status).toBe(200);
    expect((await bInA.waitFor((m) => m.type === "access.ended", 3000)).reason).toBe("WORK_DELETED");
    await kill(s);
    expect(residue(dir, identity(a, name))).toEqual([]);
  }, 120_000);
});

describe("interleavings at the point between the password check and the commit", () => {
  const L = "account-delete:verified";
  async function latched(url: string, a: Client, during: () => Promise<void>) {
    const ctl = new Client(url);
    await ctl.req("POST", "/api/test/latch", { name: L, op: "arm" });
    const pending = del(a);
    for (let i = 0; !(await ctl.req("GET", `/api/test/latch/${L}`)).body.reached; i++) {
      if (i > 500) throw new Error("latch never reached");
      await sleep(10);
    }
    await during();
    await ctl.req("POST", "/api/test/latch", { name: L, op: "release" });
    return pending;
  }

  it("placement, work creation, sign-in and invitation acceptance that commit first are all swept up; a recovery or credential change stops the deletion", async () => {
    const dir = disposable();
    const s = await startServer(dir);
    const b = await new Client(s.url).register("Partner");
    const created: string[] = [];

    // a placement in A's work commits before the deletion
    const a1 = await new Client(s.url).register("Placer");
    const w1 = await a1.createWork("Placed into");
    created.push(w1);
    await invite(a1, w1, b);
    const a1w = await open(a1, w1);
    const r1 = await latched(s.url, a1, async () => void (await place(a1w, [0, 0.505, 0])));
    expect(r1.status).toBe(200);
    expect((await b.state(w1)).status).toBe(404);
    expect((await b.req("GET", `/api/test/room/${w1}`)).body).toBeNull();

    // a work created while the password was being checked is deleted too
    const a2 = await new Client(s.url).register("Creator");
    created.push(await a2.createWork("Before"));
    const r2 = await latched(s.url, a2, async () => void created.push(await a2.createWork("During")));
    expect(r2.body.worksDeleted).toBe(2);

    // a session signed in meanwhile dies with the rest
    const a3 = await new Client(s.url).register("Signer");
    let late: Client | null = null;
    expect((await latched(s.url, a3, async () => void (late = await relogin(s.url, a3)))).status).toBe(200);
    expect((await late!.req("GET", "/api/works")).status).toBe(401);

    // a membership gained meanwhile is removed
    const a4 = await new Client(s.url).register("Joiner");
    const bWork = await b.createWork("B's");
    const token = (await b.req("POST", `/api/works/${bWork}/invite`)).body.path.split("token=")[1];
    expect((await latched(s.url, a4, async () => void expect((await a4.req("POST", "/api/invites/accept", { token })).status).toBe(200))).status).toBe(200);
    expect((await b.req("GET", `/api/works/${bWork}`)).body.members.map((m: { userId: string }) => m.userId)).toEqual([b.user!.id]);

    // a recovery meanwhile revokes the deleting session: nothing is deleted
    const a5 = await new Client(s.url).register("Recoverer");
    const keep = await a5.createWork("Kept");
    const r5 = await latched(s.url, a5, async () => {
      const rec = await new Client(s.url).req("POST", "/api/auth/recover", { handle: a5.user!.handle, recoveryCode: a5.recoveryCode, newPassword: "a brand new password" });
      expect(rec.status).toBe(200);
    });
    expect(r5.status).toBe(401);
    const back = new Client(s.url);
    expect((await back.login(a5.user!.handle, "a brand new password")).status).toBe(200);
    expect((await back.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).toEqual([keep]);

    // so does any change to the stored credential after it was verified
    const a6 = await new Client(s.url).register("Changed");
    const r6 = await latched(s.url, a6, async () => {
      const db = new Database(join(dir, "stillwood.db"));
      db.prepare("UPDATE users SET pw_hash = pw_hash || 'x' WHERE id = ?").run(a6.user!.id);
      db.close();
    });
    expect(r6.status).toBe(401);
    expect(r6.body.error.code).toBe("BAD_CREDENTIALS");
    expect((await a6.req("GET", "/api/works")).status).toBe(200);

    await kill(s);
    const db = new Database(join(dir, "stillwood.db"), { readonly: true });
    try {
      for (const w of created) expect(db.prepare("SELECT COUNT(*) AS n FROM works WHERE id = ?").get(w)).toEqual({ n: 0 });
      for (const w of created) expect(db.prepare("SELECT COUNT(*) AS n FROM work_states WHERE work_id = ?").get(w)).toEqual({ n: 0 });
      for (const c of [a1, a2, a3, a4]) expect(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(c.user!.id)).toEqual({ n: 0 });
      expect(db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 3 }); // B, the recoverer, the changed one
    } finally {
      db.close();
    }
  }, 120_000);

  it("after the commit, late commands, joins and a moving room's autosave can't write the work back", async () => {
    const dir = disposable();
    const s = await startServer(dir);
    const a = await new Client(s.url).register("Mover");
    const b = await new Client(s.url).register("Partner");
    const w = await a.createWork("Still falling");
    await invite(a, w, b);
    const aw = await open(a, w);
    const bw = await open(b, w);
    await place(aw, [0, 4, 0]); // dropped from height: the room checkpoints every 500 ms while it moves
    expect((await a.req("GET", `/api/test/room/${w}`)).body.stable).toBe(false);
    expect((await del(a)).status).toBe(200);
    expect((await a.req("GET", `/api/test/room/${w}`)).body).toBeNull();
    // B's window was told; a command it sends anyway is refused, and so is a join
    expect((await bw.waitFor((m) => m.type === "access.ended", 3000)).reason).toBe("WORK_DELETED");
    const late = await bw.result(bw.command("place", { pose: { p: [0, 0.505, 3], q: FLAT } }));
    expect(late.code).toBe("NOT_FOUND");
    bw.send({ type: "room.join", workId: w });
    expect((await bw.waitFor((m) => m.type === "error")).code).toBe("NOT_FOUND");
    const http = await b.command(w, "place", { pose: { p: [0, 0.505, 3], q: FLAT } }, { epoch: 1, streamId: bw.snapshot.streamId, tick: 0 });
    expect(http.status).toBe(404);
    await sleep(1500); // three checkpoint periods
    await kill(s);
    const db = new Database(join(dir, "stillwood.db"), { readonly: true });
    try {
      for (const t of ["work_states", "previous_work_states", "command_receipts"]) expect(db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE work_id = ?`).get(w)).toEqual({ n: 0 });
      expect(db.prepare("SELECT COUNT(*) AS n FROM works WHERE id = ?").get(w)).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  }, 120_000);
});

describe("after the commit", () => {
  it("a failed notification doesn't undo the deletion: access is refused from the database and the heartbeat tells the window", async () => {
    const dir = disposable();
    const s = await startServer(dir);
    const a = await new Client(s.url).register("Quiet");
    const b = await new Client(s.url).register("Partner");
    const w = await a.createWork("Unannounced");
    await invite(a, w, b);
    const bw = await open(b, w);
    const other = await relogin(s.url, a);
    const ow = await open(other);
    await a.req("POST", "/api/test/fail-notify", { on: true });
    const r = await del(a);
    expect(r.status).toBe(200);
    expect(r.body.deleted).toBe(true);
    expect(r.body.notifications.failed).toBeGreaterThan(0);
    await sleep(300);
    expect(bw.messages.some((m) => m.type === "access.ended")).toBe(false);
    // authorization doesn't depend on the notification
    expect((await bw.result(bw.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }))).code).toBe("NOT_FOUND");
    expect((await other.req("GET", "/api/works")).status).toBe(401);
    await expect(Window.open(other)).rejects.toThrow(/401/);
    ow.send({ type: "room.join", workId: w }); // a dropped connection's messages go nowhere
    // within one heartbeat the window learns from the database
    expect((await bw.waitFor((m) => m.type === "access.ended", 8000)).reason).toBe("WORK_DELETED");
    await kill(s);
  }, 60_000);

  it("a crash right after the commit keeps the deletion; restart restores nothing", async () => {
    const dir = disposable();
    const s = await startServer(dir, { CRASH_AT: "account-delete-after-commit" });
    const name = `Crash ${randomUUID().slice(0, 8)}`;
    const a = await new Client(s.url).register(name);
    const b = await new Client(s.url).register("Partner");
    const own = await a.createWork("A's");
    const theirs = await b.createWork("B's");
    await invite(b, theirs, a);
    const aInB = await open(a, theirs);
    const stick = await place(aInB, [0, 0.505, 0]);
    await expect(del(a)).rejects.toThrow(); // the process died before answering: the client can't know
    await s.exited;

    const s2 = await startServer(dir);
    expect((await new Client(s2.url).login(a.user!.handle, PASSWORD)).status).toBe(401);
    const old = new Client(s2.url);
    old.cookie = a.cookie;
    expect((await old.req("GET", "/api/works")).status).toBe(401);
    const b2 = await relogin(s2.url, b);
    expect((await b2.state(own)).status).toBe(404);
    expect((await b2.state(theirs)).body.sticks.find((x: { id: string }) => x.id === stick).authorName).toBe("Deleted user");
    await kill(s2);
    expect(residue(dir, identity(a, name))).toEqual([]);
  }, 60_000);
});

describe("restoring a backup", () => {
  it("re-deletes, at startup, an account deleted after the backup was taken", async () => {
    const dir = disposable();
    const backupDir = disposable();
    const s1 = await startServer(dir);
    const name = `Backed ${randomUUID().slice(0, 8)}`;
    const a = await new Client(s1.url).register(name);
    const b = await new Client(s1.url).register("Partner");
    await a.createWork("In the backup");
    const theirs = await b.createWork("B's");
    await invite(b, theirs, a);
    const aInB = await open(a, theirs);
    await place(aInB, [0, 0.505, 0]);
    aInB.close();
    await kill(s1);
    const live = new Database(join(dir, "stillwood.db"));
    await live.backup(join(backupDir, "stillwood.db"));
    live.close();

    const s2 = await startServer(dir);
    expect((await del(await relogin(s2.url, a))).status).toBe(200);
    await kill(s2);

    // the runbook's restore: carry the deletion records into the restored file, then start
    const carry = spawn(process.execPath, ["scripts/carry-deletions.ts", join(dir, "stillwood.db"), backupDir], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    carry.stdout!.on("data", (d) => (out += d));
    expect(await new Promise((r) => carry.on("exit", r))).toBe(0);
    expect(JSON.parse(out)).toEqual({ records: 1, added: 1 });

    const s3 = await startServer(backupDir);
    expect((await new Client(s3.url).login(a.user!.handle, PASSWORD)).status).toBe(401);
    const b3 = await relogin(s3.url, b);
    expect(JSON.stringify((await b3.state(theirs)).body)).not.toContain(name);
    await kill(s3);
    expect(residue(backupDir, identity(a, name))).toEqual([]);
  }, 90_000);
});
