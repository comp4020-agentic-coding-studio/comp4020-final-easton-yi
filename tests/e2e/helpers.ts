import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const handle = (): string => `e2e_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
export const PASSWORD = "correct horse battery";

/** Register through the real form and acknowledge the recovery code. */
export async function register(page: Page, name: string, next = "/works/"): Promise<string> {
  const h = handle();
  await page.goto(`/register/?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Handle").fill(h);
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Your recovery code" })).toBeVisible();
  await page.getByLabel("I've stored this code somewhere safe").check();
  await page.getByRole("button", { name: "Continue" }).click();
  return h;
}

export async function createWork(page: Page, title: string): Promise<string> {
  await page.goto("/works/");
  await page.getByLabel("New work name").fill(title);
  await page.getByRole("button", { name: "Create work" }).click();
  await page.waitForURL(/\/works\/[0-9a-f-]{36}\//);
  await expect(page.locator(".conn-open")).toBeVisible();
  return page.url().match(/works\/([0-9a-f-]{36})/)![1]!;
}

/** Add a stick with the rail, optionally adjust via DOM controls, place it and wait for the server. */
export async function placeViaControls(page: Page, adjust?: () => Promise<void>): Promise<void> {
  await page.getByRole("button", { name: "Add a stick" }).click();
  await expect(page.locator(".draft-state")).toBeVisible();
  if (adjust) await adjust();
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(page.locator(".toast-ok").filter({ hasText: "Placed and saved." }).last()).toBeVisible();
}
