// ADR-0007: permanent account deletion over real HTTP and WebSocket sessions.
// Each test deletes accounts it registered itself; shared accounts are only
// ever the other party and are never deleted.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Client, FLAT, PASSWORD, Window, sessionOf, shared } from "./helpers.ts";

const open: Window[] = [];
afterEach(() => {
  for (const w of open.splice(0)) w.close();
});
const win = async (c: Client, workId?: string): Promise<Window> => {
  const w = await Window.open(c, workId);
  open.push(w);
  return w;
};

const del = (c: Client, password = PASSWORD, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  c.req("POST", "/api/account/delete", { password, ...extra }, headers);

const uniqueName = (prefix: string): string => `${prefix} ${randomUUID().slice(0, 8)}`;

async function invite(owner: Client, workId: string, guest: Client): Promise<void> {
  const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
  expect((await guest.req("POST", "/api/invites/accept", { token })).status).toBe(200);
}

async function settledVersion(w: Window, title: string): Promise<string> {
  const id = w.command("snapshot.create", { title, whenSettled: true });
  const r = await w.waitFor((m) => m.type === "command.result" && m.commandId === id && m.outcome !== "pending", 20_000);
  expect(r.outcome).toBe("accepted");
  return r.snapshotId;
}

const FRAMING = { yaw: 0, pitch: 1, distance: 40, targetY: 2 };

describe("authentication for account deletion", () => {
  it("refuses without a session, the right password, CSRF or same origin, and a body can't choose the target", async () => {
    const victim = await new Client().register(uniqueName("Victim"));
    const stranger = await shared("Stranger");
    const workId = await victim.createWork("Still mine");

    expect((await new Client().req("POST", "/api/account/delete", { password: PASSWORD }, { origin: new URL(victim.base).origin })).status).toBe(401);
    const wrong = await del(victim, "not the password at all");
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("BAD_CREDENTIALS");
    expect((await del(victim, PASSWORD, {}, { "x-csrf-token": "forged" })).body.error.code).toBe("CSRF");
    expect((await del(victim, PASSWORD, {}, { origin: "https://evil.example" })).body.error.code).toBe("ORIGIN");
    expect((await victim.req("GET", "/api/account/delete")).status).toBe(404); // GET never deletes
    // the stranger's session with the victim's password and ID: checked against the stranger's own hash
    expect((await del(stranger, PASSWORD + "x", { userId: victim.user!.id })).body.error.code).toBe("BAD_CREDENTIALS");

    // nothing was deleted by any of that
    expect((await victim.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).toContain(workId);
    expect((await stranger.req("GET", "/api/works")).status).toBe(200);
    expect((await sessionOf(victim)).user!.id).toBe(victim.user!.id);
  });
});

describe("deleting an account", () => {
  it("revokes every session and credential at once; retries, old requests and re-registration can't reach the new account", async () => {
    const victim = await new Client().register(uniqueName("Leaver"));
    const handle = victim.user!.handle;
    const other = await sessionOf(victim);
    const otherWindow = await win(other);
    const stranger = await shared("Stranger");

    const t0 = performance.now();
    const r = await del(victim, PASSWORD, { userId: stranger.user!.id }); // a body ID is ignored
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ deleted: true, worksDeleted: 0 });
    expect(r.body.notifications.failed).toBe(0);
    expect(victim.cookie).toBe(""); // the server cleared it
    const ended = await otherWindow.waitFor((m) => m.type === "access.ended", 3000);
    expect(ended.reason).toBe("ACCOUNT_DELETED");
    expect(ended.receivedAt - t0).toBeLessThan(1500);
    expect((await stranger.req("GET", "/api/works")).status).toBe(200);

    // every old credential is dead
    expect((await other.req("GET", "/api/works")).status).toBe(401);
    expect((await other.req("GET", "/api/session")).body.user).toBeNull();
    await expect(Window.open(other)).rejects.toThrow(/401/);
    expect((await new Client().login(handle, PASSWORD)).status).toBe(401);
    const recover = await new Client().req("POST", "/api/auth/recover", { handle, recoveryCode: victim.recoveryCode, newPassword: "a whole new password" });
    expect(recover.body.error.code).toBe("BAD_CREDENTIALS");
    // a retry of the old request does nothing more
    const retry = await del(other);
    expect(retry.status).toBe(401);
    expect(retry.body.error.code).toBe("UNAUTHENTICATED");

    // the handle can be registered again, as a new identity that inherits nothing
    const again = new Client();
    const reg = await again.req("POST", "/api/auth/register", { handle, displayName: "New person", password: PASSWORD });
    expect(reg.status).toBe(200);
    again.csrf = reg.body.csrf;
    expect(reg.body.user.id).not.toBe(victim.user!.id);
    // old cookies and a replay of the old request still can't act, even on the new account
    expect((await del(other)).status).toBe(401);
    expect((await other.req("GET", "/api/works")).status).toBe(401);
    expect((await again.req("GET", "/api/works")).body.works).toEqual([]);
    expect((await again.req("GET", "/api/trash")).body.works).toEqual([]);
    expect((await again.req("GET", "/api/favorites")).body.favorites).toEqual([]);
    expect((await again.req("GET", "/api/collaborations/unavailable")).body.works).toEqual([]);
  });

  it("two submissions at once delete once: one success, one 'signed out'", async () => {
    const c = await new Client().register(uniqueName("Twice"));
    await c.createWork("Only once");
    const results = await Promise.all([del(c), del(c)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(results.find((r) => r.status === 401)!.body.error.code).toBe("UNAUTHENTICATED");
    expect(results.find((r) => r.status === 200)!.body.worksDeleted).toBe(1);
  });
});

describe("ownership boundaries", () => {
  it("deletes the account's works in every state; keeps a partner's work, de-identified, collaborating and restorable", async () => {
    const name = uniqueName("Quillon");
    const a = await new Client().register(name);
    const b = await shared("Partner");

    // A's works: active (with B, sticks by both, a published and a withdrawn exhibit), archived, trashed
    const active = await a.createWork("A active");
    const archived = await a.createWork("A archived");
    const trashed = await a.createWork("A trashed");
    await invite(a, active, b);
    await invite(a, trashed, b);
    const aw = await win(a, active);
    expect((await aw.result(aw.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }))).outcome).toBe("accepted");
    const bInA = await win(b, active);
    expect((await bInA.result(bInA.command("place", { pose: { p: [0, 0.505, 3], q: FLAT } }))).outcome).toBe("accepted");
    const aVersion = await settledVersion(aw, "A's version");
    const pubA = await a.req("POST", `/api/works/${active}/exhibits`, { snapshotId: aVersion, title: `${name} exhibit`, framing: FRAMING });
    const withdrawnA = await a.req("POST", `/api/works/${active}/exhibits`, { snapshotId: aVersion, title: `${name} withdrawn`, framing: FRAMING });
    expect((await a.req("POST", `/api/exhibits/${withdrawnA.body.id}/withdraw`, { withdrawn: true })).status).toBe(200);
    expect((await b.req("PUT", `/api/favorites/${pubA.body.id}`)).status).toBe(200);
    expect((await a.req("POST", `/api/works/${archived}/archive`, { archived: true })).status).toBe(200);
    expect((await a.req("POST", `/api/works/${trashed}/trash`)).status).toBe(200);

    // B's work: A is an editor, places a stick and saves a version; B exhibits it; A favorites it
    const mine = await b.createWork("B keeps this");
    await invite(b, mine, a);
    const bw = await win(b, mine);
    const aInB = await win(a, mine);
    const aStick = (await aInB.result(aInB.command("place", { pose: { p: [0, 0.505, 0], q: FLAT } }))).stickId;
    expect((await bw.result(bw.command("place", { pose: { p: [0, 0.505, 3], q: FLAT } }))).outcome).toBe("accepted");
    const versionByA = await settledVersion(aInB, "Saved by A");
    const pubB = await b.req("POST", `/api/works/${mine}/exhibits`, { snapshotId: versionByA, title: "Partner's exhibit", framing: FRAMING });
    expect((await new Client().req("GET", `/api/exhibits/${pubB.body.id}`)).body.attribution).toContain(name);
    expect((await a.req("PUT", `/api/favorites/${pubB.body.id}`)).status).toBe(200);
    aw.close();

    const t0 = performance.now();
    const r = await del(a);
    expect(r.status).toBe(200);
    expect(r.body.worksDeleted).toBe(3);

    // B, connected to A's work, is told within about a second, without a reason
    const gone = await bInA.waitFor((m) => m.type === "access.ended", 3000);
    expect(gone.reason).toBe("WORK_DELETED");
    expect(gone.message).not.toContain(name);
    expect(gone.receivedAt - t0).toBeLessThan(1500);
    // B's own room continues, now without A and with A's name gone from what it sends
    const resync = await bw.waitFor((m) => m.type === "room.snapshot" && m.sticks.some((s: { id: string; authorId: string }) => s.id === aStick && s.authorId === "deleted-user"), 3000);
    expect(resync.sticks.find((s: { id: string }) => s.id === aStick)).toMatchObject({ authorId: "deleted-user", authorName: "Deleted user" });
    expect(resync.presence.map((p: { userId: string }) => p.userId)).toEqual([b.user!.id]);
    expect(JSON.stringify(resync)).not.toContain(a.user!.id);
    expect((await bw.result(bw.command("place", { pose: { p: [0, 0.505, -3], q: FLAT } }))).outcome).toBe("accepted");

    // A's works are gone in every state, for B too: plain 404, not "trashed"
    for (const w of [active, archived, trashed]) expect((await b.state(w)).status).toBe(404);
    expect((await b.req("GET", "/api/works")).body.works.map((w: { id: string }) => w.id)).not.toContain(active);
    expect((await b.req("GET", "/api/collaborations/unavailable")).body.works.map((w: { id: string }) => w.id)).not.toContain(trashed);
    for (const e of [pubA.body.id, withdrawnA.body.id]) expect((await new Client().req("GET", `/api/exhibits/${e}`)).status).toBe(404);
    expect((await b.req("GET", "/api/favorites")).body.favorites.map((f: { exhibitId: string }) => f.exhibitId)).not.toContain(pubA.body.id);

    // B's work: membership gone, contributions kept and labelled, no copy of A's identity left
    const info = await b.req("GET", `/api/works/${mine}`);
    expect(info.body.members.map((m: { userId: string }) => m.userId)).toEqual([b.user!.id]);
    const state = (await b.state(mine)).body;
    expect(state.sticks.find((s: { id: string }) => s.id === aStick)).toMatchObject({ authorId: "deleted-user", authorName: "Deleted user" });
    const versions = (await b.req("GET", `/api/works/${mine}/versions`)).body.versions;
    expect(versions.find((v: { id: string }) => v.id === versionByA).creatorName).toBe("Deleted user");
    const geometry = await b.req("GET", `/api/works/${mine}/versions/${versionByA}/geometry`);
    const exhibit = await new Client().req("GET", `/api/exhibits/${pubB.body.id}`);
    expect(exhibit.body.attribution).toContain("Deleted user");
    expect(exhibit.body.attribution).toContain("Partner");
    for (const body of [info.body, state, versions, geometry.body, exhibit.body]) {
      expect(JSON.stringify(body)).not.toContain(a.user!.id);
      expect(JSON.stringify(body)).not.toContain(name);
    }

    // the retained version still restores, de-identified
    const restored = await bw.result(bw.command("restore", { snapshotId: versionByA }));
    expect(restored.outcome).toBe("accepted");
    const after = (await b.state(mine)).body;
    expect(after.sticks.find((s: { id: string }) => s.id === aStick)?.authorName).toBe("Deleted user");
  });
});
