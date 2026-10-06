// LOOK-04, OPS-05 (AT-21, AT-22): graphics quality modes through the real
// control, state kept across tier switches, idle rendering that still wakes
// for partners, the hidden-tab lifecycle and resource bounds over remounts.
// Render counts come from the opt-in test probe; they show behaviour in
// headless SwiftShader, not player-device frame rates.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createWork, register } from "./helpers.ts";

const KEY = "stillwood.graphicsQuality.v1";
type Stats = { renders: number; mode: string; tier: string; pixelRatio: number; shadows: boolean; shadowMapSize: number; programs: number; textures: number; geometries: number; auto: { warmupLeft: number; consecutiveBad: number } };
const stats = (p: Page): Promise<Stats> => p.evaluate(() => (window as any).__stillwood.stats());
const framing = (p: Page) => p.evaluate(() => (window as any).__stillwood.framing());
const readout = (p: Page, label: string) => p.getByRole("group", { name: label }).locator("output").innerText();
const probe = async (c: Page | BrowserContext): Promise<void> => {
  await c.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
};

async function chooseQuality(p: Page, mode: "auto" | "high" | "medium" | "low"): Promise<void> {
  const panel = p.locator("#quality-panel");
  if (!(await panel.isVisible())) await p.getByRole("button", { name: "Graphics" }).click();
  await p.getByLabel("Graphics quality").selectOption(mode);
  await expect.poll(async () => (await stats(p)).mode).toBe(mode);
}

/** Wait until the scene stops rendering on its own, then return the settled count. */
async function settled(p: Page, quietMs = 1200): Promise<number> {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = (await stats(p)).renders;
    if (n === last) return n;
    last = n;
    await p.waitForTimeout(quietMs);
  }
  throw new Error("the scene never stopped rendering");
}

const antialiased = (p: Page) => p.locator("canvas.scene-canvas").evaluate((c: HTMLCanvasElement) => c.getContext("webgl2")!.getContextAttributes()!.antialias);
const bufferRatio = (p: Page) => p.locator("canvas.scene-canvas").evaluate((c: HTMLCanvasElement) => c.width / c.clientWidth);

/**
 * Two people in one work, joined through the real invitation flow. B's tab
 * can be "hidden" by the test: this runner can't hide a real tab
 * (bringToFront and minimising both leave visibilityState "visible"), so it
 * drives the same document.hidden + visibilitychange the app listens to.
 */
async function pair(browser: import("@playwright/test").Browser, title: string) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (const c of [ctxA, ctxB]) await probe(c);
  await ctxB.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    (window as any).__setHidden = (h: boolean) => {
      hidden = h;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await register(a, "Avery");
  const workId = await createWork(a, title);
  await a.getByRole("button", { name: "Skip" }).click();
  await a.getByRole("button", { name: "People" }).click();
  await a.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await a.getByLabel("Send this link to a friend (shown once):").inputValue();
  await a.getByRole("button", { name: "Close panel" }).click();
  await b.goto(link);
  await b.getByRole("link", { name: "Create an account" }).click();
  await register(b, "Blake", "/join/" + new URL(link).hash);
  await b.getByRole("button", { name: "Join as Blake" }).click();
  await b.waitForURL(new RegExp(`/works/${workId}/`));
  await expect(b.locator(".conn-open")).toBeVisible();
  return { ctxA, ctxB, a, b, workId };
}

/** Hold a stick at an exact pose and place it. */
async function placeExact(p: Page, x: number, y: number, z: number, yawDeg: number, tiltDeg: number, snap = false): Promise<void> {
  await p.getByRole("button", { name: "Add a stick" }).click();
  await p.getByRole("button", { name: "Exact values" }).click();
  await p.getByRole("textbox", { name: "X", exact: true }).fill(String(x));
  await p.getByRole("textbox", { name: "Height", exact: true }).fill(String(y));
  await p.getByRole("textbox", { name: "Z", exact: true }).fill(String(z));
  await p.getByLabel("Direction °").fill(String(yawDeg));
  await p.getByLabel("Tilt °").fill(String(tiltDeg));
  await p.getByLabel("Roll °").fill("0");
  await p.getByRole("button", { name: "Apply" }).click();
  if (snap) await p.getByRole("button", { name: "Snap to support" }).click();
  await p.getByRole("button", { name: "Place", exact: true }).click();
  await expect(p.locator(".toast-ok").filter({ hasText: "Placed and saved." }).last()).toBeVisible();
}

