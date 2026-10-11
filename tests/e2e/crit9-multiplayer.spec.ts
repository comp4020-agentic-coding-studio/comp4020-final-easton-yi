// Crit 9 local multiplayer checks in real browsers (report:
// docs/evidence/crit-9-local-multiplayer-report.md). Three people in separate
// browser contexts build through the real UI; a test-only init script records,
// in each page, when a stick's message arrived and the first rendered frame
// that contained it. No product code is changed for this.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWork, register } from "./helpers.ts";

const RUN = (process.env.CRIT9_RUN_ID ?? `local-${Date.now()}`).slice(-6);
const OUT = process.env.CRIT9_EVIDENCE_DIR ?? "test-results/crit9";
const base = new URL(process.env.APP_URL ?? "http://localhost:8099");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error(`refusing a non-local APP_URL: ${base.origin}`);
const label = (r: string): string => `c9 ${RUN} ${r}`;
const now = (): number => performance.timeOrigin + performance.now();
const observations: Record<string, unknown> = {};
const hosts = new Set<string>();

/** Runs in every page before the app: the probe, arrival and render times, Place clicks, sent commands. */
function instrument(): void {
  localStorage.setItem("stillwood.test", "1");
  const c9 = { rendered: {} as Record<string, number>, received: {} as Record<string, number>, clicks: [] as number[], sent: [] as string[], commands: [] as { commandId: string; kind: string; at: number }[], results: {} as Record<string, { outcome: string; code?: string; message?: string; stickId?: string; at: number }>, sockets: [] as WebSocket[], drafts: {} as Record<string, unknown> };
  (window as any).__c9 = c9;
  const t = (): number => performance.timeOrigin + performance.now();
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      c9.sockets.push(this);
      this.addEventListener("message", (e) => {
        const at = t();
        try {
          const m = JSON.parse(String(e.data));
          if (m.type === "sticks.added") for (const s of m.sticks) c9.received[s.id] ??= at;
          if (m.type === "draft.pose") c9.drafts[m.userId] = m;
          if (m.type === "command.result" && m.outcome !== "pending") c9.results[m.commandId] ??= { outcome: m.outcome, code: m.code, message: m.message, stickId: m.stickId, at };
        } catch {
          // not JSON
        }
      });
    }
    send(data: string): void {
      try {
        const m = JSON.parse(data);
        c9.sent.push(m.kind ? `${m.type}:${m.kind}` : m.type);
        if (m.type === "command") c9.commands.push({ commandId: m.commandId, kind: m.kind, at: t() });
      } catch {
        // not JSON
      }
      super.send(data);
    }
  } as typeof WebSocket;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((ts) => {
      const before = (window as any).__stillwood?.stats?.().renders ?? -1;
      cb(ts);
      const p = (window as any).__stillwood;
      if (!p?.poses || p.stats().renders <= before) return;
      const at = t();
      for (const s of p.poses()) c9.rendered[s.id] ??= at;
    });
  document.addEventListener(
    "click",
    (e) => {
      const b = (e.target as HTMLElement).closest?.("button");
      if (b && b.textContent?.trim() === "Place") c9.clicks.push(t());
    },
    true,
  );
  let hidden = false;
  Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  (window as any).__setHidden = (h: boolean) => {
    hidden = h;
    document.dispatchEvent(new Event("visibilitychange"));
  };
}

let ctx: Record<"A" | "B" | "C" | "D" | "V", BrowserContext>;
let A: Page, B: Page, C: Page, D: Page;
let workId = "";

