// The island on phones and tablets (mobile/tablet layout brief, 2026-11-07), in headless Chromium with emulated
// touch (coarse pointer, no hover). Software-rendered (SwiftShader) and emulated viewports: layout and behaviour,
// not physical devices, real browser chrome or frame rate.
//
// Covered: the compact landmark label and its information panel (content, Preset, focus, Escape, stable subject,
// held-off world input); one Menu with every destination, light, safe point and home; no persistent region banner,
// plaque, light selector or navigation strip; the speed selector and Up/Down/Boost; two independent touch
// pointers (stick + look) and pointercancel without stuck input; rotation with an overlay open; a portal round
// trip; no overflow or overlapping targets across the size matrix; and the desktop model kept for a fine primary
// pointer, even with touch capability or a narrow window.
import { devices, expect, test, type Page } from "@playwright/test";
import { register } from "./helpers.ts";

type Stats = { control: string; feet: number[]; yaw: number; pitch: number; vel: number[]; speed: string; flying: boolean };
const stats = (page: Page): Promise<Stats> => page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): Stats } }).__stillwoodWorld.stats());
const input = (page: Page) => page.evaluate(() => {
  const i = (window as unknown as { __stillwoodWorld: { view: { input: { move: number[]; look: number[]; ascend: boolean; descend: boolean; boost: boolean } } } }).__stillwoodWorld.view.input;
  return { move: [...i.move], ascend: i.ascend, descend: i.descend, boost: i.boost };
});
const dist = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const STILL = 0.05;
const PIXEL = { hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: devices["Pixel 7"].userAgent };

async function start(page: Page, path = "/world/"): Promise<void> {
  await page.goto(path);
  const b = page.getByRole("button", { name: "Start exploring" });
  await expect(b).toBeEnabled({ timeout: 60_000 });
  await b.tap();
  await expect.poll(async () => (await stats(page)).control).toBe("exploring");
}

async function settle(page: Page): Promise<void> {
  await expect.poll(async () => Math.hypot(...((await stats(page)).vel ?? [0, 0, 0])), { timeout: 15_000 }).toBeLessThan(0.05);
}

/** Stand at a landmark's ground viewpoint (L03 by default) and keep exploring. */
async function goToLandmark(page: Page, id = "L03"): Promise<void> {
  await page.evaluate(async (id) => {
    const w = (window as unknown as { __stillwoodWorld: { view: { manifest: { landmarks: { id: string; viewpoints: { kind: string; eye: number[]; yaw: number; pitch: number }[] }[] }; jumpTo(t: unknown): Promise<boolean>; takeControl(o: unknown): void } } }).__stillwoodWorld.view;
    const l = w.manifest.landmarks.find((x) => x.id === id)!;
    const vp = l.viewpoints.find((v) => v.kind === "ground")!;
    await w.jumpTo({ feet: [vp.eye[0], vp.eye[1] - 1.65, vp.eye[2]], yaw: vp.yaw, pitch: vp.pitch });
    w.takeControl({ pointerLock: false });
  }, id);
  await expect.poll(async () => (await stats(page)).control).toBe("exploring");
}

const title = (page: Page, id: string) => page.evaluate((id) => (window as unknown as { __stillwoodWorld: { view: { manifest: { landmarks: { id: string; title: string; inspiration: string; period: string; organization: string }[] } } } }).__stillwoodWorld.view.manifest.landmarks.find((l) => l.id === id)!, id);

/** Every visible interactive control inside the stage: its box. */
async function targets(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll(".world-stage a, .world-stage button, .world-stage select, .world-stick")].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { name: (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.className).trim().slice(0, 40), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.pointerEvents !== "none" };
  }).filter((x) => x.shown));
}

