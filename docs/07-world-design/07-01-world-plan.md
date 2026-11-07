# Stillwood — Complete Island World and Monumental Exhibition Design

Project: COMP4020 Final · Stillwood  
Date: 2026-11-03  
Status: The whole island remains a design and implementation specification. It has not been integrated and deployed, environmental assets have not been downloaded, and browser performance validation has not been completed. The third edition, dated 2026-11-03, adds actual offline components and staircase physics validation using the original piece specification; see Section 19.  
Basis: all product requirements from this round, the project's `final_spec.md`, and current repository commit `b13ecaee79f29930827c0b7db660861a73ccddae`. Dimensions, budgets and capacities in this document are design starting points to be adjusted through measurement, not existing achievements.

## 1. Core direction

**What you build with other people becomes a place that later travellers can enter, pass through and climb.**

Stillwood is an island world for shared construction and free flight. People set out from a home on a grassy slope, travel between valleys and monumental structures, and discover other people's works. When they meet someone they want to create with, they enter a shared workbench. Once the author actively publishes a finished work, it becomes a new place in the public world.

Monumental architecture provides the initial attraction; terrain and flight make exploration worthwhile in itself; shared creation gives the world continuing new content. Exploring alone should also feel complete and interesting. The experience must not depend on someone else being online.

Sky: Children of the Light is a reference for spatial mood and the rhythm of travel: grassy slopes, open skies, distant landmarks, doors into other areas, and the change in outlook when rising from low ground to high places. This project uses an original map, buildings, interface and asset combination. It does not copy Sky's maps, characters or sound effects, or extract its game assets.

### Confirmed product requirements

| ID | Requirement that must be implemented |
| --- | --- |
| W01 | The initial screen enters a first-person home, with no visible player body; players can move up to a door and enter its destination. |
| W02 | The home has entrances to the exhibition world and My Works; add an entrance to Build Together so the social flow is discoverable. |
| W03 | The exhibition supports walking, flying, and moving up and down around buildings, rather than only clicking a list of works. |
| W04 | At least 20 enormous prebuilt buildings, including a dam, tall towers, skyscrapers, European-style and Roman buildings. |
| W05 | Buildings unfold along a curved main valley and sit at varied positions on the slopes to either side. Architectural language progresses from ancient to modern along the route, and overall height increases from region to region. |
| W06 | Grassland has base colour, texture, grass clumps, wind and surface detail; it is not one green curved surface. |
| W07 | Include sky, clouds, valley mist, sea, cliffs and gravel, with a consistent style and lighting. |
| W08 | Invisible boundaries limit the playable area, with understandable guidance near them. Players cannot fall into bottomless space or become permanently stuck. |
| W09 | Meaning is expressed directly through entrance copy, actual exploration, shared building and publishing works. |
| W10 | Preserve existing multiplayer construction, saves, identity permissions and work-management capabilities. The world upgrade must not damage existing reliability. |
| W11 | The core flow must work on desktop and at a 390×844 mobile viewport, with keyboard and reduced-motion paths. |

## 2. Player journey and world setting

### 2.1 Home: three doors that players can actually walk through

The spawn is a grassy platform facing the sea. Nearby grass clumps and a few rocks fill the foreground; three wood-and-stone gateways occupy the middle distance; the exhibition island's tallest tower is visible far away. The initial camera faces a landmark, not empty ground. On first arrival, show one sentence:

> Every place here began with a few wooden sticks. Explore the worlds others have left behind, or build a new place with someone.

| Door | Information visible in front of it | After entering |
| --- | --- | --- |
| Explore the World | “Fly along the valley and find works you can enter.” | The grassy slope at the exhibition island's entrance; on the first visit, offer low and high routes. |
| My Works | “Continue your last idea.” | Signed-in users enter their works space; signed-out users receive a clear sign-in entry. |
| Build Together | “Join an open workbench, or invite a friend.” | Show genuinely open rooms, people present and available seats. When nobody is online, users can create a room or begin alone. |

Doors have thickness, recognisable silhouettes and destination text; colour alone must not distinguish them. Show labels at about 6 metres and an entry prompt at about 2 metres. Transition after crossing a clear threshold, with a short cooldown to prevent repeated triggering. Keyboard users can select a door and confirm; touch users can tap to enter. Ordinary links to all destinations must also remain available. During loading, keep the destination and progress visible. Failure must allow a return home, rather than an endless black screen.

Initial mouse control must be triggered by clicking “Start Exploring”; do not capture the mouse as soon as the page opens. ESC opens the pause menu and releases the mouse. Regaining control also requires an explicit action.

### 2.2 Exhibition: see → approach → pass through → climb → discover the next place

At the entrance, reveal only part of the buildings. The full valley gradually appears after crossing the crest. From below, the player senses the mass of the dam and colonnades; ravines and bridge openings offer passages. Rising to a tower's top reveals the coast and the next landmark. Guide the route through openings in the terrain, building silhouettes, paths and lighting, rather than numerous quest arrows.

Every building has at least one ground-level viewpoint, one space that can be entered or passed through, and one elevated viewpoint. The main route connects five regions, but players may leave it and fly freely. A short work plaque appears at close range. Author, description and creation entry expand only when deliberately inspected; do not fill the air with cards.

Clearly label prebuilt monuments as “World Preset Building”. Real player works show their public attribution and snapshot information. Do not present presets as creations by nonexistent players, or fabricate online counts or activity.

### 2.3 How meaning appears through interaction

| Moment | Directly visible guidance | Corresponding real capability |
| --- | --- | --- |
| First entering the island | “Find a place you want to walk into.” | Entering buildings, circling them and climbing. |
| Inspecting a work | “This place was built together by…” | Read genuine public author information without revealing private identities. |
| Wanting to join others | “They are building now. There is one place left.” | Appear only when a genuinely open room has a seat; the server confirms admission after the click. |
| Beginning a work | Optional inspiration: “A doorway to fly through / a roof that invites people to stay / a bridge between two sides.” | Offer a starting point for imagination without changing the stick rules or requiring task completion. |
| Preparing to publish | “Leave it in the world for others to discover.” | Preview public content; the author actively confirms publication, and withdrawal remains possible. |
| Successful publication | “Your work is here now.” | Point to the public exhibit position and a shareable entry. Animation must not substitute for genuine save confirmation. |

Do not add daily check-ins, leaderboards, compulsory collectibles or “collaboration skill scores”. The novelty of this round comes from works becoming spaces to travel through, and from people moving naturally between exploration and shared creation.

## 3. Island terrain and spatial layout

### 3.1 Scale and coordinates

The world uses independent world units, with a visual scale of approximately 1 unit = 1 metre; this does not change the existing workbench's physics units. The second edition suggests an island bounding area of about 2800×1500 metres, a main valley tour axis of about 2400 metres, sea level at y=0, coastal grassy platforms at about 35–65 metres, and ordinary ridges at about 120–170 metres. Locally raise the two sides of the dam to 190–210 metres. Do not make the entire rectangle walkable.

Human eye height is about 1.65 metres and collision radius about 0.35 metres. Doors, column bases, steps and foreground rocks provide scale references. Second-edition buildings range from 32 to 340 metres high, increasing overall by region. Horizontal exhibition halls and the dam may create local reductions in height so they retain their characteristic proportions. First validate that looking up from the ground feels imposing and that the structure becomes legible on ascent; then adjust the numbers.

Walking is about 5 metres/second, normal flight about 15 metres/second, and boosted flight about 32 metres/second, with smooth acceleration and deceleration. Adjacent main points of interest are about 100–250 metres apart; crossing between regions may take about 20–45 seconds of flight. Provide landmark jumps across the island so players are not forced to traverse empty ground. Even the fastest route should pass terrain features, openings or changing views.

### 3.2 Five-region layout: a historical promenade along the main valley

| Region | Relative location and terrain | Scenic rhythm |
| --- | --- | --- |
| A Origins Slope / L01–L04 | First 0–450 metres of the main route; broad gentle grass slopes, lintels, column forests and Greek orders | From a 32-metre gateway to a 56-metre colonnade; first observe how beams span columns. |
| B Arches and Domes / L05–L08 | 450–950 metres; the first stream valley and terraces on either side | An aqueduct crosses the route; theatre and domes occupy separate side slopes; 68–96 metres. |
| C Castles and Palaces / L09–L12 | 950–1450 metres; the route bends, and rock terraces and side valleys form courtyards | Castle, pointed arches, Renaissance dome and Baroque enclosure; 108–154 metres. |
| D Industrial Gorge / L13–L16 | 1450–1950 metres; a broad grassy basin followed by a deep gorge | Transparent pavilion, lattice tower, setback high-rise and dam alternate horizontal and vertical masses; 96–212 metres. |
| E Contemporary Sea Cliffs / L17–L20 | 1950–2400 metres; climb to cliff-top terraces facing the sea | Curtain-wall frames, bundled tubes, triangular bracing and spiralling setbacks; 244–340 metres. |

Give the main valley a gentle S-curve. The valley-floor sight corridor is about 70–140 metres wide, expanding to 220–350 metres at open nodes. Building bodies sit about 50–240 metres from the main route, arranged according to their footprints and passage clearances. Large horizontal buildings may extend along the valley; do not mechanically squeeze four monuments into the same cross-section. Aqueducts, city gates and some skybridges frame views across the route, leaving at least 12 metres of clear width for flight.

Vary building orientation, forward/backward offset, elevation and grouping; do not arrange them in two rows. Each region has at least one side exploration route that returns to the main valley. Three ridge occlusions create an “occlusion–turn–reveal” rhythm, but players can fly around them. Terrain need not rise monotonically; the building skyline is what generally increases towards the rear. Move the dam into the industrial section and design it together with a downstream gorge and upstream reservoir basin.

This travel route selects 20 representative architectural languages. It does not claim to cover the whole of global architectural history, or imply that taller buildings are more advanced. Short scene prompts can progress through “Beams span columns”, “Arches open larger spaces”, “Domes enclose the sky”, “Frames lift buildings higher”, and “What would you like to leave here next?” Historical detail appears in work plaques that users choose to expand.

### 3.3 Terrain generation and foundations

Use a combination of an author-controlled heightfield, separate cliff meshes and rock instances. The heightfield handles grass slopes, ridges and the valley floor; separate meshes handle steep cliffs, openings and local overhangs. Do not force a heightfield to represent vertical or folded surfaces. Close the island's underside so low-flying players cannot see the back of a thin sheet.

Terrain data includes height, slope, grass/soil/rock weights, paths, building foundation areas, shorelines and scatter-exclusion areas. Fix building footprints and the main path first, then flatten local foundations. Connect elevation differences with stairs, retaining walls and rock terraces. Buildings must not float, column feet must not protrude through the ground, and the whole slope under a building must not be crudely cut into one large square block.

Begin with terrain chunks of approximately 128 metres, using different mesh densities for near, middle and far distances. Share edge samples to prevent cracks between chunks. Leave a buffer beyond the coast for flight around cliffs; place invisible boundaries over the sea rather than tightly against cliff faces.

## 4. Catalogue of twenty monuments: from ancient to modern

This edition replaces the previous building list and the meanings of its L identifiers. All dimensions are **design values for this project**, ordered width×depth×height, including the main crown but excluding terrain. They are not measurements of the original buildings. The precedents supply architectural language; we adjust proportions for flyable spaces. Detailed layers, component-count rules and placement instructions appear in Sections 14–17. Each building has its own identity, construction and interior route; changing one tower's height does not count as making twenty buildings.

| ID | Region / design name | Reference building or language / period | Designed envelope W×D×H | Layered composition |
| --- | --- | --- | --- | --- |
| L01 | A / Ring of First Gateways | Stonehenge lintels and circular arrangement / prehistoric | 72×56×32m | Three foundation bands, 20 outer-ring columns, 5 inner gateway groups and lintels at varied heights. |
| L02 | A / Forest of Lotus Columns | Karnak hypostyle hall / ancient Egypt | 144×104×44m | Low side halls, high central hall, 48 columns with bundled stems and floral capitals. |
| L03 | A / Ridge Doric Temple | Parthenon column order / ancient Greece | 96×184×52m | Three-tier platform, 46 outer columns, architrave/frieze/cornice and pitched pediments. |
| L04 | A / Volute Terrace Palace | Erechtheion Ionic language / ancient Greece | 112×128×56m | Two terraces at different levels, main hall and side porch, volute capitals and recessed/projecting roof levels. |
| L05 | B / Triple Aqueduct | Pont du Gard's stacked arches / ancient Rome | 300×20×68m | Three unequal-height arched tiers, 6/11/35 openings, and a water channel on top. |
| L06 | B / Ring Theatre | Colosseum / ancient Rome | 240×196×78m | Three arcade levels, an upper wall band alternating solid and open sections, internal ring passages and seating. |
| L07 | B / Oculus Dome Hall | Pantheon / ancient Rome | 112×144×86m | Portico, rotunda, hemispherical dome, five coffer bands and an oculus. |
| L08 | B / Floating Dome Hall | Hagia Sophia's pendentives / Byzantine | 136×176×96m | Four large piers, four arches, pendentives, a main dome and two half-domes. |
| L09 | C / Double-Ring Sea-Breeze Castle | Carcassonne walls and towers / medieval | 176×152×108m | Two rings of walls, 8 outer towers, a six-storey keep, conical roofs and battlements. |
| L10 | C / Pointed-Arch Cloud Aisle | Amiens ribs and flying buttresses / Gothic | 112×216×128m | Eight-bay nave, two-level side aisles, tall pointed-arch windows, twin towers and a central spire. |
| L11 | C / Eight-Petal Dome Palace | Florence Cathedral dome / Renaissance | 128×184×144m | Base hall, octagonal drum, eight-lobed double-shell dome and a top lantern. |
| L12 | C / Embracing Square | St Peter's Square and dome composition / Baroque | 280×240×154m | Four rows of curved colonnades, central hall facade, drum and dome. |
| L13 | D / Lattice Conservatory | Crystal Palace modular frame / mid-19th century | 320×160×96m | Low wings, central hall and transverse barrel vault; wider than it is tall. |
| L14 | D / Four-Leg Wind Tower | Eiffel Tower / late 19th century | 100×100×188m | Four curving, tapering legs, two large platforms, a narrowing lattice shaft and a top. |
| L15 | D / Crown of Setbacks | Empire State Building verticals and setbacks / 1930s | 112×88×212m | Eight-storey base, twenty-storey middle, twelve-storey tower, four-storey crown and spire. |
| L16 | D / Curved-Valley Dam | Hoover Dam arch-gravity form / 1930s | 360×160×160m | Curved dam with graded thickness, crest road, 4 intake towers and downstream powerhouse. |
| L17 | E / Vertical Court Tower | Seagram curtain-wall rhythm / postwar Modernism | 80×56×244m | Open raised lobby, 52 main floors and a service crown; verticals and horizontal bands have different depths. |
| L18 | E / Nine-Bundle Cloud Tower | Willis Tower bundled tubes / 1970s | 90×90×276m | Nine square tubes ending in groups over 60 floors, producing terraces at multiple heights. |
| L19 | E / Refracting Braced Tower | Bank of China Tower prisms and bracing / 1980s–90s | 88×88×304m | Four triangular sections, 64 floor bands, large braces in eight-floor groups and a sloping-cut crown. |
| L20 | E / Three-Wing Skyline Peak | Burj Khalifa three-wing setbacks / 21st century | 144×132×340m | Three wings and a hexagonal core, 72 main floors, one setback round every six floors and a needle top. |