/** Every stick is drawn exactly where the latest authoritative frame put it. */
async function interpolationFinished(p: Page): Promise<void> {
  const drawn: number[][] = await p.evaluate(() => (window as any).__stillwood.rendered());
  const latest: { p: number[] }[] = await p.evaluate(() => (window as any).__stillwood.poses());
  expect(drawn.length).toBe(latest.length);
  drawn.forEach((d, i) => d.forEach((v, k) => expect(v).toBeCloseTo(latest[i]!.p[k]!, 4)));
}

test.describe("graphics modes (2× screen)", () => {
  test.use({ deviceScaleFactor: 2 });

  test("each mode applies its preset, High restores the original after Low, and the choice survives reload", async ({ page }) => {
    await probe(page);
    await register(page, "Quality");
    await createWork(page, "Quality work");
    await page.getByRole("button", { name: "Skip" }).click();
    // a fresh view in Auto starts at High: the original renderer
    await expect.poll(async () => (await stats(page)).tier).toBe("high");
    expect(await stats(page)).toMatchObject({ mode: "auto", tier: "high", pixelRatio: 2, shadows: true, shadowMapSize: 2048 });
    await page.getByRole("button", { name: "Graphics" }).click();
    await expect(page.getByLabel("Graphics quality")).toHaveValue("auto");
    await expect(page.getByText("Auto balances detail and smoothness. This setting only affects this device.")).toBeVisible();
    await expect(page.getByText("Currently: High")).toBeVisible();
    await page.screenshot({ path: "docs/evidence/p8-graphics-panel.png" });

    await chooseQuality(page, "low");
    expect(await stats(page)).toMatchObject({ tier: "low", pixelRatio: 1, shadows: false });
    expect(await bufferRatio(page)).toBeCloseTo(1, 2);
    await expect(page.getByText(/Currently:/)).toHaveCount(0); // only Auto shows its tier
    await chooseQuality(page, "medium");
    expect(await stats(page)).toMatchObject({ tier: "medium", pixelRatio: 1.5, shadows: true, shadowMapSize: 1024 });
    expect(await antialiased(page)).toBe(true); // same context in every tier
    await chooseQuality(page, "high");
    expect(await stats(page)).toMatchObject({ tier: "high", pixelRatio: 2, shadows: true, shadowMapSize: 2048 });
    expect(await bufferRatio(page)).toBeCloseTo(2, 2);
    expect(await antialiased(page)).toBe(true);

    await chooseQuality(page, "low");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("low");
    await page.reload();
    await expect.poll(async () => (await stats(page)).tier).toBe("low");
    await page.getByRole("button", { name: "Graphics" }).click();
    await expect(page.getByLabel("Graphics quality")).toHaveValue("low");

    // an invalid stored value is ignored
    await page.evaluate((k) => localStorage.setItem(k, "ultra"), KEY);
    await page.reload();
    await expect.poll(async () => (await stats(page)).tier).toBe("high");
    expect((await stats(page)).mode).toBe("auto");
  });

  test("blocked storage still renders, starts in Auto and applies a choice for the session", async ({ page }) => {
    await probe(page);
    await page.addInitScript((k) => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key: string) {
        if (key === k) throw new DOMException("blocked", "SecurityError");
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === k) throw new DOMException("blocked", "SecurityError");
        return set.call(this, key, value);
      };
    }, KEY);
    await register(page, "No storage");
    await createWork(page, "No storage work");
    await page.getByRole("button", { name: "Skip" }).click();
    await expect.poll(async () => (await stats(page)).tier).toBe("high");
    await expect(page.locator("canvas.scene-canvas")).toBeVisible();
    await chooseQuality(page, "low");
    expect((await stats(page)).tier).toBe("low");
    await page.reload();
    await expect.poll(async () => (await stats(page)).mode).toBe("auto");
  });
});

