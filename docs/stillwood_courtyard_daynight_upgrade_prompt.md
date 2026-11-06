# Stillwood — Courtyard, Stone Portals and Day/Night Upgrade

Implement the complete upgrade below in the existing Stillwood project.
This is an implementation task, including visual iteration, validation,
documentation and a running local preview. Do not stop at a proposal or at
one sample building. Do not commit, push or deploy.

## 0. CONTEXT, SOURCES AND SCOPE

Continue from the current working tree and preserve unrelated work.
Read the repository's applicable instructions and these existing references:
- docs/stillwood_immersive_island_gallery_upgrade_prompt.md
- docs/stillwood_memory_recovery_constraints.md
- docs/evidence/world/requirements-status.md
- The current interaction/homepage fixes and relevant process records.

This directive supersedes conflicting visual requirements for the homepage
introduction, entrance portal frames and environmental lighting. Preserve
the current interaction model, world layout, landmark geometry, workbench,
collaboration, physics, permissions, saves and work/exhibit lifecycle.

Planning inspected main commit b30a9bb94af883006d2e2d13af1009cb844f2329.
That is a reference, not an instruction to reset or check out that commit.
Inspect the current implementation first and preserve newer improvements.
If some requested features already exist, reconcile and finish them.

Relevant inspected files:
- src/world/layout.ts, terrain.ts, flight.ts, manifest.ts
- src/client/world/environment.ts, materials.ts, WorldView.ts
- src/client/world/WorldStage.tsx, portal-labels.ts, quality-world.ts
- src/world/recipes/ and the existing world generation/validation pipeline

Known planning facts from that revision:
- HOME_SITE is (-1125, -300), HOME_Y is 128, and the home pad has hx=hz=52.
- Spawn X/Z is (-1105, -275), initial yaw is -97 degrees.
- Three portals occupy an arc 34 m from spawn, at relative angles -26/0/+26.
- Nominal portal openings are 6 x 9 m, but the actual frames have different
  silhouettes and do not all provide a rectangular opening at every height.
- Looking from the initial spawn, the inspected camera convention projects
  together on the left, explore centrally and works on the right. An older
  report reverses the left/right wording. Preserve portal IDs and actual
  destinations; verify projection rather than copying a prose ordering.
- Sea at the right and distant landmark silhouettes are deliberate sightlines.
- rockGeometries() provides eight rock variants and three rubble variants.
- Existing procedural grass, terrain, water and sky can be extended.
- Lighting currently uses a fixed directional sun and hemisphere light.

The planning browser could not render WebGL. Existing repository screenshots
were inspected, but they are historical evidence, not a fresh live-site tour.
Do not claim this plan's exact placement or lighting has already been approved
in the current 3D scene. Inspect the actual local scene during implementation.
Do not rely on stale deployment claims in old evidence documents.

## 1. DESIGN INTENT

Create a restrained, welcoming arrival space:
small white flowers in the foreground, a shallow candle courtyard in the
middle, three substantial stone gateways behind it, with the sea and distant
timber architecture still visible.

Across the island, daylight reveals the timber construction; moonlight
reveals large silhouettes, and warm candle groups reveal entrances, steps,
columns and interior spaces. Keep the monumental scale and quiet atmosphere.

Sky: Children of the Light's old Home is an atmosphere reference for shallow
water, low stone gathering surfaces, gateways and candlelight. Use original
arrangement and existing project assets. Do not extract game assets or copy
its map, icons, characters or sounds. Do not add collection mechanics,
rankings, invented players or new social systems.

Timber buildings remain governed by their existing validated construction
rules. Stone gateways, flowers, water and candles are environment dressing,
not new player building materials or structural powers.

## 2. HOMEPAGE INTRODUCTION

Replace the old “A quiet table and one kind of stick.” introduction with this
exact copy, unless the current tree already contains it:

Heading:
A world begins with one stick.

Paragraph 1:
A single wooden beam seems simple. Place another beside it, then another
above it, and complexity begins to emerge: a bridge, a soaring tower,
a structure with the quiet presence of an ancient monument.

