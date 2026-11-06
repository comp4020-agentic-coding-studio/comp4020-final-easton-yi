// The island's interaction model (interaction brief 2026-11-05, §9 journeys
// A–I) through real mouse, keyboard and wheel input in headless Chromium:
// a visible cursor that never turns the camera by itself, left-drag look with
// a click threshold, HUD controls that never move the camera, Walk/Run/Fly by
// button and key, Look lock and Esc, scrolling boundaries, fullscreen in and
// out, Return to world from a portal destination (with the editor's unsaved
// stick protection), and tab/blur recovery. Software-rendered (SwiftShader):
// behaviour, not frame rate. Physical touch devices are not covered here.
import { devices, expect, test, type Page } from "@playwright/test";
import { createWork, register } from "./helpers.ts";

type Stats = Record<string, unknown> & { feet: number[]; yaw: number; pitch: number; speed: string; lookLocked: boolean; control: string; vel: number[] };
const stats = (page: Page): Promise<Stats> => page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): Stats } }).__stillwoodWorld.stats());
const pose = async (page: Page): Promise<{ feet: number[]; yaw: number; pitch: number }> => {
  const s = await stats(page);
  return { feet: s.feet, yaw: s.yaw, pitch: s.pitch };
};
const sameView = (a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }): boolean => Math.abs(a.yaw - b.yaw) < 1e-9 && Math.abs(a.pitch - b.pitch) < 1e-9;
/** Position tolerance for "didn't move": settling on a slope after spawn moves at most a few mm; any real movement is metres. */
const STILL = 0.02;
const dist = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await page.locator(".world-stage canvas.world-canvas").boundingBox();
  if (!b) throw new Error("no canvas");
  return b;
}

async function startExploring(page: Page, path = "/world/"): Promise<void> {
  await page.goto(path);
  const start = page.getByRole("button", { name: "Start exploring" });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect.poll(async () => (await stats(page)).control).toBe("exploring");
}

/** Wait until the explorer has come to rest (velocity ~0). */
async function settle(page: Page): Promise<void> {
  await expect.poll(async () => Math.hypot(...((await stats(page)).vel ?? [0, 0, 0])), { timeout: 10_000 }).toBeLessThan(0.05);
}