Heights progress by region through 32–56, 68–96, 108–154, 96–212 and 244–340 metres. L13 and L16 deliberately remain horizontal; do not stretch them into tall towers merely to achieve a strictly increasing sequence. Terrain may raise their viewing position, but the work information must not falsely claim that the building itself is taller.

Prioritise clear widths of at least 8 metres for all important flyable openings and at least 12 metres where the main route passes through. Not every small door or window from a historical precedent needs to be traversable. Organise routes through main entrances, courtyards, arches, roof openings and viewing terraces. Collision proxies must not block these routes.

## 5. Visual production: grass, gravel, sky, clouds, mist and sea

### 5.1 Art direction

Use stylised island lighting that is soft but layered: warm green and pale gold slopes, cool grey-blue rock faces, warm-toned timber and cyan-blue sea. Fix the sun's direction and use relatively low side lighting so the building masses read clearly first. Reduce contrast and saturation with distance while retaining clear contact shadows nearby. Avoid excessive full-screen exposure, strong bloom or uniformly dense fog that washes away detail.

Retain Stillwood's timber identity. Presets may use stone foundations and limited roof or platform infill, but the main structure should visibly consist of beams, columns, arches, latticework and connections. Do not change existing player works' shapes, proportions or stick rules.

### 5.2 Grass must have three distance layers

| Layer | Method | Visual problem prevented |
| --- | --- | --- |
| Far view / macro | Grass-colour regions at roughly 30–100-metre scales, differences between lit and shaded slopes, and variation with moisture and terrain | A uniformly green distant island or an obvious tiled checkerboard. |
| Middle view / surface | Blend grass, bare soil and rock materials; correct paths and slope treatment with authored masks | Grass covering cliffs; paths looking like lines drawn onto the surface. |
| Near view / grass clumps | Original low-polygon blade clumps, instanced scattering, fixed roots and tips moving with a shared wind field | Ground-level views resembling a flat photograph; floating roots or whole clumps swaying together. |

Use slopes below 25° primarily for grass, 25–40° for blending, and above 40° primarily for rock as initial rules, with manual overrides. Distribute short and tall grass along path margins, depressions and rocks; keep the centre of the main path visibly trampled. Do not scatter points entirely uniformly at random.

Concentrate close grass mainly within about 40 metres of the player and fade it smoothly over 40–80 metres, adjusting distances by quality tier. Use vertex colours and a few shared materials rather than a texture per clump. Grass needs no physics collision and no persistent per-blade state. Use fixed random seeds for every scatter operation so screenshots and problems can be reproduced.

Unify surface texture colours and reduce high-frequency noise and excessive normal strength before use. Existing photorealistic textures are processing inputs only. Base colour uses sRGB; normals, roughness and masks are data textures. Do not assign every texture the same colour space.[T7]

### 5.3 Rocks and ground details

Create 6–10 principal rock meshes with different silhouettes. Form rock groups through rotation, nonuniform scaling and slight colour variation; add 2–3 gravel-clump types. Large rocks establish structure at cliff bases, ridges and erosion gullies. Small gravel concentrates along paths, slope feet and exposed cuts. Leave quiet empty areas in the middle of grasslands so gravel does not look like evenly sprinkled decorative particles.

Use simplified convex shapes or proxy triangle meshes for large-rock collision; small stones are visual only. Define scatter-exclusion areas in front of building entrances, at landing points and along main passages. Detail must not obstruct core routes. Ground transitions continuously from grass to soil, gravel and cliff rock.

### 5.4 Layering sky, clouds and mist

| Layer | Suggested implementation | Visual constraints |
| --- | --- | --- |
| Sky base | Three.js WebGL Sky or an original gradient sky aligned with the sun | Do not replace the entire rendering backend; retain a soft horizon.[T5] |
| Distant cloud groups | Original cloud meshes or self-made cloud textures moving slowly around the distant sky | Clear layering and silhouettes; not merely repeated identical cotton-wool blobs. |
| Middle-distance cloud bands | A few low-polygon cloud masses with a sense of volume, outside ridges and between tower groups | Leave viewing windows for landmarks; do not swallow every tall tower. |
| Valley / sea mist | Fog attenuated by height and distance, with a few local fog sheets | Thicker below but legible nearby; smooth on entry; control overlapping transparency. |

The baseline does not use full-screen volumetric ray marching. First achieve volume through lighting, cloud shapes, occlusion and local mist; consider additional effects only in the high-quality tier. Clouds and mist do not participate in hard collision. There must be no invisible obstacles inconsistent with visible cloud shapes. Always preserve at least one clear silhouette of the distant tall towers.

### 5.5 Sea and cliffs

The sea plane extends beyond the view. Slowly changing normals, view-dependent reflections and pale near-shore bands establish the water surface. Low quality uses a simple water material; high quality may add limited reflection. Real-time planar reflections are not mandatory. Shore foam comes from a precomputed shoreline distance or authored mask; avoid incorrectly placing foam around every building's feet.

Cliffs combine major cut faces, medium-scale erosion patterns and a few projecting rocks. Triplanar texture projection can reduce stretching on side faces. Grass thins near the cliff edge, exposing soil before transitioning to rock. Descending flight reveals the sea, cliff feet and complete island body, rather than the back of a green plane.

The first edition does not include swimming or drowning. Low-altitude flight over the sea is allowed; near the minimum safe altitude, slow descent and prompt the player to rise. Provide a return to the nearest safe point.

## 6. Flight, camera and invisible boundaries

### 6.1 Control scheme

| Situation | Desktop | Mobile / alternative interaction |
| --- | --- | --- |
| Move forward/back/left/right | WASD or arrow keys; normalise the movement vector | Left-side virtual joystick. |
| Look | Mouse; also provide focusable turning buttons or keyboard turning | Drag the right side to look, avoiding UI gesture regions. |
| Take off / ascend | Space; hold to keep ascending | A clear ascent button. |
| Descend / land | C in flight; land smoothly when near a standable surface | Descent button; do not mix it with page scrolling. |
| Boost | Shift; the pause menu can change it to a toggle | Optional boost button, without requiring multiple fingers at once. |
| Pause / return | ESC releases the mouse and pauses input | Fixed pause button. |
| Enter / inspect | Cross a threshold or confirm with E | Tap an entrance or work plaque. |

By default, forward horizontal flight follows the horizontal projection of camera orientation, while ascent and descent are independent, allowing stable movement around buildings. An optional “fly towards the view” mode uses the full camera-forward vector. Both modes must be clearly explained; looking up at a tower must not force the player to collide with it. PointerLockControls handles viewing and mouse locking only; do not use its planar movement methods directly as 3D flight controls.[T4]

Do not add camera roll, forced head bob or sudden zoom changes. Provide sensitivity, inverted Y, reduced motion and toggle/hold boost options. Pause world keys while paused, opening a form or entering text. Clear held-key state on focus loss so the player does not continue flying automatically on return.

### 6.2 Collision and safety

Use a capsule for the player and simplified static collision meshes for the world. Terrain, major walls, bridge decks and large rocks participate; grass, mist, small gravel and decorative sticks do not. For enterable buildings, make separate wall, column and floor proxies rather than sealing the interior with one large bounding box.

Three.js Octree can query capsule overlaps against static triangle meshes; that alone is not continuous collision detection. At high speed, limit and subdivide displacement per step, or implement reliable swept tests. Clamp delta after resuming from pause to avoid crossing a wall in one frame. Validate sliding along walls, slopes, low ceilings and corners separately.[T2]

### 6.3 Boundaries have a warning zone and a hard limit

Create a closed boundary about 60–100 metres beyond the irregular coastline; this is not the same as individual terrain-chunk boundaries. At about 40 metres from the outer limit, introduce a light wind, mist and a brief message: “The sea wind is strong. Keep exploring along the island's shore.” Reduce outward velocity progressively towards the boundary. At the hard limit, remove only outward velocity, preserving movement along the boundary and back towards the island. Do not fling the player away or show a black screen.

The suggested ceiling is y=640 metres, and it must be at least 100 metres above the tallest building. If generated data violates that condition, fail the build check and adjust the ceiling. The suggested lower limit is y=8 metres for sea areas only; actual ground collision determines land height. The intersection of lower and horizontal limits must also allow a return and must not form a sealed dead corner.

Safe points sit on validated broad platforms or ground. Before teleporting, confirm that surrounding collision and resources are loaded. If players become stuck, leave the world or request it, they can return to the nearest safe point. The pause menu always offers “Return Home” and “Go to Landmark”. These actions do not delete works or bypass room permissions.

## 7. Creation, exhibition and relationships between people

### 7.1 Preserve the precise workbench

World exploration is first-person; actual construction continues to use the existing orbit camera and desktop interaction suited to precise placement. Entering the workbench has a clear transition. Before leaving, handle unconfirmed actions and connection state; never mistake a local preview for a saved change. The first edition does not require players to place sticks while flying.

The existing 200-stick limit per work, room seats and physics rules remain in force. The twenty monuments are independent world content. They do not require twenty simultaneous server-side physics simulations, and their dimensions do not imply a new limit for player works.

### 7.2 How player works become places in the world

Public works use the frozen snapshots corresponding to the existing publication semantics and expose only fields permitted for public use. For display, uniformly scale and translate the whole work without rearranging sticks or changing saved data. Arrange platforms, viewing distances and safe routes from the bounding box. Works that are too small or lack interior space may be viewed from around them; do not promise that every work is enterable.

The world provides planned player-exhibit positions, labelled separately from preset buildings. Record a stable position assignment at publication, or use a persistable stable allocation rule. Works must not move every day because sorting changes. When a region reaches capacity, extend the set of selectable exhibition areas and load in pages. Do not load all works worldwide at once.

Publication, withdrawal, deletion and account deletion must retain existing permission and persistence rules. After withdrawal, remove the work promptly from public listings, spatial markers and online clients. Public static resources must not include private descriptions or private works. Public content already downloaded cannot be guaranteed to disappear from third-party devices, but the server must no longer authorise access to withdrawn content.

### 7.3 Meeting and regrouping

Represent other genuine online visitors as small lights or wind lanterns, distinct from the player's own bodiless first-person view. Allow lightweight “Hello” and “Look here” signals; show real seats and request confirmation before entering an open workshop. A user can leave one group and join another. The server maintains its room rules for an editing identity and prevents old connections from occupying ghost seats.

Public creation must be explicitly opened by the room owner. Exhibiting a work does not automatically open a private workbench, and plaques must not directly expose private editing links. When nobody is online, say “There are no open workbenches right now” and offer entries for starting alone and inviting others.

World-visitor positions are temporary presence, not work state that must be durably stored. Suggested handling is region-based subscriptions, sending at about 5Hz, server rate limits and valid-coordinate checks, and client interpolation. Do not create a server rigid body for each visitor. Establish initial capacity through measurement. A conservative starting target could be at most 12 visible visitors per region and 24 visitors per instance; these are proposed limits and must not be advertised as demonstrated capacity. The existing coordinator still manages three simultaneous creation rooms with four editing seats each.

## 8. Integration with the existing code architecture

### 8.1 Verified constraints

The current repository uses React 19, Three.js 0.186.1, Rapier 0.19.3 and Node 24. The client already has WebGLRenderer, adaptive quality and on-demand rendering. The server coordinator maintains rooms, physics and SQLite; Fly is configured as one 256MB machine. World rendering primarily happens on the client. Adding twenty buildings must not cause the server to load their high-resolution models or physics bodies into memory.

Main integration points are `src/client/scene/viewport.ts`, `quality.ts`, `wood.ts`, `audio.ts`; the existing Workshop, Controls, Panels, Gallery, Works, Exhibit and Join pages; server coordinator / room / physics / store; and shared protocol / config. The new modules below are a proposed structure and do not yet exist in the repository.

### 8.2 Suggested module boundaries

| New module / data | Responsibility |
| --- | --- |
| `src/client/world/WorldViewport.ts` | World-scene lifecycle, camera, rendering schedule and quality tiers. |
| `world/controls/FlightController.ts` | Input, speed, modes, pause and mobile mappings. |
| `world/collision/WorldCollision.ts` | Capsule, chunk proxies, boundaries and safe points. |
| `world/terrain/Terrain.ts` | Heightfield, surface weights, LOD and cliff integration. |
| `world/environment/` | Grass, rocks, sky, clouds, mist, water and shared wind parameters. |
| `world/landmarks/` | Twenty original building generators, instance data, LOD and tour nodes. |
| `world/streaming/WorldChunks.ts` | Visual/collision chunk loading, prefetch, disposal and failure recovery. |
| `world/ui/` | Door labels, work plaques, concise navigation, pause, help and non-3D alternatives. |
| `world/data/world-manifest.ts` | Seed, regions, terrain version, landmark transforms, entrances and safe points. |
| `assets/sources.json` | Asset sources, licences, authors, processing steps and output paths. |
| server public-world projection | Public exhibit listing, stable positions and withdrawal updates; do not read private data for the frontend to filter. |
| server world-presence | Optional world-visitor subscriptions and rate limits, separate from the precise construction protocol. |

Suggested routing: `/` is home, and a new `/world/` route is the island. Retain existing work and exhibit deep links, join and information pages; `/gallery/` remains the ordinary listing and non-3D access. Confirm actual route names before integration rather than breaking old share links. `/readme/` remains a complete readable server-rendered page.

