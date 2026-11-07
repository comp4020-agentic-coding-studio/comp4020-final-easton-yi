# Stillwood — WSL Memory Recovery and Bounded-Memory World Generation

> **Repository note (2026-11-04).** This override applies on top of the primary brief, [`docs/08-world-build/08-01-world-build-prompt.md`](08-01-world-build-prompt.md) (whose §10.1 summarises it); it replaces none of the brief's requirements. Its outcome is recorded in [`evidence/world/memory-incident.md`](08-04-memory-report.md).

## Immediate implementation override for the active coding agent

Date: 2026-11-03 (Australia/Sydney). Apply this to the existing Stillwood island/gallery upgrade without restarting the feature implementation from scratch.

**Incident:** the user reports that memory filled during the unfinished implementation on a machine with approximately 30 GB RAM, followed by unexpected WSL/VS Code disconnection. Treat this as a resource-exhaustion incident. Confirm the failing process/stage and any OOM evidence; the screenshot alone does not prove that the Linux OOM killer terminated WSL.

**Immediate priority:** preserve progress, diagnose with bounded resource use, refactor the memory-heavy path, and only then resume full generation/testing. This override takes precedence over the original instruction to keep advancing all implementation phases. Preserve all existing application features and the final goal of 20 distinct detailed landmarks.

## 1. Stop amplification and preserve work

- Do not immediately repeat the failed full command, regenerate the entire island or relaunch every test.
- Inspect current worktree changes, generated files, checkpoints and existing job processes. Preserve uncommitted edits and valid outputs. Do not reset/clean the repository or delete source/assets as a recovery shortcut.
- Stop launching additional expensive jobs. Identify any surviving task-owned generators, test runners, browsers or dev servers. Gracefully stop only redundant task-owned processes after recording progress; do not use broad `pkill node`, `killall python`, or terminate unrelated research jobs.
- Run at most **one memory-heavy job at a time** initially. Do not overlap world generation, bundling, type checking, texture compression, browser screenshots and end-to-end tests. Do not delegate parallel heavy work to other agents.
- Keep only the necessary dev server. Browser validation may require its server; budget them as one job group. Preserve independent identities in collaboration tests even when running one test worker.

Start with read-only checks in the user's WSL environment, not a remote sandbox and not production:

```bash
git status --short
git diff --stat
free -h
df -h /
ps -eo pid,ppid,comm,rss,pcpu --sort=-rss | head -n 20
```

If available, inspect recent kernel/system logs for `out of memory`, `oom-kill` and `killed process`, and inspect VS Code's WSL log. Record whether logs cover the failure or only the restarted session. No matching entry after a restart does not rule out earlier exhaustion. Check Windows Task Manager for host memory and native browser consumption, and inspect the actual WSL memory/swap limits before making assumptions. Approximately 30 GB host RAM does not imply 30 GB is available inside WSL or to this job.

Record: current HEAD, preserved changes, failed command if known, stage, timestamp, process names, host/WSL capacity, swap activity and whether OOM is confirmed, suspected or unknown. Avoid collecting secrets from process arguments or environment variables.

## 2. Identify which memory domain failed

Separate these cases before changing code:

1. Offline generator, geometry expansion, GLB export or compression.
2. Node bundler/type checker/test runner, especially many workers or large static imports.
3. Browser renderer/GPU resource accumulation during navigation.
4. Concurrent browser/test/agent processes or abandoned servers.
5. Host-level pressure, WSL limits, swapping, filesystem cache or another application.

The earlier `component_lab/build_lab.py` contains a **confirmed implementation pattern to audit, not a confirmed cause of this incident**: it constructs one `trimesh` object per stick, collects those meshes and concatenates them for GLB export. It also constructs its seven sample scenes in a list before export. This was an offline component experiment, not a production generator validated for hundreds of thousands of pieces. If that pattern was copied into the 20-building implementation, replace it rather than increasing its heap allowance.

Check for `Promise.all` over every building/LOD, eager arrays of all scenes, per-piece Mesh/geometry/material objects, `trimesh.util.concatenate`, repeated `JSON.stringify`/`JSON.parse`, large object spreads/clones, full-array logging, nested compression workers and all-LOD generation from a retained high-detail mesh.

