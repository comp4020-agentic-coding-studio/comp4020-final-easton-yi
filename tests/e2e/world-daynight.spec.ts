// Day and night in the real page (courtyard/day-night directive §6–§8, §12):
// the page's clock is fixed with Playwright's clock (inside the page only;
// the operating system's clock is never touched), so Auto's first frame at
// night is checked as night, the Auto / Day / Night control changes the
// environment and is remembered across a reload, reduced motion makes the
// change immediate, and by day the candle cups stay while their flames and
// lights are off. Software-rendered (SwiftShader): states and counts, not
// appearance or frame rate.
import { expect, test, type Page } from "@playwright/test";

type Env = { mode: string; night: number; target: number; phase: string; blending: boolean; keyIntensity: number; moon: boolean };
type Candles = { groups: number; cups: number; lightsActive: number; lightsPool: number; cupsDrawn: number; lit: number };
type Stats = { control: string; environment: Env; candles: Candles | null; courtyard: { flowersDrawn: number } | null };
const stats = (page: Page): Promise<Stats> => page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): Stats } }).__stillwoodWorld.stats());

const light = (page: Page) => page.getByRole("group", { name: "Light: day and night" }).first();

async function open(page: Page): Promise<void> {
  await page.goto("/world/");
  await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
  await expect.poll(async () => (await stats(page)).candles?.groups ?? 0, { timeout: 30_000 }).toBeGreaterThan(100);
}

test.describe("day and night", () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
  });

  test("Auto at 23:30 opens at night with no blend from day; the moon is the key light and candles are lit", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 7, 23, 30));
    await open(page);
    const s = await stats(page);
    expect(s.environment.mode).toBe("auto");
    expect(s.environment.phase).toBe("night");
    expect(s.environment.night).toBe(1);
    expect(s.environment.blending).toBe(false);
    expect(s.environment.moon).toBe(true);
    expect(s.candles!.lit).toBe(1);
    await expect(light(page).getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Auto · Night now")).toBeVisible();
  });

  test("Auto at noon is day: cups stay, flames and lights are off", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 7, 12, 0));
    await open(page);
    const s = await stats(page);
    expect(s.environment.phase).toBe("day");
    expect(s.environment.night).toBe(0);
    expect(s.environment.moon).toBe(false);
    expect(s.candles!.lit).toBe(0);
    expect(s.candles!.lightsActive).toBe(0);
    expect(s.candles!.cupsDrawn).toBeGreaterThan(0); // the home courtyard's cups are there by day
  });

  test("Night blends in over a few seconds, is remembered across a reload, and Day takes it back", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 7, 12, 0));
    await open(page);
    await light(page).getByRole("button", { name: "Night" }).click();
    await expect(light(page).getByRole("button", { name: "Night" })).toHaveAttribute("aria-pressed", "true");
    // a blend, not a cut (its frames come from the real loop: the fixed clock only fixes Date)
    const first = await stats(page);
    expect(first.environment.target).toBe(1);
    await expect.poll(async () => (await stats(page)).environment.night, { timeout: 20_000 }).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem("stillwood.worldLight.v1"))).toBe("night");
    await expect.poll(async () => (await stats(page)).candles!.lit).toBe(1);

    await page.reload();
    await expect.poll(async () => (await stats(page).catch(() => null))?.environment.mode ?? null, { timeout: 60_000 }).toBe("night");
    const after = await stats(page);
    expect(after.environment.night).toBe(1); // at noon, the stored Night holds from the first frame
    expect(after.environment.blending).toBe(false);

    await light(page).getByRole("button", { name: "Day" }).click();
    await expect.poll(async () => (await stats(page)).environment.night, { timeout: 20_000 }).toBe(0);
    await expect.poll(async () => (await stats(page)).candles!.lit).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem("stillwood.worldLight.v1"))).toBe("day");
  });

  test("with reduced motion the change is immediate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.setFixedTime(new Date(2026, 10, 7, 12, 0));
    await open(page);
    await light(page).getByRole("button", { name: "Night" }).click();
    await expect.poll(async () => (await stats(page)).environment.night, { timeout: 3_000 }).toBe(1);
  });

  test("the light control never moves the camera or starts exploring", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 7, 12, 0));
    await open(page);
    const before = await page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): { feet: number[]; yaw: number; pitch: number; control: string } } }).__stillwoodWorld.stats());
    for (const name of ["Night", "Day", "Auto"]) await light(page).getByRole("button", { name }).click();
    const after = await page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): { feet: number[]; yaw: number; pitch: number; control: string } } }).__stillwoodWorld.stats());
    expect(after.yaw).toBe(before.yaw);
    expect(after.pitch).toBe(before.pitch);
    expect(after.feet).toEqual(before.feet);
    expect(after.control).toBe(before.control);
  });
});
