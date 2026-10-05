// SAVE-10..SAVE-12, AUTH-02/03/05, SAVE-07, AT-17..AT-19: owner-controlled
// trash, restore and permanent deletion, checked over real HTTP and WebSocket
// against the running app. Every test makes its own works; a few accounts are
// shared across the file because registration is rate-limited per IP and the
// whole spec suite runs from one address.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client, FLAT, Window, shared } from "./helpers.ts";
import { LIMITS } from "../src/shared/config.ts";

const open: Window[] = [];
afterEach(() => {
  for (const w of open.splice(0)) w.close();
});
const win = async (c: Client, workId: string): Promise<Window> => {
  const w = await Window.open(c, workId);
  open.push(w);
  return w;
};
const settled = (w: Window) => w.waitFor((m) => m.type === "save.status" && m.save === "saved", 20_000);
const framing = { yaw: 0.8, pitch: 0.9, distance: 50, targetY: 4 };

async function invite(owner: Client, workId: string): Promise<string> {
  return (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
}

async function join(owner: Client, workId: string, c: Client): Promise<Client> {
  expect((await c.req("POST", "/api/invites/accept", { token: await invite(owner, workId) })).status).toBe(200);
  return c;
}

let owner: Client;
let ed: Client;
let stranger: Client;
beforeAll(async () => {
  [owner, ed, stranger] = await Promise.all([shared("Owner"), shared("Editor"), shared("Stranger")]);
});

/** A settled stick, a named version and a public exhibit of it. */
async function exhibit(owner: Client, w: Window, workId: string, title: string): Promise<{ exhibitId: string; snapshotId: string; stickId: string }> {
  const r = await w.result(w.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }));
  expect(r.outcome).toBe("accepted");
  await settled(w);
  const v = await w.result(w.command("snapshot.create", { title: `${title} v1` }));
  expect(v.outcome).toBe("accepted");
  const pub = await owner.req("POST", `/api/works/${workId}/exhibits`, { snapshotId: v.snapshotId, title, framing });
  expect(pub.status).toBe(200);
  return { exhibitId: pub.body.id, snapshotId: v.snapshotId, stickId: r.stickId };
}

const anon = new Client();
const lifecyclePaths = (workId: string) =>
  [
    ["POST", `/api/works/${workId}/trash`, undefined],
    ["POST", `/api/works/${workId}/trash/restore`, undefined],
    ["POST", `/api/works/${workId}/delete-permanently`, { title: "Owned" }],
  ] as const;

describe("authority over the lifecycle", () => {
  it("editors, strangers and anonymous visitors can't trash, restore or delete another person's work", async () => {
    const workId = await owner.createWork("Owned");
    await join(owner, workId, ed);

    // active work
    for (const [m, p, b] of lifecyclePaths(workId)) {
      expect((await ed.req(m, p, b)).status).toBe(403);
      expect((await stranger.req(m, p, b)).status).toBe(404);
      expect((await anon.req(m, p, b)).status).toBe(401);
    }
    // and once it's in the trash
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);
    for (const [m, p, b] of lifecyclePaths(workId)) {
      expect((await ed.req(m, p, b)).status).toBe(403);
      expect((await stranger.req(m, p, b)).status).toBe(404);
      expect((await anon.req(m, p, b)).status).toBe(401);
    }
    // a stranger forging a CSRF-less request from another origin is refused before anything else
    expect((await stranger.req("POST", `/api/works/${workId}/trash/restore`, undefined, { origin: "https://evil.example" })).status).toBe(403);

    // still in the owner's trash, untouched
    const trash = (await owner.req("GET", "/api/trash")).body.works;
    expect(trash.map((w: { id: string }) => w.id)).toContain(workId);
  });

  it("trash is owner-only: editors and strangers see nothing and get no private data by known IDs", async () => {
    const workId = await owner.createWork("Private trash");
    const ow = await win(owner, workId);
    const { snapshotId } = await exhibit(owner, ow, workId, "Private trash exhibit");
    await join(owner, workId, ed);
    ow.close();
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);

    for (const c of [ed, stranger]) {
      expect((await c.req("GET", "/api/trash")).body.works).toEqual([]);
      expect((await c.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).not.toContain(workId);
    }
    expect((await owner.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).not.toContain(workId);
    const privatePaths = [`/api/works/${workId}`, `/api/works/${workId}/state`, `/api/works/${workId}/versions`, `/api/works/${workId}/versions/${snapshotId}/geometry`, `/api/works/${workId}/exhibits`];
    for (const p of privatePaths) {
      const e = await ed.req("GET", p);
      expect(e.status).toBe(410); // members get an explanation…
      expect(e.body.error.code).toBe("TRASHED");
      expect(JSON.stringify(e.body)).not.toContain("bodies");
      expect((await stranger.req("GET", p)).status).toBe(404); // …strangers learn nothing
      expect((await anon.req("GET", p)).status).toBe(401);
    }
    // the owner too must restore before reading it
    expect((await owner.req("GET", `/api/works/${workId}/state`)).status).toBe(410);
    // a live join is refused with an explanation, not a silent drop
    const ew = await Window.open(ed);
    open.push(ew);
    ew.send({ type: "room.join", workId });
    const ended = await ew.waitFor((m) => m.type === "access.ended");
    expect(ended.reason).toBe("TRASHED");
    expect(ended.message).toMatch(/owner/i);
  });
});