Do not diagnose a leak solely from a high memory reading. Distinguish live retained allocations, transient export copies, native buffers, browser/GPU allocations, cache and allocator retention.

## 3. Set an explicit local execution budget

Use the following conservative starting configuration, then report measured changes. These are operational targets, not claims about current usage and not browser GPU budgets.

| Domain | Initial rule |
| --- | --- |
| Heavy task concurrency | 1 total across generation/build/test/screenshot jobs |
| Landmark generation | 1 landmark, 1 LOD job at a time; split further if necessary |
| Initial generator RSS target | ≤2 GiB per worker |
| Initial generator safety ceiling | ≤4 GiB, and never above the enclosing job budget |
| Aggregate task-group budget | `min(8 GiB, 0.50 × WSL MemTotal, 0.50 × baseline MemAvailable)` |
| WSL free-memory reserve | Stop launching work and gracefully abort the task if MemAvailable falls below `max(2 GiB, 0.15 × WSL MemTotal)` |
| Browser testing | 1 test worker; no parallel screenshot projects; close contexts/pages after each case |
| Telemetry | Approximately every 1 second, with per-stage start/end records |

The task-group budget includes coordinator, child workers, compression processes, necessary dev server and task-owned browsers running in WSL. Summed RSS is a conservative process-tree indicator and can double-count shared pages; report this limitation and use cgroup/PSS accounting when available. Track Windows-native browser/other host usage separately. Do not interpret one worker's heap as total job usage.

Implement a supervising process with a small memory footprint. Track the complete task process group, including children. On a budget violation, request graceful cancellation and flush completed chunk checkpoints; if it fails to stop within a short grace period, terminate only that task group. Exit nonzero with a clear stage/landmark/LOD/checkpoint message. Do not change the configured budget automatically or continue to the next landmark after a pressure failure.

Monitor swap-in/out and stalled progress as well as MemAvailable. A job that avoids OOM by continuously thrashing swap has not passed. If the actual machine is too pressured to run even the smallest test, leave the job paused and report the measured competing use.

For Node, log `process.memoryUsage()` fields `rss`, `heapUsed`, `heapTotal`, `external`, `arrayBuffers`, plus a high-water measurement where available. `arrayBuffers` is included within `external`; do not sum these as independent totals, and do not add them to RSS. `--max-old-space-size` limits V8 old-space, **not** all RSS, native geometry, ArrayBuffers, worker processes, browser/GPU allocations or WSL. Avoid setting a global 16–24 GB heap as the fix. A per-command 2–3 GiB old-space limit can be an initial guard if compatible with the measured task, but must be combined with process-group telemetry.

Do not take a heap snapshot at the point of exhaustion: snapshot creation can itself require substantial memory and disk. Use counters first, then profile a small reproduction with ample headroom if needed.

## 4. Refactor generation to bounded memory

### 4.1 Stream components, not the whole island

- Replace eager `scenes = [buildAll...]` with a queue of lightweight recipe identifiers. Instantiate only the current task.
- Represent repeated sticks as shared unit-box geometry plus compact instance transforms, type/material indices and stable IDs. Do not construct a heavyweight mesh/material/scene node for each stick.
- Use Float32/appropriate integer arrays for generated runtime data where accuracy permits. A 4×4 Float32 matrix is 64 bytes; 1 million matrices alone are about 64 MB, not the total cost of nested objects, cloned meshes, serialization and temporary copies.
- Generate parts as an iterator or into a reusable bounded buffer. Start around 10,000–25,000 instances per chunk, but enforce an actual byte budget and tune from measurements. Piece count alone is insufficient because formats differ.
- Write chunks progressively and obey stream backpressure. Do not queue all writes/compressions at once. Preserve actual per-course identity and counts.
- Calculate bounds and BOM incrementally. Use spatially/locality-partitioned duplicate checks with deterministic shared-edge ownership; avoid one enormous global hash set of full transform strings when a bounded representation suffices.
- Keep only small summaries in memory. Log counts, bytes and IDs, never the complete pieces array.

Target memory growth should be bounded by the active chunk/task, not the total number of completed buildings.

### 4.2 Export without multiplying geometry copies

The preferred production asset is shared geometry plus compact per-chunk instance data and a small manifest, compatible with the project's renderer. A merged GLB for every high-detail building is not mandatory if another supported representation preserves all geometry and appearance.

