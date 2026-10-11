# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crit9-multiplayer.spec.ts >> Crit 9 local multiplayer (browser) >> L03 a visitor sees the frozen exhibit, gets no editing, and sees the withdrawal on reload
- Location: tests/e2e/crit9-multiplayer.spec.ts:483:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Exhibit…' }).first()
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Exhibit…' }).first() with timeout 60000ms
  - waiting for getByRole('button', { name: 'Exhibit…' }).first()

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - link "Stillwood":
    - /url: /
  - navigation "Main":
    - link "Exhibition":
      - /url: /
    - link "My works":
      - /url: /works/
    - link "Favorites":
      - /url: /favorites/
    - link "About":
      - /url: /readme/
    - link "c9 9-run4 A":
      - /url: /account/
    - button "Sign out"
- status
- main "Workshop":
  - heading "c9 9-run4 W" [level=1]
  - status: ↻Placement saved; structure moving Stable structure height 8.9 u · Measuring… best 8.9 u Connected
  - list "People here":
    - listitem: c9 9-run4 C , editing
    - listitem: c9 9-run4 A (you) , editing
    - listitem: c9 9-run4 B , editing
  - navigation "Work tools":
    - button "Sticks"
    - button "Versions" [expanded]
    - button "People"
    - button "Push"
    - button "Work"
    - button "Help"
    - button "Sound on"
  - complementary "Stick actions":
    - button "Add a stick": Add
  - toolbar "View":
    - button "Default"
    - button "Top"
    - button "Side"
    - button "Fit all"
    - button "Zoom in": Zoom +
    - button "Zoom out": Zoom −
    - button "Raise view target": Look higher
    - button "Lower view target": Look lower
    - button "Graphics"
  - region "Panel":
    - button "Close panel": ×
    - heading "Versions" [level=2]
    - text: Save the current structure as a version
    - textbox "Save the current structure as a version": c9 9-run4 v
    - paragraph:
      - text: Waiting for the structure to settle…
      - button "Cancel"
    - paragraph: 0 of 30 versions used.
    - paragraph: No saved versions yet.
    - list
    - heading "Exhibits" [level=3]
    - paragraph: Nothing exhibited from this work yet. Exhibits are frozen copies of a saved version; building on doesn't change them.
    - list
