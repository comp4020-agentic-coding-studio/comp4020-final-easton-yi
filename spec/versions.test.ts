// SAVE-01, SAVE-04..08, PUSH-01..03, HEIGHT-02, AUTH-04/05, AT-10, AT-11.
import { afterEach, describe, expect, it } from "vitest";
import { Client, FLAT, VERTICAL, Window, shared } from "./helpers.ts";

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

async function placeAndSettle(w: Window, pose: { p: number[]; q: number[] }): Promise<string> {
  const r = await w.result(w.command("place", { pose }));
  expect(r.outcome).toBe("accepted");
  await settled(w);
  return r.stickId;
}

async function saveVersion(w: Window, title: string): Promise<string> {
  const r = await w.result(w.command("snapshot.create", { title }));
  expect(r.outcome).toBe("accepted");
  return r.snapshotId;
}

const anon = new Client();

describe("versions", () => {
  it("needs a settled structure; can wait for it; the wait can be cancelled", async () => {
    const c = await shared("Owner");
    const workId = await c.createWork();
    const w = await win(c, workId);
    expect((await w.result(w.command("place", { pose: { p: [0, 20, 0], q: FLAT } }))).outcome).toBe("accepted");
    const now = await w.result(w.command("snapshot.create", { title: "Too soon" }));
    expect(now.code).toBe("NOT_STABLE");
    const waitId = w.command("snapshot.create", { title: "When settled", whenSettled: true });
    expect((await w.waitFor((m) => m.type === "command.result" && m.commandId === waitId)).outcome).toBe("pending");
    expect((await c.req("GET", `/api/commands/${waitId}`)).body.outcome).toBe("pending");
    const done = await w.result(waitId);
    expect(done.outcome).toBe("accepted");
    const list = (await c.req("GET", `/api/works/${workId}/versions`)).body.versions;
    expect(list.map((v: { title: string }) => v.title)).toContain("When settled");
    expect(list.find((v: { title: string }) => v.title === "When settled").stable).toBe(true);

    // a waiting save is cancellable and leaves no version behind
    expect((await w.result(w.command("place", { pose: { p: [5, 20, 0], q: FLAT } }))).outcome).toBe("accepted");
    const second = w.command("snapshot.create", { title: "Cancel me", whenSettled: true });
    await w.waitFor((m) => m.type === "command.result" && m.commandId === second && m.outcome === "pending");
    w.command("snapshot.cancel", {});
    expect((await w.waitFor((m) => m.type === "command.result" && m.commandId === second)).outcome).toBe("cancelled");
    await settled(w);
    const after = (await c.req("GET", `/api/works/${workId}/versions`)).body.versions;
    expect(after.map((v: { title: string }) => v.title)).not.toContain("Cancel me");
  });

  it("is readable only by members, including after removal", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork();
    const w = await win(owner, workId);
    await placeAndSettle(w, { p: [0, 0.505, 0], q: FLAT });
    const sid = await saveVersion(w, "Private version");
    const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
    const ed = await shared("Ed");
    await ed.req("POST", "/api/invites/accept", { token });
    expect((await ed.req("GET", `/api/works/${workId}/versions/${sid}/geometry`)).status).toBe(200);
    await owner.req("DELETE", `/api/works/${workId}/members/${ed.user!.id}`);
    expect((await ed.req("GET", `/api/works/${workId}/versions/${sid}/geometry`)).status).toBe(404);
    expect((await ed.req("GET", `/api/works/${workId}/versions`)).status).toBe(404);
    expect((await anon.req("GET", `/api/works/${workId}/versions`)).status).toBe(401);
  });
});

