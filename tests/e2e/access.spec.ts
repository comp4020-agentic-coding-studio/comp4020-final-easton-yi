// AT-12, ACCESS-01..03, CAM-04, PLACE-05: keyboard-only building, pointer
// gesture ownership, phone layout with touch, wide desktop, resize during a
// held draft, reduced motion.
import { expect, test, type Page } from "@playwright/test";
import { createWork, register } from "./helpers.ts";

const framing = (p: Page) => p.evaluate(() => (window as any).__stillwood.framing());
const sticks = (p: Page) => p.evaluate(() => (window as any).__stillwood.sticks());
const probe = async (p: Page): Promise<void> => {
  await p.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
};
const readout = (p: Page, label: string) => p.getByRole("group", { name: label }).locator("output").innerText();

test("keyboard only: build and place a stick, then focus an existing one", async ({ page }) => {
  await probe(page);
  await register(page, "Keys");
  await createWork(page, "Keyboard work");
  await page.keyboard.press("Tab"); // the intro card has focus; Skip is reachable by keyboard
  await page.getByRole("button", { name: "Skip" }).focus();
  await page.keyboard.press("Enter");
  // start without touching the canvas
  await page.getByRole("button", { name: "Add a stick" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".draft-state")).toBeVisible();
  const x0 = await readout(page, "Left / right (X)");
  await page.locator("body").press("ArrowRight");
  await page.locator("body").press("ArrowRight");
  expect(await readout(page, "Left / right (X)")).not.toBe(x0);
  await page.locator("body").press("Shift+ArrowUp"); // fine step
  await page.locator("body").press("e"); // turn
  await page.locator("body").press("v"); // vertical about the chosen pivot
  await page.locator("body").press("h"); // and back to horizontal
  await page.locator("body").press("g"); // snap to support
  // shortcuts don't fire inside a text field
  await page.getByRole("button", { name: "Exact values" }).click();
  const field = page.getByLabel("X", { exact: true });
  await field.focus();
  const before = await readout(page, "Left / right (X)");
  await field.press("ArrowRight");
  await field.press("e");
  await field.press("Enter"); // submits the exact-values form, not a placement
  expect(await readout(page, "Left / right (X)")).toBe(before);
  // Enter inside the field didn't place either; move focus to Place and press it
  await page.getByRole("button", { name: "Place", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast-ok").last()).toContainText("Placed and saved.");
  await expect.poll(() => sticks(page)).toBe(1);
  // choose an existing stick from the list and focus the view on it
  await page.getByRole("button", { name: "Sticks" }).focus();
  await page.keyboard.press("Enter");
  const item = page.getByRole("button", { name: /#1 · placed by Keys/ });
  await item.focus();
  const f0 = await framing(page);
  await page.keyboard.press("Enter");
  await expect(item).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await framing(page)).distance).not.toBeCloseTo(f0.distance, 1);
  // the focused control shows a visible outline
  const outline = await item.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});

test("pointer: dragging the ghost moves it and not the camera; dragging the background orbits", async ({ page }) => {
  await probe(page);
  await register(page, "Mouse");
  await createWork(page, "Drag work");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Top" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Add a stick" }).click();
  await page.waitForTimeout(300);
  const box = (await page.locator(".scene-host").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const camBefore = await framing(page);
  const xBefore = await readout(page, "Left / right (X)");
  // the ghost spawns at the table centre: from the top view it's under the middle of the stage
  await page.mouse.move(cx + 3, cy + 3);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 10, { steps: 8 });
  await page.mouse.up();
  expect(await readout(page, "Left / right (X)")).not.toBe(xBefore);
  const camAfterDrag = await framing(page);
  expect(camAfterDrag.yaw).toBeCloseTo(camBefore.yaw, 4);
  expect(camAfterDrag.pitch).toBeCloseTo(camBefore.pitch, 4);
  // empty background: the camera orbits and the ghost stays
  const xAfter = await readout(page, "Left / right (X)");
  await page.mouse.move(box.x + 40, box.y + box.height - 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + box.height - 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await readout(page, "Left / right (X)")).toBe(xAfter);
  const camOrbit = await framing(page);
  expect(Math.abs(camOrbit.yaw - camAfterDrag.yaw) + Math.abs(camOrbit.pitch - camAfterDrag.pitch)).toBeGreaterThan(0.01);
});

