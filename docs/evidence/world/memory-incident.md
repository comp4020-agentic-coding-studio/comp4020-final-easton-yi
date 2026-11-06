# World memory incident, 2026-11-03: cause, fix and measured validation

Recovery report for the WSL disconnection during the island/gallery upgrade
(primary brief [`docs/stillwood_immersive_island_gallery_upgrade_prompt.md`](../../stillwood_immersive_island_gallery_upgrade_prompt.md),
§10.1; memory directive [`docs/stillwood_memory_recovery_constraints.md`](../../stillwood_memory_recovery_constraints.md)). Raw supervisor
records and per-stage summaries live in [`memory/`](memory/). Every browser
run here was software-rendered headless Chromium. That is enough to show
memory behaviour in this environment. It says nothing about how a real GPU
device looks or how fast it renders.

## 1. What happened (confirmed from the kernel log)

| Item | Record |
| --- | --- |
| HEAD | `b13ecae` (the world work is uncommitted on top of it, preserved) |
| Failed command | `node /tmp/sw-scripts/fly.mjs`: a Playwright script that opened `/world/`, took control, held W for 3 s, then would have flown. Started 22:37:53 AEDT. Its last output was `keyboard.up: Target page, context or browser has been closed`, exit 137 |
| Stage | Browser runtime, i.e. domain 3 of the brief (renderer/GPU resource accumulation). The offline generator was not running |
| OOM | **Confirmed.** Kernel `Out of memory: Killed process 1271 (chrome-headless) … anon-rss:6784596kB` at 22:40:07, `CONSTRAINT_NONE`, `global_oom`, `Free swap = 0kB` of 4 GiB. Repeated at 22:43:19 and 22:47:45 for the same pid with an identical RSS (the process never actually exited); the boot ended 22:48:02 ([excerpt](memory/incident-kernel-2026-11-03.log)) |
| Processes | One browser instance: six consecutive `chrome-headless` pids 1230–1271. pid **1230** held 7.4 GiB anon (oom_score_adj 0) and pid **1271** held 6.6 GiB (adj 300). Every other process on the machine combined was under 0.5 GiB |
| Rendering backend | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`: software WebGL. The previous session recorded this, and every run below reconfirmed it |
| Capacity | WSL `MemTotal` 15.3 GiB (of a ~30 GB host), 4 GiB swap, 24 cores. `.wslconfig` not inspected. Windows host memory and Task Manager not checked; that's outside this environment |

Role attribution for the incident pids is **inferred**: Chrome sets
`oom_score_adj` 300 on renderers, and 0 on the main browser process. The
reproductions below show the same two-process pattern, with each process
measured by its real role.

## 2. Cause

**Unpaced continuous rendering.** While the user is exploring, the world's
`requestAnimationFrame` loop submitted a new frame every tick. A single frame
at High (about 1.3 M triangles plus a 2048² shadow pass) takes software GL
about a second. Each tick queued another frame of GPU work behind the ones
still running, and Chromium buffered that backlog without any limit.

| Run (same route, 1280×720, High, home → exploring) | Peak task group | Result |
| --- | ---: | --- |
| Old runtime, stage B (`before-B`) | 3,722 MiB in 24 s | stopped by the supervisor |
| Old runtime, stage B with role labels (`before-B2`) | 2,552 MiB in 40 s | stopped; **renderer** 351 → 2,083 MiB, GPU process flat at 286, Node flat at 291 |
| Exploring, stats probe only (`probe-heap`) | 2,082 MiB | kernel ceiling hit inside the scope (`CONSTRAINT_MEMCG`); V8 heap stayed 14–16 MiB, three.js geometries 78 and textures 4 throughout |
| Same at Low, no shadow map (`probe-heap-low`) | 1,634 MiB | renderer grew ~750 MiB, then levelled near 970 MiB |
| Same at High **with a WebGL2 fence**: at most one unfinished frame (`probe-fence`) | **804 MiB** | renderer **flat at ~456 MiB** over 37 real frames; page stays responsive |

The fence experiment is the deciding evidence. Same scene, same quality, same
browser; the only change is never submitting a frame while the previous one is
unfinished. Memory goes from unbounded growth to flat. Before the fix, growth
ran at about 50 MiB per submitted frame. That is close to one frame's render
targets (MSAA colour and depth at this size plus a 2048² shadow map, about
49 MiB), but **which Chromium-internal buffer actually holds the backlog was
not identified**. The figure is a correlation, not a measurement.

The old runtime had **three secondary problems**. None of them caused this
growth, but all are fixed:

- landmark detail stayed resident forever (`evict()` was only called on
  dispose);
- moving a cell between levels rebuilt and re-uploaded its instance buffers;
- the unit tests ran one worker per core (about 23 here), and every world
  suite built all 20 landmarks in its own worker.

The generator was audited and measured. It **was not** a cause: one landmark
at a time, its heaviest child process peaked at 376 MiB.

## 3. Changes

| Area | Change | Where |
| --- | --- | --- |
| Frame pacing | A WebGL2 fence allows at most one in-flight frame. While it is pending, input and physics keep advancing but nothing new is submitted. A fence stuck for 1 s is dropped so the view can't freeze. Auto quality measures the time between frames actually submitted | `src/client/world/WorldView.ts` (`gpuReady`, `fenceFrame`, `tick`) |
| Asset split | Each landmark now has a **far** file (`Lxx.far.<hash>.bin`, SWLF v1): its strongest 6,000 merged chains, about 1 MB for all 20, resident for the session. The **detail** file (per-piece SWLM v2, unchanged) is fetched only at the near level | `src/world/format.ts`, `src/world/manifest.ts`, `src/server/main.ts` (allowed path) |
| Detail residency | LRU capped by count (`detailMax` 3/2/2 for High/Medium/Low) and by bytes (`detailBytes` 96/64/40 MiB). A landmark becomes evictable once it has gone unused for 20 s, or immediately if the cache is over budget; the near landmark is never evicted. Eviction frees GPU buffers and CPU arrays alike; shared base geometry and materials stay with the view | `WorldView.ts` (`evictDetail`, `dropDetail`, `freeCell`), `quality-world.ts` |
| Loads | Far files load two at a time, nearest first. Detail loads **one at a time**, with eviction before the next load starts. A detail request is cancelled if its landmark drops below mid. Stale results are dropped on the main thread and in the worker, and the worker's cancel set only tracks requests still in flight | `WorldView.ts` (`updateStreaming`), `worker.ts` |
| Decode | The detail file is decoded straight into per-cell arrays in two passes. The whole-building world-space copy is gone, and the fetched bytes are released after decoding. Results are transferred to the main thread, not cloned | `src/client/world/decode.ts` (`detailToCells`, `farToChains`) |
| Cell meshes | Built once while a landmark's detail is resident. Changing level only changes `instanceCount` and visibility | `WorldView.ts` (`setCellLevel`) |
| LOD metric | Distance to the landmark's yawed bounds instead of a sphere around its centre. Before, L13's 320 m glasshouse was "mid" at its own ground viewpoint | `WorldView.ts` (`boundsDistance`) |
| Generator | The coordinator never builds geometry. Each landmark is built in its own short-lived child process (`spawnSync`, sequential), with a checkpoint keyed by landmark, recipe version, generator version and output hashes. Outputs use temp file + rename; the manifest is written last; compression runs one file at a time and is skipped when unchanged. New flags: `--only`, `--fresh`, `--plan`, `--validate`, `--publish`, `--child-heap-mib` | `scripts/world/build-world.ts`, `scripts/world/build-landmark.ts` |
| Cache location | Generated files and checkpoints move to `.world-cache/` (git- and docker-ignored), because `vite build` empties `dist/client`. `pnpm build` publishes to `dist/client/world-data` | `package.json`, `.gitignore`, `.dockerignore` |
| Supervisor | Each heavy job runs in its own `systemd-run --user --scope` with `MemoryMax` and `MemorySwapMax=0`, i.e. a kernel-enforced ceiling on the job's whole process tree. The supervisor samples cgroup `memory.current`/`memory.peak`, per-role RSS, `MemAvailable` and swap traffic (250 ms at first, then 1 s). It sends SIGTERM at 90 % of the budget, below the reserve, after 5 s of swapping, or on timeout, then SIGKILLs the group after a grace period. It reports kernel memcg kills. It refuses a budget above `min(8 GiB, ½ MemTotal, ½ MemAvailable)` and won't start if the reserve can't be met | `scripts/world/supervise.ts` |
| Browser stages | One browser, one context, one page, samples every second, cleanup in `finally`, and the server runs inside the same supervised group | `scripts/world/tour.ts` |
| Unit tests | `pool: "forks", maxWorkers: 2` | `vitest.unit.config.ts` |
| Tests | Far-file prefix and cap, detail-to-cells (every piece exactly once, tier order, cell bounds), residency budget against the heaviest building, generator checkpoint reuse, corruption → rebuild only that landmark (byte-identical), temp-file cleanup, manifest withheld on missing outputs | `tests/world-memory.test.ts` |

What did **not** change: all 20 recipes, every piece count (1,186,322 in
total), collision (manifest colliders, which never depend on visual detail),
the detail LOD tiers, the cell levels, portals, existing pages, buttons,
permissions and workshop physics.

## 4. Budget used

Every heavy job below ran on its own, in sequence, never overlapping:

| Domain | Rule |
| --- | --- |
| Task group (supervised scope) | Budgets of 2–4 GiB per stage, all below `min(8 GiB, ½ MemTotal, ½ MemAvailable)` ≈ 6.1 GiB; stop at 90 % |
| Reserve | `max(2 GiB, 0.15 × MemTotal)` = 2.3 GiB `MemAvailable` |
| Swap | `MemorySwapMax=0` for the scope; a stage fails after 5 s of swap traffic |
| Generator | One landmark child at a time, `--max-old-space-size=2048` per child (V8 only, a guard). RSS is supervised separately |
| Browser | One instance, one page, one Playwright worker |

The task group is measured as the cgroup's `memory.current`, which counts
shared pages once. The "RSS sum" column adds up each process's RSS, so it
double-counts shared pages; it's included only to show which processes the
memory belongs to.

## 5. Validation ladder (all at 1280×720, High, SwiftShader, Chromium headless shell 153)

| Stage | Command | Peak group | Min MemAvailable | Swap in/out | Result |
| --- | --- | ---: | ---: | --- | --- |
| Generator: plan | `build-world.ts --plan` | n/a (<0.25 s) | 12.3 GiB | 0/0 | reads checkpoints only |
| Generator: L14 (smallest) | `build-landmark.ts L14` | (child RSS 118 MiB) | 12.4 GiB | 0/0 | ok, 0.2 s |
| Generator: L06 (heaviest, 170,092 pieces) | `build-landmark.ts L06` | 263 MiB | 12.1 GiB | 0/0 | ok, 0.6 s |
| Generator: all 20 | `build-world.ts` | 419 MiB | 11.9 GiB | 0/0 | all valid, 28.2 s, 2.36 MB brotli |
| Cancel mid-run | SIGTERM during L06 | n/a | n/a | n/a | no temp files left, manifest unchanged, 20/20 checkpoints valid |
| Corrupt + resume | truncate L16 → `build-world.ts` | 284 MiB | 12.1 GiB | 0/0 | only L16 rebuilt (4.4 s), same totals |
| Build | `pnpm build` | 790 MiB | 11.6 GiB | 0/0 | ok, all 20 reused |
| B: home → L01 near → home → leave | `tour.ts --stage B` | **684 MiB** (old: >3,722, stopped) | 11.5 GiB | 0/0 | 20 far files resident, L01 detail 0.7 MB / 12 cells; leaving drops the group to 406 MiB |
| C: 6 × near/mid/far around L01 | `--stage C` | 725 MiB | 11.6 GiB | 0/0 | flat (~640, then ~500 MiB); 1 detail load, 0 rebuilds, cell meshes constant at 12 |
| D: 7 landmarks in route order | `--stage D` | 713 MiB | 11.7 GiB | 0/0 | 7 loads, 5 evictions, ≤ 3 resident (≤ 7.1 MB) |
| E: 10 world ↔ workbench round trips | `--stage E` | 787 MiB | 11.6 GiB | 0/0 | all completed, no page errors; **drift** (see §6) |
| E20: 20 round trips | `--stage E --trips 20` | 844 MiB | 11.6 GiB | 0/0 | drift slows: +115 MiB over trips 1–10, +55 MiB over 11–20 |
| F + G: all 20 near, twice | `--stage FG` | **737 MiB** | 12.7 GiB | 0/0 | 40/40 near steps ok; 42 loads, 39 evictions, ≤ 3 resident; home after pass 1 569 MiB, after pass 2 553 MiB |
| Unit + world tests | `vitest -c vitest.unit.config.ts` | 1,029 MiB | 12.3 GiB | 0/0 | 212/212 (and 9/9 new) |
| E2E, 1 worker | `playwright test --workers=1` | 1,692 MiB | 11.9 GiB | 0/0 | 28 passed, 1 failed: `crit9-reconnect` F3, the **same assertion as the pre-change baseline** (28/1) |
| Course checks | `pnpm check` (typecheck + spec), `pnpm check:evidence` | 1,064 MiB | 12.6 GiB | 0/0 | 53/53 spec; evidence ok |

An earlier F/G run, before the bounds-distance fix, stayed under 663 MiB but
never reached near detail at L13. That run is kept as the reason for the LOD
metric change. The table shows the rerun.

## 6. Remaining unknowns and limits

- **World/workbench drift** and the **DOM node per remount**: resolved, see §8.
  The "engine warm-up" reading below was wrong. Both were two closed
  renderers pinned by three.js listeners.
- **GPU-process creep.** Investigated in §9: it is reproducible, it has not plateaued after 30 cycles, and it follows
  near-detail visits (about +1.6 MiB per visit cycle), not context churn or the world itself. Its mechanism inside the
  GPU process is not established. SwiftShader's GPU process is not a real driver's, so this may not transfer.
- **Triangles**: see [`triangles.md`](triangles.md).
- **Real GPU, frame rate and Windows-side memory** were not measured. The
  fence costs nothing on a GPU that keeps up; it was only exercised here on
  software rendering.
- The incident pids' process roles are inferred (see §1).

## 7. Commands

```bash
# generator: resume from checkpoints (rebuilds only stale/corrupt landmarks), publish, write evidence
pnpm build:world
node scripts/world/build-world.ts --plan            # what would be built or reused, no geometry
node scripts/world/build-world.ts --validate        # checkpoints vs output hashes
node scripts/world/build-world.ts --only L06        # one landmark (the manifest needs all 20 valid)

