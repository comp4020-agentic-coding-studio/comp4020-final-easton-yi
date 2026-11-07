# Stillwood — Immersive Island Home & Fly-through Monument Gallery Upgrade

> **Repository note (2026-11-04).** This is the primary brief: the complete original (all requirements, the 20 recipes and Appendices A–F, verified against the original's 111,667-byte, 914-line copy) with the memory limits of §10.1 merged in. The fuller memory-recovery directive it summarises is [`docs/08-world-build/08-03-memory-rules.md`](08-03-memory-rules.md); the incident and its validation are in [`evidence/world/memory-incident.md`](08-04-memory-report.md); status against this brief is in [`evidence/world/requirements-status.md`](../90-reference/90-04-world-status.md).

## Complete Implementation Prompt for a Coding Agent

Version: 2026-11-03. Project: COMP4020 Final / Stillwood.  
Repository: https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi  
Existing deployment: https://comp4020-final-easton-yi.fly.dev/

**Give this entire document, including its appendices, to the implementation agent, together with `docs/07-world-design/07-03-component-lab.zip`. Implement and verify the changes in the existing repository. Do not stop at another proposal.** This is an implementation specification, not a claim that the work has already been completed.

---

## 0. Objective and non-negotiable scope

Implement a new island-world opening experience and an explorable, fly-through gallery of monumental timber architecture within the existing Stillwood application.

The user's latest boundary is: **preserve every existing button, entry point and underlying feature; change the world presentation seen when the application opens and the immersive exhibition experience.** Translate that boundary into the following engineering constraints:

1. Opening the root page should reveal the grassy 3D island, portals, clouds, sea and distant landmarks. Do not require entering a second welcome page before the world becomes visible. A user gesture is needed to capture the pointer, not to display the scene.
2. Preserve existing navigation labels, order, destinations, visibility conditions and actions. Reuse their components, links and handlers. Put the world canvas behind them or in its own main-content region without covering controls or swallowing input. Necessary responsive rearrangement is acceptable; removing entries or changing their meaning is not.
3. The three physical portals are additional spatial shortcuts. “My Works” and “Build Together” invoke the existing corresponding flows. “Explore the World” opens the new island. The existing gallery-list button still opens the existing list; exhibit details and share links retain their behavior. **Do not redirect all old URLs into the new world.** Proposed English portal names are new-world copy, not permission to rename existing controls.
4. Preserve the precise building workbench: camera, stick dimensions, physics, placement controls, saving, synchronization, permissions and management workflows. First-person controls apply only to the new world.
5. Do not add visitor presence, chat, social signals, friends, new open-room infrastructure, points, rankings, automatic publication or persistent exhibit-allocation services in this iteration. Earlier ideas about those systems are deferred. Connect capabilities that actually exist.
6. Do not change database schemas, business protocols, identity rules, room capacity, work limits or server physics parameters. Do not relax player-placement validation or send thousands of preset pieces into the server's rigid-body world.
7. New world frontend modules, offline asset generators, same-origin static resources, minimal routing integration and relevant tests are in scope. Read-only presentation of existing public exhibit data is allowed. If an optional presentation requires changing business behavior, isolate and report it instead of silently expanding scope.

This is a complete visual and exploration upgrade, not a background-image replacement. Deliver controllable first-person exploration, flight, terrain, invisible boundaries, at least 20 architecturally distinct monumental buildings, accessible existing features and a low-capability fallback.

**Precedence:** the user's current boundary → this document's revisions and acceptance requirements → appendix construction recipes → broader ideas in older design documents. Continue to obey repository safety rules, fixed course checks and existing business contracts. Document conflicting inputs, the resolution and its reason.

## 1. Inputs, baseline and evidence boundaries

Read repository `AGENTS.md`, `CLAUDE.md` and their referenced rules, README, PROCESS, package manifests and lockfiles, routing, navigation, renderer lifecycle and quality controls, public-exhibit access, relevant specifications and deployment instructions before editing.

Use these materials:

- `final_spec.md`: official requirements and HD descriptors. The recorded weighting is process 50%, application 25%, response to the brief 25%. Provide defensible decisions and evidence; additional features do not guarantee a grade.
- `stillwood_world_design_plan.md`: the current Section 19 records offline component findings. Its proposed social/backend extensions are outside this iteration.
- `docs/07-world-design/07-03-component-lab.zip`: seven offline component scenes, per-piece JSON, GLB files, renders, Python generators, source snapshots and physics results. Read `VALIDATION.md`, inspect `review.html`, then examine the generator and actual manifest.
- Appendices A–D below: the complete 20-building dimensions, component language, course-by-course recipes and historical references. They remain usable without the older design document.

The previously inspected commit was `b13ecaee79f29930827c0b7db660861a73ccddae`; do not assume it is still HEAD. Record current HEAD, dependency versions and uncommitted work, and preserve unrelated user changes. Earlier inspection found React 19, Three.js 0.186.1, Rapier 0.19.3, Node 24, SQLite and one 256 MB Fly machine. Verify against the current repository. Do not upgrade frameworks without a task-specific reason.

The evidence currently supports only these claims: seven offline geometry scenes were generated and rendered; a 132-piece staircase using original 8×1×1 sticks passed offline execution of the project's PhysicsWorld, with all pieces accepted, supported and asleep. Other large samples are static assemblies using smaller proportional sticks. They have not passed player-placement validation or structural stability tests. The controlled browser lacked WebGL during that exercise, so no live placement was completed. **Do not report these as 20 completed buildings, online end-to-end success or passing browser performance.**

The actual offline Ionic column has 3,306 pieces. The appendix's older 1,624-piece calculation is a different, unvalidated recipe. Never merge those counts. The offline Corinthian sample still lacks full leaf lobing and all ornamental volutes. The standalone Doric sample has a display plinth; temple integration must respect the specified column order. Samples are starting points, not automatically approved assets.

If the ZIP is unavailable, list the missing input, then use the complete recipes here to generate original components and continue independent work. Do not claim to have inspected or imported missing files.

## 2. Establish an existing-feature protection matrix

Create a baseline record under `docs/evidence/`. Populate it from actual code and UI, not remembered route names.

| Protected feature | Record before modification | Required outcome |
| --- | --- | --- |
| Every existing home button/link | Label, order, href/handler, authentication visibility, disabled state | Same destination, action and permissions; mouse, keyboard and touch remain usable |
| Login, registration, logout | Session behavior, return parameters, protected destinations | Existing flows reused; preset exploration does not require registration |
| My Works and workbench | Create, resume, edit, precision camera and controls | Existing behavior and editing experience preserved |
| Invitation, joining and collaboration | Admission, seats, disconnection and feedback | Existing protocol, synchronization and rejection reasons preserved |
| Saving and recovery | Server confirmation, refresh recovery, unconfirmed actions | Scene animations never substitute for save confirmation |
| Gallery, exhibit details and sharing | Filtering/order, public snapshots, deep links | Existing pages and bookmarks still work |
| Publish, unpublish, archive, restore, rename, delete, where present | Actual role/state matrix | No semantic change or invented action |
| Quality, sound, help and README, where present | Existing settings and entry points | Preserve controls and adapt the world to their preferences |
| No-WebGL access | Existing flat previews and lists | Existing core workflows remain available |

Record current relevant check results, distinguishing pre-existing failures from regressions. Do not reuse old test counts as evidence for this build. Check signed-out, empty-account, existing-work, full-room and disconnected states where relevant. Revisit affected rows after each implementation phase.

## 3. Opening experience: already in the world, with existing entries intact

### 3.1 The home island

- First usable composition: nearby grass and rocks, three substantial portal structures, distant ridges, sea and at least one recognizable tower. Point the initial camera toward portals and landmarks, not empty ground or sky.
- Home is the entrance region of the new world. It may share one runtime with the exhibition island, switching regions and safe positions rather than running two WebGL canvases simultaneously.
- Keep existing navigation above the scene. Add only a lightweight “Start exploring”/“Take control” action for gesture-driven pointer capture. Do not introduce an opaque full-screen welcome gate.
- Render no player body, arms or character. The camera is the player's viewpoint.
- Provide “Explore the World,” “My Works” and “Build Together” portals. Map the latter two to actual existing destinations/actions. If there is no open-room browser, reuse existing create/join entry points rather than inventing one.
- Show destination labels within roughly 6 world units and an E/enter prompt within roughly 2 units. Enter by crossing a defined threshold or confirming. Provide equivalent touch controls and focusable DOM links. Define portal triggers separately from solid collision.
- Use a transition state lock, short cooldown and leave-trigger-to-rearm rule. One crossing causes one transition, never duplicate room creation. Loading failures retain usable retry/back controls.
- Signed-out visitors can explore presets. Protected destinations use the original authentication and return-to behavior; do not bypass permissions.

### 3.2 Meaning expressed through the experience

The opening message may say:

> From the first lintel to towers above the clouds. Follow the valley and discover how imagination becomes space, one piece at a time.

At an existing creation entry:

> Your turn: build an idea together.

Use actual public attribution only for genuine published works. Label authored landmarks “World preset · Inspired by …”. Do not portray them as global player creations or fabricate current builders, activity or room counts. Until public works genuinely become explorable places, avoid claims such as “Your work is now here in the world.”

Use one short prompt per region: “Beams cross between columns”; “Arches open larger spaces”; “Domes frame the sky”; “Frames lift buildings higher”; “What would you leave here?” Make details optional. Do not create a forced history lesson or a wall of quests.

### 3.3 Existing gallery and real works

Keep existing Gallery/Exhibit pages and their buttons. Provide a normal “View player works” link into the original list. Optional read-only spatial stands are allowed only if existing public interfaces are sufficient:

- Read existing public snapshots and permitted attribution. World scaling is a presentation transform, never a stored-work edit.
- Project existing data through an adapter. Do not create a second publication state or fetch private works for client-side filtering.
- Preserve current unpublish/delete invalidation. If the API cannot support timely updates, do not claim realtime behavior. Refresh on entry, focus or existing subscriptions, and expose stale/offline status. Do not permanently serve withdrawn details from a new cache.
- If reliable stands would require new business APIs or database changes, retain the original list link and report spatial stands as unimplemented. This does not block the home, flight or 20 presets. Persistent stand allocation is out of scope.

## 4. Terrain and layout: a winding time corridor

Use separate world units, visually interpreted as approximately 1 unit = 1 metre. **Do not change workbench physics units.** Initial island envelope: about 2,800×1,500; main valley route: about 2,400; sea level y=0; coastal grassy terraces y=35–65; ordinary ridges y=120–170; dam canyon banks locally y=190–210. Validate composition and traversal before freezing the manifest.

Use a gently S-shaped route. Sample its arc length, tangent and lateral normal; place buildings with varying offsets, elevations and orientations. Do not create two evenly spaced rows. Initial valley sightline width is 70–140, opening to 220–350 at major nodes. Initial lateral building offsets are 50–240, but validate rotated footprints, route clearance, terrain and neighboring buildings rather than applying these numbers mechanically.

| Region | Route distance | Landmarks | Spatial character |
| --- | --- | --- | --- |
| A — Origins Meadow | 0–450 | L01–L04; heights 32–56 | Gentle slopes, lintels, column forest, terraces |
| B — Arches and Domes | 450–950 | L05–L08; heights 68–96 | Stream valley, crossing aqueduct, hillside theatre and domed halls |
| C — Cities and Halls | 950–1,450 | L09–L12; heights 108–154 | Turning route, rock platforms, walls, courts and side valleys |
| D — Industrial Gorge | 1,450–1,950 | L13–L16; heights 96–212 | Broad basin followed by a deep canyon; greenhouse, lattice tower, skyscraper and dam |
| E — Contemporary Sea Cliffs | 1,950–2,400 | L17–L20; heights 244–340 | Elevated sea-facing terraces, rising skyline and a final valley overlook |

The overall sequence becomes taller and more modern. Individual heights need not rise monotonically: the greenhouse and dam retain broad proportions. This is a curated sequence of architectural languages, not a complete global history or a claim that modern architecture is superior.

Provide at least one side route per region that rejoins the valley. Use three ridge/turn reveals that conceal part of a landmark before revealing its full form. Main fly-through openings need at least 12 units clear width; other principal flight openings should have at least 8. Narrower walking paths must not be presented as high-speed flight passages.

Use an authored heightfield plus separate cliffs and scattered rocks. Generation order: route and building footprints → regional elevation forms → constrained low-frequency noise → foundation flattening and blending → slope/moisture/material weights → detail scattering. Unconstrained noise must not determine the whole map.

- Flatten foundations within polygon/distance-field masks and blend outside them. Connect elevation changes with terraces, retaining walls and steps. No floating column feet, buildings buried in slopes or huge rectangular excavation scars.
- Exclude foliage/rocks from paths, entries, viewpoints and safe points. Design the dam together with its canyon, upstream reservoir basin and downstream channel; never suspend water above grass.
- Start with approximately 128-unit terrain chunks. Share boundary samples and implement actual LOD seam stitching or skirts. Visible terrain, ground queries and collision must agree.
- Give cliffs real sides and close the island underside. Leave a 60–100-unit offshore flight buffer; do not make the island a green sheet.
- Fix the seed and export terrain parameters, footprints, placements, exclusion masks and safe points for reproduction.

## 5. Camera and controls: requirements for monumental scale

Offline comparisons showed that the workbench's 35° FOV, elevated orbit and fit-all behavior make large structures look like tabletop models. **Preserve that workbench camera, but do not use it as the world camera.**

### 5.1 Camera

- First-person eye height: 1.65. Initial capsule radius: approximately 0.35. Explicitly calculate capsule height from its endpoints and radius.
- Default world FOV: 55°, with an initial tuning range of 50–65°. Validate portrait framing. Do not manufacture scale through extreme wide-angle distortion or zoom animations.
- Never trigger fitAll/resetCamera when assets arrive, LOD changes, the viewport resizes or the player approaches a building. Preserve position and orientation; resize updates aspect, projection and UI layout.
- Start near clipping at 0.1–0.2. Choose far clipping to cover local island landmarks rather than inheriting a short workbench limit. Check depth precision and z-fighting; a separate low-detail distant representation is acceptable. Freeze values against actual bounds.
- No default camera roll, head bob or automatic orbit cinematics. Convey size through nearby bases, doors, rails, low-angle views, occlusion, vertical travel and parallax.
- Give each building a ground viewpoint, an interior/pass-through route and a high viewpoint. Development orbit/side views supplement, not replace, first-person acceptance.

### 5.2 Input mapping

| Action | Desktop | Touch / keyboard alternative |
| --- | --- | --- |
| Move | WASD or arrow keys; normalized vector | Left virtual stick |
| Look | Mouse after gesture-driven Pointer Lock | Right-side drag; I/K pitch and J/L yaw, or equally explicit keyboard controls |
| Take off / ascend | Space | Ascend button |
| Descend / land | C | Descend button; smooth landing near a standable surface |
| Boost | Shift; support toggle mode | Separate toggle |
| Inspect / enter | E or portal threshold | Clickable action; Tab/Enter DOM links |
| Pause / release | Escape | Persistent pause control |

Default forward movement follows the camera's horizontal XZ direction; vertical movement is separate. Looking upward at a tower must not force upward travel. At extreme pitch, use the last valid yaw direction to avoid normalizing a zero vector. Initial speeds: walk 5, fly 15, boost 32 units/second. Use delta-aware acceleration and damping/stable integration, never fixed displacement per rendered frame.

Even a straight 2,400-unit route takes about 75 seconds at boost speed, and actual exploration is longer. Provide landmark jumps and return-home controls. These change local exploration state only, not business records or permissions.

Use explicit states for visible-but-not-controlled, exploring, paused, loading/transitioning, error and leaving. Clear held keys and accumulated movement when menus/forms open, pointer lock is lost, the window blurs or the document becomes hidden. Require explicit control resumption. Capture world input only while the scene is active; never intercept typing or block existing buttons.

On touch, distinguish UI gestures from camera dragging, support pointer capture and pointercancel cleanup, and avoid globally disabling scrolling. At 390×844, controls must not overlap or sit under safe areas. Aim for touch targets at least 44 CSS px. Reduced motion disables unnecessary foliage/cloud motion and camera smoothing without disabling deliberate movement.

## 6. Collision, invisible boundaries and recovery

Use independent simplified static world collision. Do not modify the server-authoritative workbench physics.

- Include terrain, main walls, floors, major columns and large rocks. Do not create colliders for every grass blade, cloud, pebble or capital ornament.
- Build separate wall/floor/column/opening proxies for enterable buildings. A single whole-building AABB must not seal the interior. Export visual passages and collision from matching versions.
- A capsule against a static BVH/Octree is an implementation option, subject to current dependencies. Discrete overlap queries are not continuous collision detection. Use sweeps or conservative substeps related to capsule radius and minimum effective obstacle thickness. If the substep budget is exhausted, slow movement rather than skipping the remaining distance.
- Clamp elapsed time and accumulator growth after suspension. Test wall sliding, corners, slopes, low ceilings and high-speed impacts.
- Use a continuous ramp proxy for broad shallow steps where appropriate, without allowing movement over visible empty holes. Oculi, arches, open lobbies and platform holes must remain genuinely traversable.

The horizontal invisible boundary follows an expanded closed coastline, not chunk edges or a crude island-wide rectangle. Begin soft wind/text feedback roughly 40 units before the hard boundary and progressively reduce outward speed. At the hard limit, remove only the outward velocity component, preserving tangent and inward motion. Do not bounce the player. Use valid inside/outside and nearest-boundary calculations for nonconvex shapes, not a radial assumption from the island centre.

Initial ceiling y=640 must be validated as at least 100 units above the highest actual world-space landmark top. The approximate y=8 lower flight limit applies over sea only, not as a universal ground plane. Intersections of horizontal and vertical limits must still allow return.

Safe points have stable IDs, positions, orientations and chunk ownership. Check ground and capsule clearance. Prefetch approaching collision; slow or block entry while it is unavailable. Load a jump destination before moving the camera. Detect non-finite positions, out-of-bounds movement and abnormal falls. Always provide “Return to nearest safe point” and “Return home.” Recovery must not save, delete or otherwise modify works.

## 7. Landmark generation pipeline

Appendix A lists all target dimensions. Appendix B defines the shared component language and all L01–L20 construction courses. All 20 are required in the final result. One finished building plus 19 placeholder towers is not acceptable.

### 7.1 Geometry rules

Preset-only stick sizes: B=8×1×1, M=4×0.5×0.5 and D=1×0.125×0.125. Preserve 8:1:1 proportions. Never stretch one stick independently into a wall panel, slab or hundred-metre column. Use bundles, box beams, lattices and layered assemblies for thickness. Curves use tangent pieces, rings, ribs and cross-links; wood-textured boxes or smooth spheres are not substitutes.

Build silhouettes, openings, flutes, capitals, arch depth, dome ribs, setbacks and braces as geometry. Rear shading shells and limited foundation/roof infill are allowed, but close views must reveal timber assembly. More pieces alone do not demonstrate better architecture.

Each generator consumes a fixed seed and its own recipe, then emits pieces, course-level BOM, actual bounds, LOD, collision, entrances, viewpoints and safe points. Retain buildingId/componentId/stage/courseIndex/pieceType/transform per piece. Assign shared members once, remove fully coincident identical instances, and distinguish intentional overlapping joints from accidental duplication.

Reuse primitive arch/column/truss functions, but preserve distinct plans and structural organizations. The modern sequence includes curtain-wall framing, bundled tubes, triangular bracing and a three-wing setback tower. Do not use one `tower(height,width)` generator for all of them.

### 7.2 Resolve paper recipes into executable specifications

The appendix contains design inputs, approximate values and dimensions still requiring geometric resolution. Before generating each building:

1. Resolve “approximately,” actual span lengths and curve subdivisions into explicit parameters or deterministic formulas. Compute arc lengths, rotated bounds and top elevations.
2. Validate construction-band boundaries, shared grids, openings and member connections. Do not hide disconnected layers through framing.
3. Freeze recipeVersion, expand every course and calculate actual B/M/D counts and a complete BOM.
4. Compare actual W/D/H with targets, initially within ±1%. Account for section thickness and overlapping stick ends by adjusting paths; do not non-uniformly scale the entire completed building into the envelope.
5. If the design contains an inconsistency, make a justified geometric revision and record original value, revised value, reason and visual/route impact. Do not use this permission to remove architectural identity or buildings.

A 1- or 2-metre platform “layer” in the appendix is a macro construction band, **not a walkable stair riser**. Along approach routes, subdivide it into shallow steps, initially 0.20–0.30 high and 1–2 deep, preserving overall platform elevation while recalculating footprint and BOM. Provide ramp/flight alternatives. Non-walkable base bands may remain monumental.

### 7.3 Standard components to validate first

Create a development-only preview for Doric, Ionic, Corinthian and lotus/papyrus columns; broad shallow stairs; a 22-metre round arch and a pointed arch; part of an eight-lobed dome; a 32-metre braced facade; and a four-bay dam spillway. Keep assembly-debug controls out of normal player navigation.

When reusing the ZIP, verify transforms, Three.js material integration, instance bounds, joints and collision separation. GLBs are merged geometry review assets, not necessarily the production representation. Prefer converting per-piece JSON into compact instance data and reusing the project's wood material. Do not keep enormous Python-style nested JSON objects resident in the browser.

Columns need taper/entasis, recessed flute backs, layered outward capital projection and genuine curled volute paths. Corinthian leaves must read as broad, opening, pointed clusters rather than loose wires. Sample counts around 3,300/4,600 are not minimum quotas: validate recognizable geometry and appearance.

### 7.4 Mandatory fin-shaped spillway revision to L16

Preserve Appendix L16's curved plan, thick-base/thin-crest section, crest road, intake towers, powerhouse and canyon relationship. Add the user's explicit requirement: **multiple gate bays, fin-shaped dividing buttresses, bottom-wide/top-narrow sections and continuous spillway faces spreading toward the toe.** A curved tall wall alone is insufficient.

Offline reference: five buttresses at X=-32,-16,0,16,32; 112 body courses at 0.5 spacing, nominal body height 56. For course centre y=0.5j+0.25 and t=y/56, half-width is `1.1+2.1(1−t)`, downstream nose is `z=4+30(1−t)^1.7`, and upstream back is z=-6. Four bay centres are X=-24,-8,8,24. Recess upper gates and use continuous chute faces `z=5+20(1−y/56)^2`. Bridge, caps and rails bring the sample's total height to 61.75.

These are local component parameters, not permission to replace the 160-high landmark with the 61.75-high sample. Prefer a lower downstream spillway annex integrated with the powerhouse and channel. If using full-height fin walls, regenerate course counts and member lengths with B/M/D pieces rather than stretching all individual sticks. Export a final L16 section identifying main dam, gates, spillway, water levels and powerhouse. This is an original hybrid landscape structure, not an accurate Hoover Dam reconstruction or a hydraulic engineering validation.

Lightweight directional water shading/animation is sufficient; fluid simulation is out of scope. Every water surface needs a channel, direction and receiving body. No floating water, uphill flow or unexplained wall penetration.

## 8. Environment art and assets

Create a soft but spatially layered grassy island. Sky: Children of the Light is an inspiration for atmosphere, travel and landmark reveals only. Do not extract or reproduce proprietary maps, characters, audio or assets.

### Ground and grass

Deliver all three scales: large 30–100-unit colour variation; medium-scale grass/soil/rock blending; actual close-range grass clumps. Initial slope rules: below 25° mostly grass, 25–40° mixed, above 40° mostly rock, with authored overrides. Thin grass along path centres; cluster it at edges, depressions and rock bases rather than distributing it uniformly.

Create original low-poly instanced blades/clumps with anchored roots and tips driven by a common wind field. Concentrate near detail within about 40 units and fade over 40–80, adjusted by quality. Use fixed seeds and exclusion masks for buildings, collision routes and safe points. No per-blade collision.

### Rocks, cliffs, sea and clouds

- Use 6–10 distinct major rock silhouettes plus 2–3 rubble-cluster types. Distribute along cliff feet, ridges and erosion patterns while preserving quiet open meadows.
- Blend grass into exposed soil and cliff rock. Use suitable UVs or triplanar projection on steep faces. Low coastal flight must not reveal stretched textures, seams or a paper-thin island.
- Align sky and sunlight. Separate distant cloud masses, mid-distance ridge bands and low sea/valley mist. Keep landmark viewing windows; uniform dense fog must not hide missing detail.
- Control transparent overdraw. Do not require fullscreen volumetric raymarching or realtime reflections for the base experience. Start water with normal variation, highlights, depth/colour cues and shoreline foam. Preserve the same coastal silhouette on low quality.
- Use warm timber, cool grey-blue rocks, blue-green sea and green-gold grass. Preserve contact shadows and flute shadows. Avoid washed-out exposure that erases construction detail.
- Do not force audio or create conflicting settings. Any ambience reuses existing controls, starts after the required user gesture and has traceable licensing.

### Sourcing and processing

Candidates: Poly Haven `leafy_grass`, `grass_path_2`, `aerial_grass_rock`, `rocky_terrain_02`; suitable rocks from Kenney Nature Kit. These are source candidates, not assets already supplied. Verify the actual download's license and package information; retain only used assets.

Prefer original generated terrain, clouds, grass and timber assemblies. Grade external textures and reduce noisy normals/high-frequency contrast so realistic turf does not clash with stylized architecture. Export 1K/2K and low-quality variants. Where supported, use compressed textures and compatible same-origin decoders for the pinned Three.js version, with an appropriate fallback.

Record sourceUrl, author, license, licenseUrl, downloadedAt, original hash, modifications, output paths, colour space, resolution and compression in `assets/sources.json` or the repository equivalent. Treat colour maps separately from normal/roughness/mask data. Do not hotlink asset sites or ship unused packages/8K originals. Credits list actual use. If a download is unavailable, make a sufficiently finished original alternative and document it; a plain green placeholder plane is not acceptable.

## 9. Frontend architecture and data contracts

Follow the repository's current style; do not start by migrating to another 3D framework or rewriting the app. Suggested responsibilities, with paths adapted to the real repository:

| Module | Responsibility |
| --- | --- |
| WorldScene / WorldViewport | Renderer/camera lifecycle, scene, frame scheduling, resize and context recovery |
| WorldInput + FlightController | Input mapping, control state, velocity and orientation; no business logic |
| WorldCollision | Static proxies, terrain queries, boundaries and safe points |
| WorldStreamer | Chunk/landmark states, prefetch, cancellation, retry and eviction |
| terrain / environment | Terrain, grass, rocks, sea, sky, clouds and shared wind |
| landmarks/components + recipes | Reusable structural pieces and 20 independent recipes |
| world-manifest | Versions, hashes, regions, placements, bounds, LOD, collision and route points |
| WorldOverlay | Minimal guidance, controls, pause and landmark navigation |
| ExistingFeatureBridge | Existing links/actions and read-only public adapters; no duplicated business logic |
| scripts/build-world | Offline generation, BOM/bounds/resource checks and static outputs |

Add `/world/` only if appropriate for the existing router. A shared runtime with home/exhibition modes is also valid. Inspect routing first and make the smallest integration change. Preserve actual Gallery/Works/Exhibit/Join routes and `/readme/`; do not assume old notes identify their current names correctly.

Provide a validated manifest schema. For example:

```ts
type LandmarkSpec = {
  id: string; regionId: string; recipeVersion: string;
  kind: 'world-preset'; title: string; inspiration: string;
  targetSize: [number, number, number];
  placement: { position: [number, number, number]; yaw: number };
  localBounds: { min: number[]; max: number[] };
  lods: { level: number; asset: string; hash: string; bounds: unknown }[];
  collision: { asset: string; hash: string };
  entries: string[]; viewpoints: string[]; safePoints: string[];
  bom: { asset: string; totalUniqueParts: number };
};
```

This illustrates content structure, not a requirement to keep weak `unknown` or unconstrained array types. Implement explicit vectors/bounds and runtime checks for unique IDs, valid paths, finite values and matching asset versions. Retain deterministic generation inputs. Resolve content at build time instead of constructing a million-piece island on first load.

Use TypedArrays/compact transforms per building or construction band. Generate large geometry offline in Node/Python; workers may decode local chunks. Do not freeze the startup main thread for seconds. Generator dependencies must not become production-server runtime work.

## 10. Streaming, LOD and performance

Presets are same-origin static assets. The server must not retain 20 high-detail models or their rigid bodies. Do not increase Fly resources merely to hide an avoidable frontend-content burden.

- Instance shared geometry/material by region, building or suitable construction band. Neither one Mesh per stick nor one island-wide unculled InstancedMesh is acceptable. Maintain correct instance bounds.
- Expand near detail for the closest 1–2 buildings, with local detail driven by distance/screen error. Mid detail preserves capitals, openings, dome ribs and main braces. Far detail preserves distinct silhouettes and major openings.
- All 20 landmarks can have cheap distant silhouettes. They do not all need full detail resident. Initial mid-detail guidance is 1,500–6,000 equivalent members/building; far guidance is 1,000–4,000 triangles/building. Measure and tune.
- Use LOD hysteresis. Collision must not close doors or vanish when visual LOD changes. Reduce grass, shadows and cloud density before removing routes, input or existing feature updates.
- Load priority: essential home terrain/portals/silhouettes → local collision → nearby landmarks → forward flight direction → distant detail. Track unloaded/loading/ready/error states, bounded concurrency, hash deduplication, cancellation and stale-result rejection.
- Use eviction hysteresis. Explicitly manage GPU disposal, CPU arrays and shared-texture reference counts. Repeated visits must not cause sustained growth.
- Maintain one active RAF. Dispose world listeners, pointer lock, RAF and subscriptions when entering the workbench, and vice versa. Cleanup must survive development-mode remounts.
- Reuse existing quality preferences and adaptive behavior rather than introducing a competing Auto system. Preserve the semantics of explicit High selection. Pause when hidden, reduce idle rendering where appropriate and wake reliably for input/asset changes.
- Handle webglcontextlost/restored while retaining usable menus. Recreate necessary resources; if recovery fails, offer flat access instead of endless reloads.

| Initial target, not an established result | High | Medium | Low |
| --- | ---: | ---: | ---: |
| Draw calls in the current frame | ≤250 | ≤150 | ≤90 |
| Visible triangles in the current frame | ≤1.2 million | ≤600,000 | ≤250,000 |
| Nearby grass-clump instances | ≤40,000 | ≤15,000 | ≤3,000 |
| Estimated resident textures | ≤192 MB | ≤128 MB | ≤64 MB |
| DPR cap | 1.5 | 1.25 | 1.0 |

Measure geometry, shadow passes, framebuffers and JS memory; texture estimates are not total GPU memory. Initial compressed-transfer targets: interactive home ≤5 MB, additional critical island entry assets ≤8 MB, cumulative full-tour content around 40 MB. Report bottlenecks and tradeoffs if exceeded; do not secretly omit required landmarks.

Aim for approximately 60 fps on desktop and 30 fps on mobile, with actual device/browser/viewport/quality/build recorded. Report frame-time distributions and long frames, not the best second. Offline software rendering and a cloud browser without WebGL cannot establish performance acceptance.

### 10.1 Mandatory memory and execution limits — preserve the complete original scope

This subsection adds resource-safety constraints to this complete prompt. All existing requirements, visual ambitions, protected features, implementation phases, 20 landmark recipes and appendices remain in force. Do not replace this prompt with a shorter performance brief. Optimize representation, residency and execution order; do not remove buildings, simplify every landmark into a generic tower, reduce the prescribed architectural variety or disable existing workflows to meet a memory target.

The user reports that memory became saturated on a computer with approximately 30 GB of RAM and WSL/VS Code exited unexpectedly during implementation. Treat resource exhaustion as a reported incident, not a confirmed diagnosis. Host RAM is not the same as WSL's available memory. Browser rendering budgets in Section 10 do not constrain generators, bundlers, test processes or their combined peak usage; enforce the following additional limits before resuming expensive work.

**A. Inspect, preserve and bound the work.**

- Preserve current source changes, completed assets and known-good manifests. Inspect available memory, swap, active task processes and accessible failure logs before restarting. Identify whether the main pressure comes from asset generation/export, compilation, tests, browser/native allocations or overlapping jobs. Record uncertainty when logs cannot establish the cause.
- Initially permit only **one memory-intensive job at a time**. Do not overlap landmark generation, bundling, type checking, texture compression or browser test suites. A browser and its required development server form one measured job group. Use one test worker initially; collaboration tests must still use separate client identities/contexts where required.
- Measure WSL `MemTotal` and baseline `MemAvailable` immediately before the job. Set the initial aggregate task-process budget to `min(8 GiB, 0.50 × MemTotal, 0.50 × baseline MemAvailable)` and retain a free-memory reserve of `max(2 GiB, 0.15 × MemTotal)`. These are conservative starting limits, not claims about measured consumption or a guarantee against every OOM event. If the environment cannot support them, split the job further instead of increasing its allowance automatically.
- For each asset-generation worker, target peak RSS at or below **2 GiB**, with an initial safety ceiling of **4 GiB**, further restricted by the aggregate budget. The aggregate budget includes the supervising process, workers, required server and task-owned browser processes. Track their RSS as a conservative indicator and also observe system memory pressure; shared pages can make summed RSS overestimate unique physical usage.
- Implement a lightweight supervisor that samples approximately once per second. Stop scheduling work and checkpoint/cancel the current job with headroom before crossing its budget or exhausting the reserve. Use bounded allocations as well as monitoring: sampling alone cannot prevent a sudden allocation spike. Terminate only processes belonging to this task, never blanket-kill unrelated Node, browser or WSL processes.

**B. Generate assets with bounded memory.**

- Process **one landmark and one LOD at a time**. Within that job, process bounded construction bands/chunks; begin with approximately 10,000–25,000 instances per chunk and impose an explicit byte cap covering attributes, temporary buffers and export overhead. Smaller chunks take precedence whenever the measured budget requires them.
- Represent repeated sticks with shared primitive geometry and compact transforms/material identifiers. Do not create a heavyweight scene node, independent mesh or independent geometry for every stick. Stream chunks with backpressure; do not enqueue an entire world behind a slow writer or compressor.
- Never simultaneously retain all detailed scene objects, per-piece geometry, a concatenated mesh, a full JSON serialization and compressed output. Compute bounds and bill-of-material totals incrementally. Generate medium/far LOD directly from architectural rules instead of constructing and retaining the complete high-detail world merely to simplify it.
- If reusing component-lab scripts, inspect their allocation behavior first. A demonstration that collects per-stick meshes, concatenates them and eagerly constructs several scenes is not an acceptable production generation pipeline. Its presence alone does not prove it caused the reported crash.
- Prefer short-lived workers per landmark/LOD so completed jobs release native allocations as well as language-level references. If the heaviest landmark exceeds the ceiling, subdivide its construction bands/export units further. Use simple semantic collision volumes; decorative members must not each become physics bodies or detailed collision meshes.
- Checkpoint outputs by recipe/generator version, content hash, landmark, LOD and chunk. Write to temporary files and atomically publish validated outputs on the same filesystem. On restart, validate and reuse finished chunks, regenerate only missing/stale/incomplete chunks and retain the previous working manifest until the replacement is complete. Cancellation must be safe and resumable.

**C. Bound runtime residency and verify the result.**

- Preserve all 20 distinct distant landmarks while loading high detail locally as required by Section 10. Bound pending requests, decoded CPU buffers, resident GPU assets and the LOD cache; cancel stale requests and evict unused detail with hysteresis. Release geometry, textures, listeners and obsolete references when their ownership ends. Repeated travel or switching between the world and workbench must not accumulate old scenes.
- Record generator peak RSS, aggregate task-process peak, available-memory minimum and browser behavior separately. JavaScript heap measurements do not cover all native, ArrayBuffer or GPU allocations. RSS already includes resident heap/native allocations; do not add those categories to RSS as though they were independent totals. Renderer object counts are not measured GPU bytes.
- A larger Node `--max-old-space-size` is not a total-process memory limit. Do not respond to this incident by assigning a 16–24 GiB heap, silently increasing WSL allocation/swap or requiring the user to buy more RAM. Any later tuning must follow measured evidence and preserve system headroom.
- Validate in this order: one bounded component chunk → one complete simple landmark → the most demanding landmark → interrupted generation and successful resume → all 20 landmarks generated sequentially → repeated browser tours and world/workbench transitions → relevant existing checks, run sequentially. Report actual peaks, environment and incomplete validation honestly. Do not claim the original WSL crash is fixed without reproducing and validating in a comparable environment.
- Treat successful bounded generation, resume behavior and stable repeated runtime visits as acceptance requirements alongside the original visual and functional requirements. If a budget fails, revise chunking, ownership, streaming or scheduling and rerun the affected check. This subsection controls execution concurrency wherever necessary; it does not reduce the original product scope or authorize changes to existing buttons, entry points or features.

## 11. Fallbacks and accessibility

WebGL-capable browsers receive the full world. When WebGL is absent, context recovery repeatedly fails or critical resources are unavailable, keep existing navigation, flat exhibits and creation workflows with a short explanation and retry option. Never leave a blank page.

Every spatial portal has an equivalent DOM link; information on spatial plaques is also available through normal UI. Show keyboard focus, release control with Escape, restore focus sensibly after overlays, and avoid traps. Do not force initial pointer lock, audio or camera shaking. Back/forward navigation, deep links, resize and quality changes must have coherent results.

Keep `/readme/` fully readable. Check z-index, pointer-events, input capture and scroll containers through actual operations: visible old buttons that cannot be clicked are a regression.

## 12. Implementation phases

### P0 — Baseline and integration boundary

Read rules, record HEAD and the feature-protection matrix, run relevant baseline checks, isolate world/workbench responsibilities and establish a reversible scene integration. Confirm existing workflows remain reachable.

### P1 — A real vertical slice

Build the three-portal visual framework, one meadow/cliff segment, one traversable monumental structure, first-person flight, pause, boundaries, safe recovery and low-quality fallback. On desktop and 390×844, enter, explore and return to an existing feature before expanding.

### P2 — Components and art pipeline

Import/translate the offline samples and validate columns, shallow steps, arches, domes, braces and spillway in the actual Three.js viewport. Finish ground blending, cloud/sea lighting and traceable asset processing before mass duplication.

### P3 — Five regions and 20 landmarks

Implement every recipe, generate BOM/LOD/collision/viewpoints, settle foundations into terrain and complete the winding corridor and side routes. Temporary placeholders are allowed during development, not in the final 20-building delivery.

### P4 — Opening experience and existing-feature connections

Wire all three portals to real destinations and regress the protection matrix. Preserve the old gallery. Add read-only spatial stands only where the existing public interface is sufficient; do not introduce social backend systems.

### P5 — Verification, optimization and evidence

Test both viewports, keyboard/touch, slow networks, flight collision, disposal and affected collaboration flows. Diagnose and fix failures before accepting results. Record genuine decisions under existing conventions. Do not rewrite historical reflections or fabricate user observations.

Do not stop after P1 or report a plan for 20 buildings as their implementation. If genuinely blocked, identify exactly what is incomplete and leave reproducible work; do not claim total completion.

## 13. Acceptance and evidence

### 13.1 Visual and spatial review

Fix seed, camera and time/wind phase. Capture actual browser views of the home, close grass, ridge reveal, capital detail, shallow steps, dam toe looking up, dam side section, dome interior, low coastal flight, highest-tower valley view and mobile controls.

For each building, provide ground, side/45°, detail and high views. Remote beauty shots alone are insufficient. Verify at least three defining features, one entry/pass-through route and a safe viewpoint per building. The development inspector supports base/columns/beams/arches/roof/details and course selection without exposing these tools in the ordinary interface.

Scale acceptance uses the default 1.65-eye-height camera at a column base, dam toe and tower base. Approach must create real parallax; flight must connect bottom and top; looking down must reveal genuine height. The camera must not retreat automatically. Numeric heights and illustrative images are not acceptance. If the browser view still feels like a toy, revise framing, approach distance, references and proportions instead of merely increasing height.

### 13.2 Meaningful automated checks

- At least 20 unique target landmarks, including L01–L20, each with recipe, generated output, LOD, collision and entry/viewpoint data; not 20 names for one asset.
- Finite transforms, valid rotations, allowed piece sizes, actual bounds within agreed tolerances, BOM coverage per course, no exact shared-member duplicates and reports for invalid critical connections.
- Clearance probes through marked passages and at safe points; terrain seams; spawn/jump positions outside walls and above valid ground.
- Regression cases for high-speed collision, boundary sliding, intersecting limits, pause recovery, blur/key clearing, pointer-lock loss and unready collision chunks.
- Original link/handler/visibility behavior, UI clickability and cleanup of world keyboard listeners/RAF.
- If real works are projected, public fields only, correct snapshots and withdrawal/deletion behavior, without exposing private data.

Test real contracts and geometric constraints. Do not write tests for every colour constant or treat exporting 20 files as proof of visual quality.

### 13.3 Interaction and performance route

At both 1920×1080 and 390×844: open home → enter world → enter a building → fly from bottom to top → recover safely → open original My Works/workbench → return to the original exhibit list. Also test keyboard-only operation, mid-interaction resize, slow/failed resources, tab suspension/resumption and resource behavior over 10 world/workbench round trips.

Use two independent identities to regress affected existing collaboration paths: live placement updates, contention/rejection, save/refresh, reconnection, role permissions and existing publication/archive semantics. Reuse current test methods. Mark unavailable deployment/restart/persistence checks unverified; do not manipulate real works to manufacture evidence.

Run required repository checks, including `pnpm check`, `pnpm check:evidence` and relevant affected tests, adapting only to the actual repository command names. Do not modify fixed course tests or weaken assertions. Separate baseline failures from regressions.

Without a real WebGL environment, continue executable code/geometry/test work, explicitly mark browser visuals, interaction and GPU performance as unverified and provide reproduction commands. Do not pass generated renders off as browser evidence.

## 14. Deliverables and final report

Deliver in the working tree:

1. A functioning home/world/gallery experience, controls, collision, streaming and existing-feature integration.
2. Twenty independent recipes, reproducible generators, static assets, LOD, collision, manifest and actual course-level BOMs.
3. Asset provenance, licenses and credits for actual use.
4. The protection matrix, decisions, geometry/collision/performance/two-viewport evidence and known limitations.
5. Necessary run/generate/verify instructions. Update README/PROCESS around actual results and course word-count guidance; link detailed evidence. Do not write agent-produced drafts as if they were the user's personal research observations.

Follow repository procedures and existing user authorization for production deployment. Do not deploy, alter real data or delete works without authorization. Follow local/session instructions for commits; never invent commit links. Before committing, cite accurate files and test records.

Final report order: visible results and access instructions; preserved features and their verification; 20-building completion table; actual checks; performance/resource data; failures and unverified items; modified files and commands. Distinguish implemented code, local execution, deployment verification and user observations. “Completed a high-quality Sky-style world” is not a sufficient report.

---

# Appendix interpretation

The following recipes preserve the detailed design inputs. The main prompt takes precedence, particularly for unchanged business features, no new social backend, subdivided walkable steps, L16's fin-shaped spillway, and actual versus estimated BOMs. Approximate dimensions require resolution, not silent substitution. Module counts are not automatically unique-piece totals.

## Appendix A — All 20 landmarks: dimensions, identity and openings

All dimensions below are **project design values**, ordered width × depth × height, including architectural crowns but excluding terrain. They are not measurements of the historical originals. Preserve prototype construction language while adapting proportions for flight. Each landmark needs its own plan, silhouette and route; height variations of one generic tower do not count as distinct buildings.

| ID | Region / design name | Inspiration / period | Target envelope W×D×H | Defining organization |
| --- | --- | --- | --- | --- |
| L01 | A / First Lintel Ring | Stonehenge-like lintels and rings / prehistoric | 72×56×32 m | Three foundation bands, 20 outer posts, five inner portal pairs and staggered lintels |
| L02 | A / Lotus Column Forest | Karnak hypostyle hall / ancient Egypt | 144×104×44 m | Low side aisles, high central hall, 48 bundled-stem columns with differentiated crowns |
| L03 | A / Ridge Doric Temple | Parthenon column order / ancient Greece | 96×184×52 m | Three-level platform, 46 outer columns, architrave/frieze/cornice and pitched pediments |
| L04 | A / Volute Terrace Palace | Erechtheion-inspired Ionic language / ancient Greece | 112×128×56 m | Unequal terraces, main hall and side porch, volutes and stepped roofs |
| L05 | B / Triple Aqueduct | Pont du Gard stacked arches / ancient Rome | 300×20×68 m | Three unequal arcade tiers, 6/11/35 openings and a top water channel |
| L06 | B / Ring Theatre | Colosseum / ancient Rome | 240×196×78 m | Three arcade levels, upper solid/open wall band, ring corridors and seating |
| L07 | B / Oculus Hall | Pantheon / ancient Rome | 112×144×86 m | Portico, rotunda, hemispherical dome, five coffer bands and open oculus |
| L08 | B / Floating Dome Hall | Hagia Sophia pendentives / Byzantine | 136×176×96 m | Four piers and arches, pendentives, central dome and two half-domes |
| L09 | C / Double-Ring Sea Castle | Carcassonne walls and towers / medieval | 176×152×108 m | Two wall rings, eight outer towers, six-storey keep, conical roofs and crenellations |
| L10 | C / Pointed-Arch Cloud Nave | Amiens ribs and flying buttresses / Gothic | 112×216×128 m | Eight nave bays, two-level aisles, pointed windows, twin towers and central spire |
| L11 | C / Eight-Lobed Dome Palace | Florence Cathedral dome / Renaissance | 128×184×144 m | Hall, octagonal drum, double-shell eight-lobed dome and lantern |
| L12 | C / Embrace Square | St Peter's colonnade and dome composition / Baroque | 280×240×154 m | Four-deep curved colonnades, central facade, drum and dome |
| L13 | D / Lattice Conservatory | Crystal Palace modular framing / mid-19th century | 320×160×96 m | Low wings, high nave and transverse barrel vault; deliberately broad |
| L14 | D / Four-Leg Wind Tower | Eiffel Tower / late 19th century | 100×100×188 m | Four curved tapering legs, two major platforms, converging lattice and summit |
| L15 | D / Setback Crown | Empire State Building verticality / 1930s | 112×88×212 m | Eight lower floors, 20 middle floors, 12 tower floors, four crown floors and mast |
| L16 | D / Curved Gorge Dam | Hoover-inspired arch-gravity form / 1930s | 360×160×160 m | Curved thickness transition, crest road, four intake towers, powerhouse and required fin spillway |
| L17 | E / Vertical Court Tower | Seagram facade rhythm / postwar modernism | 80×56×244 m | Open lobby, 52 floors and equipment crown; depth-separated mullions and bands |
| L18 | E / Nine-Bundle Cloud Tower | Willis Tower bundled tubes / 1970s | 90×90×276 m | Nine square tubes terminating at different levels over 60 floors |
| L19 | E / Prismatic Brace Tower | Bank of China Tower / 1980s–90s | 88×88×304 m | Four triangular parts, 64 floor bands, eight-floor brace modules and sloping crowns |
| L20 | E / Three-Wing Skyline Peak | Burj Khalifa wing setbacks / 21st century | 144×132×340 m | Three wings and hexagonal core, 72 floors, six-floor setback cycles and spire |

Regional height ranges are 32–56, 68–96, 108–154, 96–212 and 244–340 m. L13 and L16 intentionally retain horizontal breadth. Terrain may elevate their viewing position, but never present terrain elevation as building height.

Principal flight openings should provide at least 8 m clearance; main-route crossings at least 12 m. Not every historical window needs to be traversable. Organize movement through main doors, courts, arches, roof apertures and platforms. Collision proxies must preserve these routes.

## Appendix B — Timber construction language and complete building recipes

### B1. Assembly scope and stock sizes

These are **original digital-exhibition assembly specifications**, not real timber construction drawings or claims that gravity alone will stabilize them in the current Rapier workbench. Presets use fixed static assemblies with visually credible joints and supports. Real player works retain existing physics and persistence rules.

The existing stick proportion is 8:1:1. Preset stock sizes are B=8×1×1 m for primary framing, M=4×0.5×0.5 m for secondary structure and D=1×0.125×0.125 m for flutes, volutes and moldings. These do not become new player-editable stock types. Never stretch one piece into a hundred-metre post or independently scale its width/thickness into a panel.

Build thick components as bundled columns, hollow box beams, double-chord trusses or layered sticks. Rear shading shells are allowed, but primary silhouettes, openings, details and joints must be geometry, not wood-textured boxes.

Distinguish:

- **Storey:** a visible or usable architectural floor, such as tower floors 1–52.
- **Construction band:** a functional vertical zone, such as base, shaft, capital, entablature or roof.
- **Assembly course:** an indexed placement sequence, such as shaft segments 1–8, arch angular segments or dome rings 1–24.

Nominal course heights locate components; member ends may overlap neighboring bands, but actual bounds must include them. Avoid unexplained over-height or disconnected floating layers. Expand repetitive courses with explicit indices and formulas; “repeat until it looks right” is not a specification. Heights below are local to the building foundation.

### B2. Shared component functions and counting

All lengths below are project design units. Functions return both geometry and piece lists.

| Symbol | Count and placement |
| --- | --- |
| `C(l,u)` — straight chain | For length l and stock length u, use `ceil(l/u)` pieces. For n≥2, distribute overlap to align chain ends. If l<u, select smaller stock; for an independent segment shorter than 1 m, revise the detail rather than cutting a stick. Count diagonal chains by actual length. |
| `R(w,d,u,q)` — rectangle frame | `2q[C(w,u)+C(d,u)]` pieces, where q is parallel-chain count. Lay each side along its path. Corner joints may overlap, but do not instantiate the same piece twice. |
| `G(w,d,p,u)` — floor grid | Upper layer: `(floor(d/p)+1)C(w,u)` pieces. Perpendicular lower layer: `(floor(w/p)+1)C(d,u)`. Add a continuous collision surface only where justified; major platforms need visible contiguous upper decking, not invisible floors over open grids. |
| `F(w,h,u,q)` — truss face | Two verticals, top/bottom horizontals and two diagonals: `q[2C(h,u)+2C(w,u)+2C(sqrt(w²+h²),u)]`. Offset crossing X members by a section thickness to prevent coplanar flicker. Repeated courses create only their top rail; reference the previous course's shared lower rail. |
| `P(r,n,u,q)` — polygon ring | n chords of length `2r sin(π/n)`; count `qn max(1,ceil(chord/u))`. Lay pieces along chords. If a chord is shorter than stock, overlap complete pieces into neighboring angular segments and include their actual bounds. Do not replace near-detail rings with smooth tori. Offset alternate layers by half a segment where appropriate. |
| `A(w,rise,t,d,u)` — arch | Generate semicircular or two-centred pointed inner/outer curves. Keep each chord ≤0.8u; derive and report segment count N. Front/back faces each have inner/outer tangent members: 4N pieces. Add radial chains per segment per face: `2NC(t,u)`. Every four segments add a depth tie chain: `ceil(N/4)C(d,4)`. List extra internal ribs separately. |
| `DOME(r,h,k,m,u)` — rib-and-ring dome | m meridional ribs, each split into k segments and counted using actual chord lengths through C. Generate k horizontal rings with P. Give every ring radius as an array or fixed formula. Count ribs, rings and infill separately; shrinking square frames are not a dome. |
| `WALL(L,H,p)` — wall frame | Vertical positions every p along L; M/B chains and horizontal frames at the specified course heights. Omit infill within doors/windows, retain their frames and brace every two bays. Staggered timber facing gives a solid wall appearance; do not fill the entire volume. |

Rectangle dimensions describe structural paths; the outside envelope also includes section thickness. Derive paths from target outer bounds rather than placing centre-lines at the full target width and then exceeding it. Initial envelope tolerance is ±1%; report deviations.

Determine the curve before selecting segments and stock. Tangent and radial arch members should express wedge-like construction rather than disconnected horizontal pieces arranged in a semicircle. Dome form comes from ribs, shrinking rings and cells, not a textured sphere.

Return `partId / buildingId / stage / courseIndex / pieceType / transform / count`. Define ownership of shared members, for example the lower-numbered bay creates a shared column and the next bay references it. Report final unique-piece totals after expansion/deduplication, not just sums of overlapping module counts.

### B3. Required column-order differences

| Order | Required geometry |
| --- | --- |
| Doric | Shaft stands on the platform without an Ionic-style circular base; 20 longitudinal flutes; taper with slight entasis around the lower third; outward-flaring support below a square abacus; triglyph/metope-like alternation above. |
| Ionic | Layered base, 24 flutes, slimmer shaft, paired volutes on both front and back; three progressively projecting architrave bands. Do not reuse a generic widening box capital. |
| Corinthian adaptation | 24 flutes; lower eight and upper eight staggered leaf clusters, each with at least five inclined D members opening outward; a pair of short volutes at each of four corners; an expanding bell-like capital silhouette. |
| Lotus/papyrus bundle | 12 or 16 stem bundles; closed bud capitals on low columns and open flower crowns on high columns. Do not substitute European volutes. |

A flute is a continuous recessed shadow channel. Combine raised ribs with set-back backing members. Do not stick 24 convex rods onto a smooth cylinder and call the gaps flutes; the core must not obscure the recesses.

### B4. Legacy paper example — a 30 m Ionic column

**This exact 1,624-piece recipe has not been generated and accepted.** It is distinct from the 3,306-piece offline sample. Validate before reuse in L04 and adjust shaft segment count rather than non-uniformly scaling the whole assembly. Paper dimensions: shaft length 24 m, approximate outer diameter 4 m, capital envelope approximately 6 m.

| Band | Course placement and count | Subtotal |
| --- | --- | ---: |
| Base 0–2 m | Five 32-segment D rings with radii 2.8/2.65/2.35/2.5/2.15 m from bottom to top; 16 vertical M members connect the base and shaft start | 160D + 16M |
| Shaft 2–26 m | Eight 3 m rises. Each segment: 24 near-vertical M ribs with about 1 m overlap; three D backing pieces per flute, 72 total; 24 D ring connectors | 192M + 768D |
| Taper | Segment radii 2.00/2.03/2.04/2.02/1.97/1.91/1.84/1.76 m; join along the continuous profile, not independently displaced blocks | No extra pieces |
| Neck 26–27 m | Two 24-piece D rings; 16 vertical M internal ties linking capital and abacus | 48D + 16M |
| Flaring support 27–28.5 m | Six horizontal 32-piece D rings, radii 1.8/1.95/2.1/2.25/2.4/2.55 m | 192D |
| Volutes 28.5–29.5 m | Four volutes, two per face; each has 24 D pieces tangent to an inward-tightening planar spiral over about 1.25 turns; 16 D connecting members | 112D |
| Abacus 29.5–30 m | Four 6 m square-frame layers, 24D each, alternating direction/staggering joints; four 6 m cross-chains, 24D total | 120D |

Paper total: **1,624 pieces = 224M + 1,400D**. Detect exact duplicates and report any count change. This is a project recipe, not an ancient component inventory. Verify ring/core connections, seams and actual bounds before acceptance.

The user's progressively projecting horizontal-stick idea applies to capitals and cornices. A volute additionally requires a changing tangent along a curl; a stair-step block does not read as a scroll. Distant LOD can merge small pieces, but near geometry must retain grooves, overhang and curling shape.

### L01 — First Lintel Ring — 72×56×32 m

**Reference:** Stonehenge's outer ring and five inner paired-post lintels, reorganized rather than copying the ruin. Actual historical counts differ from this project. [H01]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–3 m / three foundation bands | Twenty footings per band. Each nominal 6×6 footing uses two `R(6,6,1,1)` frame layers and a `G(6,6,1,1)` crossing core. Successive footing widths are 6/5.5/5 m to expose setbacks. |
| 3–23 m / 20 outer posts | Five segments per post, each rising 4 m. Four corners each use two M verticals as an L-shaped bundle; each of four faces has four M horizontal/diagonal ties: 24M/segment. Rotate tie direction 90° in segments 2 and 4. Taper section from 4.5×3.5 to 4×3 m. |
| Five inner portal pairs | Two posts per pair; post-top heights 24/27/29/27/24 m. Use `ceil((top−3)/4)` post modules and adjust final overlap. Orient the five pairs inward as an open horseshoe. |
| Outer lintels 23–27 m | Twenty lintel assemblies between neighboring posts. Each has four upper and four lower M chord chains, plus four D ties every 2 m. Expand C using actual spans. Thicken slightly near midspan; seat ends on posts. |
| Inner lintels / to 32 m | Five 3 m-deep lintels, with slightly raised central upper chords. At each end add three D end-detail layers projecting 0.25 m successively. Highest portal reaches 32 m. |

**Route / no shortcuts:** maintain a 12 m main opening; travel from outer to inner ring and fly above the highest lintel. Do not use 20 monolithic posts and one ring. Bundles, lintel joints and the two spatial layers must read close up.

### L02 — Lotus Column Forest — 144×104×44 m

**Reference:** Karnak's column forest and raised central hall. The historical hall has 134 columns; this design intentionally has 48. [H02]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–4 m / base | Four 1 m construction bands, perimeter R and internal 8 m grid. Keep a 16 m-wide primary ramp/stair approach. |
| 4–28 m / 36 side columns | Grid: six rows × eight columns = 48. The central two columns × six rows form 12 high columns; the other 36 are low. Each low shaft has eight 3 m segments: 16M stem members + 16D ring members + 48D recessed backs per segment. Diameter tapers from 5 to 4.3 m. |
| 4–36 m / 12 central columns | Eight 4 m segments, using overlapped B stem members. Per segment: 16B outer stems + 32D stem lines + 16M ring ties. Leave at least 16 m clear between the central rows. |
| Side capitals 28–32 m | Eight rings, 32D each, expanding radius 2.2→3.4 then closing to 2.8 m. Sixteen bud groups, 5D each, and a 4×4 m bearing frame. |
| Central capitals 36–40 m | Eight rings, 32D each, expanding radius 2.4→4.0 m. Sixteen outward petals, each seven D members along a folded curve. |
| Roof framing 32–44 m | Side roof 32–36 m; central roof 40–44 m. Use four-chord M beams across actual column spans and two diagonal assemblies per bay. Six M vertical clerestory bars per bay connect high/low roof levels without sealing the windows. |

**Route / no shortcuts:** cross the central passage, circulate among side columns and fly through clerestories. Show high/low halls and both capital types; 48 identical cylinders are unacceptable.

### L03 — Ridge Doric Temple — 96×184×52 m

**Reference:** the Parthenon's short-side eight/long-side seventeen column relationship, entasis and proportion adjustments; these are adapted, not original dimensions. [H03]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–6 m / three platform bands | Each band is 2 m high; plans 96×184, 92×180 and 88×176 m. Four stacked M perimeter frames per band; internal 8 m underfloor grid instead of solid volume. Subdivide walkable approaches under the main prompt's stair rule. |
| 6–34 m / 46 outer columns | Count `2×8+2×(17−2)=46`. Seven 4 m shaft segments each: 20B outer ribs + 20M ring members + 80D flute backs. Outer diameter 5.2 m at base, 5.35 m in lower-middle, 4.4 m at top. Contract corner spacing about 5% and adjust adjoining spans. |
| 34–38 m / capitals | Six expanding rings, 32D each, followed by three 6 m square abacus layers using `R(6,6,1,1)`. No Ionic volutes or layered circular column bases. |
| 38–42 m / beams and frieze | Four M perimeter chain levels. Per intercolumn bay, two triglyph groups, each `3×C(2,1)` D pieces; recessed metope frames sit 0.4 m behind between groups. Continue around all facades. |
| 42–44 m / cornice | Four M horizontal frames, each projecting a further 0.35 m; every 2 m add three short D hanging members for dentil shadows. |
| 44–52 m / pitched roof | Seventeen triangular trusses along depth. Each: two sloping upper-chord chains, one horizontal lower chord, five vertical/diagonal web chains; M chords and D secondary lattice. Each end pediment has eight horizontal courses shortened to its triangle, counted with C, with visible recess depth. |

**Route / no shortcuts:** 12 m front/rear openings, outer colonnade at least 8 m wide; 12 additional smaller internal columns form side aisles without copying the entire outer grid. Three-part entablature and triangular pediments are mandatory; no flat-roof box.

### L04 — Volute Terrace Palace — 112×128×56 m

**Reference:** Erechtheion-inspired asymmetric porches, level changes and Ionic capitals. Do not create human-figure supporting columns. [H04]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / unequal terraces | Main platform 8 m high, side platform 4 m: four/two 2 m construction bands with four M perimeter frames and an internal 8 m grid. Main hall 72×80 m, side porch 32×48 m, linked by a 12 m-wide terrace. |
| 8–38 m / 18 main columns | Six front and six rear, plus three additional columns per long side = 18; corners counted once via an explicit position list. Legacy B4 recipe: 224M+1,400D each. If using the 3,306-piece actual sample instead, revise the BOM explicitly. |
| 4–28 m / ten side columns | Keep diameter and capital/base shape, shorten shaft to 18 m: six 3 m shaft segments. Under the legacy recipe, subtract `2×(24M+96D)` per column. Do not squash the capital/base. |
| 38–44 m / main entablature | Three architrave bands, each four parallel M chains, projecting 0/0.25/0.5 m. Add a four-D angular motif every 2 m in the frieze and a four-layer projecting cornice. |
| 28–34 m / side entablature | Same three-band organization at smaller width, with an M-grid porch roof. Preserve visibly different roof elevations. |
| 44–56 m / main roof | Nine triangular M trusses: two rafters, lower chord, central post and two paired side web assemblies. Expand chains from actual spans. D roof strips every 2 m. Side roof occupies 34–40 m; retain the open connecting court. |

**Route / no shortcuts:** move from lower to higher porch, enter the court and rise beside the scroll capitals. Verify four mirrored volutes, flutes and base profile. Projecting square plates do not count as volutes.

### L05 — Triple Aqueduct — 300×20×68 m

**Reference:** Pont du Gard's unequal arcade tiers. The commonly described surviving relationship is 6/11/35 arches; the original upper tier had 47. This project deliberately uses 6/11/35, not a claimed original reconstruction. [H05]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–4 m / footings | Seven lower pier footings, each 8×20 m; eight horizontal M frame courses with alternating direction. Set them into the streambed/rock platform. |
| 4–28 m / first tier | Approximately 180 m-wide central tier with six openings of about 22 m. Seven piers each have six 4 m segments: four corner B bundles and F framing on four faces. Arches spring around 16 m with about 11 m rise: `A(22,11,2,16,1)`; top beam closes to 28 m. |
| 28–52 m / second tier | Extend along bank terraces to 300 m: 11 arches, 12 piers, roughly 20 m clear spans. Do not place unsupported piers over lower arch centres; outer portions without lower piers must bear on the hillsides. Use `A(20,10,1.5,12,1)`, spring around 40 m, then a 2 m beam band to 52 m. |
| 52–64 m / third tier | Thirty-five small arches and 36 piers; clear span about 6 m. Each pier has two 4 m segments: 4M vertical bundles + 8D ring ties. Use `A(6,3,1,8,1)`, spring at 60 m, and a 1 m top beam to 64 m. |
| 64–68 m / water channel | Eight horizontal M courses per side, staggered. Maintain a continuous 4 m central channel with separate water material and an adjacent maintenance walk at least 4 m wide. |

**Route / no shortcuts:** pass through a central lower arch, fly to a middle-side platform and reach the channel. Preserve different tier widths, heights, piers and spans; do not stack three scaled copies of one arcade.

### L06 — Ring Theatre — 240×196×78 m

**Reference:** the Colosseum's elliptical plan, layered arcades and upper wall band. Heights and opening counts are project adaptations. [H06]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–4 m / base | Ellipse axes 240/196 m. Four ring-step bands, each 64 tangent M-chain segments, with C counts derived from actual curve lengths. |
| 4–24 m / 48 first-level bays | Divide by equal arc length, not equal angles producing extreme spacing near ellipse ends. Each bay uses shared piers and `A(localClearSpan,localClearSpan/2,1.5,12,1)`. Piers have five 4 m segments, each 8M vertical bundle members + 8M ties. Every fourth bay connects to an inward radial passage. |
| 24–44 m / 48 second-level bays | Keep pier axes aligned, slightly narrow the arches. Add an Ionic half-column outside each pier: four 3 m shaft segments and a reduced-detail capital template, not a flat rectangle. |
| 44–62 m / 48 third-level bays | Eighteen-metre bays with Corinthian-inspired leaf capitals: 16 clusters×5D. Add two upper beam bands and a three-layer projecting cornice. |
| 62–74 m / upper wall | One smaller rectangular window per bay rather than another large arch. Each of 48 wall frames uses four M vertical chains, two M horizontal chains and paired diagonals. Recess windows by 1 m. |
| 74–78 m / crown | Four perimeter molding bands and 48 awning-support bases, each four vertical/inclined M members. |
| Interior seating | Three seating zones of eight steps = 24. Each step has 48 radial sectors using M frames and D decking. Keep four main routes from exterior to arena clear. |

**Route / no shortcuts:** enter through an arch, circulate inside and fly toward seating/upper corridors. Keep the centre open to the sky. No solid elliptical cake; do not homogenize the column orders.

### L07 — Oculus Hall — 112×144×86 m

**Reference:** the Pantheon's portico, rotunda and oculus. Its roughly 43.3 m historical diameter is contextual, not this project's enlarged dimension. [H07]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–6 m / base | Rotunda outside diameter 96 m; portico extends overall depth to 144 m. Six 1 m construction bands, perimeter divided into 64 M-frame segments. |
| 6–42 m / drum wall | Thirty-two circumferential sectors × nine 4 m segments. Each sector/course: four M vertical chains, two upper and two lower curved M chains and paired D diagonals. Eight directions receive deep niches; front passage at least 16 m wide. |
| Portico 6–36 m | Sixteen columns: eight front, then two rows of four leaving the centre clear. Six 4 m shaft segments each, with 24M ribs + 24D ring members per segment. Capital has 16×5D leaf groups and three abacus layers. Triangular roof rises to 44 m and joins the drum. |
| Dome 42–83.7 m | Nominal hemisphere radius/rise 42 m, truncated at a 5 m oculus radius. Forty-eight meridional ribs, each 24 segments. For j=1…24, `y_j=42+sqrt(42²−5²)×j/24`, and `r(y)=sqrt(42²−(y−42)²)`. Double M rib chains; D/M rings counted by length. Rings alone without connecting ribs are insufficient. |
| Interior coffers | Five decorative latitude bands, 28 cells each. Each cell has three successively inset D rectangular/trapezoidal frames, 0.25 m steps, total depth about 0.75 m. Narrow cells toward the top; make real occlusion. |
| Oculus rim 83.7–86 m | Preserve about 10 m clear diameter. Solve the final sphere ring at radius 5 m, approximately y=83.7, then add about 2.3 m of rim. Do not close it into a point or claim an intact full hemisphere with a large top hole. |

**Route / no shortcuts:** enter through the portico, inspect the coffered ceiling and rise through the oculus. Resolve exact rim/bounds within 86 m. No smooth sphere with a painted grid.

### L08 — Floating Dome Hall — 136×176×96 m

**Reference:** Hagia Sophia's four pendentives transitioning square support into a circular dome. This transition is central to the landmark's identity. [H08]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–6 m / base | Six perimeter bands with four main pier positions fixed in advance; retain a central 64×64 m space. |
| 6–42 m / piers and aisles | Four 12×12 m piers, nine 4 m segments each. Per segment: 16B edge verticals plus four `F(12,4,4,2)` faces. Side aisles have two 18 m levels, six arched bays per side and 24 attached columns. |
| 42–66 m / four main arches | Approximately 56 m span and 24 m rise. Each `A(56,24,3,8,4)`, with an additional D tie every four angular segments. Spring directly from the four piers. |
| 48–68 m / four pendentives | Twelve rising courses per pendentive. Each expands sideways from about 2 m at the corner to about 32 m between arch crowns, using eight D/M fan ribs plus tangent chains. The four top edges join a circular drum; keep continuous concave interior surfaces, not four sloping boards. |
| 68–76 m / clerestory drum | Thirty-two window bays; each has two M vertical frames and two upper/two lower M chains. Deduplicate shared posts and leave openings. |
| 76–96 m / main dome | Spherical cap with base radius 32 m and rise 20 m; 32 meridional ribs ×16 segments and 16 rings. Solve sphere radius as `(r²+h²)/(2h)`. |
| End half-domes | Two half-domes, radius 24 m, rise 16 m, spring y=48 and top y=64. Each has 16 meridional ribs×12 segments and 12 half-rings, with three smaller niches beneath. |

**Route / no shortcuts:** enter to the central volume, circulate through the aisles and rise beside the drum. The central dome may be closed; provide explicit side/end exits instead of giving every hall the same top hole. Do not omit pendentives or half-domes.

### L09 — Double-Ring Sea Castle — 176×152×108 m

**Reference:** Carcassonne-inspired double defenses, towers and keep; the eight outer towers and traversal layout are original. [H09]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / rock platform | Four 2 m construction bands and retaining walls; embed eight tower foundations and provide two entries at different elevations. |
| 8–32 m / outer wall | Eight polyline wall runs, six 4 m courses each. Every 8 m bay: four M vertical chains, two horizontal double chains and X braces. Stagger horizontal M cladding; keep a 4 m-wide wall walk. |
| 8–48 m / inner wall | Inner plan about 120×96 m, ten courses using the same system. Offset inner and outer gates to create a turning court. |
| Eight outer towers / to 72 m | Four reach 64 m and four reach 72 m. Hollow 16-sided shafts, 4 m courses with 16M vertical chains plus upper/lower 16-segment rings; eight diagonal groups every second course. Conical roofs use 16 sloping ribs expanded through C and 12 shrinking rings. |
| Main keep 8–80 m | Plan 48×40 m; six floors×12 m. Each floor has 12 perimeter bundles of 4B, `R(48,40,4,4)` at the top and an internal 2×3-bay beam grid. At least four recessed windows per floor; projecting galleries at floors 3 and 5. |
| Main roof 80–108 m | Four corner conical caps rise to 96 m, central pitched/spired roof to 108 m. Each corner cap: 16 ribs and ten rings. Central roof: seven triangular M trusses plus a 16-sided spire. |
| Crenellations and brackets | Every 4 m along walls, a 2 m-wide×2 m-high merlon assembled from 8M in four alternating layers, leaving 2 m gaps. Under projecting galleries, three inclined M brackets every 2 m. |

**Route / no shortcuts:** outer gate → inner gate → court → wall walk → keep roof. Include arrow slits, crenellations, rear wall walks and conical roofs. Four tall boxes around a square court are insufficient.

### L10 — Pointed-Arch Cloud Nave — 112×216×128 m

**Reference:** Amiens-inspired high nave, pointed arches, ribbed vaults and flying buttresses; twin towers and a central spire organize this design. [H10]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / base | Four 2 m construction bands. Main nave: eight 20 m bays; entry and rear chapel volumes occupy the remaining depth. |
| 8–40 m / lower piers and aisles | Two rows of nine compound piers =18. Each has a 16-sided core and eight attached shafts. Per 4 m course: 16M core verticals + 8×4D shaft bundles +16D ring ties. Eight pointed bays per side use `A(16,18,1.5,4,1)`. |
| 40–52 m / gallery band | Three smaller pointed arches per bay, 48 across both sides. Each has two D edge curves and two slender M columns. Retain depth and a gallery behind them, not a flat motif. |
| 52–76 m / high windows and main vault | One high-window assembly per bay, with two M mullions and six branching D tracery chains. Use two-centred pointed main arches. Per vault bay: four diagonal and two transverse ribs, each a double M chain; highest interior vault about 76 m. |
| Flying buttresses | One assembly per bay per side =16. Each contains two arches at different levels, an outer pier and a pinnacle. Use `A(localSpan,designRise,1,2,1)` and connect accurately to high-window walls and outer supports. |
| Main roof 76–92 m | Nine steep triangular trusses with D strips on two slopes. Entry towers have 20×20 m plans, bodies to 104 m and tops to 116 m; four F faces per 4 m course. |
| Crossing spire 92–128 m | Octagonal base, twelve 3 m rises, radius 8→0.8 m. Each course: eight M sloping edge chains + eight D ring segments. Add four subordinate corner spires. |
| Entrance rose window | Diameter 18 m, 24 petals. Two 48-segment D rings, 24 double radial D chains and three small curved frames per petal. Recess at least 1 m from the wall face. |

**Route / no shortcuts:** enter the high nave, then exit sideways between flying buttresses to the roof. Pointed arches, spires and flying buttresses must be recognizable in silhouette; merely stretching a round-arched temple is unacceptable.

### L11 — Eight-Lobed Dome Palace — 128×184×144 m

**Reference:** Florence Cathedral's eight-lobed double shell, eight primary and sixteen secondary ribs, and lantern. Sources describe the 1420–1436 dome construction and double-shell arrangement; this project does not claim to reproduce its structural performance. [H11]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / base | Four 2 m construction bands. Give the main hall and octagonal core their own M perimeter frames and internal 8 m grids. |
| 8–48 m / main hall | Five 20 m front-hall bays, six main piers per side. Each pier has ten 4 m courses, each 8B vertical bundle members +8M ring ties. Round arches and pitched roofs connect aisles to the central volume. |
| 48–72 m / octagonal drum | Eight faces, three 8 m bands per face. Each band: 4B bundles at both corners, three M horizontal chains and paired diagonals. One 10 m-diameter circular window per face, with a 32-segment D ring and eight radial D chains; retain surrounding structure. |
| 72–128 m / eight-lobed double shell | Maximum outside radius 38 m, rise 56 m. Eight main ribs with four parallel M chains each, plus 16 secondary ribs with two M chains each. Twenty-eight longitudinal segments and 28 rings. Use `r(t)=6+32(1−t^1.35)^0.65`, t=0…1, ending at radius 6 m at y=128 to support the lantern, not a zero-thickness singularity. |
| Shell separation | Maintain 2 m normal separation between outer and inner shells. Every fourth ring at every main rib gets two M tie chains: 7×8×2 chain groups, expanded using actual lengths. Preserve eight inner lobes and a maintenance-display opening; the 2 m cavity is not a main visitor route. |
| Lobe infill | Divide each longitudinal segment of each lobe into four cells. Alternate D diagonals at ±45° to suggest herringbone, with M cell frames. Full strip detail is near-LOD only; the eight primary ribs must remain geometry. |
| Lantern 128–144 m | Octagonal frame, base radius 6 m, eight column bundles. Lower 8 m uses 4M per column; upper 8 m uses eight converging M ribs and four D rings. A 4 m rim/platform edge may be retained; place the main viewpoint on the broad ring below the lantern. |

**Route / no shortcuts:** enter from an aisle, view the dome from below, then rise along its external ribs. The pointed profile, local double-shell reveal, eight major ribs and lantern are mandatory. Do not recolour L07's hemisphere.

### L12 — Embrace Square — 280×240×154 m

**Reference:** St Peter's four-deep curved colonnades and central dome composition. The historical square has 284 columns; this original composition deliberately uses 128 colonnade columns. [H12]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–6 m / square base | Three 2 m construction bands. Keep the central square open. Under both colonnades use curved/perimeter M frames and 8 m grids; do not float the square on one giant board. |
| 6–38 m / two colonnade wings | Each wing has 16 arc positions×four radial rows: `2×16×4=128` columns. Each shaft has seven 4 m segments, each 16M ribs +16D ring ties. The remaining 4 m is the capital: four outward D ring layers and three square M abacus layers. |
| 38–44 m / curved entablature | Four M curved chains above each column row, two M transverse beam groups between adjacent rows, six molding courses projecting 0.2 m each. Every second column position gets an abstract 12D roof ornament; no realistic statues. |
| 6–62 m / central facade | Width 140 m, nine bays with the middle three wider. Lower tier 6–34 m, upper 34–62 m. Each bay: four M bundle-column chains and three horizontal beam bands. Each central bay has a deep door/window on both tiers. Main entrance clearance 16 m; wings must not block it. |
| 62–78 m / drum and shoulders | Thirty-two-sided drum, one window every two sides =16 windows. Sixteen main column bundles and 32 M ring chains distributed over four layers. Side roofs stay at 62 m so the centre rises distinctly. |
| 78–142 m / elliptical dome form | Horizontal semiaxes 38/32 m, rise 64 m. Thirty-two double-M meridional ribs×32 segments and 32 D/M rings. With `t=(y−78)/64`, use `rx(t)=8+30sqrt(1−t²)` and `rz(t)=8+24sqrt(1−t²)`. End at radius 8 m for the lantern. This is an authored taper, not a claim of an exact complete half-ellipsoid. |
| Lantern 142–154 m | Sixteen-column ring pavilion, 8 m high, followed by 16 converging ribs rising 4 m. Each column uses two connected M members; top ring 32D. |

**Route / no shortcuts:** enter between the wings, cross through the four-deep colonnades and fly above them to view the central dome. One row of posts around a circle does not provide the required enclosure and depth.

### L13 — Lattice Conservatory — 320×160×96 m

**Reference:** the 1851 Crystal Palace's modular parts, slender frames and vaulted transept. Modernity should emerge through structure; the entire timber building need not become glass. [H13]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–4 m / base | Four 1 m bands. Plan grid: 20×10 bays of 16 m, nominally 21×11 column nodes. Explicitly list nodes removed for the central passage and replaced by long-span framing. |
| 4–28 m / lower frame | Six 4 m column rises, each four M bundle members. Every 16 m bay gets an upper/lower M chord beam at y=28 with four web panels. Keep 32 m-wide central entrances at both ends. |
| 28–52 m / high central hall | Side wings stop around 28–36 m; the central four bay rows rise another 24 m. Each vertical segment uses four M bundle members; use `F(16,8,4,1)` in three height bands for tall frames. Upper galleries are only 8 m-wide edge strips, not floors sealing the central void. |
| 52–80 m / transverse barrel vault | Place the transept at the middle of the long axis. Span 56 m, semicircular rise 28 m; ribs every 8 m along its length, 21 total. Each rib has two M arch chains and D ties every 4 m. Each semicircular end window has 32 radial D chains. |
| 80–96 m / roof lantern | Local central clerestory ridge, 16 m high and 64 m long. Nine small frames, each two M vertical chains, two M sloping roof chains and four D braces. Add D window divisions every 2 m. |
| Surfaces and detail | Subdivide each 16 m wing roof bay into four sawtooth/folded roof groups; D glazing bars every 2 m. Use only limited pale translucent infill behind frames, preserving beam/column depth. |

**Route / no shortcuts:** traverse the conservatory and rise through the high hall to a gallery. Breadth, openness and modular repetition matter. No giant glass box; do not narrow/stretch it just to maintain increasing heights.

### L14 — Four-Leg Wind Tower — 100×100×188 m

**Reference:** Eiffel-like separated legs, curving convergence, lattice and platforms. This 188 m composition is a project adaptation, not a floor-by-floor scale replica. [H14]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / four feet | Four 18×18 m pads, each four 2 m bands. Each band: four M perimeter frames and a 4×4 internal grid. Leave the central passage between feet open. |
| 8–56 m / six leg segments | Six 8 m rises. Each leg's centre radius follows 42/39/35/30/25/20/16 m at segment boundaries. Section narrows 12→8 m. Per segment: four corners×two B chord chains; one `F(sectionWidth,actualSlopingHeight,4,1)` on each of four faces. |
| 24–56 m / lower connecting arches | Four large arches between neighboring legs, approximately `A(56,20,2,4,4)`. Preserve passage through the centre. The legs themselves must curve inward; four straight diagonal sticks are not enough. |
| 56–64 m / first platform | Approximately 56×56 m, four 2 m frame bands. Each uses `R(56,56,4,4)` and a 7×7-bay M beam grid. Keep a central 20×20 m aperture. |
| 64–104 m / five middle segments | Five 8 m rises, leg centre radius 16→8 m. X-brace all four faces of each leg; at least two vertical panels per face, not one huge diagonal for the full segment. |
| 104–112 m / second platform | 32×32 m, four frame bands and a central 12×12 m aperture. Corners cantilever 2 m, with eight three-M bracket groups per edge. |
| 112–176 m / eight upper segments | Eight 8 m rises, section 24×24→8×8 m. Four corners each have four B chains. Each face has two F panels per segment; M rings at segment middle and top. |
| 176–188 m / summit | Octagonal observation ring, 12 m diameter and 4 m high, then an 8 m spire with eight sloping M ribs and four D rings. |

**Route / no shortcuts:** ascend between legs, through both platform apertures and to the summit ring. Show curved taper, changing lattice density and two distinct platform interruptions; no four slanted beams carrying a straight pole.

### L15 — Setback Crown — 112×88×212 m

**Reference:** Empire State Building-inspired Art Deco vertical rhythm, setbacks and crown. The original has 102 floors; this project has 44 main floor bands plus base/spire elements, not the original floor count. [H15]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / base lobby | Four 2 m construction bands and an 8 m-high lobby. Corner bundles plus an 8 m perimeter grid, 16 m clear central entrance and R top beams. |
| 8–40 m / floors 1–8 | Each 4 m high, plan 112×88 m. Four-M column bundles every 8 m on each face; two M perimeter rings per floor; D vertical window divisions every 2 m, with glazing/infill recessed 0.75 m. Floor 8 gets four projecting D cornice layers. |
| 40–120 m / floors 9–28 | Twenty 4 m floors, plan 88×64 m with 8×8 m corner cuts. Same module. At each face centre, a continuous double-M vertical spine spans the 20 floors, with horizontal bands behind it. |
| 120–168 m / floors 29–40 | Twelve 4 m floors, nominal plan 56×40 m. Retreat locally by 2 m every four floors, with deliberate symmetry. Each setback creates at least a 4 m roof edge with D rails and M brackets. |
| 168–184 m / floors 41–44 | Four 4 m floors, plan 32×24 m; double-M vertical ribs at all four corners and a multi-stage crown rather than a flat cut. |
| 184–212 m / crown and mast | Seven 4 m courses, section 16×12→4×4 m. Each course: paired M corner edges and D frames at middle/top. Finish with bundled B/M chains, not one stretched 28 m pole. |

**Route / no shortcuts:** pass through the lobby, pause at three principal setbacks and circle the crown. Include recessed windows, piers and moldings. Five decreasing boxes alone are insufficient.

### L16 — Curved Gorge Dam — 360×160×160 m

**Reference:** Hoover-like arch-gravity form with curved plan and a thick base/thin crest. Official dimensions inform structural proportions; this 160 m timber landscape is an adaptation. **Apply the mandatory fin-shaped spillway addition in Section 7.4 as well as this base recipe.** [H16]

| Height / course | Piece rules and placement |
| --- | --- |
| Environmental datum | Suggested foundation world y≈20 m, main body crest world y≈164 m and highest tower ornaments world y≈180 m. Reservoir water sits about 8–12 m below the main crest and below surrounding banks. Place the dam within a real canyon, not as a panel holding water above grass. |
| 0–144 m / 36 body bands | Thirty-six 4 m rises, each divided into 36 horizontal arc sectors. Thickness at bottom/quarter/half/three-quarter/top is approximately 110/82/52/27/12 m, smoothly interpolated between samples. Keep a continuous curved upstream plan and a nonvertical, tapering section. |
| Per band / sector | One M face frame upstream and downstream: two vertical chains and top/bottom chains. M vertical ribs at 2 m horizontal intervals; staggered D horizontal facing. Every fourth sector includes an internal radial F truss between faces; other interior volume remains hollow. Derive C/F counts from actual chord length, band height and thickness. |
| 144–150 m / crest road | Continuous 12 m-wide road, three 2 m bands. One transverse beam every 8 m along the arc, four longitudinal M chains and D decking. Rails on both sides: D posts every 2 m and two D handrail chains. |
| Four intake towers / to 160 m | Sixteen-sided shafts rising from upstream platforms. Upper 24 m has six 4 m bands, each 16M vertical chains +16 M ring segments. Caps use eight tapering rings, 32D each. Extend supporting geometry appropriately below water level. |
| Downstream powerhouses / 32 m high | Two 64×24 m buildings, one on each side, four 8 m storeys. Each storey has eight transverse frames with M columns/beams and D window divisions. Leave the central watercourse and connect it to the stream/sea. |
| Overflow and toe | One 12 m-wide rock-side overflow channel on each side, M edges and original water shading. An 8 m-wide maintenance bridge must have credible connections. Do not cut arbitrary holes through the body to make water pass. Integrate the four-bay fin spillway through a resolved final section. |

**Route / no shortcuts:** rise along the face from the toe, cross the crest to see the reservoir, then circle intake towers. Both plan curvature and section taper are mandatory. No tall rectangular wall; do not move the dam into the Roman region and mislabel its era.

### L17 — Vertical Court Tower — 80×56×244 m

**Reference:** Seagram-inspired setback plaza, closely spaced continuous mullions and restrained facade. Adapt its rhythm, not the original storey count or material. [H17]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–12 m / open lobby | Perimeter of a 6×4 structural grid, deduplicated to 20 column bundles; four B vertical chains per bundle. Keep a 16 m central passage. Four top M perimeter frames plus internal beams. |
| 12–220 m / floors 1–52 | Fifty-two 4 m floors. Main plan 72×48 m, with terrace projections reaching the 80×56 m maximum. Perimeter 240 m, 2 m mullion spacing: 120 unique positions. Per floor/position use one M main vertical with four D front detail members. One recessed `R(72,48,4,1)` horizontal frame per floor; do not place it in front of mullions. |
| Facade depth | Main columns behind; mullions project 0.4 m; window cells retreat 0.6 m. D chains at window tops/bottoms, sides shared with mullions. Use limited interior shading planes so windows are neither all black voids nor entirely transparent. |
| Floors 16, 32, 48 | Around heights 76, 140 and 204 m, provide 8 m-wide edge-viewing terraces. Preserve the grid, align supports and project 4 m outward with three-M bracket groups every 8 m. Resolve exact floor/elevation conventions in the recipe. |
| 220–244 m / equipment crown | Six 4 m bands. First two continue the facade; last four add horizontal D louvers every 0.5 m. Continue corner columns and create a rectangular open roof court. |

**Route / no shortcuts:** pass through the open base, rise to terraces and inspect continuous vertical lines. A simple rectangular silhouette is allowed, but depth, rhythm and the open base are mandatory; modernist restraint does not justify one wood-textured box.

### L18 — Nine-Bundle Cloud Tower — 90×90×276 m

**Reference:** Willis Tower's nine square tubes terminating at different heights. The original has 110 floors; this project uses 60 and authored termination levels. [H18]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / base | Nine 30 m square tubes in a 3×3 grid filling 90×90 m. Label north A/B/C, middle D/E/F, south G/H/I; central E remains full height. Each tube's two base bands use `R(30,30,4,4)` plus `G(30,30,6,4)`. |
| 8–128 m / floors 1–30 | Thirty 4 m floors with all A–I present. Each tube has four-M corner bundles, extra M mullions every 6 m and `R(30,30,4,2)` at floor top. Generate shared walls once. Do not fill unopened interiors with complete floor plates. |
| 128–176 m / floors 31–42 | A and I terminate, leaving seven tubes. Deck the two 30×30 m roofs with G and D rails. Do not shift remaining tube positions. |
| 176–224 m / floors 43–54 | C and G terminate, leaving B/D/E/F/H as a cross. Add a deeper M connecting band every four floors; finish newly exposed roofs. |
| 224–248 m / floors 55–60 | D/F/H terminate; only B/E continue with their existing mullion rhythm. Do not recenter or replace them with a smaller central box. |
| 248–276 m / crown | Each remaining tube gets a 4 m-high rooftop equipment edge and a 24 m antenna-like bundle: four B/M chains with D ties every 4 m. Antennas are not usable storeys. |

**Route / no shortcuts:** ascend through four distinct roof stages. From above, the nine-tube and cross stages must be legible. Concentric whole-building shrinkage is not bundled-tube architecture.

### L19 — Prismatic Brace Tower — 88×88×304 m

**Reference:** Bank of China Tower-inspired prismatic assembly, unequal termination heights and sloping crowns. Triangular parts and large external braces are the defining translation. [H19]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / base | Four right-triangle zones around the centre within an 88 m square. Edge beam grid at 8 m; retain a 12 m clear route along one diagonal. |
| 8–264 m / 64-floor rhythm | Floors are 4 m high. For each triangular prism still present, generate M mullions every 4 m along its three edges and double M perimeter floor beams. Assign shared edges once. The four parts terminate at floors 40/48/56/64 without shifting their plans. |
| One bracing module per eight floors | Every active exterior face has a large X over each 32 m band. Main corner chords use four B chains; each diagonal uses two parallel B chains; crossings have eight M node members. Expand modules 1–8 explicitly and recompute truncated spans at setbacks so braces do not extend into empty air. |
| Sloping terminal crowns | Over each part's last four floors, retreat equally toward a specified sloping plane, producing a triangular cut. Align outer frame and D infill with the cut; do not leave four flat-topped boxes. |
| 264–280 m / highest crown | Extend the final triangular part 16 m through four 4 m bands, with three double-B edge chains and an M triangular frame per band. Continue the chosen sloping direction. |
| 280–304 m / twin spires | Two 24 m bundles, each four B chains and six D tie rings. Locate them in relation to the triangular crown edges, not randomly at the centre. |

**Route / no shortcuts:** view from beneath intersecting braces and ascend to four unequal platforms. Major triangular patterns are structural geometry at least 0.75 m in front of the facade, not textures.

### L20 — Three-Wing Skyline Peak — 144×132×340 m

**Reference:** Burj Khalifa-inspired Y plan, supported core and rotating setback order, informed by SOM's explanation of spiral setbacks. The project's 72 floors are not the original count. [H20]

| Height / course | Piece rules and placement |
| --- | --- |
| 0–8 m / three-wing base | Hexagonal core, circumradius 16 m. Three wings 120° apart, initially about 56 m long from the core and 24 m wide, with rounded/polygonal noses. Solve orientation and actual envelope to meet 144×132 m; the table dimensions are not uncomputed exact coordinates. |
| 8–296 m / floors 1–72 | Four-metre floors. At each core corner use four M vertical chains, with double M hexagonal top beams. Each wing has double-M vertical mullions every 4 m along both sides, a 12-segment nose and M floor-edge ring. Add two radial M beam chains per wing per floor. |
| Setback every six floors / 12 events | At floors 6/12/18/…/72, cycle A→B→C and shorten that wing by 8 m. Each wing retreats four times: 56→48→40→32→24 m. Keep the core continuous; do not shrink the whole plan concentrically. |
| Setback roofs | At each of 12 wing-end roofs, add `G(actualWidth,8,1,1)` decking, D rails and two M bracket groups. Other wings continue upward. Make each terrace and its orientation legible. |
| 296–320 m / six crown bands | Six 4 m bands; wings disappear in sequence until only the hexagonal core remains. Core radius follows 16/13/10/7/4/2 m. Each band: six double-M sloping edges, six D ring segments and six secondary ribs. |
| 320–340 m / spire | Five 4 m bands, six M/B bundle chains around the centre with decreasing ring radius. First four bands have two D tie rings each; final band has a definite finish. |

**Route / no shortcuts:** spiral among three differently oriented terrace sequences and look back along the valley from a broad platform below the crown. The needle is not a landing platform. Flight ceiling must allow circling the entire crown. No cone, simple pyramid or single square tower.

## Appendix C — Architectural acceptance and complexity

### C1. Reviewable outputs per building

Provide:

1. An independent readable recipe: W/D/H, construction-band heights, course indices, grids/spans, stock types, curve parameters, counting formulas, required details and route points.
2. A generator and **actual expanded piece statistics**, grouped by building → band → course → B/M/D. Never substitute estimated recipe counts for generated totals.
3. A development assembly view with base / columns / beams and arches / roof / detail toggles and individual course inspection. Do not place it in normal player UI.
4. Plan, front, side, 45°, 1.65 m eye-height and detail views under consistent sunlight, showing real geometry shadows.
5. LOD, independent collision proxies and a recorded complete route from entry to viewpoint.

Validate the main prompt's component set before mass generation. The original minimum prototypes included a 30 m Ionic column, 22 m semicircular arch, eight-lobed dome fragment and 32 m braced facade; this iteration additionally requires the other column orders, shallow steps and fin spillway. Every final landmark must meet its own recipe, not just the best showcase building.

### C2. Acceptance conditions that cannot be substituted

| Check | Passing condition |
| --- | --- |
| Count and identity | Twenty independent recipes with every course represented in the piece report. Modern towers cannot share one box generator with only height changes; shared primitive components are allowed. |
| Scale | Actual bounds against Appendix A, initially ±1%. Resolve approximate values before generation. Record justified revisions caused by joints/openings rather than silently deleting structure. Vertical bands close coherently, without unexplained gaps/overlaps. |
| Column orders | Doric, Ionic, Corinthian adaptation and lotus/papyrus have genuinely different geometry. Flutes, capitals, bases and cornices cast readable shadows. |
| Curves | Arches have inner/outer edges and thickness; dome ribs/rings connect. Curves read smoothly from distance while revealing assembled straight pieces nearby. |
| Support | Beam ends, arch springs, tower legs, buttresses, setbacks and capitals have readable joints. No real-world structural certification is required, but obvious unsupported floating parts are unacceptable. |
| Interiors and openings | At least one entry/pass-through space and reliable viewpoint per building; collision checks pass for every marked traversable opening. |
| Details | At least three identity-specific details per building, e.g. L03 flutes/triglyph rhythm/pediment; L10 rose window/flying buttresses/compound piers. Random ornament does not count. |
| Historical claims | Separate original-building facts, adapted dimensions, project floor counts and generated piece totals. Do not call the 44-floor project tower the actual Empire State floor count. |
| Public labels | “World preset · Inspired by …”; never imply these were created by players under the existing 200-piece limit. Verify the current limit in the repository. |

### C3. Detailed construction within performance limits

Keep full detail in offline recipes and near LOD. Instancing does not make hundreds of thousands of pieces free: a simple 12-triangle cuboid repeated 100,000 times already has about 1.2 million triangles before shadow passes. Measure visible instances, triangles, draw calls, GPU estimates and CPU preparation separately.

Use **roughly 10,000–80,000 pieces per full-detail building and 400,000–1,000,000 pieces for all offline island content** only as planning ranges, never quotas or established measurements. Eighteen columns from the legacy paper recipe total about 29,000 pieces; eighteen at the actual offline sample's 3,306-piece density total 59,508. These are different implementations. Recalculate building and island budgets from the chosen actual recipes.

- **Near:** fully expand only the closest 1–2 buildings initially; load additional capital/detail geometry locally. Device budgets determine simultaneous detail, not an unconditional “all nearby buildings at maximum.”
- **Middle:** simplify flutes and window subdivisions while retaining capital silhouettes, openings, dome ribs and main braces. Initial target: 1,500–6,000 equivalent members per building, verified by actual triangles.
- **Far:** begin around 1,000–4,000 triangles per building, preserving major openings and setbacks. Neither a single bounding box nor disappearing distant towers is acceptable.
- **Storage:** compact transforms by building/band. One 4×4 float matrix alone is 64 bytes, so one million matrices are about 64 MB before other data. Avoid multiple equivalent JS-object copies; use TypedArrays, compressed transforms and chunk disposal.
- **Collision:** retain primary floors, piers, walls and routes only. Do not create a Rapier body for each decorative piece. Changing visual detail must not change validated passage collision.

Use the main prompt's measured per-frame budgets to tune density. BOMs identify omissions and cost; piece count is not an artistic quality score.

### C4. World guidance

The opening may add:

> From the first lintel to towers above the clouds. Follow the valley and discover how imagination becomes space, one piece at a time.

Use one short sentence per region, with optional details. Provide a broad final platform overlooking the whole valley and a clear shortcut to existing collaborative creation. Do not rank player works by quality or height. This iteration defaults to the original player gallery; read-only spatial stands are conditional on existing public interfaces. Never frame the modern endpoint as culturally or artistically superior to earlier architecture.

## Appendix D — Historical references and adaptation boundaries

Research can establish original heights, selected floor/column counts, section relationships and decorative language. It does not provide a ready-made Stillwood timber piece list. The course recipes above are project-authored and require geometry, dimension and viewpoint validation. References explain inspiration; they do not license extraction of webpage photographs, drawings, scans or models.

| Reference | Source | What is used / what is adapted |
| --- | --- | --- |
| H01 | [English Heritage — Description of Stonehenge](https://www.english-heritage.org.uk/visit/places/stonehenge/history-and-stories/history/description/?lang=en) | Five inner paired-post lintels and the outer ring; the historical outer ring may have had 30 posts, while this project uses 20. |
| H02 | [University of Chicago ISAC — Great Hypostyle Hall](https://isac.uchicago.edu/research/publications/oip/oip-142-great-hypostyle-hall-temple-amun-karnak) | The historical hall has 134 columns. This project uses 48 columns and an adapted 44 m envelope. |
| H03 | [Acropolis Restoration Service — Parthenon](https://www.ysma.gr/en/monuments/parthenon/) | The 8×17 perimeter-column relationship, entasis and Doric organization; the project envelope 96×184×52 m is not the original size. |
| H04 | [YSMA — Erechtheion](https://www.ysma.gr/en/monuments/erechtheion/)、[Metropolitan Museum — Architecture in Ancient Greece](https://www.metmuseum.org/essays/architecture-in-ancient-greece) | Ionic bases, flutes, volutes and differences between orders. Spiral segment counts are project modeling decisions. |
| H05 | [Pont du Gard — The monument](https://pontdugard.fr/en/discover/monument)、[France.fr — Five facts](https://www.france.fr/en/article/5-facts-about-the-pont-du-gard-to-impress-your-friends/) | Approximately 49 m historically, with three tiers: 6/11 lower-middle arches and an upper tier originally 47, now 35. Project height: 68 m. |
| H06 | [Turismo Roma — Flavian Amphitheatre](https://www.turismoroma.it/en/node/1155) | Elliptical plan and four architectural levels. The project chooses 48 bays per arcade level and a 78 m height. |
| H07 | [Italian Ministry of Culture — Pantheon](https://direzionemuseiroma.cultura.gov.it/en/pantheon/) | The historical rotunda/dome diameter is about 43.3 m. Project dome radius 42 m and overall height 86 m are adaptations. |
| H08 | [Metropolitan Museum — Hagia Sophia](https://www.metmuseum.org/exhibitions/listings/2012/byzantium-and-islam/blog/where-in-the-world/posts/hagia-sophia)、[Columbia — Dome and pendentives](https://projects.mcah.columbia.edu/medieval-architecture/htm/or/ma_or_discuss_hs_dome.htm) | Four pendentives mediate between square supports and the circular dome. Timber counts are not historical engineering quantities. |
| H09 | [Centre des monuments nationaux — Carcassonne silhouette](https://www.remparts-carcassonne.fr/en/discover/an-iconic-silhouette)、[The castle](https://www.remparts-carcassonne.fr/en/discover/the-castle) | Walls, towers, keep and later rebuilding create a compound silhouette. Project tower/storey counts are original design choices. |
| H10 | [Columbia — Amiens exterior model](https://projects.mcah.columbia.edu/amiens-arthum/amiens-cathedral-exterior-model)、[Amiens Métropole](https://www.amiens.fr/Vivre-a-Amiens/Culture-Patrimoine/Patrimoine-mondial/La-cathedrale-Notre-Dame-d-Amiens) | High nave, side aisles and flying-buttress relationships. Eight bays and 128 m height belong to this project. |
| H11 | [Opera di Santa Maria del Fiore — Dome](https://duomo.firenze.it/en/40/dome) | Eight-lobed double shell, 24 principal/secondary ribs, lantern and herringbone inspiration. Timber paths/counts are original. |
| H12 | [Vatican — Colonnade](https://www.vatican.va/content/vatican/en/ra/colonnato-statue-santi.html)、[St Peter’s Basilica — The Square](https://www.basilicasanpietro.va/en/san-pietro/the-square) | The historical colonnade has 284 columns in four rows; the project uses 128. Source height conventions differ, so no precise original height is asserted here. |
| H13 | [V&A — Great Exhibition of 1851](https://www.vam.ac.uk/articles/the-great-exhibition-of-1851) | Prefabricated modules, framing and the vaulted transept. The 96 m project conservatory is an enlarged imaginative adaptation. |
| H14 | [Eiffel Tower — History](https://www.toureiffel.paris/en/the-monument/history)、[Key figures](https://www.toureiffel.paris/en/the-monument/key-figures) | Four separated lattice legs converge upward. Project height 188 m and platform elevations are redesigned. |
| H15 | [Empire State Building — History](https://www.esbnyc.com/about/history)、[Architecture](https://www.esbnyc.com/about/architecture-design) | 1931, 102 floors and Art Deco organization. The project has 44 primary floor bands, not the original floor count. |
| H16 | [US Bureau of Reclamation — Hoover project](https://www.usbr.gov/projects/index.php?id=122)、[Dam FAQ](https://www.usbr.gov/lc/hooverdam/faqs/damfaqs.html) | Curved arch-gravity form, thick base and thin crest. Reported original structural height is 726.4 ft, crest width 45 ft and base width 660 ft. Project 160 m height and thickness bands are adapted. |
| H17 | [DOCOMOMO US — Seagram Building](https://docomomo-us.org/register/seagram-building) | 1958, 38 floors and facade modules. Project 52 floors and 244 m height are new proportions. |
| H18 | [SOM — Willis Tower](https://www.som.com/projects/willis-tower-formerly-sears-tower/) | 1973, 110 floors and nine bundled tubes ending at different heights. Project termination floors 30/42/54/60 are redesigned. |
| H19 | [Bank of China (Hong Kong) — About BOC Tower](https://bocgroup.com/en/aboutus/corpprofile/boctower.html) | Opened in 1990, with four prismatic parts. Project 64 floors and 304 m height are not the owner-published original dimensions. |
| H20 | [SOM — Burj Khalifa](https://www.som.com/projects/burj-khalifa/)、[Official structural system](https://www.burjkhalifa.ae/the-tower/structures/) | Three-wing Y plan, supported core and rotating setbacks. Project 72 floors and 340 m height are original adaptations. |


## Appendix E — Technical and asset reference links

These are reference entry points supplied by the existing design plan. Verify APIs against the pinned implementation version and licenses against actual downloaded files. This translation is not a fresh certification of the latest APIs or asset packages. A webpage image license is not automatically a downloadable model license.

- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
- [Three.js Octree](https://threejs.org/docs/pages/Octree.html)
- [Three.js PointerLockControls](https://threejs.org/docs/pages/PointerLockControls.html)
- [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)
- [Three.js Sky](https://threejs.org/docs/pages/Sky.html)
- [Three.js LOD](https://threejs.org/docs/pages/LOD.html)
- [Three.js color management](https://threejs.org/manual/en/color-management.html)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Poly Haven — Leafy Grass](https://polyhaven.com/a/leafy_grass)
- [Poly Haven — Grass Path 2](https://polyhaven.com/a/grass_path_2)
- [Poly Haven — Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock)
- [Poly Haven — Rocky Terrain 02](https://polyhaven.com/a/rocky_terrain_02)
- [Poly Haven license](https://polyhaven.com/license)
- [Kenney Nature Kit](https://kenney.nl/assets/nature-kit)
- [Kenney support / licensing](https://kenney.nl/support)

## Appendix F — Existing handoff files

These links let the project owner retrieve the files. An implementation agent without access should have the owner attach them. Never treat a login page as file content.

- [component_lab.zip](https://chatgpt.com/library?file_id=libfile_c9c98cb045848191a51d6c16e358f9ea&account_id=personal)
- [stillwood_world_design_plan.md](https://chatgpt.com/library?file_id=libfile_ca0edc0798408191bbca53c25fd31b70&account_id=personal)
- [final_spec.md](https://chatgpt.com/library?file_id=libfile_47e9edfdb3848191af81eba4f1b3d2dc&account_id=personal)

**Start now: read the repository rules and actual entry points, build the existing-feature protection matrix, then implement the P1 vertical slice. Continue toward the complete scope. Do not stop after producing another plan.**
