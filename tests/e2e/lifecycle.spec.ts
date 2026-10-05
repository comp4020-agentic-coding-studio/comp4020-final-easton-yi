// SAVE-10..SAVE-12 and AT-17..AT-19 in the browser: two accounts build
// together, publish, the owner moves the work to the trash while the editor
// is connected, restores it, then trashes and permanently deletes it.
import { expect, test } from "@playwright/test";
import { createWork, placeViaControls, register } from "./helpers.ts";

test("trash while a collaborator is connected, restore, then delete permanently", async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const c of [ctxA, ctxB]) await c.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const title = `Disposable ${Date.now()}`;

  await register(a, "Owner Ada");
  const workId = await createWork(a, title);
  await a.getByRole("button", { name: "Skip" }).click();
  await a.getByRole("button", { name: "People" }).click();
  await a.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await a.getByLabel("Send this link to a friend (shown once):").inputValue();
  await a.getByRole("button", { name: "Close panel" }).click();

  // the invitation explains the owner's authority before joining
  await register(b, "Editor Bo");
  await b.goto(link);
  await expect(b.getByText("Owner Ada owns this work.")).toBeVisible();
  await expect(b.getByText(/delete it permanently, which removes it for every collaborator/)).toBeVisible();
  await b.getByRole("button", { name: "Join as Editor Bo" }).click();
  await b.waitForURL(new RegExp(`/works/${workId}/`));
  await expect(b.locator(".conn-open")).toBeVisible();

  // build together and publish
  await placeViaControls(a);
  await placeViaControls(b, async () => {
    for (let i = 0; i < 30; i++) await b.getByRole("button", { name: "Back / front (Z) increase" }).click();
  });
  await expect.poll(() => a.evaluate(() => (window as any).__stillwood.sticks())).toBe(2);
  await expect(a.locator(".save-saved")).toBeVisible({ timeout: 20_000 });
  await a.getByRole("button", { name: "Versions" }).click();
  await a.getByLabel("Save the current structure as a version").fill("Pair");
  await a.getByRole("button", { name: "Save version" }).click();
  await a.getByRole("button", { name: "Exhibit…" }).click();
  await a.getByLabel("Title").fill(`${title} exhibit`);
  await a.getByRole("button", { name: "Publish" }).click();
  await expect(a.locator(".toast-ok").last()).toContainText("Published");
  await a.getByRole("button", { name: "Close panel" }).click();
  const exhibitId = await a.evaluate(async (w) => (await (await fetch(`/api/works/${w}/exhibits`)).json()).exhibits[0].id, workId);
  await b.goto(`/exhibits/${exhibitId}/`);
  await b.getByRole("button", { name: "☆ Add to favorites" }).click();
  await expect(b.getByRole("button", { name: "★ In your favorites" })).toBeVisible();
  await b.goto(`/works/${workId}/`);
  await expect(b.locator(".conn-open")).toBeVisible();
  await b.getByRole("button", { name: "Add a stick" }).click(); // B holds a draft when the trash happens

  // help explains the lifecycle
  await b.getByRole("button", { name: "Help" }).click();
  await b.getByText("Archive, trash and deleting a work").click();
  await expect(b.getByText(/Withdrawn exhibits still count toward the 30-exhibit limit/)).toBeVisible();
  await b.getByRole("button", { name: /Skip|Done/ }).click();

  // members see who decides what
  await b.getByRole("button", { name: "Work" }).click();
  await expect(b.getByText(/The owner has final say over this work/)).toBeVisible();
  await b.getByRole("button", { name: "Close panel" }).click();

  // the owner moves it to the trash from the workshop, with real counts
  await a.getByRole("button", { name: "Work" }).click();
  await a.getByRole("button", { name: "Move to trash…" }).click();
  const dialog = a.getByRole("dialog");
  await expect(dialog).toContainText("1 collaborator will lose access");
  await expect(dialog).toContainText("1 public exhibit will be withdrawn");
  await expect(dialog).toContainText("stays recoverable");
  await dialog.getByRole("button", { name: "Move to trash" }).click();
  await expect(a.getByText("You moved this work to the trash.")).toBeVisible();
  await expect(a.getByRole("link", { name: "Go to Trash" })).toBeVisible();

  // the connected editor is told, loses the draft and can't place
  await expect(b.getByText(/The owner moved this work to the trash/)).toBeVisible();
  await expect(b.getByRole("link", { name: "Back to my works" })).toBeVisible();
  await expect(b.locator(".ws-status")).toContainText("Not connected");
  await expect(b.locator(".ws-status")).not.toContainText("Connected");
  await expect(b.getByRole("button", { name: "Add a stick" })).toBeDisabled();
  await expect(b.locator(".draft-state")).toHaveCount(0);
  await b.screenshot({ path: "docs/evidence/lifecycle-editor-trashed.png" });
  await b.reload();
  await expect(b.getByRole("heading", { name: "Can't open this work" })).toBeVisible();
  await expect(b.getByText(/moved this work to the trash/)).toBeVisible();

  // public gallery and favorites reflect the withdrawal
  const visitor = await browser.newPage();
  await visitor.goto(`/exhibits/${exhibitId}/`);
  await expect(visitor.getByRole("heading", { name: "Withdrawn" })).toBeVisible();
  await visitor.goto("/");
  await expect(visitor.getByRole("link", { name: `${title} exhibit` })).toHaveCount(0);
  await b.goto("/favorites/");
  await expect(b.locator(".card.withdrawn")).toContainText("Withdrawn");
  await expect(b.locator(".card.withdrawn")).not.toContainText(title);
  await b.goto("/works/");
  await expect(b.getByRole("link", { name: title })).toHaveCount(0);

  // restore from the owner's Trash
  await a.getByRole("link", { name: "Go to Trash" }).click();
  await expect(a.getByRole("heading", { name: "Trash" })).toBeVisible();
  await a.screenshot({ path: "docs/evidence/lifecycle-trash.png" });
  await a.locator(".work-list li", { hasText: title }).getByRole("button", { name: "Restore work" }).click();
  await expect(a.getByText(/Restored “.*”\. Its exhibits stay withdrawn/)).toBeVisible();
  await a.getByRole("button", { name: "Works", exact: true }).click();
  await a.getByRole("link", { name: title }).click();
  await expect(a.locator(".conn-open")).toBeVisible();
  await expect.poll(() => a.evaluate(() => (window as any).__stillwood.sticks())).toBe(2);
  await visitor.goto(`/exhibits/${exhibitId}/`);
  await expect(visitor.getByRole("heading", { name: "Withdrawn" })).toBeVisible();

  // trash again from My works, then delete permanently with the exact title
  await a.goto("/works/");
  await a.locator(".work-list li", { hasText: title }).getByRole("button", { name: "Move to trash…" }).click();
  await a.getByRole("dialog").getByRole("button", { name: "Move to trash" }).click();
  await expect(a.getByText(/Moved “.*” to the trash/)).toBeVisible();

  // the editor sees only a status in their own list, and leaves
  await b.goto("/works/");
  const gone = b.locator("section", { has: b.getByRole("heading", { name: "Unavailable collaborations" }) });
  await expect(gone.locator("li", { hasText: title })).toContainText("in the owner's trash");
  await gone.locator("li", { hasText: title }).getByRole("button", { name: "Leave this collaboration…" }).click();
  await b.getByRole("dialog").getByRole("button", { name: "Leave", exact: true }).click();
  await expect(b.getByText(/You left “.*”\. If its owner restores it, you won't be a member\./)).toBeVisible();
  await expect(b.getByRole("heading", { name: "Unavailable collaborations" })).toHaveCount(0);
  await b.screenshot({ path: "docs/evidence/lifecycle-editor-left.png" });
  await a.getByRole("button", { name: /^Trash/ }).click();
  await a.locator(".work-list li", { hasText: title }).getByRole("button", { name: "Delete permanently…" }).click();
  const purge = a.getByRole("dialog");
  await expect(purge).toContainText("1 saved version");
  await expect(purge).toContainText("only you"); // the editor left, so no collaborators are affected
  await expect(purge).toContainText("can't be restored from the trash");
  const confirm = purge.getByRole("button", { name: "Delete permanently" });
  await purge.getByLabel(/Type the title/).fill(title.toLowerCase());
  await expect(confirm).toBeDisabled();
  await purge.getByLabel(/Type the title/).fill(title);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(a.getByText(/Deleted “.*” permanently\./)).toBeVisible();
  await expect(a.getByText("Your trash is empty.")).toBeVisible();

  // the editor's favorite is now an unavailable placeholder they can remove
  await b.goto("/favorites/");
  await expect(b.locator(".card.withdrawn")).toContainText("No longer available");
  await b.getByRole("button", { name: "Remove from favorites" }).click();
  await expect(b.getByText("No favorites yet.")).toBeVisible();
  await visitor.goto(`/exhibits/${exhibitId}/`);
  await expect(visitor.getByRole("heading", { name: "No such exhibit" })).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});
