# Stillwood Component Validation Record

Date: 2026-11-03. Project: COMP4020 Final. **These are generated offline geometry samples, not completed buildings on the live site.**

## 1. Work completed in this round

Seven sets of individual-stick geometry, seven GLBs, per-stick transform JSON files, and renders using the current camera logic and proposed low viewpoint were generated. One sample, a 132-stick staircase using the original stick dimensions, ran through the project's own physics code. Open `review.html` directly to view all static comparisons without WebGL. `output/manifest.json` contains the actual stick counts and bounding boxes; budgets from the earlier design must not replace these measurements.

When accessing the user-specified live site, the controlled browser explicitly reported that WebGL was unavailable and fell back to a flat preview; the homepage was signed out. Consequently, no placement was performed on the site, no accounts, works or rooms were created, no online synchronisation or saving was tested, and the repository was neither modified nor deployed. The offline samples are inputs for the implementation agent, not content already imported into the site.

## 2. Actual geometry

Conventions: Y points upward. The exhibition-world design provisionally interprets one unit as one metre; the original workbench itself does not claim real metric dimensions. All sticks have an 8:1:1 length-to-width-to-thickness ratio. World samples use 4×0.5×0.5 and 1×0.125×0.125 sticks; the original-dimension physics staircase uses only 8×1×1 sticks. Keep these categories separate: the current editor has not been modified to support the thinner sticks.

| Sample | Stick count | Actual bounding box X×Y×Z | Status |
| --- | ---: | --- | --- |
| Doric-inspired column | 3142 | 7×28.4375×7 | Static geometry; not an archaeological reconstruction |
| Ionic-inspired column | 3306 | 7.8×29.9375×7 | Static geometry |
| Corinthian-inspired column | 4600 | 7.5384×30.4375×7.5384 | Static geometry |
| Four-level staircase using original stick dimensions | 132 | 32.06×4×16.30 | Passed offline physics validation |
| Broad, shallow 16-step staircase | 1956 | 72.5×4.25×72 | Static shell |
| Staircase and twin-column portico composition | 9272 | 72.5×38.25×72 | Static composition |
| Four-opening spillway component | 15010 | 76×61.75×40.2727 | Static shell; no water-flow simulation |

These are components and compositions, not 20 complete buildings. Repeated components within a composition do not count as additional independent buildings. Static curves are approximated by overlapping straight sticks with consistent proportions, including intentional overlaps, cantilevers and internal cavities. These models have not undergone stability certification, complete structural checking or stick-deduplication acceptance.

## 3. Reproducible construction details

### Column shafts and capitals

The base has four layers, each 0.5 high, starting at a width of 7 and narrowing by 0.35 per layer. The shaft extends from Y=2 to 26 in eight segments, each 3 high. The Doric shaft has 20 outer ribs around its circumference; the others have 24. The radius of segment k is `2.4−0.5k/8+0.14sin(πk/8)`, producing taper and slight entasis. Thin strips between adjacent outer ribs are inset by 0.27, creating actual grooves rather than an applied dark line. Each segment also has 24 circumferential connecting sections.

The Doric capital has 12 progressively flaring rings, starting at radius 2 and increasing by 0.07 per ring, with four square abacus layers above. The Ionic capital has a pair of volutes at both the front and back; each volute uses 40 stick segments, with a spiral angle from 0 to 2.5π and a radius that decreases with the angle. The capital is not a pair of rectangular boxes. The Corinthian capital has a flaring basket-shaped core of 24 rings and two staggered rings of eight leaves each. Every leaf uses five adjacent thin bands, each with nine segments, totalling 720 leaf sticks and forming a surface that opens outward before tapering to a tip. This remains a simplified leaf form, without realistic acanthus lobes or complete carved ornament.

### Broad, shallow staircase

