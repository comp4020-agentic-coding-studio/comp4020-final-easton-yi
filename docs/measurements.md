# Measurements

Every tuned value or capacity claim points here. Each entry records the
machine, the command, the raw result and what was changed because of it.
Local numbers are from the development machine and are **not** Fly numbers;
the Fly machine (shared-cpu-1x, 256 MB) still needs its own measurement.

Development machine: WSL2 Linux 6.18 on x86-64, 24 logical CPUs, 15.7 GiB RAM,
Node 24.21.0.

## M-001 · Rapier version vs resident memory (2026-10-05)

Problem: the VM has 256 MB. With `@dimforge/rapier3d-compat@0.21.0` (latest at
the time), a measurement script holding a single 200-stick world reached
261 MiB RSS.

Isolation (`/tmp/mem4.mjs`: raw Rapier, 200 cuboids on a cylinder, event
queue, `node --expose-gc`, gc before each reading):

| Version | Module size | RSS after 1 / 100 / 1000 / 3000 steps (MiB) | WASM linear memory | JS heap |
| --- | --- | --- | --- | --- |
| 0.21.0 | 4.34 MB | 121 / 193 / 219 / 234 | 3 MiB | 12 MiB |
| 0.20.0 | 2.86 MB | 105 / 140 / 154 / 156 | 2 MiB | 10 MiB |
| 0.19.3 | 2.24 MB | 84 / 106 / 101 / 102 | 3 MiB | 10 MiB |

The growth is neither WASM linear memory nor JS heap; it tracks module size
(V8 compiled code for the tiered WASM). With `--no-liftoff` 0.21.0 plateaued at
159 MiB and 0.19.3 at 92 MiB.

Change: pinned `0.19.3`, which has every API this design uses
(`takeSnapshot`/`restoreSnapshot`, `contactShape`, `contactPair`, CCD,
contact-force events). All 33 physics/placement fixtures pass on it.

## M-002 · Physics cost at declared capacity (2026-10-05)

`node scripts/measure/physics.ts` — 200-stick log-cabin tower, 120 settled
steps, then pushed and 600 collapse steps; Rapier 0.19.3.

| Metric | 0.21.0 | 0.19.3 |
| --- | --- | --- |
| Settled step p50 / p95 | 2.23 / 3.09 ms | 1.78 / 3.66 ms |
| Collapse step p50 / p95 / max | 2.12 / 2.64 / 13.9 ms | 2.00 / 2.64 / 8.9 ms |
| Native snapshot size | 881 542 B | 478 198 B |
| Snapshot / restore time | 3.0 / 8.4 ms | 1.6 / 5.5 ms |
| Process RSS | 261 MiB | 191 MiB (137 MiB with `--no-liftoff`) |

At 60 Hz the step budget is 16.7 ms; three collapsing rooms at p95 ≈ 8 ms
fit locally. A 478 KB snapshot written on every accepted placement and every
500 ms of motion is a real I/O cost that still needs measuring on the Fly
volume (P5).

Node's built-in TypeScript type stripping adds ~20 MiB RSS per isolate at
startup (101 vs 75 MiB before any world exists), so production runs bundled
JavaScript instead (see ADR-0001).

## M-003 · Cross-session visibility, local loopback (2026-10-05)

`APP_URL=http://localhost:8080 node scripts/measure/visibility.ts 40` against
`NODE_ENV=production node dist/server/main.js` on the development machine.
Two WebSocket sessions (owner and invited editor) in one process share one
clock. Each of 40 accepted placements was timed from A's send to B receiving
`sticks.added` (SYNC-04) and to A receiving `command.result`. Placements were
spaced to stay under the 2 commands/s limit; the work grew from 0 to 40 sticks.

| Metric | p50 | p95 | max |
| --- | --- | --- | --- |
| Visible to the other session | 4.5 ms | 12.3 ms | 12.3 ms |
| Command acknowledged to sender | 4.4 ms | 12.2 ms | 12.2 ms |

This is loopback: it measures server ordering, snapshot transaction and fan
out, **not** the network to Fly's `syd` region. The p95 ≤ 1000 ms gate still
needs the same script run against the deployed app.

## M-004 · Memory under the capacity workload (2026-10-05)