test.describe("island interaction", () => {
  test.setTimeout(150_000);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
  });

  test("A: on the home page the cursor is free, mouse movement never turns the camera, page controls stay clickable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    const b = await canvasBox(page);
    // the cursor over the world is an ordinary arrow until exploring starts
    expect(await page.locator(".world-stage").evaluate((el) => getComputedStyle(el).cursor)).toBe("default");
    const p0 = await pose(page);
    for (let i = 0; i < 12; i++) await page.mouse.move(b.x + 40 + i * 60, b.y + 40 + (i % 3) * 80, { steps: 3 });
    expect(sameView(await pose(page), p0), "plain mouse movement doesn't turn the camera").toBe(true);
    // and after exploring has started too
    await page.getByRole("button", { name: "Start exploring" }).click();
    await expect.poll(async () => (await stats(page)).control).toBe("exploring");
    const p1 = await pose(page);
    for (let i = 0; i < 12; i++) await page.mouse.move(b.x + 60 + i * 50, b.y + 300 - i * 15, { steps: 3 });
    expect(sameView(await pose(page), p1), "no hidden cursor, no mouse look without a button").toBe(true);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    // Start building is a real, clickable link
    const start = page.getByRole("link", { name: "Start building" });
    await start.scrollIntoViewIfNeeded();
    await start.click();
    await expect(page).toHaveURL(/\/register\/\?next=/);
  });

  test("B: left-drag turns the camera only past the threshold; release or leaving the viewport stops it; a right press doesn't", async ({ page }) => {
    await startExploring(page);
    const b = await canvasBox(page);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // a short press (3 px) is a click, not a look
    const p0 = await pose(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 3, cy, { steps: 2 });
    await page.mouse.up();
    expect(sameView(await pose(page), p0), "a click doesn't look").toBe(true);
    // a drag turns it, by the distance beyond the threshold only
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 105, cy, { steps: 6 });
    await expect.poll(async () => (await pose(page)).yaw).not.toBe(p0.yaw);
    await page.mouse.up();
    const p1 = await pose(page);
    expect(p1.yaw - p0.yaw, "turned left-to-right by (105 − 5) px × 0.005 rad").toBeCloseTo(-(105 - 5) * 0.005, 3);
    // released: further movement does nothing
    await page.mouse.move(cx + 300, cy + 100, { steps: 5 });
    expect(sameView(await pose(page), p1), "released: no rotation").toBe(true);
    // leaving the viewport mid-drag ends the drag: coming back with the button still down doesn't turn
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy, { steps: 3 });
    await page.mouse.move(cx, b.y - 40, { steps: 6 }); // out over the header
    const p2 = await pose(page);
    await page.mouse.move(cx - 200, cy, { steps: 6 }); // back in, button still held
    await page.mouse.up();
    expect(sameView(await pose(page), p2), "after leaving the viewport the gesture is over").toBe(true);
    // the right button keeps the context menu and never looks
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(cx + 150, cy, { steps: 5 });
    await page.mouse.up({ button: "right" });
    expect(sameView(await pose(page), p2), "right-drag doesn't look").toBe(true);
    const ctx = await page.locator(".world-stage canvas.world-canvas").evaluate((el) => {
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(ctx, "the normal context menu isn't suppressed").toBe(false);
  });

  test("C, D: HUD controls never move the camera; Walk → Run → Fly by buttons and keys keeps position and heading", async ({ page }) => {
    await startExploring(page);
    await settle(page);
    const speed = page.getByRole("group", { name: "Speed" });
    // first entry defaults to Run
    await expect(speed.getByRole("button", { name: /Run/ })).toHaveAttribute("aria-pressed", "true");
    expect((await stats(page)).speed).toBe("run");
    const p0 = await pose(page);
    // every HUD control: no camera jump, no movement
    for (const name of [/Fly/, /Walk/, /Run/]) {
      await speed.getByRole("button", { name }).click();
      expect(sameView(await pose(page), p0)).toBe(true);
      expect(dist((await pose(page)).feet, p0.feet)).toBeLessThan(STILL);
    }
    await page.getByRole("button", { name: "Controls" }).click();
    await expect(page.getByRole("group", { name: "Island controls" })).toBeVisible();
    await page.getByRole("button", { name: "Controls" }).click();
    expect(sameView(await pose(page), p0)).toBe(true);
    expect(dist((await pose(page)).feet, p0.feet)).toBeLessThan(STILL);
    // after clicking the HUD the island still has the keys: 1/2/3 switch speed without moving or turning
    await page.keyboard.press("Digit1");
    await expect(speed.getByRole("button", { name: /Walk/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Digit2");
    await expect(speed.getByRole("button", { name: /Run/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Digit3");
    await expect(speed.getByRole("button", { name: /Fly/ })).toHaveAttribute("aria-pressed", "true");
    expect((await stats(page)).speed).toBe("fly");
    expect(sameView(await pose(page), p0)).toBe(true);
    expect(dist((await pose(page)).feet, p0.feet), "selecting Fly doesn't ascend").toBeLessThan(STILL);
    // Fly is clearly faster than Walk: hold W for the same time in each
    const travel = async (key: "Digit1" | "Digit3"): Promise<number> => {
      await page.keyboard.press(key);
      const a = (await pose(page)).feet;
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(1500);
      await page.keyboard.up("KeyW");
      await settle(page);
      return Math.hypot((await pose(page)).feet[0]! - a[0]!, (await pose(page)).feet[2]! - a[2]!);
    };
    const walk = await travel("Digit1");
    const fly = await travel("Digit3");
    expect(walk).toBeGreaterThan(1);
    expect(fly, `walk ${walk.toFixed(1)} m vs fly ${fly.toFixed(1)} m`).toBeGreaterThan(walk * 2.5);
    // the choice is remembered across a reload
    await page.reload();
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    expect(await page.evaluate(() => localStorage.getItem("stillwood.worldSpeed.v1"))).toBe("fly");
  });

  test("E: Look lock engages only by a deliberate action; Esc gives the cursor back and leaves the HUD usable", async ({ page }) => {
    await startExploring(page);
    const lock = page.getByRole("button", { name: /Free cursor/ });
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await lock.click();
    await expect.poll(async () => (await stats(page)).lookLocked, { timeout: 5000 }).toBe(true);
    await expect(page.getByRole("button", { name: /Look locked · Esc to release cursor/ })).toBeVisible();
    // under Look lock, mouse movement looks (relative movement, no button), and speed keys work.
    // Headless Chromium turns each synthetic mouse move under pointer lock into a +N/−N pair (it re-centres the
    // cursor), so a real mouse's relative motion is reproduced by the event a locked pointer delivers.
    const p0 = await pose(page);
    await page.locator(".world-stage canvas.world-canvas").evaluate((el) => {
      for (let i = 0; i < 4; i++) el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", movementX: 30, movementY: 0 }));
    });
    await expect.poll(async () => (await pose(page)).yaw).toBeCloseTo(p0.yaw - 120 * 0.0022, 6);
    await page.keyboard.press("Digit1");
    await expect.poll(async () => (await stats(page)).speed).toBe("walk");
    // Esc releases the cursor (it doesn't pause, and doesn't re-lock)
    await page.keyboard.down("KeyW");
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await stats(page)).lookLocked).toBe(false);
    await page.keyboard.up("KeyW");
    expect((await stats(page)).control, "Esc under Look lock only releases the cursor").toBe("exploring");
    await expect(page.getByRole("group", { name: "Paused" })).toHaveCount(0);
    await page.waitForTimeout(600);
    expect((await stats(page)).lookLocked, "never re-locks by itself").toBe(false);
    // the HUD is immediately clickable with the visible cursor
    await page.getByRole("group", { name: "Speed" }).getByRole("button", { name: /Run/ }).click();
    await expect.poll(async () => (await stats(page)).speed).toBe("run");
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("group", { name: "Paused" })).toBeVisible();
  });

  test("F: with half the island scrolled away, the wheel scrolls the page, mouse movement and page interaction leave the world still", async ({ page }) => {
    await startExploring(page, "/");
    await settle(page);
    const b = await canvasBox(page);
    // the wheel over the canvas scrolls the page (it isn't swallowed)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, Math.round(b.height / 2));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y0 + 50);
    const p0 = await pose(page);
    // moving the mouse over the remaining half and pressing keys: nothing moves in the world
    const nb = await canvasBox(page);
    for (let i = 0; i < 8; i++) await page.mouse.move(nb.x + 50 + i * 70, Math.max(nb.y, 0) + 30 + (i % 2) * 40, { steps: 2 });
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(800);
    await page.keyboard.up("KeyW");
    expect(dist((await pose(page)).feet, p0.feet), "scrolling paused world movement input").toBeLessThan(1e-3);
    expect(sameView(await pose(page), p0)).toBe(true);
    // the homepage below works normally and the world stays put
    await page.getByLabel("Search exhibits by name").fill("wasd");
    await page.getByLabel("Search exhibits by name").press("KeyW");
    await page.getByRole("button", { name: "Search" }).click();
    expect(dist((await pose(page)).feet, p0.feet)).toBeLessThan(1e-3);
    expect(sameView(await pose(page), p0)).toBe(true);
    // hovering back over the world doesn't capture input; a deliberate click does
    await page.evaluate(() => window.scrollTo(0, 0));
    const cb = await canvasBox(page);
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.keyboard.press("KeyJ");
    expect(sameView(await pose(page), p0), "hover alone doesn't give the world the keys").toBe(true);
    await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.keyboard.press("KeyJ");
    await expect.poll(async () => (await pose(page)).yaw).not.toBe(p0.yaw);
  });

  test("G: fullscreen in and out keeps position, heading and speed; layout and a free cursor return", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Explore fullscreen" })).toBeEnabled({ timeout: 60_000 });
    const embedded = await page.locator(".world-stage").boundingBox();
    await page.getByRole("button", { name: "Explore fullscreen" }).click();
    await expect.poll(async () => (await stats(page)).control).toBe("exploring");
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("world-stage") ?? false)).toBe(true);
    expect((await stats(page)).lookLocked, "fullscreen doesn't force Look lock").toBe(false);
    // the HUD is inside: speed buttons and the exit control are visible and usable
    await page.getByRole("group", { name: "Speed" }).getByRole("button", { name: /Walk/ }).click();
    await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    const before = await pose(page);
    await page.getByRole("button", { name: "Exit fullscreen" }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    const after = await pose(page);
    expect(dist(after.feet, before.feet)).toBeLessThan(STILL);
    expect(sameView(after, before)).toBe(true);
    expect((await stats(page)).speed).toBe("walk");
    const restored = await page.locator(".world-stage").boundingBox();
    expect(Math.abs(restored!.height - embedded!.height), "embedded layout restored").toBeLessThan(2);
    // the page below is still there and scrollable
    await page.getByRole("heading", { name: "Exhibition" }).scrollIntoViewIfNeeded();
    await expect(page.getByLabel("Search exhibits by name")).toBeVisible();
    // the in-HUD Fullscreen toggle and a browser-driven exit (document.exitFullscreen, as Esc does)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    expect((await stats(page)).control, "a browser exit doesn't trap or pause input oddly").toBe("exploring");
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  });

  test("H: a portal destination offers Return to world, restoring route, pose and speed; an unplaced stick asks first", async ({ page }) => {
    await register(page, "Returner");
    const work = await createWork(page, "Return work");
    await startExploring(page, "/world/");
    await page.getByRole("group", { name: "Speed" }).getByRole("button", { name: /Walk/ }).click();
    // move somewhere and turn, then leave through the My Works portal link
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1200);
    await page.keyboard.up("KeyW");
    await page.keyboard.press("KeyJ");
    await settle(page);
    const left = await pose(page);
    await page.getByRole("navigation", { name: "Island portals" }).getByRole("link", { name: "My Works" }).click();
    await expect(page).toHaveURL(/\/works\/$/);
    const back = page.getByRole("link", { name: "Return to world" });
    await expect(back).toBeVisible();
    // keyboard-accessible
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/world\/$/);
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    const restored = await pose(page);
    expect(dist(restored.feet, left.feet), `restored ${restored.feet.map((v) => v.toFixed(1))} vs left ${left.feet.map((v) => v.toFixed(1))}`).toBeLessThan(0.6);
    expect(Math.abs(restored.yaw - left.yaw)).toBeLessThan(1e-6);
    const s = await stats(page);
    expect(s.speed).toBe("walk");
    expect(s.control, "restored in a paused state (Start exploring), nothing held").not.toBe("exploring");
    expect(s.lookLocked).toBe(false);
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();

    // the editor: an unplaced stick is protected; Stay keeps it, Leave goes back
    await page.goto(`/works/${work}/`);
    await expect(page.locator(".conn-open")).toBeVisible();
    // simulate arriving from the world in this tab (the portal path is covered above)
    await page.evaluate((p) => sessionStorage.setItem("stillwood.worldReturn.v1", JSON.stringify({ route: "/world/", pose: p, at: Date.now() })), left);
    await page.goto(`/works/${work}/`);
    await expect(page.locator(".conn-open")).toBeVisible();
    await page.getByRole("button", { name: "Add a stick" }).click();
    await expect(page.locator(".draft-state")).toBeVisible();
    await page.getByRole("link", { name: "Return to world" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("isn't placed yet");
    await page.getByRole("button", { name: "Stay here" }).click();
    await expect(page).toHaveURL(new RegExp(`/works/${work}/$`));
    await expect(page.locator(".draft-state")).toBeVisible();
    await page.getByRole("link", { name: "Return to world" }).click();
    await page.getByRole("button", { name: "Leave and return to world" }).click();
    await expect(page).toHaveURL(/\/world\/$/);
    // Back returns to the editor coherently
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/works/${work}/$`));
    await expect(page.locator(".conn-open")).toBeVisible();
  });

  test("I: blur and a hidden tab drop held keys; returning brings no stuck movement, capture or jump", async ({ page }) => {
    await page.addInitScript(() => {
      let hidden = false;
      Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      (window as unknown as { __setHidden(h: boolean): void }).__setHidden = (h: boolean) => {
        hidden = h;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await startExploring(page);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(400);
    // the window loses focus with W still held (its keyup goes elsewhere)
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect.poll(async () => (await stats(page)).control).toBe("paused");
    await settle(page);
    const p0 = await pose(page);
    await page.keyboard.up("KeyW");
    // hidden and shown again
    await page.evaluate(() => (window as unknown as { __setHidden(h: boolean): void }).__setHidden(true));
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as unknown as { __setHidden(h: boolean): void }).__setHidden(false));
    await page.waitForTimeout(600);
    expect(dist((await pose(page)).feet, p0.feet), "no movement while away or on return").toBeLessThan(STILL);
    expect((await stats(page)).lookLocked).toBe(false);
    // resuming is deliberate, and nothing is held afterwards
    await page.getByRole("button", { name: /^(Start|Resume) exploring$/ }).click();
    await expect.poll(async () => (await stats(page)).control).toBe("exploring");
    await page.waitForTimeout(600);
    expect(dist((await pose(page)).feet, p0.feet), "no stuck key after returning").toBeLessThan(1e-3);
  });
});

test.describe("island interaction on an emulated phone (390×844, touch; not a physical device)", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: devices["Pixel 7"].userAgent });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
  });

  test("J: speed buttons are tappable without steering; Up/Down still fly; the rail clears the touch controls", async ({ page }) => {
    await startExploring(page);
    await settle(page);
    const speed = page.getByRole("group", { name: "Speed" });
    const p0 = await pose(page);
    await speed.getByRole("button", { name: /Fly/ }).tap();
    await expect(speed.getByRole("button", { name: /Fly/ })).toHaveAttribute("aria-pressed", "true");
    expect(sameView(await pose(page), p0), "tapping a speed button doesn't turn the camera").toBe(true);
    expect(dist((await pose(page)).feet, p0.feet)).toBeLessThan(STILL);
    // the speed rail, the Up/Down/Boost column and the move stick don't overlap, and stay inside the viewport
    const rects = await page.evaluate(() => [".world-speed", ".world-fly", ".world-stick", ".world-controls"].map((s) => {
      const r = document.querySelector(s)!.getBoundingClientRect();
      return { s, l: r.left, r: r.right, t: r.top, b: r.bottom };
    }));
    const overlap = (a: (typeof rects)[number], b: (typeof rects)[number]): boolean => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    for (let i = 0; i < rects.length; i++) {
      expect(rects[i]!.l >= 0 && rects[i]!.r <= 390 && rects[i]!.b <= 844, `${rects[i]!.s} inside the viewport`).toBe(true);
      for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!), `${rects[i]!.s} vs ${rects[j]!.s}`).toBe(false);
    }
    // holding Up (a HUD control that is world input) climbs
    const up = page.getByRole("button", { name: "Up", exact: true });
    const b = (await up.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect.poll(async () => (await stats(page)).feet[1]!, { timeout: 10_000 }).toBeGreaterThan(p0.feet[1]! + 3);
    await page.mouse.up();
    expect((await stats(page)).flying).toBe(true);
  });
});