# a browser stage, supervised (server + browser + driver in one capped scope); build first
node scripts/world/supervise.ts --stage tour-B --budget-mib 2560 --log /tmp/sw/B.jsonl -- \
  node scripts/world/tour.ts --stage B --label B --out /tmp/sw
```

## 8. Round trips: the extra DOM node and the drift (2026-11-04)

Both had the same shape: a closed renderer stayed reachable through a three.js listener that our dispose code didn't
know about. The drift in §6 was this, not engine warm-up.

| Leak | How found | Retaining path | Fix |
| --- | --- | --- | --- |
| World: +1 DOM node per remount | CDP `Nodes` 58 → 65 over 7 remounts. A heap snapshot's retainers for the extra `<canvas data-engine="three.js r186">` | canvas ← its `WebGL2RenderingContext` ← closure of the renderer's `WebGLTextures` ← dispose listener on the **module-level `DFG_LUT` texture** (`getDFGLUT()` is a singleton shared by every renderer, and each renderer adds a listener and never removes it) | `src/client/scene/release-shared.ts`: before disposing, find the renderer-shared textures the scene's materials use (`sharedTexturesOf`). After `renderer.dispose()`, dispose them (`releaseShared`), which fires and clears those listeners. three re-creates the texture on next use. Used by the world, the workshop viewport and the inspector. |
| Workbench: 454 → 898 nodes over remounts | Heap snapshot: 439 detached elements; dispatchers still holding listeners | **OrbitControls** adds a capture `keydown`/`keyup` listener on `domElement.getRootNode()`. When React has already detached the canvas's subtree, `disconnect()` asks the detached subtree for its root node and removes the listener from the wrong node, so the document keeps it, and with it the controls, camera and canvas | Record the root node at construction (`controlsRoot`) and remove both intercept listeners from it, with `capture: true`, before `controls.dispose()` (`viewport.ts`, `InspectView.ts`). |
| InstancedMesh dispose listener | Dispatcher list after unmount | `WebGLObjects` adds an `onInstancedMeshDispose` listener to each InstancedMesh | `WorldView.dispose()` calls `dispose()` on each InstancedMesh in its scene traverse. |

After the fixes:

- **World remounts:** CDP `Nodes` held at 54 → 54 across remounts.
- **Workbench:** 20 workbench remounts held at 125 nodes, and `Nodes` stayed 169 → 169 with 1 dispatcher left (the
  page's own).
- **Round trips** ([`memory/after-E20c.summary.json`](memory/after-E20c.summary.json); 20 world/workbench round trips,
  1280×720, High; a bounded continuation with its length set in advance):

| Trip | 1 | 3 | 5 | 10 | 15 | 20 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Task group (MiB) | 697 | 726 | 741 | 759 | 712 | 734 |
| Renderer process (MiB) | 372 | 400 | 408 | 414 | 401 | 412 |
| GPU process (MiB) | 293 | 293 | 299 | 310 | 317 | 327 |

The renderer process plateaus from trip 3 (400–419 MiB over trips 3–20, no trend), and the group stays within
696–759 MiB. The GPU process is the remaining creep (§6). Supervisor peak: 796 MiB.

**Context loss and restore.** [`memory/after-ctx.summary.json`](memory/after-ctx.summary.json) covers three cycles of
`WEBGL_lose_context` loss and restore while exploring at 1280×720, High. In each cycle:

- frames stopped while the context was lost, and the frame fence was dropped;
- the notice showed, and the Resume button was present after restore;
- rendering resumed, and a walk input moved the explorer 15.3–15.4 m;
- `contextRestores` counted 1, 2, 3, and the group returned to its earlier level (510–596 MiB).

Frame pacing is unchanged: the fence in `WorldView.tick` stays.

## 9. The GPU process under repeated scene switching (2026-11-04)

§8 left the GPU process rising about 1.8 MiB per world/workbench round trip while the renderer process stayed flat.
This section measures it separately, with a bounded, repeatable stage and two controls.

**Protocol** (`tour.ts --stage gpu`, under the supervisor, 1280 × 720, High, SwiftShader). Each cycle mounts the world
by SPA navigation from `/login/`, starts exploring, jumps to L03 and then L09 at their near level (their detail is
uploaded; L03 is then left behind), returns home, and leaves for `/login/`, a page with no WebGL. The checkpoint is
taken 8 s later, so every checkpoint is in the same state: no live WebGL context. The driver reads each browser
process's RSS, PSS and private memory from `/proc` at the checkpoint; the supervisor samples every process of the
job each second. After the last cycle: close the page, then the browser context, each with its own checkpoint.

**Results** (GPU process; private = Private_Clean + Private_Dirty, the part no other process shares):

| Run | Before the world | After cycle 1 | 10 | 20 | 30 | Per cycle, 10→30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [A: L03 + L09 each cycle](memory/gpu30a.summary.json) (RSS, supervisor) | 148 | 286 | 307 | 324 | 342 | +1.75 MiB |
| [B: repeat of A](memory/gpu30b.summary.json) (private, driver) | 82 | 230 | 245 | 264 | 277 | +1.6 MiB |
| [Control: bare WebGL2 contexts](memory/gpuctl.summary.json) (private) | 82 | 91 | 92 | 92 | 92 | 0 |
| [World, no landmark visits](memory/gpuhome.summary.json) (private, 20 cycles) | 84 | 206 | 164 | 135 | – | none (falls) |

- **Repeatable.** A and B agree within 0.15 MiB per cycle, and neither levels off over 30 cycles.
- **Not context churn.** Thirty contexts of the world stage's size, each drawing for 2 s and then lost and removed,
  leave the GPU process flat after the first (+9 MiB once). So the growth is not the browser's per-context cost.
- **Not the world as such.** Mounting the island and staying at home (terrain, far meshes, shells, shadows, grass;
  no landmark detail) shows no sustained growth over 20 cycles: private memory moves between 135 and 211 MiB and
  ends lower than after the first cycle.
- **It follows the near-detail visits.** The difference between the runs is the per-cycle upload and release of two
  landmarks' detail: several hundred instanced buffers, about 4.5 MB of arrays. The page side frees them (three.js
  resource counts and the renderer process are flat; `freeCell` deletes each buffer), so the retention is inside the
  GPU process. Which part of it (ANGLE/SwiftShader buffer allocation, its command buffers) is **not established**, and
  nothing here shows it to be harmless or bounded.
- **The renderer process** stays flat in all runs (about 180–245 MiB RSS at the checkpoints, with V8 collections).
- **Whole job.** The supervised group stayed within 455–592 MiB at the cycle checkpoints and peaked at 662 MiB (A)
  and 655 MiB (B); no cgroup memory events, no swap.
- **Cleanup.** Closing the browser context in B released about 100 MiB of the GPU process's private memory (277 →
  180 MiB) but not back to its 82 MiB baseline; that reading was taken without its hold (a bug in the stage, fixed
  before the control runs). With the hold, the home-only run's GPU process returned to 98 MiB (baseline 84) and the
  control's to 88 (baseline 82).

**What it would take to close it.** Either a real-GPU run of the same stage (if the growth is SwiftShader's allocator
it should not appear), or a design that reuses detail buffers across visits instead of freeing and re-creating them,
measured with the same stage. Neither was done here.

**A gap in the supervisor, found and fixed while doing this.** Chromium asks systemd for a scope of its own for its
browser process (`app-org.chromium.Chromium-<pid>.scope`) when a session bus is available. That process, about
96 MiB, was outside the job's cgroup: outside `MemoryMax` and outside the group figure in every supervised browser
run before this point (§5–§8). Its children (GPU, renderer, utility) stayed inside. `supervise.ts` now finds the
job's descendants by parent pid on each sample, moves any that left the scope back into it, logs each one, and counts
any it cannot move. Verified: [`memory/escape.supervisor.jsonl`](memory/escape.supervisor.jsonl) logs the browser
process moved back (`escaped: 2, escapedUnmoved: 0`) and the browser process in the job's figures. Earlier group
figures in this report therefore understate the browser tree by about 96 MiB.

Commands:

```bash
node scripts/world/supervise.ts --stage gpu --budget-mib 3072 --log /tmp/sw/gpu.jsonl -- \
  node scripts/world/tour.ts --stage gpu --label gpu --cycles 30 --pair L03,L09 --out /tmp/sw
