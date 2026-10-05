// SYNC-01..07, AUTH-02..04, AT-05, AT-06: two real authenticated sessions.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Client, FLAT, Window, sessionOf, shared, sleep } from "./helpers.ts";

const open: Window[] = [];
afterEach(() => {
  for (const w of open.splice(0)) w.close();
});
const win = async (c: Client, workId: string): Promise<Window> => {
  const w = await Window.open(c, workId);
  open.push(w);
  return w;
};

/** Owner + invited editor on a new work (the accounts are shared; the work is not). */
async function pair(): Promise<{ owner: Client; editor: Client; workId: string }> {
  const owner = await shared("Owner");
  const workId = await owner.createWork("Shared");
  const inv = await owner.req("POST", `/api/works/${workId}/invite`);
  const token = inv.body.path.split("token=")[1];
  const editor = await shared("Editor");
  const acc = await editor.req("POST", "/api/invites/accept", { token });
  expect(acc.status).toBe(200);
  return { owner, editor, workId };
}

describe("invitations", () => {
  it("keeps the secret out of the path, previews without granting access, and accepts idempotently", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork("Invite test");
    const inv = await owner.req("POST", `/api/works/${workId}/invite`);
    expect(inv.body.path).toMatch(/^\/join\/#token=/);
    const token = inv.body.path.split("token=")[1];
    const guest = await shared("Guest");
    const preview = await guest.req("POST", "/api/invites/preview", { token });
    expect(preview.body.workTitle).toBe("Invite test");
    expect((await guest.state(workId)).status).toBe(404); // preview isn't membership
    expect((await guest.req("POST", "/api/invites/accept", { token })).body.alreadyMember).toBe(false);
    expect((await guest.req("POST", "/api/invites/accept", { token })).body.alreadyMember).toBe(true);
    const status = await owner.req("GET", `/api/works/${workId}/invite`);
    expect(status.body.invite.used).toBe(1); // repeat acceptance didn't consume a use
    expect((await guest.state(workId)).status).toBe(200);
  });

  it("allows at most three distinct accounts", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork();
    const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
    // four accounts that aren't members of this new work
    for (const name of ["Guest", "Late", "Editor"]) {
      const g = await shared(name);
      expect((await g.req("POST", "/api/invites/accept", { token })).status).toBe(200);
    }
    const fourth = await shared("Fourth");
    const r = await fourth.req("POST", "/api/invites/accept", { token });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("INVITE_FULL");
  });

  it("a replacement link revokes the old one without removing members; only owners invite", async () => {
    const { owner, editor, workId } = await pair();
    const first = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
    await owner.req("POST", `/api/works/${workId}/invite`);
    const late = await shared("Late");
    expect((await late.req("POST", "/api/invites/accept", { token: first })).body.error.code).toBe("INVITE_INVALID");
    expect((await editor.state(workId)).status).toBe(200);
    expect((await editor.req("POST", `/api/works/${workId}/invite`)).status).toBe(403);
    await owner.req("DELETE", `/api/works/${workId}/invite`);
    expect((await owner.req("GET", `/api/works/${workId}/invite`)).body.invite).toBe(null);
  });
});

describe("simultaneous building", () => {
  it("both editors see each other's ghosts with names, and a held ghost doesn't reserve space", async () => {
    const { owner, editor, workId } = await pair();
    const a = await win(owner, workId);
    const b = await win(editor, workId);
    expect(a.snapshot.lease).not.toBe(null);
    expect(b.snapshot.lease).not.toBe(null);
    const pose = { p: [0, 0.505, 0], q: FLAT };
    a.send({ type: "draft.start", seq: 1, epoch: a.snapshot.epoch, pose });
    const seen = await b.waitFor((m) => m.type === "draft.pose" && m.userId === owner.user!.id);
    expect(seen.displayName).toBe("Owner");
    expect(seen.pose).toEqual(pose);
    // B places exactly where A's ghost is: allowed, ghosts have no collision
    const r = await b.result(b.command("place", { pose }));
    expect(r.outcome).toBe("accepted");
    a.send({ type: "draft.end", seq: 2 });
    expect((await b.waitFor((m) => m.type === "draft.removed")).leaseId).toBe(a.snapshot.lease.leaseId);
  });

  it("two identical placements at once: exactly one wins and both see the same result", async () => {
    const { owner, editor, workId } = await pair();
    const a = await win(owner, workId);
    const b = await win(editor, workId);
    const pose = { p: [2, 0.505, -3], q: FLAT };
    const ia = a.command("place", { pose });
    const ib = b.command("place", { pose });
    const [ra, rb] = await Promise.all([a.result(ia), b.result(ib)]);
    const outcomes = [ra.outcome, rb.outcome].sort();
    expect(outcomes).toEqual(["accepted", "rejected"]);
    expect([ra, rb].find((r) => r.outcome === "rejected")!.code).toBe("COLLISION");
    const winner = [ra, rb].find((r) => r.outcome === "accepted")!.stickId;
    await sleep(100);
    for (const c of [owner, editor]) {
      const s = (await c.state(workId)).body;
      expect(s.sticks.map((x: { id: string }) => x.id)).toEqual([winner]);
    }
  });

  it("non-overlapping placements at once both succeed (no global stale-revision rejection)", async () => {
    const { owner, editor, workId } = await pair();
    const a = await win(owner, workId);
    const b = await win(editor, workId);
    const ia = a.command("place", { pose: { p: [-6, 0.505, 0], q: FLAT } });
    const ib = b.command("place", { pose: { p: [6, 0.505, 0], q: FLAT } });
    const [ra, rb] = await Promise.all([a.result(ia), b.result(ib)]);
    expect(ra.outcome).toBe("accepted");
    expect(rb.outcome).toBe("accepted");
    // both clients receive both additions
    const ids = [ra.stickId, rb.stickId].sort();
    for (const w of [a, b]) {
      const got = new Set<string>();
      while (got.size < 2) {
        const m = await w.waitFor((x) => x.type === "sticks.added");
        for (const s of m.sticks) got.add(s.id);
      }
      expect([...got].sort()).toEqual(ids);
    }
  });
});

