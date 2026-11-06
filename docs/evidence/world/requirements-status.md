# Island upgrade: requirement status (2026-11-04)

This reconciles the [primary brief](../../stillwood_immersive_island_gallery_upgrade_prompt.md) (with the
[memory constraints](../../stillwood_memory_recovery_constraints.md)) against the working tree, section by section.

**Required or optional.** The brief's own wording decides. "Optional", "allowed", "may" and "where present" items are
marked *optional*; everything else is *required*.

**Status.**

- **met**: implemented, and a named check or an inspected screenshot shows it. A screenshot counts only for what is
  visible in it; the evidence column says what that is.
- **partial**: implemented, with a stated, measured gap.
- **not met**: not done, or measured and short of the target.
- **unverified**: can't be established in this environment (a real GPU, a physical phone, people).

**Where it was checked.** Headless Chromium 153 on SwiftShader (software WebGL), one Playwright worker, under
`scripts/world/supervise.ts`, against a local production build. Nothing here was run on a real GPU or a phone, and
the island is **not deployed**: Fly runs `ffa5830`, before any of this work. The work is uncommitted on top of
`b13ecae`.

## §0, §2, §3: scope, existing features, the opening

| Requirement | | Status | Evidence |
| --- | --- | --- | --- |
| Root page shows the island, portals, sea and landmarks with no welcome gate; a gesture only for pointer capture (§0.1, §3.1) | required | met | `world-protection.spec.ts` (signed out); home screenshot below |
| Existing navigation: labels, order, destinations, visibility, clickability (§0.2, §2) | required | met | [protection-matrix.md](protection-matrix.md); `world-protection.spec.ts` (signed out and signed in: each control is the topmost element at its centre) |
| Three portals to real destinations; "View player works" to the original list; no redirect of old URLs (§0.3, §3.1, §3.3) | required | met | `world-protection.spec.ts` (Build Together creates a real work; deep links not redirected) |
| Workbench, physics, saving, permissions untouched (§0.4, §0.6) | required | met | No schema, API, permission or workbench change in the diff. The one server change is static: `src/server/main.ts` serves the island's pre-built data under `/world-data/` (an allow-listed path pattern, a 404 for anything else) and adds `/world/` and `/world/inspect/` to the app-shell pages. The existing suites pass (final regression run, below) |
| No presence, chat, rankings or new backend (§0.5) | required | met | Nothing added; the diff is client, generator, tests and static file serving for the generated world data (no new API, storage or socket message) |
| Portal labels within ~6 m, enter prompt within ~2 m, one transition per crossing, cooldown (§3.1) | required | met | `WorldView.updateProximity`; `world-route.spec.ts` |
| Opening and regional copy; "World preset · Inspired by …" labels (§3.2, App. C2) | required | met | Plaques in every viewpoint screenshot ([landmarks/](landmarks/)) |
| Read-only spatial stands of real works (§3.3, P4) | **optional** | not built | The brief makes them conditional. The gallery stays the existing page below the island |
| Protection matrix from baseline source, pre-existing failures kept apart (§2) | required | met | [protection-matrix.md](protection-matrix.md); `crit9-reconnect` F3 is pre-existing (below) |

## §4: terrain and layout

