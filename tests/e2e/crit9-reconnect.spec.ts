// Crit 9 follow-up (F3): what the connection indicator does when B's socket is
// really lost, by two methods, five attempts each, every outcome kept.
//   A  "offline + client close": context.setOffline(true), then the page closes
//      its open WebSocket (the original M08 method).
//   B  "server terminate": the server drops B's TCP connection without a close
//      frame (test hook /api/test/drop-sockets; needs ENABLE_TEST_HOOKS=1).
//   M  as A, while the server streams world frames (a stick dropped from height).
//   S  as M, but the page closes first and goes offline afterwards (the
//      corrected M08 mechanism: the close handshake completes while online).
// Times are page-monotonic (performance.now) from an init script that records
// socket events, readyState changes and indicator text changes; no product code
// is involved in the measurement.
// Methods A and M assume the page gets no `offline` event from setOffline(true),
// which holds inside a loopback-only network namespace (`unshare --net`, as in
// scripts/crit9/run.sh). On a host with a real network interface Chromium fires
// `offline`, the client drops its own socket first (as it should), and "an open
// socket existed" fails (docs/evidence/crit-10-verification.md, D-2).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWork, register } from "./helpers.ts";

const OUT = process.env.CRIT9_EVIDENCE_DIR ?? "test-results/crit9";
const base = new URL(process.env.APP_URL ?? "http://localhost:8099");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error(`refusing a non-local APP_URL: ${base.origin}`);
const ATTEMPTS = 5;
const OBSERVE_MS = 8000;

function instrument(): void {
  const ev: { t: number; kind: string; detail?: unknown }[] = [];
  (window as any).__rc = { ev, sockets: [] as WebSocket[] };
  const t = (): number => performance.now();
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      const id = (window as any).__rc.sockets.push(this) - 1;
      ev.push({ t: t(), kind: "ws-construct", detail: id });
      this.addEventListener("open", () => ev.push({ t: t(), kind: "ws-open", detail: id }));
      this.addEventListener("close", (e) => ev.push({ t: t(), kind: "ws-close", detail: { id, code: e.code, clean: e.wasClean } }));
      this.addEventListener("error", () => ev.push({ t: t(), kind: "ws-error", detail: id }));
    }
  } as typeof WebSocket;
  const states = new Map<number, number>();
  setInterval(() => {
    (window as any).__rc.sockets.forEach((s: WebSocket, i: number) => {
      if (states.get(i) !== s.readyState) {
        states.set(i, s.readyState);
        ev.push({ t: t(), kind: "ready-state", detail: { id: i, state: s.readyState } });
      }
    });
  }, 25);
  let last = "";
  new MutationObserver(() => {
    const text = document.querySelector(".ws-status .conn")?.textContent ?? "";
    if (text === last) return;
    last = text;
    const at = t();
    ev.push({ t: at, kind: "indicator", detail: text });
    requestAnimationFrame(() => ev.push({ t: t(), kind: "indicator-frame", detail: text }));
  }).observe(document, { subtree: true, childList: true, characterData: true }); // <html> may not exist yet here
  window.addEventListener("offline", () => ev.push({ t: t(), kind: "window-offline" }));
  window.addEventListener("online", () => ev.push({ t: t(), kind: "window-online" }));
}

interface Attempt {
  method: string;
  n: number;
  closedBeforeTrigger: number;
  firstCloseMs: number | null;
  closeCode: number | null;
  closeClean: boolean | null;
  reconnectingShownMs: number | null;
  reconnectingFrameMs: number | null;
  closeToIndicatorMs: number | null;
  readyStateAt: Record<string, number[]>;
  reconnectAttemptsInWindow: number;
  connectedAgainMs: number | null;
  timeline: { t: number; kind: string; detail?: unknown }[];
}

const events = (p: Page) => p.evaluate(() => (window as any).__rc.ev as { t: number; kind: string; detail?: any }[]);

