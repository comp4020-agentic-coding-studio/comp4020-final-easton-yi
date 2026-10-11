# Crit 9 local multiplayer test report

Agent-run test of Stillwood's real-time collaboration in a disposable,
network-isolated local environment, on 2026-10-12 (Australia/Sydney, UTC+11).
Directed by [`docs/crit9-local-multiplayer-test-prompt.md`](../crit9-local-multiplayer-test-prompt.md).
This is evidence for the author's Crit 9 reflection. It is not the reflection
and not a deployment check.

## A. Result and tested scope

Locally, edits from each of three browser sessions appeared in every other
open session without reloading. Every one of 50 expected cross-session
observations per run was rendered, and none took longer than 1,000 ms in any
of four runs. Simultaneous and conflicting operations resolved as ADR-0006
describes, and so did reconnects, restarts, permission changes and lifecycle
actions.

One check failed intermittently (M08.1, the "Reconnecting…" indicator after a
forced socket close, 2 of 5 attempts) and remains unresolved. One observation
has user impact: a pile of sticks sometimes takes over a minute to settle,
which delays saving a version (F4). No data loss, duplicate, phantom stick or
access-control failure was observed in the tested scope.

| Item | Value |
| --- | --- |
| Commit | `c363bcf` on `main`, **dirty**: the uncommitted account-deletion change (ADR-0007, migration 3, `src/server/*`, `src/client/*`) was present and tested; this testing task changed no product code |
| Runs | `20261012-crit9` (run 1), `-run2`, `-run3`, `-run4` (final), plus one unrecorded diagnostic browser pass; all from `scripts/crit9/run.sh` except the diagnostic one |
| Run times | 02:59–03:03, 03:05–03:09, 03:11–03:17, 03:20–03:26 (UTC+11) |
| Runtime | Node 24.21.0, Playwright 1.63.0, headless Chromium with SwiftShader WebGL2, WSL2 Linux 6.18 |
| Server | Production build (`dist/server/main.js`, `NODE_ENV=production`, `COOKIE_SECURE=0`), so no test hooks. Fresh SQLite database per run. Restart, lifecycle and account-deletion suites start their own disposable servers |
| Synthetic roles | A owner, B and C editors, D outsider (plus E–H for invitation limits), named `c9 <run> X`; visitor V without an account |

**Final-run leaf checks (61):** PASS 57 · FAIL 1 · BLOCKED 1 · NOT RUN 2 ·
NOT APPLICABLE 0. The pass rate over executed checks is 57 of 58. Two
applicable checks were not run and are not counted in that denominator.

**Unresolved core checks:**
- M08.1 FAIL, intermittent (F3)
- M09.3 BLOCKED: a real background tab can't be produced headless
- M07.3 NOT RUN: a browser joining mid-edit (the protocol-level M07.1–M07.2 ran)
- M11.5 NOT RUN: invitation expiry needs a controllable clock

**Suites per run**

| Suite | Run 1 | Run 2 | Run 3 | Run 4 |
| --- | --- | --- | --- | --- |
| New browser checks (`tests/e2e/crit9-multiplayer.spec.ts`, 8) | 8 pass | 4 pass, M08 fail, 3 not run | 4 pass, M08 fail, 3 not run | 7 pass, L03 fail (F4) |
| New protocol checks (`tests/crit9-multiplayer.test.ts`, 13) | 13 pass | 13 pass | 13 pass | 13 pass |
| Existing contract specs: collaboration, placement, versions, lifecycle, account-deletion (45) | 45 pass | 45 pass | 45 pass | 45 pass |
| Existing restart and hook tests: restart, lifecycle-restart, account-deletion (17) | 17 pass | 17 pass | 17 pass | 17 pass |
| Existing browser specs: together, lifecycle, account-deletion (4) | 4 pass | 4 pass | 4 pass | 4 pass |

The browser checks run in serial mode, so one failure skips the rest of that
run. That is why M09, M10 and L03 show "not run" in runs 2 and 3.

## B. Isolation and teardown

No production endpoint was intentionally accessed. The enforcement was at the
network level. The manifests are in each run directory, for example
[run 4](crit-9-local-multiplayer/20261012-crit9-run4/isolation-manifest.txt).

| Safeguard | Verified value or method | Result | Evidence |
| --- | --- | --- | --- |
| Network | Whole run inside `unshare --map-root-user --net`; the only interface is `lo` | Probes to `http://1.1.1.1` and `https://example.com` failed (no route, no DNS) before anything started | manifest `namespace`, `egress_probe` |
| Environment | `env -i` with an allowlist (PATH, HOME and TMPDIR inside the run directory, LANG, TZ, PLAYWRIGHT_BROWSERS_PATH, CRIT9_*). The shell's `FLY_API_TOKEN` (from `mise.local.toml`) didn't cross | 0 `FLY*` variables in the server's `/proc/<pid>/environ`. The app reads no dotenv files; it only reads `process.env` | manifest `server_env_FLY_vars=0` |
| Database | Fresh `/tmp/stillwood-crit9-<run>-XXXX/data/stillwood.db`, created by the app's migrations at startup | `realpath` inside the run directory, not a symlink; the server's open file descriptors point only there | manifest `database`, `run_dir` |
| Spawned servers | Protocol and restart tests start servers on `127.0.0.1` with data under `<run>/tmp` | Guarded in code: refuses a root outside `/tmp` or inside the repo | `tests/crit9-multiplayer.test.ts` header |
| Origins | API, WebSocket and invitation links on `http://127.0.0.1:18990` | Every request and WebSocket host the browsers made: `127.0.0.1:18990` only; invitation link origin asserted | `browser-hosts.txt` per run |
| Base URL guard | The browser spec refuses a non-loopback `APP_URL` | enforced | spec header |
| Browser state | Fresh Playwright contexts, no imported cookies or storage, HOME inside the run directory | five independent contexts (A, B, C, D, visitor) | spec `beforeAll` |
| Other services | None exist: no email, object store, queue, telemetry or remote database (repository inspection) | not applicable | `src/server/*` |
| Teardown | Server PID stopped; run directory removed only after a prefix check | Done in all four runs. No `/tmp/stillwood-crit9-*` left and no server process running afterwards | manifest `teardown` |

The diagnostic browser pass used the same namespace and allowlist, with a
directory removed by hand. The existing browser specs overwrite five tracked
screenshots in `docs/evidence/`; these were restored with `git restore` after
each run, so they are unchanged.

## C. Check matrix

Status is from the final run (run 4) unless the row says otherwise. Earlier
runs are noted wherever they differed.

### Core collaboration

