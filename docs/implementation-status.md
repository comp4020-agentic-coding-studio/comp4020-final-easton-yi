# Implementation status

The resume record for implementing `docs/BRIEF.md` (product rules) under
`docs/INITIAL_PROMPT.md` (technical directive). Updated at each stage gate.
Nothing here is a grade claim. Human-judgement items stay **pending** until a
real person has tried the app.

- **Current stage:** P8 (graphics quality and idle rendering, user-directed change of 2026-10-06) passes locally, on top of P7 (owner-controlled work deletion) and P6 (audit and handoff). P8 is **not committed or deployed**. P0–P5 gates pass **locally**; deployment-dependent gates are blocked (see Blockers). The P7 change is **not committed or deployed** yet.
- **Next action:** deploy to Fly, then re-run `pnpm check`, `scripts/measure/visibility.ts` and `scripts/measure/capacity.ts` against the live URL; run the human sessions in `acceptance-report.md`.

## Baseline (P0, 2026-10-05)

| Item | Found |
| --- | --- |
| Repo | Course template: busybox placeholder `Dockerfile`, `placeholder/` pages, Vitest harness (`spec/invariants.test.ts`, `spec/global-setup.ts`), `scripts/check-evidence.ts`, CI `checks.yml` (build image → `pnpm check` → `check:evidence` → secret scans → Fly deploy once public) |
| Runtime pins | `mise.toml`: Node 24.21.0, pnpm 11.9.0 (both installed and matching) |
| Fly shape (`fly.toml`, unchanged) | shared-cpu-1x, **256 MB**, one volume at `/data`, `PORT=8080`, `internal_port=8080`, auto stop/start, `syd` |
| Deploy | `flyctl deploy --remote-only --ha=false -a comp4020-final-easton-yi` by hand while private; CI deploys after the repo goes public |
| Marking viewports | Course assessment page (fetched 2026-10-05): latest Chrome at **1920×1080** and **390×844** (DevTools iPhone preset); markers also use the keyboard, resize mid-use and a slow connection |
| Deadline | Final: noon Mon 9 Nov 2026 (15 min grace). Crit cutoffs not re-checked here |
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
| P1 | Camera changes are local | **pass (browser)** | `tests/e2e/together.spec.ts`: B's framing unchanged while A places |
| P2 | Crit 8 slice on Fly | **blocked** | Not deployed: sandbox can't reach Fly. README draft, `/readme/` server-rendered, onboarding, empty/error states all done locally |
| P8 | High unchanged; tiers, Auto, idle/hidden rendering, lifecycle bounds | **pass (local)** | `tests/graphics-quality.test.ts` (23), `tests/e2e/graphics.spec.ts` (9), M-007/M-008 pixel comparisons, `scripts/measure/graphics-auto.ts` |
| P3 | Concurrent release converges; overlap rejection keeps draft; no camera stealing; old epochs/leases fail; unknown never duplicates | **pass** | `spec/collaboration.test.ts`, `tests/e2e/together.spec.ts`, `spec/versions.test.ts` restore |
| P3 | p95 ≤ 1000 ms visibility over ≥30 changes | **pass locally, Fly unverified** | M-003 (40 changes, p95 12.3 ms), M-006 (600 changes under load, p95 25.4 ms); loopback, not Fly |
| P4 | Exhibit unchanged by collapse; withdrawal blocks API; restore invalidates stale requests; owner disconnect can't lock; restored geometry matches, members/best height kept | **pass** | `spec/versions.test.ts`, `tests/e2e/exhibit.spec.ts` |
| P5 | AT-01..16 have evidence/status; keyboard/mobile paths; core under declared load | **pass locally, with caveats** | `docs/acceptance-report.md`; M-004..M-006; peak RSS 87% in the burst; H items pending |
| P7b | Pre-ship follow-up: editor leave entry for trashed works; exhibit limit counts retained exhibits when creating them (boundary, concurrent); republish uses no slot, also over the limit from older data; direct trigger-guard test; deterministic spec sign-up budget | **pass locally** | `spec/lifecycle.test.ts` (10), `tests/trash-guard.test.ts` (5), `tests/lifecycle-restart.test.ts` (4, incl. over-limit stored rows), `tests/e2e/lifecycle.spec.ts` (leave + Help), spec run: 25 accounts + 3 refused attempts against budget 40 |
| P7 | Owner-only trash/restore/permanent delete; trash with two connected members; late commands rejected; exhibits/thumbnails/favorites withdrawn; restore keeps scene and permitted members, needs fresh room; delete refused outside trash/wrong title/non-owner; dependent rows gone, accounts and unrelated work kept; repeats, race and failed writes safe; restart | **pass locally** | `spec/lifecycle.test.ts` (8), `tests/lifecycle-restart.test.ts` (3, SIGKILL + direct SQLite reads + fail-writes), `tests/e2e/lifecycle.spec.ts` (two accounts), migration run on a copy of the dev DB (60 works kept, `foreign_key_check` empty) |