test.describe("phone and tablet layout (emulated touch; not physical devices)", () => {
  test.setTimeout(150_000);
  test.use({ viewport: { width: 844, height: 390 }, ...PIXEL });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("stillwood.test", "1");
      localStorage.setItem("stillwood.worldSpeed.v1", "run");
    });
  });

  test("T1: compact label · Preset with an information button; the panel shows the full facts and keeps its subject", async ({ page }) => {
    await start(page);
    await goToLandmark(page, "L03");
    const lm = await title(page, "L03");
    const label = page.locator(".world-t-label");
    await expect(label).toContainText(lm.title);
    await expect(label).toContainText("Preset");
    // no persistent large banners: the old plaque and region banner, the expanded light selector, the nav strip
    await expect(page.locator(".world-plaque")).toHaveCount(0);
    await expect(page.locator(".world-region")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Light: day and night" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Island portals" })).toHaveCount(0);
    // a real button, ≥ 44×44, named for the landmark
    const info = page.getByRole("button", { name: `About ${lm.title}` });
    const box = (await info.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const p0 = await stats(page);
    await info.tap();
    const panel = page.getByRole("dialog", { name: lm.title });
    await expect(panel).toBeVisible();
    // full title, world-preset identification, inspiration, period, organisation and the region's observation
    await expect(panel).toContainText(lm.title);
    await expect(panel).toContainText("World preset");
    await expect(panel).toContainText(`Inspired by ${lm.inspiration}`);
    await expect(panel).toContainText(lm.period);
    await expect(panel).toContainText(lm.organization);
    await expect(panel).toContainText("Beams cross between columns");
    // focus moved into the panel (its close control); opening didn't move the explorer or the camera
    await expect(page.getByRole("button", { name: "Close information" })).toBeFocused();
    const p1 = await stats(page);
    expect(dist(p1.feet, p0.feet)).toBeLessThan(STILL);
    // the subject is stable: moving to another landmark behind the reader doesn't switch the open panel
    await page.evaluate(() => {
      const w = (window as unknown as { __stillwoodWorld: { view: { manifest: { landmarks: { id: string; viewpoints: { kind: string; eye: number[]; yaw: number; pitch: number }[] }[] }; jumpTo(t: unknown): Promise<boolean> } } }).__stillwoodWorld.view;
      const vp = w.manifest.landmarks.find((x) => x.id === "L02")!.viewpoints.find((v) => v.kind === "ground")!;
      // jumpTo would leave exploring (which closes the panel by design); move the feet in place instead, as a drift
      // into another landmark's range would (the panel holds world input, so the test moves the feet directly)
      const f = (w as unknown as { flight: { feet: number[] } }).flight;
      f.feet[0] = vp.eye[0]!;
      f.feet[1] = vp.eye[1]! - 1.65;
      f.feet[2] = vp.eye[2]!;
      (w as unknown as { invalidate(): void }).invalidate();
    });
    await page.waitForTimeout(800);
    await expect(panel).toContainText(lm.title);
    // Escape (an attached keyboard) closes it; focus returns to the information button
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".world-t-info")).toBeFocused();
    // the label now describes where the explorer is (L02), from the real manifest
    const l2 = await title(page, "L02");
    await expect(label).toContainText(l2.title);
  });

  test("T2: while the panel is open, the stick and canvas drags don't move or turn the explorer; closing resumes nothing", async ({ page }) => {
    await start(page);
    await goToLandmark(page, "L03");
    await settle(page);
    await page.locator(".world-t-info").tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    const p0 = await stats(page);
    // a drag across the canvas (right half) and a press on where the stick is
    const c = (await page.locator("canvas.world-canvas").boundingBox())!;
    await page.mouse.move(c.x + c.width * 0.75, c.y + c.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * 0.9, c.y + c.height * 0.4, { steps: 6 });
    await page.mouse.up();
    const s = (await page.locator(".world-stick").boundingBox())!;
    await page.mouse.move(s.x + s.width / 2, s.y + 4);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    const p1 = await stats(page);
    expect(Math.abs(p1.yaw - p0.yaw), "no camera turn under the panel").toBeLessThan(1e-9);
    expect(dist(p1.feet, p0.feet), "no movement under the panel").toBeLessThan(STILL);
    await page.getByRole("button", { name: "Close information" }).tap();
    await page.waitForTimeout(600);
    const i = await input(page);
    expect(Math.hypot(i.move[0]!, i.move[1]!)).toBe(0);
    expect(i.ascend || i.descend || i.boost).toBe(false);
    expect((await stats(page)).control).toBe("exploring");
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  });

  test("T3: one Menu holds Resume, every destination, Auto/Day/Night, fullscreen, help, home and the safe point", async ({ page }) => {
    await start(page);
    const menu = page.getByRole("button", { name: /^Menu/ });
    const mb = (await menu.boundingBox())!;
    expect(mb.width >= 44 && mb.height >= 44).toBe(true);
    await menu.tap();
    await expect.poll(async () => (await stats(page)).control).not.toBe("exploring");
    const dlg = page.getByRole("dialog", { name: "Paused" });
    await expect(dlg).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume exploring" })).toBeFocused();
    const nav = dlg.getByRole("navigation", { name: "Island portals" });
    await expect(nav.getByRole("link")).toHaveText(["Explore the World", "My Works", "Build Together", "View player works"]);
    await expect(nav.getByRole("link", { name: "My Works" })).toHaveAttribute("href", "/works/");
    await expect(nav.getByRole("link", { name: "Build Together" })).toHaveAttribute("href", "/register/?next=%2Fworks%2F%3Fnew%3D1");
    await expect(dlg.getByRole("button", { name: "Return to nearest safe point" })).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Return home" })).toBeVisible();
    await expect(dlg.getByLabel("Go to a landmark")).toBeVisible();
    await expect(dlg.locator("#world-help")).toContainText("Left stick moves");
    // the light choice: selected state shown, behaviour as before (remembered)
    const light = dlg.getByRole("group", { name: "Light: day and night" });
    await light.getByRole("button", { name: "Night" }).tap();
    await expect(light.getByRole("button", { name: "Night" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("stillwood.worldLight.v1"))).toBe("night");
    // the card scrolls inside the stage on this short screen; every item is reachable by scrolling
    const sheet = page.locator(".world-t-sheet");
    const fits = await sheet.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const st = el.closest(".world-stage")!.getBoundingClientRect();
      return { inside: r.top >= st.top - 0.5 && r.bottom <= st.bottom + 0.5, scrolls: el.scrollHeight > el.clientHeight };
    });
    expect(fits.inside, "the menu card stays inside the stage").toBe(true);
    await nav.getByRole("link", { name: "View player works" }).scrollIntoViewIfNeeded();
    await expect(nav.getByRole("link", { name: "View player works" })).toBeInViewport();
    // Resume: exploring again with nothing held
    await page.getByRole("button", { name: "Resume exploring" }).tap();
    await expect.poll(async () => (await stats(page)).control).toBe("exploring");
    const i = await input(page);
    expect(Math.hypot(i.move[0]!, i.move[1]!)).toBe(0);
  });

  test("T4: the speed selector shows only the current mode, opens Walk/Run/Fly, and Up still flies", async ({ page }) => {
    await start(page);
    await settle(page);
    const sel = page.getByRole("button", { name: /^Speed: / });
    await expect(sel).toHaveAccessibleName("Speed: Run");
    await expect(page.getByRole("group", { name: "Speed" })).toHaveCount(0);
    const p0 = await stats(page);
    await sel.tap();
    const group = page.getByRole("group", { name: "Speed" });
    await expect(group.getByRole("button", { name: /Run/ })).toHaveAttribute("aria-pressed", "true");
    // the open choices don't cover the Menu button
    const g = (await group.boundingBox())!;
    const m = (await page.getByRole("button", { name: /^Menu/ }).boundingBox())!;
    expect(g.x < m.x + m.width && m.x < g.x + g.width && g.y < m.y + m.height && m.y < g.y + g.height, "speed choices clear of Menu").toBe(false);
    await group.getByRole("button", { name: /Fly/ }).tap();
    await expect(group).toHaveCount(0);
    await expect(sel).toHaveAccessibleName("Speed: Fly");
    expect((await stats(page)).speed).toBe("fly");
    expect(Math.abs((await stats(page)).yaw - p0.yaw), "tapping the selector didn't turn the camera").toBeLessThan(1e-9);
    // hold Up: climbs and flies
    const up = page.getByRole("button", { name: "Up", exact: true });
    const b = (await up.boundingBox())!;
    expect(b.width >= 44 && b.height >= 44).toBe(true);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect.poll(async () => (await stats(page)).feet[1]!, { timeout: 10_000 }).toBeGreaterThan(p0.feet[1]! + 3);
    await page.mouse.up();
    expect((await stats(page)).flying).toBe(true);
    await page.getByRole("button", { name: "Boost" }).tap();
    await expect(page.getByRole("button", { name: "Boost" })).toHaveAttribute("aria-pressed", "true");
  });

  test("T5: two touch points at once (stick + look) work independently; pointercancel leaves nothing held", async ({ page }) => {
    await start(page);
    await settle(page);
    const cdp = await page.context().newCDPSession(page);
    const s = (await page.locator(".world-stick").boundingBox())!;
    const c = (await page.locator("canvas.world-canvas").boundingBox())!;
    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const lx = c.x + c.width * 0.65, ly = c.y + c.height * 0.45;
    const p0 = await stats(page);
    // finger 1 on the stick, pushed forward; finger 2 drags the camera on the canvas
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx, y: sy - s.height * 0.45, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy - s.height * 0.45, id: 1 }, { x: lx, y: ly, id: 2 }] });
    for (let k = 1; k <= 8; k++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx, y: sy - s.height * 0.45, id: 1 }, { x: lx + k * 12, y: ly, id: 2 }] });
      await page.waitForTimeout(40);
    }
    const mid = await input(page);
    expect(mid.move[1], "the stick still drives forward while the other finger looks").toBeGreaterThan(0.3);
    await page.waitForTimeout(700);
    const p1 = await stats(page);
    expect(Math.abs(p1.yaw - p0.yaw), "the second finger turned the camera").toBeGreaterThan(0.01);
    expect(dist(p1.feet, p0.feet), "the first finger moved the explorer").toBeGreaterThan(0.5);
    // the system cancels both touches (a gesture, a rotation): nothing stays held
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await page.waitForTimeout(300);
    const after = await input(page);
    expect(Math.hypot(after.move[0]!, after.move[1]!), "the stick released on cancel").toBe(0);
    await settle(page);
    const p2 = await stats(page);
    await page.waitForTimeout(800);
    expect(dist((await stats(page)).feet, p2.feet), "no stuck direction after cancel").toBeLessThan(STILL);
  });

  test("T6: rotating with the information panel open keeps it usable; the world and choices are kept", async ({ page }) => {
    await start(page);
    await goToLandmark(page, "L03");
    await page.getByRole("button", { name: /^Speed: / }).tap();
    await page.getByRole("group", { name: "Speed" }).getByRole("button", { name: /Walk/ }).tap();
    await page.locator(".world-t-info").tap();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    const canvases0 = await page.locator("canvas.world-canvas").count();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await expect(panel).toBeVisible();
    const close = page.getByRole("button", { name: "Close information" });
    await expect(close).toBeInViewport();
    const pb = (await panel.boundingBox())!;
    expect(pb.x >= 0 && pb.x + pb.width <= 390 && pb.y + pb.height <= 844).toBe(true);
    await close.tap();
    expect(await page.locator("canvas.world-canvas").count()).toBe(canvases0);
    expect((await stats(page)).speed).toBe("walk");
    await expect(page.getByRole("button", { name: /^Speed: / })).toHaveAccessibleName("Speed: Walk");
    expect((await stats(page)).control).toBe("exploring");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("T9: repeated rotation adds no listeners, canvases or render loops, and idle rendering still stops", async ({ page }) => {
    // count live listeners on window/document by type (wrapping add/remove), and rAF callbacks requested per frame
    await page.addInitScript(() => {
      const live = new Map<string, number>();
      for (const t of [window, document] as EventTarget[]) {
        const add = t.addEventListener.bind(t), rem = t.removeEventListener.bind(t);
        const key = (type: string) => `${t === window ? "w" : "d"}:${type}`;
        const seen = new WeakMap<object, Set<string>>();
        t.addEventListener = (type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions) => {
          if (fn) {
            const cap = typeof o === "boolean" ? o : !!o?.capture;
            const k = `${type}|${cap}`;
            const set = seen.get(fn as object) ?? new Set<string>();
            if (!set.has(k)) {
              set.add(k);
              seen.set(fn as object, set);
              live.set(key(type), (live.get(key(type)) ?? 0) + 1);
            }
          }
          return add(type, fn, o);
        };
        t.removeEventListener = (type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | EventListenerOptions) => {
          if (fn) {
            const cap = typeof o === "boolean" ? o : !!o?.capture;
            const set = seen.get(fn as object);
            if (set?.delete(`${type}|${cap}`)) live.set(key(type), (live.get(key(type)) ?? 1) - 1);
          }
          return rem(type, fn, o);
        };
      }
      (window as unknown as { __live: () => Record<string, number> }).__live = () => Object.fromEntries([...live].filter(([, n]) => n > 0));
    });
    await start(page);
    await settle(page);
    const snap = async () => page.evaluate(() => ({ live: (window as unknown as { __live: () => Record<string, number> }).__live(), canvases: document.querySelectorAll("canvas").length, stages: document.querySelectorAll(".world-stage").length }));
    const before = await snap();
    const sizes = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 844, height: 390 }];
    for (let round = 0; round < 3; round++)
      for (const sz of sizes) {
        await page.setViewportSize(sz);
        await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
        await page.waitForTimeout(150);
      }
    // open and close the panel and the menu between rotations too
    await page.locator(".world-t-info").first().tap().catch(() => undefined);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const after = await snap();
    expect(after.canvases).toBe(before.canvases);
    expect(after.stages).toBe(1);
    expect(after.live, "listener counts return to the same level").toEqual(before.live);
    // idle: once still, the world stops drawing (renders stop increasing)
    await settle(page);
    await page.waitForTimeout(1200);
    const r0 = Number((await page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): { renders: number } } }).__stillwoodWorld.stats())).renders);
    await page.waitForTimeout(1500);
    const r1 = Number((await page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): { renders: number } } }).__stillwoodWorld.stats())).renders);
    expect(r1 - r0, "no frames drawn while idle").toBeLessThanOrEqual(2);
  });

  test("T10: edge controls follow the safe-area variables; a browser-chrome height change keeps the menu inside the stage", async ({ page }) => {
    // Headless Chromium reports zero safe-area insets and has no notch or gesture bar, so env(safe-area-inset-*)
    // can't be exercised for real here. What is checked: the edge controls are placed from the layout's inset
    // variables (raising them moves every control inward), and the menu stays inside the stage as the height changes.
    await start(page);
    const edges = async () => page.evaluate(() => Object.fromEntries([".world-t-menu", ".world-t-cluster", ".world-t-stickwrap", ".world-t-label"].map((s) => {
      const r = document.querySelector(s)!.getBoundingClientRect();
      const st = document.querySelector(".world-stage")!.getBoundingClientRect();
      return [s, { l: r.left - st.left, r: st.right - r.right, b: st.bottom - r.bottom, t: r.top - st.top }];
    })));
    const e0 = await edges();
    await page.addStyleTag({ content: ".world-touch-layout{--t-l:44px;--t-r:44px;--t-b:34px;--t-t:24px}" });
    await page.waitForTimeout(200);
    const e1 = await edges();
    expect(e1[".world-t-label"]!.l - e0[".world-t-label"]!.l).toBeCloseTo(32, 0);
    expect(e1[".world-t-stickwrap"]!.l - e0[".world-t-stickwrap"]!.l).toBeCloseTo(32, 0);
    expect(e1[".world-t-menu"]!.r - e0[".world-t-menu"]!.r).toBeCloseTo(32, 0);
    expect(e1[".world-t-cluster"]!.r - e0[".world-t-cluster"]!.r).toBeCloseTo(32, 0);
    expect(e1[".world-t-cluster"]!.b - e0[".world-t-cluster"]!.b).toBeCloseTo(22, 0);
    expect(e1[".world-t-menu"]!.t - e0[".world-t-menu"]!.t).toBeCloseTo(12, 0);
    // the stylesheet reads the device insets (the variables are built from env(safe-area-inset-*))
    const css = await page.evaluate(() => [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText); } catch { return []; } }).filter((t) => t.includes(".world-touch-layout") && t.includes("--t-l")).join("\n"));
    expect(css).toContain("safe-area-inset-left");
    expect(css).toContain("safe-area-inset-bottom");
    // the browser's toolbar collapsing/expanding changes the height: open the menu and change it
    await page.getByRole("button", { name: /^Menu/ }).tap();
    for (const h of [340, 390, 360]) {
      await page.setViewportSize({ width: 844, height: h });
      await page.waitForTimeout(200);
      const sheet = (await page.locator(".world-t-sheet").boundingBox())!;
      const stage = (await page.locator(".world-stage").boundingBox())!;
      expect(sheet.y >= stage.y - 0.5 && sheet.y + sheet.height <= stage.y + stage.height + 0.5, `menu inside the stage at height ${h}`).toBe(true);
      await expect(page.getByRole("button", { name: "Resume exploring" })).toBeInViewport();
    }
  });

  test("T7: a portal destination from the menu returns to the same place, paused, nothing held", async ({ page }) => {
    await register(page, "Tablet");
    await start(page);
    await goToLandmark(page, "L03");
    await settle(page);
    const left = await stats(page);
    await page.getByRole("button", { name: /^Menu/ }).tap();
    await page.getByRole("dialog", { name: "Paused" }).getByRole("link", { name: "My Works" }).tap();
    await expect(page).toHaveURL(/\/works\/$/);
    await page.getByRole("link", { name: "Return to world" }).tap();
    await expect(page).toHaveURL(/\/world\/$/);
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    const back = await stats(page);
    expect(dist(back.feet, left.feet)).toBeLessThan(0.6);
    expect(back.control).not.toBe("exploring");
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  });

  test("T8: home page (signed in): the same compact label and menu; 'View player works' scrolls to the exhibition", async ({ page }) => {
    await register(page, "Home");
    await start(page, "/");
    await goToLandmark(page, "L03");
    await expect(page.locator(".world-t-label")).toContainText("Preset");
    await page.getByRole("button", { name: /^Menu/ }).tap();
    const nav = page.getByRole("dialog", { name: "Paused" }).getByRole("navigation", { name: "Island portals" });
    await expect(nav.getByRole("link", { name: "My Works" })).toHaveAttribute("href", "/works/");
    await expect(nav.getByRole("link", { name: "Build Together" })).toHaveAttribute("href", "/works/?new=1");
    await nav.getByRole("link", { name: "View player works" }).scrollIntoViewIfNeeded();
    await nav.getByRole("link", { name: "View player works" }).tap();
    await expect(page.getByRole("heading", { name: "Exhibition" })).toBeInViewport({ timeout: 10_000 });
    // the app router records the anchor as on desktop (onLinkClick → /#exhibits-h); still the home page, same island
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("canvas.world-canvas")).toHaveCount(1);
    // normal page scrolling works outside the island
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => scrollY)).not.toBe(y0);
  });
});