describe("move to trash", () => {
  it("with two members connected: closes live editing, revokes invites, rejects late commands, withdraws every exhibit", async () => {
    const workId = await owner.createWork("Shared tower");
    const ow = await win(owner, workId);
    const first = await exhibit(owner, ow, workId, "Trash exhibit one");
    const second = await owner.req("POST", `/api/works/${workId}/exhibits`, { snapshotId: first.snapshotId, title: "Trash exhibit two", framing });
    expect(second.status).toBe(200);
    await join(owner, workId, ed);
    const ew = await win(ed, workId);
    expect(ew.snapshot.lease).toBeTruthy();
    expect((await ed.req("PUT", `/api/favorites/${first.exhibitId}`)).status).toBe(200);
    const pendingToken = await invite(owner, workId);
    expect((await owner.req("GET", `/api/works/${workId}`)).body).toMatchObject({ editorCount: 1, publicExhibits: 2 });

    // trash while the structure is still moving: a high drop just before
    const falling = await ew.result(ew.command("place", { pose: { p: [6, 40, 0], q: FLAT } }));
    expect(falling.outcome).toBe("accepted");
    const t = await owner.req("POST", `/api/works/${workId}/trash`);
    expect(t.status).toBe(200);
    expect(t.body.exhibitsWithdrawn).toBe(2);

    // both windows are told, with an explanation
    for (const w of [ow, ew]) expect((await w.waitFor((m) => m.type === "access.ended")).reason).toBe("TRASHED");
    // a late command from the editor's stale window is rejected
    const late = await ew.result(ew.command("place", { pose: { p: [-6, 0.505, 0], q: FLAT } }));
    expect(late.outcome).toBe("rejected");
    expect(late.code).toBe("TRASHED");
    // and over HTTP with the old view
    const http = await ed.req("POST", "/api/commands", { v: 1, type: "command", commandId: randomUUID(), workId, worldEpoch: ew.snapshot.epoch, streamId: ew.snapshot.streamId, lastSeenTick: 0, leaseId: ew.snapshot.lease?.leaseId ?? "", kind: "place", payload: { pose: { p: [-6, 0.505, 0], q: FLAT } } });
    expect(http.body.outcome).toBe("rejected");
    expect(http.body.code).toBe("TRASHED");

    // the invitation no longer works
    expect((await new Client().req("POST", "/api/invites/preview", { token: pendingToken })).status).toBe(404);
    expect((await stranger.req("POST", "/api/invites/accept", { token: pendingToken })).status).toBe(404);

    // public access reflects withdrawal; no geometry, thumbnail or listing
    for (const id of [first.exhibitId, second.body.id]) {
      const g = await anon.req("GET", `/api/exhibits/${id}`);
      expect(g.status).toBe(404);
      expect(g.body.error.code).toBe("WITHDRAWN");
      expect(JSON.stringify(g.body)).not.toContain("sticks");
      const thumb = await anon.req("GET", `/api/exhibits/${id}/thumbnail.svg`);
      expect(thumb.status).toBe(404);
      expect(String(thumb.body)).not.toContain("<svg");
    }
    const gallery = (await anon.req("GET", `/api/exhibits?q=${encodeURIComponent("Trash exhibit")}`)).body.items;
    expect(gallery.map((e: { id: string }) => e.id)).not.toContain(first.exhibitId);
    // favorites show only "withdrawn", nothing private
    const fav = (await ed.req("GET", "/api/favorites")).body.favorites.find((f: { exhibitId: string }) => f.exhibitId === first.exhibitId);
    expect(fav).toEqual({ exhibitId: first.exhibitId, withdrawn: true, savedAt: fav.savedAt });
    // and the owner can't republish while it's in the trash
    expect((await owner.req("POST", `/api/exhibits/${first.exhibitId}/withdraw`, { withdrawn: false })).status).toBe(410);
    // repeating the request is safe
    const again = await owner.req("POST", `/api/works/${workId}/trash`);
    expect(again.status).toBe(200);
    expect(again.body.alreadyTrashed).toBe(true);
  });

  it("a room command racing the trash either commits before it (and survives restore) or is rejected", async () => {
    const workId = await owner.createWork("Race");
    const ow = await win(owner, workId);
    const commandId = ow.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } });
    const trashed = owner.req("POST", `/api/works/${workId}/trash`);
    const result = await ow.result(commandId);
    expect((await trashed).status).toBe(200);
    expect((await owner.req("POST", `/api/works/${workId}/trash/restore`)).status).toBe(200);
    const sticks = (await owner.state(workId)).body.sticks.map((s: { id: string }) => s.id);
    if (result.outcome === "accepted") expect(sticks).toEqual([result.stickId]);
    else expect(sticks).toEqual([]);
    // querying the original ID gives the same answer as the live reply
    expect((await owner.req("GET", `/api/commands/${commandId}`)).body.outcome).toBe(result.outcome);
  });
});