test("switching tiers keeps the camera, the held stick and the session; placing still works after resize and DPR changes", async ({ page, context }) => {
  await probe(page);
  const sent: string[] = [];
  page.on("websocket", (ws) => ws.on("framesent", (f) => sent.push(String(f.payload))));
  const contextTrouble: string[] = [];
  page.on("console", (m) => /Too many active WebGL contexts|Context Lost/.test(m.text()) && contextTrouble.push(m.text()));
  await register(page, "Switcher");
  await createWork(page, "Switching work");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Top" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Add a stick" }).click();
  await page.getByRole("button", { name: "Height increase" }).click();
  // many re-renders of the workshop must not churn WebGL contexts and evict the scene's
  for (let i = 0; i < 36; i++) await page.getByRole("button", { name: `Direction ${i % 2 ? "decrease" : "increase"}` }).click();
  await page.getByRole("button", { name: "Direction increase" }).click();
  const url = page.url();
  const pose0 = { x: await readout(page, "Left / right (X)"), h: await readout(page, "Height"), yaw: await readout(page, "Direction") };
  const cam0 = await framing(page);
  const before = sent.length;
  for (let round = 0; round < 3; round++) {
    for (const m of ["low", "medium", "high", "auto"] as const) await chooseQuality(page, m);
  }
  const cam1 = await framing(page);
  for (const k of ["yaw", "pitch", "distance", "targetY"]) expect(cam1[k]).toBeCloseTo(cam0[k], 6);
  expect({ x: await readout(page, "Left / right (X)"), h: await readout(page, "Height"), yaw: await readout(page, "Direction") }).toEqual(pose0);
  await expect(page.locator(".draft-state")).toBeVisible();
  await expect(page.locator(".conn-open")).toBeVisible();
  expect(page.url()).toBe(url);
  // no rejoin, command or version was sent because of quality changes
  const during = sent.slice(before).map((s) => JSON.parse(s).type);
  expect(during.filter((t) => t !== "heartbeat" && t !== "telemetry")).toEqual([]);

  // resize and a device-pixel-ratio change keep the tier's cap
  await chooseQuality(page, "low");
  await page.setViewportSize({ width: 1100, height: 760 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 760, deviceScaleFactor: 1.25, mobile: false });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1.25);
  await page.waitForTimeout(300);
  expect((await stats(page)).pixelRatio).toBe(1); // a resize didn't bring back a higher cap
  expect(await bufferRatio(page)).toBeCloseTo(1, 1);
  await chooseQuality(page, "high");
  await expect.poll(async () => (await stats(page)).pixelRatio).toBe(1.25); // a cap, not supersampling
  expect(await bufferRatio(page)).toBeCloseTo(1.25, 1);
  await page.getByLabel("Graphics quality").focus();
  await page.keyboard.press("Escape"); // closes the panel, not the held stick
  await expect(page.locator("#quality-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Graphics" })).toBeFocused();
  await expect(page.locator(".draft-state")).toBeVisible();

  // in Low (no real-time shadows), pointer-to-world still lines up: drag the ghost
  // (top view, table centre), rest it on the table with the cues and place it
  await chooseQuality(page, "low");
  await page.getByRole("button", { name: "Graphics" }).click();
  expect((await stats(page)).shadows).toBe(false);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Add a stick" }).click();
  await page.waitForTimeout(300);
  const box = (await page.locator(".scene-host").boundingBox())!;
  const x0 = await readout(page, "Left / right (X)");
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 8 });
  await page.mouse.up();
  expect(await readout(page, "Left / right (X)")).not.toBe(x0);
  await page.getByRole("button", { name: "Snap to support" }).click();
  const target = { x: parseFloat(await readout(page, "Left / right (X)")), z: parseFloat(await readout(page, "Back / front (Z)")) };
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(page.locator(".toast-ok").last()).toContainText("Placed and saved.");
  await expect(page.locator(".save-saved")).toBeVisible({ timeout: 20_000 });
  const placed = (await page.evaluate(() => (window as any).__stillwood.poses()))[0];
  expect(placed.p[0]).toBeCloseTo(target.x, 1);
  expect(placed.p[2]).toBeCloseTo(target.z, 1);
  expect(await page.locator("canvas.scene-canvas").evaluate((c: HTMLCanvasElement) => c.getContext("webgl2")!.isContextLost())).toBe(false);
  expect(contextTrouble).toEqual([]);
});