# controls: --pair none (world, no visits); --stage gpu-control (bare WebGL2 contexts)
```

## 10. Final regression run (2026-11-04)

One job at a time under `supervise.ts`, with the escape fix above (the browser process counted), against the current
build. End records: [`memory/final/`](memory/final/).

| Job | Peak group | Swap | Result |
| --- | ---: | --- | --- |
| `tsc --noEmit` | 700 MiB | 0/0 | clean |
| `vitest -c vitest.unit.config.ts` | 1,274 MiB | 0/0 | 376/376 (17 files) |
| `pnpm check:evidence` | 82 MiB | 0/0 | ok, 12 cited commits |
| `pnpm check` (typecheck + spec, local production server) | 1,049 MiB | 0/0 | 53/53 |
| integration (`vitest -c vitest.integration.config.ts`) | 352 MiB | 0/0 | 13/13 |
| `playwright test --workers=1` | 1,597 MiB | 0/0 | 44 passed, **1 failed**: `crit9-reconnect` F3, the same assertion as before this work; 14 escaped Chromium processes moved back, 0 unmoved |

The largest single process at the e2e peak was the GPU process (706 MiB RSS).

After the shadow-culling fix ([triangles.md](triangles.md), a client renderer change), the affected jobs ran again:

| Job | Peak group | Swap | Result |
| --- | ---: | --- | --- |
| `tsc --noEmit` | 843 MiB | 0/0 | clean |
| `vitest -c vitest.unit.config.ts` | 1,299 MiB | 0/0 | 379/379 (18 files, with `world-shadow-cull.test.ts`) |
| `playwright test` (the three island specs) | 1,112 MiB | 0/0 | 16/16 |
| `pnpm check`, `pnpm check:evidence` | 1,051 MiB | 0/0 | 53/53; ok |