| Check ID | Scenario and actors | Expected result | Observed behaviour and measurements | Status | Evidence | Finding or next step |
| --- | --- | --- | --- | --- | --- | --- |
| M01.1 | A, B, C, D register in separate contexts | Four distinct server identities | 4 distinct user IDs (browser and protocol) | PASS | browser M01; protocol M01 | None |
| M01.2 | A creates W, invites; B and C join through the local link | Roles owner/editor/editor (AUTH-02, AUTH-03) | `["owner","editor","editor"]`; link origin local | PASS | browser M01 | None |
| M01.3 | A, B, C open W | Same work, participants shown, same initial scene | A's presence list shows B and C; same title; same empty scene; protocol: one shared stream ID | PASS | browser and protocol M01 | None |
| M01.4 | B refreshes once (setup, not live sync) | Membership persists | Reconnected, still editor | PASS | browser M01 | None |
| M01.5 | D opens W by ID | No access, no content (AUTH-05) | Page "Can't open this work"; HTTP state 404, work info 404, socket join `NOT_FOUND`, command 404; no title or owner ID in bodies | PASS | browser and protocol M01 | None |
| M02.1 | A places 12 through the UI; B and C watch | Rendered without reload | 12 of 12 accepted; 24 of 24 rendered in B and C | PASS | `timing-samples.csv`, browser M02 | None |
| M02.2 | B places 12; A and C watch | Rendered without reload | 11 accepted (one click never reached the button, F2); 22 of 22 rendered | PASS | as above | F2 |
| M02.3 | C places 2; A and B watch | Rendered without reload | 2 of 2 accepted; 4 of 4 rendered | PASS | as above | None |
| M02.4 | After the loop | Same IDs, counts and transforms as the server; no duplicates | 25 sticks in each session and on the server; 0 duplicates; settled after 1.8 s; largest position difference from the server 0 | PASS | browser M02 | Settle time varies (F4). Root cause and fix: [FU-1](#fu-1-settling-time-and-blocked-saving) |
| M02.5 | A holds a stick | A ghost isn't a committed stick | B's Sticks panel lists "Being held now… (ghosts aren't real sticks yet)" while the stick count stays 0 | PASS | browser M03 | None |
| M03.1 | A moves a preview | B and C see it as A's | Message carries A's user ID, display name, lease and colour; B's DOM names A | PASS | protocol and browser M03 | None |
| M03.2 | C joins while A holds; A commits at the ghost pose | Ghost in the snapshot separately; commit adds exactly one stick | Joiner snapshot: 1 ghost, 0 sticks; exactly 1 `sticks.added` | PASS | protocol M03 | None |
| M03.3 | A cancels, then places | Ghost cleared | Cleared in B within 3 s each time | PASS | browser M03 | None |
| M03.4 | A leaves the room; A's socket is cut | Ghost and presence cleared | Leave: cleared, presence `[B, C]`; terminated socket: ghost removed after 1 ms | PASS | browser and protocol M03 | None |
| M03.5 | A socket stays open but stops heartbeats | Removed after `heartbeatStaleMs` = 15 s (`src/shared/config.ts`) | Removed after 15.2 s | PASS | protocol M03 | None |
| M04.1 | A and B send disjoint placements back to back against one view, 6 rounds (orders AB, BA ×3) | Both accepted: no global revision check (ADR-0006) | 12 of 12 accepted; per-round sequence numbers adjacent (for example AB → 1, 2; BA → 4, 3) | PASS | protocol M04 | None |
| M04.2 | Same rounds | Each accepted command persisted once; all windows converge in one order | 12 persisted; each of A, B, C received exactly 12 `sticks.added`, in an identical order | PASS | protocol M04 | None |
| M05.1 | A and B send an identical pose back to back, 4 rounds | Exactly one wins; loser gets `COLLISION` with a reason (ADR-0006) | 4 of 4 rounds: one accepted, one `COLLISION` ("intersects…"); the winner followed send order; querying the loser's ID returns the same answer (durable receipt) | PASS | protocol M05 | None |
| M05.2 | Same rounds | No phantom stick, all converge | 4 persisted; each window received the same set exactly once | PASS | protocol M05 | None |
| M05.3 | B holds a stick; A commits exactly at B's ghost (second socket in A's browser) | Honest feedback, draft kept | B: "✕ Intersecting; adjust position", Place disabled, Enter refused, draft kept; no command sent; all match the server | PASS | browser M05 | F5 |
| M05.4 | Owner restore vs an editor placement, both orders | Old epoch refused; a committed placement survives in the recovery point (SAVE-05) | Restore first: `STALE_WORLD`, accepted after refresh. Placement first: accepted, reset by the restore, kept in the "Before restoring…" point | PASS | protocol M05 | None |
| M06.1 | A, B, C round robin, 12 placements, within 2/s per account | All accounted for once | 12 accepted; sequence contiguous; every window has every stick once | PASS | protocol M06 | None |
| M06.2 | A sends 7 at once (limit 2/s, burst 4) | Explicit refusal with retry, then recovery | 4 accepted, 3 `RATE_LIMITED` (`retryAfterMs` 491–492, "try again"); accepted after waiting | PASS | protocol M06 | None |
| M06.3 | 3 occupied rooms, then a 4th (`activeRooms` 3) | Saved state offered, live later | 4th join `live:false`, `ROOM_LIMIT`; live once two rooms emptied | PASS | protocol M06 | None |
| M07.1 | C joins while A and B place, with the join just before and just after a commit | Snapshot plus later events with no gap or duplicate | Both orders: the union equals the server set; overlap 0; the raced stick arrived in the snapshot (commit then join) or as an event (join then commit) | PASS | protocol M07 | None |
| M07.2 | Same | Presence and ghosts initialised apart from sticks | Snapshot presence A, B, C; ghosts: A's held stick | PASS | protocol M07 | None |
| M07.3 | Same, with C in a browser | As M07.1, rendered | Not attempted; the browser C joined before editing began | NOT RUN | — | Add a browser join during the timing loop |
| T.1 | 25 accepted placements, 50 expected observations | Visible within about 1 s (operational target) | 50 of 50 rendered; click to render p95 246 ms, max 263 ms; 0 over 1,000 ms (§E) | PASS | §E | F1 for server-side timing |

### Recovery and permissions

| Check ID | Scenario and actors | Expected result | Observed behaviour and measurements | Status | Evidence | Finding or next step |
| --- | --- | --- | --- | --- | --- | --- |
| M08.1 | B holds a stick; B's context goes offline and its open WebSocket is closed in the page | Status "Reconnecting…", placing disabled with an honest banner | Run 4: socket CLOSING, then CLOSED by 165 ms; "Reconnecting…" from 165 ms; banner "Reconnecting… You can look around and adjust your stick, but placing waits until you're back."; Place disabled. **Runs 2 and 3: "Reconnecting…" not visible within 5 s**, rest of the check skipped. Run 1 and the diagnostic pass: pass | FAIL (intermittent, 2 of 5) | run 3 and run 4 `logs/browser-crit9.log`; run 4 `M08_diagnostics` | F3: test mechanism, not product; check corrected, see [FU-2](#fu-2-reconnect-indicator) |
| M08.2 | A places 3 while B is offline; B reconnects | B recovers the authoritative state, nothing lost or duplicated | Server sockets 4 → 3 during → 4 after; B matched the server after reconnect; no duplicate IDs | PASS (runs 1, 4, diagnostic) | browser M08 | None |
| M08.3 | B's held stick across reconnect | Kept; outcome honest | Kept in every executed run; placing it was then refused locally ("Intersecting; adjust position") in runs 1 and 4 and the diagnostic pass, because A's sticks occupied the spot (an earlier development pass placed it) | PASS | browser M08 | F5 |
| M08.4 | 3 more quick cycles; protocol: 3 terminate and rejoin cycles | No duplicate membership, socket, ghost or presence | B open sockets 1; 1 presence entry; members 3; server sockets back to baseline. Protocol: `connections:1`, no ghosts, server conns 2 | PASS | browser and protocol M08 | None |
| M09.1 | B hidden (simulated); A places 2 | Nothing drawn while hidden; state still arrives | 0 renders while hidden; both sticks received | PASS (simulated) | browser M09 | See M09.3 |
| M09.2 | B shown again, in Auto and in Low | Latest state drawn without interaction | Drawn 5 ms (Auto) and 28 ms (Low, tier `low`) after showing (run 1: 6 and 8 ms) | PASS (simulated) | browser M09 | None |
| M09.3 | A real background tab | Real throttling and wake-up | Headless can't hide a real tab (the existing graphics spec notes the same) | BLOCKED | spec comment | Check by hand in a headed browser with two windows |
| M10.1 | B has W and X open; A acts in W | Nothing from W reaches X | No W stick, ghost or message on X (browser and protocol: 0 messages naming W) | PASS | browser and protocol M10 | None |
| M10.2 | D, removed editor C, and A (member of both) send commands naming X with W's stream | Refused by the server; both rooms intact | 404, 404, `STALE_VIEW`; X still empty, W unchanged; later placements in both accepted | PASS | protocol M10 | None |
| M11.1 | Editor B calls owner-only HTTP and socket actions | Refused (AUTH-02) | rename, archive, trash, invite, remove member, publish, delete version, purge: all 403; restore and push: `NOT_OWNER`; B may save a version | PASS | protocol M11 | None |
| M11.2 | C leaves and owner removes B, both with sockets open | No retained write access | `LEFT` / `REMOVED` delivered; later commands `NOT_FOUND` | PASS | protocol M11 | None |
| M11.3 | Owner revokes an unused invitation; D tries it | Not admitted; members unchanged | 404 `INVITE_INVALID` | PASS | protocol M11 | None |
| M11.4 | Three accept a fresh invitation, then a fourth (`inviteMaxUses` 3) | Fourth refused | `INVITE_FULL`; 4 members | PASS | protocol M11 | None |
| M11.5 | Expired invitation | Refused | No controllable clock; expiry is 7 days | NOT RUN | — | Needs a clock seam or a database fixture with past `expires_at` |
| M11.6 | Refusal bodies | No private content | `{"error":{"code":"NOT_FOUND","message":"That work doesn't exist or you don't have access to it."}}` | PASS | protocol M11 | None |
| M12.1 | 3 placements, a version, a restore, then SIGTERM and restart on the same database | Sticks, members, versions and sessions persist | Identical stick IDs, 3 members, identical version IDs; the old cookie still authorised | PASS | protocol M12 | None |
| M12.2 | A held a ghost at restart | Not resurrected | Snapshot ghosts `[]`; only committed sticks | PASS | protocol M12 | None |
| M12.3 | 3 acknowledged placements, then SIGKILL | Every acknowledged placement survives (SAVE-02) | 3 of 3; also `tests/restart.test.ts` (6 kill points) passed in all runs | PASS | protocol M12; existing-restart log | None |