There are 16 steps. Step j (j=0…15) has width `64−2j`, front-to-back depth `72−4j`, and tread-centre height `0.25+0.25j`. Each front edge retreats by 2 and rises by 0.25, giving a 1:8 slope. Four front-edge rows of 4×0.5×0.5 sticks join across the width; there are two edging rows on the sides, one at the back, and a 34×8 upper platform. Low plinths on both sides establish the lateral scale. Because stick thickness is 0.5 while the step rise is 0.25, adjacent layers overlap locally. This is a static visual component, not a recipe for players to build a load-bearing staircase stick by stick. Walking should use a simplified ramp collider so the first-person camera does not bounce at every step.

### Four-opening spillway section

Five fin-shaped pier walls, centred at X=-32,-16,0,16,32, form four openings. The main body has 112 layers, each 0.5 thick, totalling 56. Let the layer centre be `y=0.5j+0.25` and `t=y/56`. Pier half-width is `1.1+2.1(1−t)`, giving a theoretical full width of 6.4 at the bottom and 2.2 at the top. The downstream nose is `z=4+30(1−t)^1.7`, and the upstream back is z=-6. Thus the front is wider at the bottom and narrower at the top, while the side curves outward towards the dam toe instead of forming parallel vertical panels.

Each layer has two long chains along the sides and one transverse chain across the nose; a continuous double transverse row closes the upstream face. The four gate centres are X=-24,-8,8,24. Gate panels span Y=40.5…52 in rows spaced by 0.5, with the frames recessed near Z=-2.5. Each opening adds a continuous downstream chute surface `z=5+20(1−y/56)^2`, placing transverse sticks at every 0.5 of height down to the dam toe; both sides follow the same curve. The top has a 76×10 bridge deck, five layered pier caps and railings on both sides, for a total height of 61.75.

This is an original hybrid component responding to the user's request for fins, gates and a trapezoidal cross-section. It is not an accurate reconstruction of Hoover Dam's spillway facilities and makes no claim of hydraulic feasibility or fluid simulation.

## 4. Physics validation of the original-dimension staircase

The repository's `PhysicsWorld`, `config.ts` and `geometry.ts` were used with Rapier pinned to 0.19.3 and physics configuration v3. Each placement called `addStick` after passing `checkPlacement`, with 30 ticks between placements; the simulation then ran for another 1200 ticks after the final placement. Total simulated time was 86 seconds.

The four levels contain 64, 36, 24 and 8 sticks, totalling 132, all sized 8×1×1. The transverse-by-longitudinal counts are 4×16, 3×12, 3×8 and 2×4 respectively. X spacing is 8.02, Z spacing is 1.02, and each layer centre is Y=j+0.505. The 0.02 gap prevents lateral penetration between adjacent sticks caused by numerical drift.

Final result: 132 accepted, 0 rejected, 132 supported, all sleeping, quiet=true and healthy=true. Supported height was 3.99; maximum centre displacement was 0.0173204 units, with no automatic upward correction. `stairs_physics_result.json` stores every final position and quaternion. `stairs_132_settled.json` and its images were generated from the final poses, rather than presenting an ideal arrangement as a simulation result.

Two failed attempts are retained. In the initial version, adjacent sticks touched directly: 129 of 132 placements were accepted, with three penetrations of approximately 0.0022–0.0028. A second attempt with a small upward adjustment did not fix the lateral problem. The final change increased the spacing, and the final tester removed adaptive recovery logic. The failed attempts survive as records only; the final generator no longer generates the old inputs.

Validation boundaries: browser input, server room commands, authentication, the application logic enforcing the 200-stick limit, multiplayer concurrency, storage and networking were not exercised. Although 132 is below the identified design limit of 200, that alone does not establish a successful complete import into the live site. The small four-level staircase also does not fulfil the visual goal of monumental architecture.

## 5. Whether the current main viewpoint conveys monumental scale

**The current overhead automatic framing weakens the sense of scale; simply making models taller does not solve this.** `orbit` approximately reproduces the code's 35° FOV, phi=0.95, theta=π/4, the bounding box including the radius-18 workbench, and the fitAll distance. Regardless of how much an object grows, the camera pulls back again to fit it into the frame. The portico still resembles a tabletop model in this comparison view. This round therefore did not mark the goal of monumental scale from the current main viewpoint as achieved.