`scripts/measure/capacity.ts`: 3 rooms × 4 editor sessions, every window
streaming ghost poses at 15 Hz, 150-stick mats built through the command path
(450 placements), then 50 sticks per room dropped from height (150 placements
while the piles are moving), 9 concurrent logins during the drop, and a
version save per room. Server: `NODE_ENV=production node dist/server/main.js`
on the development machine. Peak RSS is sampled from `/readyz` every 500 ms.

| Configuration | Peak RSS (MiB) | Mats only | Rain + logins | Command ack p95 (rain) |
| --- | --- | --- | --- | --- |
| Defaults, scrypt N=2^16 p=2 | **278** | 208 | 278 | 25.4 ms |
| Same, no logins | 244 | 195 | 235 | — |
| Heap caps (worker old 48/young 8 MB; main `--max-old-space-size=64 --max-semi-space-size=2`), no logins | 187 | 179 | 178 | 30.4 ms |
| Heap caps, with logins, scrypt N=2^16 p=2 | 234 | 179 | 234 | 33.4 ms |
| Heap caps, with logins, **scrypt N=2^15 r=8 p=3** | **207** | 179 | 207 | 38.7 ms |
| Heap caps + `--no-liftoff`, no logins | 197 | 163 | 172 | 30.2 ms |

Problem: default V8 heap sizing let the worker's heap reach 89 MiB of
collectable churn (frames, ghost relays, snapshot copies), and each 64 MiB
scrypt hash added its full cost on top. That exceeds 256 MB.

Changes: production heap caps (above), and scrypt moved to the OWASP-listed
N=2^15, r=8, p=3 (32 MiB). Hashes carry their parameters, so existing ones
still verify. `--no-liftoff` was not adopted: its startup spike raised the peak.

Result: peak 207 MiB (81% of 256), with 179 MiB (70%) in the steady 3×200
state. That's at the edge of the 80% headroom target **on this machine**. On
Fly it must be measured again; a shared-cpu-1x may also be CPU-throttled under
sustained physics, which this machine can't show. Login p95 under the storm
was 1.17 s with 0 BUSY responses (one hash at a time, queue of 8).

## M-005 · Table collider: cylinder → triangle mesh (physics config v2, 2026-10-05)

Problem (seen in the M-004 run): after the drop, some rooms never reported
"Structure saved". A probe on the real engine (`/tmp/settle.ts`: the same
150-stick mat plus 50 dropped sticks) showed a stick lying across the table's
curved rim with another resting on it. Under config v1 (Rapier cylinder) it
penetrated the table 0.02–0.04 u, pulsed at 0.4–1.7 u/s, crept outward and
re-woke ~170 bodies every few seconds for over 60 s.

Tried, on a two-stick rim fixture (ticks until 1.5 s quiet; max speed after 5 s):

| Variant | Stable at | Max speed after 5 s |
| --- | --- | --- |
| v1 cylinder | 1165 ticks | 1.70 u/s |
| 16 solver iterations | 919 | 1.48 |
| 4 internal PGS iterations | 404 | 0.58 |
| 0.01 u contact skin on the table | 169 | 0.00 (fixture), but the full drop scenario still crept |
| Convex-hull 64/256-gon prism | never | sticks sank 0.3 u: unusable in this release |
| Fixed trimesh, 128 sides, FIX_INTERNAL_EDGES | 118 | 0.00 |
| **Cylinder r=16.5 + flush 128-gon trimesh ring 16.5–18** | **121** | **0.00** |

The full trimesh fixed the creep but cost ~3.5× the physics step (drop
scenario step p50/p95: cylinder 1.37/1.72 ms, trimesh 3.55/6.83 ms; a ring
triangulation of the top barely helped at 3.78/6.22). Under the 3-room
workload it pushed the coordinator pass p95 to 27–38 ms, with 11 overload
events. The hybrid keeps the cheap cylinder where most sticks sit and uses the
mesh only at the rim: **1.48/3.06 ms**, and the drop scenario stabilises
(503 ticks; the cylinder never did).

Change: physics config **v2** is the hybrid table. The union of the two
colliders is exactly the visible regular 128-gon (WORLD-02), and the inner
seam is flush. Placement checks and the height flood use every table collider.
Works created under v1 keep the cylinder (the frozen config and the collider
inside their snapshot); there is no migration.