// The course's phone marking viewport: Chrome DevTools' iPhone preset, 390×844.
test.describe("phone with touch (390×844 marking viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  test("layout keeps the scene large, separates Observe/Adjust, and places with buttons", async ({ page }) => {
    await probe(page);
    await register(page, "Phone");
    await createWork(page, "Phone work");
    await page.getByRole("button", { name: "Skip" }).tap();
    await expect(page.getByRole("radio", { name: "Observe" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Add a stick" }).tap();
    await page.getByRole("radio", { name: "Adjust" }).tap();
    await expect(page.getByRole("radio", { name: "Adjust" })).toHaveAttribute("aria-checked", "true");
    const stage = (await page.locator(".ws-stage").boundingBox())!;
    expect(stage.height).toBeGreaterThanOrEqual(844 * 0.55 - 1);
    // main touch targets are at least 44 CSS px
    for (const name of ["Add a stick", "Place", "Cancel"]) {
      const b = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(Math.min(b.width, b.height), name).toBeGreaterThanOrEqual(44);
    }
    const inc = (await page.getByRole("button", { name: "Height increase" }).boundingBox())!;
    expect(Math.min(inc.width, inc.height)).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Height increase" }).tap();
    await page.screenshot({ path: "docs/evidence/p5-phone-390x844.png", fullPage: true });
    await page.getByRole("button", { name: "Place", exact: true }).tap();
    await expect(page.locator(".toast-ok").last()).toContainText("Placed and saved.");
    // no horizontal page scroll at phone width
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// The course's desktop marking viewport.
test.describe("desktop (1920×1080 marking viewport)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test("resizing while holding a ghost keeps the ghost and the view; reduced motion is instant", async ({ page }) => {
    await probe(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await register(page, "Wide");
    await createWork(page, "Wide work");
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: "Add a stick" }).click();
    await page.locator("body").press("PageUp");
    const height = await readout(page, "Height");
    await page.screenshot({ path: "docs/evidence/p5-desktop-1920x1080.png" });
    const f0 = await framing(page);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.waitForTimeout(400);
    expect(await readout(page, "Height")).toBe(height);
    const f1 = await framing(page);
    for (const k of ["yaw", "pitch", "distance", "targetY"]) expect(f1[k]).toBeCloseTo(f0[k], 4);
    // with reduced motion a view change lands immediately, no eased transition
    await page.getByRole("button", { name: "Top" }).click();
    const top = await framing(page);
    expect(top.pitch).toBeLessThan(0.1);
  });
});

test("slow connection: the workshop loads, says it's waiting, and the placement lands once", async ({ page, context }) => {
  await probe(page);
  await register(page, "Slow");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  // a poor mobile link for everything that follows: 600 ms latency, ~400 kbit/s
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 600, downloadThroughput: 50_000, uploadThroughput: 50_000 });
  await page.goto("/works/");
  await page.getByLabel("New work name").fill("Slow work");
  await page.getByRole("button", { name: "Create work" }).click();
  await expect(page.locator(".conn-open")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Skip" }).click();
  // record every status the ghost shows, however briefly
  await page.evaluate(() => {
    const seen: string[] = ((window as any).__seen = []);
    new MutationObserver(() => {
      const t = document.querySelector(".draft-state")?.textContent;
      if (t && seen[seen.length - 1] !== t) seen.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole("button", { name: "Add a stick" }).click();
  const place = page.getByRole("button", { name: "Place", exact: true });
  await place.click();
  await place.click({ force: true, timeout: 1000 }).catch(() => undefined); // an impatient second click
  await expect(page.locator(".toast-ok").last()).toContainText("Placed and saved.", { timeout: 20_000 });
  const seen: string[] = await page.evaluate(() => (window as any).__seen);
  expect(seen.some((t) => t.includes("Waiting for server"))).toBe(true);
  await expect.poll(() => sticks(page)).toBe(1); // exactly one, despite the second click
});
