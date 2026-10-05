# Implementation status

The resume record for implementing `docs/BRIEF.md` (product rules) under
`docs/INITIAL_PROMPT.md` (technical directive). Updated at each stage gate.
Nothing here is a grade claim. Human-judgement items stay **pending** until a
real person has tried the app.

- **Current stage:** P2 (Crit 8 deployable slice). P0 and P1 gates passed locally; see the gate log.
- **Next action:** README first draft; deploy to Fly (needs network access the sandbox blocks; see Blockers).

## Baseline (P0, 2026-10-05)

| Item | Found |
| --- | --- |
| Repo | Course template: busybox placeholder `Dockerfile`, `placeholder/` pages, Vitest harness (`spec/invariants.test.ts`, `spec/global-setup.ts`), `scripts/check-evidence.ts`, CI `checks.yml` (build image → `pnpm check` → `check:evidence` → secret scans → Fly deploy once public) |
| Runtime pins | `mise.toml`: Node 24.21.0, pnpm 11.9.0 (both installed and matching) |
| Fly shape (`fly.toml`, unchanged) | shared-cpu-1x, **256 MB**, one volume at `/data`, `PORT=8080`, `internal_port=8080`, auto stop/start, `syd` |
| Deploy | `flyctl deploy --remote-only --ha=false -a comp4020-final-easton-yi` by hand while private; CI deploys after the repo goes public |
| Marking viewports | Not stated in the repo. Course pages not reachable from this sandbox; tested 1440×900, 1920×1080, 390×844 (see ACCESS-03) |
| Tooling available | Node, pnpm, flyctl 0.4.108, Playwright Chromium 153 (headless WebGL2 via SwiftShader) |
| Tooling **not** available | Docker (not installed); network to `api.fly.io` and `api.github.com` is blocked in this sandbox (DNS fails); npm registry works |
| Baseline checks | Placeholder not run (no Docker). Shipped invariants pass against the new app (below) |

## Gate log

| Stage | Gate | Result | Evidence |
| --- | --- | --- | --- |
| P0 | Node build works | **pass** | `pnpm build` (Vite client + esbuild server) |
| P0 | Native snapshot restore proven | **pass** | `tests/physics.test.ts` "native snapshot restore" (moving bodies, velocities, sleep flags; identical after 240 steps) |
| P0 | Collision behaviour promising | **pass** | 14 physics + 19 placement fixtures on the real engine (`pnpm test:unit`) |
| P0 | No invented package APIs | **pass** | APIs read from installed `.d.ts`; Rapier 0.21.0 → 0.19.3 on measured memory (M-001) |
| P0 | WASM + SQLite inside the Docker image | **blocked** | No Docker locally. Verified the same bundle in production mode outside a container (`NODE_ENV=production`, `pnpm check` green). Image build happens on Fly's remote builder at deploy |
| P0 | Real frame captured | **pass** | `docs/evidence/p1-two-sticks.png` (headless Chromium, real WebGL render) |
| P1 | Stranger creates work, places, refresh, re-login | **pass (browser)** | `tests/e2e/solo.spec.ts` |
| P1 | Accepted commands survive process kill | **pass** | `tests/restart.test.ts`: kill before commit / after commit / after reply, mid-fall SIGKILL, SIGTERM, failed write |
| P1 | Real Docker HTTP checks | **blocked** | As above; production-mode bundle passes `pnpm check` |
| P1 | Camera changes are local | implemented / unverified | Viewport never moves the camera on network messages; two-browser check is in P3 |

## Commands and results (latest run)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm test:unit` | 53 passed (physics 14, placement 19, placement maths 14, restart 6) |
| `APP_URL=http://localhost:8080 pnpm check` against `NODE_ENV=production node dist/server/main.js` | 19 passed (2 shipped invariants + 17 contract specs) |
| `pnpm test:e2e` | 1 passed (solo flow) |

## Rule coverage

Status vocabulary from the directive: `not started`, `in progress`,
`implemented / unverified`, `verified automatically`, `verified in browser`,
`human reviewed`, `blocked`.