function summarise(method: string, n: number, trigger: number, all: { t: number; kind: string; detail?: any }[], openBefore: number, states: Record<string, number[]>): Attempt {
  const after = all.filter((e) => e.t >= trigger - 1).map((e) => ({ ...e, t: Math.round((e.t - trigger) * 10) / 10 }));
  const close = after.find((e) => e.kind === "ws-close");
  const shown = after.find((e) => e.kind === "indicator" && e.detail === "Reconnecting…");
  const frame = after.find((e) => e.kind === "indicator-frame" && e.detail === "Reconnecting…");
  const again = after.find((e) => e.kind === "indicator" && e.detail === "Connected" && (!shown || e.t > shown.t));
  return {
    method,
    n,
    closedBeforeTrigger: openBefore,
    firstCloseMs: close?.t ?? null,
    closeCode: close?.detail.code ?? null,
    closeClean: close?.detail.clean ?? null,
    reconnectingShownMs: shown?.t ?? null,
    reconnectingFrameMs: frame?.t ?? null,
    closeToIndicatorMs: close && shown ? Math.round((shown.t - close.t) * 10) / 10 : null,
    readyStateAt: states,
    reconnectAttemptsInWindow: after.filter((e) => e.kind === "ws-construct" && e.t <= OBSERVE_MS).length,
    connectedAgainMs: again?.t ?? null,
    timeline: after.filter((e) => e.t <= OBSERVE_MS + 20_000).slice(0, 60),
  };
}

