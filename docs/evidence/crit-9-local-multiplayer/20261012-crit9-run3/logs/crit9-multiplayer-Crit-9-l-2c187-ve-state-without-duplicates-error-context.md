# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crit9-multiplayer.spec.ts >> Crit 9 local multiplayer (browser) >> M08 B's socket really closes; A keeps building; B recovers the authoritative state without duplicates
- Location: tests/e2e/crit9-multiplayer.spec.ts:372:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.conn-reconnecting')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.conn-reconnecting') with timeout 5000ms
  - waiting for locator('.conn-reconnecting')

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
    - link "c9 9-run3 B":
      - /url: /account/
    - button "Sign out"
- status
- main "Workshop":
  - heading "c9 9-run3 W" [level=1]
  - status: ↻Placement saved; structure moving Stable structure height 7.0 u · Measuring… best 7.0 u Connected
  - list "People here":
    - listitem: c9 9-run3 C , editing
    - listitem: c9 9-run3 B (you) , editing
    - listitem: c9 9-run3 A , editing
  - navigation "Work tools":
    - button "Sticks"
    - button "Versions"
    - button "People"
    - button "Work"
    - button "Help"
    - button "Sound on"
  - complementary "Stick actions":
    - button "Add a stick" [disabled]: Add
    - button "Place"
    - button "Cancel"
  - status: Ready to place · drops 0.10 u onto the surface below
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
  - region "Adjust stick":
    - heading "Adjust stick" [level=2]
    - button "Hide" [expanded]
    - group "Turn around":
      - text: Turn around
      - radio "Centre" [checked]
      - text: Centre
      - radio "End A"
      - text: End A
      - radio "End B"
      - text: End B
    - group "Left / right (X)":
      - text: Left / right (X)
      - button "Left / right (X) decrease": −
      - status: 0.00u
      - button "Left / right (X) increase": +
    - group "Back / front (Z)":
      - text: Back / front (Z)
      - button "Back / front (Z) decrease": −
      - status: 0.00u
      - button "Back / front (Z) increase": +
    - group "Height":
      - text: Height
      - button "Height decrease": −
      - status: 8.53u
      - button "Height increase": +
    - group "Direction":
      - text: Direction
      - button "Direction decrease": −
      - status: "-45°"
      - button "Direction increase": +
    - group "Tilt":
      - text: Tilt
      - button "Tilt decrease": −
      - status: 0°
      - button "Tilt increase": +
    - group "Roll":
      - text: Roll
      - button "Roll decrease": −
      - status: 0°
      - button "Roll increase": +
    - button "Horizontal"
    - button "Vertical"
    - button "Snap to support"
    - checkbox "Fine steps"
    - text: Fine steps
    - checkbox "Angle snapping" [checked]
    - text: Angle snapping
    - button "Exact values"
    - paragraph: Drag the ghost's middle to slide it, the blue arrows to raise it, a green ball to swing that end around the other, and a brown cone to tilt it. Hold Shift with the keys for small steps.