Paragraph 2:
Build alongside others, and each placement becomes part of a conversation.
What you leave becomes someone else’s starting point—a support, a challenge,
an unexpected direction. Discover what takes shape between you.

Primary button:
Start building

Supporting line:
Start with one stick. Invite others to add the next.

Keep the heading prominent, paragraphs comfortably readable and separately
spaced, with restrained typography consistent with the existing site.
Preserve the Start building action and authentication flow. Keep account/save
information secondary and appropriate to the current sign-in state.

Preserve the homepage composition: embedded world above, original homepage
content below in normal scrollable flow. Retain Exhibition, search and work
listings. Starting exploration must not hide that content or navigate away.

## 3. THREE STONE GATEWAYS

Replace the wooden entrance frames with weathered stone gateways using the
island's existing rock geometry/material family. Keep portal positions,
orientation, approximate outer width/height and usable passage clearance.
Do not enlarge them to make the new construction easier.

- Large stones form the structural pillars and supported tops; small stones
  fill transitions and integrate the bases into the ground.
- Use staggered joints, stable bases, restrained taper and plausible support.
- Avoid random rubble heaps, visibly floating structural rocks, exaggerated
  intersections, repeating identical blocks or stretched surface detail.
- Preserve distinct silhouettes where practical: a high arch for Explore,
  a substantial lintel for My Works, and a coherent paired-support gateway
  for Build Together. Do not reproduce the leaning timber frame as an
  implausibly unstable stack of stone.
- Keep the same restrained palette and roughness as the surrounding rocks.
- Reuse shared resources and merge/instance by material where appropriate.

Preserve the existing transparent membranes, double-sided frosted destination
lettering, proximity highlighting and correct device-specific entry hints.
Fit labels to the new actual openings without hiding them behind rocks.
Verify bright-sky readability in daytime and restrained brightness at night.
Do not introduce large opaque label cards.

Keep IDs, destinations, activation behavior and cooldowns intact. Adjust
frame collision only where necessary to match visible stone; preserve the
opening and approach/exit routes. Check maximum-speed traversal.

## 4. SHALLOW CANDLE COURTYARD

Keep the current spawn and camera orientation. Start by testing a pond centre
14–16 m forward and 4–5 m left of spawn in the camera's horizontal local
frame. Start around 12 x 8 m overall, with a softly irregular outline.
These are tuning proposals: adjust locally after inspecting the real terrain,
view and portal approaches. Do not move landmarks or portals to fit them.

- The pond should occupy only part of the forecourt and leave the right-hand
  sea view and central distant skyline open.
- Use approximately 0.15–0.25 m of shallow water, a visible bed, low irregular
  stone edges and a central low stone platform roughly 3–4 m across.
- Add a few safe, flat stepping stones as an optional route to the platform.
- Keep an approximately 3 m clear primary route around the pond, branching
  toward all portals. Keep roughly 4 m of approach space before thresholds,
  expanded if needed by the existing activation/collision geometry.
- Visitors must be able to reach all gates without crossing water.
- Use low stones and modest candle groups; no tall monument or sculpture
  that blocks the portal lettering or distant buildings.

Make the basin physically and visually consistent: lower/shape its bed using
the authoritative terrain/collision data or a compatible explicit surface
representation. Do not lay a transparent water rectangle over unchanged grass,
introduce z-fighting, make the player float above the bed, or leave holes.
Keep this local; preserve the headland, cliffs and established home pad.
Do not introduce swimming or new movement rules for this shallow feature.

Extend the water material for still shallow water: subtle ripples, bed tint,
soft highlights and coherent day/night shading. Do not inherit strong ocean
waves, river streaks or shoreline foam in inappropriate places. Expensive
real-time reflection/refraction is not a baseline requirement. The water must
still look like water at Low quality, and appear credible without reflection.

## 5. LOCAL WHITE FLOWER MEADOW

Add a small white-flower meadow in front of the courtyard, concentrated on
the left foreground with a smaller balancing patch on the right.
Start with an irregular total footprint around 40–70 square metres, then
tune to the actual view. Do not scatter flowers across the entire island.

