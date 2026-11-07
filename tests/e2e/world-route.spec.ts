// The brief's end-to-end route (§11), at 1920×1080 (keyboard and mouse) and
// 390×844 (touch): home → enter the world → go to a building → fly from its
// foot to above its top → recover to a safe point → open My Works and a
// workbench → back to the exhibition list. A resize happens mid-flight.
// Software-rendered (SwiftShader): behaviour, not frame rate.
import { devices, expect, test, type Page } from "@playwright/test";
import { createWork, register } from "./helpers.ts";

type Probe = { stats(): Record<string, unknown>; view: { getStatus(): { control: string } } };
const stats = (page: Page): Promise<Record<string, unknown>> => page.evaluate(() => (window as unknown as { __stillwoodWorld: Probe }).__stillwoodWorld.stats());
const control = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { __stillwoodWorld: Probe }).__stillwoodWorld.view.getStatus().control);
const feetY = async (page: Page): Promise<number> => ((await stats(page)).feet as number[])[1]!;

/**
 * L14, Four-Leg Wind Tower (188 m on a pad at y = 72). The brief's route: "ascend between legs,
 * through both platform apertures and to the summit ring". The summit ring's deck is at
 * y ≈ 247.5–248.5 over the centre (the spire above it is not a landing place).
 */
const TOWER = { id: "L14", title: "Four-Leg Wind Tower", summitDeck: 247.5 };

async function route(page: Page, phone: boolean): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
  await register(page, "Route");
  const work = await createWork(page, "Route work");

  // 1. home → the island is there, entered with one gesture
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start exploring" });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect.poll(() => control(page)).toBe("exploring");

  // 2. go to the building through the pause menu's landmark list (keyboard: Esc; touch: the Menu button, which pauses)
  if (phone) await page.getByRole("button", { name: /^Menu/ }).click();
  else await page.keyboard.press("Escape");
  await page.getByLabel("Go to a landmark").selectOption(TOWER.id);
  await expect(page.getByText(`At ${TOWER.title}.`)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Resume exploring" }).click();
  await expect.poll(() => control(page)).toBe("exploring");
  // walk in between the legs to the centre, under the apertures (the ground viewpoint stands
  // outside them, under the first platform's slab)
  await page.evaluate(async (id) => {
    const w = (window as unknown as { __stillwoodWorld: { view: { manifest: { landmarks: { id: string; safePoints: { id: string; feet: number[]; yaw: number }[] }[] }; jumpTo(t: { feet: number[]; yaw: number }): Promise<boolean>; takeControl(o: { pointerLock: boolean }): void } } }).__stillwoodWorld.view;
    const sp = w.manifest.landmarks.find((l) => l.id === id)!.safePoints.find((p) => p.id === `${id}-centre`)!;
    await w.jumpTo({ feet: sp.feet, yaw: sp.yaw });
    w.takeControl({ pointerLock: false });
  }, TOWER.id);
  await expect.poll(() => control(page)).toBe("exploring");
  const foot = await feetY(page);
  expect(foot, "standing at the tower's foot").toBeLessThan(TOWER.summitDeck - 150);

  // 3. fly from the foot to above the top (boost climbs at 15 m/s); resize half-way
  if (phone) {
    await page.getByRole("button", { name: "Boost" }).click();
    const up = page.getByRole("button", { name: "Up", exact: true });
    const box = (await up.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  } else {
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("Space");
  }
  let resized = false;
  const until = Date.now() + 40_000;
  let y = foot;
  while (Date.now() < until && y < TOWER.summitDeck - 1) {
    await page.waitForTimeout(500);
    y = await feetY(page);
    if (!resized && y > foot + 60) {
      // mid-interaction resize: the view keeps rendering and the climb continues
      const vp = page.viewportSize()!;
      await page.setViewportSize({ width: Math.round(vp.width * 0.8), height: vp.height });
      resized = true;
    }
  }
  if (phone) await page.mouse.up();
  else {
    await page.keyboard.up("Space");
    await page.keyboard.up("ShiftLeft");
  }
  expect(resized, `resized during the climb (foot ${foot.toFixed(1)}, reached ${y.toFixed(1)}, flying ${(await stats(page)).flying})`).toBe(true);
  // up through both apertures to the summit ring (the deck stops the climb: collision holds)
  expect(y, `climbed from ${foot.toFixed(1)} to ${y.toFixed(1)}; the summit deck is at ${TOWER.summitDeck}`).toBeGreaterThan(TOWER.summitDeck - 3);
  expect(await control(page)).toBe("exploring");
  const s = await stats(page);
  expect(Number(s.renders)).toBeGreaterThan(0);

  // 4. recover: the pause menu's safe point puts the explorer back on the ground near here
  if (phone) await page.getByRole("button", { name: /^Menu/ }).click();
  else await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Return to nearest safe point" }).click();
  await expect(page.getByText("Returned to the nearest safe point.")).toBeVisible({ timeout: 60_000 });
  // recovery lands exactly on a declared safe point (here the nearest is the summit ring's deck)
  const at = (await stats(page)).feet as number[];
  const safe = await page.evaluate((id) => (window as unknown as { __stillwoodWorld: { view: { manifest: { landmarks: { id: string; safePoints: { feet: number[] }[] }[] } } } }).__stillwoodWorld.view.manifest.landmarks.find((l) => l.id === id)!.safePoints.map((p) => p.feet), TOWER.id);
  expect(at.every(Number.isFinite)).toBe(true);
  expect(Math.min(...safe.map((f) => Math.hypot(f[0]! - at[0]!, f[1]! - at[1]!, f[2]! - at[2]!))), `recovered to ${at.map((v) => v.toFixed(1))}`).toBeLessThan(1);

  // 5. My Works (the header link, an existing page) and the workbench of an existing work
  await page.locator("header.site-header").getByRole("link", { name: "My works", exact: true }).click();
  await expect(page).toHaveURL(/\/works\/$/);
  await expect(page.getByRole("link", { name: "Route work" })).toBeVisible();
  await page.goto(`/works/${work}/`);
  await expect(page.locator(".conn-open")).toBeVisible();
  await expect(page.locator(".world-stage")).toHaveCount(0);

  // 6. back to the original exhibition list
  await page.locator("header.site-header").getByRole("link", { name: "Exhibition", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Exhibition" })).toBeVisible();
  await expect(page.getByLabel("Search exhibits by name")).toBeVisible();
}

test.describe("the island route", () => {
  test.setTimeout(240_000);

  test.describe("desktop 1920×1080, keyboard and mouse", () => {
    test.use({ viewport: { width: 1920, height: 1080 } });
    test("home → building → fly to the top → recover → My Works → exhibition", async ({ page }) => {
      await route(page, false);
    });
  });

  test.describe("phone 390×844, touch", () => {
    // a touch phone: coarse pointer (touch controls), mobile viewport, touch events
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: devices["Pixel 7"].userAgent });
    test("home → building → fly to the top → recover → My Works → exhibition", async ({ page }) => {
      await route(page, true);
    });
  });
});
