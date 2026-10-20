#!/usr/bin/env node
// Crit 10 two-identity probe (docs/evidence/crit-10-verification.md).
//   node scripts/crit10/probe.ts <base-url> <out.json>
// Three fresh accounts in three cookie jars: Avery owns a work, Blake joins it
// through the invitation link, Casey is a stranger. Checks identity, joining,
// shared editing, propagation, and server-side refusals (each followed by a
// state read proving nothing changed), then deletes the three accounts so the
// app keeps no probe data. Writes IDs, statuses and timings only: never
// cookies, CSRF tokens, passwords, recovery codes or invitation tokens.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Client, FLAT, PASSWORD, Window, sleep } from "../../spec/helpers.ts";

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error("usage: probe.ts <base-url> <out.json>");
const run = randomUUID().slice(0, 6);
const record: Record<string, unknown> = { base, run, startedAt: new Date().toISOString() };
const checks: { id: string; what: string; expected: unknown; actual: unknown; pass: boolean }[] = [];
const check = (id: string, what: string, expected: unknown, actual: unknown, pass = JSON.stringify(expected) === JSON.stringify(actual)): void => {
  checks.push({ id, what, expected, actual, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${what}: ${JSON.stringify(actual)}`);
};
const status = (r: { status: number; body: any }): string => `${r.status} ${r.body?.error?.code ?? r.body?.code ?? r.body?.outcome ?? ""}`.trim();

const avery = await new Client(base).register(`C10 Avery ${run}`);
const blake = await new Client(base).register(`C10 Blake ${run}`);
const casey = await new Client(base).register(`C10 Casey ${run}`);
const ids = { avery: avery.user!.id, blake: blake.user!.id, casey: casey.user!.id };
record.accounts = ids;

let windows: Window[] = [];
try {
  // C10-01: each cookie jar's session reports its own, distinct account
  const sessions = await Promise.all([avery, blake, casey].map((c) => c.req("GET", "/api/session")));
  check("C10-01", "session identities", [ids.avery, ids.blake, ids.casey], sessions.map((s) => s.body.user?.id));
  check("C10-01", "identities distinct", 3, new Set(Object.values(ids)).size);

  // C10-02: invite, anonymous preview, accept
  const workId = await avery.createWork(`C10 probe ${run}`);
  record.workId = workId;
  const inv = await avery.req("POST", `/api/works/${workId}/invite`);
  const token = new URLSearchParams(String(inv.body.path).split("#")[1]).get("token")!;
  const anon = new Client(base);
  const preview = await anon.req("POST", "/api/invites/preview", { token });
  check("C10-02", "anonymous preview names the inviter", `C10 Avery ${run}`, preview.body.inviterName);
  const accept = await blake.req("POST", "/api/invites/accept", { token });
  check("C10-02", "accept → member of the work", workId, accept.body.workId);
  const members = (await avery.req("GET", `/api/works/${workId}`)).body.members.map((m: any) => `${m.userId}:${m.role}`).sort();
  check("C10-02", "members after accept", [`${ids.avery}:owner`, `${ids.blake}:editor`].sort(), members);

  // C10-03/04: both open live windows, each places, the other receives it
  const wa = await Window.open(avery, workId);
  const wb = await Window.open(blake, workId);
  windows = [wa, wb];
  check("C10-03", "both windows live with an editing lease", [true, true, true, true], [wa.snapshot.live, wb.snapshot.live, !!wa.snapshot.lease, !!wb.snapshot.lease]);
  const placements: Record<string, unknown>[] = [];
  for (const [who, from, to, x] of [["avery", wa, wb, -6], ["blake", wb, wa, 6]] as const) {
    const t0 = performance.now();
    const commandId = from.command("place", { pose: { p: [x, 0.505, 0], q: FLAT } });
    const result = await from.result(commandId);
    if (result.outcome !== "accepted") throw new Error(`${who}'s placement ${result.outcome} ${result.code}: ${result.message}`);
    const seen = await to.waitFor((m) => m.type === "sticks.added" && m.sticks.some((s: any) => s.id === result.stickId), 5000);
    const ms = Math.round(seen.receivedAt - t0);
    const stick = seen.sticks.find((s: any) => s.id === result.stickId);
    placements.push({ who, commandId, outcome: result.outcome, stickId: result.stickId, seq: result.seq, authorIdSeenByOther: stick.authorId, sendToOtherMs: ms });
    check("C10-03", `${who}'s placement accepted`, "accepted", result.outcome);
    check("C10-04", `${who}'s stick reaches the other window with author ${who} (≤1000 ms send→receive)`, true, stick.authorId === ids[who] && ms <= 1000, stick.authorId === ids[who] && ms <= 1000);
  }
  record.placements = placements;
  const fresh = (await avery.state(workId)).body;
  const authors = fresh.sticks.map((s: any) => `${s.id}:${s.authorId}`).sort();
  check("C10-03", "fresh state read has both sticks with their authors", placements.map((p: any) => `${p.stickId}:${ids[p.who as "avery" | "blake"]}`).sort(), authors);

  // C10-05: the stranger gets the same 404 as a missing work, and nothing changes
  const before = { sticks: fresh.sticks.length, title: (await avery.req("GET", `/api/works/${workId}`)).body.title };
  const missing = randomUUID();
  const stranger = {
    stateOfWork: status(await casey.state(workId)),
    stateOfMissingWork: status(await casey.state(missing)),
    getWork: status(await casey.req("GET", `/api/works/${workId}`)),
    rename: status(await casey.req("PATCH", `/api/works/${workId}`, { title: "taken" })),
    inviteCreate: status(await casey.req("POST", `/api/works/${workId}/invite`)),
    place: status(await casey.req("POST", "/api/commands", { v: 1, type: "command", commandId: randomUUID(), workId, worldEpoch: fresh.epoch, streamId: fresh.streamId, lastSeenTick: fresh.tick, leaseId: "", kind: "place", payload: { pose: { p: [0, 0.505, 4], q: FLAT } } })),
  };
  const wc = await Window.open(casey);
  windows.push(wc);
  wc.send({ type: "room.join", workId });
  const joinReply = await wc.waitFor((m) => m.type === "error" || m.type === "room.snapshot");
  (stranger as Record<string, string>).wsJoin = joinReply.type === "error" ? `error ${joinReply.code}` : "snapshot";
  record.stranger = stranger;
  check("C10-05", "stranger refused everywhere, same as a missing work", true,
    stranger.stateOfWork === stranger.stateOfMissingWork && Object.values(stranger).every((v) => v.startsWith("404") || v === "error NOT_FOUND"),
    stranger.stateOfWork === stranger.stateOfMissingWork && Object.values(stranger).every((v) => v.startsWith("404") || v === "error NOT_FOUND"));
  const afterStranger = { sticks: (await avery.state(workId)).body.sticks.length, title: (await avery.req("GET", `/api/works/${workId}`)).body.title };
  check("C10-05", "work unchanged after the stranger's attempts", before, afterStranger);

  // C10-06: the editor calls owner-only endpoints directly (no UI), and nothing changes
  const inviteBefore = (await avery.req("GET", `/api/works/${workId}/invite`)).body.invite?.id;
  const s = (await blake.state(workId)).body;
  const editor = {
    rename: status(await blake.req("PATCH", `/api/works/${workId}`, { title: "Blake's now" })),
    inviteCreate: status(await blake.req("POST", `/api/works/${workId}/invite`)),
    inviteRevoke: status(await blake.req("DELETE", `/api/works/${workId}/invite`)),
    removeOwner: status(await blake.req("DELETE", `/api/works/${workId}/members/${ids.avery}`)),
    archive: status(await blake.req("POST", `/api/works/${workId}/archive`, { archived: true })),
    trash: status(await blake.req("POST", `/api/works/${workId}/trash`)),
    restoreVersion: status(await blake.req("POST", "/api/commands", { v: 1, type: "command", commandId: randomUUID(), workId, worldEpoch: s.epoch, streamId: s.streamId, lastSeenTick: s.tick, leaseId: "", kind: "restore", payload: { snapshotId: randomUUID() } })),
  };
  record.editor = editor;
  check("C10-06", "every owner-only call refused with 403 NOT_OWNER", true, Object.values(editor).every((v) => v === "403 NOT_OWNER"), Object.values(editor).every((v) => v === "403 NOT_OWNER"));
  const w = (await avery.req("GET", `/api/works/${workId}`)).body;
  const afterEditor = {
    title: w.title,
    archived: !!w.archived,
    trashed: w.trashedAt != null,
    members: w.members.map((m: any) => `${m.userId}:${m.role}`).sort(),
    inviteId: (await avery.req("GET", `/api/works/${workId}/invite`)).body.invite?.id,
    sticks: (await avery.state(workId)).body.sticks.length,
  };
  check("C10-06", "protected state unchanged after the editor's attempts",
    { title: before.title, archived: false, trashed: false, members, inviteId: inviteBefore, sticks: 2 }, afterEditor);
} finally {
  for (const w of windows) w.close();
  await sleep(300);
  // remove everything the probe created (deleting an account deletes the works it owns)
  const cleanup: Record<string, number> = {};
  for (const [name, c] of Object.entries({ avery, blake, casey })) cleanup[name] = (await c.req("POST", "/api/account/delete", { password: PASSWORD })).status;
  record.cleanup = cleanup;
  record.finishedAt = new Date().toISOString();
  record.checks = checks;
  writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  console.log(`cleanup ${JSON.stringify(cleanup)}; ${checks.filter((c) => c.pass).length}/${checks.length} checks passed → ${out}`);
}