```

# Test source

```ts
  389 |     observations.M08_diagnostics = { closedOpenSockets: closed, statusTrace: trace };
  390 |     await expect(B.locator(".conn-reconnecting")).toBeVisible({ timeout: 5000 });
  391 |     await B.waitForTimeout(2500); // reconnect attempts fail while offline
  392 |     await expect(B.locator(".conn-reconnecting")).toBeVisible();
  393 |     const banner = await B.locator(".stage-banner").innerText();
  394 |     const placeDisabled = await B.getByRole("button", { name: "Place", exact: true }).isDisabled();
  395 |     const socketsDuring = (await (await A.request.get("/readyz")).json()).sockets;
  396 |     const made: string[] = [];
  397 |     for (let i = 0; i < 3; i++) made.push((await placeVia(A)).id!);
  398 |     await ctx.B.setOffline(false);
  399 |     await expect(B.locator(".conn-open")).toBeVisible({ timeout: 15_000 });
  400 |     await until(async () => made.every((id) => id) && (await ids(B)).length === (await serverIds(A)).length, 5000);
  401 |     expect(await ids(B)).toEqual(await serverIds(A));
  402 |     await expect(B.locator(".draft-state")).toBeVisible(); // the unplaced stick survived
  403 |     await B.waitForTimeout(300);
  404 |     const draftAfter = await B.locator(".draft-state").innerText();
  405 |     const canPlaceAfter = await B.getByRole("button", { name: "Place", exact: true }).isEnabled();
  406 |     let draftOutcome: string;
  407 |     if (canPlaceAfter) {
  408 |       await B.getByRole("button", { name: "Place", exact: true }).click();
  409 |       await expect(B.locator(".draft-state")).toHaveCount(0, { timeout: 5000 });
  410 |       draftOutcome = "placed";
  411 |     } else {
  412 |       // ghosts reserve no space (ADR-0006): A's sticks may now occupy it
  413 |       draftOutcome = `refused locally: ${draftAfter.split("\n")[0]}`;
  414 |       await B.keyboard.press("Escape");
  415 |     }
  416 |     // three more quick cycles
  417 |     for (let i = 0; i < 3; i++) {
  418 |       await ctx.B.setOffline(true);
  419 |       await B.evaluate(() => (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1).forEach((s: WebSocket) => s.close()));
  420 |       await expect(B.locator(".conn-reconnecting")).toBeVisible({ timeout: 5000 });
  421 |       await ctx.B.setOffline(false);
  422 |       await expect(B.locator(".conn-open")).toBeVisible({ timeout: 15_000 });
  423 |     }
  424 |     await B.waitForTimeout(500);
  425 |     const bOpen = await B.evaluate(() => (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1).length);
  426 |     const socketsAfter = (await (await A.request.get("/readyz")).json()).sockets;
  427 |     const members = (await api(A, "GET", `/api/works/${workId}`)).body.members.length;
  428 |     const presenceB = await A.locator("ul.presence li", { hasText: label("B") }).count();
  429 |     const bIds = await ids(B);
  430 |     expect(bIds).toEqual(await serverIds(A));
  431 |     expect(new Set(bIds).size).toBe(bIds.length);
  432 |     expect([bOpen, socketsAfter, members, presenceB]).toEqual([1, socketsBefore, 3, 1]);
  433 |     observations.M08 = { socketsClosedInB: closed, statusWhileOffline: "Reconnecting…", bannerWhileOffline: banner, placeDisabledWhileOffline: placeDisabled, serverSockets: { before: socketsBefore, during: socketsDuring, after: socketsAfter }, editsByAWhileBOffline: made.length, bMatchesServerAfter: true, draftKeptAfterReconnect: true, draftAfterReconnect: draftOutcome, extraCycles: 3, bOpenSockets: bOpen, members, bPresenceEntries: presenceB };
  434 |   });
  435 | 
  436 |   test("M09 a hidden tab draws nothing, then shows the latest state on return without interaction (simulated visibility)", async () => {
  437 |     const cycle = async (): Promise<Record<string, unknown>> => {
  438 |       await B.evaluate(() => (window as any).__setHidden(true));
  439 |       const r0 = await B.evaluate(() => (window as any).__stillwood.stats().renders);
  440 |       const made = [(await placeVia(A)).id!, (await placeVia(A)).id!];
  441 |       const received = await until(() => B.evaluate((xs) => xs.every((x: string) => (window as any).__c9.received[x]), made), 5000);
  442 |       const r1 = await B.evaluate(() => (window as any).__stillwood.stats().renders);
  443 |       const renderedWhileHidden = await B.evaluate((xs) => xs.filter((x: string) => (window as any).__c9.rendered[x]).length, made);
  444 |       const t0 = now();
  445 |       await B.evaluate(() => (window as any).__setHidden(false));
  446 |       const shown = await until(() => B.evaluate((xs) => xs.every((x: string) => (window as any).__c9.rendered[x]), made), 5000);
  447 |       const wakeMs = now() - t0;
  448 |       expect([!!received, r1 - r0, renderedWhileHidden, !!shown]).toEqual([true, 0, 0, true]);
  449 |       return { stateReceivedWhileHidden: true, rendersWhileHidden: r1 - r0, renderedOnReturn: true, returnToRenderedMs: Math.round(wakeMs) };
  450 |     };
  451 |     const auto = await cycle();
  452 |     await B.evaluate(() => localStorage.setItem("stillwood.graphicsQuality.v1", "low"));
  453 |     await B.reload();
  454 |     await expect(B.locator(".conn-open")).toBeVisible();
  455 |     await skipIntro(B);
  456 |     const tier = await B.evaluate(() => (window as any).__stillwood.stats().tier);
  457 |     const low = await cycle();
  458 |     await B.evaluate(() => localStorage.removeItem("stillwood.graphicsQuality.v1"));
  459 |     observations.M09 = { method: "document.hidden + visibilitychange overridden in the page (real tab hiding unavailable headless)", auto, low: { tier, ...low } };
  460 |   });
  461 | 
  462 |   test("M10 a window on another work sees nothing from this one", async () => {
  463 |     const x = await api(B, "POST", "/api/works", { title: label("X") });
  464 |     const bx = await ctx.B.newPage();
  465 |     await bx.goto(`/works/${x.body.id}/`);
  466 |     await expect(bx.locator(".conn-open")).toBeVisible();
  467 |     await skipIntro(bx);
  468 |     await bx.getByRole("button", { name: "Sticks" }).click();
  469 |     if (!(await B.getByRole("heading", { name: /^Sticks \(/ }).isVisible())) await B.getByRole("button", { name: "Sticks" }).click(); // M09 reloaded B
  470 |     await A.getByRole("button", { name: "Add a stick" }).click();
  471 |     await expect(B.getByText(`${label("A")} (ghosts aren't real sticks yet)`, { exact: false })).toBeVisible({ timeout: 3000 });
  472 |     await A.keyboard.press("Escape");
  473 |     const placed = (await placeVia(A)).id!;
  474 |     await until(async () => (await ids(B)).includes(placed), 3000);
  475 |     const leaked = await bx.evaluate((id) => Object.keys((window as any).__c9.received).includes(id), placed);
  476 |     const xSticks = await ids(bx);
  477 |     const ghostLine = await bx.getByText("ghosts aren't real sticks yet", { exact: false }).count();
  478 |     expect([leaked, xSticks, ghostLine]).toEqual([false, [], 0]);
  479 |     await bx.close();
  480 |     observations.M10 = { otherWorkReceivedThisStick: leaked, otherWorkSticks: xSticks.length, otherWorkGhosts: ghostLine };
  481 |   });
  482 | 
  483 |   test("L03 a visitor sees the frozen exhibit, gets no editing, and sees the withdrawal on reload", async () => {
  484 |     test.setTimeout(180_000);
  485 |     await A.getByRole("button", { name: "Versions" }).click();
  486 |     await A.getByLabel("Save the current structure as a version").fill(label("v"));
  487 |     // "Save version" when settled, "Save when settled" while the pile still moves; both are the product's real flow
  488 |     await A.getByRole("button", { name: /^Save (version|when settled)$/ }).click();
> 489 |     await expect(A.getByRole("button", { name: "Exhibit…" }).first()).toBeVisible({ timeout: 60_000 });
      |                                                                       ^ Error: expect(locator).toBeVisible() failed
  490 |     await A.getByRole("button", { name: "Exhibit…" }).first().click();
  491 |     await A.getByLabel("Title").fill(label("exhibit"));
  492 |     await A.getByRole("button", { name: "Publish" }).click();
  493 |     await expect(A.locator(".toast-ok").last()).toContainText("Published", { timeout: 20_000 });
  494 |     await A.getByRole("button", { name: "Close panel" }).click();
  495 |     const exhibitId = (await api(A, "GET", `/api/works/${workId}/exhibits`)).body.exhibits[0].id;
  496 |     const v = await ctx.V.newPage();
  497 |     await v.goto(`/exhibits/${exhibitId}/`);
  498 |     await expect(v.getByRole("heading", { name: label("exhibit") })).toBeVisible();
  499 |     await expect(v.getByRole("button", { name: "Add a stick" })).toHaveCount(0);
  500 |     const before = (await v.evaluate(async (id) => (await (await fetch(`/api/exhibits/${id}`)).json()).geometry.sticks.length, exhibitId)) as number;
  501 |     await placeVia(A);
  502 |     const after = (await v.evaluate(async (id) => (await (await fetch(`/api/exhibits/${id}`)).json()).geometry.sticks.length, exhibitId)) as number;
  503 |     expect(after).toBe(before);
  504 |     expect((await api(A, "POST", `/api/exhibits/${exhibitId}/withdraw`, { withdrawn: true })).status).toBe(200);
  505 |     await v.reload();
  506 |     await expect(v.getByRole("heading", { name: "Withdrawn" })).toBeVisible();
  507 |     observations.L03 = { visitorSawExhibit: true, editingControls: 0, exhibitSticksBefore: before, exhibitSticksAfterMoreBuilding: after, withdrawnOnReload: true };
  508 |   });
  509 | });
  510 | 
```