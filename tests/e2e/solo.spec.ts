// AT-01 in a real browser: a new user registers, creates a work, places
// sticks through the controls, and finds them after refresh and re-login.
import { expect, test } from "@playwright/test";
import { createWork, PASSWORD, placeViaControls, register } from "./helpers.ts";

test("new user creates a work, places sticks, and they survive refresh and logout", async ({ page }) => {
  const h = await register(page, "Solo Builder");
  await createWork(page, "First bridge");
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.screenshot({ path: "docs/evidence/p1-empty-work.png" });

  await placeViaControls(page);
  await placeViaControls(page, async () => {
    for (let i = 0; i < 60; i++) await page.getByRole("button", { name: "Left / right (X) increase" }).click();
    await page.getByLabel("End A").check();
    await page.getByRole("button", { name: "Vertical" }).click();
    await page.getByRole("button", { name: "Snap to support" }).click();
  });
  await expect(page.locator(".save-saved")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "docs/evidence/p1-two-sticks.png" });

  await page.reload();
  await page.getByRole("button", { name: "Sticks" }).click();
  await expect(page.getByRole("heading", { name: "Sticks (2)" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login/?next=/works/");
  await page.getByLabel("Handle").fill(h);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "First bridge" }).click();
  await page.getByRole("button", { name: "Sticks" }).click();
  await expect(page.getByRole("heading", { name: "Sticks (2)" })).toBeVisible();
});