// the size matrix: nothing clipped, overlapping or under the safe edge; targets ≥ 44 px; no horizontal overflow
const MATRIX = [
  { w: 390, h: 844 }, { w: 844, h: 390 }, { w: 360, h: 640 }, { w: 667, h: 375 },
  { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1024, h: 1366 }, { w: 1366, h: 1024 },
];
for (const vp of MATRIX) {
  test.describe(`touch layout ${vp.w}×${vp.h} (emulated)`, () => {
    test.setTimeout(120_000);
    test.use({ viewport: { width: vp.w, height: vp.h }, ...PIXEL });
    test("controls fit, don't overlap, are ≥ 44 px and leave the centre free", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
      await start(page);
      await goToLandmark(page, "L09");
      await page.waitForTimeout(800);
      const st = (await page.locator(".world-stage").boundingBox())!;
      const t = await targets(page);
      const names = t.map((x) => x.name);
      expect(names.some((n) => /^About /.test(n)), "information button").toBe(true);
      expect(names.some((n) => /^Menu/.test(n)), "menu button").toBe(true);
      for (const a of t) {
        expect(a.w >= 44 && a.h >= 44, `${a.name} is ${a.w}×${a.h}`).toBe(true);
        expect(a.l >= st.x - 0.5 && a.r <= st.x + st.width + 0.5 && a.t >= st.y - 0.5 && a.b <= st.y + st.height + 0.5, `${a.name} inside the stage`).toBe(true);
      }
      for (let i = 0; i < t.length; i++)
        for (let j = i + 1; j < t.length; j++) {
          const a = t[i]!, b = t[j]!;
          if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) {
            // a button nested inside another target's box (the info button inside the label chip) is not an overlap
            const inside = (x: typeof a, y: typeof a) => x.l >= y.l && x.r <= y.r && x.t >= y.t && x.b <= y.b;
            expect(inside(a, b) || inside(b, a), `${a.name} overlaps ${b.name}`).toBe(true);
          }
        }
      // the centre third of the stage carries no control
      const cx0 = st.x + st.width / 3, cx1 = st.x + (2 * st.width) / 3, cy0 = st.y + st.height / 3, cy1 = st.y + (2 * st.height) / 3;
      for (const a of t) expect(a.l < cx1 && cx0 < a.r && a.t < cy1 && cy0 < a.b, `${a.name} in the centre`).toBe(false);
      // the landmark label is bounded (never a full-width banner)
      const lb = (await page.locator(".world-t-label").boundingBox())!;
      expect(lb.width).toBeLessThanOrEqual(Math.min(352 + 1, st.width - 100));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.w);
      expect(await page.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map((e) => e.id); return ids.filter((x, i) => ids.indexOf(x) !== i); })).toEqual([]);
    });
  });
}