- Small, simple white five-petal flowers with fine green stems, about
  0.12–0.25 m tall initially; variation should be modest.
- Cluster density, with fuller patches and sparse edges dissolving into grass.
- Preserve exposed grass, occasional stones and clear walking routes.
- Exclude pond water, thresholds, steps, spawn, paths and collision obstacles.
- Keep the water, candles and portal names visible from human eye height.
- Anchor roots to actual terrain; no floating flowers or buried heads.
- Reuse a few small meshes/materials and deterministic seeded placement.
- Share the existing wind approach; subtle sway only, respecting reduced
  motion. Cull/fade by distance and quality without conspicuous popping.
- At night petals receive moonlight and nearby warm light; they do not emit
  their own light. Avoid a luminous white carpet and excessive alpha overdraw.

## 6. DAY/NIGHT SYSTEM

Add a compact, accessible environment setting: Auto / Day / Night.
Put it in the existing world menu or a restrained control location without
crowding the speed controls or interfering with canvas input.

Default to Auto using device-local time. Suggested artistic schedule:
- 06:00–08:00: dawn transition.
- 08:00–17:00: day.
- 17:00–19:00: dusk transition.
- 19:00–06:00: night.

This is an artistic schedule, not astronomical sunrise/sunset. Keep constants
central and documented. Day and Night fix the environment for review and
preference; persist validated selection across reloads and world navigation.

- On initial load, calculate the correct environment before the first visible
  world frame; do not flash daytime first at night.
- Manual changes should blend coherently over approximately 3–5 seconds.
  Honour reduced motion with an immediate or brief transition.
- Blend sky, sun/moon contribution, hemisphere/ambient light, cloud colour,
  fog, water, terrain, timber, distant shells and portal presentation together.
- Inspect custom shaders and LOD materials for baked daytime assumptions.
  Night must remain consistent when a building changes representation.
- Keep one authoritative environment state. Never rebuild the entire world,
  reload landmark assets or allocate replacement lights every transition.
- Auto checks should be low-frequency and cooperate with existing sleep/
  visibility behavior. Recompute after returning to a tab; do not replay
  missed background animation or add another permanent RAF loop.

This is a local viewing preference. Do not change multiplayer physics,
permissions, user content, server protocols or real collaborator state.

## 7. MOONLIGHT AND NIGHT READABILITY

Add a clear but restrained moon in a fixed world direction, initially testing
the upper-right forward sky from home, separated from important tower outlines.
Its lighting direction must agree with its visible position. It must not
follow the camera or render through nearer terrain/buildings. Use a soft
halo and modest detail; no giant decorative moon covering the scene.

- Use cool moonlight and low-level sky fill to preserve terrain, cliffs,
  paths and the large architectural silhouettes.
- Candles provide warm local accents and structure, not all illumination.
- Preserve timber colour/texture and dark-light variation. Avoid crushed
  black interiors, uniform blue daylight and excessive bloom or exposure.
- Clouds, mist and sea must belong to the same night environment, without
  daytime-white cloud masses or glaring water.
- Keep night navigation and the glass labels usable on every quality tier.
- Use the existing directional-shadow architecture deliberately; avoid
  duplicating full sun and moon shadow workloads unnecessarily.

## 8. ONE CANDLE DESIGN, INDEPENDENT OF BUILDINGS

Use low, wide, WHITE cylindrical candle cups: a visible rim, slightly inset
wax surface, short wick and small warm-white/gold flame. These are squat
candle containers, not tall taper candles, torches or attached wall sconces.
Initial size: diameter 0.22–0.32 m, height 0.12–0.20 m; tune to human scale.

- Candle cups remain present by day, with flame, glow and lighting OFF.
- Fade illumination on at dusk and off at dawn; do not change positions.
- Use subtle flame variation, respecting reduced motion; no excessive smoke
  or uncontrolled particles.
- Groups of roughly 3–7 may mark important nodes, with deliberate variation.
  Do not fill every available surface or enlarge cups for distant visibility.