describe("leases and presence", () => {
  it("a second window of the same account observes until it explicitly takes over", async () => {
    const c = await shared("Owner");
    const workId = await c.createWork();
    const first = await win(c, workId);
    const second = await win(c, workId);
    expect(first.snapshot.lease).not.toBe(null);
    expect(second.snapshot.lease).toBe(null);
    expect(second.snapshot.leaseReason).toBe("OTHER_WINDOW");
    second.send({ type: "lease.takeover" });
    const granted = await second.waitFor((m) => m.type === "lease.changed" && m.lease);
    expect((await first.waitFor((m) => m.type === "lease.changed")).lease).toBe(null);
    // the old window's lease can no longer place
    const old = await first.result(first.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }));
    expect(old.code).toBe("STALE_LEASE");
    second.snapshot.lease = granted.lease;
    expect((await second.result(second.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }))).outcome).toBe("accepted");
  });

  it("heartbeats keep a stationary ghost; disconnect removes it", async () => {
    const { owner, editor, workId } = await pair();
    const a = await win(owner, workId);
    const b = await win(editor, workId);
    const pose = { p: [0, 3, 0], q: FLAT };
    a.send({ type: "draft.start", seq: 1, epoch: a.snapshot.epoch, pose });
    await b.waitFor((m) => m.type === "draft.pose");
    a.send({ type: "heartbeat", draft: { seq: 1, pose } });
    await a.waitFor((m) => m.type === "heartbeat.ok");
    // a late joiner still gets the held ghost in its snapshot
    const late = await win(editor, workId);
    expect(late.snapshot.drafts.map((d: { userId: string }) => d.userId)).toContain(owner.user!.id);
    a.close();
    expect((await b.waitFor((m) => m.type === "draft.removed")).leaseId).toBe(a.snapshot.lease.leaseId);
  });
});

describe("losing authority", () => {
  it("a removed editor is cut off immediately, keeps attribution, and can't place or read", async () => {
    const { owner, editor, workId } = await pair();
    const b = await win(editor, workId);
    const placed = await b.result(b.command("place", { pose: { p: [0, 0.505, 5], q: FLAT } }));
    expect(placed.outcome).toBe("accepted");
    expect((await owner.req("DELETE", `/api/works/${workId}/members/${editor.user!.id}`)).status).toBe(200);
    expect((await b.waitFor((m) => m.type === "access.ended")).reason).toBe("REMOVED");
    const after = await b.result(b.command("place", { pose: { p: [0, 0.505, -5], q: FLAT } }));
    expect(after.outcome).toBe("rejected");
    expect((await editor.state(workId)).status).toBe(404);
    expect((await editor.req("GET", `/api/commands/${placed.commandId}`)).body.code).toBe("NOT_FOUND");
    const s = (await owner.state(workId)).body;
    expect(s.sticks).toHaveLength(1);
    expect(s.sticks[0].authorId).toBe(editor.user!.id);
  });

  it("logging out ends the socket's authority", async () => {
    const c = await sessionOf(await shared("Owner"));
    const workId = await c.createWork();
    const w = await win(c, workId);
    await c.req("POST", "/api/auth/logout");
    expect((await w.waitFor((m) => m.type === "access.ended")).reason).toBe("LOGGED_OUT");
    const r = await w.result(w.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }));
    expect(r.outcome).toBe("rejected");
  });

  it("an editor can leave; the owner can't", async () => {
    const { owner, editor, workId } = await pair();
    expect((await editor.req("POST", `/api/works/${workId}/leave`)).status).toBe(200);
    expect((await editor.state(workId)).status).toBe(404);
    expect((await owner.req("POST", `/api/works/${workId}/leave`)).status).toBe(422);
  });

  it("editors can't do owner things", async () => {
    const { editor, workId } = await pair();
    expect((await editor.req("PATCH", `/api/works/${workId}`, { title: "Mine now" })).status).toBe(403);
    expect((await editor.req("POST", `/api/works/${workId}/archive`, { archived: true })).status).toBe(403);
    const w = await win(editor, workId);
    const r = await w.result(w.command("push.prepare", {}));
    expect(r.code).toBe("NOT_OWNER");
    const restore = await w.result(w.command("restore", { snapshotId: randomUUID() }));
    expect(restore.code).toBe("NOT_OWNER");
  });
});
