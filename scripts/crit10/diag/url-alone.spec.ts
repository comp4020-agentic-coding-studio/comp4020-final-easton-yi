// Crit 10 C10-10/C10-11: two people get in from the URL alone. Two browser
// contexts with no shared cookies or storage, no test hooks and no
// `stillwood.test` flag: each starts at `/`, and only links and buttons on the
// page lead on. Run against a production build (APP_URL), never against Fly:
//   APP_URL=http://localhost:18080 npx playwright test -c scripts/crit10/diag/playwright.config.ts url-alone
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const OUT = process.env.C10_SHOTS ?? "/tmp/c10-shots";
const base = new URL(process.env.APP_URL ?? "http://localhost:18080");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error(`refusing a non-local APP_URL: ${base.origin}`);
const h = (): string => `u_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

test("two people, own profiles, from the URL alone", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // A: landing → "Start building" → register → works → create
  await a.goto("/");
  await a.getByRole("link", { name: "Start building" }).click();
  await a.getByLabel("Handle").fill(h());
  await a.getByLabel("Display name").fill("Ada");
  await a.getByLabel("Password").fill("correct horse battery");
  await a.getByRole("button", { name: "Create an account" }).click();
  await a.getByLabel("I've stored this code somewhere safe").check();
  await a.getByRole("button", { name: "Continue" }).click();
  await a.getByLabel("New work name").fill("From the URL");
  await a.getByRole("button", { name: "Create work" }).click();
  await a.waitForURL(/\/works\/[0-9a-f-]{36}\//);
  await expect(a.locator(".conn-open")).toBeVisible();
  await a.getByRole("button", { name: "Skip" }).click();
  await a.getByRole("button", { name: "People" }).click();
  await a.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await a.getByLabel("Send this link to a friend (shown once):").inputValue();
  expect(new URL(link).origin).toBe(base.origin);
  await a.getByRole("button", { name: "Close panel" }).click();

  // B: no cookies of A's; arrives at the link, registers from it, comes back, confirms
  expect(await ctxB.cookies()).toEqual([]);
  await b.goto(link);
  await expect(b.getByText("Ada invited you to build")).toBeVisible();
  await b.screenshot({ path: `${OUT}/invite-landing.png` });
  await b.getByRole("link", { name: "Create an account" }).click();
  await b.getByLabel("Handle").fill(h());
  await b.getByLabel("Display name").fill("Bo");
  await b.getByLabel("Password").fill("correct horse battery");
  await b.getByRole("button", { name: "Create an account" }).click();
  await b.getByLabel("I've stored this code somewhere safe").check();
  await b.getByRole("button", { name: "Continue" }).click();
  await b.getByRole("button", { name: "Join as Bo" }).click();
  await b.waitForURL(/\/works\/[0-9a-f-]{36}\//);
  await expect(b.locator(".conn-open")).toBeVisible();
  await expect(a.locator(".presence")).toContainText("Bo");
  const skip = b.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  // the two sessions are different people to the server
  const who = async (p: typeof a) => p.evaluate(async () => (await (await fetch("/api/session")).json()).user.id);
  const [idA, idB] = [await who(a), await who(b)];
  expect(idA).not.toBe(idB);

  // B places; A, touching nothing after opening its stick list, sees Bo's stick arrive
  await a.getByRole("button", { name: "Sticks" }).click();
  await expect(a.getByText("placed by Bo")).toHaveCount(0);
  await b.getByRole("button", { name: "Add a stick" }).click();
  await b.getByRole("button", { name: "Place", exact: true }).click();
  const placedAt = Date.now();
  await expect(b.locator(".toast-ok").last()).toContainText("Placed and saved.");
  await expect(a.getByText("placed by Bo")).toHaveCount(1, { timeout: 2000 });
  const seenMs = Date.now() - placedAt;
  await a.screenshot({ path: `${OUT}/owner-sees-partner.png` });
  test.info().annotations.push({ type: "ids", description: JSON.stringify({ idA, idB, clickToVisibleInOtherProfileMs: seenMs }) });
  await ctxA.close();
  await ctxB.close();
});