## Commands and results (latest run)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm test:unit` (2026-10-06, after P7b) | 65 passed (physics/rim 18, placement 19, placement maths 14, restart 6, lifecycle restart 4, trash guard 5) |
| `APP_URL=http://localhost:8090 pnpm check` against a fresh `NODE_ENV=production COOKIE_SECURE=0 DATA_DIR=/tmp/… node dist/server/main.js` (2026-10-06, after P7b) | 49 passed (2 shipped invariants + 47 contract specs, 10 of them lifecycle). One run makes 28 registration attempts (25 accounts, 3 deliberately refused); the test client refuses to exceed 40, two thirds of the per-IP burst of 60, with no credit for refill |
| `APP_URL=http://localhost:8090 pnpm test:e2e` (fresh instance, 2026-10-06) | 9 passed (lifecycle walkthrough re-run alone after P7b: passed) |
| `pnpm check:evidence` | **fails**: `PROCESS.md` still the template; no `reflections/crit-*.md` (student-authored) |

## Rule coverage

Status vocabulary from the directive: `not started`, `in progress`,
`implemented / unverified`, `verified automatically`, `verified in browser`,
`human reviewed`, `blocked`.

| Rule | Implementation | Verification | Evidence | Status | Remaining limitation |
| --- | --- | --- | --- | --- | --- |
| DOC-01 | Brief and directive kept as given in `docs/` | Read in full before work | this file | verified automatically | — |
| DOC-02 | Initial parameters in `src/shared/config.ts`; every change logged with before/after in `docs/measurements.md` | Measurement log | M-001..M-006 | verified automatically | Feel parameters (friction, snap reach) untuned without people |
| DOC-03 | Core concept kept; design decisions attributed in ADRs | — | `docs/adr/` | in progress | — |
| DOC-04 | Intermediate builds not presented as complete | This table | — | in progress | — |
| DOC-05 | Dated change record in the brief; directive v1.1 note; contradicted rules corrected in place | Document audit | `docs/BRIEF.md` DOC-05, `docs/INITIAL_PROMPT.md` header and §4.5 | verified automatically | — |
| GOOD-01 | Product framing in UI and README | — | — | in progress | README is a draft for the student |
| GOOD-02 | Promises map to PLACE/SYNC/PHYS/SAVE rules below; ADRs 0002–0006 | — | `docs/adr/` | implemented / unverified | Whether they hold for people is H |
| GOOD-03 | Automated checks for permissions/persistence; human protocol pending | — | — | in progress | Needs ≥2 uninvolved people; **not done** |
| GOOD-04 | No leaderboards, chat, shop, feeds | Absent by construction | — | implemented / unverified | — |
| NAV-01 | `/`, `/works/`, `/works/:id/`, `/exhibits/:id/`, `/favorites/`, `/readme/`; account, join, 404 | e2e + HTTP | `src/client/main.tsx`, `src/server/main.ts` | implemented / unverified | Access-denied page is the shared "doesn't exist or private" view |
| NAV-02 | Public gallery without login; "Create an account to save and come back"; `?next=` return | e2e | `solo.spec.ts`, `together.spec.ts` (invite → register → return → confirm) | verified in browser | — |
| NAV-03 | Skippable intro ticking off real actions; Help reopens | e2e (skip, keyboard) | `Intro.tsx`, `access.spec.ts` | verified in browser | Whether it helps is H |
| NAV-04 | Empty states with next steps; retry on load failure; no fake activity | e2e (empty favorites) | pages | verified in browser | No example scenes are offered (none are required) |
| WORLD-01 | Y-up, u units, L=8, 1×1, uniform mass | fixtures | `config.ts`, `physics.ts` | verified automatically | — |
| WORLD-02 | Table collider = visible table (v2: cylinder + flush 128-gon trimesh ring, drawn as the same 128-gon); creation bounds | fixtures | `placement.test.ts`, `physics.test.ts` rim | verified automatically | — |
| WORLD-03 | Cleanup below −20 u / beyond r=60, saved; receipts keep history | fixture | `physics.test.ts` "cleanup" | verified automatically | — |
| WORLD-04 | 200 sticks, 4 leases, 3 rooms; offline last-saved view; idle-room eviction; owned/fav limits; exhibit limit counts retained exhibits, checked when creating one inside the write transaction; republish reuses its row | capacity profile + specs | M-006, `capacity-local.json` | verified automatically (local) | **Not measured on Fly**; burst RSS 87% locally |
| WORLD-05 | No stretching/breaking; visual bevel 0.03 u; seed is visual only | — | `viewport.ts`, `wood.ts` | implemented / unverified | — |
| CAM-01 | Camera only moved by local input | 2-browser e2e | `together.spec.ts` | verified in browser | — |
| CAM-02 | Orbit, zoom, target height, focus stick, fit all | e2e | `access.spec.ts` (orbit, focus from list) | verified in browser | — |
| CAM-03 | Polar [0.025, 1.5], zoom bounds, camera pushed out of sticks; top/side/default | — | `protectCamera()` | implemented / unverified | — |
| CAM-04 | Resize keeps target/draft; reduced motion disables easing | e2e | `access.spec.ts` 1920×1080 | verified in browser | Phone rotation on a real device pending |
| PLACE-01 | One ghost via "+"; legal spot search; explains if none | maths test | `spawnDraft` | verified automatically | — |
| PLACE-02 | Centre drag on locked plane with grab offset; height handle | maths test | `centerDrag` | verified automatically (maths) | Pointer feel needs a human |
| PLACE-03 | Endpoint yaw/pitch about the fixed end; length kept; last yaw near vertical | maths test | `endpointYaw/Pitch` | verified automatically (maths) | Multi-angle browser drag in P5 |
| PLACE-04 | Horizontal/Vertical presets about centre or end; steppers; roll; fine toggle; Shift fine keys | maths + e2e | `access.spec.ts`, `solo.spec.ts` | verified in browser | — |
| PLACE-05 | Handle > draft > stick > background; pointer capture; blur/cancel restore; wheel zooms; no right-click | e2e mouse drag | `access.spec.ts` pointer | verified in browser | Real touchpad check pending (human) |
| PLACE-06 | Bounded screen-space fallback below |dir.y| 0.08 + top-view hint | maths test | `centerDrag` | verified automatically (maths) | — |
| PLACE-07 | Angle snap 3°/5°; drop guide; snap-to-support sweep ≤0.2 u, first contact; toggle | maths test | `snapDown` | verified automatically | 0.2 u reach may be too short; needs human observation |
| PLACE-08 | Ready (with short drop) / Unsupported / Intersecting / Out of bounds (below, above, far) / Waiting, with icons and text | maths + e2e | `validate`, `access.spec.ts` slow connection | verified in browser | — |
| PLACE-09 | Zero-velocity server placement; pending blocks re-click; unknown → query same ID | specs | `placement.test.ts` | verified automatically | — |
| PLACE-10 | Placed sticks select/focus/inspect author only; no delete/undo | e2e | `StickList`, `access.spec.ts` | verified in browser | — |
| PHYS-01 | One server world per active work | specs | `room.ts` | verified automatically | — |
| PHYS-02 | Upright pillar stands with no constraints | fixture | `physics.test.ts` | verified automatically | — |
| PHYS-03 | Bridge settles, overhang topples, cascades | fixtures | `physics.test.ts` | verified automatically | — |
| PHYS-04 | Engine sleeping only; removal wakes; falling never frozen | fixtures | `physics.test.ts` | verified automatically | — |
| PHYS-05 | Low restitution, CCD, high-drop no tunnelling | fixture | `physics.test.ts` | verified automatically | "Feels like wood" is a human judgement |
| PHYS-06 | Pillar, bridge, progressive load, cascade, support removal, restored continuation | fixtures + restart test | both | verified automatically | — |
| SYNC-01 | Remote ghosts translucent + personal colour outline + name + shape; throttled 15 Hz; no collision | spec + e2e | `collaboration.test.ts`, `together.spec.ts`, `p3-partner-ghost.png` | verified in browser | Legibility is H |
| SYNC-02 | No locks/turns; coordinator orders commands; collisions reject later | spec + e2e | `collaboration.test.ts` | verified automatically | — |
| SYNC-03 | Epoch/stream exact, tick freshness only while moving | spec | `placement.test.ts` stale test | verified automatically | — |
| SYNC-04 | ≤1 s visibility | measurement | M-003, M-006 | verified automatically (local) | **Fly measurement pending** |
| SYNC-05 | Offline draft kept; placing disabled; query by original ID; offline/silent-link detection | e2e + restart | `together.spec.ts`, `restart.test.ts` | verified in browser | — |
| SYNC-06 | One lease per account; takeover; heartbeat keeps ghost; 15 s stale removal | spec | `collaboration.test.ts` | verified automatically | — |
| SYNC-07 | Logout/removal/expiry end socket authority; background return re-joins | spec | `collaboration.test.ts` | verified automatically | Background-return path not browser-tested |
| AUTH-01 | Handle/display name/password; one-use rotating recovery code | specs | `accounts.test.ts` | verified automatically | — |
| AUTH-02 | Owner/editor/visitor; every mutation re-checked in the coordinator; owner-only trash/restore/delete (`requireOwner(…, {allowTrashed})`) | specs | `collaboration.test.ts` editors can't do owner things; `lifecycle.test.ts` authority | verified automatically | — |
| AUTH-03 | Invites: hashed, 7 days, 3 users, fragment token, one active, idempotent accept; join page and Work panel state the owner's publication/deletion authority | specs + e2e | `collaboration.test.ts` invitations; `tests/e2e/lifecycle.spec.ts` | verified in browser | 7-day expiry not time-travel tested |
| AUTH-04 | Per-stick author kept after removal; exhibit attribution frozen at publish | specs | `collaboration.test.ts`, `versions.test.ts` | verified automatically | — |
| AUTH-05 | Private works 404 for non-members; trashed works 410 `TRASHED` for members (no data), 404 for strangers; public projection allowlisted (no IDs, members, blobs); leave, also while trashed | specs | `versions.test.ts`, `lifecycle.test.ts` | verified automatically | — |
| SAVE-01 | Current state / immutable snapshots / exhibits referencing snapshots; favorites reference exhibits | specs | `versions.test.ts` | verified automatically | — |
| SAVE-02 | Full snapshot + receipt in one transaction before success | restart + failed-write tests | `restart.test.ts` | verified automatically | — |
| SAVE-03 | 500 ms checkpoints; "Placement saved; structure moving" vs "Structure saved"; SIGTERM saves | restart test | `restart.test.ts` | verified automatically | — |
| SAVE-04 | Stable-only versions; "Save when settled" pending, queryable, cancellable | specs | `versions.test.ts` | verified automatically | Worker-restart "interrupted" path untested |
| SAVE-05 | Owner restore with protection point, epoch++, full resync, stale requests fail | specs | `versions.test.ts` restore | verified automatically | — |
| SAVE-06 | Exhibits from stable named versions; text-only description; 3D read-only viewer; republish same snapshot; stays withdrawn after restore from trash | specs + e2e | `versions.test.ts`, `exhibit.spec.ts`, `lifecycle.test.ts` | verified in browser | — |
| SAVE-07 | Newest-first gallery, name search; private favorites; withdrawal placeholder; "No longer available" id-only placeholder after permanent deletion; revalidated caching | specs + e2e | `versions.test.ts`, `exhibit.spec.ts`, `lifecycle.test.ts`, `tests/e2e/lifecycle.spec.ts` | verified in browser | — |
| SAVE-08 | Archive/unarchive (exhibits stay); 30 named, 10 recovery ring; referenced versions protected; distinct from trash/delete | specs | `versions.test.ts`, `lifecycle.test.ts` (archived work returns to archive) | verified automatically | Limits at 30/10 not exercised to the boundary |
| SAVE-09 | Empty room settles ≤10 s then suspends with velocities; resumes on return | indirect | `restart.test.ts` resume; idle unload in logs | implemented / unverified | No direct test of the 10 s moving-suspend path |
| SAVE-10 | `works.trash`: one transaction saves the live envelope, withdraws exhibits, revokes invites, sets `trashed_at`, bumps epoch; then closes the room and sends `access.ended TRASHED`; SQLite triggers block late writes; real counts in the dialog | specs + restart + direct DB + e2e | `lifecycle.test.ts` (two connected members, moving, race), `lifecycle-restart.test.ts` fail-writes, `trash-guard.test.ts`, `tests/e2e/lifecycle.spec.ts` | verified in browser | — |
| SAVE-11 | `/works/?view=trash` owner-only list; editor's "Unavailable collaborations" (title + status, Leave) via `GET /api/collaborations/unavailable`; `works.untrash` clears `trashed_at` only; previous archived state kept; no room reopened | specs + restart + e2e | `lifecycle.test.ts`, `lifecycle-restart.test.ts` SIGKILL, `tests/e2e/lifecycle.spec.ts` | verified in browser | — |
| SAVE-12 | `works.purge`: trashed + owner + exact title; one transaction over all work-scoped tables; tombstone for idempotency; favorites kept as id-only rows | specs + datastore + e2e | `lifecycle.test.ts`, `lifecycle-restart.test.ts` (direct SQLite read, `foreign_key_check`), `tests/e2e/lifecycle.spec.ts` | verified in browser | Removes active data only; Fly volume snapshots/backups and logs are not affected |
| PUSH-01 | Owner, stable scene, protection snapshot, placement blocked for all | specs | `versions.test.ts` push mode | verified automatically | — |
| PUSH-02 | One bounded impulse at a validated surface point; horizontal only | specs | `versions.test.ts` | verified automatically | Browser push flow not e2e-tested |
| PUSH-03 | Keep/restore; 10 s owner-away lock clear; restart clears locks | specs | `versions.test.ts` | verified automatically | — |
| HEIGHT-01 | Support graph from upward contacts, flood from table | fixtures | `physics.test.ts` | verified automatically | Game estimate only |
| HEIGHT-02 | 1.5 s stable confirmation; "Measuring…" with previous value; best never decreases on restore | spec | `versions.test.ts` restore | verified automatically | — |
| LOOK-01 | Procedural longitudinal grain, distinct end grain, bevel, soft shadows | screenshot | `p1-two-sticks.png` | in progress | Human judgement pending |
| LOOK-02 | Table first; right rail; ≤280 px adjust panel; restrained status; no debug UI | screenshots at both viewports | `p5-*.png` | verified in browser | Taste is H |
| LOOK-04 | Graphics quality control (view toolbar, workshop + exhibit); `GRAPHICS` presets; `AutoQuality` controller; one idempotent `applyQuality`; browser-local `stillwood.graphicsQuality.v1` | unit (injected time) + e2e + before/after screenshots | `graphics-quality.test.ts`, `graphics.spec.ts`, M-007, `p8-*.png` | verified automatically / in browser (headless SwiftShader) | No real-GPU or player-device measurement; Auto recovers through ordinary use (M-008: ~1–2 min) but never at ~30 Hz, nor when animations are more than 10 s apart; Low loses the ghost's shadow footprint (other cues kept) |
| LOOK-03 | Strength-scaled knocks, 6 voices, gesture-unlocked, mute; no shake | — | `audio.ts` | implemented / unverified | Not heard by a person |
| ACCESS-01 | DOM controls for every action; shortcuts skip text inputs; searchable stick list | e2e keyboard-only | `access.spec.ts` | verified in browser | — |
| ACCESS-02 | Observe/Adjust toggle on coarse pointers; 44 px targets; capped handle regions | e2e 390×844 touch | `access.spec.ts` | verified in browser (emulated) | Real phone pending |
| ACCESS-03 | 1920×1080 and 390×844, visible focus, dialogs restore focus, WebGL fallback with readable info | e2e | `access.spec.ts` | verified in browser | WebGL-off fallback not browser-tested |
| OPS-01 | Distinct failure states; DB failure pauses room; NaN pauses | restart test | failed-write test | verified automatically | NaN path not injected |
| OPS-02 | Client degradation through the LOOK-04 tiers (reversible); old one-way `adaptQuality` removed | as LOOK-04 | as LOOK-04 | verified automatically | Server-side frame/ghost rate degradation unchanged |
| OPS-05 | Single rAF scheduler with `invalidate()`; renders only while something changes; nothing while hidden; samples only continuous animated frames; context restore wakes it | e2e two-context idle viewer (ghost move/release, placement, collapse, dropped partner, own reconnect), simulated hidden period, switching with a partner active, remount loop/resource check | `graphics.spec.ts` | verified in browser | Real tab hiding isn't automatable in this headless runner (simulated through `document.hidden`; manual check in INITIAL_PROMPT §9.4); a silently dead link (heartbeat timeout, no socket close) isn't browser-tested, though it ends in the same `draft.removed`; shadow reuse between drawn frames deferred |
| OPS-03 | Structured JSON semantic logs; actor names, no secrets; `work.trash`/`work.untrash`/`work.purge` with IDs and counts only | log audit (920 lines, 0 secret matches) | `logs-demo.md` | verified automatically | Lifecycle events not yet in `logs-demo.md` |
| OPS-04 | Live `flyctl logs` tail; log-only demo | local demo | `logs-demo.md`, `demo-server-log.jsonl` | implemented / unverified | Needs a Fly run |