const poses = (p: Page): Promise<{ id: string; p: number[] }[]> => p.evaluate(() => (window as any).__stillwood?.poses?.() ?? []);
const ids = async (p: Page): Promise<string[]> => (await poses(p)).map((s) => s.id).sort();
const c9 = <T>(p: Page, f: string): Promise<T> => p.evaluate((k) => (window as any).__c9[k], f);
const api = (p: Page, method: string, path: string, body?: unknown) =>
  p.evaluate(
    async ({ method, path, body }) => {
      const s = await (await fetch("/api/session")).json();
      const r = await fetch(path, { method, headers: { "content-type": "application/json", "x-csrf-token": s.csrf ?? "" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { method, path, body },
  );
const serverIds = async (p: Page): Promise<string[]> => (await api(p, "GET", `/api/works/${workId}/state`)).body.sticks.map((s: { id: string }) => s.id).sort();
async function until<T>(f: () => Promise<T | undefined | null | false>, ms: number): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v as T;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 15));
  }
}
async function skipIntro(p: Page): Promise<void> {
  const skip = p.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
const lastPlaced = new Map<Page, number>();
interface Placed {
  id: string | null;
  message: string | null;
  commandId: string | null;
  result: { outcome: string; code?: string; message?: string } | null;
  draftBeforeClick: string | null;
}
/**
 * Add a stick through the UI and place it. Records the command the page sent
 * (if any) and the server's result for that command ID, so an unplaced stick is
 * explained rather than guessed at.
 */
async function placeVia(p: Page): Promise<Placed> {
  const wait = 700 - (Date.now() - (lastPlaced.get(p) ?? 0)); // stay under 2 commands/s per account
  if (wait > 0) await p.waitForTimeout(wait);
  const before = new Set(await ids(p));
  const sentBefore = (await c9<unknown[]>(p, "commands")).length;
  await p.getByRole("button", { name: "Add a stick" }).click();
  await expect(p.locator(".draft-state")).toBeVisible();
  const draftBeforeClick = await p.locator(".draft-state").innerText().catch(() => null);
  await p.getByRole("button", { name: "Place", exact: true }).click();
  lastPlaced.set(p, Date.now());
  const id = await until(async () => (await ids(p)).find((x) => !before.has(x)), 5000);
  const cmds = (await c9<{ commandId: string; kind: string }[]>(p, "commands")).slice(sentBefore).filter((c) => c.kind === "place");
  const commandId = cmds[cmds.length - 1]?.commandId ?? null;
  const result = commandId ? await until(() => p.evaluate((c) => (window as any).__c9.results[c], commandId), id ? 1000 : 3000) : null;
  if (!id) {
    const message = await p.locator(".ws-stage").innerText().catch(() => null);
    await p.keyboard.press("Escape");
    return { id: null, message, commandId, result, draftBeforeClick };
  }
  await expect(p.locator(".draft-state")).toHaveCount(0);
  return { id, message: null, commandId, result, draftBeforeClick };
}
/** Page clock minus controller clock, from round trips (both are wall-clock based on one host). */
async function offset(p: Page): Promise<{ offsetMs: number; halfRttMs: number }> {
  const xs: { o: number; h: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const t0 = now();
    const tp = await p.evaluate(() => performance.timeOrigin + performance.now());
    const t1 = now();
    xs.push({ o: tp - (t0 + t1) / 2, h: (t1 - t0) / 2 });
  }
  xs.sort((a, b) => a.h - b.h);
  return { offsetMs: xs[0]!.o, halfRttMs: xs[0]!.h };
}

test.describe.serial("Crit 9 local multiplayer (browser)", () => {
  test.beforeAll(async ({ browser }) => {
    const make = async (): Promise<BrowserContext> => {
      const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await c.addInitScript(instrument);
      c.on("request", (r) => hosts.add(new URL(r.url()).host));
      c.on("page", (pg) => pg.on("websocket", (ws) => hosts.add(new URL(ws.url()).host)));
      return c;
    };
    ctx = { A: await make(), B: await make(), C: await make(), D: await make(), V: await make() };
    [A, B, C, D] = await Promise.all([ctx.A, ctx.B, ctx.C, ctx.D].map((c) => c.newPage()));
    for (const pg of [A, B, C, D]) pg.on("websocket", (ws) => hosts.add(new URL(ws.url()).host));
  });

  test.afterAll(async () => {
    mkdirSync(OUT, { recursive: true });
    observations.hosts = [...hosts];
    writeFileSync(join(OUT, "browser-observations.json"), JSON.stringify(observations, null, 2));
    writeFileSync(join(OUT, "browser-hosts.txt"), [...hosts].join(" ") || "none");
    for (const c of Object.values(ctx ?? {})) await c.close();
  });

  test("M01 separate identities join one work through the invitation; an outsider can't open it", async () => {
    for (const [p, r] of [[A, "A"], [B, "B"], [C, "C"], [D, "D"]] as const) await register(p, label(r));
    const userIds = await Promise.all([A, B, C, D].map(async (p) => (await api(p, "GET", "/api/session")).body.user.id));
    expect(new Set(userIds).size).toBe(4);
    workId = await createWork(A, label("W"));
    await skipIntro(A);
    await A.getByRole("button", { name: "People" }).click();
    await A.getByRole("button", { name: "Make an invitation link" }).click();
    const link = await A.getByLabel("Send this link to a friend (shown once):").inputValue();
    expect(new URL(link).origin).toBe(base.origin);
    await A.getByRole("button", { name: "Close panel" }).click();
    for (const [p, r] of [[B, "B"], [C, "C"]] as const) {
      await p.goto(link);
      await p.getByRole("button", { name: `Join as ${label(r)}` }).click();
      await p.waitForURL(new RegExp(`/works/${workId}/`));
      await expect(p.locator(".conn-open")).toBeVisible();
      await skipIntro(p);
    }
    const roles = await Promise.all([A, B, C].map(async (p) => (await api(p, "GET", `/api/works/${workId}`)).body.role));
    expect(roles).toEqual(["owner", "editor", "editor"]);
    await expect(A.locator("ul.presence")).toContainText(label("B"));
    await expect(A.locator("ul.presence")).toContainText(label("C"));
    const titles = await Promise.all([A, B, C].map((p) => p.locator("h1.ws-title").innerText()));
    expect(new Set(titles).size).toBe(1);
    expect(new Set(await Promise.all([A, B, C].map(async (p) => JSON.stringify(await ids(p))))).size).toBe(1);
    await B.reload();
    await expect(B.locator(".conn-open")).toBeVisible();
    await skipIntro(B);
    expect((await api(B, "GET", `/api/works/${workId}`)).body.role).toBe("editor");
    await D.goto(`/works/${workId}/`);
    await expect(D.getByRole("heading", { name: "Can't open this work" })).toBeVisible();
    const dState = await api(D, "GET", `/api/works/${workId}/state`);
    expect(dState.status).toBe(404);
    expect(JSON.stringify(dState.body)).not.toContain(label("W"));
    observations.M01 = { distinctUserIds: 4, roles, presenceOnA: [label("B"), label("C")], sameTitleAndScene: true, refreshKeepsMembership: true, outsider: { page: "Can't open this work", state: dState.status } };
  });

  test("M03 a partner's held stick shows as a ghost, apart from real sticks, and clears on cancel, place and leave", async () => {
    await B.getByRole("button", { name: "Sticks" }).click();
    const held = B.getByText(`${label("A")} (ghosts aren't real sticks yet)`, { exact: false });
    await A.getByRole("button", { name: "Add a stick" }).click();
    await expect(held).toBeVisible({ timeout: 3000 });
    await expect(B.getByRole("heading", { name: "Sticks (0)" })).toBeVisible();
    expect(await ids(B)).toEqual([]);
    await A.keyboard.press("Escape");
    await expect(held).toHaveCount(0, { timeout: 3000 });
    const placed = await placeVia(A);
    expect(placed.id).not.toBeNull();
    await expect(held).toHaveCount(0, { timeout: 3000 });
    await expect(B.getByRole("heading", { name: "Sticks (1)" })).toBeVisible();
    expect(await ids(B)).toEqual([placed.id]);
    await A.getByRole("button", { name: "Add a stick" }).click();
    await expect(held).toBeVisible({ timeout: 3000 });
    await A.goto("/works/");
    await expect(held).toHaveCount(0, { timeout: 3000 });
    await expect(B.locator("ul.presence")).not.toContainText(label("A"));
    await A.goto(`/works/${workId}/`);
    await expect(A.locator(".conn-open")).toBeVisible();
    await skipIntro(A);
    await B.getByRole("button", { name: "Sticks" }).click();
    observations.M03 = { ghostShownToB: true, ghostCountedAsStick: false, clearedOnCancel: true, clearedOnPlace: true, clearedOnLeave: true, sticksAfter: 1 };
  });

  test("M02 + timing: placements from A, B and C appear in every other open session without reload", async () => {
    test.setTimeout(300_000);
    const offsets = { A: await offset(A), B: await offset(B), C: await offset(C) };
    const logPath = process.env.CRIT9_SERVER_LOG;
    const logStart = logPath ? statSync(logPath).size : 0;
    const pages = { A, B, C };
    const plan = [...Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? "A" : "B")), "C", "C"] as ("A" | "B" | "C")[];
    const samples: Record<string, unknown>[] = [];
    for (const [i, s] of plan.entries()) {
      const sender = pages[s];
      const r = await placeVia(sender);
      const clicks = await c9<number[]>(sender, "clicks");
      const clickAt = clicks[clicks.length - 1]! - offsets[s].offsetMs;
      const row: Record<string, unknown> = { n: i + 1, sender: s, stickId: r.id, accepted: !!r.id, commandId: r.commandId, serverResult: r.result, draftBeforeClick: r.draftBeforeClick, unplacedStageText: r.message, clickAt };
      for (const rcv of (["A", "B", "C"] as const).filter((x) => x !== s)) {
        const sid = r.id;
        const got = sid ? await until(() => pages[rcv].evaluate((id) => (window as any).__c9.rendered[id] as number | undefined, sid), 5000) : null;
        const recv = sid ? await pages[rcv].evaluate((id) => (window as any).__c9.received[id] as number | undefined, sid) : undefined;
        row[`${rcv}_received`] = recv == null ? null : recv - offsets[rcv].offsetMs;
        row[`${rcv}_rendered`] = got == null ? null : got - offsets[rcv].offsetMs;
      }
      samples.push(row);
    }
    // server acceptance times from the run's own server log, matched by command ID (never by order)
    const byCommand = new Map<string, { time: number; outcome: string; code?: string }>();
    if (logPath) {
      for (const l of readFileSync(logPath, "utf8").slice(logStart).split("\n")) {
        if (!l.includes('"event":"command.place"')) continue;
        const e = JSON.parse(l);
        byCommand.set(e.commandId, { time: Date.parse(e.time), outcome: e.outcome, code: e.code });
      }
    }
    for (const x of samples) {
      const e = x.commandId ? byCommand.get(x.commandId as string) : undefined;
      x.serverLog = e ? { outcome: e.outcome, code: e.code } : null;
      x.serverOutcome = e ? `${e.outcome}${e.code ? `:${e.code}` : ""}` : x.commandId ? "no log line" : "no command sent";
      if (e?.outcome === "accepted") x.serverAcceptedAt = e.time;
    }
    const acceptedRows = samples.filter((x) => x.accepted);
    const mapped = acceptedRows.every((x) => x.serverAcceptedAt != null);
    const accepts = [...byCommand.values()].filter((e) => e.outcome === "accepted");
    // convergence: same IDs everywhere and on the server, no duplicates; transforms compared once settled
    const settleFrom = Date.now();
    const settled = await A.locator(".save-saved").waitFor({ timeout: 120_000 }).then(() => true, () => false);
    const settleMs = Date.now() - settleFrom;
    await A.waitForTimeout(600);
    const all = await Promise.all([A, B, C].map(poses));
    const server = (await api(A, "GET", `/api/works/${workId}/state`)).body;
    const sid = server.bodies.map((b: unknown[]) => b[0] as string).sort();
    for (const ps of all) {
      expect(ps.map((x) => x.id).sort()).toEqual(sid);
      expect(new Set(ps.map((x) => x.id)).size).toBe(ps.length);
    }
    let maxDelta: number | null = null;
    if (settled) {
      maxDelta = 0;
      for (const b of server.bodies as [string, number, number, number][]) {
        for (const ps of all) {
          const mine = ps.find((x) => x.id === b[0])!;
          maxDelta = Math.max(maxDelta, ...mine.p.map((v, k) => Math.abs(v - (b[k + 1] as number))));
        }
      }
      expect(maxDelta).toBeLessThan(1e-3);
    }
    mkdirSync(OUT, { recursive: true });
    const cols = ["n", "sender", "accepted", "commandId", "serverOutcome", "clickAt", "serverAcceptedAt", "A_received", "A_rendered", "B_received", "B_rendered", "C_received", "C_rendered"];
    writeFileSync(join(OUT, "timing-samples.csv"), [cols.join(","), ...samples.map((x) => cols.map((c) => (x[c] == null ? "" : typeof x[c] === "number" ? (x[c] as number).toFixed(1) : String(x[c]))).join(","))].join("\n") + "\n");
    observations.timing = { offsets, serverMatchedByCommandId: mapped, serverAccepts: accepts.length, attempted: plan.length, accepted: acceptedRows.length, samples };
    observations.M02 = { sticksEverywhere: sid.length, duplicates: 0, settled, settleWaitMs: settleMs, maxPositionDeltaFromServer: maxDelta, statusAtEnd: await A.locator(".ws-status").innerText(), senders: { A: 12, B: 12, C: 2 } };
  });

  test("M05 a placement that conflicts with a partner's just-committed stick is refused with a reason and the draft is kept", async () => {
    await B.getByRole("button", { name: "Add a stick" }).click();
    await expect(B.locator(".draft-state")).toBeVisible();
    const bId = (await api(B, "GET", "/api/session")).body.user.id;
    const ghost = await until(() => A.evaluate((u) => (window as any).__c9.drafts[u] as { pose: unknown } | undefined, bId), 3000);
    expect(ghost).not.toBeNull();
    // A, from a second socket in A's own browser, takes over editing and commits exactly at B's ghost
    const conflict = await A.evaluate(
      async ({ workId, pose }) => {
        const s = await (await fetch("/api/session")).json();
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const next = (pred: (m: any) => boolean): Promise<any> =>
          new Promise((res) => {
            const l = (e: MessageEvent): void => {
              const m = JSON.parse(String(e.data));
              if (pred(m)) (ws.removeEventListener("message", l), res(m));
            };
            ws.addEventListener("message", l);
          });
        await new Promise((r) => ws.addEventListener("open", r));
        ws.send(JSON.stringify({ type: "hello", csrf: s.csrf }));
        await next((m) => m.type === "hello.ok");
        ws.send(JSON.stringify({ type: "room.join", workId }));
        const snap = await next((m) => m.type === "room.snapshot");
        ws.send(JSON.stringify({ type: "lease.takeover" }));
        const lease = await next((m) => m.type === "lease.changed" && m.lease);
        const commandId = crypto.randomUUID();
        ws.send(JSON.stringify({ v: 1, type: "command", commandId, workId, worldEpoch: snap.epoch, streamId: snap.streamId, lastSeenTick: snap.tick + 1000, leaseId: lease.lease.leaseId, kind: "place", payload: { pose } }));
        const r = await next((m) => m.type === "command.result" && m.commandId === commandId);
        ws.close();
        return { outcome: r.outcome, code: r.code, stickId: r.stickId };
      },
      { workId, pose: (ghost as { pose: unknown }).pose },
    );
    expect(conflict.outcome).toBe("accepted");
    await until(async () => (await ids(B)).includes(conflict.stickId), 3000);
    const sentBefore = (await c9<string[]>(B, "sent")).filter((x) => x === "command:place").length;
    // the partner's stick now occupies B's ghost: B's own check refuses before anything is sent
    await expect(B.locator(".draft-state")).toContainText("Intersecting; adjust position", { timeout: 3000 });
    const placeDisabled = await B.getByRole("button", { name: "Place", exact: true }).isDisabled();
    await B.keyboard.press("Enter"); // the keyboard shortcut is refused too
    await B.waitForTimeout(300);
    await expect(B.locator(".draft-state")).toBeVisible();
    const sentAfter = (await c9<string[]>(B, "sent")).filter((x) => x === "command:place").length;
    const feedback = await B.locator(".draft-state").innerText();
    expect(placeDisabled).toBe(true);
    await B.waitForTimeout(500);
    const everywhere = await Promise.all([A, B, C].map(ids));
    const srv = await serverIds(A);
    for (const x of everywhere) expect(x).toEqual(srv);
    expect(srv.filter((x) => x === conflict.stickId)).toHaveLength(1);
    await B.keyboard.press("Escape");
    // closing the second socket frees the seat, and the server gives it back to A's workshop window
    await expect(A.getByRole("button", { name: "Add a stick" })).toBeEnabled({ timeout: 5000 });
    observations.M05 = { partnerCommitAtGhost: conflict.outcome, path: sentAfter > sentBefore ? "sent to server" : "refused by the client's advisory check before sending", placeDisabled, feedback, draftKept: true, phantomSticks: 0, convergedWithServer: true };
  });

  test("M08 B's socket really closes; A keeps building; B recovers the authoritative state without duplicates", async () => {
    await B.getByRole("button", { name: "Add a stick" }).click();
    await expect(B.locator(".draft-state")).toBeVisible();
    const socketsBefore = (await (await A.request.get("/readyz")).json()).sockets;
    // Close while online, then go offline before the client's first retry (≥ 375 ms later). Going offline
    // first can leave a page-initiated close stalled in CLOSING under Playwright's emulation, with no close
    // event for the app to react to (follow-up F3: reproduced 1 in 5 while frames streamed).
    const closed = await B.evaluate(() => {
      const open = (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1);
      open.forEach((s: WebSocket) => s.close());
      return open.length;
    });
    await ctx.B.setOffline(true);
    // diagnostics kept whatever happens next: what was closed and what B showed over the next 3 s
    const trace: { ms: number; conn: string; states: number[] }[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      trace.push({ ms: Date.now() - t0, conn: await B.locator(".ws-status .conn").innerText(), states: await B.evaluate(() => (window as any).__c9.sockets.map((s: WebSocket) => s.readyState)) });
      await B.waitForTimeout(150);
    }
    observations.M08_diagnostics = { closedOpenSockets: closed, statusTrace: trace };
    // the original check didn't tell "no open socket was closed" apart from "the indicator lagged"
    expect(closed, "an open socket existed and was closed").toBe(1);
    await expect(B.locator(".conn-reconnecting")).toBeVisible({ timeout: 5000 });
    await B.waitForTimeout(2500); // reconnect attempts fail while offline
    await expect(B.locator(".conn-reconnecting")).toBeVisible();
    const banner = await B.locator(".stage-banner").innerText();
    const placeDisabled = await B.getByRole("button", { name: "Place", exact: true }).isDisabled();
    const socketsDuring = (await (await A.request.get("/readyz")).json()).sockets;
    const made: string[] = [];
    for (let i = 0; i < 3; i++) made.push((await placeVia(A)).id!);
    await ctx.B.setOffline(false);
    await expect(B.locator(".conn-open")).toBeVisible({ timeout: 15_000 });
    await until(async () => made.every((id) => id) && (await ids(B)).length === (await serverIds(A)).length, 5000);
    expect(await ids(B)).toEqual(await serverIds(A));
    await expect(B.locator(".draft-state")).toBeVisible(); // the unplaced stick survived
    await B.waitForTimeout(300);
    const draftAfter = await B.locator(".draft-state").innerText();
    const canPlaceAfter = await B.getByRole("button", { name: "Place", exact: true }).isEnabled();
    let draftOutcome: string;
    if (canPlaceAfter) {
      await B.getByRole("button", { name: "Place", exact: true }).click();
      await expect(B.locator(".draft-state")).toHaveCount(0, { timeout: 5000 });
      draftOutcome = "placed";
    } else {
      // ghosts reserve no space (ADR-0006): A's sticks may now occupy it
      draftOutcome = `refused locally: ${draftAfter.split("\n")[0]}`;
      await B.keyboard.press("Escape");
    }
    // three more quick cycles
    for (let i = 0; i < 3; i++) {
      const n = await B.evaluate(() => {
        const open = (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1);
        open.forEach((s: WebSocket) => s.close());
        return open.length;
      });
      await ctx.B.setOffline(true);
      expect(n, `cycle ${i + 1}: an open socket existed and was closed`).toBe(1);
      await expect(B.locator(".conn-reconnecting")).toBeVisible({ timeout: 5000 });
      await ctx.B.setOffline(false);
      await expect(B.locator(".conn-open")).toBeVisible({ timeout: 15_000 });
    }
    await B.waitForTimeout(500);
    const bOpen = await B.evaluate(() => (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1).length);
    const socketsAfter = (await (await A.request.get("/readyz")).json()).sockets;
    const members = (await api(A, "GET", `/api/works/${workId}`)).body.members.length;
    const presenceB = await A.locator("ul.presence li", { hasText: label("B") }).count();
    const bIds = await ids(B);
    expect(bIds).toEqual(await serverIds(A));
    expect(new Set(bIds).size).toBe(bIds.length);
    expect([bOpen, socketsAfter, members, presenceB]).toEqual([1, socketsBefore, 3, 1]);
    observations.M08 = { socketsClosedInB: closed, statusWhileOffline: "Reconnecting…", bannerWhileOffline: banner, placeDisabledWhileOffline: placeDisabled, serverSockets: { before: socketsBefore, during: socketsDuring, after: socketsAfter }, editsByAWhileBOffline: made.length, bMatchesServerAfter: true, draftKeptAfterReconnect: true, draftAfterReconnect: draftOutcome, extraCycles: 3, bOpenSockets: bOpen, members, bPresenceEntries: presenceB };
  });

  test("M09 a hidden tab draws nothing, then shows the latest state on return without interaction (simulated visibility)", async () => {
    const cycle = async (): Promise<Record<string, unknown>> => {
      await B.evaluate(() => (window as any).__setHidden(true));
      const r0 = await B.evaluate(() => (window as any).__stillwood.stats().renders);
      const made = [(await placeVia(A)).id!, (await placeVia(A)).id!];
      const received = await until(() => B.evaluate((xs) => xs.every((x: string) => (window as any).__c9.received[x]), made), 5000);
      const r1 = await B.evaluate(() => (window as any).__stillwood.stats().renders);
      const renderedWhileHidden = await B.evaluate((xs) => xs.filter((x: string) => (window as any).__c9.rendered[x]).length, made);
      const t0 = now();
      await B.evaluate(() => (window as any).__setHidden(false));
      const shown = await until(() => B.evaluate((xs) => xs.every((x: string) => (window as any).__c9.rendered[x]), made), 5000);
      const wakeMs = now() - t0;
      expect([!!received, r1 - r0, renderedWhileHidden, !!shown]).toEqual([true, 0, 0, true]);
      return { stateReceivedWhileHidden: true, rendersWhileHidden: r1 - r0, renderedOnReturn: true, returnToRenderedMs: Math.round(wakeMs) };
    };
    const auto = await cycle();
    await B.evaluate(() => localStorage.setItem("stillwood.graphicsQuality.v1", "low"));
    await B.reload();
    await expect(B.locator(".conn-open")).toBeVisible();
    await skipIntro(B);
    const tier = await B.evaluate(() => (window as any).__stillwood.stats().tier);
    const low = await cycle();
    await B.evaluate(() => localStorage.removeItem("stillwood.graphicsQuality.v1"));
    observations.M09 = { method: "document.hidden + visibilitychange overridden in the page (real tab hiding unavailable headless)", auto, low: { tier, ...low } };
  });

  test("M10 a window on another work sees nothing from this one", async () => {
    const x = await api(B, "POST", "/api/works", { title: label("X") });
    const bx = await ctx.B.newPage();
    await bx.goto(`/works/${x.body.id}/`);
    await expect(bx.locator(".conn-open")).toBeVisible();
    await skipIntro(bx);
    await bx.getByRole("button", { name: "Sticks" }).click();
    if (!(await B.getByRole("heading", { name: /^Sticks \(/ }).isVisible())) await B.getByRole("button", { name: "Sticks" }).click(); // M09 reloaded B
    await A.getByRole("button", { name: "Add a stick" }).click();
    await expect(B.getByText(`${label("A")} (ghosts aren't real sticks yet)`, { exact: false })).toBeVisible({ timeout: 3000 });
    await A.keyboard.press("Escape");
    const placed = (await placeVia(A)).id!;
    await until(async () => (await ids(B)).includes(placed), 3000);
    const leaked = await bx.evaluate((id) => Object.keys((window as any).__c9.received).includes(id), placed);
    const xSticks = await ids(bx);
    const ghostLine = await bx.getByText("ghosts aren't real sticks yet", { exact: false }).count();
    expect([leaked, xSticks, ghostLine]).toEqual([false, [], 0]);
    await bx.close();
    observations.M10 = { otherWorkReceivedThisStick: leaked, otherWorkSticks: xSticks.length, otherWorkGhosts: ghostLine };
  });

  test("L03 a visitor sees the frozen exhibit, gets no editing, and sees the withdrawal on reload", async () => {
    test.setTimeout(180_000);
    await A.getByRole("button", { name: "Versions" }).click();
    await A.getByLabel("Save the current structure as a version").fill(label("v"));
    // "Save version" when settled, "Save when settled" while the pile still moves; both are the product's real flow
    await A.getByRole("button", { name: /^Save (version|when settled)$/ }).click();
    await expect(A.getByRole("button", { name: "Exhibit…" }).first()).toBeVisible({ timeout: 60_000 });
    await A.getByRole("button", { name: "Exhibit…" }).first().click();
    await A.getByLabel("Title").fill(label("exhibit"));
    await A.getByRole("button", { name: "Publish" }).click();
    await expect(A.locator(".toast-ok").last()).toContainText("Published", { timeout: 20_000 });
    await A.getByRole("button", { name: "Close panel" }).click();
    const exhibitId = (await api(A, "GET", `/api/works/${workId}/exhibits`)).body.exhibits[0].id;
    const v = await ctx.V.newPage();
    await v.goto(`/exhibits/${exhibitId}/`);
    await expect(v.getByRole("heading", { name: label("exhibit") })).toBeVisible();
    await expect(v.getByRole("button", { name: "Add a stick" })).toHaveCount(0);
    const before = (await v.evaluate(async (id) => (await (await fetch(`/api/exhibits/${id}`)).json()).geometry.sticks.length, exhibitId)) as number;
    await placeVia(A);
    const after = (await v.evaluate(async (id) => (await (await fetch(`/api/exhibits/${id}`)).json()).geometry.sticks.length, exhibitId)) as number;
    expect(after).toBe(before);
    expect((await api(A, "POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: true })).status).toBe(200);
    await v.reload();
    await expect(v.getByRole("heading", { name: "Withdrawn" })).toBeVisible();
    observations.L03 = { visitorSawExhibit: true, editingControls: 0, exhibitSticksBefore: before, exhibitSticksAfterMoreBuilding: after, withdrawnOnReload: true };
  });
});
