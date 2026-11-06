# Courtyard, stone gateways and day/night (2026-11-06/07)

From [`stillwood_courtyard_daynight_upgrade_prompt.md`](../../stillwood_courtyard_daynight_upgrade_prompt.md) (the
directive). Local and **uncommitted** on top of `b30a9bb`. That commit (the island before this round) was pushed and
deployed by CI on 2026-11-06; nothing in this document is deployed. Every measurement below comes from headless
Chromium on SwiftShader (software WebGL) at 1280 × 720 under `scripts/world/supervise.ts`, against a local production
build. **None of it was run on a real GPU or a physical phone.** Status per requirement:
[requirements-status.md](requirements-status.md#courtyard-stone-gateways-and-daynight-2026-11-0607).

## What was built, and where

| Part | Code | Checked by |
| --- | --- | --- |
| Homepage introduction (§2) | `src/client/pages/Gallery.tsx`, `styles.css` | `world-protection.spec.ts` (exact copy; the old heading is gone) |
| Stone gateways (§3) | `src/world/gateways.ts` (layout, colliders), `src/client/world/stonework.ts` (geometry), `environment.ts` | `tests/world-gateways.test.ts` (21) |
| Courtyard, pond, meadow (§4–§5) | `src/world/courtyard.ts` (pure layout and ground), `src/client/world/courtyard-view.ts`, `materials.ts` | `tests/world-courtyard.test.ts` (19) |
| Day/night state (§6–§7) | `src/client/world/daynight.ts` (pure), `lighting.ts`, the HUD's Light control in `WorldStage.tsx` | `tests/world-daynight.test.ts` (19), `world-daynight.spec.ts` (5) |
| Candles (§8–§10) | `src/world/candles.ts` (resolver), `candle-schemes.ts` (20 schemes), `src/client/world/candles-view.ts` | `tests/world-candles.test.ts` (108), the generator's own checks |

The generator (`scripts/world/build-world.ts`, now `world-gen/4`) resolves each landmark's candles against its own pieces
in its per-landmark child and fails the build on a dropped group or a ground group off the terrain. Generated
reports: [`candles.md`](candles.md) and [`candles.json`](candles.json).

## The courtyard as built

Laid out in the spawn's horizontal frame: F metres forward, L metres to the left.

| Item | Directive proposal | Built |
| --- | --- | --- |
| Pond centre | 14–16 m forward, 4–5 m left | 15.5 m forward, 4.5 m left |
| Pond size | about 12 × 8 m, softly irregular | 12.9 × 8.3 m overall (ellipse 12.4 × 8.4 with a three-term wave), turned 0.12 rad |
| Water | 0.15–0.25 m | 0.20 m over a flat bed, 4 cm below the rim; the bed rises smoothly from 78 % of the radius |
| Platform | 3–4 m, low | Nine-sided stone 3.2 × 3.1 m, top 0.14 m above the water, seven-cup group off-centre |
| Stepping stones | a few, safe, flat | Three, 0.07 m above the water; gaps bank → 0.23 m, then 0.74, 0.63 and 0.58 m to the platform |
| Edge stones | low, irregular | 22 rock-family stones around the rim (0.14–0.30 m tall), gaps left at the landing and the candle stones |
| Routes | about 3 m, around and to every gate, no water | A 3 m ring 2.5 m outside the rim, a spawn route and one branch per gateway; none crosses the pond (tested across the full width) |
| Approaches | about 4 m before each threshold | 7 × 4 m clear rectangles; no slab, stone, cup or flower inside (tested) |
| Meadow | 40–70 m², left fuller | About 49 m² (1 m cells holding a flower), 750 flowers at High: 492 left, 258 right; stems 0.12–0.25 m. Three small meadow rocks |
| Home candles | modest groups | 9 groups, 31 cups: the platform (7), two pond-edge stones (3 each), two plinths per gateway (3 each, outside the opening) |

The basin is an explicit surface: `courtGround` (the bed, the platform and stones) is the ground the explorer stands on,
the terrain shader discards its fragments inside the outline, and the basin mesh is drawn from the same profile, so
there is no water rectangle laid over grass. The terrain data and the home pad are unchanged. A late fix, found by the
new courtyard test: the candle cups overhung their pond-edge stones and gateway plinths by 3–9 cm. Those stones are now
sized to the cups they carry, with at least 3 cm of stone outside every cup's rim. One meadow rock that sat 0.5 m
inside the ring route was moved off it.

## The gateways

Same positions, yaw and clear passage as the timber frames (5.3 m wide at the foot, from the old colliders), in the
island's rock material. From the initial spawn the projection is My Works, Explore the World, Build Together, left to
right (the layout's own order, checked in `world-portal-labels.test.ts`).

| Gateway | Form | Outer W × H | Opening top | Stones / fill / colliders |
| --- | --- | --- | --- | --- |
| Explore | pointed two-centred arch on tapering piers, keystone | 8.3 × 11.8 m | 10.1 m | 35 / 8 / 14 |
| My Works | coursed piers, monolithic lintel, capping course | 10.0 × 11.4 m | 9.4 m | 29 / 8 / 3 |
| Build Together | paired supports corbelled inward to a capstone | 9.8 × 11.2 m | 9.3 m | 30 / 8 / 21 |

The membranes, lettering, IDs, destinations and cooldowns are unchanged; the lettering layout was re-fitted to the new
openings. Tested: every structural stone bears on the ground or on another stone, no corbel oversails by more than
0.4 m, no collider enters the opening, and Run + boost (60 and 10 fps) passes straight through each opening while
Fly + boost at the stone (60 fps and the clamped frame) never ends inside it.

## Day and night

- **Control.** Auto / Day / Night, in the HUD next to the existing controls, remembered per browser
  (`stillwood.worldLight.v1`, validated; invalid or blocked storage means Auto). A local viewing preference: no
  server, physics, permission or work data changes.
- **Schedule** (device-local time, `daynight.ts` `SCHEDULE`): 06:00–08:00 dawn, 08:00–17:00 day, 17:00–19:00 dusk,
  19:00–06:00 night. Auto re-reads the clock every 60 s while the page is visible and snaps when the tab returns; it
  never replays a missed transition and adds no animation loop of its own.
- **Blends.** A manual change blends over 4 s (0.25 s with reduced motion). The first frame is computed before
  anything is drawn, so a night load is night from the start (tested in the browser at a fixed 23:30).
- **One key light.** The one shadowed directional light is the sun by day and the moon by night. It changes over at
  mid-twilight, while it is dimmed to nothing. The moon's direction is fixed: (0.755, 0.326, 0.569), 30° right of
  the home view and 19° up, above the skyline's towers. Moonlight is #aebfe6 at 1.3, and the hemisphere fill stays at
  1.05 at night, so nothing is crushed to black. The sky, fog, clouds, water, terrain, timber, distant shells and
  portal lettering all follow the same value.
- **Candles.** The cups are always drawn. The flames, glow and light pool fade in with the night from 0.3 and are
  full by 0.75, so they are off by day and through early dusk.

## Candles across the twenty landmarks

**179 groups and 722 cups on the landmarks**, plus 9 groups and 31 cups at home. By role: 110 supported, 55 ground
and 14 detached; 76 are essential (navigation). No group is dropped. The cups are white, low and wide: diameter
0.22–0.32 m, height 0.13–0.21 m (a group's centre cup is 2 cm taller), each with a rim, inset wax, a wick and a
flame. Every scheme states its intent; see [`candles.md`](candles.md).

- **Supported** groups sit on a level timber top face (or a solid plank finish where the scheme allows it). That face
  carries every cup's whole footprint, and nothing of the building comes inside the cup.
- **Ground** groups stand on the landmark's pad, but only where the island's terrain is actually at pad level under
  every cup and no river or basin covers it. A late fix found three landmarks breaking this:
  - L16's toe groups stood over the river cut through the canyon floor; they are now on its dry banks.
  - L06's and L13's entrance groups stood 4–9 m above the hillside beyond the edge of their pads; they were moved
    onto the pads.

  The generator now rejects any ground cup more than 3 cm off the world heightfield.
- **Detached** groups hover with a 0.45–2.5 m air gap. They are a minority everywhere except L16. The dam's crest road
  is slatted decking that no cup can stand on without overhanging, so its five groups of three hover over a 300 m
  crest. No cup stands on a walking line, a fly-through, a safe point or a viewpoint.
- **The light pool** is 8 / 4 / 2 non-shadowed point lights (High / Medium / Low), created once and never reallocated.
  Groups are chosen by distance and weight, with hysteresis and 0.6 s fades. An interior group lights only a viewer in
  its zone (or within 6 m of it), so light doesn't show through walls. On Low about half the decorative cups are
  dropped; every essential cup stays.

## Resources: before and after

The same views, the same build of `tour.ts --stage tris` at High. "Before" is the island at `b30a9bb` (timber portals,
no courtyard, fixed sun); after is this tree at Auto noon and Auto 22:30.

| View | Before: calls / triangles | After, day | After, night |
| --- | --- | --- | --- |
| Home | 140 / 623,369 | 141 / 676,706 | 151 / 703,032 |
| L04 ground | 175 / 760,898 | 175 / 776,434 | 186 / 828,824 |
| L04 interior | 115 / 671,994 | 117 / 679,446 | 128 / 731,966 |
| L04 high | 201 / 942,177 | 203 / 951,897 | 214 / 992,319 |
| L08 ground | 157 / 781,879 | 159 / 790,951 | 164 / 779,889 |
| L08 interior | 124 / 668,575 | 125 / 673,975 | 131 / 697,285 |
| L08 high | 158 / 617,837 | 157 / 632,293 | 165 / 717,775 |
| L20 ground | 140 / 479,445 | 141 / 482,685 | 144 / 503,359 |
| L20 interior | 58 / 229,644 | 59 / 232,884 | 69 / 326,862 |
| L20 high | 109 / 546,280 | 107 / 553,392 | 118 / 649,392 |

At home by day the new items cost:

| Item | Draw calls | Triangles |
| --- | ---: | ---: |
| Flowers (instanced) | 1 | 30,000 |
| Candle cells | 2 | 7,884 |
| Courtyard | 4 | 4,958 |

The stone gateways take 10 draw calls where the timber frames took 15, at 5,440 triangles (was 1,626). At night the
moon's shadow pass covers different shells from the sun's (home shell shadows 9,908 → 35,940 triangles), and lit
candle groups add up to 11 draw calls in a view. There is still one shadow pass: never sun and moon together.

Process memory for the same tour run (the cgroup peak) went from 1,126 MiB before to 691 MiB (day) and 672 MiB
(night). GPU programs went from 22 to 31 (the flower, cup, flame, basin, pond and moon materials); textures stayed
at 5. Over the 80-pose landmark tours at High, draw calls reached at most 224 and triangles 1.19 M (L09's interior,
the same as before).

**Context loss and restore** (`tour.ts --stage context`, three cycles): rendering stops while the context is lost and
resumes after restore, and input moves the player again. After each restore the counts are unchanged: 21 candle
cells, 753 cups, a pool of 8 lights and 750 flowers, with the moon still the key light. Nothing is duplicated.

**Quality tiers.** At home, at night:

| Tier | Draw calls | Triangles | Light pool | Flowers | Cups drawn |
| --- | ---: | ---: | ---: | ---: | ---: |
| High | 151 | 703,032 | 8 | 750 | 73 |
| Medium | 151 | 558,720 | 4 | 488 | 73 |
| Low | 132 | 346,580 | 2 | 285 | 59 |

On Low the pond ripples and the flame flicker are off.

On Medium and Low, a decorative group beyond its own range gets no light. So the L08 "interior" view (looking up into
the dome from its floor) has none on those tiers. It stays moonlit and readable, and the essential pier groups light
the floor nearer the piers.

## Screenshots ([`courtyard/`](courtyard/))

All taken from the local build, with the clock fixed inside the page (the OS clock was not changed).

- **Home by day, dusk and night:** `home-{day,dusk,night}-home-spawn.jpg`, `-candle-close`, `-portal-explore`.
- **Home close-ups (day and night):** `-home-above`, `-pond-close`, `-flowers-close`, `-portals-all`, `-portal-works`,
  `-portal-together-behind`.
- **Matched day | night pairs:** `pair-L04-*`, `pair-L08-*`, `pair-L20-*` (approach, interior and two candle groups).
- **All twenty landmarks:** `landmarks-f1-0…9.jpg` (L01–L10) and `landmarks-f2-0…9.jpg` (L11–L20), each four views,
  day on the left and night on the right.
- **Phone at 390 × 844 (emulated):** `phone-*.jpg`. **Low tier:** `tier-low-day-night.jpg`.
- **Before and after:** `before-home.jpg`, `after-home-day.jpg` and `after-home-night.jpg`.

Every landmark was reviewed by day and by night. Moonlit buildings keep their form rather than reading as black shapes
with floating dots.

## Found and not fixed (pre-existing)

Auditing the ground groups showed some of the recipes' own safe points and ground viewpoints sitting off the terrain
where a pad ends or the river is cut. These come from the recipes, not from this round. They are recorded here and
were not changed:

| Item | Recorded y | Terrain y |
| --- | ---: | ---: |
| L05 safe point `streambed` | 35.5 | 40.6 |
| L06 safe point `outside` | 96.5 | 87.45 |
| L13 safe point `west` | 81 | 77.07 |
| L16 safe point `toe` | 20.5 | 18.5 (over the river cut) |

The ground viewpoints of L02, L06, L13 and L16 are 2–8.5 m above the terrain at eye height. L13's "long" entry runs
into the hillside past local x ≈ 166, and L16's toe entry crosses the river cut.

## Not verified

- Frame rate and GPU memory on a real GPU.
- Any physical phone, or Safari/Firefox rendering.
- A real mouse under Look lock with the new Light control.
- How the night looks on a calibrated display.
- The author has not yet reviewed the final visuals; nothing here records their approval.