test("an idle viewer still sees a partner's ghost, placement and motion; renders stop when still and while hidden", async ({ browser }) => {
  const { ctxA, ctxB, a, b } = await pair(browser, "Watched work");

  // B never touches its camera from here on
  const camB = await framing(b);
  let idle = await settled(b);
  await b.waitForTimeout(1500);
  expect((await stats(b)).renders).toBe(idle); // a still scene isn't redrawn

  // A's held ghost wakes B with no input from B, and B stops again once it's still
  await a.getByRole("button", { name: "Add a stick" }).click();
  await expect(b.locator(".ghost-label")).toContainText("Avery");
  for (let i = 0; i < 30; i++) await a.getByRole("button", { name: "Height increase" }).click();
  await expect.poll(async () => (await stats(b)).renders).toBeGreaterThan(idle);
  idle = await settled(b);

  // the placed stick falls: B shows the ghost going, the new stick and its motion to the end
  await a.getByRole("button", { name: "Place", exact: true }).click();
  await expect(a.locator(".toast-ok").last()).toContainText("Placed and saved.");
  await expect(b.locator(".ghost-label")).toHaveCount(0);
  await expect.poll(() => b.evaluate(() => (window as any).__stillwood.sticks())).toBe(1);
  await expect(b.locator(".save-saved")).toBeVisible({ timeout: 20_000 });
  idle = await settled(b);
  await interpolationFinished(b);
  const latest = await b.evaluate(() => (window as any).__stillwood.poses());
  expect(latest[0].p[1]).toBeLessThan(1); // it came down to the table
  const camB2 = await framing(b);
  for (const k of ["yaw", "pitch", "distance", "targetY"]) expect(camB2[k]).toBeCloseTo(camB[k], 6);

  // spend B's warm-up with a real camera gesture, so the hidden gap can be told apart
  const box = (await b.locator(".scene-host").boundingBox())!;
  await b.mouse.move(box.x + 60, box.y + box.height - 140);
  await b.mouse.down();
  for (let i = 0; i < 40; i++) {
    await b.mouse.move(box.x + 60 + i * 4, box.y + box.height - 140 + (i % 2), { steps: 1 });
    await b.waitForTimeout(70);
  }
  await b.mouse.up();
  await expect.poll(async () => (await stats(b)).auto.warmupLeft).toBe(0);
  idle = await settled(b);

  // hidden: nothing is drawn, even while A moves a new ghost
  await b.evaluate(() => (window as any).__setHidden(true));
  await a.getByRole("button", { name: "Add a stick" }).click();
  for (let i = 0; i < 20; i++) await a.getByRole("button", { name: "Left / right (X) increase" }).click();
  await a.waitForTimeout(5500); // longer than a heartbeat, so B resyncs on return
  expect((await stats(b)).renders).toBe(idle);
  // back: the existing resync runs, B redraws the current state, and the gap wasn't a sample
  await b.evaluate(() => (window as any).__setHidden(false));
  await expect(b.getByText("Refreshing after the tab was in the background…")).toBeVisible();
  const back = await stats(b);
  expect(back.auto.warmupLeft).toBeGreaterThan(0);
  expect(back.auto.consecutiveBad).toBe(0);
  expect(back.tier).toBe("high");
  await expect.poll(async () => (await stats(b)).renders).toBeGreaterThan(idle);
  await expect(b.locator(".ghost-label")).toContainText("Avery");
  await expect(b.locator(".conn-open")).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test("after going idle, a viewer follows a partner's release, a collapse, an expired ghost and its own reconnect", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctxA, ctxB, a, b } = await pair(browser, "Collapse work");
  const camB = await framing(b);
  const renders = async () => (await stats(b)).renders;
  let idle = await settled(b);

  // A moves a held stick, then releases it without placing
  await a.getByRole("button", { name: "Add a stick" }).click();
  await expect(b.locator(".ghost-label")).toContainText("Avery");
  idle = await settled(b);
  for (let i = 0; i < 10; i++) await a.getByRole("button", { name: "Left / right (X) increase" }).click();
  await expect.poll(renders).toBeGreaterThan(idle);
  await a.getByRole("button", { name: "Cancel" }).click();
  await expect(b.locator(".ghost-label")).toHaveCount(0);
  idle = await settled(b);

  // a collapse: a standing pillar, then a leaning stick that topples into it
  await placeExact(a, 3, 4.01, 0, 0, 90);
  await expect(a.locator(".save-saved")).toBeVisible({ timeout: 30_000 });
  idle = await settled(b);
  await placeExact(a, -3, 4.3, 0, 0, 70, true);
  await expect.poll(renders).toBeGreaterThan(idle);
  await expect(b.locator(".save-saved")).toBeVisible({ timeout: 30_000 });
  idle = await settled(b);
  await interpolationFinished(b);
  const poses: { p: number[]; q: number[] }[] = await b.evaluate(() => (window as any).__stillwood.poses());
  // the pillar's long axis (local X) is no longer vertical: it was knocked over
  const upright = (q: number[]) => Math.abs(2 * (q[0]! * q[1]! + q[3]! * q[2]!));
  expect(upright(poses[0]!.q)).toBeLessThan(0.9);
  const camB2 = await framing(b);
  for (const k of ["yaw", "pitch", "distance", "targetY"]) expect(camB2[k]).toBeCloseTo(camB[k], 6);

  // A's connection drops while holding a stick: the server removes the ghost, and idle B shows it
  await a.getByRole("button", { name: "Add a stick" }).click();
  await expect(b.locator(".ghost-label")).toContainText("Avery");
  idle = await settled(b);
  await ctxA.setOffline(true);
  await expect(b.locator(".ghost-label")).toHaveCount(0, { timeout: 30_000 });
  expect(await renders()).toBeGreaterThan(idle);

  // B drops off; A comes back and places its held stick; B reconnects and shows it
  await ctxB.setOffline(true);
  await expect(b.locator(".conn-reconnecting")).toBeVisible({ timeout: 20_000 });
  await ctxA.setOffline(false);
  await expect(a.locator(".conn-open")).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: "Place", exact: true }).click();
  await expect(a.locator(".toast-ok").last()).toContainText("Placed and saved.");
  await ctxB.setOffline(false);
  await expect(b.locator(".conn-open")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => b.evaluate(() => (window as any).__stillwood.sticks())).toBe(3);
  await expect(b.locator(".save-saved")).toBeVisible({ timeout: 30_000 });
  await settled(b);
  await interpolationFinished(b);
  await ctxA.close();
  await ctxB.close();
});

