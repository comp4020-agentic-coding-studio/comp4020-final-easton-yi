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
