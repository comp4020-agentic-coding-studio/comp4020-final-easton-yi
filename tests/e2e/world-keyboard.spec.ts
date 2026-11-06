// Keyboard-only operation and slow resources (brief §6, §11): the island is
// entered, moved, paused, recovered and left without a mouse; focus lands on
// something useful after each overlay; a slow manifest shows progress and
// leaves the page usable. Software-rendered (SwiftShader) — this checks
// behaviour, not frame rate.
import { expect, test, type Page } from "@playwright/test";

type Probe = { stats(): Record<string, unknown>; view: { getStatus(): { control: string; phase: string } } };
const stats = (page: Page): Promise<Record<string, unknown>> => page.evaluate(() => (window as unknown as { __stillwoodWorld: Probe }).__stillwoodWorld.stats());
const control = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { __stillwoodWorld: Probe }).__stillwoodWorld.view.getStatus().control);
const focused = (page: Page): Promise<string> => page.evaluate(() => {
  const a = document.activeElement;
  return a && a !== document.body ? `${a.tagName.toLowerCase()}:${(a.textContent ?? "").trim() || a.getAttribute("aria-label") || ""}` : "body";
});

test.describe("keyboard-only island", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
  });

  test("Tab reaches Start exploring; keys move; Esc pauses with focus on Resume; menu actions are keyboard-operable; Tab leaves the island", async ({ page }) => {
    await page.goto("/world/");
    const start = page.getByRole("button", { name: "Start exploring" });
    await expect(start).toBeEnabled({ timeout: 60_000 });

    // reach the control by keyboard only: Tab from the top of the page until it has focus
    let reached = false;
    for (let i = 0; i < 25 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await start.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Start exploring is reachable with Tab").toBe(true);
    // focus is visible (the app's focus ring, not the browser default suppressed)
    const ring = await start.evaluate((el) => getComputedStyle(el).outlineStyle !== "none" || getComputedStyle(el).boxShadow !== "none");
    expect(ring, "focused control shows a focus indicator").toBe(true);
    await page.keyboard.press("Enter");
    await expect.poll(() => control(page)).toBe("exploring");

    // move with the keyboard (W held) and turn with J; the feet change
    const before = (await stats(page)).feet as number[];
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1500);
    await page.keyboard.up("KeyW");
    await page.keyboard.press("KeyJ");
    const after = (await stats(page)).feet as number[];
    expect(Math.hypot(after[0]! - before[0]!, after[2]! - before[2]!), "W moved the explorer").toBeGreaterThan(1);

    // Esc releases control and opens the pause menu, with focus on a control in it (not lost to <body>)
    await page.keyboard.press("Escape");
    await expect.poll(() => control(page)).not.toBe("exploring");
    await expect(page.getByRole("group", { name: "Paused" })).toBeVisible();
    expect(await focused(page)).toBe("button:Resume exploring");

    // Tab into the menu and use "Return home" with Enter
    let onHome = false;
    for (let i = 0; i < 10 && !onHome; i++) {
      await page.keyboard.press("Tab");
      onHome = (await focused(page)) === "button:Return home";
    }
    expect(onHome, "Return home is reachable with Tab").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Back at the home meadow.")).toBeVisible({ timeout: 30_000 });

    // resume with the keyboard, then pause again with Esc: focus again lands in the menu
    await page.getByRole("button", { name: "Resume exploring" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => control(page)).toBe("exploring");
    // the world's keys do nothing while focus is in a form field (typing never moves the camera)
    await page.keyboard.press("Escape");
    await expect.poll(() => control(page)).not.toBe("exploring");

    // no trap: Tab continues past the island to the rest of the page
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      seen.add(await focused(page));
    }
    expect([...seen].some((f) => /^a:(Exhibition|About|Sign in|Stillwood)$/.test(f) || /^a:(My Works|Build Together|View player works|Explore the World)$/.test(f)), `focus moved on: ${[...seen].join(" | ")}`).toBe(true);
  });

  test("keys typed into the page's search field never move the camera", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start exploring" }).click();
    await expect.poll(() => control(page)).toBe("exploring");
    await page.keyboard.press("Escape");
    const before = (await stats(page)).feet as number[];
    await page.getByLabel("Search exhibits by name").fill("wasd wasd");
    await page.getByLabel("Search exhibits by name").press("KeyW");
    const after = (await stats(page)).feet as number[];
    expect(after).toEqual(before);
  });
});