test("F3: the indicator follows a lost socket (methods via CRIT9_RECONNECT_METHODS, default A,B; 5 attempts each)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await ctxB.addInitScript(instrument);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await register(a, "Reconnect owner");
  const workId = await createWork(a, `Reconnect ${Date.now()}`);
  await a.getByRole("button", { name: "Skip" }).click();
  await a.getByRole("button", { name: "People" }).click();
  await a.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await a.getByLabel("Send this link to a friend (shown once):").inputValue();
  await a.getByRole("button", { name: "Close panel" }).click();
  await register(b, "Reconnect editor");
  await b.goto(link);
  await b.getByRole("button", { name: "Join as Reconnect editor" }).click();
  await b.waitForURL(new RegExp(`/works/${workId}/`));
  await expect(b.locator(".conn-open")).toBeVisible();
  const skip = b.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const bUser = await b.evaluate(async () => (await (await fetch("/api/session")).json()).user.id);

  const attempts: Attempt[] = [];
  const sample = async (trigger: number): Promise<Record<string, number[]>> => {
    const out: Record<string, number[]> = {};
    for (const at of [100, 1000, 5000]) {
      await b.waitForTimeout(Math.max(0, at - (await b.evaluate(() => performance.now())) + trigger));
      out[`${at}ms`] = await b.evaluate(() => (window as any).__rc.sockets.map((s: WebSocket) => s.readyState));
    }
    return out;
  };

  const methods = (process.env.CRIT9_RECONNECT_METHODS ?? "A,B").split(",");
  const all = { A: "A offline + client close", B: "B server terminate", M: "A offline + client close while frames stream", S: "S client close, then offline, while frames stream" } as const;
  // A drops sticks from a raw socket in its own page (it leaves the workshop, so this socket holds its lease)
  if (methods.includes("M") || methods.includes("S")) {
    await a.goto("/works/");
    await a.evaluate(async (workId) => {
      const s = await (await fetch("/api/session")).json();
      const ws = new WebSocket(`ws://${location.host}/ws`);
      const w = window as any;
      w.__drop = { ws, snap: null as any, lease: null as any, tick: 0, hello: false, results: {} as Record<string, any> };
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === "hello.ok") w.__drop.hello = true;
        if (m.type !== "world.frame") (w.__drop.log ??= []).push(m.type + (m.code ? `:${m.code}` : "") + (m.message ? `:${String(m.message).slice(0, 60)}` : ""));
        if (m.type === "command.result") w.__drop.results[m.commandId] = m;
        if (m.type === "room.snapshot") w.__drop.snap = m;
        if (m.type === "lease.changed" && m.lease) w.__drop.lease = m.lease;
        if (m.type === "world.frame") w.__drop.tick = Math.max(w.__drop.tick, m.tick);
      });
      await new Promise((r) => ws.addEventListener("open", r));
      ws.send(JSON.stringify({ type: "hello", csrf: s.csrf }));
      for (let i = 0; i < 50 && !w.__drop.hello; i++) await new Promise((r) => setTimeout(r, 50));
      setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "heartbeat" })), 5000); // or the server drops it after 15 s
      ws.send(JSON.stringify({ type: "room.join", workId }));
      for (let i = 0; i < 50 && !w.__drop.snap; i++) await new Promise((r) => setTimeout(r, 50));
    }, workId);
  }
  for (const method of methods.map((m) => all[m as keyof typeof all])) {
    for (let n = 1; n <= ATTEMPTS; n++) {
      await expect(b.locator(".conn-open")).toBeVisible({ timeout: 20_000 });
      if (!(await b.locator(".draft-state").isVisible())) await b.getByRole("button", { name: "Add a stick" }).click(); // as in M08: B holds a stick
      await b.waitForTimeout(300);
      let trigger: number;
      let openBefore = 0;
      if (method === all.M || method === all.S) {
        const dropped = await a.evaluate(async (n) => {
          const d = (window as any).__drop;
          const lease = d.snap.lease?.leaseId ?? d.lease?.leaseId ?? "";
          const commandId = crypto.randomUUID();
          d.ws.send(JSON.stringify({ v: 1, type: "command", commandId, workId: d.snap.workId, worldEpoch: d.snap.epoch, streamId: d.snap.streamId, lastSeenTick: Math.max(d.tick, d.snap.tick), leaseId: lease, kind: "place", payload: { pose: { p: [-8 + 4 * n, 12, -9], q: [0, 0, 0, 1] } } }));
          for (let i = 0; i < 60 && !d.results[commandId]; i++) await new Promise((r) => setTimeout(r, 50));
          return d.results[commandId] ?? { outcome: "no result", lease, readyState: d.ws.readyState, log: (d.log ?? []).slice(-12) };
        }, n);
        expect(dropped.outcome, JSON.stringify(dropped)).toBe("accepted");
        await b.waitForFunction(() => document.querySelector(".ws-status .save")?.textContent?.includes("moving"), undefined, { timeout: 5000 });
        await b.waitForTimeout(150);
      }
      if (method.startsWith("A")) {
        await ctxB.setOffline(true);
        ({ trigger, openBefore } = await b.evaluate(() => {
          const open = (window as any).__rc.sockets.filter((s: WebSocket) => s.readyState === 1);
          const trigger = performance.now();
          open.forEach((s: WebSocket) => s.close());
          return { trigger, openBefore: open.length };
        }));
      } else if (method.startsWith("S")) {
        // close while online (the handshake completes), then offline before the client's first retry (≥ 375 ms)
        ({ trigger, openBefore } = await b.evaluate(() => {
          const open = (window as any).__rc.sockets.filter((s: WebSocket) => s.readyState === 1);
          const trigger = performance.now();
          open.forEach((s: WebSocket) => s.close());
          return { trigger, openBefore: open.length };
        }));
        await ctxB.setOffline(true);
      } else {
        ({ trigger, openBefore } = await b.evaluate(async (userId) => {
          const s = await (await fetch("/api/session")).json();
          const openBefore = (window as any).__rc.sockets.filter((x: WebSocket) => x.readyState === 1).length;
          const trigger = performance.now();
          await fetch("/api/test/drop-sockets", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": s.csrf }, body: JSON.stringify({ how: "terminate" }) });
          return { trigger, openBefore };
        }, bUser));
      }
      const states = await sample(trigger);
      await b.waitForTimeout(Math.max(0, OBSERVE_MS - ((await b.evaluate(() => performance.now())) - trigger)));
      if (method.startsWith("A") || method.startsWith("S")) await ctxB.setOffline(false);
      await expect(b.locator(".conn-open")).toBeVisible({ timeout: 20_000 });
      attempts.push(summarise(method, n, trigger, await events(b), openBefore, states));
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, process.env.CRIT9_RECONNECT_FILE ?? "reconnect-attempts.json"), JSON.stringify(attempts, null, 2));
  for (const x of attempts) {
    expect.soft(x.closedBeforeTrigger, `${x.method} #${x.n}: an open socket existed`).toBe(1);
    // The product's contract: the indicator follows the socket's actual close within one frame or so.
    if (x.closeToIndicatorMs != null) expect.soft(x.closeToIndicatorMs, `${x.method} #${x.n}: indicator after close`).toBeLessThan(250);
    // Offline-first ("A…") can leave a page-initiated close stalled in CLOSING until emulation is lifted
    // (a Playwright/Chromium property, observed 1 in 5 with frames streaming): recorded, not asserted.
    // Every other method must really close within the window.
    if (!x.method.startsWith("A")) expect.soft(x.firstCloseMs, `${x.method} #${x.n}: close event within ${OBSERVE_MS} ms`).not.toBeNull();
    expect.soft(x.connectedAgainMs, `${x.method} #${x.n}: reconnected`).not.toBeNull();
  }
  await ctxA.close();
  await ctxB.close();
});