## Acceptance scenarios

See [`acceptance-report.md`](acceptance-report.md).

## Blockers

1. **Docker unavailable locally.** The image can't be built or run here. It
   builds on Fly's remote builder during deploy. Impact: the P0/P1 "inside the
   actual image" checks are unverified until a deploy (or CI, once public) runs.
   The Dockerfile is multi-stage on `node:24.21.0-bookworm-slim` with a C
   toolchain in case better-sqlite3 has no prebuilt binary.
2. **Network to Fly and GitHub is blocked in this sandbox** (DNS for
   `api.fly.io`/`api.github.com` fails). Deploying needs either the sandbox
   lifted for `flyctl` or the student running the deploy command.

3. **CI won't deploy yet.** `checks.yml` runs `pnpm check:evidence` before
   deploying; it fails until `PROCESS.md` and a reflection are written.

## Known limitations

- Capacity numbers are from the development machine; Fly may differ (CPU quota, memory).
- Peak RSS reached 87% of 256 MB in the drop-plus-login burst locally (M-006).
- Per-room queue cap (16) isn't separately enforced: commands run synchronously in the coordinator, so no queue builds up; per-user rate limits (2/s, burst 4) apply.
- Storage-full admission (`STORAGE_FULL`) is implemented but untested.
- The 0.2 u Snap-to-support reach is the directive's starting value, unvalidated with people.
- The client advisory overlap check (SAT, sampled table) can differ from the server's Rapier result near tolerance; the server decides.
- No example scenes; no email recovery (by design).
- Graphics quality (M-007, M-008): Auto's constants are unmeasured on real devices. Recovery needs 15 s of good measured animation (p90 ≤20 ms), which may span interactions up to 10 s apart, so 30 Hz-capped browsers and sparse use stay at the lower tier until the player picks one; a view stops upgrading after three reversed upgrades. An occluded but not hidden window may still throttle rAF; such frames aren't distinguished from slow ones.
- `pnpm check` is intermittently red (seen 2026-10-06: 3 of 9 runs on the P8 build, 0 of 3 on a baseline `3a4a700` build, all on fresh or long-lived local production instances). Every failure is the same: the shared "Owner" account in `spec/versions.test.ts` sends commands faster than the per-user limit (2/s, burst 4), a placement comes back `RATE_LIMITED`, and the next tests fail within milliseconds because the bucket hasn't refilled. P8 changes neither the server nor the specs (only a client constant block in `src/shared/config.ts`), so this is spec timing, but a red run blocks the CI deploy. Likely fix: pace that spec's commands to the documented limit or give its describe blocks separate shared accounts, within the sign-up budget.
- Fixed with P8: on phones a long status line widened the workshop's single grid column past the screen (visible in the old `p5-phone-390x844.png`), and repeated workshop re-renders created throwaway WebGL contexts until Chrome evicted the scene's.

## Student-only tasks (not done by the agent)

- README's position on "what good means": the agent drafted structure from the brief; the student's reading and argument must be their own.
- `PROCESS.md` and `reflections/crit-8.md` (and 9, 10): personal accounts; `pnpm check:evidence` fails until they exist.
- Human trials (GOOD-03): at least two uninvolved people, protocol in `docs/acceptance-report.md` (P6).
- Repository visibility at the cutoff and the actual cutoff date.