test("switching tiers while holding a stick and while a partner moves theirs leaves no stale shadows or lost state", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctxA, ctxB, a, b } = await pair(browser, "Switching together");
  const problems: string[] = [];
  b.on("pageerror", (e) => problems.push(e.message));
  b.on("console", (m) => (m.type() === "error" || /WebGL|Context Lost/.test(m.text())) && problems.push(m.text()));
  await placeExact(a, 2, 4.01, 2, 0, 90); // something that casts a shadow
  await expect(b.locator(".save-saved")).toBeVisible({ timeout: 30_000 });
  await b.getByRole("button", { name: "Top" }).click();
  await b.getByRole("button", { name: "Add a stick" }).click();
  await b.getByRole("button", { name: "Height increase" }).click();
  await settled(b);
  const canvas = (await b.locator("canvas.scene-canvas").boundingBox())!;
  const clip = { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height - 70 }; // above the toolbar
  const ref = await b.screenshot({ clip });
  const pose = async () => [await readout(b, "Left / right (X)"), await readout(b, "Height"), await readout(b, "Direction")];
  const pose0 = await pose();
  const cam0 = await framing(b);

  await a.getByRole("button", { name: "Add a stick" }).click();
  await expect(b.locator(".ghost-label")).toContainText("Avery");
  for (let round = 0; round < 3; round++) {
    for (const m of ["low", "medium", "high", "auto"] as const) {
      await chooseQuality(b, m);
      for (let i = 0; i < 3; i++) await a.getByRole("button", { name: "Back / front (Z) increase" }).click();
    }
    if (round === 1) {
      await b.setViewportSize({ width: 1100, height: 760 });
      await b.waitForTimeout(300);
      await b.setViewportSize({ width: 1280, height: 800 });
      await b.waitForTimeout(300);
    }
  }
  expect(await pose()).toEqual(pose0);
  await expect(b.locator(".draft-state")).toBeVisible();
  await expect(b.locator(".ghost-label")).toContainText("Avery");
  await expect(b.locator(".conn-open")).toBeVisible();

  // a switch made while hidden is drawn on return, not before
  await b.evaluate(() => (window as any).__setHidden(true));
  const hiddenAt = (await stats(b)).renders;
  await chooseQuality(b, "low");
  for (let i = 0; i < 3; i++) await a.getByRole("button", { name: "Back / front (Z) increase" }).click();
  await b.waitForTimeout(500);
  expect((await stats(b)).renders).toBe(hiddenAt);
  await b.evaluate(() => (window as any).__setHidden(false));
  await expect.poll(async () => (await stats(b)).renders).toBeGreaterThan(hiddenAt);
  expect(await stats(b)).toMatchObject({ tier: "low", shadows: false });

  // back to High with the partner's ghost gone: the frame matches the first one exactly
  await a.getByRole("button", { name: "Cancel" }).click();
  await expect(b.locator(".ghost-label")).toHaveCount(0);
  await settled(b);
  const low = await b.screenshot({ clip });
  expect(low.equals(ref)).toBe(false); // Low really drops the shadows
  await chooseQuality(b, "high");
  await b.getByRole("button", { name: "Graphics" }).click(); // close the panel
  await b.mouse.move(0, 0);
  await settled(b);
  const back = await b.screenshot({ clip });
  expect(back.equals(ref)).toBe(true);
  const cam1 = await framing(b);
  for (const k of ["yaw", "pitch", "distance", "targetY"]) expect(cam1[k]).toBeCloseTo(cam0[k], 6);

  // away and back: the choice holds and only one view is left running
  await chooseQuality(b, "medium");
  await b.getByRole("link", { name: "My works" }).click();
  await b.getByRole("link", { name: "Switching together" }).click();
  await expect(b.locator(".conn-open")).toBeVisible();
  await expect.poll(async () => (await stats(b)).tier).toBe("medium");
  await expect(b.locator("canvas.scene-canvas")).toHaveCount(1);
  const n = await settled(b);
  await b.waitForTimeout(1500);
  expect((await stats(b)).renders).toBe(n);
  expect(problems).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test("repeated mode changes and remounts don't add loops, errors or unbounded GPU resources", async ({ page }) => {
  await probe(page);
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || /WebGL|THREE\./.test(m.text())) problems.push(m.text());
  });
  await page.addInitScript(() => {
    const w = window as any;
    w.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => (w.__raf++, cb(t)));
  });
  const rafs = (): Promise<number> => page.evaluate(() => (window as any).__raf);
  await register(page, "Cycler");
  const workId = await createWork(page, "Cycling work");
  await page.getByRole("button", { name: "Skip" }).click();
  await settled(page);

  const cycle = async () => {
    for (const m of ["low", "high", "medium", "auto"] as const) await chooseQuality(page, m);
    await settled(page);
    return stats(page);
  };
  const first = await cycle();
  let last = first;
  for (let i = 0; i < 4; i++) last = await cycle();
  expect(last.programs).toBe(first.programs);
  expect(last.textures).toBe(first.textures);
  expect(last.geometries).toBe(first.geometries);
  const r0 = await rafs();
  await page.waitForTimeout(1500);
  expect(await rafs()).toBe(r0); // idle: no animation frame callbacks at all


  // leave and come back through the app's own links, several times
  for (let i = 0; i < 5; i++) {
    await page.getByRole("link", { name: "My works" }).click();
    await page.getByRole("link", { name: "Cycling work" }).click();
    await page.waitForURL(new RegExp(`/works/${workId}/`));
    await expect(page.locator(".conn-open")).toBeVisible();
    await chooseQuality(page, i % 2 ? "low" : "high");
  }
  await expect(page.locator("canvas.scene-canvas")).toHaveCount(1);
  await settled(page);
  const r1 = await rafs();
  await page.waitForTimeout(1500);
  expect(await rafs()).toBe(r1); // no loop left behind by an unmounted view
  expect(problems).toEqual([]);

  // last, since three warns when it later disposes objects from before a restore:
  // a lost and restored context wakes an idle scene to redraw
  const beforeLoss = await settled(page);
  await page.locator("canvas.scene-canvas").evaluate((c: HTMLCanvasElement) => {
    const ext = c.getContext("webgl2")!.getExtension("WEBGL_lose_context")!;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 300);
  });
  await expect.poll(() => page.locator("canvas.scene-canvas").evaluate((c: HTMLCanvasElement) => c.getContext("webgl2")!.isContextLost())).toBe(false);
  await expect.poll(async () => (await stats(page)).renders).toBeGreaterThan(beforeLoss);
});