If GLB/export review files are required, export bounded chunks or use supported instancing with an explicitly tested loader. Do not collect thousands of individual mesh objects and then concatenate them into another equally large vertex buffer. Do not simultaneously retain source objects, expanded mesh, merged mesh, uncompressed export and compressed export. Verify temporary-copy peak memory, not merely final file size.

Generate medium/far LOD directly from the recipe where possible; do not require all near geometry resident to derive every LOD. Keep full-detail content on disk and load it locally on demand. A simplified LOD must retain building identity, passages and silhouettes.

Generate collision from semantic walls, floors, piers and route masks. Never construct a BVH or one rigid body over every decorative stick simply because the render data exists.

### 4.3 Isolate and release heavy stages

Prefer a short-lived child process per landmark/LOD/chunk export, with the parent retaining only progress and summaries. Process exit gives a clear lifetime boundary for native arrays and geometry caches. Confirm that the queue does not start the next job before the prior one exits.

Within workers, release references promptly, dispose renderer resources where applicable and stream results to disk. Calling GC repeatedly is not a substitute for removing retained references or giant intermediates. Do not use process isolation to conceal an unbounded single-building peak; split that building further if it exceeds budget.

Use one compression/texture worker initially and bound image resolution. Do not decode every texture, expand every geometry and compress every output concurrently.

## 5. Checkpoints and safe resume

Implement or adapt a checkpoint manifest keyed by landmark, recipe version/hash, generator version, LOD, chunk and required dependencies. Include counts, bounds, output byte size and content hash. Mark ready only after successful validation.

Write output to temporary files and atomically rename completed files on the same filesystem. Update checkpoints after successful writes. Leave incomplete outputs distinguishable; do not overwrite the last known-good asset manifest with a half-finished build.

On resume, validate cached outputs against their keys/hashes and regenerate only incomplete, corrupt or stale units. Do not rebuild all 20 because one landmark failed. Deliberately test cancellation between chunks and verify that resume does not duplicate pieces or silently accept partial files.

Useful command capabilities, mapped to actual repository conventions, are:

- Select one building and one LOD.
- Set concurrency to 1 and the chunk byte budget explicitly.
- Resume from a checkpoint.
- Inspect planned counts/cost without expanding all geometry.
- Validate metadata separately from rendering.

Do not claim these flags already exist; implement or document their actual equivalents.

## 6. Bound development and test processes

- Do not import all large instance JSON/binary content into source modules and let bundler/type-checker/watchers duplicate it. Keep generated assets in versioned same-origin static files and fetch only required chunks at runtime.
- Do not run full asset generation on every HMR event, module import, test setup or page navigation. Cache by recipe/version and make generation an explicit operation.
- Exclude generated outputs from recursive regeneration/watch loops using repository-specific configuration. Do not globally disable useful source watching.
- Run type check, production build, generation and browser tests sequentially. Inspect each tool's worker settings; a one-worker test runner does not automatically limit a compression library or subprocess pool.
- For Playwright, start with `pnpm exec playwright test <relevant-test> --workers=1` if the repository uses Playwright and pnpm. Choose an existing relevant test, do not paste a nonexistent placeholder path. Run browser projects sequentially. Preserve two isolated identities/contexts when testing collaboration.
- Reuse one browser where valid and close each context/page in `finally`. Do not accumulate 20 active landmark pages. Capture screenshots sequentially and release full-resolution buffers rather than storing them all in arrays.
- Read logs/artifacts by bounded windows; do not repeatedly ingest enormous generated JSON files or screenshots into agent context.

## 7. Browser runtime memory must also be bounded

Fix the development peak and runtime residency separately. Retain low-detail silhouettes of all 20 landmarks, but load high detail only around the player. Use a byte-budgeted LRU cache with explicit load/unload hysteresis and cancellation.

At initial tuning, permit one heavyweight decode/upload at a time. Avoid keeping fetch bytes, decoded JSON object trees, Float32 instance buffers and merged geometry all resident indefinitely. Transfer worker buffers instead of cloning when ownership allows; keep only the minimum reload/recovery representation and refetch evicted assets when appropriate.