| Rule | Implementation | Verification | Evidence | Status | Remaining limitation |
| --- | --- | --- | --- | --- | --- |
| DOC-01 | Brief and directive kept as given in `docs/` | Read in full before work | this file | verified automatically | — |
| DOC-02 | Initial parameters in `src/shared/config.ts`; changes logged in `docs/measurements.md` | Measurement log | M-001, M-002 | in progress | Tuning evidence still needed for feel parameters |
| DOC-03 | Core concept kept; design decisions attributed in ADRs | — | `docs/adr/` | in progress | — |
| DOC-04 | Intermediate builds not presented as complete | This table | — | in progress | — |
| GOOD-01 | Product framing in UI and README | — | — | in progress | README is a draft for the student |
| GOOD-02 | Promises map to PLACE/SYNC/PHYS/SAVE rules below | — | — | in progress | — |
| GOOD-03 | Automated checks for permissions/persistence; human protocol pending | — | — | in progress | Needs ≥2 uninvolved people; **not done** |
| GOOD-04 | No leaderboards, chat, shop, feeds | Absent by construction | — | implemented / unverified | — |
| NAV-01 | `/`, `/works/`, `/works/:id/`, `/exhibits/:id/`, `/favorites/`, `/readme/`; account, join, 404 | e2e + HTTP | `src/client/main.tsx`, `src/server/main.ts` | implemented / unverified | Access-denied page is the shared "doesn't exist or private" view |
| NAV-02 | Public gallery without login; "Create an account to save and come back"; `?next=` return | e2e solo | `solo.spec.ts` | in progress | Invite → register → return path untested in browser |
| NAV-03 | Skippable intro ticking off real actions; Help reopens | e2e (skip) | `Intro.tsx` | implemented / unverified | — |
| NAV-04 | Empty states with next steps; retry on load failure; no fake activity | — | pages | implemented / unverified | No labelled example scenes yet |
| WORLD-01 | Y-up, u units, L=8, 1×1, uniform mass | fixtures | `config.ts`, `physics.ts` | verified automatically | — |
| WORLD-02 | Cylinder table collider = visible table; creation bounds | placement fixtures | `tests/placement.test.ts` | verified automatically | — |
| WORLD-03 | Cleanup below −20 u / beyond r=60, saved; receipts keep history | fixture | `physics.test.ts` "cleanup" | verified automatically | — |
| WORLD-04 | 200 sticks, 4 leases, 3 rooms; offline last-saved view; idle-room eviction; owned/fav/exhibit limits | specs (room limit exercised) | `coordinator.ts` | implemented / unverified | **Not measured on Fly**; 256 MB headroom unproven |
| WORLD-05 | No stretching/breaking; visual bevel 0.03 u; seed is visual only | — | `viewport.ts`, `wood.ts` | implemented / unverified | — |
| CAM-01 | Camera only moved by local input | — | `viewport.ts` | implemented / unverified | Two-session browser check in P3 |
| CAM-02 | Orbit, zoom, target height, focus stick, fit all | — | `ViewControls` | implemented / unverified | — |
| CAM-03 | Polar [0.025, 1.5], zoom bounds, camera pushed out of sticks; top/side/default | — | `protectCamera()` | implemented / unverified | — |
| CAM-04 | Resize keeps target/draft; reduced motion disables easing | — | `resize()` | implemented / unverified | Browser resize test in P5 |
| PLACE-01 | One ghost via "+"; legal spot search; explains if none | maths test | `spawnDraft` | verified automatically | — |
| PLACE-02 | Centre drag on locked plane with grab offset; height handle | maths test | `centerDrag` | verified automatically (maths) | Pointer feel needs a human |
| PLACE-03 | Endpoint yaw/pitch about the fixed end; length kept; last yaw near vertical | maths test | `endpointYaw/Pitch` | verified automatically (maths) | Multi-angle browser drag in P5 |
| PLACE-04 | Horizontal/Vertical presets about centre or end; steppers; roll; fine toggle; Shift fine keys | e2e uses presets | `AdjustPanel` | implemented / unverified | — |
| PLACE-05 | Handle > draft > stick > background; pointer capture; blur/cancel restore; wheel zooms; no right-click | — | `viewport.ts` | implemented / unverified | Real touchpad check pending (human) |
| PLACE-06 | Bounded screen-space fallback below |dir.y| 0.08 + top-view hint | maths test | `centerDrag` | verified automatically (maths) | — |
| PLACE-07 | Angle snap 3°/5°; drop guide; snap-to-support sweep ≤0.2 u, first contact; toggle | maths test | `snapDown` | verified automatically | 0.2 u reach may be too short; needs human observation |
| PLACE-08 | Ready / Unsupported / Intersecting / Out of bounds / Waiting, with icons and text | maths + e2e | `validate`, `validityText` | verified in browser (out-of-bounds, ready) | — |
| PLACE-09 | Zero-velocity server placement; pending blocks re-click; unknown → query same ID | specs | `placement.test.ts` | verified automatically | — |
| PLACE-10 | Placed sticks select/focus/inspect only; no delete/undo | — | `StickList` | implemented / unverified | — |
| PHYS-01 | One server world per active work | specs | `room.ts` | verified automatically | — |
| PHYS-02 | Upright pillar stands with no constraints | fixture | `physics.test.ts` | verified automatically | — |
| PHYS-03 | Bridge settles, overhang topples, cascades | fixtures | `physics.test.ts` | verified automatically | — |
| PHYS-04 | Engine sleeping only; removal wakes; falling never frozen | fixtures | `physics.test.ts` | verified automatically | — |
| PHYS-05 | Low restitution, CCD, high-drop no tunnelling | fixture | `physics.test.ts` | verified automatically | "Feels like wood" is a human judgement |
| PHYS-06 | Pillar, bridge, progressive load, cascade, support removal, restored continuation | fixtures + restart test | both | verified automatically | — |
| SYNC-01 | Remote ghosts translucent + personal colour outline + name + shape; throttled 15 Hz | — | `viewport.ts` | implemented / unverified | P3 |
| SYNC-02 | No locks/turns; coordinator orders commands; collisions reject later | — | `coordinator.ts` | implemented / unverified | P3 concurrent test |
| SYNC-03 | Epoch/stream exact, tick freshness only while moving | spec | `placement.test.ts` stale test | verified automatically | — |
| SYNC-04 | ≤1 s visibility | — | — | not started | P3 measurement |
| SYNC-05 | Offline draft kept; placing disabled; query by original ID | partial | restart test | in progress | Browser disconnect test in P3 |
| SYNC-06 | One lease per account; takeover; heartbeat keeps ghost | — | `coordinator.ts` | implemented / unverified | P3 |
| SYNC-07 | Logout/removal/expiry end socket authority; background return re-joins | — | `coordinator.ts`, `connection.ts` | implemented / unverified | P3 |
| AUTH-01 | Handle/display name/password; one-use rotating recovery code | specs | `accounts.test.ts` | verified automatically | — |
| AUTH-02 | Owner/editor/visitor; every mutation re-checked in the coordinator | specs (non-member) | `placement.test.ts` | in progress | Removed-member test in P3 |
| AUTH-03 | Invites: hashed, 7 days, 3 users, fragment token, one active, idempotent accept | — | `coordinator.ts` | implemented / unverified | P3 spec |
| AUTH-04 | Per-stick author; exhibit attribution frozen at publish | — | — | implemented / unverified | P4 |
| AUTH-05 | Private works 404 for non-members; public projection allowlisted | spec | `placement.test.ts` | in progress | P4 exhibit privacy spec |
| SAVE-01 | Current state / immutable snapshots / exhibits referencing snapshots | — | schema | implemented / unverified | P4 |
| SAVE-02 | Full snapshot + receipt in one transaction before success | restart + failed-write tests | `restart.test.ts` | verified automatically | — |
| SAVE-03 | 500 ms checkpoints; "Placement saved; structure moving" vs "Structure saved"; SIGTERM saves | restart test | `restart.test.ts` | verified automatically | — |
| SAVE-04 | Stable-only versions; "Save when settled" pending task, cancellable | — | `coordinator.ts` | implemented / unverified | P4 |
| SAVE-05 | Owner restore with protection point, epoch++, full resync | — | `restore()` | implemented / unverified | P4 |
| SAVE-06 | Exhibits from stable named versions; text-only description | — | — | implemented / unverified | P4 |
| SAVE-07 | Newest-first gallery, name search; private favorites; withdrawal | — | — | implemented / unverified | P4 |
| SAVE-08 | Archive/unarchive; 30 named, 10 recovery ring; referenced versions protected | — | — | implemented / unverified | P4 |
| SAVE-09 | Empty room settles ≤10 s then suspends with velocities | restart mid-fall test covers resume | — | in progress | Direct test pending |
| PUSH-01 | Owner, stable scene, protection snapshot, placement blocked | — | `pushCommand` | implemented / unverified | P4 |
| PUSH-02 | One bounded impulse at a validated surface point | fixture (impulse) | `physics.test.ts` cascade | in progress | P4 end-to-end |
| PUSH-03 | Keep/restore; 10 s owner-away lock clear; restart clears locks | — | `pushTimers` | implemented / unverified | P4 |
| HEIGHT-01 | Support graph from upward contacts, flood from table | fixtures | `physics.test.ts` | verified automatically | Game estimate only |
| HEIGHT-02 | 1.5 s stable confirmation; "Measuring…" with previous value; best never decreases | — | `room.ts` | implemented / unverified | P4 restore-keeps-best spec |
| LOOK-01 | Procedural longitudinal grain, distinct end grain, bevel, soft shadows | screenshot | `p1-two-sticks.png` | in progress | Human judgement pending |
| LOOK-02 | Table first; right rail; ≤280 px adjust panel; restrained status; no debug UI | screenshot | — | in progress | — |
| LOOK-03 | Strength-scaled knocks, 6 voices, gesture-unlocked, mute; no shake | — | `audio.ts` | implemented / unverified | Not heard by a person |
| ACCESS-01 | DOM controls for every action; shortcuts skip text inputs; searchable stick list | e2e uses DOM controls | `Controls.tsx` | in progress | Full keyboard-only run in P5 |
| ACCESS-02 | Observe/Adjust toggle on coarse pointers; 44 px targets; capped handle regions | — | — | implemented / unverified | P5 touch emulation; real device pending |
| ACCESS-03 | Viewports, focus, dialogs, WebGL fallback | — | — | in progress | Course viewports unknown here |
| OPS-01 | Distinct failure states; DB failure pauses room; NaN pauses | restart test | failed-write test | in progress | — |
| OPS-02 | Shadows → pixel ratio degradation | — | `adaptQuality` | implemented / unverified | — |
| OPS-03 | Structured JSON semantic logs; no secrets | — | `log.ts` | implemented / unverified | P3/P6 log audit |
| OPS-04 | Live `flyctl logs` tail | — | — | not started | Needs deployment |

