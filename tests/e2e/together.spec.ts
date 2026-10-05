// AT-03, AT-05, AT-07 (browser part), SYNC-01/05, CAM-01: two independent
// authenticated browser contexts, joined through the real invitation flow.
import { expect, test, type Page } from "@playwright/test";
import { createWork, register } from "./helpers.ts";

const framing = (p: Page) => p.evaluate(() => (window as any).__stillwood.framing());

test("two people build together: ghosts, concurrent placement, own cameras, reconnect", async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const c of [ctxA, ctxB]) await c.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await register(a, "Avery");
  const workId = await createWork(a, "Two-person bridge");
  await a.getByRole("button", { name: "Skip" }).click();
  await a.getByRole("button", { name: "People" }).click();
  await a.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await a.getByLabel("Send this link to a friend (shown once):").inputValue();
  expect(link).toContain("/join/#token=");
  await a.getByRole("button", { name: "Close panel" }).click();

  // B arrives through the link without an account: register, come back, confirm
  await b.goto(link);
  await expect(b.getByText("Avery invited you to build")).toBeVisible();
  await b.getByRole("link", { name: "Create an account" }).click();
  await register(b, "Blake", "/join/" + new URL(link).hash);
  await b.getByRole("button", { name: "Join as Blake" }).click();
  await b.waitForURL(new RegExp(`/works/${workId}/`));
  await expect(b.locator(".conn-open")).toBeVisible();
  await expect(a.locator(".presence")).toContainText("Blake");

  // B looks from the top; A's later actions must not move B's camera
  await b.getByRole("button", { name: "Top" }).click();
  await b.waitForTimeout(700);
  const bView = await framing(b);

  // both hold ghosts; each sees the other's named ghost
  await a.getByRole("button", { name: "Add a stick" }).click();
  await b.getByRole("button", { name: "Add a stick" }).click();
  for (let i = 0; i < 70; i++) await b.getByRole("button", { name: "Back / front (Z) increase" }).click();
  await expect(b.locator(".ghost-label")).toContainText("Avery");
  await expect(a.locator(".ghost-label")).toContainText("Blake");
  await a.screenshot({ path: "docs/evidence/p3-partner-ghost.png" });

  // place at (nearly) the same moment
  await Promise.all([
    a.getByRole("button", { name: "Place", exact: true }).click(),
    b.getByRole("button", { name: "Place", exact: true }).click(),
  ]);
  await expect(a.locator(".toast-ok").last()).toContainText("Placed and saved.");
  await expect(b.locator(".toast-ok").last()).toContainText("Placed and saved.");
  for (const p of [a, b]) {
    await expect.poll(() => p.evaluate(() => (window as any).__stillwood.sticks())).toBe(2);
  }
  const bAfter = await framing(b);
  for (const k of ["yaw", "pitch", "distance", "targetY"]) expect(bAfter[k]).toBeCloseTo(bView[k], 4);

  // B goes offline holding a ghost: it can still adjust; placing waits
  await b.getByRole("button", { name: "Add a stick" }).click();
  await ctxB.setOffline(true);
  await expect(b.locator(".conn-reconnecting")).toBeVisible({ timeout: 20_000 });
  await expect(b.getByRole("button", { name: "Place", exact: true })).toBeDisabled();
  await b.getByRole("button", { name: "Height increase" }).click(); // the local draft stays adjustable
  await ctxB.setOffline(false);
  await expect(b.locator(".conn-open")).toBeVisible({ timeout: 30_000 });
  await expect(b.locator(".draft-state")).toBeVisible(); // the draft survived and wasn't auto-placed
  await expect.poll(() => b.evaluate(() => (window as any).__stillwood.sticks())).toBe(2);
  await b.getByRole("button", { name: "Place", exact: true }).click();
  await expect(b.locator(".toast-ok").last()).toContainText("Placed and saved.");
  await expect.poll(() => a.evaluate(() => (window as any).__stillwood.sticks())).toBe(3);
  await b.screenshot({ path: "docs/evidence/p3-after-reconnect.png" });
  await ctxA.close();
  await ctxB.close();
});