Keep only one active render loop across the world and workbench. They may share verified material/resource-loading utilities and quality preferences, but do not begin by rewriting the existing physics viewport. On route exit, release listeners, pointer lock, RAF, GPU resources and world subscriptions. Reference-count shared resources so one scene cannot dispose of a texture another still needs.

### 8.3 Buildings, chunks and instancing

For repeated beams and columns, prioritise InstancedMesh groups by “region × material × geometry type” to reduce draw calls. Maintain valid bounds after updating instances. Do not place every stick on the island into one instance group, which would make distant content difficult to cull.[T1]

Each building supplies three tiers: near structural detail, simplified middle distance and a far silhouette. Retain large entrances, roof openings and recognisable outlines. LOD switches use hysteresis or smooth transitions to avoid jitter at threshold distances. Collision proxies match traversable space and must not suddenly close a doorway as visual LOD changes.[T6]

Prefetch adjacent regions; keep visual and collision geometry separate. Load ahead in the direction of high-speed movement. If collision for a region is not ready, decelerate gently and show a loading state rather than allowing the player into a collision-free hole. Use distance hysteresis for eviction to avoid repeated downloads at boundaries.

The world manifest includes at least: version, historical-promenade order, layered construction recipe version, random seed, region boundaries, terrain chunks, twenty unique building IDs, transforms, LOD resources, collision resources, entrances, tour points, safe points and asset references. Use a fixed generation seed. Do not repeatedly build expensive whole-island meshes in the browser at runtime. Export GLB or compact instance transforms offline and load them from same-origin static paths.

### 8.4 Materials, resources and scheduling

Share materials for grass and timber where possible. Near shadows cover only important geometry around the camera; do not create a separate light for every distant tower. Default to one directional light and moderate ambient lighting. Most distant objects do not cast dynamic shadows; static contact can be baked or represented with simple occlusion.

Prefer 1K/2K textures, with low-quality resources available. Do not download original 8K images for the initial screen. KTX2/Basis compression may be used with `detectSupport(renderer)`; deploy a decoder matching the current Three.js version on the same origin, and provide appropriately sized ordinary texture fallbacks. Report compressed download size and GPU-resident memory separately.[T3]

Render continuously during world flight. Once input stops, clouds, water and grass may update less often; reduced motion may stop animation. Hidden tabs stop rendering and unnecessary updates. Environmental animation must not permanently force the highest frame rate and undermine existing energy-saving policies, or create competing RAF loops.

Use content-hash caching for static versioned assets. Public exhibit listings use revocable, refreshable caching. Private work data must not enter a public permanent cache. Resource failures retain access to maps, menus and lists rather than making the entire page disappear.

## 9. Asset sources and processing route

The following candidates had their source pages checked during this round. They have not yet been downloaded, their actual files have not been inspected, and they have not been accepted in the engine. The corresponding Poly Haven pages identify CC0, and the official licence page permits copying, modification and distribution. Keep provenance records nevertheless, for coursework evidence and later maintenance.[A1–A5] Kenney Nature Kit is an additional candidate; check the package's LICENSE and chosen models when downloading.[A6]