- Treat candles as environmental exhibition lighting, separate from the
  wooden structures, player inventory, work snapshots and building physics.
- Do not embed lamps into beams, grow fixtures out of columns, add brackets
  or change the landmark's timber pieces to support the lighting.

Prefer stable horizontal surfaces with sufficient support. For selected
wall/column locations that need mid-height lighting but have no suitable
platform, use sparse, clearly DETACHED hovering candle cups/groups with a
visible air gap from the structure. They must look like independent ambient
objects, not broken attachment geometry. Keep cups upright and positions
stable; do not create moving swarms or cover every wall with floating lamps.

## 9. STRUCTURE-AWARE PLACEMENT ACROSS ALL 20 LANDMARKS

Inspect each recipe and generated geometry. Define deterministic lighting
anchors in each landmark's local frame, transform them through its placement,
and associate them with logical platform/room/entrance groups.
Do not use unrestricted random scattering or a single generic bounding-box
ring around every building.

Placement requirements:
- Verify supported cups fit a real horizontal surface without overhang.
- Exclude doorways, stairs' walking centres, fly-throughs, spawn/safe points
  and landmark observation routes.
- Avoid intersections with timber, roofs, water and surrounding terrain.
- Positions remain stable across reloads, LOD changes and revisits.
- Keep environmental light data separate from user-created work data.

Use these architectural rules:
- L01–L04: entrances, column bases, sides of approach stairs and landings;
  preserve dark intervals between columns.
- L05–L08: bridge ends/safe platforms, theatre circulation nodes and selected
  dome-hall entrances/interior column bases. Make interior volume legible.
- L09–L12: gates, courtyard nodes, stair landings and circulation corners;
  avoid lighting every battlement or every window.
- L13–L16: glasshouse main hall, major lattice-tower platforms, significant
  setbacks, dam-crest entrances/endpoints and suitable accessible spaces;
  do not cover the whole dam face with candles.
- L17–L20: lobbies, a small number of significant terraces/setbacks and upper
  destination points. Avoid continuous neon-like strips on every floor.

Each landmark needs a deliberate scheme that helps visitors find its entrance
and understand important structure. Do not consider a few candles at its
bounding-box corners sufficient. Continue beyond the representative examples
until every landmark has been addressed and checked.

## 10. LIGHTING, PERFORMANCE AND RESOURCE OWNERSHIP

Maintain the existing bounded residency, frame pacing, disposal, context
restoration and single-render-loop safeguards. Medium/Low budget gaps and
the reported GPU-process growth are existing open issues, not permission
to add uncontrolled cost or claim all budgets are met.

- Instance candle cups and flowers; share geometry, materials and animation
  resources. Avoid one material, listener or animation loop per candle.
- Separate visible flames from actual surface lighting. Emissive flame meshes
  alone do not illuminate adjacent timber.
- Test a bounded pool of nearby non-shadowed light groups, initially at most
  8/4/2 active local lights for High/Medium/Low. These are tuning ceilings,
  not proven performance guarantees or required targets.
- Choose relevant groups by distance and spatial context, with hysteresis
  and fading to avoid lights jumping when turning or crossing a boundary.
- Prevent conspicuous light leakage through walls using room/platform-aware
  selection, limited ranges and appropriate visibility/occlusion checks.
  Do not solve all leakage by adding hundreds of shadowed point lights.
- Use coherent lower-cost distant lighting/appearance where appropriate;
  do not leave distant architecture black with only floating orange dots.
- Preserve essential interior readability on Low. Reduce decorative density,
  distant flame animation, glow and ripples before sacrificing navigation.
- Flowers/cups/flames/water must respect culling, quality changes, disposal
  and context restore. Release unused resources on leaving the world.
- Keep implementation modular: courtyard layout, lighting anchors, environment
  state and light-group scheduling should not all become more WorldView code.

Record comparable before/after draw calls, triangles, frame times where
meaningful, resource counts and memory. Distinguish pre-existing failures
from regressions. Never claim real-GPU or physical-phone validation from
software rendering or desktop emulation.