### Lifecycle

| Check ID | Scenario and actors | Expected result | Observed behaviour and measurements | Status | Evidence | Finding or next step |
| --- | --- | --- | --- | --- | --- | --- |
| L01.1 | A archives W with B connected | B read-only, placement refused | B got the saved state with `mode:"archived"`; placement `ARCHIVED` | PASS | protocol L01 | None |
| L01.2 | Same | Exhibits not withdrawn by archiving (repository policy) | Exhibit still 200 | PASS | protocol L01 | None |
| L01.3 | A unarchives | Same sticks, live again | Live; identical stick IDs | PASS | protocol L01 | None |
| L02.1 | A trashes W with B connected | B told; stale command refused; exhibit withdrawn; invite revoked; listed as unavailable for B (SAVE-10) | `TRASHED`; 410; `WITHDRAWN`; in B's unavailable list | PASS | protocol L02 | None |
| L02.2 | A restores | Same sticks; invitation stays revoked | Identical IDs; invite `null` | PASS | protocol L02 | None |
| L02.3 | Moving room, queued command, then trash and purge | Nothing writes it back | Late command 404, join `NOT_FOUND`; after 1.5 s and a stop, 0 rows in works, states, versions, exhibits and receipts | PASS | protocol L02 | None |
| L02.4 | Browser walkthrough with a connected editor | As SAVE-10..12 | `tests/e2e/lifecycle.spec.ts` passed in all runs | PASS | existing-browser log | None |
| L03.1 | Publish, keep building, visitor reads | Exhibit frozen | Protocol: geometry identical after 2 more placements (1 stick vs 3 live). Browser, run 1: 35 sticks before and after | PASS | protocol L03; run 1 browser L03 | Browser part BLOCKED in run 4 by F4 (fixed for new works, [FU-1](#fu-1-settling-time-and-blocked-saving)) |
| L03.2 | Visitor and signed-in non-member | No editing | No "Add a stick" for the visitor; anonymous socket "upgrade refused 401"; D's join `NOT_FOUND` | PASS | protocol L03; run 1 browser L03 | None |
| L03.3 | Owner withdraws | Public reads stop | `WITHDRAWN`, thumbnail 404; run 1 visitor reload showed "Withdrawn" | PASS | protocol L03; run 1 browser L03 | None |
| L04.1 | Account deletion dialog: cancel once, wrong password once | Nothing deleted | Passed in all runs | PASS | `tests/e2e/account-deletion.spec.ts` (dialog test) | None |
| L04.2 | Delete through the UI with a second owner session and a connected editor | Initiating session to the start page, other session signed out, editor leaves W | Passed in all runs | PASS | same file, second test | None |
| L04.3 | Owned works and dependent rows; old session and recovery credentials | Removed; refused | Passed: `spec/account-deletion.test.ts`, and `tests/account-deletion.test.ts` (scan of every table) | PASS | existing-contract and existing-restart logs | None |
| L04.4 | Editor membership in B's work X | X stays; identity removed; contributions load and restore | Passed ("ownership boundaries", "complete deletion…") | PASS | as above | None |
| L04.5 | Deletion raced with placement, creation, sign-in, acceptance, recovery, autosave | Nothing resurrected | Passed (latched interleavings, late autosave) | PASS | `tests/account-deletion.test.ts` | None |

## D. Findings

**F1 — Server-side timing invalid in three of four runs** (test/environment
limitation, no product impact; T.1).

- **What was seen:** the server log's time comes from `Date`, while page and
  controller times come from monotonic clocks anchored at start. Matched by
  command ID, the gap from click to server log was 2–13 ms throughout run 3. In
  run 2 it jumped from about 5 ms to a constant ~460 ms between samples 13 and
  14, while receiver arrival times relative to the click were unchanged
  (about 9 ms median). Run 4 was offset by a constant ~594 ms from the start.
  This is the signature of a wall-clock step on WSL2.
- **Consequence:** server-to-render is reported only from run 3.
  Click-to-render uses page-local monotonic clocks, calibrated against the
  controller (offset ≤ 0.24 ms, half round trip ≤ 0.95 ms), and is unaffected.
- **Harness mistake (corrected):** run 1 matched log lines by order. Run 2
  onwards matches by command ID.

**F2 — 3 of 104 Place clicks didn't reach an enabled Place button**
(test/tooling limitation; possibly a minor usability edge; M02.2).

- **Occurrences:** run 1 #24 (B), run 2 #23 (A), run 4 #24 (B).
- **What was seen:** Playwright reported the click, but the page's
  capture-phase listener recorded no click on a Place button (the recorded
  time equals that sender's previous click). No command was sent, and the
  draft remained, reading "Ready…" before and "Unsupported; will fall" after.
- **Likely cause:** browsers fire no click on a disabled button. Place is
  disabled while the draft intersects (`Workshop.tsx`, `vt.tone === "bad"`),
  and falling neighbours can make the validity flicker between Playwright's
  enabled check and its click.
- **Impact:** nothing was lost, since nothing was sent. A real user would see
  the button disabled at that instant.
- **Next:** record the button's disabled state and validity per frame around
  the click before treating it as a product issue.

**F3 — "Reconnecting…" sometimes not shown within 5 s after a forced socket
close**

*Follow-up 2026-10-12: root cause found in the test mechanism; see [FU-2](#fu-2-reconnect-indicator).* (unresolved; product or tooling not yet determined; M08.1 FAIL).

- **Steps:** B holds a stick, then `context.setOffline(true)`, then the page's
  open WebSocket is closed (`ws.close()`), then expect the "Reconnecting…"
  status within 5 s.
- **Frequency:** failed in runs 2 and 3; passed in run 1, in the diagnostic
  pass and in run 4. Diagnostics were added after run 3. Both later attempts
  passed and showed CLOSING, then CLOSED within 165 ms, so no failing trace
  exists yet.
- **Hypothesis:** with offline emulation on, the close handshake may leave the
  socket in CLOSING, so `onclose` (which sets the status) doesn't fire. The
  client's own silence detector (`connection.ts`, 15 s without messages) would
  then take over.
- **Impact if it happens for real:** up to about 15 s showing "Connected" after
  the link dropped. Commands can't go out (`send` refuses a socket that isn't
  open), so nothing is falsely saved.
- **Next:** rerun with the new trace until a failing case is captured, and add
  a server-side socket kill as a second method.

**F4 — Settling time varies widely, delaying versions and exhibits**

*Follow-up 2026-10-12: confirmed product defect in the table collider, fixed for new works; see [FU-1](#fu-1-settling-time-and-blocked-saving).*
(usability observation, recoverable disruption; L03 in run 4).

- **What was seen:** after the same 26-placement loop, "Structure saved" came
  after 3.3 s, 2.3 s, 92.5 s and 1.8 s. In run 4 a later pile (height 8.9) still
  read "structure moving" after more than 60 s.
- **What the user sees:** "Save when settled" then "Waiting for the structure
  to settle…". The explanation is clear, but saving and publishing wait with no
  end in sight. Building and sync are unaffected.
- **Next:** measure which bodies stay awake. Compare M-005, where a stick on
  the table rim kept piles awake.

**F5 — A partner's commit can take a held stick's spot** (usability
observation, documented trade-off; M05.3, M08.3).

- **What was seen:** ghosts reserve no space (ADR-0006), so a partner's
  placement can invalidate a stick someone is holding. The holder sees
  "Intersecting; adjust position" without being told a partner caused it.
- **Severity:** minor; recoverable by moving the stick.

**Harness mistakes, corrected during development** (no product change):

- the production data directory wasn't created;
- M05 expected Place to stay clickable;
- the test expected a "take over editing" button, but the server returns the
  freed seat to A's window by itself;
- settling was assumed to finish within 30 s;
- M08 assumed the held stick could always be placed;
- M10 read a panel after M09 had reloaded the page;
- L03 assumed the "Save version" label;
- run 1 matched server log lines to samples by order;
- run 2's failure detail was lost because Playwright cleared its output
  between suites; now kept under `logs/`.

## E. Timing

**Method.** A test-only init script runs in each page (no product code
changed).

- It wraps `WebSocket` to record when `sticks.added` arrives.
- It wraps `requestAnimationFrame` to record the first frame whose render
  counter advanced while the stick was in the scene. A newly added stick is
  drawn at its placed pose on its first frame (`viewport.ts` gives it a sample
  1,000 ms in the past).
- A capture-phase listener records the Place click.

All times are `performance.timeOrigin + performance.now()`. Each page was
calibrated against the controller by nine round trips (offsets 0.03–0.24 ms,
half round trip ≤ 0.95 ms). "Rendered" means the browser issued the frame's
WebGL draw calls, not physical display scan-out.

Percentiles are nearest-rank (`sorted[ceil(p·n) − 1]`). A missing
observation waits 5 s and is counted as missing, never given a latency. No
warm-up samples were excluded. Placements went through the real UI ("Add a
stick", then "Place"), alternating A and B, with at least 700 ms between one
account's placements to stay under 2 commands/s; C placed 2 at the end.
Polling only detects completion; it doesn't affect recorded times. Sample
counts are small and descriptive.

**Counts, final run (run 4)**

| Direction | Attempted | Accepted | Expected receiver observations | Rendered | Missing at 5 s |
| --- | --- | --- | --- | --- | --- |
| A → B, C | 12 | 12 | 24 | 24 | 0 |
| B → A, C | 12 | 11 | 22 | 22 | 0 |
| C → A, B (extra) | 2 | 2 | 4 | 4 | 0 |
| All | 26 | 25 | 50 | 50 | 0 |

**Latency, final run (ms; median / p95 / max; count over 1,000)**

| Metric | A → B, C | B → A, C | All |
| --- | --- | --- | --- |
| Click to remote render | 65 / 232 / 235; 0 | 61 / 253 / 263; 0 | 61 / 246 / 263; 0 |
| Click to remote arrival | 10 / 230 / 233; 0 | 9 / 240 / 258; 0 | 9 / 235 / 258; 0 |
| Arrival to render | 14 / 51 / 58; 0 | 10 / 54 / 54; 0 | 11 / 54 / 58; 0 |
| Server acceptance to render | invalid (F1) | invalid (F1) | invalid (F1) |

**Every run, all directions**

| Run | Accepted / attempted | Rendered / expected | Click to render (median / p95 / max) | Over 1,000 ms | Server to render (median / p95 / max) |
| --- | --- | --- | --- | --- | --- |
| 1 | 25 / 26 | 50 / 50 | 86 / 240 / 256 | 0 | invalid: order mapping and clock step |
| 2 | 25 / 26 | 50 / 50 | 56 / 232 / 249 | 0 | invalid: clock step |
| 3 | 26 / 26 | 52 / 52 | 67 / 248 / 462 | 0 | **61 / 245 / 456** (clock steady) |
| 4 | 25 / 26 | 50 / 50 | 61 / 246 / 263 | 0 | invalid: clock step |

In every run, click-to-arrival has a second cluster around 200–260 ms next to
the main one near 10 ms. Arrival-to-render stays below 110 ms throughout, so
the delay is before arrival (server or sending side). Its cause wasn't
isolated. One candidate is the `synchronous=FULL` commit of the ~0.5 MB
snapshot transaction on WSL2 (ADR-0003).

**Limits.** These runs used loopback on one machine with software WebGL. They
say nothing about Fly, other devices or real networks. The deployed figure
still needs its own run (`docs/measurements.md` M-003 notes the same).

Raw data: `timing-samples.csv`, `browser-observations.json` (including
offsets) and `timing-summary.json` in each run directory. Summary script:
[`scripts/crit9/summarize-timing.ts`](../../scripts/crit9/summarize-timing.ts).

## F. Concurrency decision and Crit 9 evidence

| Area | Evidence from this run | Remaining limit |
| --- | --- | --- |
| Visible real-time sync | M02, T.1: 50 of 50 observations rendered, p95 246 ms, 0 over 1 s (run 4); all four runs similar | Local only; Fly unmeasured |
| Simultaneous ordering and conflicts | M04: 12 of 12 disjoint placements accepted in both send orders, with one agreed order. M05: identical pose gives exactly one winner plus a `COLLISION` with a reason; restore vs placement handled by epoch and recovery point | Interleavings are back-to-back sends, not every possible timing |
| Chosen policy and rejected alternative | ADR-0006: no turns or locks; the server applies changes in arrival order, each checked against the current world. Rejected: turn-taking or table locks, optimistic global revision checks, ghost reservations | The alternatives are reasoning, not measured here |
| Agent direction and grounding | Expectations came from ADR-0002, 0006 and 0007 and from `src/shared/config.ts` limits (2/s burst 4, 3 rooms, 3 invite uses, 15 s heartbeat), not from assumptions | — |
| Corrections during testing | Harness only (§D). **No product code was changed.** Findings F2–F5 are open | Product follow-ups not done |
| Deployment and reflection | Outside this run | The author's own deployed check and `reflections/crit-9.md` are separate |

**How the tests illustrate the policy.** M04 shows the benefit: two people
building in different places never wait for each other, and neither is
rejected merely because the other moved the world. Every disjoint pair was
accepted in either order. M05 and F5 show the cost:

- for the same spot, the second person is refused;
- a partner's commit can take the spot someone is holding;
- the holder only learns this as "Intersecting; adjust position".

A table lock would have avoided these refusals at the price of waiting. Ghost
reservations would have prevented F5 but let one person block space. Both are
reasoning, not experiments run here.

## G. Factual material for the reflection

| Observation | Evidence | Relevance | Limit |
| --- | --- | --- | --- |
| Edits from each of three browsers rendered in the others without reload; 50 of 50 per run; p95 ≈ 230–250 ms; none over 1 s in four runs | §E | "About one second" criterion, locally | Loopback and software rendering; not Fly |
| Simultaneous disjoint placements both succeed; identical ones give one winner and a reasoned refusal | M04, M05 | The concurrency decision in action | Back-to-back sends only |
| A partner's commit can invalidate a held stick, and the message doesn't say why | F5, M05.3 | Cost of the rejected "ghost reservation" alternative | Usability judgement left to people |
| A dropped connection recovers the authoritative state without duplicates, but the "Reconnecting…" indicator failed to appear within 5 s in 2 of 5 attempts | M08, F3 | Honest open item | Cause not yet known |
| Piles sometimes take more than a minute to settle, delaying versions | F4 | A product issue found by testing collaboration at scale | Observed in 2 of 5 browser runs |
| Who did what: the user wrote the test directive; the agent built the harness, ran it and wrote this report; measurements are from the runs above | this report | Direction versus execution | The author's manual deployed check isn't part of this report |

No defect was observed in the tested scope for data integrity, ordering or
access control. This report doesn't establish deployment status, cutoff
compliance, commit history or the reflection.

## H. Reproduction

```sh
pnpm install && pnpm build
scripts/crit9/run.sh                      # optional: CRIT9_RUN_ID=<id>
node scripts/crit9/summarize-timing.ts docs/evidence/crit-9-local-multiplayer/<id>
git restore docs/evidence/p3-*.png docs/evidence/lifecycle-*.png   # existing specs re-capture these
```

- **Requirements:** Linux with unprivileged user namespaces (`unshare
  --map-root-user --net`), and Playwright's Chromium in
  `~/.cache/ms-playwright`.
- **No credentials needed:** the script creates every account itself, with the
  shared test password from `spec/helpers.ts` and `tests/e2e/helpers.ts`.
- **Isolation:** it refuses to run if either egress probe succeeds, and
  removes only its own `/tmp/stillwood-crit9-<id>-*` directory.

**Still unverified:**
- M07.3: a browser joining mid-edit;
- M09.3: a real background tab;
- M11.5: invitation expiry;
- F3's cause;
- the cluster around 200–260 ms in §E;
- everything about the deployed app.

---

## Follow-up — 2026-10-12, diagnosis and fixes

**Directive:** a focused follow-up on three items, with minimal fixes for
confirmed defects. The sections above are the original record and are
unchanged, except for links added to these entries.

**Tested state:** commit `c363bcf`, with a dirty working tree containing:
- the earlier uncommitted account-deletion change;
- the Crit 9 harness;
- the changes listed here.

**Isolation:** the same as the original runs.
- every run used the loopback-only user and network namespace, after failed
  egress probes;
- the environment was emptied (`env -i`);
- each run had a fresh database in its own `/tmp/stillwood-crit9-fu-*`
  directory;
- in-process physics diagnostics used no network and no database.

**Not repeated:** the four-run campaign. Checks not listed under
"Verification" below were not revalidated against the changed code.

Evidence:
[`crit-9-local-multiplayer/20261012-followup/`](crit-9-local-multiplayer/20261012-followup/).

### FU-1 Settling time and blocked saving

**Original observation.** F4: the same building sequence settled after
1.8–3.3 s three times and after 92.5 s once, and a later pile was still moving
after 60 s. While a structure is moving the room isn't stable, so saving a
version waits ("Waiting for the structure to settle…"), and with it publishing
and pushing.

**Diagnosis.**
[`scripts/crit9/settle-diag.ts`](../../scripts/crit9/settle-diag.ts) rebuilds
the browser loop in-process with the product's own code. It uses the real
`Room` (whose `advance()` is the server's settled decision), `PhysicsWorld`, and
the client's `spawnDraft` with poses 100 ms old. Placements happen at a run's
recorded click times. The diagnostic records awake bodies, velocities, contacts
and depths, the settled decision and step counts. Results:
[`settle-diagnosis.json`](crit-9-local-multiplayer/20261012-followup/settle-diagnosis.json),
[`table-map.txt`](crit-9-local-multiplayer/20261012-followup/table-map.txt),
[`table-micro-experiments.txt`](crit-9-local-multiplayer/20261012-followup/table-micro-experiments.txt).

1. **The recorded schedules alone settle 1.6–3.6 s after the last placement**,
   run 3's included. With 20 seeded variants (±150 ms per interval), 5 never
   settled within 120 s and 6 took 24–112 s. So the slowness is in the physics
   outcome, and sensitive to it, not in test measurement.
2. **One body is to blame, and its motion is not tiny.** In every slow or
   stuck case, 1–2 sticks stay awake at 0.86–1.5 u/s and 0.5–1.7 rad/s,
   cycling through the same few values for minutes. Each lies flat with its
   centre at y ≈ 0.22, 0.28 u below resting height (0.5). Each sits about
   13–14.5 u out on a table diagonal, entirely over the centre cylinder, held
   by one contact point at about 0.29 u depth.
3. **Not the predicate, not the solver, not the pile.**
   - From the stuck state, 16 solver iterations didn't help, and 4 internal
     iterations didn't either.
   - 32 iterations freed one case but drove another to y = 0.005.
   - Removing the neighbouring sticks changed nothing.
4. **The table geometry alone does it.** One stick placed normally (y = 0.5,
   not embedded) at the stuck body's pose in an empty world never settles. A
   positional map of one resting stick across the table shows the failures
   lie exactly where the stick's centre is outside the square |x|+|z| ≤ 16.5:
   - v2 has 6 stuck positions, every one with that asterisk;
   - every on-axis position is fine.

   Rapier 0.19's cylinder evidently supports a resting box properly only
   inside that inscribed square (corners on the axes). Elsewhere on the cap the
   box is held at a single point, sinks about 0.28 u and oscillates
   indefinitely. That also explains M-005's "convex prism sank sticks 0.3 u".
5. **Why runs differed.** The pile spawned by "Add a stick" collapses. Whether
   any stick comes to rest in one of the four diagonal edge zones, which cover
   roughly a third of the centre disc, depends on chaotic detail.

**Root cause (confirmed product defect).** Physics config v2's centre
cylinder. A stick resting in its diagonal edge zones sinks and vibrates
forever. The settled predicate (every awake body below 0.03 u/s and
0.02 rad/s for 1.5 s) correctly reports the motion, so versions, exhibits and
push wait indefinitely.

**Fix: physics config v3 for new works.**
- **What changed:** v3 replaces the centre cylinder with 8 flat square
  cuboids rotated in 11.25° steps
  ([`src/shared/config.ts`](../../src/shared/config.ts),
  [`src/server/core/physics.ts`](../../src/server/core/physics.ts)). Their
  corners sit on the rim ring's inner vertices, so the union is the inner
  128-gon to within 0.08 u, and the rim ring is unchanged. Box-on-box contact
  gives a full manifold anywhere on the surface.
  *Correction (final verification): that claim was wrong. The squares' union
  is a 32-pointed star with notches reaching in to radius 15.09, which left
  73.35 u² of the visible top unsupported. v3 was amended (the ring now starts
  at 14.5); see [FV-1](#fv-1-v3-table-collider).*
- **What stays:** gravity, friction, solver settings, the settled predicate and
  the stable-save contract are all unchanged. Nothing freezes bodies or skips
  a check.
- **Existing works:** v1 and v2 stay frozen, keeping the rule that physics
  changes don't retroactively topple saved towers. Their table colliders live
  inside their native snapshots, so they keep this defect (see Remaining).

**Evidence for the fix**
- **Positional map:** 0 stuck positions of 45 under v3, against 6 under v2.
- **20-variant sweep:** v3 21 of 21 settled within 1.6–4.7 s with 0 rejected
  placements; v2 had 5 never settling and 6 over 10 s.
- **Lowest point reached:** v3 0.50 in 18 of 18 cases; v2 0.21 in 17 of 18.
- **Cost**
  ([`table-bench.txt`](crit-9-local-multiplayer/20261012-followup/table-bench.txt),
  112-stick mat plus drop, 720 steps): step p50 0.96 vs 0.64 ms and p95
  1.14–1.22 vs 0.90 ms, while the worst step fell (2.4–2.9 vs 5.3–5.6 ms). The
  extra cost is per room and well inside the 16.7 ms pass, but the 3-room
  capacity measurement (M-006) has not been redone.
- **Regression tests** (`tests/physics.test.ts`, "table core…"): 9 diagonal
  edge positions must never sink below 0.49 and must settle within 200 steps.
  New works must use v3, whose 9 colliders form the 128-gon. A v2 world must
  keep its cylinder and still show the original sinking (deterministic case),
  as the record of why v3 exists.
- **Browser runs:** after the change, the 26-placement loop settled after
  2.3 s, 2.8 s and 3.8 s, and L03 saved and published normally twice.

**Corrected test assumption during diagnosis.** The first regression draft
built the rotation with `quatFromYawPitchRoll`, which pointed the stick
radially across the seam into the ring. It never tested the zones. Fixed to
the tangential rotation the map uses.

### FU-2 Reconnect indicator

**Original observation.** F3 / M08.1: after `context.setOffline(true)` and the
page closing its open WebSocket, "Reconnecting…" was not shown within 5 s in 2
of 5 original attempts.

**Two methods, five attempts each, page-monotonic timestamps.**
[`tests/e2e/crit9-reconnect.spec.ts`](../../tests/e2e/crit9-reconnect.spec.ts)
records socket construction, open, close and error events, readyState changes
every 25 ms, the indicator's text changes, and the next frame after each change.

| Round | Method | Attempts | Socket closed (ms after trigger) | Indicator after close | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | A offline, then page close | 5 | 0.4–1.2 (code 1005, clean) | not captured: harness bug (observer attached before `<html>` existed) | socket data kept: [round 1](crit-9-local-multiplayer/20261012-followup/reconnect-attempts-round1-indicator-capture-broken.json) |
| 1 | B server terminate (test hook) | 5 | 0.9–3.2 (1006) | not captured: same bug | as above |
| 2 | A | 5 | 0.5–1.8 | 0.5–1.1 ms; painted ≤ 4.3 ms | [round 2](crit-9-local-multiplayer/20261012-followup/reconnect-attempts-round2.json) |
| 2 | B | 5 | 0.8–1.3 | 0.5–0.6 ms; reconnected after 0.41–0.57 s | as above |
| 4 | A while frames stream (a stick falling) | 5 | 4 of 5 in 0.8–1.1; **#3 stayed CLOSING (readyState 2) for the whole 8 s window**, closing only when offline was lifted (8007 ms) | 0.4–0.8 ms after the close event, including #3 | [round 4](crit-9-local-multiplayer/20261012-followup/reconnect-attempts-round4-frames-streaming.json) |
| 5 | S page close, then offline, while frames stream | 5 | 0.6–1.8 | 0.4–0.7 ms; 3–4 failed retries while offline | [round 5](crit-9-local-multiplayer/20261012-followup/reconnect-attempts-round5-close-then-offline.json) |
| 3 | A and B, regression in the full browser suite | 10 | 0.5–1.2 | 0.5–1.6 ms | [round 3](crit-9-local-multiplayer/20261012-followup/postfix/e2e/reconnect-attempts-round3-regression.json) |

Round 3 ran inside the post-fix full suite. In that same suite, M08 failed once
more, in its "three more quick cycles" loop. Playwright's trace showed it was
about 370 ms after a reconnect while the structure was moving, which led to
round 4.

**Root cause: the test mechanism, not the product.** Under Playwright's offline
emulation, a close started by the page can stall in CLOSING, with no `close`
event, until emulation is lifted. This was seen once in 5 attempts while the
server streamed frames, and never in 10 attempts with an idle room. The app
changes its indicator from the `close` event: in every one of 20 instrumented
closes, "Reconnecting…" followed within 1.6 ms. The original assertion timed
from calling `close()`, not from the socket closing, so a stalled handshake
looked like a product failure.

Also observed: Playwright's `setOffline(false)` dispatched no `online` event,
so method A reconnected only on the client's backoff timer (8–17 s). Real
browsers fire `online` and `offline`, and the client handles both.

**Real-world analogue.** A real network loss fires `offline`, and the client
drops the socket at once. A silent link loss is caught by the client's 15 s
silence check. While a socket is stalled, `send()` refuses and the UI says
"Not connected", so nothing is falsely reported as saved. No product change
was made.

**Test corrections**
- **M08** (`tests/e2e/crit9-multiplayer.spec.ts`) now closes the socket while
  online, then goes offline before the client's first retry (at least 375 ms
  later). B still stays disconnected while A edits.
- **Every M08 cycle** now asserts that exactly one open socket was closed, so
  "nothing was closed" can no longer pass for "the indicator lagged".
- **The indicator assertion** (within 5 s) is unchanged; nothing was loosened.
- **The new reconnect spec** asserts the product contract: indicator within
  250 ms of the actual close, a real close for every method except the
  offline-first ones, and reconnection. It records, rather than fails on, the
  emulation stall.
- **Verification:** M08 then passed in a standalone run on the production
  build (8 of 8 browser checks), and method S had 5 of 5 clean attempts with
  frames streaming.

**Remaining unknown.** The exact Chromium mechanism behind the stalled closing
handshake wasn't isolated. The trigger seems to be queued frames under offline
emulation, but this is inferred from 1 of 5 attempts.

### FU-3 Test command organisation

- **Before:** `tests/crit9-multiplayer.test.ts` matched `test:unit`'s
  `tests/**` glob, needed `pnpm build` (it spawns `dist/server/main.js`) and
  added about 80 s.
- **Now:** it is `tests/integration/crit9-multiplayer.test.ts`, run by
  `pnpm test:integration` (`pnpm build && vitest run -c
  vitest.integration.config.ts`). `vitest.unit.config.ts` excludes
  `tests/integration/**`, and `scripts/crit9/run.sh` calls the new config.
- **Measured** (isolated): `pnpm test:unit` 9 files, 110 tests, 23.5 s, no
  build. `pnpm test:integration` builds in 0.2 s, then runs 13 tests in 78.8 s.
- **Unchanged:** the restart, kill and account-deletion scenarios stay in
  `test:unit`, as its config already documents. They spawn
  `src/server/main.ts` and need no build.
- **CI:** the course workflow runs only `pnpm check` (typecheck plus the HTTP
  spec against the Docker image). It has never run `test:unit`,
  `test:integration` or `test:e2e`, so no CI coverage was removed. Adding
  stages to that workflow is a separate decision, and it wasn't changed.
- **README** "Running and testing" lists the new command and the build
  prerequisite.

### Verification after the changes (isolated, 2026-10-12)

| Check | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm test:unit` | 110 passed (includes 11 new table-core regressions) |
| `pnpm test:integration` | 13 passed |
| Contract spec (`vitest run`) against a fresh production build | 53 passed |
| Crit 9 browser suite against a production build, run twice | 8 of 8 both times (the second after the M08 correction); bidirectional sync: 25–26 accepted, 50–52 of 50–52 rendered, click-to-render p95 231–232 ms, 0 over 1 s |
| Full browser suite against a test-hooks build (before the M08 correction) | 25 passed, 1 failed (M08, which led to round 4); the reconnect spec passed |

[`postfix-regression-summary.txt`](crit-9-local-multiplayer/20261012-followup/postfix-regression-summary.txt)
and the `postfix*/` directories hold the browser observations and timing
samples. In one post-fix run the server's wall clock stepped again, so its
server-to-render column is invalid, as in F1.

### Status of the original findings after this follow-up

| Finding | Status |
| --- | --- |
| F4 settling | **Fixed for new works** (physics config v3). Existing v1/v2 works keep the defect |
| F3 reconnect indicator | **Not a product defect**: the test mechanism stalls; M08 corrected and passing |
| F1 clock step | Unchanged environment limitation |
| F2 unlanded clicks | Separate follow-up; seen again (1 of 26 in one post-fix run) |
| F5 held-preview conflict message | Separate follow-up |
| M07.3, M09.3, M11.5 | Still not run or blocked; separate follow-ups |

### Remaining

- **Existing v2 works can still get stuck "moving".** A stick resting in a
  diagonal edge zone blocks versions, exhibits and push until the user moves
  something. Applying v3 to them would change saved physics retroactively
  (their table colliders live inside native snapshots); that needs a separate
  decision. Building and sync aren't affected.
- **Capacity not re-measured.** The 3-room capacity measurement (M-006) under
  v3 hasn't been redone.
- **Not deployed.** Nothing was deployed, pushed or committed.

---

## Final verification — 2026-10-12

**Directive:** a bounded check of the follow-up changes.

**Tested state:** commit `c363bcf` with a dirty working tree containing:
- the account-deletion change;
- the Crit 9 harness;
- the follow-up changes;
- the edits listed here.

**Isolation:** every execution below used the loopback-only user and network
namespace, entered after failed egress probes, with an emptied environment and
fresh `/tmp/stillwood-crit9-fv-*` data directories, removed afterwards.

**What's new and what's reused:** "New" checks ran in this pass, against the
amended code. "Earlier" rows reuse the follow-up's evidence and weren't rerun.
Nothing was deployed, pushed or committed, and no existing work was migrated.

New evidence:
[`crit-9-local-multiplayer/20261012-final/`](crit-9-local-multiplayer/20261012-final/)
- per-command logs with exit codes in `logs/` and `run-summary.txt`;
- `table-coverage.txt`, `table-map-v3-amended.txt`,
  `settle-sweep-v3-amended.json`, `table-bench-v3-amended.txt`.

### FV-1 v3 table collider

**Geometry.**
- **Rendered tabletop:** `viewport.ts` draws `CylinderGeometry(18, 18, 2, 128)`
  with its top at y = 0. That's a regular 128-gon of circumradius 18 (apothem
  17.9946) with vertices at multiples of 2.8125°.
- **Rim ring:** its outer edge is the same 128-gon, from the same angles.
- **Core:** v3's 8 squares have corners at radius 16.5, every 11.25°, so
  their union is a 32-pointed star.
- **The gap:** between two corners the boundary dips to
  16.5·cos 45° / cos 39.375° = **15.09**.

**Defect found and fixed.** As shipped in the follow-up, the ring began at
16.5. A downward ray-cast scan of the table colliders
(`scripts/crit9/table-coverage.ts`, 0.05 u grid) found **73.35 u² of the
visible top with no collider at all**, in notches at radius 15.12–16.5. The
follow-up's positional map and tests had only sampled corner angles, so they
missed it.

The smallest fix within v3: the ring now starts at **14.5**, overlapping every
notch by at least 0.59 u. It has the same top plane, outer polygon and segment
count; the squares are unchanged.

v3 had never been deployed, committed or used by any saved work outside
disposable test databases, so it was amended in place rather than given a new
version number.

| Check | Method / evidence | Observed result | Status | Remaining limitation / action |
| --- | --- | --- | --- | --- |
| Support matches the visible top (new) | `table-coverage.ts`, every 0.05 u grid point inside or outside the rendered 128-gon (±0.01 u margin) | v3 amended: 0 of 406,533 inside unsupported; 0 of 122,527 outside supported; all hits at y = 0. Before the amendment: 29,340 points (73.35 u²) unsupported. v2 for reference: 84 scattered ray misses (0.21 u²) on its cylinder | PASS (after the fix) | The fit is exact only to the scan's resolution (0.05 u grid, 0.01 u edge margin) |
| No support beyond the visible table (new) | same scan; `physics.test.ts` "supports exactly the rendered tabletop" (0.25° × 0.05 u polar band, r 14–18.3) | 0 supported points outside, in both | PASS | — |
| Former diagonal problem positions settle (new) | `table-map-v3-amended.txt`; `physics.test.ts` 9 diagonal cases | 45 of 45 grid positions settle, never sinking below 0.49 | PASS | — |
| Notches between the boxes (new) | map at 5.625°-offset angles, r 14.6–16.3; tests: 4 resting notch cases, a stick standing on end in a notch, a stick crossing the core/ring seam | 20 of 20 settle; the standing stick stays upright at y 4.0; the seam stick lies flat at 0.5 | PASS | — |
| Sticks beyond the edge still fall (new) | `physics.test.ts` "sticks beyond the supported edge still fall" | All three cases fall below y −1 within 4 s: centre past the edge on the axis, radial with its centre of mass 4 u out, wholly off at r 23 | PASS | — |
| Collapse settling, recorded loop (new) | `settle-diag.ts --config 3`, run 3 schedule plus 20 seeded variants | 21 of 21 settle within 1.6–4.7 s; 0 placements rejected | PASS | In-process reproduction, not the browser |
| Step cost (new) | `table-bench.ts`, 112-stick mat plus drop | v3 p50 0.84 / p95 1.20 / max 2.64 ms; v2 0.64 / 0.92 / 5.49 | PASS (measured) | **No multi-room capacity run under v3** (M-006 not repeated); no capacity claim is made for v3 |
| v3 work settles, saves, reloads and resumes as v3 (new) | `tests/table-config-lifecycle.test.ts`, real server, disposable data | Settled over the 45°/r13, notch and 225° positions; version saved; after SIGTERM and restart the work row, state and snapshots all have config 3 and `tableCore` stored; same stick IDs at y ≈ 0.5; a new placement and a restore were accepted | PASS | — |
| v1/v2 works keep their version (new and existing) | same test: a v2 work written into the stopped database; `physics.test.ts` v1 and v2 cases | v2 work: still version 2 in its row and state after reload and stepping, and its resting stick sinks (< 0.35) as under the original cylinder; v1: own cylinder table | PASS | **Existing v2 works can still hit the settling defect** (see Remaining) |
| Regression suite (new) | `pnpm test:unit` | exit 0: 11 files, 123 tests | PASS | Not in CI (FV-4) |

### FV-2 Test-only socket endpoint

- **Gate:** `src/server/main.ts` sets `testHooks = NODE_ENV !== "production" &&
  ENABLE_TEST_HOOKS === "1"`, read once at startup from the environment.
  Every `/api/test/*` route is registered only inside `if (testHooks)`;
  otherwise the catch-all answers 404.
- **Coordinator:** its test methods check the same flag.
- **Ownership map:** `socketOwners` is filled only when hooks are on.
- **Deployment:** the Dockerfile sets `NODE_ENV=production`, which Fly runs.
  No request can change the environment.
- **Hardening (this pass):** the endpoint used to take a `userId` from the
  request body, so in test mode any caller could drop anyone's sockets. It now
  drops only the calling session's own sockets, and an unauthenticated call is
  refused with 401.

| Check | Method / evidence | Observed result | Status | Remaining limitation / action |
| --- | --- | --- | --- | --- |
| Absent in the normal production build (new) | `dist/server/main.js` with the Dockerfile's `NODE_ENV=production`; same-origin POST | HTTP 404 | PASS | — |
| Not enabled by the flag in production (new) | the same build with `ENABLE_TEST_HOOKS=1` added | HTTP 404 | PASS | — |
| Absent in default startup and in test mode without the flag (new) | `tests/test-hooks.test.ts`, three servers | 404 `NOT_FOUND` for drop-sockets and `/api/test/room`; the caller's own socket still answers heartbeats | PASS | — |
| Only the caller's sockets, with explicit test configuration (new) | `tests/test-hooks.test.ts` | Anonymous: 401, nothing dropped. Caller: `{dropped: 1}`, its socket closed with 1006. A second user's socket stayed OPEN and answered | PASS | — |
| Still works for the reconnect diagnosis (new) | `crit9-reconnect.spec.ts`, method B, 5 attempts, test-hooks build | 5 of 5: close 1.0–1.5 ms after the call; indicator 0.5–0.9 ms after close; reconnected after 0.39–0.53 s | PASS | — |

### FV-3 Reconnect finding, restated

**What the evidence shows (earlier evidence, FU-2):**
- **Indicator after a real close:** in every recorded attempt where the
  browser fired a WebSocket `close` event, the indicator changed to
  "Reconnecting…" within 1.6 ms of that event. That's 20 instrumented closes
  in the follow-up, plus 5 more in this pass.
- **The original intermittent failure:** it came from the offline-then-close
  test sequence. Under Playwright's offline emulation, a page-initiated close
  sometimes stayed in CLOSING with no `close` event until emulation was lifted
  (1 of 5 attempts while frames were streaming).
- **Browser mechanism:** not isolated, so that remains uncertain.

**What it doesn't show.** None of this measures how quickly the app notices a
**silent** real-network failure, where no `close` or `offline` event arrives.

**Existing liveness mechanisms (read in the code, not newly measured):**
- **Client** (`src/client/workshop/connection.ts`): every 5 s
  (`heartbeatMs`) it sends a heartbeat. If nothing at all has been heard from
  the server for more than 15 s (`heartbeatStaleMs`), it drops the socket and
  shows "Reconnecting…" at once. The server answers each heartbeat and also
  streams room traffic, so a silent link should show as "Reconnecting…" about
  15–20 s after the last message. A browser `offline` event drops at once, and
  `online` reconnects at once.
- **Server** (`coordinator.ts`): it drops a window that sent no heartbeat for
  15 s, checked every second. This is the only part measured: 15.2 s in M03.
- **Not measured:** the client-side 15–20 s path.

### FV-4 Test commands and coverage

| Command (new run, isolated) | Exit | Exact result (from `20261012-final/logs/`) |
| --- | --- | --- |
| `pnpm typecheck` | 0 | clean |
| `pnpm test:unit` (no prior build) | 0 | 11 files, **123 tests** passed, 22.7 s |
| `pnpm test:integration` (runs `pnpm build` first) | 0 | built in 224 ms; 1 file, **13 tests** passed, 75.8 s |
| Contract spec (`vitest run`) against the production build | 0 | 7 files, **53 tests** passed |
| `tests/e2e/crit9-multiplayer.spec.ts` against the production build | 0 | **8 passed**; 26 of 26 accepted; 52 of 52 renders; click-to-render median 77, p95 248, max 283 ms; 0 over 1 s; settled after 2.3 s |
| `tests/e2e/crit9-reconnect.spec.ts`, method B, test-hooks build | 0 | **1 passed** (5 attempts) |

Earlier follow-up results that were not rerun here:
- the full browser suite (25 passed, 1 failed in M08 before its correction);
- reconnect rounds 2–5.

**CI** (`.github/workflows/checks.yml`) builds the Docker image and runs:
- `pnpm check`, which is `pnpm typecheck && vitest run`, so only `spec/**`
  (including `spec/account-deletion.test.ts`) against that container;
- `pnpm check:evidence`;
- the secret scans;
- deployment.

**Manual only:** `pnpm test:unit` (including the new table-core,
table-config-lifecycle and test-hooks tests), `pnpm test:integration` and
`pnpm test:e2e` (including the Crit 9 browser and reconnect specs). The new
regression tests are **not** covered automatically.

**Recommended follow-up, not done here:** add a CI step before deployment
running `pnpm test:unit` (about 25 s, no Docker needed) and
`pnpm test:integration` (about 80 s). Browser specs would need
`playwright install chromium` and a test-hooks server, as a separate job.

### Remaining limitations

- **Existing v2 works** (and v1) can still hit the settling defect. A stick
  resting in a diagonal edge zone of their cylinder table keeps them "moving",
  and versions, exhibits and push wait. Only new works get v3; upgrading saved
  works is a separate decision.
- **Not deployed.** The fix applies to new v3 works and hasn't been deployed or
  verified on Fly.
- **Local timing only.** It says nothing about Fly or cross-device
  performance.
- **Capacity.** v3 was only measured in single-world benchmarks and the
  browser runs. The 3-room capacity profile (M-006) hasn't been repeated, so
  no capacity claim covers v3.
- **Still unverified:** real background tabs (M09.3), a browser joining
  mid-build (M07.3), invitation expiry (M11.5), the held-preview conflict
  message (F5), unlanded automated clicks (F2), the client's silent-failure
  detection time, and the browser mechanism behind the stalled close.

---

## User-performed manual production check — 2026-10-12

**Who and when:** the author, by hand, on the live app
(`comp4020-final-easton-yi.fly.dev`) after commit `a3fd33a` was deployed (Fly
release v7, migration 3 applied).

**Provenance:** reported to the agent. The agent didn't observe or measure
these checks. They are separate from the agent's local automated results above
and don't change any of them.

| Check | What the author did | Reported observation | Status | Limits |
| --- | --- | --- | --- | --- |
| Bidirectional collaboration | built in one work from two sessions, each seeing the other's placements | no problems observed | PASS (manual, reported) | No latency measured; devices and browsers not recorded |
| Settling | let the structure come to rest | no problems observed | PASS (manual, reported) | New works use physics v3; settling of existing v2 works wasn't covered |
| Saving a version | saved a version of the settled structure | no problems observed | PASS (manual, reported) | — |
| Reopening the work | reopened the work after saving | no problems observed | PASS (manual, reported) | — |
| Exhibit publication and viewing | published an exhibit and viewed it | no problems observed | PASS (manual, reported) | — |
| Same-location placement | two collaborators held sticks at the same location; one placed first | the other's interface updated in real time and immediately refreshed the held stick's validity check, with no manual refresh | PASS (manual, qualitative) | Sequential, not a synchronised concurrent submission. "Immediately" is qualitative; nothing was timed. No claim is made about a rejection message or that the second person submitted a command. Simultaneous submissions are still evidenced only by local protocol test M05 |

**Relation to the concurrency policy** (ADR-0006: no turns, locks or ghost
reservations; the server applies placements in arrival order against the
current world). The same-location case is the policy as a user meets it. An
accepted placement changes the shared scene, and with it the validity of
another participant's pending placement. That participant's preview check
updates on its own. The browser test M05.3 shows the same behaviour locally.

**Not covered by this manual check, so still open:**
- the runbook's account-deletion check on Fly;
- any timing or capacity measurement on Fly or across devices (3-room capacity
  not re-run for v3);
- existing v2 works that hit the settling defect;
- real background tabs (M09.3);
- a browser joining mid-build (M07.3);
- invitation expiry (M11.5);
- how quickly a silent network failure is detected;
- unlanded automated clicks (F2);
- the conflict message's wording (F5).
