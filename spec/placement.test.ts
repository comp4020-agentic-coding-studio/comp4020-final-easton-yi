// SAVE-02, PLACE-08/09, SYNC-02/03, AT-01, AT-05, AT-06, AT-07: placements are
// durable server commands, validated against the current world, idempotent
// by command ID, and refused for anyone without editing authority.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Client, FLAT, VERTICAL, Window, sleep } from "./helpers.ts";

const open: Window[] = [];
afterEach(() => {
  for (const w of open.splice(0)) w.close();
});
const win = async (c: Client, workId: string): Promise<Window> => {
  const w = await Window.open(c, workId);
  open.push(w);
  return w;
};

describe("placement", () => {
  it("a new user creates a work, places sticks, and finds them after logging back in", async () => {
    const c = await new Client().register("Builder");
    const workId = await c.createWork("First bridge");
    const w = await win(c, workId);
    expect(w.snapshot.lease).not.toBe(null);
    const a = w.command("place", { pose: { p: [-3, 4.005, 0], q: VERTICAL } });
    expect((await w.result(a)).outcome).toBe("accepted");
    const b = w.command("place", { pose: { p: [3, 4.005, 0], q: VERTICAL } });
    expect((await w.result(b)).outcome).toBe("accepted");
    w.close();
    await c.req("POST", "/api/auth/logout");
    const again = new Client();
    await again.login(c.user!.handle, "correct horse battery");
    const list = await again.req("GET", "/api/works");
    expect(list.body.works.map((x: { id: string }) => x.id)).toContain(workId);
    const state = await again.state(workId);
    expect(state.body.sticks).toHaveLength(2);
    expect(state.body.sticks.every((s: { authorId: string }) => s.authorId === c.user!.id)).toBe(true);
  });

  it("rejects an intersecting placement and keeps nothing of it", async () => {
    const c = await new Client().register();
    const workId = await c.createWork();
    const w = await win(c, workId);
    const first = w.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } });
    expect((await w.result(first)).outcome).toBe("accepted");
    const clash = w.command("place", { pose: { p: [0.5, 0.6, 0], q: FLAT } });
    const r = await w.result(clash);
    expect(r.outcome).toBe("rejected");
    expect(r.code).toBe("COLLISION");
    expect((await c.state(workId)).body.sticks).toHaveLength(1);
  });

  it("an unsupported placement is accepted and falls", async () => {
    const c = await new Client().register();
    const workId = await c.createWork();
    const w = await win(c, workId);
    const id = w.command("place", { pose: { p: [0, 20, 0], q: FLAT } });
    const r = await w.result(id);
    expect(r.outcome).toBe("accepted");
    const frame = await w.waitFor((m) => m.type === "world.frame" && m.bodies.length === 1 && m.bodies[0][2] < 10);
    expect(frame.bodies[0][0]).toBe(r.stickId);
  });

  it("rejects out-of-bounds and non-finite poses", async () => {
    const c = await new Client().register();
    const workId = await c.createWork();
    const w = await win(c, workId);
    const far = await w.result(w.command("place", { pose: { p: [30, 1, 0], q: FLAT } }));
    expect(far.code).toBe("OUT_OF_BOUNDS");
    const notUnit = await w.result(w.command("place", { pose: { p: [0, 1, 0], q: [0, 0, 0, 0.5] } }));
    expect(notUnit.code).toBe("NON_FINITE");
  });

  it("replaying the same command ID returns the original result without a duplicate", async () => {
    const c = await new Client().register();
    const workId = await c.createWork();
    const w = await win(c, workId);
    const commandId = randomUUID();
    const pose = { p: [0, 0.505, 4], q: FLAT };
    const r1 = await w.result(w.command("place", { pose }, commandId));
    expect(r1.outcome).toBe("accepted");
    w.command("place", { pose }, commandId);
    const r2 = await w.result(commandId);
    expect(r2).toEqual(r1);
    const viaHttp = await c.req("GET", `/api/commands/${commandId}`);
    expect(viaHttp.body.stickId).toBe(r1.stickId);
    expect((await c.state(workId)).body.sticks).toHaveLength(1);
    // the same ID with a different payload is a conflict, not a second stick
    const conflict = await w.result(w.command("place", { pose: { p: [5, 0.505, 4], q: FLAT } }, commandId));
    expect(conflict.code).toBe("IDEMPOTENCY_CONFLICT");
    expect((await c.state(workId)).body.sticks).toHaveLength(1);
  });

  it("an unknown command ID is reported as unknown, not as success", async () => {
    const c = await new Client().register();
    const r = await c.req("GET", `/api/commands/${randomUUID()}`);
    expect(r.body.outcome).toBe("unknown");
  });

  it("HTTP submission uses the same handler and lease", async () => {
    const c = await new Client().register();
    const workId = await c.createWork();
    const w = await win(c, workId);
    const noLease = await c.command(workId, "place", { pose: { p: [0, 0.505, -4], q: FLAT } });
    expect(noLease.body.code).toBe("STALE_LEASE");
    const ok = await c.command(workId, "place", { pose: { p: [0, 0.505, -4], q: FLAT } }, { leaseId: w.snapshot.lease.leaseId });
    expect(ok.status).toBe(200);
    expect(ok.body.outcome).toBe("accepted");
  });
});