Dispose nonshared geometries, materials, textures, render targets and temporary data. Use explicit ownership/ref-counting for shared resources so one scene cannot dispose another scene's materials. Remove scene references, event handlers, RAF callbacks and stale promises. Ensure completed asynchronous loads cannot resurrect disposed scenes.

Audit CPU geometry and collision memory separately from GPU textures. `renderer.info` object counts are useful but do not provide exact total GPU memory. Use browser/platform measurements where available and label estimates. The original 64–192 MB texture targets are not a cap on browser/process memory.

Run the same deterministic traversal twice and 10 world/workbench round trips. Expect a documented warm-up/cache plateau, not necessarily a return to the exact initial OS RSS. Look for repeated sustained growth and lingering resources. Do not claim a memory leak is fixed solely because one screenshot succeeded.

## 8. Validation ladder: earn the full run

Do not reproduce the crash on the full island as the first experiment.

1. Inspect code/data sizes and identify the suspected allocation/concurrency path without expanding geometry.
2. Run one small component/chunk under telemetry; preserve its output and baseline.
3. Run one simple building/LOD, then the expected heaviest building, separately. Include export and compression peaks.
4. Exercise explicit cancellation/resume and one repeated build with cache reuse.
5. Only after those pass, generate all 20 sequentially, resuming completed outputs, under the supervisor.
6. Test one browser scene and affected existing workflows with one worker; then perform the fixed traversal and repeated scene switches.
7. Run the required repository checks sequentially after the focused work passes. Do not remove fixed course checks, weaken assertions or omit independent user identities.

For every stage report: actual command, HEAD, building/LOD, instance count, peak worker RSS, peak task-group usage, minimum MemAvailable, swap behavior, elapsed time, output bytes, checkpoint result and exit status. Distinguish single-process high-water values from aggregate measured peaks. If an unsafe old version cannot be rerun, use available evidence and label its peak unknown rather than fabricating a before figure.

Success requires that all 20 can be completed under the agreed budget without WSL disconnection, emergency OOM or prolonged swap thrashing; retry/resume works; runtime reaches a bounded plateau; architectural detail, navigation and existing business features remain intact. If the user's environment is unavailable, provide tested code and instructions but explicitly leave user-machine completion unverified.

## 9. WSL settings are a secondary guard, not the implementation fix

Inspect actual physical RAM, Windows free memory, current `.wslconfig`, WSL version and Linux limits first. Leave adequate RAM for Windows, VS Code and host browsers. A WSL memory cap protects the host but may cause Linux to hit its own limit earlier; it does not repair an unbounded generator. Swap may soften a transient peak but continuous paging is failure, not success.

Do not silently edit host-wide `.wslconfig`, allocate all host RAM to WSL, disable OOM protections, or increase global Node heap limits. Do not run `wsl --shutdown` while other tasks are active: it terminates WSL workloads. If host settings genuinely need adjustment, report measured reasons and propose specific values separately; code-level allocation/concurrency fixes remain required.

## 10. Deliverables and resume condition

Deliver the actual code changes for bounded generation/export, incremental checkpoints, telemetry/supervision, selective commands and browser disposal/streaming fixes where relevant. Add a concise evidence report under the repository's existing convention.

Your final report must identify the confirmed or most strongly supported cause, exact code paths changed, the actual limits and measurements, any remaining unknowns, and the command for safely resuming from preserved progress. Do not merely suggest buying RAM, raising swap, lowering all visual quality or deleting landmarks.

**After the memory validation ladder passes, resume the original island/gallery implementation from its existing checkpoint. Preserve the 20-landmark goal and all existing buttons, features, permissions and physics.**

## Reference notes

- [Node.js process memory metrics](https://nodejs.org/api/process.html#processmemoryusage): distinguish RSS, V8 heap, external memory and ArrayBuffers; inspect the documentation matching the installed Node version.
- [Node.js command-line memory options](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-mib): old-space limits are not whole-process/whole-machine memory limits.
- [Playwright parallelism](https://playwright.dev/docs/test-parallel): worker concurrency can be constrained, including `--workers=1`.
- [Microsoft WSL configuration](https://learn.microsoft.com/windows/wsl/wsl-config): VM memory and swap configuration are separate from application allocation behavior.

This document directs an investigation and implementation. It does not claim that the user's WSL instance has been inspected or repaired by the author.