test("the public exhibit viewer uses the same setting and idles too", async ({ page, browser }) => {
  await register(page, "Exhibitor");
  await createWork(page, "Shown work");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Add a stick" }).click();
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(page.locator(".save-saved")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Versions" }).click();
  await page.getByLabel("Save the current structure as a version").fill("One");
  await page.getByRole("button", { name: "Save version" }).click();
  await page.getByRole("button", { name: "Exhibit…" }).click();
  const title = `Shown ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".toast-ok").last()).toContainText("Published");

  const visitor = await browser.newPage();
  await probe(visitor);
  await visitor.addInitScript((k) => localStorage.setItem(k, "medium"), KEY);
  await visitor.goto("/");
  await visitor.getByRole("link", { name: title }).click();
  await expect(visitor.locator("canvas.scene-canvas")).toBeVisible();
  await expect.poll(async () => (await stats(visitor)).tier).toBe("medium");
  await settled(visitor);
  await chooseQuality(visitor, "high");
  expect(await stats(visitor)).toMatchObject({ tier: "high", shadows: true, shadowMapSize: 2048 });
  const n = await settled(visitor);
  await visitor.waitForTimeout(1500);
  expect((await stats(visitor)).renders).toBe(n);
  await visitor.close();
});

test.describe("phone (390×844 marking viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  test("the graphics control fits the phone layout and the coarse-pointer cap stays 1.5 in High", async ({ page }) => {
    await probe(page);
    await register(page, "Phone quality");
    await createWork(page, "Phone quality work");
    await page.getByRole("button", { name: "Skip" }).tap();
    await expect.poll(async () => (await stats(page)).tier).toBe("high");
    expect((await stats(page)).pixelRatio).toBe(1.5); // not raised to 2 on a 3× touch screen
    await page.getByRole("button", { name: "Graphics" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Graphics" }).tap();
    const panel = (await page.locator("#quality-panel").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(390);
    const select = (await page.getByLabel("Graphics quality").boundingBox())!;
    expect(select.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: "docs/evidence/p8-graphics-phone.png" });
    await page.getByLabel("Graphics quality").selectOption("low");
    await expect.poll(async () => (await stats(page)).pixelRatio).toBe(1);
    await page.getByLabel("Graphics quality").selectOption("high");
    await expect.poll(async () => (await stats(page)).pixelRatio).toBe(1.5); // back to the coarse-pointer cap, not 2
    expect((await stats(page)).shadows).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