describe("authority", () => {
  it("non-members can't read or modify a private work", async () => {
    const owner = await new Client().register();
    const workId = await owner.createWork("Private");
    const stranger = await new Client().register();
    expect((await stranger.req("GET", `/api/works/${workId}`)).status).toBe(404);
    expect((await stranger.state(workId)).status).toBe(404);
    const r = await stranger.req("POST", "/api/commands", {
      v: 1, type: "command", commandId: randomUUID(), workId, worldEpoch: 1, streamId: "x", lastSeenTick: 0, leaseId: "", kind: "place",
      payload: { pose: { p: [0, 0.505, 0], q: FLAT } },
    });
    expect(r.status).toBe(404);
    expect((await owner.state(workId)).body.sticks).toHaveLength(0);
    // a socket join is refused too
    const w = await Window.open(stranger);
    open.push(w);
    w.send({ type: "room.join", workId });
    const err = await w.waitFor((m) => m.type === "error");
    expect(err.code).toBe("NOT_FOUND");
  });

  it("anonymous requests get 401 and private pages carry no data", async () => {
    const owner = await new Client().register();
    const workId = await owner.createWork("Private");
    const anon = new Client();
    expect((await anon.state(workId)).status).toBe(401);
    const page = await anon.req("GET", `/works/${workId}/`);
    expect(page.status).toBe(200);
    expect(String(page.body)).not.toContain("Private");
  });

  it("a socket upgrade without a session or from another origin is refused", async () => {
    const anon = new Client();
    await expect(Window.open(anon)).rejects.toThrow(/401/);
  });

  it("stale epochs and stale views are rejected and the draft is the client's to keep", async () => {
    const c = await new Client().register();
    const workId = await c.createWork();
    const w = await win(c, workId);
    const s = w.snapshot;
    w.send({ v: 1, type: "command", commandId: randomUUID(), workId, worldEpoch: s.epoch + 5, streamId: s.streamId, lastSeenTick: s.tick, leaseId: s.lease.leaseId, kind: "place", payload: { pose: { p: [0, 0.505, 0], q: FLAT } } });
    expect((await w.waitFor((m) => m.type === "command.result")).code).toBe("STALE_WORLD");
    w.send({ v: 1, type: "command", commandId: randomUUID(), workId, worldEpoch: s.epoch, streamId: "old-stream", lastSeenTick: s.tick, leaseId: s.lease.leaseId, kind: "place", payload: { pose: { p: [0, 0.505, 0], q: FLAT } } });
    expect((await w.waitFor((m) => m.type === "command.result")).code).toBe("STALE_VIEW");
    await sleep(10);
    expect((await c.state(workId)).body.sticks).toHaveLength(0);
  });
});