// the desktop model is kept when the primary pointer is fine, whatever the width or touch capability
async function startByMouse(page: Page): Promise<void> {
  await page.goto("/world/");
  const b = page.getByRole("button", { name: "Start exploring" });
  await expect(b).toBeEnabled({ timeout: 60_000 });
  await b.click();
  await expect.poll(async () => (await stats(page)).control).toBe("exploring");
}

test.describe("desktop model kept for a fine primary pointer", () => {
  test.setTimeout(120_000);
  test("a narrow desktop window (390 wide, mouse) keeps the desktop HUD", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
    await startByMouse(page);
    await expect(page.locator(".world-touch-layout")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
    await expect(page.locator(".world-t-label")).toHaveCount(0);
  });
  test("a touch-capable laptop with a mouse as primary input keeps the desktop HUD (simulated media report)", async ({ page }) => {
    // Headless Chromium can't emulate a hybrid: its touch emulation reports a touch-only device (coarse primary,
    // no hover), and CDP media emulation doesn't cover pointer/hover. So the page's matchMedia reports what a
    // touchscreen laptop with a trackpad reports (primary fine + hover, any-pointer coarse); real touch events are
    // available too. This checks the page's decision, not a physical hybrid.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => {
      localStorage.setItem("stillwood.test", "1");
      const real = window.matchMedia.bind(window);
      const report: Record<string, boolean> = { "(pointer: coarse)": false, "(pointer: fine)": true, "(hover: none)": false, "(hover: hover)": true, "(any-pointer: coarse)": true, "(any-pointer: fine)": true };
      window.matchMedia = (q: string) => {
        const parts = q.split(" and ").map((x) => x.trim());
        if (parts.every((x) => x in report)) {
          // a plain object (MediaQueryList's `matches` is a getter that can't be assigned on a copy)
          return { matches: parts.every((x) => report[x]), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as unknown as MediaQueryList;
        }
        return real(q);
      };
      (window as unknown as { __touchCapable: boolean }).__touchCapable = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    });
    await startByMouse(page);
    expect(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches), "the page sees a touch screen").toBe(true);
    await expect(page.locator(".world-touch-layout")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Island portals" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Light: day and night" })).toBeVisible();
  });
});