## M-006 · Capacity profile with the final production defaults (2026-10-05)

Same workload as M-004, on physics config v2, with production heap caps
(`node --max-old-space-size=64 --max-semi-space-size=2`; worker 48/8 MB) and
scrypt N=2^15 p=3. Raw output: `docs/evidence/capacity-local.json`.

| Metric | Result |
| --- | --- |
| Sticks at end (3 rooms) | 576 (some dropped sticks bounced off the table and were cleaned up) |
| Command ack p50 / p95 / max (mats, 450 placements) | 12.7 / 21.9 / 34.1 ms |
| Command ack p50 / p95 / max (drop, 150 placements, piles moving) | 15.0 / 39.9 / 72.6 ms |
| Visible to another session p50 / p95 / max (600) | 13.3 / 25.4 / 72.9 ms |
| Rejections | none |
| 9 concurrent logins during the drop | p50 662 ms, p95 1170 ms, 0 BUSY |
| All three rooms "Structure saved" after the drop | 11.3 s |
| Version save per room (3) | p95 14.1 ms |
| Coordinator pass p95 / max | mats 4.6 / 18.5 ms; drop 8.5 / 28.0 ms; settling 10.7 / 29.2 ms |
| Overload events (backlog dropped) | 0 |
| Main event-loop delay p99 | 11.0 ms |
| Peak RSS | 189 MiB mats (74%); **222 MiB during drop + logins (87%)**; 182 MiB settling |

The 80% headroom target holds in the steady state but not in the drop-plus-
login burst on this machine. Not adopted yet: tighter heap caps (risk of
worker heap OOM) or a lower scrypt cost. The deciding numbers are the ones from
the Fly machine itself, still to be measured.

## M-007 · Graphics quality and idle rendering, before/after (2026-10-06)

Problem: the viewport rendered every animation frame forever, even with a
still scene, and its only adaptation was a one-way downgrade (shadows off,
then pixel ratio 1) after a leaky count of intervals above 34 ms passed 90.
Change: LOOK-04 tiers with a reversible Auto controller, and OPS-05 idle and
hidden rendering. Baseline commit `3a4a700`, three 0.186.1.

Setup: development machine above; Playwright's headless Chromium with
SwiftShader (software WebGL, `--use-angle=swiftshader`), local server on a
disposable data directory. Scene: one exhibit (two pillars, a beam, a loose
stick; 4 sticks) and its source work, identical saved geometry and framing
before and after. Scratch scripts counted `requestAnimationFrame` callbacks
and WebGL `draw*` calls by wrapping them in an init script.

| Exhibit, 1280×800, DPR 1, Auto/High | Before | After |
| --- | --- | --- |
| 5 s idle after load: rAF callbacks / draw calls | 300 / 1500 | 0 / 0 |
| ~1.5 s orbit drag (60 pointer moves): frames, median / p95 interval | 203, 16.7 / 33.2 ms | 166, 16.7 / 16.7 ms |
| 5 s idle after the orbit: rAF callbacks / draw calls | 269 / 1345 | 0 / 0 |

Visual comparison, same browser, geometry, camera, viewport and DPR: the
High (and fresh Auto) exhibit at DPR 1 and DPR 2, and a workshop close-up with
a held ghost, its handles and outline, are **pixel-identical** to the baseline
across the whole 3D scene. The only differing pixels are the new Graphics
button in the toolbar. Before: `docs/evidence/p8-closeup-before.png`; after:
`p8-closeup-high.png`, `p8-closeup-medium.png`, `p8-closeup-low.png`,
`p8-side-high.png`, `p8-side-low.png`. The baseline console also showed
three's “PCFSoftShadowMap has been removed. Using PCFShadowMap instead”; the
code now names `PCFShadowMap`, which is what was rendered before.

Inspection: Medium's 1024² shadows are a little softer (the PCF radius is in
texels). Low has no real-time shadows, so the held ghost no longer casts its
footprint onto the table; the outline colour, status text (“Ready to place ·
drops … u”, “Intersecting”), handles, dashed drop guide, numeric readouts and
Top/Side views remain, and `tests/e2e/graphics.spec.ts` places a stick in Low
at the position the readouts gave.