## Acceptance scenarios

| Scenario | Status | Evidence |
| --- | --- | --- |
| AT-01 | A+B pass | `spec/placement.test.ts`, `tests/e2e/solo.spec.ts` |
| AT-02 | A partial (bridge fixture) | `physics.test.ts`; H pending |
| AT-03 | not started | — |
| AT-04 | A pass (fixtures) | B/H pending |
| AT-05 | not started | P3 |
| AT-06 | A partial (non-member, anonymous) | removed member/expired session in P3 |
| AT-07 | A pass (restart + idempotency) | browser part P3 |
| AT-08 | A pass | `tests/restart.test.ts` |
| AT-09 | blocked | Needs Fly deploy |
| AT-10–AT-16 | not started / partial | see rules above |

## Blockers

1. **Docker unavailable locally.** The image can't be built or run here. It
   builds on Fly's remote builder during deploy. Impact: the P0/P1 "inside the
   actual image" checks are unverified until a deploy (or CI, once public) runs.
2. **Network to Fly and GitHub is blocked in this sandbox** (DNS for
   `api.fly.io`/`api.github.com` fails). Deploying needs either the sandbox
   lifted for `flyctl` or the student running the deploy command.

## Student-only tasks (not done by the agent)

- README's position on "what good means": the agent drafted structure from the brief; the student's reading and argument must be their own.
- `PROCESS.md` and `reflections/crit-8.md` (and 9, 10): personal accounts; `pnpm check:evidence` fails until they exist.
- Human trials (GOOD-03): at least two uninvolved people, protocol in `docs/acceptance-report.md` (P6).
- Repository visibility at the cutoff and the actual cutoff date.