describe("exhibits and favorites", () => {
  it("a frozen exhibit doesn't change when the work collapses; withdrawal blocks public access", async () => {
    const owner = await shared("Exhibitor");
    const workId = await owner.createWork("Gallery piece");
    const w = await win(owner, workId);
    const pillar = await placeAndSettle(w, { p: [0, 4.005, 0], q: VERTICAL });
    const sid = await saveVersion(w, "Standing");
    const pub = await owner.req("POST", `/api/works/${workId}/exhibits`, {
      snapshotId: sid,
      title: "A single pillar <b>bold?</b>",
      description: "<script>alert(1)</script> just text",
      framing: { yaw: 0.8, pitch: 0.9, distance: 50, targetY: 4 },
    });
    expect(pub.status).toBe(200);
    const exhibitId = pub.body.id;

    const before = await anon.req("GET", `/api/exhibits/${exhibitId}`);
    expect(before.status).toBe(200);
    expect(before.body.attribution).toEqual(["Exhibitor"]);
    expect(before.body.description).toBe("<script>alert(1)</script> just text"); // stored as text; rendered as text
    const text = JSON.stringify(before.body);
    expect(text).not.toContain(owner.user!.id); // no account IDs in the public projection
    expect(text).not.toMatch(/blob|membership|invite|csrf/i);
    expect(before.body.geometry.sticks).toHaveLength(1);
    const thumb = await fetch(new URL(`/api/exhibits/${exhibitId}/thumbnail.svg`, anon.base));
    expect(thumb.headers.get("content-type")).toContain("image/svg+xml");
    expect(await thumb.text()).toContain("<polygon");
    const list = await anon.req("GET", `/api/exhibits?q=${encodeURIComponent("single pillar")}`);
    expect(list.body.items.map((e: { id: string }) => e.id)).toContain(exhibitId);

    // knock the pillar over; the working world changes, the exhibit doesn't
    expect((await w.result(w.command("push.prepare", {}))).outcome).toBe("accepted");
    const push = await w.result(w.command("push.confirm", { stickId: pillar, point: [0.5, 7, 0], direction: [1, 0, 0] }));
    expect(push.outcome).toBe("accepted");
    await w.waitFor((m) => m.type === "room.mode" && m.mode === "push-review", 20_000);
    const working = (await owner.state(workId)).body.bodies[0];
    expect(working[2]).toBeLessThan(2); // fallen: the centre is near the table now
    const after = await anon.req("GET", `/api/exhibits/${exhibitId}`);
    expect(after.body.geometry).toEqual(before.body.geometry);
    expect((await w.result(w.command("push.keep", {}))).outcome).toBe("accepted");

    // favorites: private, idempotent, and a withdrawn placeholder
    const fan = await shared("Fan");
    expect((await fan.req("PUT", `/api/favorites/${exhibitId}`)).body.favorite).toBe(true);
    expect((await fan.req("PUT", `/api/favorites/${exhibitId}`)).body.favorite).toBe(true);
    expect((await fan.req("GET", "/api/favorites")).body.favorites).toHaveLength(1);
    const other = await shared("Other");
    expect((await other.req("GET", "/api/favorites")).body.favorites).toHaveLength(0);

    // not the owner: refused without revealing whose it is
    expect((await fan.req("POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: true })).status).toBe(404);
    expect((await owner.req("POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: true })).status).toBe(200);
    const gone = await anon.req("GET", `/api/exhibits/${exhibitId}`);
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe("WITHDRAWN");
    expect((await fetch(new URL(`/api/exhibits/${exhibitId}/thumbnail.svg`, anon.base))).status).toBe(404);
    const favs = (await fan.req("GET", "/api/favorites")).body.favorites;
    expect(favs).toEqual([{ exhibitId, withdrawn: true, savedAt: favs[0].savedAt }]); // no title or geometry leak
    expect((await other.req("PUT", `/api/favorites/${exhibitId}`)).status).toBe(404);
    expect((await fan.req("DELETE", `/api/favorites/${exhibitId}`)).body.favorite).toBe(false);

    // republishing shows the same frozen geometry; the referenced version can't be deleted
    await owner.req("POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: false });
    expect((await anon.req("GET", `/api/exhibits/${exhibitId}`)).body.geometry).toEqual(before.body.geometry);
    const del = await owner.req("DELETE", `/api/works/${workId}/versions/${sid}`);
    expect(del.body.error.code).toBe("REFERENCED");
  });

  it("only settled named versions can be exhibited, and only by the owner", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork();
    const w = await win(owner, workId);
    await placeAndSettle(w, { p: [0, 0.505, 0], q: FLAT });
    const sid = await saveVersion(w, "v");
    const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
    const ed = await shared("Ed");
    await ed.req("POST", "/api/invites/accept", { token });
    const framing = { yaw: 0, pitch: 1, distance: 40, targetY: 2 };
    expect((await ed.req("POST", `/api/works/${workId}/exhibits`, { snapshotId: sid, title: "x", framing })).status).toBe(403);
    // a push protection point is a recovery point, not publishable
    expect((await w.result(w.command("push.prepare", {}))).outcome).toBe("accepted");
    w.command("push.cancel", {});
    const versions = (await owner.req("GET", `/api/works/${workId}/versions`)).body.versions;
    const protect = versions.find((v: { kind: string }) => v.kind === "push-protect");
    expect(protect).toBeTruthy();
    const r = await owner.req("POST", `/api/works/${workId}/exhibits`, { snapshotId: protect.id, title: "x", framing });
    expect(r.status).toBe(422);
  });
});

describe("restore", () => {
  it("saves a recovery point first, bumps the epoch, matches the version, keeps best height and members, and fails stale requests", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork();
    const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
    const ed = await shared("Ed");
    await ed.req("POST", "/api/invites/accept", { token });
    const w = await win(owner, workId);
    const e = await win(ed, workId);
    await placeAndSettle(w, { p: [0, 0.505, 0], q: FLAT });
    const sid = await saveVersion(w, "One stick");
    const versionGeom = (await owner.req("GET", `/api/works/${workId}/versions/${sid}/geometry`)).body;
    await placeAndSettle(w, { p: [0, 4.005, 4], q: VERTICAL });
    const tall = (await owner.state(workId)).body;
    expect(tall.bestHeight).toBeCloseTo(8, 0);

    // the editor holds a ghost and an old view while the owner restores
    e.send({ type: "draft.start", seq: 1, epoch: e.snapshot.epoch, pose: { p: [6, 0.6, 0], q: FLAT } });
    const oldView = { ...e.snapshot };
    const r = await w.result(w.command("restore", { snapshotId: sid }));
    expect(r.outcome).toBe("accepted");
    expect(r.epoch).toBe(tall.epoch + 1);
    await e.waitFor((m) => m.type === "room.reset");
    const fresh = await e.waitFor((m) => m.type === "room.snapshot");
    expect(fresh.epoch).toBe(tall.epoch + 1);
    expect(fresh.drafts).toEqual([]); // remote ghosts are cleared and must be started again

    const state = (await owner.state(workId)).body;
    expect(state.sticks.map((s: { id: string }) => s.id)).toEqual(versionGeom.sticks.map((s: { id: string }) => s.id));
    expect(state.bodies[0].slice(1, 4)).toEqual(versionGeom.sticks[0].p);
    expect(state.bestHeight).toBeCloseTo(tall.bestHeight, 5); // best height isn't rolled back
    const members = (await owner.req("GET", `/api/works/${workId}`)).body.members;
    expect(members.map((m: { displayName: string }) => m.displayName).sort()).toEqual(["Ed", "Owner"]);
    const versions = (await owner.req("GET", `/api/works/${workId}/versions`)).body.versions;
    expect(versions.some((v: { kind: string }) => v.kind === "restore-protect")).toBe(true);

    // the editor's request prepared before the restore is refused, not moved
    e.snapshot = oldView;
    const stale = await e.result(e.command("place", { pose: { p: [6, 0.505, 0], q: FLAT } }));
    expect(stale.code).toBe("STALE_WORLD");
  });
});

describe("push mode", () => {
  it("blocks placement for everyone, and an owner who disconnects can't leave it locked", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork();
    const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
    const ed = await shared("Ed");
    await ed.req("POST", "/api/invites/accept", { token });
    const w = await win(owner, workId);
    const e = await win(ed, workId);
    await placeAndSettle(w, { p: [0, 0.505, 0], q: FLAT });
    expect((await w.result(w.command("push.prepare", {}))).outcome).toBe("accepted");
    expect((await e.waitFor((m) => m.type === "room.mode")).mode).toBe("push-selecting");
    const blocked = await e.result(e.command("place", { pose: { p: [5, 0.505, 5], q: FLAT } }));
    expect(blocked.code).toBe("MODE");
    w.close(); // the owner vanishes mid-push
    const cleared = await e.waitFor((m) => m.type === "room.mode" && m.mode === "build", 20_000);
    expect(cleared.message).toMatch(/cleared/);
    expect((await e.result(e.command("place", { pose: { p: [5, 0.505, 5], q: FLAT } }))).outcome).toBe("accepted");
  });

  it("refuses to start while the structure is moving and validates the contact point", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork();
    const w = await win(owner, workId);
    const id = (await w.result(w.command("place", { pose: { p: [0, 15, 0], q: FLAT } }))).stickId;
    expect((await w.result(w.command("push.prepare", {}))).code).toBe("NOT_STABLE");
    await settled(w);
    expect((await w.result(w.command("push.prepare", {}))).outcome).toBe("accepted");
    const far = await w.result(w.command("push.confirm", { stickId: id, point: [0, 9, 0], direction: [1, 0, 0] }));
    expect(far.code).toBe("BAD_REQUEST");
    const vertical = await w.result(w.command("push.confirm", { stickId: id, point: [0, 1, 0.5], direction: [0, 1, 0] }));
    expect(vertical.code).toBe("BAD_REQUEST");
  });
});

describe("archive", () => {
  it("ends live editing, hides nothing it shouldn't, keeps exhibits public, and can be undone", async () => {
    const owner = await shared("Owner");
    const workId = await owner.createWork("To archive");
    const w = await win(owner, workId);
    await placeAndSettle(w, { p: [0, 0.505, 0], q: FLAT });
    const sid = await saveVersion(w, "keep");
    const ex = (await owner.req("POST", `/api/works/${workId}/exhibits`, { snapshotId: sid, title: "Still public", framing: { yaw: 0, pitch: 1, distance: 40, targetY: 2 } })).body.id;
    expect((await owner.req("POST", `/api/works/${workId}/archive`, { archived: true })).status).toBe(200);
    const offline = await w.waitFor((m) => m.type === "room.snapshot" && !m.live);
    expect(offline.mode).toBe("archived");
    const r = await w.result(w.command("place", { pose: { p: [0, 0.505, 5], q: FLAT } }));
    expect(r.code).toBe("ARCHIVED");
    expect((await owner.state(workId)).body.sticks).toHaveLength(1); // still readable
    expect((await anon.req("GET", `/api/exhibits/${ex}`)).status).toBe(200); // archiving doesn't withdraw
    expect((await owner.req("GET", "/api/works")).body.works.find((x: { id: string }) => x.id === workId).archived).toBe(true);
    await owner.req("POST", `/api/works/${workId}/archive`, { archived: false });
    const back = await win(owner, workId);
    expect(back.snapshot.live).toBe(true);
    const again = await back.result(back.command("place", { pose: { p: [0, 0.505, 5], q: FLAT } }));
    expect(again.code ?? again.outcome).toBe("accepted");
  });
});