| Requirement | | Status | Evidence |
| --- | --- | --- | --- |
| Island envelope, S-shaped valley route, five regions in order (§4) | required | met | [layout.json](layout.json); `world-landmarks.test.ts` regional height ranges |
| Foundations settled: no floating feet, no buried buildings, no excavation scars (§4) | required | met | `world-landmarks.test.ts` "the terrain doesn't bury the building" (all 20, against each pad's own surface), "no two footprints overlap" |
| **At least one side route per region that rejoins the valley** (§4) | required | met | `src/world/routes.ts`; `world-routes.test.ts` (5 routes, one per region: leave and rejoin, ≥ 80 m from the valley, ≥ 18 m from footprints, ≥ 40 m from the coast, walkable or flown); waymark gates in the world; exported in the manifest |
| **Three ridge/turn reveals** (§4) | required | met | `world-routes.test.ts`: R1 L10, R2 L08, R3 L20, each ≤ 60 % visible first and ≥ 85 % after, by terrain occlusion. Screenshots of R2 at its two points: [R2 hidden](landmarks/named-ridge-reveal-R2-hidden.jpg) shows only the ridge (the dome hall is wholly hidden there, more than the brief's "part of a landmark"); [R2 shown](landmarks/named-ridge-reveal-R2-shown.jpg) shows the domes and half-domes over the ridge |
| Main fly-through openings ≥ 12 m clear, other principal flight openings ≥ 8 m (§4) | required | partial | Measured from the colliders (`world-landmarks.test.ts` "flight opening widths"): L05's lower and middle arches 20.7 m and 19.7 m (≥ 12); L02 clerestory 10.7, L06 upper arch 9.7, L10 buttress gap 16.7 (≥ 8). **L14's aperture route narrows to 9.7 m and L07's oculus to 8.7 m**: both are the brief's own fly-through routes, and they meet the 8 m rule but not the 12 m one. Widening them is a recipe change not made here |
| **The dam with its canyon, upstream reservoir and downstream channel; no water above grass** (§4, §7.4) | required | met | Reservoir basin (`terrain.ts`, pad `reservoir`). The downstream river runs from the stilling basin's end sill through a cut gorge to the sea (`layout.ts` `damRiver`); `world-routes.test.ts`: starts at the channel, falls monotonically, ends at sea level outside the coast, water above its bed and below both banks everywhere inland, clear of every other footprint and walked side route. Screenshots: [from the toe](landmarks/named-river-from-the-toe.jpg), [through the gorge](landmarks/named-river-gorge.jpg), [at the sea](landmarks/named-river-mouth.jpg) |
| 128 m chunks with skirts; visible terrain, ground queries and collision agree (§4) | required | met | `environment.ts` `tileGeometry`; `world-geometry.test.ts` (vertices on the field; skirts wherever steps differ); collision uses the same `heightAt` |
| Cliffs with real sides; offshore flight buffer (§4) | required | met | Coast cliff in `terrain.ts`; boundary 90 m offshore; low coastal flight screenshot [low coastal flight](landmarks/named-low-coastal-flight.jpg) (sea, cliff face and rocks from 14 m) |
| Fixed seed; exported parameters, footprints, placements, safe points (§4) | required | met | `WORLD_SEED`; [layout.json](layout.json); manifest |

## §5, §6: camera, controls, collision

| Requirement | | Status | Evidence |
| --- | --- | --- | --- |
| Eye 1.65, capsule ~0.35, FOV 55°, no fit-all on load/LOD/resize, no roll or bob (§5.1) | required | met | `world-collision.test.ts` (capsule); `world-route.spec.ts` (resize mid-climb keeps the pose) |
| Ground, interior/pass-through and high viewpoint per building (§5.1, §13.1) | required | met | All 20 have all three plus detail (and L16 a side view). Each is checked locally (not blocked at the lens, the building in frame) and **in the world** (no terrain at the lens; high and side views not hidden by terrain, a check added after L13's high view turned out to face a canyon rim) |
| Input mapping, explicit states, key clearing on blur/menus/hidden (§5.2) | required | met | `world-keyboard.spec.ts`; `world-collision.test.ts` "holds still in every non-exploring state" |
| Landmark jumps and return home (§5.2) | required | met | Pause menu; `world-route.spec.ts`. A jump now refreshes terrain detail at the destination (`world-keyboard.spec.ts` "after a jump the terrain's detail follows"; it failed before the fix) |
| Touch controls, 44 px targets, safe areas at 390 × 844 (§5.2) | required | met in emulation; **unverified on a phone** | `world-route.spec.ts` at 390 × 844 (touch controls). A desktop browser with a mobile viewport is not a phone |
| Swept collision, wall sliding, corners, ramps, high-speed impacts, substep budget (§6) | required | met | `world-collision.test.ts` |
| Coastline boundary: soft band, outward-only removal, non-convex nearest boundary, ceiling ≥ highest top + 100 (§6) | required | met | `world-collision.test.ts`; manifest boundary (ceiling from the measured highest top) |
| Safe points, recovery that never touches works (§6) | required | met | `world-landmarks.test.ts` "every safe point has a clear, standable capsule"; `world-route.spec.ts` recovery |

## §7, App. A–C: landmarks

| Requirement | | Status | Evidence |
| --- | --- | --- | --- |
| All 20 recipes, generated, distinct, within ±1 % or a recorded revision (§7, App. C2) | required | met | [landmarks.md](landmarks.md) (1,229,288 pieces); [validation.json](validation.json) (all checks × 20 pass); [revisions.json](revisions.json) |
| Stick sizes 8:1:1, never scaled; curves from straight pieces (§7.1) | required | met | `world-landmarks.test.ts` "uses only the three preset stocks, never scaled" |
| Column orders differ in geometry; Corinthian leaves read as broad pointed clusters (§7.3, B3) | required | met | `world-landmarks.test.ts` order geometry; [landmarks/sheet-components.jpg](landmarks/sheet-components.jpg) (inspected: Doric flutes without base, Ionic volutes, Corinthian leaf clusters, lotus crowns) |
| Arches with inner/outer edges and thickness (App. C2) | required | met | `world-landmarks.test.ts` "arch geometry" (after the signed-zero fix that had inverted semicircular arches) |
| Shallow approach steps 0.20–0.30 high, 1–2 deep (§7.2) | required | met | Generator; screenshot [L04 porch steps](landmarks/named-shallow-steps-L04-porch.jpg) (broad shallow treads up to the porch) |
| L16 fin spillway (§7.4) | required | met | `world-landmarks.test.ts` "L16 carries the fin spillway"; component sheet |
| Development inspector kept out of normal navigation (§7.3, C1) | required | met | `/world/inspect/` only with the test flag |
| Per building: ≥ 3 identity features, an entry route, a safe viewpoint (§13.1, C2) | required | met | Manifest; `world-landmarks.test.ts` main route clear along its length |
| L13 reads as a glasshouse at a distance | required (§13.1 "verify defining features") | met, after a fix | Its high view faced the gorge's 200 m rim (terrain hid 82 % of the hall) and its 45° sheet was faint. The view now stands over the open valley ([L13 high](landmarks/named-L13-high.jpg): the long lattice hall, its transept and frames read clearly; the glazing is light, by design). The new world check "high and side views see the building over the terrain" moved L16's and L17's high views for the same reason |

## §8: environment and assets

| Requirement | | Status | Evidence |
| --- | --- | --- | --- |
| Three scales of ground colour; slope rules; grass clumps near the camera with fade (§8) | required | met | `materials.ts` terrain; grass close-up [close grass at home](landmarks/named-close-grass.jpg) |
| 6–10 rock silhouettes + 2–3 rubble types; coasts and ridges; none in paths or riverbeds (§8) | required | met | `environment.ts` `rockGeometries` (8 + 3); exclusion of route, footprints, home and the river |
| Sky/sun, cloud layers, sea with shoreline cues (§8) | required | met | Home and coastal screenshots |
| External texture candidates (Poly Haven, Kenney) (§8) | **optional** ("candidates") | not used | Everything is generated; [assets/sources.json](../../../assets/sources.json) records that nothing was downloaded |
| Asset provenance and licences (§8, §14.3) | required | met | [assets/sources.json](../../../assets/sources.json): three.js `Sky` and `OrbitControls` (MIT) are the only third-party code added |

## §10, §10.1: streaming, performance, memory

| Requirement | | Status | Evidence |
| --- | --- | --- | --- |
| Instancing by building and band; near detail for 1–2 buildings; mid and far levels; hysteresis (§10) | required | met | `WorldView.ts`; [triangles.md](triangles.md). One bug found and fixed in this work's own shadow-caster culling: it read an instanced mesh's unit geometry bounds, so the shading shells never cast shadows and sunlight lit colonnade interiors (`world-shadow-cull.test.ts`) |
| **High: ≤ 250 draw calls, ≤ 1.2 M triangles** (§10) | required ("initial target") | met | [triangles.md](triangles.md): all 82 views (home and every landmark's ground, interior, detail and high view): largest 1,002,158 triangles (L09 ground; 1,673,610 at the first 82-view run), largest 225 calls. The Doric entrance (L03 ground), 2,441,443 at the start of the session, is now 678,184, with the same frame (side by side in triangles.md) |
| **Medium: ≤ 150 calls, ≤ 600k triangles** (§10) | required ("initial target") | not met | [triangles.md](triangles.md): 18 of 82 views over 600k (64 before), largest 812,545 (L09 ground); 18 over 150 calls, largest 196. The shadow-culling fix (shells cast shade again) added four of each |
| **Low: ≤ 90 calls, ≤ 250k triangles** (§10) | required ("initial target") | not met | [triangles.md](triangles.md): 43 of 82 views over 250k (73 before), median 257k; 37 over 90 calls, largest 145 |
| Grass, textures, DPR caps per tier (§10) | required | met | `quality-world.ts` (40k / 15k / 3k clumps; DPR 1.5 / 1.25 / 1.0; no textures beyond generated canvases) |
| Compressed transfer: home ≤ 5 MB, island entry ≤ 8 MB, full tour ~40 MB (§10) | required | met | World assets 2.42 MB brotli in total ([landmarks.md](landmarks.md)) |
| ≈ 60 fps desktop, 30 fps mobile, with frame-time distributions (§10) | required | **unverified** | SwiftShader can't establish it (steps below) |
| Repeated visits without sustained growth; disposal (§10) | required | partial | Renderer process flat ([memory-incident.md §8](memory-incident.md)); GPU process: reproducible growth of about 1.6 MiB per cycle that visits two landmarks at the near level, not plateaued after 30 cycles; none with bare WebGL contexts or with the world mounted and no visits. Mechanism not established ([memory-incident.md §9](memory-incident.md)) |
| Context loss and restore (§10) | required | met | [memory/after-ctx.summary.json](memory/after-ctx.summary.json) |
| Memory limits of §10.1 | required | met | Every run under the supervisor; largest group peak after the incident's fix 1,692 MiB (an earlier full Playwright run, before the supervisor counted Chromium's browser process: add about 96 MiB); the final Playwright run, with it counted, 1,597 MiB; the world unit tests 1,644 MiB; no swap. One gap found and fixed: Chromium's browser process had moved itself out of the job's cgroup (§9 of the incident report) |

## §11, §13: fallbacks, accessibility, acceptance

| Requirement | | Status | Evidence |
| --- | --- | --- | --- |
| No WebGL, failed manifest, failed landmark: usable page with retry (§11) | required | met | `world-protection.spec.ts` |
| Keyboard-only, focus after overlays, Escape releases, no traps (§11) | required | met | `world-keyboard.spec.ts` (found and fixed: focus lost to `<body>` on pause) |
| `/readme/` readable; no visible-but-unclickable controls (§11) | required | met | `world-protection.spec.ts` |
| §13.1 captures: home, close grass, ridge reveal, capital detail, shallow steps, dam toe looking up, dam side section, dome interior, low coastal flight, highest-tower valley view, mobile controls | required | partial | Inspected, [contact sheet](landmarks/sheet-named.jpg): home, close grass, ridge reveal, capital detail (L03), shallow steps (L04), dam toe looking up and dam side (L16), dome interior (L08), low coastal flight and the river show what they are named for. **The highest-tower valley view does not**: from L20's platform the valley and the earlier landmarks are visible, but across the tower's own lower setback roofs, which fill most of the frame ([capture](landmarks/named-highest-tower-valley-view.jpg)); an open overlook would need a change to L20's recipe. Mobile controls: `world-route.spec.ts` at 390 × 844 (emulated) |
| §13.3 route at 1920 × 1080 and 390 × 844 (§13.3) | required | met (emulated phone) | `world-route.spec.ts` |
| Slow/failed resources, tab suspension, mid-interaction resize (§13.3) | required | met | `world-keyboard.spec.ts`, `world-route.spec.ts` |
| 10 world/workbench round trips (§13.3) | required | met | 20 trips ([memory-incident.md §8](memory-incident.md)) |
| Two identities on affected collaboration paths (§13.3) | required | met, with one pre-existing failure | `together.spec.ts`, `crit9-multiplayer.spec.ts` pass; `crit9-reconnect` F3 fails outside its isolated network, as before this work |
| `pnpm check`, `pnpm check:evidence`, affected tests (§13.3) | required | met, with one pre-existing failure | Final regression run, 2026-11-04, one job at a time under the supervisor: typecheck clean; `test:unit` 379 of 379 (18 files); `pnpm check` against a local production server 53 of 53; `check:evidence` (12 cited commits resolve); integration 13 of 13; Playwright (the full suite, before the shadow-culling fix) 44 passed, **1 failed**: `crit9-reconnect` F3 ("A offline + client close: an open socket existed", expected 1, received 0), its spec unchanged since `ffa5830`. The suite is **not** fully passing. The e2e run rewrites seven tracked evidence screenshots; they were clean before it and were restored from `HEAD` (checksums match the pre-run files). After the shadow-culling fix (client renderer only): rebuilt, the three island specs again 16 of 16, and typecheck, `test:unit`, `pnpm check` and `check:evidence` repeated as above |

## Interaction upgrade (2026-11-05/06)

From [`stillwood_island_gallery_world_interaction_fix_prompt.md`](../../stillwood_island_gallery_world_interaction_fix_prompt.md), which supersedes the brief's interaction rules
(the old model captured the pointer on Start exploring and hid the cursor). Checked by `world-interaction.spec.ts`
(journeys A–I on desktop, J on an emulated phone), `world-speed.test.ts` and `world-input.test.ts`.

| Requirement | Status | Evidence / note |
| --- | --- | --- |
| Free cursor by default; plain mouse movement never turns the camera; left-drag looks after 5 px, applying only the excess; release, cancel, lost capture, blur or leaving the viewport ends it; a drag's click is swallowed; right-click keeps the menu | met | Journeys A, B; `DragLook` unit tests |
| HUD controls never start a gesture, move or turn | met | Journey C; HUD presses don't take the world's keys |
| Look lock: explicit (button or **M**), "Free cursor" / "Look locked · Esc to release cursor"; Esc releases without pausing or re-locking; failure leaves free cursor | met (headless) | Journey E. **L stays look-right**: the brief asks for both L-toggle and keeping I/J/K/L, so the toggle is M. Under pointer lock, headless Chromium turns synthetic moves into +N/−N pairs, so the test dispatches the locked pointer's relative event; a real mouse under Look lock is a manual check |
| Walk / Run / Fly: Walk 5 m/s (original), Run 15, Fly 35 on foot; airborne never below the original 15 (boost 32); Shift ×1.8, capped at 45 m/s horizontal, 24 vertical; diagonals normalised; switching keeps pose and eases; Fly never auto-ascends; look sensitivity independent | met | `world-speed.test.ts`; journey D (Fly covers > 2.5× Walk's distance in the same time). Default Run; remembered per browser (`stillwood.worldSpeed.v1`, validated) |
| Collision and boundary at max speed and low frame rates | met (synthetic + L06/L16 colliders) | 10 fps runs into a 0.6 m wall, the hard boundary, the ceiling, and 16 headings × 3 heights at Fly + boost into L06 and L16's real colliders, never inside a collider. Landmark colliders now join the grid within `COLLIDER_REACH` (≥ 2.4 s of travel at max speed), independent of the visual far-file load |
| Start exploring / Explore fullscreen; fullscreen is the stage element (one renderer); exit button; browser exit handled; no forced Look lock; pose and speed kept | met | Journey G; resource probe: 10 fullscreen cycles create no WebGL context, one canvas |
| Wheel scrolls the page over the canvas; scrolling or page focus ends drag and stops movement keys; hovering doesn't capture; rendering stops when the island is off screen | met | Journey F; WorldView's IntersectionObserver |
| Return to world from My Works, the create entry, the editor, exhibits and sign-in pages; restores route (home or /world/), pose and speed, free cursor, nothing held, no fullscreen; safe-point fallback; the editor's unplaced stick asks first | met | Journey H (including Stay / Leave and Back). Only the pose is kept (`sessionStorage`, validated, 12 h TTL); the renderer is disposed on leaving as before; 5 trips: one canvas, one new renderer per trip |
| Tab change and blur: no stuck keys, capture or jump | met | Journey I |
| Touch: stick, Up/Down/Boost, right-side drag; speed buttons tappable without steering; no HUD overlap | met (emulated) | Journey J and `world-route.spec.ts` phone. A regression found by the phone route (holding Up was cleared by the focus boundary) was fixed |
| Physical phone, a real mouse under Look lock, Safari/Firefox fullscreen and pointer-lock behaviour | **not verified** | Desktop emulation only |

## Portal destination lettering (2026-11-06)

One visual change, limited to the three entrance portals: frosted-glass destination names inside each existing membrane.
Code: `src/client/world/portal-labels.ts` (layout, canvas atlas, shader), wired in `WorldView.ts` (`buildStatic`,
`updateProximity`, `tick`, `onRestored`, `dispose`). Checked by `tests/world-portal-labels.test.ts` (12 tests) and the
existing island specs (unchanged, 25 passing).

| Requirement | Status | Evidence / note |
| --- | --- | --- |
| Labels are each destination's real name; the spatial order is not assumed | met | From `home()`: left to right is **My Works, Explore the World, Build Together** (ids works, explore, together). The unit test reads the label from the layout and the destination from `bridge.ts` (works → `/works/`, together → `/works/?new=1` or sign-in, explore → `/world/`) |
| Inside the opening, around its visual middle, clear of the wooden frame, wrapped to each shape | met (measured) | Each line's width cap plus a 0.35 m margin is checked against the opening measured from each portal's real `createPortal` geometry at every height the line can occupy; a mutation (wider A-frame cap) fails the test |
| Frosted-glass lettering, not a card | met (visual) | Milky letters with a luminous rim, a teal-tinted shadow and a faint accent halo; no panel behind them. Screenshots reviewed: spawn, 7 m, near, behind, oblique, over buildings, fullscreen 1920×1080, phone 390×844 |
| Visible from the initial approach, in world space, correct from both sides | met | Visible at spawn, 12 m, 7 m; perspective quads in the scene. Each portal has a front and a back quad, so the text reads correctly from behind (screenshots `05-*-behind`) |
| Within activation range: brighter, plus a hint below | met | `stats().portalLabels.state`: 4.5 m and 3.2 m → glow 0.45, no hint; 2 m → glow 1 and hint, for the nearest portal only. Keyboard: "Press E to enter". Touch (coarse pointer): the existing "Walk through to enter". Same ranges as the existing proximity logic (label 6 m, enter 2.2 m) |
| No pointer blocking, collision, traversal or navigation change | met | No raycast target (`raycast` disabled); no collider or portal code touched; `world-interaction`, `world-keyboard`, `world-route` (desktop and phone) and `world-protection` pass unchanged |
| Lightweight, no extra render loop, disposed with the scene | met | One mesh, one draw call (measured at spawn: draw calls 139 → 140, +12 triangles), one 8-bit canvas atlas (released after upload), no refraction; frames continue only while the glow is easing. Dispose accounting: textures 5 → 4, geometries 83 → 82, draw calls 41 → 40. After a forced WebGL context loss and restore (`restores 1`) the lettering is redrawn |
| Readability against bright sky and darker buildings | **partly met; low luminance contrast on pale sky** | By eye, legible in every captured view. By measurement the letters are only about **1.2–1.4:1** against the pale sky behind the membrane (1.05–1.23:1 before the shadow and rim were added), far below a 3:1 large-text guideline: milky white on a pale sky cannot do more without becoming an opaque card, which the brief rules out. It reads through its edge and shadow. The "over darker buildings" views (`07-*-over-buildings`) were checked by eye only, not measured. A different shadow strength is the one tuning knob if this isn't enough |
| Very close, steep views | known limitation | Within about 2 m with a strong upward pitch the two-line title leaves the top of the viewport (and sits under the HUD); the hint line stays readable. Not addressed |
| Physical phone, real GPU, Safari/Firefox rendering of the lettering | **not verified** | Chromium software rendering and emulated touch only |

## Not verifiable here, with the exact steps

- **Real-GPU frame rate (§10).** On a machine with a GPU: `pnpm build:world && pnpm build && pnpm start`; open
  `http://localhost:8080/` in Chrome at 1920 × 1080; in DevTools set `localStorage["stillwood.test"] = "1"` and
  `localStorage["stillwood.graphicsQuality.v1"] = "high"`, reload, click **Start exploring**. Record 30 s of the
  Performance panel while walking from the terrace toward L03, then use the pause menu to go to L09 (the heaviest view,
  about 1.0 M triangles at its ground view) and to L14 and fly up. Report the frame-time distribution and long frames, and
  `__stillwoodWorld.stats()` `drawCalls` and `triangles` at each stop. Repeat at Medium and Low.
- **A physical phone (§5.2, §10).** Open `http://<this machine's LAN address>:8080/` from the phone on the same network (the server already listens on `0.0.0.0`), and
  check touch look/move, the ascend and descend buttons, pause, and 30 fps at Low.
- **GPU-process memory on a real driver.** `node scripts/world/supervise.ts --stage gpu --budget-mib 3072 --log
  /tmp/sw/gpu.jsonl -- node scripts/world/tour.ts --stage gpu --cycles 30 --out /tmp/sw` with the browser on the real
  GPU (drop `--use-angle=swiftshader`), and compare with [memory-incident.md §9](memory-incident.md).
- **People who didn't build it** (§13.1 "if the browser view still feels like a toy").