The low-viewpoint samples use an eye height of 1.65 and a 55° FOV; the standalone broad staircase uses 65°. The low-viewpoint portico camera is at [20,1.65,74], looking towards [0,19,0]; the dam camera is at [45,1.65,92], looking towards [0,29,5]. Exact parameters are saved separately in each image's camera.json. The comparison changes position, orientation and FOV, so it is not a single-variable experiment.

Integration recommendation: enter the gallery at a low viewpoint by default and stop triggering fitAll whenever a new building loads; retain an overview as a separate mode. At the entrance, show the nearby column base, stairs and some sky together, allowing the player to look up at the full capital. Treat walking at 4–6 units/second and flying at 12–22 units/second as initial values to test, with gradual acceleration and no presentation animation that repeatedly pulls the camera back. Calibrate scale through door openings, railings, eye height and approach time together, rather than relying on a label saying "61 metres". A fixed eye height does not require a visible body avatar.

## 6. Rendering, performance and asset boundaries

Images were generated using ModernGL EGL software rendering and are not website screenshots. Proportions, stick transforms and camera formulas have numerical support. The wood grain is an approximation produced by a custom procedural texture; shadows and colour treatment do not reproduce the Three.js project's materials pixel for pixel. The simplified rectangular sticks omit the small bevels of production sticks. The background is a neutral inspection scene; grass, cloud and mist, the island, collision boundaries and flight interactions were not created in this round.

JSON preserves each stick's `p`, `R`, `size` and `group`. R is a row-major 3×3 rotation matrix whose columns represent the stick's local axes. GLB provides only a merged triangle mesh and vertex colours for reviewing form. To integrate the existing wood shader, read the JSON into an InstancedMesh rather than creating a separate Object3D for every stick. No direct website import feature is provided.

Only the 132-stick staircase was loaded into the physics world. The remaining presets should be rendered separately as static geometry with simplified colliders. Do not add all 15,010 dam sticks to the current server's rigid-body world. GLB/JSON file size does not equal runtime memory, and completion of offline software rendering does not imply that a browser will reach 60fps. Target-device acceptance is still needed for WebGL frame times, memory, LOD, streaming, close-up seams and dynamic occlusion. World samples retain overlaps to approximate curves and therefore have not passed player-placement legality checks either.

## 7. Next steps for the implementation agent

1. Create a separate component-preview route, load this package's JSON and reuse the actual wood materials. Provide presets for both the current orbit view and the proposed low viewpoint; do not switch them automatically.
2. Review all three column orders, the dam side and the portico close-up individually. Pay particular attention to Corinthian leaves, volute seams and upper-platform seams; a high stick count is not evidence of acceptable quality.
3. To validate the original editor, first place the 132-stick staircase in JSON order and record server rejections, final poses, saving and reopening. If importing is unavailable, implement an explicit development-sample entry point rather than disguising it as an ordinary user's work.
4. Batch static world components into instances by stick specification and material, with LOD and simplified terrain collision. Then measure performance in the target browser and revise the whole-island budget from the results.
5. Complete these acceptance checks before expanding to 20 buildings. The 1624-stick column in section 14.5 of the earlier design document was a paper budget; the actual Ionic sample in this round uses 3306 sticks. Eighteen columns at this density would require 59,508 sticks for the columns alone, so the whole-building budget must be recalculated.

## 8. Sources and reproduction

Code source: `https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi`, read at baseline `b13ecaee79f29930827c0b7db660861a73ccddae`. The package's source_viewport.ts, source_wood.ts, source_physics.ts and src/ are source snapshots used for this comparison and retain their original contents; the generators, renderers and geometry were added in this round. They are not an asset library with independently obtained third-party redistribution permission and are supplied only for this project.

Requires Python3, Node24 with native TypeScript stripping, and an EGL/OpenGL software or hardware environment.

```bash
python -m pip install -r requirements.txt
npm ci
python build_lab.py
node test_physics.mjs
python render_lab.py
python finish_lab.py
```

`render_lab.py` generates all viewpoints. `finish_lab.py` updates the staircase and portico views, final settled poses, boards and local HTML. Every step runs offline, with no writes to the live site. `output/validation_checks.json` records the geometry and file checks from this round.