| Use | Specific source | Proposed project use |
| --- | --- | --- |
| Grassland base | [Poly Haven — Leafy Grass](https://polyhaven.com/a/leafy_grass), Charlotte Baglioni, CC0 | Reduce noise and unify green/gold tones while retaining subtle surface variation. Unprocessed photorealism should not dominate the island. |
| Worn footpath | [Poly Haven — Grass Path 2](https://polyhaven.com/a/grass_path_2), Rob Tuytel, CC0 | Extract soil-path and edge variation and blend it with authored path masks. |
| Grass/rock transition | [Poly Haven — Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock), Rob Tuytel, CC0 | Large-scale slope blending and rock-terrace variation, with recalibrated texture scale. |
| Rocky ground | [Poly Haven — Rocky Terrain 02](https://polyhaven.com/a/rocky_terrain_02), Amal Kumar, CC0 | Selectively use broken-rock detail; reduce strong realistic contrast so entire rock faces do not become noise. |
| Alternative rock models | [Kenney — Nature Kit](https://kenney.nl/assets/nature-kit), CC0 | Select rocks with suitable silhouettes and harmonise their colours. Confirm exact models and polygon counts after download. |
| Close grass clumps | Original project low-polygon meshes and vertex wind animation | Maintain consistency of shape, colour and performance without relying on stacks of highly transparent cards. |
| Main rock faces and terrain | Original project heightfields, cliff meshes and scattering rules | Match map routes, building foundations, collision and shorelines. |
| Cloud shapes and textures | Original project cloud meshes / procedural textures | Match island lighting; combine a few types through deformation to avoid an obvious copy effect. |
| Sea water and shore foam | Original project materials and shoreline masks | Join fixed sea level to terrain; low quality does not depend on expensive reflections. |
| Twenty monuments | Original project parametric structures with manual adjustments | Reuse the existing timber style; export visual geometry and collision proxies separately. |
| Ambient audio | Optional original synthesised wind and water | Controlled by the user's audio settings by default. If external recordings are adopted later, select specific files and record their licences first. |

Production route: download original assets → record source/author/licence/date/hash → colour-grade and simplify → export 1K/2K and compressed versions → inspect near/middle/far effects in the same scene → test mobile memory and loading → commit usage records. At runtime, load from project same-origin paths; do not hotlink asset websites.

Each `assets/sources.json` entry records `sourceUrl`, `author`, `license`, `licenseUrl`, `downloadedAt`, original file hash, modification description, output file, colour space and dimensions. Do not describe an undownloaded candidate as used. Public credits and README links list assets actually used; unused candidates may remain in the design record.

## 10. Performance budgets and mobile

These are targets for the first performance review, not current product test results. Use measurements on real devices to decide whether to adjust them. Do not hide performance problems by closing core routes or removing required buildings.

| Item | High target | Medium target | Low target |
| --- | ---: | ---: | ---: |
| Draw calls in the current frame | ≤250 | ≤150 | ≤90 |
| Visible triangles in the current frame | ≤1.2 million | ≤600,000 | ≤250,000 |
| Close grass-clump instances | ≤40,000 | ≤15,000 | ≤3,000 |
| Estimated resident-texture budget | ≤192MB | ≤128MB | ≤64MB |
| Suggested device-pixel-ratio cap | 1.5 | 1.25 | 1.0 |
| Shadows | Important nearby objects | Reduced coverage and resolution | Disable real-time shadows; retain simple contact cues |
| Clouds and water | Layered clouds and a fuller water surface | Fewer transparent layers and lower animation frequency | Retain sky/cloud shapes/coast; simplify materials |

Texture budget is only part of the GPU load. Also measure geometry, framebuffers, programs and total browser memory. Low quality retains visibility of all regions and building silhouettes, adding nearby detail on demand. Core input, collision, text, work data and real-time updates must not stop working at lower quality.

Suggested compressed-transfer targets: no more than 5MB of first resources before home becomes interactive, no more than 8MB of new critical resources on first entering the island, and streaming for other content. Initially aim for cumulative resources on a full tour at around 40MB or less. Verify with network records and state whether caching is enabled. Aim for a desktop median near 60fps and a phone median near 30fps, also recording long frames, input latency and behaviour after heating rather than choosing only the best second.

The fixed test route passes the entrance grassland, dam foot, dome interior, tower top, sea cliff and a distant view of all twenty buildings. Record device, browser, viewport, quality and version. A cloud browser without WebGL cannot establish acceptable 3D performance or visual quality.

## 11. Implementation order and delivery boundaries

This is a substantial product expansion. Before the deadline, advance through stages that can actually be accepted, preserving a runnable version after each stage. First make one route feel right, then replicate the production method across twenty buildings rather than placing twenty empty shells first.

| Stage | Specific work | Condition for advancing |
| --- | --- | --- |
| P0 Baseline | Record current flows, rules, tests and performance; fix the existing work/permission behaviour as the baseline | A rollback version and evidence of the current deployment exist. |
| P1 Vertical slice | One home door, one grass-slope/sea-cliff segment, one traversable monument, flight/landing/boundaries | Desktop and phone can complete entry, exploration, pause and return without passing through walls or becoming stuck. |
| P2 Terrain and style | Five-region terrain, grass/soil/rock blending, cloud/sea lighting and material pipeline | Ground/mid-air/high viewpoints all work; no flat green skin or exposed island construction. |
| P3 Twenty monuments | All distinct buildings, tour nodes, foundations, static proxies, LOD and chunks | All twenty are accessible and their spatial routes pass; low quality remains explorable. |
| P4 Connecting works | Complete three-door flow, real exhibit snapshots, stable exhibit positions, withdrawal and return | Publication and withdrawal are correct end to end; old share links still work. |
| P5 Meeting and creating | Genuinely open workshops, world presence, joining/leaving/regrouping and reconnect recovery | Two-browser identities and permissions are correct; no fabricated online activity or lost acknowledged operations. |
| P6 Final evidence | Slow network, keyboard, resizing, mobile, resource disposal, performance optimisation, README/PROCESS/rules | Required checks and manual experience records correspond to the final version. |

The complete goal includes twenty buildings, three doors, a traversable island and integration with existing creation. Grass density, cloud-layer count, real-time reflections and secondary decoration may be reduced; the twenty buildings may not be reduced to a few, and mobile access may not be removed. If time is insufficient for the complete goal, report the unfinished parts clearly rather than presenting completed planning as a completed product.

Do not add real weather, day/night cycling, swimming, skeletal character animation, globally unlimited synchronisation, server physics for the whole island, combat or a complex quest economy yet. They contribute less to the current core experience than completing the map, flight and work cycle.

## 12. Acceptance and HD evidence

Official assessment remains governed by `final_spec.md`: process 50%, deployed application 25%, response to the brief 25%. The following are internal acceptance criteria for this upgrade, not new official marking criteria and not a guarantee of a grade.

| Acceptance item | Pass condition | Suggested evidence |
| --- | --- | --- |
| First-use understanding | A new user can explain what is possible from the interface alone and enter a destination independently | Genuine observation records, recording confusion rather than counting success after on-the-spot instruction. |
| Twenty buildings | Twenty unique IDs with distinct silhouettes and routes; every building is reachable | Manifest check + whole-map visit record + representative screenshots. |
| Grass layering | Close ground views have clumps and detail; distant views lack obvious texture repetition; slopes are not merely green shells | Fixed ground/mid-air/high camera screenshots. |
| Complete island | Low flight around the coast reveals no thin-sheet backs, split seams or floating foundations | One complete coastal flight record. |
| Vertical experience | Travel from dam foot to crest and tower foot to top, and through domes and bridge openings | Manual route validation + key collision regressions. |
| Boundaries and safety | Boosting towards boundaries or the ceiling from any direction still permits return; stuck players can recover | Automated geometry checks + manual boundary and focus-loss tests. |
| Resources and performance | Low quality remains explorable; entering/leaving scenes causes no continuing resource growth; slow networks offer recoverable UI | Frame-time/resource/network records with device and version identified. |
| Multiplayer construction | Two independent identities, updates within about one second, correct capacity and join races | Genuine two-browser interactions; save and reconnect outcomes. |
| Publication/withdrawal | Correct public snapshots, private works invisible, withdrawal removed synchronously | Permission and projection tests, two-session observation. |
| Accessibility | Core flow works in both assessment viewports, by keyboard alone, on resize, with ESC and by touch | Full flow records at 1920×1080 and 390×844. |
| Design position | Users can see how creation leaves an explorable place, rather than only hearing collaboration slogans | New users' descriptions of their experience and actual interaction paths. |
| Legible process | Important choices include alternatives, tradeoffs, failure corrections and corresponding commits | ADRs, rule changes, tests and PROCESS citations. |

Testing priorities: high-speed collision and boundary geometry, stable exhibit-position allocation, public-field filtering, withdrawal cache invalidation, room admission and scene disposal. Visual atmosphere and enjoyment of exploration need human observation; do not use implementation-mirroring unit tests to prove that it is “fun”. Run the existing `pnpm check`, `pnpm check:evidence` and relevant tests affected by the changes. Do not modify fixed course checks to accommodate the implementation.

For reproducible screenshots, fix the random seed, camera, time and wind phase. Preserve a few highly explanatory views: the first entrance reveal, looking up from the dam foot, close grass slopes, dome interior, the sea from a tower top, low flight along the cliffs and mobile interaction. Screenshots do not replace validation through continuous interaction.

The README should use 400–600 words to explain the core idea that actually works in the final product and its sources; PROCESS should use 900–1100 words to explain key judgements and link commits. Put rules genuinely adopted into CLAUDE.md/referenced files; do not describe unexecuted design choices as verified process. The world design document may be long; the final assessed narrative needs to be concise.

## 13. Sources and technical references

### Current project and requirements

- [R1 Current checked commit](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/tree/b13ecaee79f29930827c0b7db660861a73ccddae): basis for dependencies, rendering scheduling, server resources and existing flows; this document did not modify that commit.
- [R2 Official Final Project](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/) and the project's `final_spec.md`: formal requirements and marking basis; this proposal does not redefine HD.
- [R3 Official Sky introduction](https://www.thatskygame.com/): reference for social exploration and world travel. Specific map planning, dimensions and gameplay integration are this project's proposal.

### Official Three.js documentation

- [T1 InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html): instancing shared geometry/materials and bounds.
- [T2 Octree](https://threejs.org/docs/pages/Octree.html): spatial indexing of static triangles and capsule overlap queries.
- [T3 KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html): KTX2, Basis transcoding and capability detection.
- [T4 PointerLockControls](https://threejs.org/docs/pages/PointerLockControls.html): first-person view and pointer lock.
- [T5 Sky](https://threejs.org/docs/pages/Sky.html): WebGL sky object.
- [T6 LOD](https://threejs.org/docs/pages/LOD.html): distance-based detail selection and hysteresis.
- [T7 Color management](https://threejs.org/manual/en/color-management.html): colour spaces for colour and data textures.
- [T8 GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): importing prebuilt geometry resources.

### Asset pages and licences

- [A1 Leafy Grass](https://polyhaven.com/a/leafy_grass)
- [A2 Grass Path 2](https://polyhaven.com/a/grass_path_2)
- [A3 Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock)
- [A4 Rocky Terrain 02](https://polyhaven.com/a/rocky_terrain_02)
- [A5 Poly Haven Asset License](https://polyhaven.com/license)
- [A6 Kenney Nature Kit](https://kenney.nl/assets/nature-kit) and [Kenney Support / License](https://kenney.nl/support)

The asset and technical pages above were retrieved and checked on 2026-11-03. Actual implementation still requires validation against the pinned Three.js version, downloaded package contents and target devices. A candidate asset is not necessarily suitable for the final art direction.
## 14. Timber-strip construction language: define the parts before the courses

### 14.1 How to use this specification

The following is an **assembly specification for original digital exhibition models**. It is not a construction drawing for real timber structures, nor a claim that these forms can be assembled into gravity-stable structures on the existing Rapier workbench. Presets use static, fixed assemblies. Intersections and bearing relationships must be visually plausible; actual player works continue to follow the existing physics and saving rules.

The timber strips in the current `src/shared/config.ts` have an 8:1:1 proportion. This edition's presets use three uniformly scaled sizes with the same proportions: B = 8×1×1 metres, M = 4×0.5×0.5 metres, and D = 1×0.125×0.125 metres. B is for primary framing, M for secondary structure, and D for flutes, volutes and mouldings. These three sizes belong only to the preset production pipeline; they do not add three new building-block types for players. Do not arbitrarily stretch one strip into a hundred-metre column or scale width and height independently to make wall panels.

Where a thicker member is needed, express it as a legible bundled column, hollow box girder, double-chord truss or layered stack of strips. Large surfaces may use a simplified light-blocking shell behind them, but the principal silhouettes, openings, details and timber joints must be formed by actual geometry. A wood texture on an ordinary box does not count as completion.

### 14.2 Three meanings of “layer”

- **Storey:** a horizontal architectural level that can be used or seen, such as storeys 1–52 of a skyscraper.
- **Construction band:** a height interval with a particular function, such as the platform, shaft, capital, architrave, cornice or roof.
- **Assembly course:** a repeated placement sequence of timber strips, such as shaft segments 1–8, angular arch segments 1–N or dome rings 1–24.

An assembly course's nominal height defines a positioning band. Strip ends may overlap into neighbouring construction bands, but those overlaps must count towards the actual outer envelope. They must not push the top beyond the height limit or create completely disconnected floating layers. Every building recipe must expand to assembly courses. Repeated structures should use explicit indices, ranges and formulas to expand every course; manually listing tens of thousands of coordinates is unnecessary. “Repeat some layers until it looks good” is unacceptable. All height intervals start at that building's foundation plane.

### 14.3 Counting notation and shared components

The following functions return complete geometry and parts lists; lengths in their formulas are in metres. All parameters are design values, not historical measurements.

| Notation | Counts and placement |
| --- | --- |
| `C(l,u)` straight chain | A line of length l uses strips of one size with length u, giving `ceil(l/u)` pieces. When n≥2, adjust overlaps uniformly so the entire chain's ends align. When l<u, use a smaller size; if an independent segment is still shorter than 1 metre, adjust the detail rather than cutting a strip. Count diagonal chains using their actual sloping length. |
| `R(w,d,u,q)` rectangular frame | `2q[C(w,u)+C(d,u)]` pieces, where q is the number of parallel chains. Place each of the four sides along its edge. Connection overlaps are allowed at corners, but do not instantiate the same strip twice. |
| `G(w,d,p,u)` floor grid | The upper layer has `(floor(d/p)+1)C(w,u)` pieces; the lower layer has `(floor(w/p)+1)C(d,u)` pieces. The two layers are perpendicular. Walkable surfaces have a separate continuous proxy. At actual main viewing platforms, replace the upper layer with adjacent timber-strip decking so visitors do not step on visible holes. |
| `F(w,h,u,q)` truss face | Two vertical chains, one upper and one lower horizontal chain, and two diagonal chains: a total of `q[2C(h,u)+2C(w,u)+2C(sqrt(w²+h²),u)]` pieces. Offset the members at each X crossing in depth by one cross-section thickness to avoid coplanar flickering. Repeated courses generate only the current course's top beam; reuse the preceding course's beam as the lower beam. |
| `P(r,n,u,q)` polygonal ring | n segments, each with chord length `2r sin(π/n)`, giving `qn max(1,ceil(chord length/u))` pieces in total, laid flat along the chords. If a chord is shorter than one strip, use a complete strip overlapping into neighbouring angular segments and include it in the actual outer envelope; do not cut it shorter. Smooth rings cannot replace timber strips in close views. Successive rings may be offset by half a segment to prevent every joint from continuing vertically through the structure. |
| `A(w,rise,t,d,u)` arch | Generate inner and outer curves as a semicircular or two-centred pointed arch. Each segment's chord length must be ≤0.8u; determine and report the segment count N from the path length. Each of the front and rear faces has tangent strips along its inner and outer edges, totalling 4N strips. Also place `C(t,u)` radial strips in each segment on each face, totalling `2NC(t,u)`. Every 4 segments, add a tie-chain group through depth d, counted as `ceil(N/4)C(d,4)`. Additional ribs within the depth are allowed but must be listed. |
| `DOME(r,h,k,m,u)` rib-and-ring dome | m meridional ribs, each with k segments; count each segment with C using its actual curve chord length. Generate the k height rings with P. Every ring radius must appear in an array or be determined by a fixed formula. Count meridional ribs, ring ribs and infill grids separately. Do not substitute shrinking square frames for a spherical surface. |
| `WALL(L,H,p)` wall frame | Provide a vertical position every p metres along L. At each storey, generate M/B vertical chains and horizontal frames using the specified storey height. Do not generate infill strips in door or window areas. Add a diagonal brace every 2 bays and retain frames around openings. A solid-wall appearance comes from a staggered outer facing of timber strips, not a solid-filled interior. |

Rectangular-frame dimensions refer to the structural paths; the outer envelope also includes cross-section thickness. The building overview gives target outer envelopes. The generator should derive paths from those envelopes, preventing a 96-metre centreline dimension from expanding into a 100-metre structure. Set the initial dimensional tolerance to ±1%; report deviations beyond it rather than silently changing the dimensions.

Determine a curve's geometry first, then select the angular segment count and timber-strip size. Tangential arch edges and short radial strips together express the direction of wedge-shaped masonry. A row of disconnected horizontal strips arranged in a semicircle is insufficient. Domes derive their shape from radial ribs, progressively smaller rings and subdivisions, not a wood-textured sphere.

Every component returns `partId / buildingId / stage / courseIndex / pieceType / transform / count`. Specify ownership of beams shared by storeys and columns shared by adjacent bays: the lower-numbered bay creates a shared edge and the next bay references it. Finally, remove completely identical duplicate instances. The component quantities below are modular assembly counts; report the building's unique total from the expanded and deduplicated parts list rather than presenting module totals as the final BOM.

### 14.4 Required differences between column orders

Museum descriptions of the orders show that Doric, Ionic and Corinthian differ not just in column height but also in bases, capitals, friezes and overall proportions. [H03–H04]

| Order | Project geometry specification |
| --- | --- |
| Doric | Columns stand directly on the platform, without an additional Ionic-style disc base. Use 20 longitudinal flutes, a shaft that tapers upwards and very slight entasis about one-third of the way up. The capital has an upward-spreading support disc and a square abacus. Above it, alternate groups of three vertical strips with intervening panels. |
| Ionic | A multilayer base, 24 longitudinal flutes and a more slender shaft. Provide one pair of volutes on both the front and rear of the capital. The architrave has three progressively stepped horizontal bands. Do not give every capital the same block that is wider at the top and narrower at the bottom. |
| Corinthian reinterpretation | 24 flutes. The capital has 8 leaf clusters in the lower ring and 8 staggered clusters in the upper ring. Each cluster contains at least 5 inclined D strips, with inclination increasing from inside to outside. Each of the four corners also has a pair of short volutes. Preserve the spreading bell-shaped silhouette. |
| Lotus/papyrus bundled column | An outline of 12 or 16 bundled stems. Lower columns have closed buds; taller columns have spreading crowns. Do not replace these capitals with European volutes. |

“Flutes” must be continuous shadow bands recessed relative to the surface. They may combine outer ridge strips with recessed backing strips. Do not attach 24 convex round rods to a smooth cylinder and call them flutes; the core must not project through the front and obscure the grooves.

### 14.5 Paper recipe example: one 30-metre Ionic column (original recipe not generated and accepted)

This is the standard specimen for a standalone component. Generate and accept the specimen before reusing it in L04, adjusting the number of shaft segments to that building's specific column height. Do not stretch the whole specimen non-uniformly. The following shaft is 24 metres tall with an outer diameter of about 4 metres; the capital's outer envelope is about 6 metres.

| Construction band | Placement and quantity per course | Subtotal |
| --- | --- | ---: |
| Base, 0–2m | Five 32-sided rings of D strips, 32 pieces per ring. From bottom to top, radii are 2.8/2.65/2.35/2.5/2.15m. Inside, 16 additional vertical M strips form a connecting core spanning the base and the start of the shaft. | 160D+16M |
| Shaft, 2–26m | Eight segments, each rising 3 metres. Each segment has 24 near-vertical outer ridge strips of size M; the 4-metre strips overlap by about 1 metre vertically. Behind each flute, join 3 D strips vertically, totalling 72. A connecting ring contains 24 D strips. Each segment = 24M+96D. | 192M+768D |
| Taper | The radii of the eight segments are 2.00/2.03/2.04/2.02/1.97/1.91/1.84/1.76m. Align member endpoints along the profile; do not translate each segment independently and create breaks. | No additional parts |
| Neck rings, 26–27m | Two rings of 24 D strips. Inside, add 16 vertical M strips connecting the capital to the abacus. | 48D+16M |
| Spreading support, 27–28.5m | Six courses, each with 32 D strips laid horizontally along the profile. Radii from bottom to top: 1.8/1.95/2.1/2.25/2.4/2.55m. | 192D |
| Volutes, 28.5–29.5m | Two volutes on the front face and two on the rear, four in total. Each uses 24 D strips laid tangentially along a planar spiral tightening from outside to inside; the direction turns cumulatively through about 1.25 revolutions. Add 16 D strips connecting the volutes to the central support. | 112D |
| Abacus, 29.5–30m | Four courses of 6-metre square frames, each containing 24 D strips. Rotate adjacent courses by 90° and stagger their joints. Add four 6-metre cross-chains, totalling 24 D strips. | 120D |

The specimen's visible and connecting assemblies total **1,624 pieces: 224 M and 1,400 D**. The generator must check completely overlapping strips and report the actual result if deduplication changes that total. This is a calculation for this project's recipe, not the original component count of an ancient building. Ring-to-core connections, detail joints and the outer envelope must be inspected before the specimen qualifies as accepted.

Your proposal that “horizontal strips project progressively less from top to bottom” applies to spreading capitals and cornices. Volutes additionally need a rotating path to read as coils rather than steps. These small strips may be merged at a distance, but close-up specimens must have real fluted, projecting and curling geometry.

## 15. Course-by-course assembly specifications for L01–L10

### L01 First Monumental Gate Ring — 72×56×32m

**Reference features:** Draw on the relationship between Stonehenge's outer ring and its five internal pairs of posts with lintels, without copying its present damaged condition. The real outer ring's original count differs from this project's. [H01]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–3m / three foundation courses | Twenty foot platforms per course. Each foot platform is 6×6m, with two layers of `R(6,6,1,1)` outer frames and a `G(6,6,1,1)` crossed core. The foot platforms' side lengths across the three courses are 6/5.5/5m, exposing stepped offsets. |
| 3–23m / twenty outer-ring columns | Five segments per column, each rising 4m. At each of four corners, two vertical M strips form an L-shaped corner bundle; each of the four faces also has four horizontal/diagonal M connectors, totalling 24M per segment. Rotate the horizontal connection direction by 90° in segments 2 and 4. Taper the column cross-section from 4.5×3.5m to 4×3m with height; do not use a constant-width straight box. |
| Five internal double-column gateways | Two columns per gateway. Their top heights follow 24/27/29/27/24m. Each column uses `ceil((top height−3)/4)` segments of the module above; adjust overlap in the final segment. The five gateways face towards the central opening and form an open horseshoe. |
| Outer-ring lintels, 23–27m | One lintel assembly between each pair of neighbouring columns, twenty assemblies in total. Each has four upper M chord chains, four lower chord chains and four D cross-connectors every 2 metres. Expand the chains using C for the actual span. Make the cross-section slightly thicker near the middle, with both ends bearing on the column tops. |
| Internal lintels / up to 32m | Five lintels, each 3m tall, with a slight rise towards the centre along the upper chord. At each end, add three layers of D-strip end ornaments, each projecting 0.25m farther. The tallest group tops out at 32m. |

**Route and forbidden simplifications:** The main gateway has 12 metres of clear width. Pass through the outer ring into the inner ring, then fly out over the tallest lintel. Do not use twenty monolithic large wooden posts plus one circular ring. Close views must reveal bundled columns, assembled lintels and the two nested spaces.

### L02 Forest of Lotus Columns — 144×104×44m

**Reference features:** Karnak's hall supplies the composition of a column forest and a taller central hall. The original hall has 134 columns; this project explicitly changes the count to 48. [H02]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–4m / foundation | Four 1m step bands. Use R around the perimeter and an 8-metre internal grid. Leave a 16-metre-wide ramp/stair route at the main entrance. |
| 4–28m / thirty-six side columns | A grid of 6 rows × 8 columns gives 48 columns. The central 2 columns × 6 rows are tall columns; the remaining 36 are side columns. Each side column has eight 3m segments, each with 16M vertical bundles + 16D ring strips + 48D recessed backing strips. Gradually taper the diameter from 5m to 4.3m. |
| 4–36m / twelve tall central columns | Eight 4m segments per column, using overlapping vertical B bundles. Each segment has 16B outer bundles + 32D fine stem lines + 16M ring connections. Maintain at least 16m of clear space between the two central column lines. |
| Side capitals, 28–32m | Eight rings per column, with radius increasing from 2.2m to 3.4m and then contracting to 2.8m; 32D per ring. Sixteen closed-bud groups, each with 5D, and a 4×4m support frame on top. |
| Central capitals, 36–40m | Eight rings per column, each with 32D, and radii 2.4→4.0m. Sixteen petals, each with seven D strips following an outward-turning polyline, form an open crown. |
| Roof framing, 32–44m | Side-hall roofs span 32–36m; the central roof spans 40–44m. Between column lines, place four-chord M beams using the actual span, with two diagonal-brace groups per bay. Between the lower and higher roofs, provide six vertical M window mullions per bay; do not close off the clerestory. |

**Route and forbidden simplifications:** Pass straight through the central aisle, circulate through the side rows, and fly out through the clerestory. The taller central hall, lower side halls and two types of floral capital must be legible. Do not use 48 completely identical cylinders.

### L03 Ridge Doric Temple — 96×184×52m

**Reference features:** The Parthenon's external colonnade has eight columns on each short side and seventeen on each long side, with entasis and subtle proportional corrections. Adopt those relationships rather than its original dimensions. [H03]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–6m / three platform levels | Each level is 2m tall, with plans of 96×184, 92×180 and 88×176m. Stack four M frames along each edge, each using R. Internally, use an 8m grid only below the floor; do not fill the whole volume with solid timber. |
| 6–34m / forty-six external columns | Count around the four sides: `2×8+2×(17−2)=46`. Each column has seven segments rising 4m each. Each segment has 20B vertical outer ridges + 20M ring strips + 80D flute backing strips. Outer diameters: 5.2m at the base, 5.35m in the lower-middle section and 4.4m at the top. Reduce corner spacing by about 5% and adjust the adjoining bays accordingly. |
| 34–38m / capitals | Six rings per column, each with 32D, spreading upwards. Above them, use three layers of 6m square abaci, each with `R(6,6,1,1)`. Do not add Ionic volutes or multilayer bases. |
| 38–42m / beams and frieze | Four layers of M perimeter chains at the top and bottom of the architrave. In each intercolumnar frieze bay, provide two groups of triple vertical strips, each containing `3×C(2,1)` D pieces. Between the groups, leave panel bays recessed by 0.4m, continuous across front, rear and side faces. |
| 42–44m / cornice | Four horizontal M frames, each projecting outward by another 0.35m. Under the eaves, place one group of three short vertical D strips every 2m to form shadow-casting dentils. |
| 44–52m / gabled roof | Seventeen triangular roof trusses along the depth. Each has two sloping upper chord chains, one horizontal lower chord chain and five vertical/diagonal web chains. Use M for chords and D for secondary grids. Each end pediment has eight horizontal assembly bands shortened to the triangular boundary and counted with C. Retain shadow depth at the centre. |

**Route and forbidden simplifications:** Front and rear doors have 12m clear width, and the surrounding colonnade is at least 8m wide. Inside, twelve smaller columns form two side aisles; do not duplicate the entire external column grid. The three-part entablature and triangular pediments are required. A flat-roofed box is not acceptable.

### L04 Volute Terrace Palace — 112×128×56m

**Reference features:** The Erechtheion's asymmetric porches, level changes and Ionic volutes. This project does not create load-bearing human figures. [H04]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–8m / two terraces | The main-hall platform is 8m high and the side-porch platform 4m high: four and two levels respectively, each 2m tall, with four M perimeter frames and an internal 8m beam grid. The main hall is 72×80m and the side porch 32×48m, connected by a 12m-wide terrace. |
| 8–38m / eighteen main-porch columns | Six at the front and six at the rear, plus three additional columns on each long side, giving eighteen. Each uses the 30m column specimen in section 14.5: 224M+1400D. Count each corner column once; generate the column layout from an explicit list. |
| 4–28m / ten side-porch columns | Use a version with the same diameter but an 18m shaft, comprising six 3m shaft segments. Each column uses `2×(24M+96D)` fewer pieces than the standard specimen. Do not flatten the capital or base. |
| 38–44m / main entablature | Three architrave bands, each formed from four parallel M chains, projecting by 0/0.25/0.5m respectively. The continuous frieze uses a group of four D strips in a zigzag pattern every 2m. The cornice projects in four steps. |
| 28–34m / side entablature | The same three architrave bands at reduced width, with an M grid over the porch. The two roofs must have visibly different heights; do not force them into one plane. |
| 44–56m / main roof | Nine triangular M roof trusses. Each has two sloping beams, a lower chord, a central upright and two groups of diagonal web members on each side. Expand each truss with C according to its span; provide one row of D strips every 2m on the roof slopes. The side roof spans 34–40m; retain an open-air connecting courtyard. |

**Route and forbidden simplifications:** Pass from the lower porch through the higher porch, enter the courtyard, then rise alongside the volute columns. Acceptance checks cover the mirrored winding directions of the four volutes, shaft flutes and base profile. Projecting square plates do not count as volutes.

### L05 Three-Tier Aqueduct — 300×20×68m

**Reference features:** The Pont du Gard's three tiers of arches at different scales. Common descriptions of the surviving structure give 6/11/35 arches, with 47 originally on the top tier. This project uses the 6/11/35 relationship and must not misrepresent it as a reconstruction of the original state. [H05]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–4m / bridge footings | Seven lower-tier pier footings, each 8×20m. Eight horizontal M assembly frames alternate direction by course. Foundations meet the riverbed and partially embed into rock platforms. |
| 4–28m / first arch tier | About 180m across, with six arches of approximately 22m clear span. Each of seven piers has six 4m segments, each with four corner B bundle groups and F latticework on all four faces. Arches spring at about 16m; semicircular rise is about 11m. Use `A(22,11,2,16,1)` and complete the top beam to 28m. |
| 28–52m / second arch tier | Extend along the bank terraces on both sides to 300m: eleven arches and twelve piers, with approximately 20m clear spans. Do not align piers over the centres of lower openings; where no lower-tier support exists, they must bear on the hillsides on either side. Each arch uses `A(20,10,1.5,12,1)` and springs at about 40m. Finish with a 2m beam band up to 52m. |
| 52–64m / third arch tier | Thirty-five small arches and thirty-six small piers, with approximately 6m clear spans. Each pier has two 4m segments, each with 4M vertical bundles + 8D ring connections. Each arch uses `A(6,3,1,8,1)`, springs at 60m, and has a 1m top beam finishing at 64m. |
| 64–68m / water channel | Eight layers of horizontal M strips on each side, with staggered joints in the left and right walls. Keep the central 4m-wide channel continuous; the water surface uses a separate material. Retain a walkable maintenance path at least 4m wide on one side. |

**Route and forbidden simplifications:** The main route passes through the large central arch of the lowest tier, then flies to a side platform on the middle tier and finally to the water channel. The three tiers must have different widths, heights, piers and arch-span relationships. Do not create them by scaling and copying the same archway three times.

### L06 Ring Amphitheatre — 240×196×78m

**Reference features:** The Colosseum's elliptical plan, stacked arcades and upper wall band. Storey heights and opening counts are adaptations for this project. [H06]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–4m / base | Ellipse axis lengths are 240/196m. Four ring steps, each with 64 segments. Place M chains along the ellipse's tangents and calculate each segment with C using its actual curve length. |
| 4–24m / first storey, forty-eight bays | Divide into forty-eight equal-arc-length bays; do not use equal angles that make spacing extremely uneven at the ends. Each bay has two piers, shared with adjacent bays, plus `A(local clear span, clear span/2,1.5,12,1)`. Each pier has five 4m assembly segments, with 8M vertical bundles + 8M horizontal connectors per segment. Every fourth bay connects inwards to a radial passage. |
| 24–44m / second storey, forty-eight bays | Continue the forty-eight bays with slightly narrower arch openings and aligned pier axes. Attach one Ionic engaged half-column to the outside of each pier, with four 3m shaft segments and one reduced-detail capital template. Do not stick a flat rectangle onto the outside wall. |
| 44–62m / third storey, forty-eight bays | Each bay is 18m tall. Change the attached columns to Corinthian leaf-cluster capitals, with 16 clusters × 5D. Use two top beams and a cornice projecting in three layers. |
| 62–74m / upper storey | Retain one small rectangular window per bay instead of a large arch. Forty-eight vertical wall frames, each with four M vertical chains, two M horizontal chains and one pair of diagonal braces. Windows have 1m recess depth. |
| 74–78m / crown | Four stepped cornices around the ellipse and forty-eight awning-pole supports, each made from four vertical/diagonal M strips. |
| Interior seating | Three seating zones, each with eight tiers, totalling twenty-four tiers. Each tier has forty-eight radial segments built with M frames and D decking. Four main passages connect the exterior to the centre; seating must not block them. |

**Route and forbidden simplifications:** Enter the arena through an arch, then fly along the ring galleries up to the seating. Keep the centre open to the sky. Do not make a solid elliptical cake or use the same capital on all three storeys.

### L07 Oculus Dome Hall — 112×144×86m

**Reference features:** The Pantheon's rotunda, dome and roof opening. Its real diameter of about 43.3m is provided only to understand proportion; this project redesigns it at a larger scale. [H07]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–6m / foundation | The rotunda's outer diameter is 96m; the front portico extends the overall depth to 144m. Six 1m platform bands, with sixty-four-segment M perimeter frames. |
| 6–42m / rotunda wall | Thirty-two structural sectors around the circumference and nine 4m vertical segments. Each sector in each segment has four M vertical chains, two M curved-edge chains at both top and bottom, and one pair of D diagonal braces. Provide deep niches in eight directions; the front passage has 16m clear width. |
| Portico, 6–36m | Sixteen columns: eight in the front row and four in each of the two rows behind, leaving the central entrance clear. Each shaft has six 4m segments, each with 24M outer ridges + 24D ring strips. Capitals have 16 leaf clusters × 5D, with three abacus layers. The portico's triangular roof reaches 44m and joins the rotunda drum. |
| 42–83.7m / dome | Outer radius 42m and hemispherical rise 42m. Forty-eight meridional ribs, each with twenty-four segments. Twenty-four rings contract according to `r(y)=sqrt(42²−(y−42)²)`, at heights `y_j=42+sqrt(42²−5²)×j/24` (j=1…24); the final ring has a 5m radius. Each meridional rib uses double M chains. Count D or M ring strips by length. Do not draw only rings without meridional connections. |
| Interior coffers | Five decorative latitude bands along the dome surface, each with twenty-eight cells. Each cell has three nested D rectangular/trapezoidal frames recessed successively by 0.25m. Cells narrow with increasing height. At about 0.75m deep, they must produce real occlusion. |
| 83.7–86m / oculus rim | To preserve about 10m of clear diameter, truncate the dome at an opening radius of 5m. The actual last ring is at about 83.7m, followed by an approximately 2.3m rim. Solve the last ring's position from the spherical surface; do not complete the dome as a closed pointed top. |

**Route and forbidden simplifications:** Pass through the portico into the rotunda, look up at the coffers, then rise through the oculus. The model's 86m height limit permits a slight adjustment to the final rim. Do not claim “a strict hemisphere with its spherical apex fully retained” while also cutting a large opening. A smooth spherical shell with only a grid texture is forbidden.

### L08 Floating Dome Hall — 136×176×96m

**Reference features:** Hagia Sophia's four pendentives transition from a square support space to a circular dome. This transition is central to this building's identity. [H08]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–6m / platform | Divide the outer frame into six courses. Fix the four great piers' positions in advance and preserve a central main space of 64×64m. |
| 6–42m / four great piers and side aisles | Each pier is 12×12m with nine 4m segments. Each segment has 16B perimeter vertical bundles + four faces of `F(12,4,4,2)` framing. The side aisles have two levels, each 18m tall, with six arched bays per side and twenty-four attached columns. |
| 42–66m / four great arches | Four shallow arches with spans of about 56m and a rise of 24m. Each uses `A(56,24,3,8,4)`, with a D cross-connector every four angular segments. The arch springings must bear on the four great piers. |
| 48–68m / four pendentives | Twelve rising rings per pendentive. Each ring's lateral coverage expands from 2m at the corner to about 32m between the neighbouring arch crowns. Use eight D/M fan ribs and tangent chains for that ring. The four top edges jointly meet the circular drum. Maintain a continuous concave interior surface, not four tilted square plates. |
| 68–76m / daylight drum | Thirty-two window bays. Each has two M vertical frames and two M horizontal chains at both top and bottom. Leave the window openings empty and deduplicate shared columns. |
| 76–96m / main dome | A spherical cap of radius 32m and rise 20m, with thirty-two meridional ribs × sixteen segments and sixteen rings. Determine the sphere radius from `(r²+h²)/(2h)`. |
| Semi-domes at both ends | One at the front and one at the rear, each with radius 24m and rise 16m, springing at 48m and topping out at 64m. Each semi-dome has sixteen meridional ribs × twelve segments and twelve half-rings. Three smaller niches connect below each. |

**Route and forbidden simplifications:** Move from the main entrance to the centre to view the dome, then rise around the side aisles beside the drum. The central main dome may be closed. Provide explicit flight exits at the ends or side aisles; do not cut the same roof opening in every church merely to standardise gameplay. The pendentives and the two end semi-domes must not be omitted.

### L09 Double-Ring Sea-Breeze Fortress — 176×152×108m

**Reference features:** Carcassonne's double fortifications, towers and inner keep. This project's eight outer towers and main keep are rearranged into a visitor route. [H09]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–8m / rock platform | Four levels of 2m steps and retaining walls, with eight outer tower foundations embedded. Provide two entrances at different elevations along the slope. |
| 8–32m / outer wall | Eight perimeter wall segments forming a broken-line plan. Each has six 4m assembly courses. Place one bay every 8m, with four M vertical chains, two horizontal double chains and X bracing. Stagger the horizontal M-strip facing and expose a 4m-wide wall-top walkway. |
| 8–48m / inner wall | Inner-ring plan of about 120×96m, built in the same manner with ten courses. Offset its entrance from the outer gate so visitors turn through the inner courtyard. |
| Eight outer towers / up to 72m | Four towers are 64m tall and four are 72m tall. Each is a sixteen-sided hollow body, with one course every 4m of shaft height. Each course has sixteen M vertical chains and sixteen ring-chain segments at both top and bottom, with eight diagonal-brace groups every two courses. The conical top has sixteen sloping ribs expanded using C, and twelve rings with progressively smaller radii. |
| Central keep, 8–80m | Plan 48×40m, six storeys × 12m. Each storey has twelve bundled perimeter columns, each bundle containing 4B, a top `R(48,40,4,4)` frame, and a 2×3-bay internal beam grid. Provide at least four recessed windows per storey and projecting timber galleries on the third and fifth storeys. |
| Keep roof, 80–108m | Four corner pyramidal caps reach 96m; a central gable/spire reaches 108m. Each corner pyramid has sixteen meridional ribs and ten rings. The central roof has seven triangular M frames plus one sixteen-sided needle tower. |
| Battlements and brackets | One merlon every 4m along the wall top, each 2m wide and 2m tall. Use 8M per merlon, interleaved across four courses, maintaining 2m gaps between merlons. Beneath projecting galleries, add one group of three inclined M brackets every 2m. |

**Route and forbidden simplifications:** Outer gate → inner gate → courtyard → wall walk → keep roof. Arrow slits, battlements, walkways behind the walls and conical roofs are mandatory. Do not surround a square courtyard with only four tall square posts.

### L10 Pointed-Arch Cloud Gallery — 112×216×128m

**Reference features:** Amiens's soaring nave, pointed arches, rib vaults and external flying buttresses. This project organises the silhouette with twin towers and a central spire. [H10]

| Height / course | Timber-strip counting rules and placement |
| --- | --- |
| 0–8m / platform | Four 2m steps. The main body has eight bays × 20m; the entrance and rear chapel space occupy the remaining depth. |
| 8–40m / lower columns and side aisles | Two rows of nine compound piers, eighteen in total. Each pier comprises one sixteen-sided central core and eight attached shafts. Every 4m segment has sixteen M vertical core strips + `8×4D` attached-shaft bundles + sixteen D ring connections. The eight pointed-arch bays on each side use `A(16,18,1.5,4,1)`. |
| 40–52m / gallery band | Divide each bay into three slender pointed arches, forty-eight across both sides. Each arch has two D edge curves and two slender M columns. Retain visible depth and a gallery behind them; do not apply flat ornament. |
| 52–76m / clerestory and main arches | One clerestory window group per bay, each with two M mullions and six branching D tracery strips. The eight main-bay arches use two-centred pointed arches. Each bay's vault has four diagonal ribs and two transverse ribs, each made from double M chains. The highest internal vault is about 76m. |
| External flying buttresses | One group per bay on each side, sixteen groups in total. Each contains two flying arches at different heights, one outer pier and one pointed cap. Use `A(local span, designed rise,1,2,1)` for each flying arch, accurately connecting the outside of the clerestory to the outer pier. Do not make floating decorative arcs. |
| Main roof, 76–92m | Nine sharply triangular roof trusses and D strips on the two slopes. The two entrance towers have 20×20m plans, bodies reaching 104m and tops reaching 116m, with F framing on all four faces of every 4m assembly course. |
| Crossing spire, 92–128m | An octagonal base frame and twelve courses rising 3m each, with radius decreasing 8→0.8m. Every course has eight inclined M ridge chains and eight D ring segments. Four smaller pinnacles in the corner directions accompany it. |
| Entrance rose window | Diameter 18m, with twenty-four petals. Two D rings of forty-eight segments, twenty-four radial double-D chains and three small arched frames per petal. Provide at least 1m of depth between the window and wall face. |

**Route and forbidden simplifications:** Advance from the entrance along the tall nave, then pass sideways between the flying buttresses and rise to the roof. Pointed arches, spires and flying buttresses must be recognisable in silhouette. Do not merely stretch a round-arched temple taller.
## 16. L11–L20: Layer-by-Layer Assembly Specifications

### L11 Eight-Lobed Dome Palace — 128×184×144m

**Reference features**: the Florence dome's eight-lobed double shell, 8 main ribs and 16 secondary ribs, and the lantern at the top. Official material records the dome's construction in 1420–1436 and its double-shell structure; this project does not claim to reproduce the structural effects of the original construction method.[H11]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–8m / foundation | Four 2m step levels; the main hall and octagonal core each have an outer M frame and an internal 8m grid. |
| 8–48m / main hall | The entrance hall has 5 bays ×20m, with 6 main piers on each side; each pier has ten 4m assembly segments, with an 8B vertical bundle +8M ring connections per segment; round arches and pitched roofs along the side aisles connect to the centre. |
| 48–72m / octagonal drum | 8 faces, each with three 8m construction bands; in each band, both corners have 4B vertical bundles, 3 horizontal M chains and 1 pair of diagonal braces; the centre of each face has one 10m-diameter round window, with a 32-segment D ring +8 radial D chains; retain structure around the window. |
| 72–128m / eight-lobed double shell | Maximum outer radius 38m, rise 56m; 8 main ribs, each made of 4 parallel M chains, plus 16 secondary ribs, each made of 2M chains; 28 longitudinal segments and 28 circumferential rings. Use the fixed pointed-dome profile `r(t)=6+32(1−t^1.35)^0.65` (t=0…1); at 128m, the end joins the lantern at r=6m rather than collapsing into a zero-thickness singularity. |
| Double-shell spacing | Normal distance from the outer shell to the inner shell: 2m; at every fourth ring and every main rib, place 2M connecting sticks, giving 7×8×2 connecting groups, expanded with C according to actual length. The inner shell retains the same 8 lobes and includes openings for maintenance-display views; the 2m interstitial space is not the main visitor route. |
| Infill within lobes | Divide each longitudinal segment of each lobe into 4 cells; use alternating left/right D diagonals at ±45° in each cell to produce a herringbone pattern, with M frames around the cells. Generate the complete fine sticks only for close views; do not substitute a texture for the 8 main ribs. |
| 128–144m / lantern | An octagonal column frame with base radius 6m and 8 bundled columns; in the lower 8m, each column uses 4M; the upper 8m consists of 8 tapering M ribs and 4 D rings. A 4m platform edge may remain at the top opening; the main viewpoint is on the broad ring platform below the lantern. |

**Route and prohibited simplifications**: enter from a side hall to look up under the dome, then ascend along an outer rib. The pointed-dome profile, partial double-shell display, eight main ribs and lantern are identifying features; do not recolour L07's hemisphere and use it here.

### L12 Embracing Square — 280×240×154m

**Reference features**: the composition of St Peter's Square's four-row curved colonnades and central dome; the real square has 284 columns, while this project's curved colonnades use 128 columns, with original proportions and a newly combined main building.[H12]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–6m / square platform | Three 2m step levels; keep the central plan open; beneath the two curved colonnade wings, use R/curved frames and an 8m grid. The square must not be one suspended wooden slab. |
| 6–38m / two colonnade wings | Each wing has 16 positions along the arc ×4 radial rows, totalling 2×16×4=128 columns. Each shaft has seven 4m segments, with 16M vertical edges +16D connecting rings per segment; the remaining 4m forms the capital, including 4 layers of projecting D rings +3 layers of square M abacus plates. |
| 38–44m / curved-colonnade entablature | Above each column row, place 4M curved chains; between each pair of adjacent rows, place 2 groups of M crossbeams; use a 6-layer profile cornice, projecting 0.2m farther at each layer. At every second column position, place one abstract finial made of 12D sticks; do not make realistic human figures. |
| 6–62m / central-hall façade | The central façade is 140m wide with 9 bays, of which the middle 3 are wider. The lower storey is 6–34m and the upper storey 34–62m; each bay has 4M bundled vertical columns and 3 horizontal beam bands; each of the central 3 bays has one deep doorway/window opening per storey. The central entrance has 16m clear width, unobstructed by the wings. |
| 62–78m / drum and shoulders | A 32-sided drum with one window per two sides, totalling 16 windows; 16 main bundled columns and 32 M ring chains distributed over 4 layers; lower the side roofs to 62m so that the centre projects above them. |
| 78–142m / elliptical dome | Plan semi-axes 38/32m, rise 64m; 32 double-M meridional ribs ×32 segments, and 32 D/M rings; the two horizontal semi-axes taper according to `rx(t)=8+30sqrt(1−t²)` and `rz(t)=8+24sqrt(1−t²)`, where t=(y−78)/64; the top joins the lantern at radius 8m. This is the project's elliptical tapering curve, not a mathematically exact complete half-ellipsoid. |
| 142–154m / lantern | A small ring pavilion with 16 columns, 8m high; 16 tapering ribs rise another 4m. Each column has 2M vertical connections, with 32D in the top ring. |

**Route and prohibited simplifications**: enter the square between the wings, walk laterally among the 4 column rows, then fly to the curved colonnade to view the central dome. The four rows must create spatial depth; do not substitute a single ring of columns for the square's enclosure.

### L13 Lattice Conservatory — 320×160×96m

**Reference features**: the standardised components, thin framing and barrel-vaulted transept of the 1851 Crystal Palace. Here, modernity is expressed through structure; the wood need not be changed to a glass material.[H13]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–4m / foundation | Four 1m base bands; the plan has 20 bays ×10 bays, each 16m. The column grid has 21×11 nodes; remove the nodes occupied by the central passage and replaced by long-span roof trusses, and list those nodes explicitly. |
| 4–28m / first-level frame | Each column has six 4m rising segments, each containing 4M bundled sticks; at 28m, each 16m bay has an M beam with double upper/lower chords and 4 web panels. Retain a 32m-wide central entrance at both front and rear. |
| 28–52m / central high hall | The side wings stop at 28–36m; the central 4 rows of bays rise another 24m; each vertical segment uses a 4M column bundle, while transverse frames use F(16,8,4,1) in 3 bands to form full-height frames. On the second level, place 8m-wide galleries only along the sides; do not fill the centre with a floor. |
| 52–80m / transverse barrel vault | Place the central transept at the middle of the long axis; the arch spans 56m, with a semicircular rise of 28m; place one frame every 8m along the barrel length, 21 frames in total; each frame has 2M curved ribs +one D connector every 4m. The semicircular end windows at both ends have 32 radial D chains. |
| 80–96m / upper skylight pavilion | A local central skylight ridge is 16m high and 64m long; 9 small frames, each with 2M upright chains +2M sloping roof chains +4D braces; add D window grids at 2m spacing on the surrounding façades. |
| Surfaces and details | Subdivide the wing roofs into sawtooth/folded slopes, 4 groups per 16m bay; D window-grid members occur every 2m. Use only a small amount of pale translucent surface behind the frames; glass must not hide the depth of columns and beams. |

**Route and prohibited simplifications**: cross the full conservatory and ascend to the gallery within the high hall; width, transparency and repeated modules are the focus. Do not make one giant glass box or make the building narrow merely to achieve progressively increasing heights.

### L14 Four-Legged Wind Tower — 100×100×188m

**Reference features**: the Eiffel Tower's four separate legs, progressively converging lattice and platforms; the table below describes this project's 188m version, not a storey-by-storey proportional replica of the original tower.[H14]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–8m / four feet | Four 18×18m foot platforms, each with four 2m layers; every layer has 4M outer-frame courses +a 4×4 grid. Leave the main passage space between the four feet. |
| 8–56m / six leg segments | Each segment rises 8m; the radial distance from each leg's centre to the tower axis converges from about 42m according to the array 42/39/35/30/25/20/16m. Each leg section reduces from 12→8m; each segment has 4 corners ×2B main chords, with one group of F(section width, actual sloping height,4,1) on each of its 4 faces. |
| 24–56m / large lower arches | Between adjacent legs, place 4 large decorative and connecting arches using A(about 56,about 20,2,4,4); the arches must not close the centre between the four feet. The legs themselves taper with curvature; do not use only four straight inclined columns. |
| 56–64m / first platform | About 56×56m, with four 2m assembly layers; each layer uses R(56,56,4,4), with an internal 7×7-bay M beam grid. Retain a 20×20m opening in the platform centre. |
| 64–104m / five middle segments | Each segment rises 8m; the four legs continue converging, with centre radius 16→8m; every leg has X bracing on four faces, at least 2 vertical panels per face. Do not draw only one long diagonal across an entire segment. |
| 104–112m / second platform | 32×32m, with 4 frame layers and a 12×12m central opening; corners project 2m. Place 8 bracket groups along each side, each with 3M. |
| 112–176m / eight upper-tower segments | The section reduces from 24×24 to 8×8m, with 8m segments; each of the 4 corners has 4B chains, each face has 2 F panels per segment, and M horizontal rings occur at the middle and top of each segment. |
| 176–188m / top | An octagonal observation ring, 4m high and 12m in diameter; above it is an 8m spire, with 8M diagonal ribs +4D rings. |

**Route and prohibited simplifications**: rise between the legs, pass through the centres of both platforms, and reach the top ring platform. There must be curvature, latticework with changing density and two clear interruptions at the platforms; four diagonal sticks supporting a straight rod are not acceptable.

### L15 Crown of Setbacks — 112×88×212m

**Reference features**: the Empire State Building's Art Deco vertical rhythm, successive setbacks and crown. The original building has 102 storeys; this project has 44 main floor bands plus a base/spire, explicitly not a reproduction of the original floor count.[H15]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–8m / podium lobby | Four 2m assembly bands, with an 8m-high entrance; bundled columns at the four corners +an 8m perimeter grid, a central entrance with 16m clear width, and top beams following R. |
| 8–40m / floors 1–8 | Each floor is 4m high, with a 112×88m plan. Each face has one 4M bundled column every 8m; the top of every floor has 2M perimeter frames, D vertical window-grid chains every 2m, and windows recessed 0.75m; the floor-8 cornice has 4 stepped projecting D courses. |
| 40–120m / floors 9–28 | Each floor is 4m high, with an 88×64m plan; use the same module, cutting 8×8m from each of the four corners to form articulated corners. At the centre of each face, keep one continuous double-M vertical ridge across all 20 floors; set the horizontal floor bands back to strengthen the vertical expression. |
| 120–168m / floors 29–40 | Each floor is 4m high, with a 56×40m plan; make local 2m setbacks every 4 floors, rather than reducing dimensions arbitrarily and asymmetrically. Each setback creates a roof edge at least 4m wide, with D railings and M brackets. |
| 168–184m / floors 41–44 | Each floor is 4m high, with a 32×24m plan; the four corners have 4 double-M vertical ridges. The top develops into a multi-level crown rather than ending in a flat cut. |
| 184–212m / crown and spire | Seven 4m assembly segments, with the section stepping back from 16×12m to 4×4m; every segment has double-M edges at its four corners +one D frame each at mid-height and top; use bundled B/M members at the final tip. Do not create one 28m-long stick through non-uniform scaling. |

**Route and prohibited simplifications**: pass through the lobby, stop at the three major setbacks, then ascend around the crown. Close views need column bands, window-opening depth and mouldings; five shrinking boxes are not enough.

### L16 Curved Valley Dam — 360×160×160m

**Reference features**: Hoover Dam is an arch-gravity dam, thin at the top and thick at the bottom, with curvature in plan; official dimensions inform an understanding of its structural proportions. This project is a 160m-high timber-landscape interpretation.[H16]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| Environmental reference levels | Suggested dam base: world y≈20m; main crest: world y≈164m; highest tower ornament: world y≈180m. The upstream water surface is about 8–12m below the main crest, and rocky banks on both sides are above the water. The dam must sit in a deep gorge, not suspend water above a grassy slope using retaining panels. |
| 0–144m / 36 dam-body bands | Each band rises 4m; divide the curve into 36 transverse sectors. Thickness at the base /1⁄4 /1⁄2 /3⁄4 /top is about 110/82/52/27/12m, using piecewise smooth interpolation; the upstream edge is a continuous arc in plan. The dam face must not be vertical with constant thickness. |
| Each sector in each band | Place one M surface frame on each of the upstream and downstream sides: two vertical chains +upper/lower horizontal chains; on each face, generate M vertical ribs at 2m horizontal spacing, with staggered-joint D horizontal surface sticks. Between the two faces, add one internal F radial truss every 4 sectors and leave the rest hollow; do not fill the entire 110m-thick volume with sticks. Expand counts with C/F using the sector's actual chord length, face height and thickness for that band. |
| 144–150m / crest road | A continuous 12m-wide road, with three 2m bands; one crossbeam every 8m along the arc, 4 longitudinal M chains and D decking; railings on both sides have one D post every 2m and two D handrails. |
| Four intake towers / to 160m | Towers rise from the upstream platform and have 16-sided shafts; the upper 24m of each tower is divided into six 4m bands, each with 16M vertical chains +16 M-ring segments; the tower cap has 8 tapering rings, each with 32D. Place the tower bases with complete supporting structure below the water level. |
| Downstream powerhouses / 32m high | One 64×24m powerhouse on each side, each with 4 floors ×8m; every floor has 8 transverse frames, M columns/beams and D window grids. Leave a water channel between the powerhouses, with the outlet channel connected to the sea/stream valley. |
| Spillways and dam toe | One descending spillway channel along the rock face on each side, 12m wide, with M edge frames and an original water material; the inspection bridge at the dam toe has 8m clear width and real connections. Do not cut arbitrary holes in the dam body to let water pass through walls. |

**Route and prohibited simplifications**: fly up the face from the dam toe, cross the crest to view the reservoir, then circle the intake towers. The silhouette must have both curvature in plan and tapering thickness in section; do not make a tall rectangular wall or place the dam in the ancient Roman region while claiming a modern chronological sequence.

### L17 Vertical-Line Court Tower — 80×56×244m

**Reference features**: the Seagram Building's setback plaza, fine continuous mullions and restrained curtain wall. Use its façade rhythm without copying the original floor count or real-world materials.[H17]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–12m / open ground-floor lobby | A 6×4 perimeter structural grid gives 20 bundled columns after deduplicating boundary positions; each bundle has 4B vertical chains. Height 12m, central passage clear width 16m; at the top, place 4M frames +an internal beam grid. |
| 12–220m / floors 1–52 | Each floor is 4m high; the main body is 72×48m, with maximum dimensions 80×56m including projecting terraces. Place perimeter mullions at 2m spacing: the rectangular perimeter is 240m, giving 120 unique mullion positions; every position on each floor has one M main vertical stick with 4D fine strips attached in front. The top of each floor has one recessed M perimeter beam `R(72,48,4,1)`, which must not sit across the front of the mullions. |
| Curtain-wall depth | Main columns sit behind; mullions project 0.4m and window grids are recessed 0.6m; each window cell has two D horizontal frames, at top and bottom, while its sides reuse the mullions. A small number of internal planes provide screening; do not make every window a black hole or make the entire building transparent from one side to the other. |
| Floors 16, 32 and 48 | Near the corresponding heights of 76, 140 and 204m, provide an 8m-wide observation terrace along the outside edge at each level; the main grid remains continuous, and terrace positions correspond to structural columns. Each terrace projects 4m, carried by one group of 3M diagonal brackets every 8m. |
| 220–244m / upper service crown | Six 4m construction bands; the first two continue the curtain wall, while the last four increase D horizontal-louvre density to one every 0.5m. Corner columns continue, and a rectangular open courtyard sits at the top. |

**Route and prohibited simplifications**: pass through the open ground floor and rise to the perimeter terraces to view the continuous vertical lines. A simple rectangular silhouette is allowed for this building, but its fine rhythm, depth relief and base space must be complete; do not use “modernist simplicity” to justify a single wood-textured box.

### L18 Nine-Bundle Cloud Tower — 90×90×276m

**Reference features**: the Willis Tower's nine square tubes terminating at different heights; the original has 110 storeys, while this project has 60, with newly designed termination levels.[H18]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–8m / foundation | A 3×3 arrangement of 30m square tubes fills 90×90m, labelled A/B/C in the north row, D/E/F in the middle row and G/H/I in the south row; central E remains for the full height. Each tube base has 2 layers, using R(30,30,4,4)+internal G(30,30,6,4). |
| 8–128m / floors 1–30 | Each floor is 4m high; all 9 tubes A–I remain. Each tube has 4M bundled columns at its four corners, one additional M mullion every 6m, and R(30,30,4,2) at the top. Build the shared edges of adjacent tubes only once; internal floors that are not open to visitors need not be fully decked. |
| 128–176m / floors 31–42 | A and I terminate, leaving 7 tubes; provide G decking and D railings on both 30×30m roofs. Do not shift the plan positions of the continuing floors. |
| 176–224m / floors 43–54 | C and G terminate, leaving five tubes B/D/E/F/H in a cross shape; every 4 floors, add one deeper M connecting band, and treat the roofs in the same way. |
| 224–248m / floors 55–60 | D/F/H terminate, leaving only B/E continuing; retain the same mullion rhythm on each floor. Do not rescale the remainder into a new central square tower. |
| 248–276m / crown | Both tubes have a 4m rooftop plant-room frame, then each carries one 24m antenna-like timber bundle; each bundle has 4B/M chains and one D connecting ring every 4m. Antennas do not count as usable floors. |

**Route and prohibited simplifications**: travel upward via roofs at four different heights; the nine-tube arrangement and cross-shaped stage must be recognisable from above. Do not replace the bundled tubes with one square box shrinking concentrically at successive levels.

### L19 Refracted Braced Tower — 88×88×304m

**Reference features**: the Bank of China Tower's combination of four prisms, terminations at different heights and diagonally cut crowns; the owner's description supports the real-building information. The triangular subdivisions and large-scale diagonal bracing are the main features to translate.[H19]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–8m / podium | The 88m-square footprint consists of four right-triangular regions around the centre; use an 8m beam grid at the edges and leave a central passage with 12m clear width along one diagonal. |
| 8–264m / basic rhythm of 64 floors | Each floor is 4m high; along the 3 edges of each remaining triangular prism, generate M mullions at 4m spacing and one ring of double-M edge beams; assign shared edges consistently to a single owner. The four parts terminate at floors 40, 48, 56 and 64 respectively, retaining their original plan positions. |
| One large bracing panel every 8 floors | On every remaining exterior face, place one large X per 32m of height; each corner's main chord has 4B chains, each diagonal has 2 parallel B chains, and each intersection receives 8M node sticks. Expand groups 1–8 individually, recalculating actual edge lengths where setbacks truncate them; diagonal braces must not extend into empty space. |
| Diagonally cut crowns | Finish the last 4 floors of each part with a sloping plane: each floor steps back an equal distance in a specified direction, producing a triangular sloping outline at the top. The outer frame follows that diagonal and the internal D secondary grid aligns with it; these are not four flat-topped boxes. |
| 264–280m / highest crown | The final triangular body rises another 16m in four 4m construction bands, with 3 double-B edge chains around the perimeter +an M triangular frame at each level; maintain the top's diagonal-cut direction. |
| 280–304m / twin spires | Two 24m timber bundles, each with 4B chains and 6D binding rings; place the two spires in relation to the triangular crown edges, not randomly at the centre. |

**Route and prohibited simplifications**: look up at the tower beneath intersecting braces, then rise to platforms at four different heights. The large triangular pattern is a physical structural layer projecting at least 0.75m in front of the façade; do not paint the X pattern as a texture.

### L20 Three-Wing Skyline Peak — 144×132×340m

**Reference features**: the Burj Khalifa's three-wing Y-shaped plan, buttressed core and alternating setbacks; SOM's account of spiralling setbacks is the main reference. This project's 72-floor design does not use the original tower's floor count.[H20]

| Height / level | Stick-count rules and specific placement |
| --- | --- |
| 0–8m / three-wing podium | A hexagonal core has circumradius 16m, with three wings separated by 120°; each wing extends about 56m outward from the core and is 24m wide, with a semicircular/polygonal nose. Solve the rotation and outer envelope to meet 144×132m in the final model; do not treat those dimensions as exact coordinates before calculation. |
| 8–296m / floors 1–72 | Each floor is 4m high. Each of the six core corners has 4M vertical chains; hexagonal top beams use double-M chains; each wing has one double-M mullion every 4m along both sides, a 12-segment curved end edge and an M ring band at the floor edge. On each floor, run 2 radial M beam chains from the centre into each of the three wings. |
| One setback every 6 floors / 12 total | At floors 6/12/18/…/72, step back the wings in the rotating sequence A→B→C, shortening the selected wing by 8m each time; each wing undergoes 4 setbacks: 56→48→40→32→24m. Keep the core continuous; the entire plan must not shrink concentrically. |
| Setback floors | At each of the 12 wing-end roofs, add G(actual width,8,1,1) decking, D railings and 2 groups of M diagonal brackets; the other wings at the same level continue upward. Every setback has a recognisable terrace and a different orientation. |
| 296–320m / six crown segments | Each segment is 4m high; the three wings disappear in turn until only the hexagonal core remains. Core radius contracts according to 16/13/10/7/4/2m; each segment has 6 double-M diagonal edges and 6 D-ring segments, with 6 secondary ribs added. |
| 320–340m / top spire | Five 4m segments; 6M/B bundled chains surround the centre with progressively decreasing ring radius; each of the first 4 segments has 2D connecting rings per level, while the fifth retains a clear endpoint. |

**Route and prohibited simplifications**: spiral upward around the setbacks facing three different directions, then look back along the whole valley from the broad platform below the crown. The highest tip is not a standing point; the flight ceiling must still permit circling the entire crown. Do not replace the three-wing setbacks with a cone, simple pyramid or single square tower.

## 17. Constraints and Checks for the Implementation Agent

### 17.1 Implementation outputs must be reviewable

Submit at least the following for every building:

1. Independent, readable recipe data: W/D/H, the height of every construction band, each floor index, column grid/bay counts, stick classes, curve parameters, quantity formulae, required details and visitor viewpoints.
2. A generator and **actual expanded part statistics**, summarised by building →construction band →assembly layer →B/M/D. Totals must be program output, not this specification's rough planning budgets.
3. Assembly inspection views that switch between “base only / add columns / add beams and arches / add roof / add details”, with the ability to isolate a single layer. These are for development acceptance, not the main ordinary-player interface.
4. Plan, front elevation, side elevation and 45° views, plus a 1.65m-eye-height view and close-ups of key details. Use the same sun direction to inspect actual geometric shadows; do not submit only attractive distant screenshots.
5. Corresponding LODs and independent collision proxies; at least one complete flight record from the entrance to a viewpoint.

First complete four standard samples: a 30m Ionic column, a 22m-span semicircular arch, part of an eight-lobed dome and a 32m-high diagonally braced façade. Expand them in bulk only after their geometry and details pass inspection. Development may proceed in stages, but all 20 buildings must ultimately meet their own recipes; do not polish one building while leaving the others as low-detail placeholder boxes.

### 17.2 Acceptance conditions that must not be substituted

| Check | Passing standard |
| --- | --- |
| Quantity | 20 independent recipes; every floor number in every recipe appears in the parts list. Three modern high-rises must not share a box generator with only their heights changed. Shared basic components are allowed. |
| Scale | Compare the outer envelope against the master table, with a target tolerance of ±1%; values marked “about” are first-pass modelling targets. The agent must establish one definite value in the recipe data before expanding parts. If an opening/joint constraint requires a change, record the original value, revised value and reason; “about” is not permission for arbitrary omissions. The sum of floor/construction-band heights must close, with no gaps or unexplained overlaps. |
| Column orders | Doric, Ionic, the Corinthian reinterpretation and lotus columns have real geometric differences; close views show shadows from flutes, capitals, bases and entablatures. |
| Curves | Arches have thickness and inner/outer edges; dome meridians and rings connect; distant views show no obvious stepped breaks, while close views still reveal assembly from straight sticks. |
| Support relationships | Beam ends, arch springings, tower legs, flying buttresses, setbacks and capitals have legible connections. Static models need not pass real structural calculations, but must not obviously float or intersect without purpose. |
| Doors, windows, inside and outside | Every building has at least one enterable/traversable space and one reliable viewpoint; collision checks pass for every opening marked as traversable. |
| Detail | Complete at least 3 identifying details per building, such as L03's flutes/triglyph frieze/pediment and L10's rose window/flying buttresses/compound piers. Random ornaments do not count. |
| Historical information | Record “reference-building facts”, “dimensions adapted for this project” and “this project's floor and stick counts” separately; do not describe the 44-floor Empire-inspired building as the actual Empire State Building's floor count. |
| Public presentation | Plaques say “World preset · Inspired by …”; do not present presets as works built by players under the current 200-stick limit. |

### 17.3 Reconciling complexity and performance

Put extensive detail into offline recipes and close-view LODs. Instancing does not make hundreds of thousands of sticks free. An ordinary box has 12 triangles; 100,000 sticks already mean about 1.2 million triangles, before additional rendering such as shadows. Count visible instances, triangles, draw calls, GPU memory and CPU assembly time separately.

Start with **about 10,000–80,000 sticks for one complete close-view building and about 400,000–1,000,000 sticks in the island's offline content** as planning ranges, not acceptance minima or measured counts. The 18 complete Ionic columns in §14.5 alone total about 29,000 sticks, showing why detailed capitals cannot be fully expanded everywhere on the island without distance limits. When a recipe exceeds budget, prioritise combining distant detail, culling back-facing/invisible parts and streaming by component while preserving close-view identity and routes.

- Close view: expand full detail for only the nearest 1–2 buildings; load higher local detail when inspecting a particular capital. Let different devices determine the quantity from the on-screen triangle budget; do not fix the rule as “everything nearby at maximum detail”.
- Mid-distance: combine column flutes and window grids into simplified geometry while retaining capital silhouettes, arch openings, dome ribs and main diagonal braces; target about 1,500–6,000 equivalent components per building, with actual triangle counts measured.
- Far distance: start with a silhouette proxy of about 1,000–4,000 triangles per building, retaining major openings and setbacks. It is not a single bounding box, and the tallest distant tower must not disappear.
- Cache: store compact transforms by building and construction band. Matrix4 alone uses 64 bytes of matrix data per stick, so one million sticks require about 64MB; do not retain several additional copies of the same volume in JS objects. Use TypedArray, compressed transforms and chunked disposal.
- Collision: retain proxies only for floors, main columns/piers, walls and visitor routes; do not create a Rapier rigid body for every decorative stick. Changes to close-view detail must not change the already-validated main-route collision.

Constrain actual density jointly by §10's on-screen budgets and real-device results. The recipe BOM is for detecting omissions and locating costs, not for scoring artistic quality by stick count.

### 17.4 Adapt world guidance to the new layout

The entrance copy may add one sentence:

> From the first lintel to towers above the clouds, follow the valley and see how people build imagination one layer at a time.

Show only one short prompt in each era region, with details expanded voluntarily. Leave a broad platform in the final region from which the whole valley is visible, with a clear “Build the next place together” entrance. Do not rank player works by quality or height; distribute them along side paths and open exhibit spaces in each region. Do not frame the modern endpoint as a value judgement that it is “better” than antiquity.

## 18. Architectural Research Sources and Scope of Use

This research found the original buildings' heights, some floor/column counts, sectional relationships and decorative features. No existing source directly provides “how many proportionally scaled Stillwood sticks go into each floor”. Sections 14–16 contain recipes designed for this project. They must be revised through generated samples, dimension checks and viewpoint acceptance, not described as construction bills of quantities discovered in historical sources.

| ID | Architectural reference and reliable source | Facts extracted for this specification / distinction from design values |
| --- | --- | --- |
| H01 | [English Heritage — Description of Stonehenge](https://www.english-heritage.org.uk/visit/places/stonehenge/history-and-stories/history/description/?lang=en) | Five inner pairs of columns and lintels, with an outer ring; the original outer ring may have had 30 columns, while this project has 20. |
| H02 | [University of Chicago ISAC — Great Hypostyle Hall](https://isac.uchicago.edu/research/publications/oip/oip-142-great-hypostyle-hall-temple-amun-karnak) | The original hall has 134 columns; this project's 48 columns and 44m height are adaptations. |
| H03 | [Acropolis Restoration Service — Parthenon](https://www.ysma.gr/en/monuments/parthenon/) | The 8×17 exterior-column relationship, shaft entasis and Doric composition; this project's 96×184×52m is not the original size. |
| H04 | [YSMA — Erechtheion](https://www.ysma.gr/en/monuments/erechtheion/), [Metropolitan Museum — Architecture in Ancient Greece](https://www.metmuseum.org/essays/architecture-in-ancient-greece) | The Ionic order; bases, flutes, volutes and differences from other orders. The number of volute segments is a project modelling decision. |
| H05 | [Pont du Gard — The monument](https://pontdugard.fr/en/discover/monument), [France.fr — Five facts](https://www.france.fr/en/article/5-facts-about-the-pont-du-gard-to-impress-your-friends/) | About 49m and three tiers: 6 arches below/11 in the middle, with originally 47 in the upper tier and 35 surviving; this project is 68m high. |
| H06 | [Turismo Roma — Flavian Amphitheatre](https://www.turismoroma.it/en/node/1155) | Elliptical plan and four architectural levels; this project's 48 bays per level and 78m height are not original figures. |
| H07 | [Italian Ministry of Culture — Pantheon](https://direzionemuseiroma.cultura.gov.it/en/pantheon/) | The rotunda dome is about 43.3m in diameter, supported by circular walls; this project's 42m radius and 86m total height are adaptations. |
| H08 | [Metropolitan Museum — Hagia Sophia](https://www.metmuseum.org/exhibitions/listings/2012/byzantium-and-islam/blog/where-in-the-world/posts/hagia-sophia), [Columbia — Dome and pendentives](https://projects.mcah.columbia.edu/medieval-architecture/htm/or/ma_or_discuss_hs_dome.htm) | Four pendentives make the transition from square to circular support; this project's segment counts are not ancient quantities. |
| H09 | [Centre des monuments nationaux — Carcassonne silhouette](https://www.remparts-carcassonne.fr/en/discover/an-iconic-silhouette), [The castle](https://www.remparts-carcassonne.fr/en/discover/the-castle) | Walls, towers, an inner castle and later alterations form a composite silhouette; this project's tower and floor counts are original. |
| H10 | [Columbia — Amiens exterior model](https://projects.mcah.columbia.edu/amiens-arthum/amiens-cathedral-exterior-model), [Amiens Métropole](https://www.amiens.fr/Vivre-a-Amiens/Culture-Patrimoine/Patrimoine-mondial/La-cathedrale-Notre-Dame-d-Amiens) | Relationships among the high nave, side aisles and flying buttresses; this project's 8 bays and 128m height are not figures for the real cathedral. |
| H11 | [Opera di Santa Maria del Fiore — Dome](https://duomo.firenze.it/en/40/dome) | Inspiration from the eight-lobed double shell, 24 meridional ribs, lantern and herringbone masonry; the specific stick curves and counts are original. |
| H12 | [Vatican — Colonnade](https://www.vatican.va/content/vatican/en/ra/colonnato-statue-santi.html), [St Peter’s Basilica — The Square](https://www.basilicasanpietro.va/en/san-pietro/the-square) | The original colonnade has 284 columns in four rows; this project has 128 columns. Webpages differ in how they report height, so this draft does not use them to specify an exact height for the original columns. |
| H13 | [V&A — Great Exhibition of 1851](https://www.vam.ac.uk/articles/the-great-exhibition-of-1851) | The Crystal Palace's prefabricated modules, frames and barrel-vaulted transept; this project's 96m height belongs to a large fantasy exhibition hall, not an exact reconstruction. |
| H14 | [Eiffel Tower — History](https://www.toureiffel.paris/en/the-monument/history), [Key figures](https://www.toureiffel.paris/en/the-monument/key-figures) | Four lattice legs separate at the base and converge toward the top; this project's 188m height and platform levels are redesigned. |
| H15 | [Empire State Building — History](https://www.esbnyc.com/about/history), [Architecture](https://www.esbnyc.com/about/architecture-design) | 1931, 102 floors, Art Deco and the distinction between the frame and façade; this project's 44 floor bands are not the original floor count. |
| H16 | [US Bureau of Reclamation — Hoover project](https://www.usbr.gov/projects/index.php?id=122), [Dam FAQ](https://www.usbr.gov/lc/hooverdam/faqs/damfaqs.html) | Arch-gravity form, thick at the base and thin at the top; the original dam's structural height is 726.4ft, top width 45ft and base width 660ft. This project's 160m height and band thicknesses are an interpretation. |
| H17 | [DOCOMOMO US — Seagram Building](https://docomomo-us.org/register/seagram-building) | 1958, 38 floors and the curtain-wall module; this project's 52 floors and 244m height establish new proportions. |
| H18 | [SOM — Willis Tower](https://www.som.com/projects/willis-tower-formerly-sears-tower/) | 1973, 110 floors, nine bundled square tubes terminating at different heights; this project's termination floors 30/42/54/60 are newly designed. |
| H19 | [Bank of China (Hong Kong) — About BOC Tower](https://bocgroup.com/en/aboutus/corpprofile/boctower.html) | Opened in 1990, with a composition of four prisms; this project's 64 floors and 304m height are not the actual height and floor count published by the owner. |
| H20 | [SOM — Burj Khalifa](https://www.som.com/projects/burj-khalifa/), [Official structural system](https://www.burjkhalifa.ae/the-tower/structures/) | Three-wing Y shape, buttressed core and setbacks in a rotating sequence; this project's 72 floors and 340m height are an original interpretation. |

Research links support understanding and citation; they do not imply that the webpages' photographs, drawings, scans or models may be used directly as game assets. Buildings in this project are generated from original stick recipes; downloadable assets such as grass and rocks still follow §9's licensing and source-recording process.


## 19. Actual Component Samples and Validation Feedback (2026-11-03)

### 19.1 Scope and evidence

Seven groups have actually been generated: three classical column types, a four-level staircase using the original piece specification, broad shallow stairs, a two-column entrance composition and a four-opening spillway component. The delivery package `component_lab.zip` contains generators, per-stick JSON, GLB, renders, a snapshot of the original project's physics code, physics results and `VALIDATION.md`; open `review.html` to inspect them directly. These are not 20 complete buildings, and they have not been integrated into the live world.

When accessing the online site specified by the user, the controlled browser reported that WebGL was unavailable and fell back to a flat preview; the homepage was not signed in. Therefore, this round did not create live works, perform live placements, modify the repository or deploy. All visualisations are offline numerical-geometry renders, not screenshots of the live site.

| Sample | Actual stick count | Height / features | Scope validated |
| --- | ---: | --- | --- |
| Doric-inspired column | 3142 | 28.4375; 20 outer ribs, actual flutes and a layered outward-projecting capital | Static geometry and viewpoints |
| Ionic-inspired column | 3306 | 29.9375; 24 outer ribs and paired volutes on front and rear | Static geometry and viewpoints |
| Corinthian-inspired column | 4600 | 30.4375; two staggered leaf rings, with 720 fine leaf sticks | Static geometry and viewpoints; the leaf shapes remain simplified |
| Four-level staircase using the original piece specification | 132 | 32.06×4×16.30; 64/36/24/8 sticks by level | Passed offline simulation using the project's physics code |
| Broad shallow stairs | 1956 | 16 steps, rise 0.25, front-edge setback 2, main width 64→34 | Static visible shell |
| Stairs and two-column entrance composition | 9272 | Total height 38.25, total width 72.5 | Static composition and camera comparison |
| Four-opening spillway component | 15010 | Total height 61.75; five fins and four openings, narrow at the top and broad at the bottom, with a continuous spillway surface | Static geometry; no water-flow/load-bearing simulation |

The world samples provisionally use 1 unit=1m, retaining the 8:1:1 ratio in 4×0.5×0.5 and 1×0.125×0.125 sticks. The original-specification physics staircase uses only 8×1×1 sticks. Fine-size samples are static preset proposals; they do not imply that the current workbench supports scalable sticks. Bounding boxes, rotation matrices, valid dimensions and consistency with exported GLB have been checked. Static parts intentionally overlap at joints and are hollow inside; they have not passed player-placement, complete deduplication or structural-stability validation.

### 19.2 Old paper counts cannot be reused as implemented budgets

The 1624 sticks in §14.5 belong to the earlier paper recipe, which was not generated and accepted according to that original recipe. This round's actual column samples use denser abacus plates, bases and flute bottoms, making them a different implementation. The actual Ionic count is 3306; do not claim that the original 1624-stick design passed. At this round's density, 18 columns alone would use 59,508 sticks. Section 16's whole-building budgets and §17's island-wide budgets must be recalculated using the actual generator. Not every building should unconditionally use the densest close-view version.

### 19.3 Specific results for the physics staircase

Used the current code's PhysicsWorld, physics configuration v3 and Rapier0.19.3. Called checkPlacement and addStick sequentially, with 30 ticks between sticks and another 1200 ticks after placing the last one, for 86 seconds of simulated time. Final results: 132 accepted, 0 rejected, 132 supported, all sleeping, and quiet and healthy both true; maximum centre displacement 0.0173204, support height 3.99. Output includes all final poses and a render of those poses.

In the initial tightly touching version, three sticks were rejected because of about 0.0022–0.0028 lateral penetration; small upward adjustments did not resolve it. Finally, centre spacing was changed to X=8.02 and Z=1.02, while layer height remained 1. All passed without relaxing collision rules or using automatic raising as a workaround. This experiment did not cover browser input, room commands, multiplayer synchronisation, saving or reopening; it cannot be called a live end-to-end pass.

### 19.4 Camera conclusions and required main-camera changes

The current camera logic, with 35° FOV, a default downward angle and automatic fitAll pullback, still tends to present even giant components as tabletop models. **“Looking monumental from the current main viewpoint” was not judged achieved in this round.** A comparison of the same entrance composition using the current camera logic and a low camera position was generated. The low view better expresses the scale relationship among column height, entrance and stairs, but that is a visual judgement, not a user-test result.

The gallery's main mode should change to 1.65 eye height, around 55° FOV, and no automatic fitAll when new buildings enter; retain the current orbit mode as an optional overview. Initial entrance eye position [20,1.65,74] and target [0,19,0] may serve as a debugging starting point; for the dam, use eye position [45,1.65,92] and target [0,29,5]. Flight, camera comfort and actual results on target devices still await integrated acceptance. Even without a body model, maintain a fixed eye height, consistent railing/doorway scale and a continuous approach.

The final broad shallow stairs use a rise of 0.25 and front-edge setback of 2; simplified ramp collision is recommended for walking to prevent the camera from bouncing on each step. The first dam version was too open, so a continuous spillway surface was added; the first Corinthian leaves were too thin, so each leaf was changed to five fine strips. This round's problems and corrections have original images/records, rather than only additional description.

### 19.5 Next-stage acceptance

First create an actual Three.js component-preview entry point that reads per-stick JSON, reuses the existing wood shader and renders in InstancedMesh batches; inspect close-view volutes, leaves, stair joints and the dam's side. Static presets use simplified collision; do not put tens of thousands of component sticks into the current server rigid-body world. Separately verify live placement, saving and reopening for the original-specification 132-stick staircase.

The offline renderer uses approximate procedural wood grain, software EGL and simplified rectangular sticks; it is not a pixel-for-pixel reproduction of production materials. Target-browser frame times, memory, LOD, streaming, coexistence of 20 buildings, and the grassy, clouded island and sea remain incomplete. Only after those measurements pass can the component results in this section become evidence for whole-island acceptance.