## 11. PRESERVE EXISTING UX

Retain visible-cursor left-drag looking, drag threshold/cancellation, optional
Look lock, Escape release, keyboard look, movement and vertical controls,
Walk/Run/Fly, touch controls, fullscreen behavior and Return to world.

Do not silently change the established movement speeds in this visual task.
UI interaction must not rotate the camera, move the player or swallow input
for form controls. New environment settings follow the existing focus rules.

Keep homepage scrolling, embedded/standalone distinction, pose restoration,
unsaved-edit protection, ordinary links and no-WebGL fallbacks usable.
Account creation is not needed for public world validation. Use local test
fixtures for authenticated regressions; do not create or publish live works
merely to demonstrate this visual change.

## 12. IMPLEMENTATION SEQUENCE AND ACCEPTANCE

Work sequentially under the existing memory supervisor. Do not overlap heavy
builds, world generation and browser suites. Regenerate only assets affected
by the implementation, preserving unrelated evidence.

A. Establish the current baseline, then implement the homepage copy, stone
   portals, pond, platform, paths and local white flowers. Inspect daytime
   composition at eye height, from above, and on a mobile viewport.
B. Implement the common environment state and night system. Validate home,
   L04 stairs/colonnade, L08 dome interior and L20 high tower as representative
   lighting cases. Iterate until they are coherent and readable.
C. Extend the established placement rules to all 20 landmarks. Complete this
   scope rather than stopping at the pilot scenes or waiting for optional
   approval after each stage.
D. Validate the full affected experience and leave a working local preview.

Acceptance checks:
- Homepage introduction is correct; the embedded world and original content
  remain normally scrollable and all existing actions work.
- Spawn view reads as flowers, low water/stone/candles, portals and distant
  landscape; the sea, skyline and destination text remain visible.
- Walk around/through the shallow courtyard and use all gates without traps,
  collision mismatch, accidental activation or high-speed tunneling.
- Pond geometry has no floating water, solid grass inside the visible basin,
  z-fighting, broken banks or inappropriate ocean effects.
- Flower distribution is local and stable, with no blocked routes or glow.
- Test Auto at dawn/day/dusk/night boundaries and across midnight using an
  injectable test clock; do not change the operating system's clock.
- Test Day/Night override, persistence, first load, reduced motion, tab return,
  pause, fullscreen and world/workbench round trips.
- Verify daylight extinguishes flames, glow and illumination, while cups stay.
- Inspect every landmark by day and night, including its approach, interior
  and high view where applicable; verify mid-height candles are detached and
  supported candles rest correctly.
- Check LOD/light selection changes while moving, teleporting and turning;
  no sudden black buildings, light pops or lights shining through solid walls.
- Check all quality tiers, context loss/restore and repeated world visits;
  no duplicated renderer, accumulating resources or extra render loop.
- Run meaningful affected unit/browser checks and required repository checks.
  Preserve clear reporting of pre-existing failures and unavailable devices.

Capture genuine local-build visual evidence: home in day/dusk/night, portal
close-up, flower/pond close-up, candle-cup close-up, L04/L08/L20 matched day/
night views, and representative remaining landmark groups. Screenshots must
come from the implementation, not generated concept art.

## 13. DOCUMENTATION AND HANDOFF

Update relevant evidence/status records and briefly integrate the iteration
into PROCESS.md within its existing word guidance. Record the user's actual
requests and the resulting design decisions; preserve personal reflections.
Do not invent user approval of the final visuals, claim unresolved performance
issues are fixed, or confuse local implementation with production deployment.

Report:
- Completed features and files changed.
- Actual courtyard dimensions, candle/flower counts and placement approach.
- Final Auto schedule, moon direction, environment controls and quality limits.
- Relevant visual, regression, resource and performance results.
- Remaining limitations, pre-existing failures and unverified devices.
- The exact local preview URL, build it serves and what to inspect first.

Rebuild and start the updated local preview. Keep the server running for
manual review and stop automated browser testing during that review.

Do not commit, push or deploy.
