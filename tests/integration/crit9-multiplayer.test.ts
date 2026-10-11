// Crit 9 local multiplayer checks at the protocol level (`pnpm test:integration`,
// which builds first: each server here is the production bundle; report:
// docs/evidence/crit-9-local-multiplayer-report.md). Each describe block runs
// its own production-build server on 127.0.0.1 with a fresh database in a
// disposable directory under CRIT9_RUN_DIR (or the OS temp dir). Races are
// ordered by sending prepared messages back to back, never by sleeping.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import WebSocket from "ws";
import { afterAll, describe, expect, it } from "vitest";
import { Client, FLAT, Window, sleep } from "../../spec/helpers.ts";

const RUN = process.env.CRIT9_RUN_ID ?? `local-${Date.now()}`;
const ROOT = realpathSync(process.env.CRIT9_RUN_DIR ? join(process.env.CRIT9_RUN_DIR, "tmp") : tmpdir());
const REPO = resolve(import.meta.dirname, "../..");
if (!(ROOT === "/tmp" || ROOT.startsWith("/tmp/")) || ROOT.startsWith(REPO)) throw new Error(`refusing a non-disposable root: ${ROOT}`);

const observations: Record<string, unknown> = {};
const note = (id: string, obs: unknown): void => void (observations[id] = obs);
const dirs: string[] = [];
const procs: ChildProcess[] = [];
const windows: (Window | WebSocket)[] = [];
afterAll(() => {
  for (const w of windows) w.close();
  for (const p of procs) p.kill("SIGKILL");
  if (process.env.CRIT9_EVIDENCE_DIR) writeFileSync(join(process.env.CRIT9_EVIDENCE_DIR, "protocol-observations.json"), JSON.stringify(observations, null, 2));
  for (const d of dirs) if (realpathSync(d).startsWith(ROOT + "/")) rmSync(d, { recursive: true, force: true });
});

const disposable = (): string => {
  const d = realpathSync(mkdtempSync(join(ROOT, "c9-")));
  if (!d.startsWith(ROOT + "/")) throw new Error(`escaped: ${d}`);
  dirs.push(d);
  return d;
};

