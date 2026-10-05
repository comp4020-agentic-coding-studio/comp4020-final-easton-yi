// AT-10 in the browser: save a settled version, exhibit it, see it in the
// gallery and the read-only 3D viewer, favorite it, withdraw it.
import { expect, test } from "@playwright/test";
import { createWork, placeViaControls, register } from "./helpers.ts";

test("publish, view, favorite and withdraw an exhibit", async ({ page, browser }) => {
  await register(page, "Curator");
  await createWork(page, "Exhibited bridge");
  await page.getByRole("button", { name: "Skip" }).click();
  await placeViaControls(page);
  await expect(page.locator(".save-saved")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Versions" }).click();
  await page.getByLabel("Save the current structure as a version").fill("Low beam");
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.locator(".versions").getByText("Low beam")).toBeVisible();
  await page.getByRole("button", { name: "Exhibit…" }).click();
  const title = `Low beam ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Short description (optional, plain text)").fill("<img src=x onerror=alert(1)> plain words");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".toast-ok").last()).toContainText("Published");

  // a visitor with no account
  const visitor = await browser.newPage();
  let dialogs = 0;
  visitor.on("dialog", (d) => (dialogs++, void d.dismiss()));
  await visitor.goto("/");
  await expect(visitor.getByRole("link", { name: title })).toBeVisible();
  await visitor.screenshot({ path: "docs/evidence/p4-gallery.png" });
  await visitor.getByRole("link", { name: title }).click();
  await expect(visitor.getByRole("heading", { name: title })).toBeVisible();
  await expect(visitor.getByText("<img src=x onerror=alert(1)> plain words")).toBeVisible(); // shown as text
  await expect(visitor.locator("canvas.scene-canvas")).toBeVisible();
  await visitor.waitForTimeout(800);
  await visitor.screenshot({ path: "docs/evidence/p4-exhibit.png" });
  expect(dialogs).toBe(0);
  await expect(visitor.getByText("to keep favorites.")).toBeVisible();

  // the curator favorites it, then withdraws it
  const exhibitUrl = visitor.url();
  await page.goto(exhibitUrl);
  await page.getByRole("button", { name: "☆ Add to favorites" }).click();
  await expect(page.getByRole("button", { name: "★ In your favorites" })).toBeVisible();
  await page.goBack();
  await page.getByRole("button", { name: "Versions" }).click();
  await page.locator(".versions li", { hasText: title }).getByRole("button", { name: "Withdraw" }).click();
  await expect(page.locator(".toast").last()).toContainText("withdrawn");
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "Withdrawn" })).toBeVisible();
  await page.goto("/favorites/");
  await expect(page.locator(".card.withdrawn")).toBeVisible();
  await page.getByRole("button", { name: "Remove from favorites" }).click();
  await expect(page.getByText("No favorites yet.")).toBeVisible();
});