```

# Test source

```ts
  282 |     const acceptedRows = samples.filter((x) => x.accepted);
  283 |     const mapped = acceptedRows.every((x) => x.serverAcceptedAt != null);
  284 |     const accepts = [...byCommand.values()].filter((e) => e.outcome === "accepted");
  285 |     // convergence: same IDs everywhere and on the server, no duplicates; transforms compared once settled
  286 |     const settleFrom = Date.now();
  287 |     const settled = await A.locator(".save-saved").waitFor({ timeout: 120_000 }).then(() => true, () => false);
  288 |     const settleMs = Date.now() - settleFrom;
  289 |     await A.waitForTimeout(600);
  290 |     const all = await Promise.all([A, B, C].map(poses));
  291 |     const server = (await api(A, "GET", `/api/works/${workId}/state`)).body;
  292 |     const sid = server.bodies.map((b: unknown[]) => b[0] as string).sort();
  293 |     for (const ps of all) {
  294 |       expect(ps.map((x) => x.id).sort()).toEqual(sid);
  295 |       expect(new Set(ps.map((x) => x.id)).size).toBe(ps.length);
  296 |     }
  297 |     let maxDelta: number | null = null;
  298 |     if (settled) {
  299 |       maxDelta = 0;
  300 |       for (const b of server.bodies as [string, number, number, number][]) {
  301 |         for (const ps of all) {
  302 |           const mine = ps.find((x) => x.id === b[0])!;
  303 |           maxDelta = Math.max(maxDelta, ...mine.p.map((v, k) => Math.abs(v - (b[k + 1] as number))));
  304 |         }
  305 |       }
  306 |       expect(maxDelta).toBeLessThan(1e-3);
  307 |     }
  308 |     mkdirSync(OUT, { recursive: true });
  309 |     const cols = ["n", "sender", "accepted", "commandId", "serverOutcome", "clickAt", "serverAcceptedAt", "A_received", "A_rendered", "B_received", "B_rendered", "C_received", "C_rendered"];
  310 |     writeFileSync(join(OUT, "timing-samples.csv"), [cols.join(","), ...samples.map((x) => cols.map((c) => (x[c] == null ? "" : typeof x[c] === "number" ? (x[c] as number).toFixed(1) : String(x[c]))).join(","))].join("\n") + "\n");
  311 |     observations.timing = { offsets, serverMatchedByCommandId: mapped, serverAccepts: accepts.length, attempted: plan.length, accepted: acceptedRows.length, samples };
  312 |     observations.M02 = { sticksEverywhere: sid.length, duplicates: 0, settled, settleWaitMs: settleMs, maxPositionDeltaFromServer: maxDelta, statusAtEnd: await A.locator(".ws-status").innerText(), senders: { A: 12, B: 12, C: 2 } };
  313 |   });
  314 | 
  315 |   test("M05 a placement that conflicts with a partner's just-committed stick is refused with a reason and the draft is kept", async () => {
  316 |     await B.getByRole("button", { name: "Add a stick" }).click();
  317 |     await expect(B.locator(".draft-state")).toBeVisible();
  318 |     const bId = (await api(B, "GET", "/api/session")).body.user.id;
  319 |     const ghost = await until(() => A.evaluate((u) => (window as any).__c9.drafts[u] as { pose: unknown } | undefined, bId), 3000);
  320 |     expect(ghost).not.toBeNull();
  321 |     // A, from a second socket in A's own browser, takes over editing and commits exactly at B's ghost
  322 |     const conflict = await A.evaluate(
  323 |       async ({ workId, pose }) => {
  324 |         const s = await (await fetch("/api/session")).json();
  325 |         const ws = new WebSocket(`ws://${location.host}/ws`);
  326 |         const next = (pred: (m: any) => boolean): Promise<any> =>
  327 |           new Promise((res) => {
  328 |             const l = (e: MessageEvent): void => {
  329 |               const m = JSON.parse(String(e.data));
  330 |               if (pred(m)) (ws.removeEventListener("message", l), res(m));
  331 |             };
  332 |             ws.addEventListener("message", l);
  333 |           });
  334 |         await new Promise((r) => ws.addEventListener("open", r));
  335 |         ws.send(JSON.stringify({ type: "hello", csrf: s.csrf }));
  336 |         await next((m) => m.type === "hello.ok");
  337 |         ws.send(JSON.stringify({ type: "room.join", workId }));
  338 |         const snap = await next((m) => m.type === "room.snapshot");
  339 |         ws.send(JSON.stringify({ type: "lease.takeover" }));
  340 |         const lease = await next((m) => m.type === "lease.changed" && m.lease);
  341 |         const commandId = crypto.randomUUID();
  342 |         ws.send(JSON.stringify({ v: 1, type: "command", commandId, workId, worldEpoch: snap.epoch, streamId: snap.streamId, lastSeenTick: snap.tick + 1000, leaseId: lease.lease.leaseId, kind: "place", payload: { pose } }));
  343 |         const r = await next((m) => m.type === "command.result" && m.commandId === commandId);
  344 |         ws.close();
  345 |         return { outcome: r.outcome, code: r.code, stickId: r.stickId };
  346 |       },
  347 |       { workId, pose: (ghost as { pose: unknown }).pose },
  348 |     );
  349 |     expect(conflict.outcome).toBe("accepted");
  350 |     await until(async () => (await ids(B)).includes(conflict.stickId), 3000);
  351 |     const sentBefore = (await c9<string[]>(B, "sent")).filter((x) => x === "command:place").length;
  352 |     // the partner's stick now occupies B's ghost: B's own check refuses before anything is sent
  353 |     await expect(B.locator(".draft-state")).toContainText("Intersecting; adjust position", { timeout: 3000 });
  354 |     const placeDisabled = await B.getByRole("button", { name: "Place", exact: true }).isDisabled();
  355 |     await B.keyboard.press("Enter"); // the keyboard shortcut is refused too
  356 |     await B.waitForTimeout(300);
  357 |     await expect(B.locator(".draft-state")).toBeVisible();
  358 |     const sentAfter = (await c9<string[]>(B, "sent")).filter((x) => x === "command:place").length;
  359 |     const feedback = await B.locator(".draft-state").innerText();
  360 |     expect(placeDisabled).toBe(true);
  361 |     await B.waitForTimeout(500);
  362 |     const everywhere = await Promise.all([A, B, C].map(ids));
  363 |     const srv = await serverIds(A);
  364 |     for (const x of everywhere) expect(x).toEqual(srv);
  365 |     expect(srv.filter((x) => x === conflict.stickId)).toHaveLength(1);
  366 |     await B.keyboard.press("Escape");
  367 |     // closing the second socket frees the seat, and the server gives it back to A's workshop window
  368 |     await expect(A.getByRole("button", { name: "Add a stick" })).toBeEnabled({ timeout: 5000 });
  369 |     observations.M05 = { partnerCommitAtGhost: conflict.outcome, path: sentAfter > sentBefore ? "sent to server" : "refused by the client's advisory check before sending", placeDisabled, feedback, draftKept: true, phantomSticks: 0, convergedWithServer: true };
  370 |   });
  371 | 
  372 |   test("M08 B's socket really closes; A keeps building; B recovers the authoritative state without duplicates", async () => {
  373 |     await B.getByRole("button", { name: "Add a stick" }).click();
  374 |     await expect(B.locator(".draft-state")).toBeVisible();
  375 |     const socketsBefore = (await (await A.request.get("/readyz")).json()).sockets;
  376 |     await ctx.B.setOffline(true);
  377 |     const closed = await B.evaluate(() => {
  378 |       const open = (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1);
  379 |       open.forEach((s: WebSocket) => s.close());
  380 |       return open.length;
  381 |     });
> 382 |     await expect(B.locator(".conn-reconnecting")).toBeVisible({ timeout: 5000 });
      |                                                   ^ Error: expect(locator).toBeVisible() failed
  383 |     await B.waitForTimeout(2500); // reconnect attempts fail while offline
  384 |     await expect(B.locator(".conn-reconnecting")).toBeVisible();
  385 |     const banner = await B.locator(".stage-banner").innerText();
  386 |     const placeDisabled = await B.getByRole("button", { name: "Place", exact: true }).isDisabled();
  387 |     const socketsDuring = (await (await A.request.get("/readyz")).json()).sockets;
  388 |     const made: string[] = [];
  389 |     for (let i = 0; i < 3; i++) made.push((await placeVia(A)).id!);
  390 |     await ctx.B.setOffline(false);
  391 |     await expect(B.locator(".conn-open")).toBeVisible({ timeout: 15_000 });
  392 |     await until(async () => made.every((id) => id) && (await ids(B)).length === (await serverIds(A)).length, 5000);
  393 |     expect(await ids(B)).toEqual(await serverIds(A));
  394 |     await expect(B.locator(".draft-state")).toBeVisible(); // the unplaced stick survived
  395 |     await B.waitForTimeout(300);
  396 |     const draftAfter = await B.locator(".draft-state").innerText();
  397 |     const canPlaceAfter = await B.getByRole("button", { name: "Place", exact: true }).isEnabled();
  398 |     let draftOutcome: string;
  399 |     if (canPlaceAfter) {
  400 |       await B.getByRole("button", { name: "Place", exact: true }).click();
  401 |       await expect(B.locator(".draft-state")).toHaveCount(0, { timeout: 5000 });
  402 |       draftOutcome = "placed";
  403 |     } else {
  404 |       // ghosts reserve no space (ADR-0006): A's sticks may now occupy it
  405 |       draftOutcome = `refused locally: ${draftAfter.split("\n")[0]}`;
  406 |       await B.keyboard.press("Escape");
  407 |     }
  408 |     // three more quick cycles
  409 |     for (let i = 0; i < 3; i++) {
  410 |       await ctx.B.setOffline(true);
  411 |       await B.evaluate(() => (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1).forEach((s: WebSocket) => s.close()));
  412 |       await expect(B.locator(".conn-reconnecting")).toBeVisible({ timeout: 5000 });
  413 |       await ctx.B.setOffline(false);
  414 |       await expect(B.locator(".conn-open")).toBeVisible({ timeout: 15_000 });
  415 |     }
  416 |     await B.waitForTimeout(500);
  417 |     const bOpen = await B.evaluate(() => (window as any).__c9.sockets.filter((s: WebSocket) => s.readyState === 1).length);
  418 |     const socketsAfter = (await (await A.request.get("/readyz")).json()).sockets;
  419 |     const members = (await api(A, "GET", `/api/works/${workId}`)).body.members.length;
  420 |     const presenceB = await A.locator("ul.presence li", { hasText: label("B") }).count();
  421 |     const bIds = await ids(B);
  422 |     expect(bIds).toEqual(await serverIds(A));
  423 |     expect(new Set(bIds).size).toBe(bIds.length);
  424 |     expect([bOpen, socketsAfter, members, presenceB]).toEqual([1, socketsBefore, 3, 1]);
  425 |     observations.M08 = { socketsClosedInB: closed, statusWhileOffline: "Reconnecting…", bannerWhileOffline: banner, placeDisabledWhileOffline: placeDisabled, serverSockets: { before: socketsBefore, during: socketsDuring, after: socketsAfter }, editsByAWhileBOffline: made.length, bMatchesServerAfter: true, draftKeptAfterReconnect: true, draftAfterReconnect: draftOutcome, extraCycles: 3, bOpenSockets: bOpen, members, bPresenceEntries: presenceB };
  426 |   });
  427 | 
  428 |   test("M09 a hidden tab draws nothing, then shows the latest state on return without interaction (simulated visibility)", async () => {
  429 |     const cycle = async (): Promise<Record<string, unknown>> => {
  430 |       await B.evaluate(() => (window as any).__setHidden(true));
  431 |       const r0 = await B.evaluate(() => (window as any).__stillwood.stats().renders);
  432 |       const made = [(await placeVia(A)).id!, (await placeVia(A)).id!];
  433 |       const received = await until(() => B.evaluate((xs) => xs.every((x: string) => (window as any).__c9.received[x]), made), 5000);
  434 |       const r1 = await B.evaluate(() => (window as any).__stillwood.stats().renders);
  435 |       const renderedWhileHidden = await B.evaluate((xs) => xs.filter((x: string) => (window as any).__c9.rendered[x]).length, made);
  436 |       const t0 = now();
  437 |       await B.evaluate(() => (window as any).__setHidden(false));
  438 |       const shown = await until(() => B.evaluate((xs) => xs.every((x: string) => (window as any).__c9.rendered[x]), made), 5000);
  439 |       const wakeMs = now() - t0;
  440 |       expect([!!received, r1 - r0, renderedWhileHidden, !!shown]).toEqual([true, 0, 0, true]);
  441 |       return { stateReceivedWhileHidden: true, rendersWhileHidden: r1 - r0, renderedOnReturn: true, returnToRenderedMs: Math.round(wakeMs) };
  442 |     };
  443 |     const auto = await cycle();
  444 |     await B.evaluate(() => localStorage.setItem("stillwood.graphicsQuality.v1", "low"));
  445 |     await B.reload();
  446 |     await expect(B.locator(".conn-open")).toBeVisible();
  447 |     await skipIntro(B);
  448 |     const tier = await B.evaluate(() => (window as any).__stillwood.stats().tier);
  449 |     const low = await cycle();
  450 |     await B.evaluate(() => localStorage.removeItem("stillwood.graphicsQuality.v1"));
  451 |     observations.M09 = { method: "document.hidden + visibilitychange overridden in the page (real tab hiding unavailable headless)", auto, low: { tier, ...low } };
  452 |   });
  453 | 
  454 |   test("M10 a window on another work sees nothing from this one", async () => {
  455 |     const x = await api(B, "POST", "/api/works", { title: label("X") });
  456 |     const bx = await ctx.B.newPage();
  457 |     await bx.goto(`/works/${x.body.id}/`);
  458 |     await expect(bx.locator(".conn-open")).toBeVisible();
  459 |     await skipIntro(bx);
  460 |     await bx.getByRole("button", { name: "Sticks" }).click();
  461 |     if (!(await B.getByRole("heading", { name: /^Sticks \(/ }).isVisible())) await B.getByRole("button", { name: "Sticks" }).click(); // M09 reloaded B
  462 |     await A.getByRole("button", { name: "Add a stick" }).click();
  463 |     await expect(B.getByText(`${label("A")} (ghosts aren't real sticks yet)`, { exact: false })).toBeVisible({ timeout: 3000 });
  464 |     await A.keyboard.press("Escape");
  465 |     const placed = (await placeVia(A)).id!;
  466 |     await until(async () => (await ids(B)).includes(placed), 3000);
  467 |     const leaked = await bx.evaluate((id) => Object.keys((window as any).__c9.received).includes(id), placed);
  468 |     const xSticks = await ids(bx);
  469 |     const ghostLine = await bx.getByText("ghosts aren't real sticks yet", { exact: false }).count();
  470 |     expect([leaked, xSticks, ghostLine]).toEqual([false, [], 0]);
  471 |     await bx.close();
  472 |     observations.M10 = { otherWorkReceivedThisStick: leaked, otherWorkSticks: xSticks.length, otherWorkGhosts: ghostLine };
  473 |   });
  474 | 
  475 |   test("L03 a visitor sees the frozen exhibit, gets no editing, and sees the withdrawal on reload", async () => {
  476 |     await A.getByRole("button", { name: "Versions" }).click();
  477 |     await A.getByLabel("Save the current structure as a version").fill(label("v"));
  478 |     await A.getByRole("button", { name: "Save version" }).click();
  479 |     await A.getByRole("button", { name: "Exhibit…" }).first().click();
  480 |     await A.getByLabel("Title").fill(label("exhibit"));
  481 |     await A.getByRole("button", { name: "Publish" }).click();
  482 |     await expect(A.locator(".toast-ok").last()).toContainText("Published", { timeout: 20_000 });
```