describe("restore from trash", () => {
  it("keeps acknowledged scene data and permitted members, keeps exhibits withdrawn, and needs fresh room state", async () => {
    const workId = await owner.createWork("Comeback");
    const ow = await win(owner, workId);
    const { exhibitId, snapshotId } = await exhibit(owner, ow, workId, "Comeback exhibit");
    const stay = await join(owner, workId, ed);
    const removed = await join(owner, workId, await shared("Removed"));
    const leaver = await join(owner, workId, await shared("Leaves"));
    expect((await owner.req("DELETE", `/api/works/${workId}/members/${removed.user!.id}`)).status).toBe(200);
    const moving = await ow.result(ow.command("place", { pose: { p: [5, 30, 0], q: FLAT } }));
    expect(moving.outcome).toBe("accepted");
    const before = ow.snapshot;
    const beforeIds = [...(await owner.state(workId)).body.sticks.map((s: { id: string }) => s.id)].sort();
    expect(beforeIds).toHaveLength(2);

    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);
    // an editor may still leave while it's in the trash
    expect((await leaver.req("POST", `/api/works/${workId}/leave`)).status).toBe(200);
    const trashed = (await owner.req("GET", "/api/trash")).body.works.find((w: { id: string }) => w.id === workId);
    expect(trashed).toMatchObject({ title: "Comeback", archived: false, stickCount: 2, editorCount: 1, exhibitCount: 1 });

    const r = await owner.req("POST", `/api/works/${workId}/trash/restore`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ archived: false, alreadyRestored: false });
    expect((await owner.req("POST", `/api/works/${workId}/trash/restore`)).body.alreadyRestored).toBe(true);

    // same ID, same sticks (the moving one included), versions kept
    const state = (await owner.state(workId)).body;
    expect(state.workId).toBe(workId);
    expect(state.sticks.map((s: { id: string }) => s.id).sort()).toEqual(beforeIds);
    expect((await owner.req("GET", `/api/works/${workId}/versions`)).body.versions.map((v: { id: string }) => v.id)).toContain(snapshotId);
    // membership: kept editor stays; removed and departed editors are not re-added
    const members = (await owner.req("GET", `/api/works/${workId}`)).body.members.map((m: { userId: string }) => m.userId);
    expect(members).toContain(stay.user!.id);
    expect(members).not.toContain(removed.user!.id);
    expect(members).not.toContain(leaver.user!.id);
    expect((await stay.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).toContain(workId);
    expect((await removed.state(workId)).status).toBe(404);
    expect((await leaver.state(workId)).status).toBe(404);
    // invitations stay revoked, exhibits stay withdrawn
    expect((await owner.req("GET", `/api/works/${workId}/invite`)).body.invite).toBeNull();
    expect((await anon.req("GET", `/api/exhibits/${exhibitId}`)).body.error.code).toBe("WITHDRAWN");
    expect((await owner.req("GET", `/api/works/${workId}/exhibits`)).body.exhibits[0].withdrawn).toBe(true);
    // a fresh room: new epoch and stream, so pre-trash drafts and commands are stale
    expect(state.epoch).toBeGreaterThan(before.epoch);
    expect(state.streamId).not.toBe(before.streamId);
    const stale = await owner.req("POST", "/api/commands", { v: 1, type: "command", commandId: randomUUID(), workId, worldEpoch: before.epoch, streamId: before.streamId, lastSeenTick: before.tick, leaseId: before.lease?.leaseId ?? "", kind: "place", payload: { pose: { p: [-5, 0.505, 0], q: FLAT } } });
    expect(stale.body.code).toBe("STALE_WORLD");
    // building continues after a fresh join
    const fresh = await win(owner, workId);
    expect(fresh.snapshot.live).toBe(true);
    expect((await fresh.result(fresh.command("place", { pose: { p: [0, 0.505, -3], q: FLAT } }))).outcome).toBe("accepted");
    // only an explicit owner action republishes
    expect((await owner.req("POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: false })).status).toBe(200);
    expect((await anon.req("GET", `/api/exhibits/${exhibitId}`)).status).toBe(200);
  });

  it("returns an archived work to the archive", async () => {
    const workId = await owner.createWork("Was archived");
    expect((await owner.req("POST", `/api/works/${workId}/archive`, { archived: true })).status).toBe(200);
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);
    expect((await owner.req("GET", "/api/trash")).body.works.find((w: { id: string }) => w.id === workId).archived).toBe(true);
    expect((await owner.req("POST", `/api/works/${workId}/trash/restore`)).body.archived).toBe(true);
    expect((await owner.req("GET", "/api/works")).body.works.find((w: { id: string }) => w.id === workId).archived).toBe(true);
  });
});

describe("permanent deletion", () => {
  it("fails outside the trash, with a mismatched title, or without ownership", async () => {
    const workId = await owner.createWork("Exact Title");
    await join(owner, workId, ed);
    const active = await owner.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Exact Title" });
    expect(active.status).toBe(409);
    expect(active.body.error.code).toBe("NOT_TRASHED");
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);
    for (const wrong of ["exact title", "Exact Title ", "Exact", ""]) {
      const r = await owner.req("POST", `/api/works/${workId}/delete-permanently`, { title: wrong });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("TITLE_MISMATCH");
    }
    expect((await owner.req("POST", `/api/works/${workId}/delete-permanently`, {})).status).toBe(422);
    expect((await ed.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Exact Title" })).status).toBe(403);
    expect((await stranger.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Exact Title" })).status).toBe(404);
    // nothing was removed
    expect((await owner.req("POST", `/api/works/${workId}/trash/restore`)).status).toBe(200);
    expect((await ed.state(workId)).status).toBe(200);
  });

  it("removes the work's building content and exhibits; keeps both accounts, their other work and favorites", async () => {
    const workId = await owner.createWork("Doomed");
    const ow = await win(owner, workId);
    const { exhibitId, snapshotId } = await exhibit(owner, ow, workId, "Doomed exhibit");
    await join(owner, workId, ed);
    const ew = await win(ed, workId);
    const edPlace = ew.command("place", { pose: { p: [0, 0.505, 3], q: FLAT } });
    expect((await ew.result(edPlace)).outcome).toBe("accepted");
    expect((await ed.req("PUT", `/api/favorites/${exhibitId}`)).status).toBe(200);
    ow.close();
    ew.close();

    // unrelated work owned by the editor, with an exhibit the owner favorited
    const other = await ed.createWork("Editor's own");
    const otherW = await win(ed, other);
    const otherExhibit = await exhibit(ed, otherW, other, "Editor's exhibit");
    otherW.close();
    expect((await owner.req("PUT", `/api/favorites/${otherExhibit.exhibitId}`)).status).toBe(200);

    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);
    const del = await owner.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Doomed" });
    expect(del.status).toBe(200);
    expect(del.body.alreadyDeleted).toBe(false);

    // the work and everything that depends on it is gone for everyone
    for (const c of [owner, ed]) {
      for (const p of [`/api/works/${workId}`, `/api/works/${workId}/state`, `/api/works/${workId}/versions`, `/api/works/${workId}/versions/${snapshotId}/geometry`, `/api/works/${workId}/exhibits`]) {
        expect((await c.req("GET", p)).status).toBe(404);
      }
      expect((await c.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).not.toContain(workId);
      expect((await c.req("GET", "/api/trash")).body.works.map((w: { id: string }) => w.id)).not.toContain(workId);
    }
    const ex = await anon.req("GET", `/api/exhibits/${exhibitId}`);
    expect(ex.status).toBe(404);
    expect(ex.body.error.code).toBe("NOT_FOUND");
    expect((await anon.req("GET", `/api/exhibits/${exhibitId}/thumbnail.svg`)).status).toBe(404);
    // the favorite stays as an id-only placeholder the editor can remove
    const fav = (await ed.req("GET", "/api/favorites")).body.favorites.find((f: { exhibitId: string }) => f.exhibitId === exhibitId);
    expect(fav).toEqual({ exhibitId, withdrawn: true, removed: true, savedAt: fav.savedAt });
    expect(JSON.stringify(fav)).not.toContain("Doomed");
    expect((await ed.req("DELETE", `/api/favorites/${exhibitId}`)).status).toBe(200);
    expect((await ed.req("GET", "/api/favorites")).body.favorites.map((f: { exhibitId: string }) => f.exhibitId)).not.toContain(exhibitId);

    // both accounts still sign in; the editor's own work, exhibit and the owner's favorite are intact
    for (const c of [owner, ed]) expect((await new Client().login(c.user!.handle, "correct horse battery")).status).toBe(200);
    expect((await ed.state(other)).body.sticks).toHaveLength(1);
    expect((await anon.req("GET", `/api/exhibits/${otherExhibit.exhibitId}`)).status).toBe(200);
    const ownerFav = (await owner.req("GET", "/api/favorites")).body.favorites.find((f: { exhibitId: string }) => f.exhibitId === otherExhibit.exhibitId);
    expect(ownerFav.title).toBe("Editor's exhibit");

    // repeats and stale clients: safe, nothing recreated
    const again = await owner.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Doomed" });
    expect(again.status).toBe(200);
    expect(again.body.alreadyDeleted).toBe(true);
    expect((await ed.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Doomed" })).status).toBe(404);
    expect((await owner.req("POST", `/api/works/${workId}/trash/restore`)).status).toBe(404);
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(404);
    const replay = await ed.req("POST", "/api/commands", { v: 1, type: "command", commandId: edPlace, workId, worldEpoch: 1, streamId: "x", lastSeenTick: 0, leaseId: "", kind: "place", payload: { pose: { p: [0, 0.505, 3], q: FLAT } } });
    expect(replay.body.outcome).toBe("rejected");
    expect((await ed.req("GET", `/api/commands/${edPlace}`)).body.outcome).toBe("unknown");
    expect((await owner.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).not.toContain(workId);
  });
});

describe("leaving a trashed collaboration", () => {
  it("an editor sees only title and status, leaves without reading anything private, and isn't re-added by restore", async () => {
    const workId = await owner.createWork("Gone quiet");
    const ow = await win(owner, workId);
    const { snapshotId } = await exhibit(owner, ow, workId, "Gone quiet exhibit");
    ow.close();
    await join(owner, workId, ed);
    const unavailable = async (c: Client) => (await c.req("GET", "/api/collaborations/unavailable")).body.works as { id: string }[];
    expect((await unavailable(ed)).map((w) => w.id)).not.toContain(workId);
    expect((await owner.req("POST", `/api/works/${workId}/trash`)).status).toBe(200);

    // the editor's own view: exactly title and status
    expect((await unavailable(ed)).find((w) => w.id === workId)).toEqual({ id: workId, title: "Gone quiet", status: "trashed-by-owner" });
    expect((await unavailable(owner)).map((w) => w.id)).not.toContain(workId); // owners use Trash
    expect((await unavailable(stranger)).map((w) => w.id)).not.toContain(workId);
    expect((await anon.req("GET", "/api/collaborations/unavailable")).status).toBe(401);
    // and still nothing private
    expect((await ed.req("GET", "/api/trash")).body.works.map((w: { id: string }) => w.id)).not.toContain(workId);
    expect((await ed.state(workId)).status).toBe(410);
    expect((await ed.req("GET", `/api/works/${workId}/versions/${snapshotId}/geometry`)).status).toBe(410);

    expect((await ed.req("POST", `/api/works/${workId}/leave`)).status).toBe(200);
    expect((await ed.req("POST", `/api/works/${workId}/leave`)).status).toBe(404); // no longer a member
    expect((await unavailable(ed)).map((w) => w.id)).not.toContain(workId);

    expect((await owner.req("POST", `/api/works/${workId}/trash/restore`)).status).toBe(200);
    const members = (await owner.req("GET", `/api/works/${workId}`)).body.members.map((m: { userId: string }) => m.userId);
    expect(members).toEqual([owner.user!.id]);
    expect((await ed.state(workId)).status).toBe(404);
    expect((await ed.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).not.toContain(workId);
  });
});

describe("exhibit limit", () => {
  it("counts every retained exhibit for new exhibits; republish uses no slot; concurrent publishes can't overshoot", async () => {
    const workId = await owner.createWork("Limit");
    const w = await win(owner, workId);
    const { snapshotId, exhibitId: first } = await exhibit(owner, w, workId, "Limit 1");
    w.close();
    const publish = (i: number) => owner.req("POST", `/api/works/${workId}/exhibits`, { snapshotId, title: `Limit ${i}`, framing });
    const retained = async () => (await owner.req("GET", `/api/works/${workId}/exhibits`)).body.exhibits as { id: string; withdrawn: boolean }[];
    try {
      for (let i = 2; i < LIMITS.exhibitsPerWork; i++) expect((await publish(i)).status).toBe(200);
      // a withdrawn exhibit keeps its slot
      expect((await owner.req("POST", `/api/exhibits/${first}/withdraw`, { withdrawn: true })).status).toBe(200);
      expect(await retained()).toHaveLength(LIMITS.exhibitsPerWork - 1);

      // three concurrent publishes for the last slot: exactly one wins
      const racers = await Promise.all([publish(101), publish(102), publish(103)]);
      expect(racers.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      for (const r of racers.filter((x) => x.status === 409)) expect(r.body.error.code).toBe("LIMIT");
      expect(await retained()).toHaveLength(LIMITS.exhibitsPerWork);

      // at the limit: no new exhibit, even with one withdrawn
      const over = await publish(104);
      expect(over.status).toBe(409);
      expect(over.body.error.message).toMatch(/counting withdrawn/);
      // republishing reuses the exhibit's row (same ID and geometry), so it needs no slot, also concurrently
      const frozen = (await owner.req("GET", `/api/works/${workId}/exhibits`)).body.exhibits.find((x: { id: string }) => x.id === first);
      const re = await Promise.all([1, 2].map(() => owner.req("POST", `/api/exhibits/${first}/withdraw`, { withdrawn: false })));
      expect(re.map((r) => r.status)).toEqual([200, 200]);
      const after = await retained();
      expect(after).toHaveLength(LIMITS.exhibitsPerWork);
      expect(after.filter((x) => !x.withdrawn)).toHaveLength(LIMITS.exhibitsPerWork);
      const pub = await anon.req("GET", `/api/exhibits/${first}`);
      expect(pub.status).toBe(200);
      expect(pub.body.title).toBe(frozen.title);
      expect(pub.body.geometry.sticks).toHaveLength(1);
    } finally {
      // leave nothing public behind, even against a shared server
      await owner.req("POST", `/api/works/${workId}/trash`);
      await owner.req("POST", `/api/works/${workId}/delete-permanently`, { title: "Limit" });
    }
    expect((await owner.req("GET", `/api/works/${workId}`)).status).toBe(404);
  });
});