test.describe("slow resources", () => {
  test("a slow manifest shows progress, the page stays usable, and the island arrives", async ({ page }) => {
    await page.route("**/world-data/manifest.json", async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await page.goto("/");
    // while the island waits, the page and its controls are usable
    await expect(page.locator(".world-progress")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Start building" })).toBeVisible();
    await page.getByLabel("Search exhibits by name").fill("slow");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No exhibits are named like “slow”.")).toBeVisible();
    // then it arrives
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
  });

  test("slow landmark files: the island is explorable before they arrive and fills in", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
    await page.route(/\/world-data\/landmarks\/L\d\d\.far\.[0-9a-f]{8}\.bin/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start exploring" }).click();
    await expect.poll(() => control(page)).toBe("exploring");
    await expect.poll(async () => ((await stats(page)).landmarksReady as string[]).length, { timeout: 90_000 }).toBe(20);
  });
});

test.describe("tab suspension", () => {
  test("a hidden tab stops rendering and pauses exploring; showing it again resumes cleanly", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("stillwood.test", "1");
      // the crit9 tests' pattern: drive document.hidden/visibilityState as a backgrounded tab would
      let hidden = false;
      Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      (window as unknown as { __setHidden(h: boolean): void }).__setHidden = (h: boolean) => {
        hidden = h;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await page.goto("/world/");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start exploring" }).click();
    await expect.poll(() => control(page)).toBe("exploring");

    await page.evaluate(() => (window as unknown as { __setHidden(h: boolean): void }).__setHidden(true));
    await expect.poll(() => control(page)).toBe("paused");
    const r0 = Number((await stats(page)).renders);
    await page.waitForTimeout(1500);
    expect(Number((await stats(page)).renders), "no frames while hidden").toBe(r0);
    expect((await stats(page)).raf, "no animation frame pending while hidden").toBe(false);

    await page.evaluate(() => (window as unknown as { __setHidden(h: boolean): void }).__setHidden(false));
    await expect.poll(async () => Number((await stats(page)).renders)).toBeGreaterThan(r0);
    // still paused (no surprise capture), and resuming works
    expect(await control(page)).toBe("paused");
    // an external pause (hidden tab, blur, lost pointer lock) shows the ordinary entry control
    await page.getByRole("button", { name: /^(Start|Resume) exploring$/ }).click();
    await expect.poll(() => control(page)).toBe("exploring");
    const feet = (await stats(page)).feet as number[];
    expect(feet.every(Number.isFinite)).toBe(true);
  });
});

test.describe("level of detail", () => {
  test("a landmark at the near level with its detail resident is drawn by its cells only (no far-mesh double draw)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
    await page.goto("/world/");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start exploring" }).click();
    // walk up to L16 (the dam): its neighbour L15 also reaches the near level here, both while their detail loads
    await page.keyboard.press("Escape");
    await page.getByLabel("Go to a landmark").selectOption("L16");
    await expect(page.getByText("At Curved Gorge Dam.")).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => {
        const s = await stats(page);
        const lods = s.lods as Record<string, number>;
        return (s.detailReady as string[]).filter((id) => lods[id] === 0).length;
      }, { timeout: 90_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    const s = await stats(page);
    const lods = s.lods as Record<string, number>;
    const far = s.farDrawn as Record<string, number>;
    const near = (s.detailReady as string[]).filter((id) => lods[id] === 0);
    expect(near.length).toBeGreaterThan(0);
    for (const id of near) expect(far[id], `${id} at the near level with detail resident still draws its far mesh`).toBe(0);
  });

  test("after a jump the terrain's detail follows the new position without walking (no stale coarse ground)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
    await page.goto("/world/");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start exploring" }).click();
    // L14 stands on a cliff-top ~1.5 km from home: before the jump its chunks were chosen from home (coarse)
    await page.keyboard.press("Escape");
    await page.getByLabel("Go to a landmark").selectOption("L14");
    await expect(page.getByText("At Four-Leg Wind Tower.")).toBeVisible({ timeout: 60_000 });
    // paused after the jump: nothing has walked; the terrain must already have been re-chosen here
    const s = await stats(page);
    const here = s.terrainHere as { anchorDist: number; step: number | null };
    expect(here.anchorDist, "terrain LOD anchor is at the new position").toBeLessThan(6);
    expect(here.step, "the chunk under the camera is drawn at the full grid").toBe(1);
  });
});
