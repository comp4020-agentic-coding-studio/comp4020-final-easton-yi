// The existing-feature protection matrix (docs/evidence/world/protection-matrix.md),
// checked through the real UI with the island on the home page: every control
// that existed at the baseline (b13ecae) keeps its label, order, destination
// and visibility, and is actually clickable — the topmost element at its own
// centre — with the world canvas behind it. The island's portal links reach
// the existing flows; old deep links are not redirected into the world.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createWork, register } from "./helpers.ts";

/** The element itself (or a descendant) is what a click at its centre lands on. */
async function clickable(l: Locator): Promise<boolean> {
  return l.evaluate((el) => {
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  });
}

/** Header links in document order: [label, href]. */
async function headerLinks(page: Page): Promise<[string, string][]> {
  return page.locator("header.site-header a, header.site-header button").evaluateAll((els) =>
    els.map((e) => [(e.textContent ?? "").trim(), e.getAttribute("href") ?? `button:${e.getAttribute("type")}`] as [string, string]),
  );
}

test.describe("protection matrix: home controls with the island behind them", () => {
  test("signed out: header, primary action, search and portals keep their labels, order, destinations and clickability", async ({ page }) => {
    await page.goto("/");
    // the world is visible without a gate, behind the page's controls
    await expect(page.locator(".world-stage canvas.world-canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeVisible();

    // header (baseline order and destinations; signed-out set)
    expect(await headerLinks(page)).toEqual([
      ["Stillwood", "/"],
      ["Exhibition", "/"],
      ["About", "/readme/"],
      ["Sign in", "/login/?next=%2F"],
    ]);
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    for (const name of ["Exhibition", "About", "Sign in"]) expect(await clickable(page.locator("header.site-header").getByRole("link", { name, exact: true })), name).toBe(true);

    // the gallery's primary action and hint (baseline: Start building → register, next=/works/?new=1)
    const start = page.getByRole("link", { name: "Start building" });
    await expect(start).toHaveAttribute("href", "/register/?next=%2Fworks%2F%3Fnew%3D1");
    expect(await clickable(start)).toBe(true);
    await expect(page.getByText("Create an account to save your work and come back to it.")).toBeVisible();

    // search (form, label, submit)
    await expect(page.getByLabel("Search exhibits by name")).toBeVisible();
    expect(await clickable(page.getByRole("button", { name: "Search" }))).toBe(true);
    await page.getByLabel("Search exhibits by name").fill("zz-nothing-matches");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No exhibits are named like “zz-nothing-matches”.")).toBeVisible();
    // the empty state's "Start a work" keeps its baseline destination
    await expect(page.getByRole("link", { name: "Start a work" })).toHaveAttribute("href", "/register/?next=%2Fworks%2F%3Fnew%3D1");

    // island portal links: DOM equivalents of the spatial portals, routed to existing flows
    const portals = page.getByRole("navigation", { name: "Island portals" });
    await expect(portals.getByRole("link")).toHaveText(["Explore the World", "My Works", "Build Together", "View player works"]);
    await expect(portals.getByRole("link", { name: "My Works" })).toHaveAttribute("href", "/works/");
    await expect(portals.getByRole("link", { name: "Build Together" })).toHaveAttribute("href", "/register/?next=%2Fworks%2F%3Fnew%3D1");
    for (const name of ["Explore the World", "My Works", "Build Together", "View player works"]) expect(await clickable(portals.getByRole("link", { name })), name).toBe(true);

    // Sign in still goes to the existing form with its return-to
    await page.locator("header.site-header").getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login\/\?next=%2F$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("signed in: header gains My works/Favorites/account/Sign out; primary action and portals go to the existing works flows", async ({ page }) => {
    await register(page, "Matrix");
    await page.goto("/");
    await expect(page.locator(".world-stage canvas.world-canvas")).toBeVisible();
    // baseline signed-in order: brand, Exhibition, My works, Favorites, About, <display name> → /account/, Sign out
    expect(await headerLinks(page)).toEqual([
      ["Stillwood", "/"],
      ["Exhibition", "/"],
      ["My works", "/works/"],
      ["Favorites", "/favorites/"],
      ["About", "/readme/"],
      ["Matrix", "/account/"],
      ["Sign out", "button:button"],
    ]);
    for (const name of ["Exhibition", "My works", "Favorites", "About"]) expect(await clickable(page.locator("header.site-header").getByRole("link", { name, exact: true })), name).toBe(true);
    expect(await clickable(page.locator("header.site-header").getByRole("button", { name: "Sign out" }))).toBe(true);

    const go = page.getByRole("link", { name: "Go to my works" });
    await expect(go).toHaveAttribute("href", "/works/");
    expect(await clickable(go)).toBe(true);

    const portals = page.getByRole("navigation", { name: "Island portals" });
    await expect(portals.getByRole("link", { name: "Build Together" })).toHaveAttribute("href", "/works/?new=1");
    // Build Together opens the existing create entry with its name field focused
    await portals.getByRole("link", { name: "Build Together" }).click();
    await expect(page).toHaveURL(/\/works\/\?new=1$/);
    await expect(page.getByLabel("New work name")).toBeFocused();
    // and the existing create flow still works from there
    await page.getByLabel("New work name").fill("From the island");
    await page.getByRole("button", { name: "Create work" }).click();
    await page.waitForURL(/\/works\/[0-9a-f-]{36}\//);
    await expect(page.locator(".conn-open")).toBeVisible();
  });

  test("deep links and pages are not redirected into the world; /readme/ stays readable", async ({ page }) => {
    await register(page, "Links");
    const workId = await createWork(page, "Deep link");
    // a workshop deep link opens the workshop (no island on it)
    await page.goto(`/works/${workId}/`);
    await expect(page.locator(".conn-open")).toBeVisible();
    await expect(page.locator(".world-stage")).toHaveCount(0);
    for (const path of ["/works/", "/favorites/", "/account/"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
      await expect(page.locator(".world-stage")).toHaveCount(0);
    }
    const res = await page.goto("/readme/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("Stillwood");
    // an unknown exhibit still gets the existing not-found handling, not the world
    await page.goto("/exhibits/00000000-0000-4000-8000-000000000000/");
    await expect(page.locator(".world-stage")).toHaveCount(0);
  });

  test("the world page is its own route and leaves the header usable", async ({ page }) => {
    await page.goto("/world/");
    await expect(page.locator(".world-stage canvas.world-canvas")).toBeVisible();
    for (const name of ["Exhibition", "About", "Sign in"]) expect(await clickable(page.locator("header.site-header").getByRole("link", { name, exact: true })), name).toBe(true);
    await page.locator("header.site-header").getByRole("link", { name: "Exhibition", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Exhibition" })).toBeVisible();
  });
});

test.describe("fallbacks: never a blank page", () => {
  test("without WebGL the island becomes a flat section with the existing links, and the gallery works", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/.test(type)) return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto("/");
    const flat = page.locator(".world-fallback");
    await expect(flat).toContainText("WebGL is unavailable");
    await expect(flat.getByRole("link", { name: "My Works" })).toHaveAttribute("href", "/login/?next=%2Fworks%2F");
    await expect(flat.getByRole("link", { name: "Build Together" })).toHaveAttribute("href", "/register/?next=%2Fworks%2F%3Fnew%3D1");
    await expect(page.locator("canvas.world-canvas")).toHaveCount(0);
    expect(await clickable(page.getByRole("link", { name: "Start building" }))).toBe(true);
    expect(await clickable(page.getByRole("button", { name: "Search" }))).toBe(true);
  });

  test("a failed island manifest shows an error with Try again; the page stays usable; retry recovers", async ({ page }) => {
    let fail = true;
    await page.route("**/world-data/manifest.json", (route) => (fail ? route.fulfill({ status: 503, body: "unavailable" }) : route.continue()));
    await page.goto("/");
    const err = page.locator(".world-error");
    await expect(err).toContainText("The island couldn't load");
    await expect(err).toContainText("The exhibition, your works and building together don't need the island.");
    expect(await clickable(page.getByRole("link", { name: "Start building" }))).toBe(true);
    expect(await clickable(page.locator("header.site-header").getByRole("link", { name: "Sign in" }))).toBe(true);
    fail = false;
    await err.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
    await expect(err).toHaveCount(0);
  });

  test("a failed landmark asset leaves the rest of the island and says so", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
    await page.route(/\/world-data\/landmarks\/L03\.far\.[0-9a-f]{8}\.bin/, (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/");
    await expect(page.getByText("Ridge Doric Temple couldn't load. The rest of the island is still here.")).toBeVisible({ timeout: 60_000 });
    const ready = await page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): { landmarksReady: string[] } } }).__stillwoodWorld.stats().landmarksReady);
    expect(ready).toHaveLength(19);
    expect(ready).not.toContain("L03");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled();
  });
});