What this does **not** show: anything about real GPUs, player-device frame
rates, battery use or a collapse under load. SwiftShader runs on the CPU; the
interval numbers above are headless behaviour, and the orbit difference is not
a performance claim. No hardware GPU was available. The Auto rule was
revised after this entry; see M-008.

Found on the way: `Workshop` called `webglAvailable()` in a non-lazy
`useState` argument, so every re-render created a throwaway WebGL context.
After about 16 clicks Chrome logged “Too many active WebGL contexts” and
evicted the scene's own context (blank view). Observed on the new build; the
calling code was unchanged since the baseline, which wasn't re-run for it.
The always-on loop would have redrawn after a restore; idle rendering didn't. Fixed (lazy initial
state, the probe releases its context, `webglcontextrestored` wakes the
view) and covered in `graphics.spec.ts`.

## M-008 · Auto recovery under ordinary use, and High parity re-check (2026-10-06)

Problem: M-007's Auto rule needed 15 s of good frames inside **one
uninterrupted** animated run (plus a 2 s rolling window). With idle rendering,
ordinary building produces short runs: an orbit and its damping (~2 s), a
ghost drag, a falling stick, and single frames for button presses. A scripted
session of that (`ordinaryCycle` in `tests/graphics-quality.test.ts`: per
14.3 s cycle, 4.4 s of measured animated time in five runs, pauses of
1.5–4 s), fed to the old controller at a steady 16.7 ms per frame starting
from Low, made **no tier change in 10 simulated minutes**. Recovery was
practically unreachable.

Change (`GRAPHICS.auto`, `src/client/scene/quality.ts`): the 2 s windows are
made of measured time and may span interactions; a pause over 10 s between
measured frames (`evidenceMaxGapMs`), a return to the tab or a tier change
discards all evidence; decisions happen only on measured frames; a good window
is p90 ≤ 20 ms and 15 s of consecutive good windows allow one tier up. The
fixed 60 s backoff after a reversed upgrade now doubles, and a view stops
upgrading after three reversed upgrades (`maxFailedUpgrades`). The deferred
upgrade's separate 2 s freshness rule is gone: deferred evidence is simply
used on the next measured, safe frame unless a gap has discarded it.

Result, same scripted session (injected time): Low → Medium at 58.4 s, Medium
→ High at 115.9 s. The same activity with pauses ×4 (over 10 s) gathers
nothing and stays at Low. A device smooth at Medium but slow at High, used
continuously for 30 simulated minutes, tries High exactly 3 times (backoff
≥60 s then ≥120 s) and stays at Medium: at most 8 tier changes in total. These
are unit tests in `tests/graphics-quality.test.ts`.

In a browser (`scripts/measure/graphics-auto.ts`; headless Chromium,
SwiftShader, 1280×800, DPR 1, empty work). For calibration, a 4 s orbit at DPR 1
gives a median interval of 16.7 ms (1% above 34 ms) unthrottled, and 83 ms
(96% above 34 ms) with `Emulation.setCPUThrottlingRate` 60. Run:

| Phase | Tier changes |
| --- | --- |
| Continuous orbit, CPU ×60 | High → Medium at 9 s, → Low at 13 s |
| Throttling removed (15 s); ordinary use: 1.2 s orbit, 2.5 s pause, Add + 3 steppers + Cancel, 1.5 s pause, a view button, 3 s pause | Low → Medium after 62 s, → High after 130 s (14 cycles) |
| Two more minutes of orbits with 3 s pauses | stayed High; 0 reversed upgrades |

The real-browser recovery times match the simulation. They are controller
behaviour under software rendering, not frame rates on any device; CPU
throttling stands in for a temporary slowdown.

Parity re-check (`/tmp` scratch script, same exhibit and browser as M-007):
starting the exhibit in Low or Medium and switching to High through the
control gives a scene **pixel-identical** to the original renderer at DPR 1 and
DPR 2 (shadow map recreated after Low, resized after Medium), with 2048²
shadows and `antialias: true` in the context attributes. On a 3× touch
screen, Low → High returns to the 1.5 cap (`graphics.spec.ts`, phone). With a
partner moving a ghost, twelve switches, a resize and a switch while hidden,
the viewer's frame back at High is byte-identical to its frame before
(`graphics.spec.ts`, "switching tiers while holding a stick…").
