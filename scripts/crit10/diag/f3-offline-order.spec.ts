// Crit 10 diagnostic D-2: in F3 method A, is B's socket already closed before
// the test's page-initiated close, and by what? Records every socket event and
// window offline/online event from page load (not only after the trigger).
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createWork, register } from "../../../tests/e2e/helpers.ts";

test("offline event vs. page close ordering", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await ctxB.addInitScript(() => {
    const ev: [number, string][] = [];
    (window as any).__d = { ev, sockets: [] as WebSocket[] };
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(u: string | URL, p?: string | string[]) {
        super(u, p);
        const id = (window as any).__d.sockets.push(this) - 1;
        ev.push([performance.now(), `ws${id}-construct`]);
        this.addEventListener("open", () => ev.push([performance.now(), `ws${id}-open`]));
        this.addEventListener("close", (e) => ev.push([performance.now(), `ws${id}-close ${e.code}`]));
      }
      close(code?: number, reason?: string): void {
        ev.push([performance.now(), `close() called, readyState ${this.readyState}, stack ${new Error().stack?.split("\n")[2]?.trim().slice(0, 80)}`]);
        super.close(code, reason);
      }
    } as typeof WebSocket;
    window.addEventListener("offline", () => ev.push([performance.now(), "window-offline"]));
    window.addEventListener("online", () => ev.push([performance.now(), "window-online"]));
  });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await register(a, "Diag owner");
  const workId = await createWork(a, `Diag ${Date.now()}`);
  await a.getByRole("button", { name: "Skip" }).click();
  await a.getByRole("button", { name: "People" }).click();
  await a.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await a.getByLabel("Send this link to a friend (shown once):").inputValue();
  await register(b, "Diag editor");
  await b.goto(link);
  await b.getByRole("button", { name: "Join as Diag editor" }).click();
  await b.waitForURL(new RegExp(`/works/${workId}/`));
  await expect(b.locator(".conn-open")).toBeVisible();
  const results: unknown[] = [];
  for (let n = 1; n <= 3; n++) {
    await expect(b.locator(".conn-open")).toBeVisible({ timeout: 30_000 });
    const mark = await b.evaluate(() => performance.now());
    await ctxB.setOffline(true);
    const atTrigger = await b.evaluate(() => ({ t: performance.now(), states: (window as any).__d.sockets.map((s: WebSocket) => s.readyState) }));
    await b.waitForTimeout(1500);
    const ev = (await b.evaluate(() => (window as any).__d.ev)) as [number, string][];
    results.push({ n, triggerAfterSetOfflineMs: Math.round(atTrigger.t - mark), readyStatesAtTrigger: atTrigger.states, events: ev.filter(([t]) => t >= mark).map(([t, k]) => [Math.round(t - mark), k]) });
    await ctxB.setOffline(false);
  }
  writeFileSync(process.env.DIAG_OUT ?? "/tmp/f3-offline-order.json", JSON.stringify({ playwright: test.info().config.version, results }, null, 2));
});
