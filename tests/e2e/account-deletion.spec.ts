// ADR-0007 in the browser: the confirmation dialog, then deletion from the
// account page with two sessions of the owner and one collaborator open in
// separate browser contexts.
import { expect, test } from "@playwright/test";
import { PASSWORD, createWork, register } from "./helpers.ts";

test("confirmation dialog: cancel, keyboard, wrong password, one submission at a time, and a lost answer", async ({ page }) => {
  await register(page, "Careful Cy");
  await page.goto("/account/");
  // right after the recovery section, at the same heading level
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual(["Recovery code", "Delete account"]);
  const opener = page.getByRole("button", { name: "Delete account" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Permanently delete your account?" });
  await expect(dialog).toContainText("active, archived or in your trash");
  await expect(dialog).toContainText("saved versions and recovery points");
  await expect(dialog).toContainText("published or withdrawn");
  await expect(dialog).toContainText("Works you collaborate on but don't own stay with their owners");
  const pw = dialog.getByLabel("Current password");
  const confirm = dialog.getByRole("button", { name: "Permanently delete account" });
  await expect(pw).toBeFocused();
  await expect(confirm).toBeDisabled();
  await page.screenshot({ path: "docs/evidence/account-deletion-dialog.png" });

  // Escape cancels, clears the password and returns focus; Enter reopens
  await pw.fill("typed then abandoned");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(pw).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  // a wrong password: a readable error tied to the field, which is cleared and refocused
  await opener.click();
  await pw.fill("not my password at all");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText("That password isn't right, so nothing was deleted.");
  await expect(pw).toHaveValue("");
  await expect(pw).toHaveAttribute("aria-invalid", "true");
  await expect(pw).toHaveAttribute("aria-describedby", /delete-error/);
  await expect(pw).toBeFocused();

  // one request at a time, with progress; then the answer is lost on the way back
  let calls = 0;
  await page.route("**/api/account/delete", async (route) => {
    calls++;
    await new Promise((r) => setTimeout(r, 800));
    await route.abort("failed");
  });
  await pw.fill(PASSWORD);
  await confirm.click();
  const busy = dialog.getByRole("button", { name: "Deleting…" });
  await expect(busy).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await pw.press("Enter");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible(); // can't be dismissed mid-request
  await expect(dialog.getByRole("alert")).toContainText("We couldn't confirm what happened");
  await expect(dialog.getByRole("alert")).toContainText("may or may not have been deleted");
  expect(calls).toBe(1);
  await expect(pw).toHaveValue("");
  await page.unroute("**/api/account/delete");
  await dialog.getByRole("button", { name: "Check my account" }).click();
  await expect(dialog.getByText("Your account still exists, so nothing was deleted.")).toBeVisible();

  // the password went nowhere it could stay
  expect(page.url()).not.toContain(PASSWORD);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain(PASSWORD);
});

test("deleting from the account page: that session goes to the start page, the other session and the collaborator lose access", async ({ browser }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  const [a1, a2, b] = await Promise.all(contexts.map((c) => c.newPage()));
  const title = `Doomed ${Date.now()}`;

  const handle = await register(a1!, "Owner Oona");
  const workId = await createWork(a1!, title);
  await a1!.getByRole("button", { name: "Skip" }).click();
  await a1!.getByRole("button", { name: "People" }).click();
  await a1!.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await a1!.getByLabel("Send this link to a friend (shown once):").inputValue();

  await register(b!, "Editor Eli");
  await b!.goto(link);
  await b!.getByRole("button", { name: "Join as Editor Eli" }).click();
  await b!.waitForURL(new RegExp(`/works/${workId}/`));
  await expect(b!.locator(".conn-open")).toBeVisible();

  // the owner's second session, in another browser, also in the workshop
  await a2!.goto(`/login/?next=${encodeURIComponent(`/works/${workId}/`)}`);
  await a2!.getByLabel("Handle").fill(handle);
  await a2!.getByLabel("Password").fill(PASSWORD);
  await a2!.getByRole("button", { name: "Sign in" }).click();
  await a2!.waitForURL(new RegExp(`/works/${workId}/`));
  await expect(a2!.locator(".conn-open")).toBeVisible();

  await a1!.goto("/account/");
  await a1!.getByRole("button", { name: "Delete account" }).click();
  const dialog = a1!.getByRole("dialog");
  await dialog.getByLabel("Current password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Permanently delete account" }).click();

  // this session: the public start page, signed out, and the account page isn't one Back away
  await expect(a1!).toHaveURL(/\/$/);
  await expect(a1!.locator(".notice-region")).toHaveText("Your account and everything it owned have been deleted.");
  await expect(a1!.getByRole("link", { name: "Sign in" })).toBeVisible();
  await a1!.goBack();
  await expect(a1!).not.toHaveURL(/\/account\/$/);

  // the other session and the collaborator are moved on within seconds
  await expect(a2!).toHaveURL(/\/$/, { timeout: 5000 });
  await expect(a2!.locator(".notice-region")).toHaveText("This account was deleted, so you've been signed out.");
  await expect(b!).toHaveURL(/\/works\/$/, { timeout: 5000 });
  await expect(b!.locator(".notice-region")).toHaveText("This work was deleted, so it's no longer available.");
  await expect(b!.getByRole("link", { name: title })).toHaveCount(0);
  await b!.screenshot({ path: "docs/evidence/account-deletion-collaborator.png" });

  // refreshing brings nothing back
  for (const p of [a1!, a2!]) {
    await p.goto(`/works/${workId}/`);
    await expect(p.getByRole("heading", { name: "Sign in to open this work" })).toBeVisible();
  }
  await b!.reload();
  await expect(b!.getByRole("link", { name: title })).toHaveCount(0);
  await b!.goto(`/works/${workId}/`);
  await expect(b!.getByRole("heading", { name: "Can't open this work" })).toBeVisible();
  await a1!.goto("/login/");
  await a1!.getByLabel("Handle").fill(handle);
  await a1!.getByLabel("Password").fill(PASSWORD);
  await a1!.getByRole("button", { name: "Sign in" }).click();
  await expect(a1!.getByRole("alert")).toHaveText("That handle and password don't match.");
  for (const c of contexts) await c.close();
});