let nextPort = 19800 + Math.floor(Math.random() * 150);
interface Server {
  url: string;
  dir: string;
  proc: ChildProcess;
  exited: Promise<unknown>;
}
async function startServer(dir = disposable()): Promise<Server> {
  const port = nextPort++;
  mkdirSync(join(dir, "data"), { recursive: true }); // production refuses a missing mount
  // Only what the server needs; production mode, so no test hooks.
  const env = { PATH: process.env.PATH!, HOME: dir, TMPDIR: dir, NODE_ENV: "production", COOKIE_SECURE: "0", DATA_DIR: join(dir, "data"), PORT: String(port) };
  const proc = spawn(process.execPath, ["dist/server/main.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
  procs.push(proc);
  const logs: string[] = [];
  proc.stdout!.on("data", (d) => logs.push(String(d)));
  proc.stderr!.on("data", (d) => logs.push(String(d)));
  const exited = new Promise((r) => proc.on("exit", r));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/readyz`)).ok) return { url, dir, proc, exited };
    } catch {
      // not up
    }
    await sleep(100);
  }
  throw new Error(`server did not start: ${logs.join("")}`);
}
const stop = async (s: Server, signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
  s.proc.kill(signal);
  await s.exited;
};

const label = (r: string): string => `c9 ${RUN.slice(-6)} ${r}`;
const pose = (x: number, z: number, y = 0.505) => ({ p: [x, y, z] as [number, number, number], q: FLAT });
const COLS = [-5, 5];
const spot = (k: number) => pose(COLS[k % 2]!, -8 + 2 * Math.floor(k / 2));

async function open(c: Client, workId?: string): Promise<Window> {
  const w = await Window.open(c, workId);
  windows.push(w);
  return w;
}
/** Every message a window receives, never consumed by waitFor. */
function tap(w: Window): any[] {
  const all: any[] = [];
  w.ws.on("message", (d) => all.push(JSON.parse(String(d))));
  return all;
}
const placeMsg = (w: Window, p: ReturnType<typeof pose>, commandId = randomUUID()) => ({
  v: 1,
  type: "command",
  commandId,
  workId: w.snapshot.workId,
  worldEpoch: w.snapshot.epoch,
  streamId: w.snapshot.streamId,
  lastSeenTick: w.lastTick(),
  leaseId: w.snapshot.lease?.leaseId ?? "",
  kind: "place",
  payload: { pose: p },
});
async function invite(owner: Client, workId: string, ...guests: Client[]): Promise<string> {
  const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
  for (const g of guests) expect((await g.req("POST", "/api/invites/accept", { token })).status).toBe(200);
  return token;
}
async function team(url: string) {
  const [A, B, C, D] = await Promise.all(["A", "B", "C", "D"].map((r) => new Client(url).register(label(r))));
  const W = await A!.createWork(label("W"));
  await invite(A!, W, B!, C!);
  const X = await B!.createWork(label("X"));
  await invite(B!, X, A!);
  return { A: A!, B: B!, C: C!, D: D!, W, X };
}
const ids = async (c: Client, workId: string): Promise<string[]> => (await c.state(workId)).body.sticks.map((s: { id: string }) => s.id).sort();
const added = (log: any[]): string[] => log.filter((m) => m.type === "sticks.added").flatMap((m) => m.sticks.map((s: { id: string }) => s.id));
async function version(w: Window, title: string): Promise<string> {
  const id = w.command("snapshot.create", { title, whenSettled: true });
  const r = await w.waitFor((m) => m.type === "command.result" && m.commandId === id && m.outcome !== "pending", 20_000);
  expect(r.outcome).toBe("accepted");
  return r.snapshotId;
}

describe("M01 identities, invitation and outsiders", () => {
  it("distinct identities, roles from the invitation, outsider refused by ID", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const userIds = [t.A, t.B, t.C, t.D].map((c) => c.user!.id);
    expect(new Set(userIds).size).toBe(4);
    const roles = Object.fromEntries((await t.A.req("GET", `/api/works/${t.W}`)).body.members.map((m: { userId: string; role: string }) => [m.userId, m.role]));
    expect(roles).toEqual({ [t.A.user!.id]: "owner", [t.B.user!.id]: "editor", [t.C.user!.id]: "editor" });
    const [wa, wb, wc] = [await open(t.A, t.W), await open(t.B, t.W), await open(t.C, t.W)];
    expect(new Set([wa, wb, wc].map((w) => w.snapshot.streamId)).size).toBe(1);
    // D knows the work ID: HTTP, socket join and a command are all refused without content
    const state = await t.D.state(t.W);
    const info = await t.D.req("GET", `/api/works/${t.W}`);
    const wd = await open(t.D);
    wd.send({ type: "room.join", workId: t.W });
    const joinErr = await wd.waitFor((m) => m.type === "error");
    const cmd = await t.D.command(t.W, "place", { pose: spot(0) }, { epoch: 1, streamId: wa.snapshot.streamId, tick: 0 });
    const leaked = JSON.stringify([state.body, info.body, joinErr, cmd.body]);
    expect([state.status, info.status, joinErr.code, cmd.status]).toEqual([404, 404, "NOT_FOUND", 404]);
    expect(leaked).not.toContain(label("W"));
    expect(leaked).not.toContain(t.A.user!.id);
    expect(await ids(t.A, t.W)).toEqual([]);
    note("M01", { distinctUserIds: 4, roles: Object.values(roles), sameStream: true, outsider: { state: state.status, info: info.status, join: joinErr.code, command: cmd.status, bodyLeaksTitleOrOwner: false } });
    await stop(s);
  });
});

describe("M03 ghosts and presence", () => {
  it("ghosts carry the right person, never become sticks, and clear on end, leave, disconnect and heartbeat timeout", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    const wb = await open(t.B, t.W);
    const bLog = tap(wb);
    wa.send({ type: "draft.start", seq: 1, epoch: wa.snapshot.epoch, pose: spot(0) });
    const ghost = await wb.waitFor((m) => m.type === "draft.pose" && m.userId === t.A.user!.id);
    expect(ghost).toMatchObject({ displayName: label("A"), leaseId: wa.snapshot.lease.leaseId });
    wa.send({ type: "draft.pose", seq: 2, epoch: wa.snapshot.epoch, pose: spot(1) });
    const moved = await wb.waitFor((m) => m.type === "draft.pose" && m.seq === 2);
    expect(moved.pose.p).toEqual(spot(1).p);
    // a window joining now gets the ghost in its snapshot, separately from sticks
    const wc = await open(t.C, t.W);
    expect(wc.snapshot.drafts.map((d: { userId: string }) => d.userId)).toEqual([t.A.user!.id]);
    expect(wc.snapshot.sticks).toEqual([]);
    // committing at the ghost's pose adds exactly one stick
    const r = await wa.result(wa.command("place", { pose: spot(1) }));
    expect(r.outcome).toBe("accepted");
    await wc.waitFor((m) => m.type === "sticks.added");
    wa.send({ type: "draft.end", seq: 3 });
    await wb.waitFor((m) => m.type === "draft.removed" && m.leaseId === ghost.leaseId);
    expect(added(bLog)).toEqual([r.stickId]);
    expect(await ids(t.C, t.W)).toEqual([r.stickId]);
    // leaving and disconnecting both clear the ghost and the presence entry
    wa.send({ type: "draft.start", seq: 4, epoch: wa.snapshot.epoch, pose: spot(2) });
    await wb.waitFor((m) => m.type === "draft.pose" && m.seq === 4);
    wa.send({ type: "room.leave" });
    await wb.waitFor((m) => m.type === "draft.removed");
    const afterLeave = await wb.waitFor((m) => m.type === "presence" && !m.presence.some((p: { userId: string }) => p.userId === t.A.user!.id));
    const wa2 = await open(t.A, t.W);
    wa2.send({ type: "draft.start", seq: 1, epoch: wa2.snapshot.epoch, pose: spot(2) });
    await wb.waitFor((m) => m.type === "draft.pose" && m.userId === t.A.user!.id);
    const t0 = performance.now();
    wa2.ws.terminate();
    await wb.waitFor((m) => m.type === "draft.removed");
    const disconnectMs = performance.now() - t0;
    // a socket that stays open but stops its heartbeats is dropped after the documented 15 s
    const raw = new WebSocket(new URL("/ws", s.url.replace("http", "ws")), { headers: { cookie: t.A.cookie, origin: s.url } });
    windows.push(raw);
    await new Promise((r) => raw.once("open", r));
    const rawMsgs: any[] = [];
    raw.on("message", (d) => rawMsgs.push(JSON.parse(String(d))));
    raw.send(JSON.stringify({ type: "hello", csrf: t.A.csrf }));
    raw.send(JSON.stringify({ type: "room.join", workId: t.W }));
    for (let i = 0; i < 50 && !rawMsgs.some((m) => m.type === "room.snapshot"); i++) await sleep(50);
    const snap = rawMsgs.find((m) => m.type === "room.snapshot");
    raw.send(JSON.stringify({ type: "draft.start", seq: 1, epoch: snap.epoch, pose: spot(3) }));
    await wb.waitFor((m) => m.type === "draft.pose" && m.userId === t.A.user!.id);
    const t1 = performance.now();
    await wb.waitFor((m) => m.type === "draft.removed", 25_000);
    const staleMs = performance.now() - t1;
    expect(staleMs).toBeGreaterThan(14_000);
    expect(staleMs).toBeLessThan(18_000);
    expect(await ids(t.B, t.W)).toEqual([r.stickId]); // no ghost became a stick
    note("M03", {
      ghostCarries: ["userId", "displayName", "leaseId", "color"],
      joinerSnapshotDrafts: 1,
      joinerSnapshotSticks: 0,
      sticksAddedAfterPlace: 1,
      presenceAfterLeave: afterLeave.presence.map((p: { displayName: string }) => p.displayName),
      ghostClearedAfterDisconnectMs: Math.round(disconnectMs),
      ghostClearedAfterSilentSocketMs: Math.round(staleMs),
    });
    await stop(s);
  }, 60_000);
});

describe("M04/M05 simultaneous placements", () => {
  it("M04 disjoint placements sent back to back are both accepted, once each, in one agreed order", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const [wa, wb, wc] = [await open(t.A, t.W), await open(t.B, t.W), await open(t.C, t.W)];
    const logs = [wa, wb, wc].map(tap);
    const rounds: unknown[] = [];
    let k = 0;
    for (const order of ["AB", "BA", "AB", "BA", "AB", "BA"]) {
      const ma = placeMsg(wa, spot(k++));
      const mb = placeMsg(wb, spot(k++));
      // both prepared against the same view; sent in one synchronous block
      if (order === "AB") (wa.send(ma), wb.send(mb));
      else (wb.send(mb), wa.send(ma));
      const [ra, rb] = await Promise.all([wa.result(ma.commandId), wb.result(mb.commandId)]);
      rounds.push({ order, a: [ra.outcome, ra.seq], b: [rb.outcome, rb.seq] });
      expect([ra.outcome, rb.outcome]).toEqual(["accepted", "accepted"]);
      expect(Math.abs(ra.seq - rb.seq)).toBe(1);
      await sleep(1100); // each account stays under 2 commands/s
    }
    const final = await ids(t.A, t.W);
    expect(final).toHaveLength(12);
    for (const log of logs) {
      const seen = added(log);
      expect(seen.sort()).toEqual(final); // every window: each accepted stick exactly once
    }
    // commit order is the same for everyone: sticks.added seq values match across windows
    const seqs = logs.map((log) => log.filter((m) => m.type === "sticks.added").map((m) => `${m.seq}:${m.sticks[0].id}`));
    expect(seqs[1]).toEqual(seqs[0]);
    expect(seqs[2]).toEqual(seqs[0]);
    note("M04", { rounds, accepted: 12, rejected: 0, persisted: final.length, perWindowAdded: logs.map((l) => added(l).length), identicalOrderAcrossWindows: true });
    await stop(s);
  }, 60_000);

  it("M05 identical placements: exactly one wins, the loser gets COLLISION, nothing phantom; restore vs placement uses epochs", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const [wa, wb, wc] = [await open(t.A, t.W), await open(t.B, t.W), await open(t.C, t.W)];
    const logs = [wa, wb, wc].map(tap);
    const rounds: unknown[] = [];
    for (const [i, order] of ["AB", "BA", "AB", "BA"].entries()) {
      const p = spot(i);
      const ma = placeMsg(wa, p);
      const mb = placeMsg(wb, p);
      if (order === "AB") (wa.send(ma), wb.send(mb));
      else (wb.send(mb), wa.send(ma));
      const [ra, rb] = await Promise.all([wa.result(ma.commandId), wb.result(mb.commandId)]);
      const outcomes = [ra.outcome, rb.outcome].sort();
      expect(outcomes).toEqual(["accepted", "rejected"]);
      const loser = ra.outcome === "rejected" ? ra : rb;
      expect(loser.code).toBe("COLLISION");
      expect(loser.message).toMatch(/intersects/);
      // the rejection is a durable receipt: asking again by the same ID gives the same answer
      const q = await (ra.outcome === "rejected" ? t.A : t.B).req("GET", `/api/commands/${loser.commandId}`);
      rounds.push({ order, winner: ra.outcome === "accepted" ? "A" : "B", loserCode: loser.code, loserQuery: [q.body.outcome, q.body.code] });
      await sleep(1100);
    }
    const final = await ids(t.A, t.W);
    expect(final).toHaveLength(4);
    for (const log of logs) expect(added(log).sort()).toEqual(final);

    // lifecycle conflict: the owner restores while an editor's placement is prepared against the old world
    const v = await version(wa, "before more");
    await sleep(600);
    const stale = placeMsg(wb, spot(10));
    const rr = await wa.result(wa.command("restore", { snapshotId: v }));
    expect(rr.outcome).toBe("accepted");
    wb.send(stale);
    const sr = await wb.result(stale.commandId);
    expect(sr.code).toBe("STALE_WORLD");
    await wb.waitFor((m) => m.type === "room.snapshot" && m.epoch === rr.epoch);
    await sleep(600);
    const fresh = await wb.result(wb.command("place", { pose: spot(10) }));
    expect(fresh.outcome).toBe("accepted");
    // and the opposite order: the placement commits first, then a restore resets it, but a recovery point keeps it
    await sleep(1100);
    const first = placeMsg(wb, spot(11));
    wb.send(first);
    const fr = await wb.result(first.commandId);
    expect(fr.outcome).toBe("accepted");
    await wa.waitFor((m) => m.type === "sticks.added" && m.sticks[0].id === fr.stickId);
    const rr2 = await wa.result(wa.command("restore", { snapshotId: v }));
    expect(rr2.outcome).toBe("accepted");
    const versions = (await t.A.req("GET", `/api/works/${t.W}/versions`)).body.versions;
    const protect = versions.find((x: { kind: string; title: string }) => x.kind === "restore-protect" && x.title.includes("before more"));
    const geo = await t.A.req("GET", `/api/works/${t.W}/versions/${protect.id}/geometry`);
    const kept = geo.body.sticks.some((st: { id: string }) => st.id === fr.stickId);
    expect(kept).toBe(true);
    expect(await ids(t.A, t.W)).not.toContain(fr.stickId);
    note("M05", { identicalPoseRounds: rounds, persistedAfterRounds: final.length, perWindowAdded: logs.map((l) => added(l).length), restoreFirst: { placement: sr.code, retryAfterSnapshot: fresh.outcome }, placementFirst: { placement: fr.outcome, removedByRestore: true, keptInRecoveryPoint: kept } });
    await stop(s);
  }, 90_000);
});

describe("M06 rapid alternation and limits", () => {
  it("round-robin within limits converges; a burst past the per-account limit is refused with a retry time; a fourth room is offline", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const ws = [await open(t.A, t.W), await open(t.B, t.W), await open(t.C, t.W)];
    const logs = ws.map(tap);
    const seqs: number[] = [];
    for (let k = 0; k < 12; k++) {
      const w = ws[k % 3]!;
      const r = await w.result(w.command("place", { pose: spot(k) }));
      expect(r.outcome).toBe("accepted");
      seqs.push(r.seq);
      await sleep(260);
    }
    expect(seqs).toEqual(seqs.map((_, i) => seqs[0]! + i));
    const final = await ids(t.A, t.W);
    for (const log of logs) expect(added(log).sort()).toEqual(final);
    // burst: one account sends 7 at once (limit: 2/s, burst 4)
    await sleep(2500);
    const wa = ws[0]!;
    const burst = Array.from({ length: 7 }, (_, i) => placeMsg(wa, pose(0, -8 + 2 * i, 6.5)));
    for (const m of burst) wa.send(m);
    const results = await Promise.all(burst.map((m) => wa.result(m.commandId)));
    const accepted = results.filter((r) => r.outcome === "accepted").length;
    const limited = results.filter((r) => r.code === "RATE_LIMITED");
    expect(accepted).toBeGreaterThanOrEqual(4);
    expect(accepted).toBeLessThanOrEqual(5);
    expect(limited.length).toBe(7 - accepted);
    expect(limited.every((r) => r.retryAfterMs > 0 && /try again/i.test(r.message))).toBe(true);
    await sleep(Math.max(...limited.map((r) => r.retryAfterMs)) + 100);
    const after = await wa.result(wa.command("place", { pose: pose(0, 8, 9) }));
    expect(after.outcome).toBe("accepted");
    // room limit: three occupied rooms, then a fourth join gets the saved state, not a live room
    const extra = [await t.A.createWork(label("R1")), await t.A.createWork(label("R2")), await t.A.createWork(label("R3"))];
    const r1 = await open(t.A, extra[0]);
    const r2 = await open(t.A, extra[1]);
    const fourth = await open(t.A);
    const snap = await fourth.join(extra[2]!);
    expect(snap.live).toBe(false);
    expect(snap.liveReason).toBe("ROOM_LIMIT");
    r1.close();
    r2.close();
    await sleep(500);
    const retry = await fourth.join(extra[2]!);
    note("M06", {
      roundRobin: { accepted: 12, seqContiguous: true, perWindowAdded: logs.map((l) => added(l).length) },
      burst: { sent: 7, accepted, rateLimited: limited.length, retryAfterMs: limited.map((r) => r.retryAfterMs), recoveredAfterWait: after.outcome },
      roomLimit: { liveRooms: 3, fourthJoin: snap.liveReason, liveAfterTwoRoomsEmptied: retry.live },
    });
    expect(retry.live).toBe(true);
    await stop(s);
  }, 90_000);
});

describe("M07 join during editing", () => {
  it("snapshot plus later events add up to the same set, with the join on either side of a commit", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    const wb = await open(t.B, t.W);
    wa.send({ type: "draft.start", seq: 1, epoch: wa.snapshot.epoch, pose: pose(0, 0, 3) });
    await wb.waitFor((m) => m.type === "draft.pose");
    const handoffs: unknown[] = [];
    let k = 0;
    for (const joinFirst of [false, true]) {
      for (let i = 0; i < 3; i++) {
        const w = [wa, wb][k % 2]!;
        await w.result(w.command("place", { pose: spot(k++) }));
        await sleep(600);
      }
      const wc = await open(t.C);
      const cLog = tap(wc);
      const w = [wa, wb][k % 2]!;
      const m = placeMsg(w, spot(k++));
      if (joinFirst) (wc.send({ type: "room.join", workId: t.W }), w.send(m));
      else (w.send(m), wc.send({ type: "room.join", workId: t.W }));
      const r = await w.result(m.commandId);
      const snap = await wc.waitFor((x) => x.type === "room.snapshot");
      for (let i = 0; i < 3; i++) {
        const w2 = [wa, wb][k % 2]!;
        await w2.result(w2.command("place", { pose: spot(k++) }));
        await sleep(600);
      }
      await sleep(200);
      const fromSnapshot = snap.sticks.map((x: { id: string }) => x.id);
      const later = added(cLog);
      const overlap = later.filter((id) => fromSnapshot.includes(id));
      const union = [...new Set([...fromSnapshot, ...later])].sort();
      const server = await ids(t.A, t.W);
      expect(union).toEqual(server);
      expect(overlap).toEqual([]);
      handoffs.push({
        order: joinFirst ? "join then commit" : "commit then join",
        racedStickIn: fromSnapshot.includes(r.stickId) ? "snapshot" : later.includes(r.stickId) ? "sticks.added" : "missing",
        snapshotSticks: fromSnapshot.length,
        laterEvents: later.length,
        overlap: overlap.length,
        matchesServer: true,
        snapshotPresence: snap.presence.map((p: { displayName: string }) => p.displayName).sort(),
        snapshotGhosts: snap.drafts.map((d: { displayName: string }) => d.displayName),
      });
      wc.close();
      await sleep(300);
    }
    note("M07", handoffs);
    await stop(s);
  }, 90_000);
});

describe("M08 reconnect bookkeeping", () => {
  it("repeated reconnects leave one membership, one presence entry and no stale sockets or ghosts", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    for (let i = 0; i < 3; i++) {
      const wb = await open(t.B, t.W);
      wb.send({ type: "draft.start", seq: 1, epoch: wb.snapshot.epoch, pose: spot(9) });
      await wa.waitFor((m) => m.type === "draft.pose" && m.userId === t.B.user!.id);
      wb.ws.terminate();
      await wa.waitFor((m) => m.type === "draft.removed");
      await wa.result(wa.command("place", { pose: spot(i) }));
      await sleep(600);
    }
    const wb = await open(t.B, t.W);
    expect(wb.snapshot.sticks.map((x: { id: string }) => x.id).sort()).toEqual(await ids(t.A, t.W));
    expect(wb.snapshot.drafts).toEqual([]);
    const bPresence = wb.snapshot.presence.filter((p: { userId: string }) => p.userId === t.B.user!.id);
    const members = (await t.A.req("GET", `/api/works/${t.W}`)).body.members.length;
    const ready = (await (await fetch(`${s.url}/readyz`)).json()) as { conns: number; sockets: number };
    expect(bPresence).toEqual([expect.objectContaining({ connections: 1 })]);
    expect(members).toBe(3);
    expect(ready.conns).toBe(2);
    note("M08-protocol", { cycles: 3, sticksAfter: wb.snapshot.sticks.length, ghostsAfter: 0, bPresenceEntries: bPresence.length, bConnections: bPresence[0].connections, members, serverConns: ready.conns, serverSockets: ready.sockets });
    await stop(s);
  }, 60_000);
});

describe("M10 work isolation", () => {
  it("nothing from W reaches a window on X; mismatched work IDs are refused and both rooms carry on", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    const wbW = await open(t.B, t.W);
    const wbX = await open(t.B, t.X);
    const xLog = tap(wbX);
    const wc = await open(t.C, t.W);
    wa.send({ type: "draft.start", seq: 1, epoch: wa.snapshot.epoch, pose: spot(0) });
    await wbW.waitFor((m) => m.type === "draft.pose");
    const r = await wa.result(wa.command("place", { pose: spot(0) }));
    expect((await t.A.req("DELETE", `/api/works/${t.W}/members/${t.C.user!.id}`)).status).toBe(200);
    await wc.waitFor((m) => m.type === "access.ended");
    await sleep(300);
    const leak = JSON.stringify(xLog);
    expect(leak).not.toContain(t.W);
    expect(leak).not.toContain(r.stickId);
    expect(xLog.filter((m) => m.type === "draft.pose" || m.type === "sticks.added")).toEqual([]);
    // C (no longer a member of W, never of X) and D send commands naming X with W's stream
    const forged = await t.D.command(t.X, "place", { pose: spot(1) }, { epoch: wbW.snapshot.epoch, streamId: wbW.snapshot.streamId, tick: 0 });
    const exC = await t.C.command(t.X, "place", { pose: spot(1) }, { epoch: 1, streamId: wbW.snapshot.streamId, tick: 0 });
    // A is a member of both: X's ID with W's stream must not land in either room
    const crossed = await t.A.command(t.X, "place", { pose: spot(1) }, { epoch: wbW.snapshot.epoch, streamId: wbW.snapshot.streamId, tick: 0, leaseId: wa.snapshot.lease.leaseId });
    expect([forged.status, exC.status]).toEqual([404, 404]);
    expect(crossed.body.code).toBe("STALE_VIEW");
    expect(await ids(t.B, t.X)).toEqual([]);
    expect(await ids(t.B, t.W)).toEqual([r.stickId]);
    await sleep(600);
    expect((await wbX.result(wbX.command("place", { pose: spot(2) }))).outcome).toBe("accepted");
    expect((await wbW.result(wbW.command("place", { pose: spot(3) }))).outcome).toBe("accepted");
    note("M10", { messagesOnXFromW: 0, outsiderCommandOnX: forged.status, removedEditorCommandOnX: exC.status, memberCrossStream: crossed.body.code, roomsIntactAfter: true });
    await stop(s);
  }, 60_000);
});

describe("M11 permissions and invitations", () => {
  it("editors can't do owner things by HTTP or socket; leave and removal end live access; revoked and full invitations admit nobody", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    const wb = await open(t.B, t.W);
    await wa.result(wa.command("place", { pose: spot(0) }));
    const v = await version(wb, "by editor"); // editors may save versions
    const B = t.B;
    const http = {
      rename: (await B.req("PATCH", `/api/works/${t.W}`, { title: "taken" })).status,
      archive: (await B.req("POST", `/api/works/${t.W}/archive`, { archived: true })).status,
      trash: (await B.req("POST", `/api/works/${t.W}/trash`)).status,
      invite: (await B.req("POST", `/api/works/${t.W}/invite`)).status,
      removeMember: (await B.req("DELETE", `/api/works/${t.W}/members/${t.C.user!.id}`)).status,
      publish: (await B.req("POST", `/api/works/${t.W}/exhibits`, { snapshotId: v, title: "x", framing: { yaw: 0, pitch: 1, distance: 40, targetY: 2 } })).status,
      deleteVersion: (await B.req("DELETE", `/api/works/${t.W}/versions/${v}`)).status,
      purge: (await B.req("POST", `/api/works/${t.W}/delete-permanently`, { title: label("W") })).status,
    };
    expect(Object.values(http).every((st) => st === 403 || st === 409)).toBe(true);
    const socket = {
      restore: (await wb.result(wb.command("restore", { snapshotId: v }))).code,
      push: (await wb.result(wb.command("push.prepare", {}))).code,
    };
    expect(socket).toEqual({ restore: "NOT_OWNER", push: "NOT_OWNER" });
    // C leaves with a window open; A removes B with a window open
    const wc = await open(t.C, t.W);
    expect((await t.C.req("POST", `/api/works/${t.W}/leave`)).status).toBe(200);
    const left = await wc.waitFor((m) => m.type === "access.ended");
    const cAfter = await wc.result(wc.command("place", { pose: spot(5) }));
    expect((await t.A.req("DELETE", `/api/works/${t.W}/members/${t.B.user!.id}`)).status).toBe(200);
    const removed = await wb.waitFor((m) => m.type === "access.ended");
    await sleep(600);
    const bAfter = await wb.result(wb.command("place", { pose: spot(6) }));
    expect([left.reason, removed.reason, cAfter.code, bAfter.code]).toEqual(["LEFT", "REMOVED", "NOT_FOUND", "NOT_FOUND"]);
    // revoked invitation
    const token = await invite(t.A, t.W);
    expect((await t.A.req("DELETE", `/api/works/${t.W}/invite`)).status).toBe(200);
    const revoked = await t.D.req("POST", "/api/invites/accept", { token });
    // exhausted invitation: three distinct accounts, then a fourth
    const fresh = await Promise.all(["E", "F", "G", "H"].map((r) => new Client(s.url).register(label(r))));
    const token2 = await invite(t.A, t.W, fresh[0]!, fresh[1]!, fresh[2]!);
    const full = await fresh[3]!.req("POST", "/api/invites/accept", { token: token2 });
    const members = (await t.A.req("GET", `/api/works/${t.W}`)).body.members.length;
    expect([revoked.status, revoked.body.error.code, full.body.error.code, members]).toEqual([404, "INVITE_INVALID", "INVITE_FULL", 4]);
    const dState = await t.D.state(t.W);
    expect(JSON.stringify(dState.body)).not.toContain(label("W"));
    note("M11", { editorHttp: http, editorSocket: socket, editorCanSaveVersion: true, leave: [left.reason, cAfter.code], removal: [removed.reason, bAfter.code], revokedInvite: revoked.body.error.code, fourthAcceptance: full.body.error.code, membersAfter: members, outsiderBody: dState.body });
    await stop(s);
  }, 90_000);
});

describe("M12 save and restart", () => {
  it("a graceful restart keeps sticks, members, versions and sessions, drops ghosts; acknowledged placements survive SIGKILL", async () => {
    const s1 = await startServer();
    const t = await team(s1.url);
    const wa = await open(t.A, t.W);
    const wb = await open(t.B, t.W);
    for (let k = 0; k < 3; k++) {
      const w = [wa, wb][k % 2]!;
      await w.result(w.command("place", { pose: spot(k) }));
      await sleep(600);
    }
    const v = await version(wb, "pre-restart");
    const restored = await wa.result(wa.command("restore", { snapshotId: v }));
    await wa.waitFor((m) => m.type === "room.snapshot" && m.epoch === restored.epoch);
    wa.send({ type: "draft.start", seq: 1, epoch: restored.epoch, pose: spot(8) });
    await wb.waitFor((m) => m.type === "draft.pose");
    await sleep(300);
    const before = { sticks: await ids(t.A, t.W), members: (await t.A.req("GET", `/api/works/${t.W}`)).body.members.length, versions: (await t.A.req("GET", `/api/works/${t.W}/versions`)).body.versions.map((x: { id: string }) => x.id).sort() };
    wa.close();
    wb.close();
    await stop(s1, "SIGTERM");
    const s2 = await startServer(s1.dir);
    const A2 = new Client(s2.url);
    Object.assign(A2, { cookie: t.A.cookie, csrf: t.A.csrf, user: t.A.user });
    const after = { sticks: await ids(A2, t.W), members: (await A2.req("GET", `/api/works/${t.W}`)).body.members.length, versions: (await A2.req("GET", `/api/works/${t.W}/versions`)).body.versions.map((x: { id: string }) => x.id).sort() };
    expect(after).toEqual(before);
    const w2 = await open(A2, t.W);
    expect(w2.snapshot.drafts).toEqual([]);
    // SIGKILL right after acknowledgements
    const acked: string[] = [];
    for (let k = 3; k < 6; k++) {
      acked.push((await w2.result(w2.command("place", { pose: spot(k) }))).stickId);
      await sleep(600);
    }
    await stop(s2, "SIGKILL");
    const s3 = await startServer(s1.dir);
    const A3 = new Client(s3.url);
    Object.assign(A3, { cookie: t.A.cookie, csrf: t.A.csrf, user: t.A.user });
    const survived = await ids(A3, t.W);
    for (const id of acked) expect(survived).toContain(id);
    note("M12", { gracefulRestart: { before, after, sessionCookieStillValid: true, ghostsAfter: 0 }, sigkill: { acknowledged: acked.length, survived: acked.filter((id) => survived.includes(id)).length } });
    await stop(s3);
  }, 90_000);
});

describe("L01-L03 lifecycle with a collaborator connected", () => {
  it("L01 archive turns B's window read-only and keeps public exhibits; unarchive returns the same sticks", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    const wb = await open(t.B, t.W);
    await wa.result(wa.command("place", { pose: spot(0) }));
    const v = await version(wa, "for show");
    const ex = (await t.A.req("POST", `/api/works/${t.W}/exhibits`, { snapshotId: v, title: label("exhibit"), framing: { yaw: 0, pitch: 1, distance: 40, targetY: 2 } })).body.id;
    const sticks = await ids(t.A, t.W);
    expect((await t.A.req("POST", `/api/works/${t.W}/archive`, { archived: true })).status).toBe(200);
    const ro = await wb.waitFor((m) => m.type === "room.snapshot" && m.live === false);
    const bTry = await t.B.command(t.W, "place", { pose: spot(1) });
    const pub = await new Client(s.url).req("GET", `/api/exhibits/${ex}`);
    expect([ro.mode, bTry.body.code ?? bTry.body.error?.code, pub.status]).toEqual(["archived", "ARCHIVED", 200]);
    expect((await t.A.req("POST", `/api/works/${t.W}/archive`, { archived: false })).status).toBe(200);
    const back = await wb.joinLive(t.W);
    expect(back.sticks.map((x: { id: string }) => x.id).sort()).toEqual(sticks);
    note("L01", { bWindow: ro.mode, bPlacement: bTry.body.code ?? bTry.body.error?.code, exhibitWhileArchived: pub.status, afterUnarchive: { live: back.live, sameSticks: true } });
    await stop(s);
  }, 60_000);

  it("L02 trash with B connected, restore; then trash and purge, after which nothing writes the work back", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    const wb = await open(t.B, t.W);
    await wa.result(wa.command("place", { pose: spot(0) }));
    const v = await version(wa, "for show");
    const ex = (await t.A.req("POST", `/api/works/${t.W}/exhibits`, { snapshotId: v, title: label("exhibit"), framing: { yaw: 0, pitch: 1, distance: 40, targetY: 2 } })).body.id;
    await invite(t.A, t.W);
    const sticks = await ids(t.A, t.W);
    const stale = placeMsg(wb, spot(1));
    expect((await t.A.req("POST", `/api/works/${t.W}/trash`)).status).toBe(200);
    const ended = await wb.waitFor((m) => m.type === "access.ended");
    const staleHttp = await t.B.command(t.W, "place", { pose: spot(1) }, { epoch: stale.worldEpoch, streamId: stale.streamId, tick: 0 });
    const exhibit = await new Client(s.url).req("GET", `/api/exhibits/${ex}`);
    const unavailable = (await t.B.req("GET", "/api/collaborations/unavailable")).body.works.map((w: { id: string }) => w.id);
    expect((await t.A.req("POST", `/api/works/${t.W}/trash/restore`)).status).toBe(200);
    const restored = await ids(t.A, t.W);
    const inviteAfter = (await t.A.req("GET", `/api/works/${t.W}/invite`)).body.invite;
    expect([ended.reason, staleHttp.status, exhibit.body.error.code, unavailable.includes(t.W), restored, inviteAfter]).toEqual(["TRASHED", 410, "WITHDRAWN", true, sticks, null]);
    // purge, with a moving room and a command queued from before
    const wb2 = await open(t.B, t.W);
    await wb2.result(wb2.command("place", { pose: pose(0, 0, 6) })); // dropped from height: checkpoints while it falls
    const queued = placeMsg(wb2, spot(4));
    expect((await t.A.req("POST", `/api/works/${t.W}/trash`)).status).toBe(200);
    await sleep(800); // trashing closes the room; purge waits for it
    expect((await t.A.req("POST", `/api/works/${t.W}/delete-permanently`, { title: label("W") })).status).toBe(200);
    const late = await t.B.command(t.W, "place", { pose: spot(4) }, { epoch: queued.worldEpoch, streamId: queued.streamId, tick: 0 });
    const wj = await open(t.B);
    wj.send({ type: "room.join", workId: t.W });
    const joinErr = await wj.waitFor((m) => m.type === "error");
    await sleep(1500);
    await stop(s);
    const db = new Database(join_(s.dir), { readonly: true });
    const rows = Object.fromEntries(
      ["works", "work_states", "previous_work_states", "snapshots", "exhibits", "command_receipts"].map((tbl) => [tbl, (db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE ${tbl === "works" ? "id" : "work_id"} = ?`).get(t.W) as { n: number }).n]),
    );
    db.close();
    expect([late.status, joinErr.code, Object.values(rows).every((n) => n === 0)]).toEqual([404, "NOT_FOUND", true]);
    note("L02", { trash: { bNotified: ended.reason, staleCommand: staleHttp.status, exhibit: exhibit.body.error.code, inEditorsUnavailableList: true }, restore: { sameSticks: true, invitationStillRevoked: true }, purge: { lateCommand: late.status, lateJoin: joinErr.code, rowsAfterStop: rows } });
  }, 90_000);

  it("L03 an exhibit stays frozen while building continues, grants no editing, and withdrawal stops public reads", async () => {
    const s = await startServer();
    const t = await team(s.url);
    const wa = await open(t.A, t.W);
    await wa.result(wa.command("place", { pose: spot(0) }));
    const v = await version(wa, "shown");
    const ex = (await t.A.req("POST", `/api/works/${t.W}/exhibits`, { snapshotId: v, title: label("exhibit"), framing: { yaw: 0, pitch: 1, distance: 40, targetY: 2 } })).body.id;
    const visitor = new Client(s.url);
    const g0 = (await visitor.req("GET", `/api/exhibits/${ex}`)).body.geometry;
    for (let k = 1; k < 3; k++) {
      await sleep(600);
      await wa.result(wa.command("place", { pose: spot(k) }));
    }
    const g1 = (await visitor.req("GET", `/api/exhibits/${ex}`)).body.geometry;
    expect(g1).toEqual(g0);
    expect(g0.sticks).toHaveLength(1);
    const anonSocket = await Window.open(visitor).then(() => "opened").catch((e: Error) => e.message);
    const wd = await open(t.D);
    wd.send({ type: "room.join", workId: t.W });
    const dJoin = await wd.waitFor((m) => m.type === "error");
    expect((await t.A.req("POST", `/api/exhibits/${ex}/withdraw`, { withdrawn: true })).status).toBe(200);
    const gone = await visitor.req("GET", `/api/exhibits/${ex}`);
    const thumb = await visitor.req("GET", `/api/exhibits/${ex}/thumbnail.svg`);
    expect([anonSocket, dJoin.code, gone.body.error.code, thumb.status]).toEqual(["upgrade refused 401", "NOT_FOUND", "WITHDRAWN", 404]);
    note("L03", { exhibitSticks: g0.sticks.length, liveSticksAfterMoreBuilding: 3, exhibitUnchanged: true, anonymousSocket: anonSocket, signedInNonMemberJoin: dJoin.code, afterWithdrawal: { exhibit: gone.body.error.code, thumbnail: thumb.status } });
    await stop(s);
  }, 60_000);
});

const join_ = (dir: string): string => join(dir, "data", "stillwood.db");
