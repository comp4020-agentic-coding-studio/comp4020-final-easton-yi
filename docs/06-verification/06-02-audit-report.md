# Crit 10 verification report

Task: [`docs/06-verification/06-01-audit-prompt.md`](06-01-audit-prompt.md), a bounded verification-and-repair
cycle against the course's Crit 10 spec, "Fly by instruments". The spec asks
for: multi-user with people told apart; permissions checked on the server and
documented; server logs that say who did what and outlive the crit; a demo
where two classmates use the app from the URL alone while the author narrates
from the logs; and process evidence (`PROCESS.md`, `reflections/crit-10.md`).

Run on 2026-10-21 (AEDT) by the coding agent. Every observation below was
recorded during this run. Excerpts are shortened (IDs cut to 8 characters)
and labelled as such. No cookie, CSRF token, password, recovery code or
invitation token was written to any evidence file.

## Revisions and environments

| Label | Commit | Working tree | Where | What ran there |
|---|---|---|---|---|
| **pre-fix** | `4ee426f` | clean apart from the untracked `docs/06-verification/06-01-audit-prompt.md` and this report | local: production bundle (`NODE_ENV=production`, fresh `DATA_DIR`), WSL2, Node 24.21.0 | typecheck, build, unit, contract specs, probe |
| **Fly v8** | `4ee426f` (deployment record, CI run [38183747467](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/actions/runs/38183747467)) | — | `comp4020-final-easton-yi.fly.dev`, release v8 | probe and `flyctl logs` baseline |
| **fixed (uncommitted)** | `4ee426f` + the coordinator change in `a9d4a97` | modified `coordinator.ts`, new test | local, as above | unit, contract specs, probe, full browser suite, integration, URL-alone walk-through |
| **Fly v9** | [`ffa5830`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/ffa5830) (fix plus the probe/diagnostic scripts; product code identical to the local fixed build) | — | Fly, release v9, deployed by CI run [39513661519](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/actions/runs/39513661519) | probe, `flyctl logs`, health, invariants |

The browser suite ran against a test-hooks server (`ENABLE_TEST_HOOKS=1`,
`NODE_ENV` unset), as its specs require. All other local runs used the
production bundle with test hooks off. The client bundle was byte-identical
(`index-CCUOtKIq.js`) before and after the fix, because the fix is
server-only.

**Tools written for this run**

- [`scripts/crit10/probe.ts`](../../scripts/crit10/probe.ts) creates three fresh accounts in three cookie
  jars: Avery (owner), Blake (joins by invitation) and Casey (stranger). It
  checks identities, the invitation, two placements over two live sockets,
  and refusals for both the stranger and the editor. Every refusal is
  followed by a state read showing nothing changed. At the end it deletes
  the three accounts, which deletes the work, so no probe data is left on the
  server.
- [`scripts/crit10/diag/`](../../scripts/crit10/diag) holds one-off Playwright specs: the URL-alone
  walk-through and the D-2 ordering diagnostic.
- Log lines were matched to actions by `actorId`, `workId` and `commandId`
  from the probe's own records, never by line order.

## Acceptance matrix

Status is the final status. Earlier failures are kept in the "Fix / retest"
column and in the diagnoses below.

| ID | Requirement → expected observable result | Method · environment | Observation | Status | Evidence | Fix / retest |
|---|---|---|---|---|---|---|
| C10-01 | Two distinct authenticated identities: independent sessions get different account IDs, and each session reports only its own | Probe, three cookie jars · local pre-fix, Fly v8, Fly v9 | `/api/session` in each jar returned that jar's account ID; the 3 IDs differ. The same IDs appear as `actorId` on each person's own `account.create`, `session.login`, `room.join` and `command.place` lines | PASS | [probe-fly-postfix.json](evidence/06-016-probe-fly-postfix.json) (`C10-01`), [fly-postfix-log-excerpt.tsv](evidence/06-008-fly-postfix-log-excerpt.tsv) | — |
| C10-02 | Joining the same work: an anonymous preview names the inviter; accepting makes the second account an editor | Probe · Fly v8, Fly v9; browser · local fixed | Anonymous preview: `inviterName` = Avery. Accept returned the work ID. The member list read back as owner Avery + editor Blake. Log: `invite.create` by Avery, `invite.accept` by Blake, same `workId` | PASS | probe JSON `C10-02`; log excerpt | — |
| C10-03 | Both edit the same work: each placement is accepted, and a fresh state read shows both sticks with the right authors | Probe over two live sockets · Fly v8, Fly v9 | Both `command.result` accepted (seq 1, 2). A fresh `/state` read listed exactly those two `stickId`s, each with its placer's `authorId`. Log: two `command.place accepted` lines whose `commandId` and `actorId` match the probe's | PASS | probe JSON `placements`, `C10-03`; log excerpt | — |
| C10-04 | Real-time propagation: one person's placement arrives at the other's open socket within about 1 s, with no action by the viewer | Probe (send → other socket's `sticks.added`) · Fly v9; real UI in two contexts · local | Fly v9: 46 ms and 35 ms from send to the other socket receiving it (v8: 25 ms, 22 ms), with the right `authorId`. Browser: Bo's stick appeared in Ada's open stick list ("#1 · placed by Bo") about 35 ms after Bo's Place click returned | PASS | probe JSON `placements.sendToOtherMs`; [owner-sees-partner.png](evidence/06-014-owner-sees-partner.png) | — |
| C10-05 | A non-member is refused by the server: the same 404 as for a missing work for reads, writes, commands and socket join; the work is unchanged | Probe, direct HTTP/WS · Fly v8, Fly v9 | All 6 attempts on the work (state, get, rename, invite, place, WS join) answered `404 NOT_FOUND` / `error NOT_FOUND`, identical to a control read of a random missing ID. Stick count and title unchanged afterwards | PASS | probe JSON `stranger`, `C10-05` | — |
| C10-06 | Owner/editor permissions enforced by the server: an editor calling owner-only endpoints directly (not via the UI) is refused, and nothing changes | Probe, direct HTTP · Fly v8, Fly v9 | rename, invite create/revoke, remove owner, archive, trash, restore: all `403 NOT_OWNER`. Title, archived, trashed, members, active invite ID and stick count were all unchanged afterwards | PASS | probe JSON `editor`, `C10-06` | — |
| C10-07 | The logs tell who did what: every action in C10-01..06 is a server line whose actor, work and command IDs match the probe's own | `flyctl logs` correlated by IDs · Fly v8, Fly v9 | Every accepted action has its line, with the correct actor and work; placements match by `commandId` | PASS | [fly-baseline-log-excerpt.tsv](evidence/06-007-fly-baseline-log-excerpt.tsv), [fly-postfix-log-excerpt.tsv](evidence/06-008-fly-postfix-log-excerpt.tsv) | — |
| C10-08 | Refusals are attributable: each refused attempt in C10-05/06 leaves a line naming the actor and the work | `flyctl logs` · Fly v8 (baseline), local, Fly v9 (retest) | **v8: 2 of 13 refusals logged** (the stranger's `command.place`, the editor's `command.restore`). The other 11 left no line. **v9: 13 of 13 logged**: 11 `access.denied` lines plus the stranger's rejected `room.join` and `command.place`, each with the right `actorId` and code. **v10 re-run: 13 of 13** ([excerpt](evidence/06-010-fly-v10-log-excerpt.tsv)). The stranger's control read of a missing work also logs `access.denied` (with that other ID), because the server answers missing and not-yours alike | **PASS after fix** (FAIL on v8) | baseline: [fly-baseline-log-excerpt.tsv](evidence/06-007-fly-baseline-log-excerpt.tsv); retest: [fly-postfix-log-excerpt.tsv](evidence/06-008-fly-postfix-log-excerpt.tsv) | D-1 → [`a9d4a97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a9d4a97); regression test fails before, passes after |
| C10-09 | Logging outlives the crit and excludes secrets: structured stdout, readable later with `flyctl logs`; no password, cookie, CSRF, recovery code or invite token | Scan of 1,944 lines from local and Fly (v8, v9) | Fly lines were read back with `flyctl logs` after the requests finished. Secret-named keys: 0. Probe password literal: 0. `sw_session`: 0. `token=`: 0. Refusal lines carry no titles or tokens (asserted by the regression test) | PASS | scan results in this report; [`src/server/log.ts`](../../src/server/log.ts) key filter | Retention length on Fly is unknown; not measured |
| C10-10 | Entry from the URL alone: `/` leads to registration, a work, an invitation link; an invitee at the link registers and comes back to confirm | Playwright walk-through, two fresh contexts, no test hooks or test flag · local fixed production build; route probe · Fly v9 | Ada: `/` → "Start building" → register → create work → People → invitation link. Bo (no cookies) → link → "Ada invited you to build" → Create an account → back to the invitation → "Join as Bo" → workshop. Fly v9: `/`, `/register/`, `/join/` answer 200 with the app shell | PASS (full flow local; Fly checked by route only) | [invite-landing.png](evidence/06-011-invite-landing.png), [owner-sees-partner.png](evidence/06-014-owner-sees-partner.png), [url-alone.spec.ts](../../scripts/crit10/diag/url-alone.spec.ts) | The full browser flow wasn't run on Fly: the diag spec refuses non-local URLs so it can't leave test accounts in production |
| C10-11 | Separate Chrome profiles share nothing, and each sees the other | Playwright, isolated browser contexts · local | URL-alone run: Bo's context had 0 cookies before the link, the two sessions reported different account IDs, and each saw the other in presence. `together.spec.ts` (ghosts, simultaneous placement, own cameras, reconnect) passed in the full suite | PASS (local) | [url-alone.spec.ts](../../scripts/crit10/diag/url-alone.spec.ts); suite result below | — |
| C10-12 | The permission decision is documented with reasons | Doc review | [ADR-0005](../01-foundation/01-08-adr-0005-identity-and-permissions.md): opaque server sessions, owner/editor roles re-checked in the coordinator, the same 404 for non-members, rejected alternatives and their costs. BRIEF AUTH-02 lists exactly what each role may do and states "hidden frontend buttons are not a security boundary". The new refusal logging is documented in [`docs/90-reference/90-08-log-demo.md`](../90-reference/90-08-log-demo.md) | PASS | linked docs | — |
| C10-13 | `reflections/crit-10.md` present and answering both prompts | File check | Present; both prompts answered; 281 words in the body. Marked as an agent draft for the author to revise | PASS (draft) | [`reflections/crit-10.md`](../../reflections/crit-10.md) | Author must revise it into their own account |
| C10-14 | `PROCESS.md` describes this crit's working method and agrees with the verified state | Doc review + `pnpm check:evidence` | Crit 10 section added; "What's verified" updated to this run. `check:evidence` passes | PASS (draft) | [`PROCESS.md`](../../PROCESS.md) | It is about 2,450 words against the final 900–1,100; the rewrite is the author's |
| C10-15 | Local checks | `pnpm` scripts · local | Pre-fix: typecheck 0, build 0, unit 123/123, contract 53/53. Fixed: typecheck 0, unit **124/124** (+1 regression), contract 53/53, integration 13/13, browser **28/29**: the only failure is F3 method A (D-2). F3 then passed 10/10 in a loopback-only namespace on the same build | PASS with one environment-dependent browser failure (D-2) | logs summarised in this report | D-2: test comment only, no assertion changed |
| C10-16 | Shipped checks against the deployed app | Read-only invariants against Fly v9; full spec in CI on the deployed image | `spec/invariants.test.ts` against Fly v9: 2/2. CI run 39513661519 ran all 53 specs against the Docker image Fly deployed: 53/53; `check:evidence` passed | PASS (invariants on Fly; contract specs in CI on the same image) | [CI run 39513661519](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/actions/runs/39513661519) | The full `pnpm check` was **deliberately not run against Fly**: the specs publish exhibits and create accounts they don't all remove, and those would appear in the public gallery classmates browse at the crit |
| C10-17 | Deployment: the deployed revision equals the tested commit; health answers; CI green | GitHub deployments API, `flyctl releases`, curl | Deployment record `ffa5830` → Fly v9, then the docs-only `731f264` → Fly v10 (CI run [39514740283](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/actions/runs/39514740283)); both CI check + deploy: success. Probe re-run on v10: 15/15. `/healthz` `{"ok":true}`; `/readyz` 200, `rooms:0`, `rssMiB:105` | PASS | [fly-readyz-ffa5830.json](evidence/06-009-fly-readyz-ffa5830.json) | — |
| C10-18 | Live crit: two classmates use the app from the URL in separate Chrome profiles while the author narrates from the logs | Human session · Fly | — | NOT RUN (human activity) | — | Not automatable; nothing here claims it happened |

## Diagnoses

### D-1 · C10-08: refusals invisible in the logs, a product defect

- **Symptom.** On Fly v8, the probe's editor made 7 owner-only attempts and
  its stranger made 6 attempts on the work. The server refused all 13
  correctly (C10-05, C10-06). Only 2 left a log line, both through the
  command pipeline, which logs every outcome.
- **Evidence.**
  - [fly-baseline-log-excerpt.tsv](evidence/06-007-fly-baseline-log-excerpt.tsv)
    has no line for Blake's rename, invite, member removal, archive or
    trash, and none for Casey's rename, invite or socket join.
  - The same probe on the local production bundle gave the same result:
    [local-prefix-log-excerpt.tsv](evidence/06-013-local-prefix-log-excerpt.tsv).
  - In the code, HTTP routes call coordinator methods that throw `NOT_OWNER`
    or `NOT_FOUND` before reaching their `log()` call, and the RPC
    dispatcher logged only non-`AppError` exceptions. `joinRoom` rethrew
    `NOT_FOUND` without logging.
  - The editor's UI never calls these endpoints, so these lines only appear
    for real bypass attempts or races.
- **Classification.** Product defect in observability. Authorisation was
  correct throughout. The Crit 10 spec names "one of them can change what
  should belong to the other" as a finding to narrate from the logs. BRIEF
  OPS-04 asks the logs to show whose action failed.
- **Change.**
  [`a9d4a97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a9d4a97),
  18 lines in `coordinator.ts`. A work-scoped method refused with
  `NOT_OWNER`, `NOT_FOUND` or `TRASHED` logs one `access.denied` warn line
  with `actorId`, `action`, `workId` (or `exhibitId`) and `code`; a refused
  `room.join` logs `outcome: "rejected"`. `invite.accept` is excluded
  because its argument is a token digest.
- **Retest.**
  - New [`tests/access-log.test.ts`](../../tests/access-log.test.ts) failed
    on the unfixed coordinator (`expected [] to deeply equal [ …(5) ]`,
    [prefix output](evidence/06-002-access-log-test-prefix.txt)) and passed after
    ([postfix](evidence/06-001-access-log-test-postfix.txt)).
  - Probe re-run locally ([excerpt](evidence/06-012-local-postfix-log-excerpt.tsv))
    and on Fly v9 ([excerpt](evidence/06-008-fly-postfix-log-excerpt.tsv)): 13 of 13
    refusals logged with the correct actor (and 13 of 13 again on v10).
  - Affected regressions: unit 124/124, contract 53/53, integration 13/13,
    browser suite as below. No other behaviour changed: responses and status
    codes are the same.

### D-2 · F3 method A fails outside a loopback-only namespace: a test/automation defect

- **Symptom.** In the full browser suite (fixed build, host network),
  `crit9-reconnect.spec.ts` F3 failed all 5 method-A attempts on "an open
  socket existed" (`expected 1, received 0`). Method B passed 5 of 5. All 28
  other tests passed.
- **Evidence.**
  - The client bundle was identical before and after D-1's fix, so the fix
    can't be the cause.
  - A diagnostic spec recorded every socket and window event from page load
    ([host](evidence/06-005-d2-offline-order-host.json)). On this host,
    `setOffline(true)` fires the page's `offline` event within 1 ms. The
    client's `onOffline` calls `drop()`, which closes the socket (code 4000)
    before the test's own close. This happened in 3 of 3 attempts.
  - The same diagnostic inside `unshare --net` (loopback only, as Crit 9's
    `run.sh` used) got no `offline` event, and the socket was still open at
    the trigger in 3 of 3
    ([netns](evidence/06-006-d2-offline-order-netns.json)).
  - F3 re-run inside the namespace on the same build passed 10 of 10, with
    the indicator 0.5–0.8 ms after the close
    ([netns attempts](evidence/06-004-d2-f3-netns-attempts.json); failed host run
    kept as [host attempts](evidence/06-003-d2-f3-host-attempts.json)).
  - Playwright 1.63.0 was the same as in Crit 9.
- **Classification.** Test/automation defect. Method A assumes the page
  never sees `offline`, which is true only without a real network interface.
  The product behaved correctly in both environments: on a real `offline` it
  closes the socket at once, as the Crit 9 report says it should.
- **Action.** No product change, and no assertion changed. A header comment
  in the spec now states the assumption and where it holds
  ([`ffa5830`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/ffa5830)).
  Attempts: 1 suite run on the host (5 of 5 method-A failures), 2 diagnostic
  runs (one per environment), 1 namespace F3 run (10 of 10 pass). The host
  failure stands as a recorded result; the namespace pass doesn't erase it.

### D-3 · Probe placements collided: a test defect in this run's own probe

The first local probe run timed out waiting for Blake's stick. With the
command result printed, the server's answer was `rejected COLLISION`. Flat
sticks are 8 u long along X, and the probe placed them at x = ±3, so they
really did overlap; spec/collaboration.test.ts uses ±6. The probe was
corrected to ±6; the product was not changed. All later probe runs used the
corrected probe.

### D-4 · Two wrong claims in this report's first version: a documentation defect, caught by the audit

The first committed version
([`731f264`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/731f264))
counted 14 refusals ("2 of 14", then "14 of 14"). The correct count is 13. The
stranger's seventh probe entry was a control read of a random missing work,
not an attempt on this one.

The same version said in `docs/90-reference/90-08-log-demo.md` that a request for a missing work ID
logs nothing. The v9 and v10 Fly logs show it does log `access.denied …
NOT_FOUND` with that other ID. That is consistent with the server answering
"missing" and "not yours" alike, so the code needed no change.

The audit found both errors while comparing the v10 re-run's rejected-line
count (13) with the report. Corrected here, in `PROCESS.md` and in
`docs/90-reference/90-08-log-demo.md`.

### Not defects, recorded to avoid misreading

- On Fly the probe's own `ws.disconnect` lines are missing after cleanup.
  The account deletions ran before the socket closes arrived, and
  `afterAccountDeleted` removes those connections itself. Its
  `account.delete` line carries counts but no actor ID, by design
  ([ADR-0007](../04-accounts/04-03-adr-0007-deletion.md)), so that line alone can't be
  tied to an account.
- The browser suite overwrites seven committed screenshots in `docs/evidence/`
  (earlier crits' evidence). They were restored from git, not committed.

## Evidence audit

Done after the last code change, against the files above.

- **Every PASS has a recorded observation and a usable reference.** C10-01..07
  and 09 rest on probe JSON plus Fly log excerpts that use the same IDs. C10-10
  and 11 rest on a passing spec and screenshots. C10-12..14 are document
  checks and say so. C10-13 and 14 are marked "draft" because the author's own
  revision is still required.
- **Expected outcomes were checked, not just the absence of errors.**
  - Placements: accepted result, the other client's message, and a fresh
    state read with the authors.
  - Refusals: status code, then a read showing the protected state unchanged.
  - Attribution: session ID ↔ `actorId` on that person's lines.
- **Separation of environments.** Local production-bundle, local test-hooks
  (browser suite), Fly v8, Fly v9 and CI are labelled per row. No browser
  flow ran on Fly. The full contract suite ran on the deployed image in CI,
  not against the live URL.
- **Visible failures and limits.**
  - C10-08 failed on v8; the fix is linked.
  - F3 fails on a host network (D-2).
  - The full `pnpm check` wasn't run against Fly, deliberately.
  - Log retention on Fly is unknown.
  - C10-18 has not happened.
- **Revision coverage.**
  - Probe and log results for v9 cover `ffa5830`.
  - The full browser suite and integration ran on the uncommitted fixed tree,
    whose product code equals `a9d4a97`/`ffa5830`. After that, the only
    change was the F3 comment.
  - Pre-fix results cover `4ee426f` only.
- **Docs agree.** [`docs/90-reference/90-08-log-demo.md`](../90-reference/90-08-log-demo.md)'s new section uses real
  post-fix lines. PROCESS.md's "What's verified" now matches this table.
  Implementation-status OPS-03 lists the new events.
- **Not verified by this run.**
  - Frame rates on real devices.
  - Latency for real users on other networks (the probe ran from this
    machine only).
  - Anything about whether classmates find the app usable.

## Retest addendum, 2026-11-07: final fixes and verification

Added on 2026-11-07. Everything above this heading is the Crit 10 record of 2026-10-21 and is unchanged. This
addendum records a later local retest of items that report and the other status documents left open. It supersedes
none of them: a historical failure stays a historical failure, and the rows below link its retest.

**What was tested.** Base commit `fa23e6a` plus an **uncommitted** working tree: the phone/tablet layout, the
safe-point recovery fix, the test and documentation changes listed in
[06-020](evidence/06-020-retest-2026-11-07-gate.txt), which also gives the working-tree identity (the base commit,
a SHA-256 of the tracked diff outside `docs/`, and a SHA-256 of each new file). Nothing here is committed or deployed.
The live app still runs `fa23e6a` (CI run
[42328525834](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/actions/runs/42328525834):
check and deploy succeeded), so **no result below is a deployed result**.

**Where.** Local only: WSL2, Node 24.21.0, a production build of the working tree, a fresh data directory per
server, Playwright 1.63.0 with headless Chromium on SwiftShader (software WebGL), one worker, every heavy job under
`scripts/world/supervise.ts`. Phone and tablet results are browser emulation, not devices.

### Items

| Item | Earlier status (where) | Status now | Scenario | Expected → observed | Check | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `pnpm check` intermittently red: shared Owner in `spec/versions.test.ts` rate-limited | open known limitation ([90-01](../90-reference/90-01-implementation-status.md#known-limitations); 3 of 9 runs failed on 2026-10-06) | **fixed locally** (cause inspected; not reproduced here before the fix) | 10 repeats of the spec before and after the change on one server each; then the normal `pnpm check` once | No `RATE_LIMITED` for the functional tests, and the limit itself still asserted → before: 10/10 passed, but the shared Owner fell to 1.02 tokens, one token from a refusal; after: 10/10 passed, minimum 2.00 tokens; the new limiter test passed each time; `pnpm check` 54/54 | `spec/versions.test.ts` (paced `beforeEach`; new "command rate limit" test); `pnpm check` | [06-021](evidence/06-021-retest-2026-11-07-versions-rate-limit.txt) |
| F3 method A fails on a host network (D-2, C10-15) | test/automation defect; host failure recorded ([D-2](#d-2--f3-method-a-fails-outside-a-loopback-only-namespace-a-testautomation-defect)) | **method A skipped with its reason on a host; passes in a loopback-only namespace.** The 2026-10-21 host failure stands | Host: default methods `A,B`. Namespace: `unshare --map-root-user --net`, only `lo` | Host → A not run, recorded as "needs a loopback-only network namespace"; B 5/5 (indicator 1.7–3 ms after the close). Namespace → A 5/5 and B 5/5, an open socket before each trigger (indicator 1.1–3.6 ms) | `tests/e2e/crit9-reconnect.spec.ts` (interfaces read from `/proc/net/dev`) | [06-022](evidence/06-022-retest-2026-11-07-reconnect-host.json) (host), [06-023](evidence/06-023-retest-2026-11-07-reconnect-netns.json) (namespace) |
| Browser tests overwrite screenshots in `docs/evidence/` | recorded above ("Not defects": seven screenshots restored by hand) | **fixed locally** | Full browser suite, then hashes of every docs file | Screenshots go to each test's own `test-results/` folder (ignored by Git) → the 652 docs hashes were identical before and after the run; `git status docs` clean; 326 docs files before and after | `tests/e2e/helpers.ts` `shotPath()` (15 writers in 7 specs); `scripts/crit9/run.sh` now defaults to `test-results/crit9/<run-id>/` | [06-020](evidence/06-020-retest-2026-11-07-gate.txt) |
| Portal crossing: one transition per crossing, lock, cooldown, re-arm beyond 4 m | observed once by a tour, "not an assertion" ([08-07](../08-world-build/08-07-protection-matrix.md#island-additions-new-controls-not-renames)) | **asserted (local)** | Explorer walked frame by frame through the `works` portal and back; a second transition started at once and after 1.6 s | One event per crossing, none while standing or re-crossing within 4 m, another after leaving 4 m; second transition refused at once and allowed after the cooldown → as expected. With re-arming broken the test fails (8 events) | `world-interaction.spec.ts` K, K2 | [06-024](evidence/06-024-retest-2026-11-07-world-flows-and-limits.txt) §3 |
| Safe points off the terrain or inside collision | pre-existing, not fixed ([10-02](../10-day-night/10-02-courtyard-report.md#found-and-not-fixed-pre-existing): four points; 90-04 §6 "met" on a flat-ground test) | **recovery fixed locally; world data unchanged; viewpoints still open** | Measured all 95 safe points on the runtime's terrain and collision: 5 above the ground by more than 1 m, 1 below, 2 inside the dam (L16). Then "Return to nearest safe point" from 1.5 m away for each of the 8 | Standing on the surface (within 0.05 m), capsule clear, not flying → 8/8. With the fix removed, 7 of 8 fail | `tests/e2e/world-safe-points.spec.ts` (the real pause-menu button); `WorldView.jumpTo(…, { land: true })`, `nearestSafePoint()` skips a blocked point | [06-024](evidence/06-024-retest-2026-11-07-world-flows-and-limits.txt) §1–2 |
| Owned-works (20) and favorites (100) limits | listed in WORLD-04 as verified, with no test at the boundary ([90-01](../90-reference/90-01-implementation-status.md#rule-coverage)) | **verified automatically (local)** | Own servers on disposable data: 20 works, the 21st; archive and trash; an editor's own work; permanent deletion; two creates at once at 19; 100 favorites, the 101st, a repeat, another account, removal | 21st refused `409 LIMIT` with its message; archived or trashed still count; permanent deletion frees one; exactly one of two simultaneous creates succeeds; 101st favorite refused; a repeat is accepted; removal frees one → all as expected. With both limits off by one, all 3 tests fail | `tests/limits.test.ts` (in `pnpm test:unit`) | [06-024](evidence/06-024-retest-2026-11-07-world-flows-and-limits.txt) §4 |
| Phone and tablet layout of the island (touch) | touch controls "met in emulation" at 390 × 844 only ([90-04](../90-reference/90-04-world-status.md) §5.2) | **met in emulation at 8 sizes; unverified on devices** | Coarse touch at 390 × 844, 844 × 390, 360 × 640, 667 × 375, 768 × 1024, 1024 × 768, 1024 × 1366, 1366 × 1024; a fine mouse at narrow and touch-capable sizes | Compact landmark label with an info panel; one Menu; controls fit, don't overlap, ≥ 44 px; rotation and two-finger input; the desktop model kept for a fine pointer → 20/20 | `tests/e2e/world-touch-layout.spec.ts`, `tests/world-touch-layout.test.ts` | [06-029](evidence/06-029-retest-2026-11-07-matrix-and-desktop.txt); [06-025](evidence/06-025-retest-2026-11-07-phone-390x844-touch.png), [06-026](evidence/06-026-retest-2026-11-07-phone-390x844-menu-signed-in.png), [06-027](evidence/06-027-retest-2026-11-07-tablet-1024x768-touch.png) |
| Six-viewport matrix and desktop unchanged | not previously run as a matrix | **pass (local, emulated)** | 390 × 844, 844 × 390, 768 × 1024, 1024 × 768 (touch and mouse), 1366 × 768, 1920 × 1080; guest and signed in; `/readme/`, home and `/world/`, works, a workshop. Desktop: baseline `fa23e6a` build vs this build | No overflow, controls in view, all README links, the right HUD for the input, no page errors → 7/7. Desktop: 16 UI screenshots and 16 control-geometry dumps byte-identical | matrix spec and capture script (outside the repository) | [06-029](evidence/06-029-retest-2026-11-07-matrix-and-desktop.txt), [06-028](evidence/06-028-retest-2026-11-07-laptop-1024x768-mouse.png) |
| Persistence, restart and collaboration | verified locally (above; [90-01](../90-reference/90-01-implementation-status.md#gate-log)) | **still verified locally; not re-checked on Fly** | Normal gate | `tests/restart.test.ts` (SIGKILL, SIGTERM, failed write) in 609/609 unit tests; `solo.spec.ts` (refresh and logout), `together.spec.ts` (two people) and `lifecycle.spec.ts` passed; integration 13/13 | `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e` | [06-020](evidence/06-020-retest-2026-11-07-gate.txt) |
| Multiplayer M02: a sender's Place button never becomes enabled at about the 21st–24th placement; the test times out and the rest of the serial M-suite doesn't run | related to the open Crit 9 finding F2, recorded as missed clicks ([05-02](../05-multiplayer/05-02-test-report.md), run 1 #24, run 2 #23, run 4 #24) | **open: pre-existing, cause not established** | Unmodified `crit9-multiplayer.spec.ts`, each run on its own fresh server; this tree and a clean `fa23e6a` build, alternating; then a diagnostic copy that records Place's state before each click | Expected 26 placements → this tree failed 3 of 10 runs (#24, #24, #21), `fa23e6a` 1 of 9 (#22); the server accepted every command that was sent. The diagnostic copy passed 10 of 10 with Place enabled before all 360 clicks. Too few runs to tell whether this tree changes the rate, so independence from it is not claimed; the workshop, server and shared code are byte-identical to `fa23e6a` | `crit9-multiplayer.spec.ts` M02 | [06-020](evidence/06-020-retest-2026-11-07-gate.txt) (M02 section) |
| `world-protection.spec.ts` "a failed landmark asset…" intermittent | not recorded in the repository before this retest | **open: pre-existing, unresolved** | The whole spec file (7 tests) repeated during the phone/tablet work: 5 runs on the unchanged `fa23e6a` build and 5 on the changed build | Expected to pass every time → baseline failed this test in 2 of 5 runs, the changed build in 1 of 5; 12 isolated repeats of the test passed on both; passed in this gate. The comparison shows the failure predates these changes; it does not prove the changes have no effect on it | `world-protection.spec.ts` | [06-020](evidence/06-020-retest-2026-11-07-gate.txt) |
| Desktop "View player works" does not scroll to the exhibition | not recorded in the repository before this retest | **open (kept: desktop behaviour must not change)** | Click on the desktop home, signed out and signed in | The URL becomes `#exhibits-h` but the page stays put, on `fa23e6a` too; the touch Menu's same button scrolls (it defers one frame) | `world-touch-layout.spec.ts` T8 (touch only) | [06-029](evidence/06-029-retest-2026-11-07-matrix-and-desktop.txt); *2026-11-08:* the author's manual check of the current local build found that it does scroll to the exhibition (browser and sign-in state not reported); automated headless Chromium on the same product source still doesn't, in 12 conditions, because the router's `scrollTo(0, 0)` runs right after the link's scroll; no code changed ([06-034](evidence/06-034-retest-2026-11-08-view-player-works.txt)); *2026-11-08, later:* **fixed locally**: the app router now owns the scroll and scrolls to a same-page anchor instead of to the top; new test L (both desktop sizes, signed out and in, reduced motion on and off, repeat click, Back and Forward) passes and fails on the old build; not deployed ([06-034](evidence/06-034-retest-2026-11-08-view-player-works.txt)) |

### Normal gate, once, after the targeted checks

`pnpm typecheck` passed. `pnpm test:unit`: 27 files, 609 tests passed. `pnpm check` against a scratch server: 7
files, 54 tests passed. `pnpm check:evidence` passed. `pnpm test:integration`: 13/13. `pnpm test:e2e`: 83 passed,
1 failed (M02, above), 5 did not run because the multiplayer suite is serial. Commands, peaks and the two
working-tree identities are in [06-020](evidence/06-020-retest-2026-11-07-gate.txt).

### Not shown by this retest

- Anything on the deployed app. The pending live checks are listed in 06-020.
- Physical phones or tablets, real GPUs, Safari or Firefox, real safe-area insets or browser toolbars.
- Whether people find the app usable or the collaboration considerate.
- Ground viewpoints above the terrain (L02, L06, L13, L16) and the L13/L16 entries
  ([10-02](../10-day-night/10-02-courtyard-report.md#found-and-not-fixed-pre-existing)): "Go to a landmark" still arrives
  flying at those points.
- The named-version (30) and recovery-point (10) limits at their boundaries.

## Retest addendum, 2026-11-08: multiplayer M02 and world-protection

Added on 2026-11-08. The 2026-11-07 addendum above is unchanged; its M02 and world-protection rows record the state on
that day (both open) and stay as written. This addendum records their diagnosis, fixes and retests. Same environment
as the 2026-11-07 addendum; the tested tree is still **uncommitted and not deployed** (identity `bffd3efde05750d7`,
listed in [06-033](evidence/06-033-retest-2026-11-08-gate.txt)). Product source is unchanged since 2026-11-07; both
fixes are in tests.

| Item | Status on 2026-11-07 | Status now | Cause | Fix | Regression check and evidence |
| --- | --- | --- | --- | --- | --- |
| Multiplayer M02: Place never becomes enabled at about the 21st–24th placement; the rest of the serial suite doesn't run | open, pre-existing, cause not established | **fixed locally (test defect)** | Every condition that disables Place was traced: the connection, lease, phase and command state were all normal. A held stick is added 0.1 u above the surface below it, and on the tall, still-settling stack a settling stick came to rest inside it. The per-frame check then marked it "✕ Intersecting; adjust position" and disabled Place, correctly; M05 specifies this. Nothing re-enables it without the person's input. The helper `placeVia` clicked Place and waited for it to be enabled. A second form: a click that lands just as the stick turns is refused before sending, and the helper returned no stick (M09 failed this way once). Recorded transitions: [06-031](evidence/06-031-retest-2026-11-08-m02-place-transitions.json). All 11 recorded occurrences were at placements 23–25, matching the open Crit 9 finding F2 ([05-02](../05-multiplayer/05-02-test-report.md)) | `tests/e2e/crit9-multiplayer.spec.ts` `placeVia`: when the draft shows exactly that refusal and no place command was sent, it does what the message asks: cancel and add again (at most 2 times, each recorded). Nothing force-enables Place, bypasses validation, changes a limit or retries blindly | New **M05b** (fresh work; a partner's stick lying flat under B's held stick): refusal persists after the world is still, a plain click times out, nothing is sent, then one re-add and a successful placement. With the old click restored, M05b hangs. Repeats planned before running: changed build 15/15 and `fa23e6a` build 5/5, all 9 tests each; M02 needed one re-add in 9 of the 20 runs. Detail: [06-030](evidence/06-030-retest-2026-11-08-m02-diagnosis.txt) |
| The five tests M02 blocked: M05, M08, M09, M10, L03 | did not run in the 2026-11-07 gate | **pass (local)** | — | — | Ran after their serial prerequisites (M01, M03, M02) in all 20 planned runs and in the 2026-11-08 gate ([06-033](evidence/06-033-retest-2026-11-08-gate.txt)) |
| `world-protection.spec.ts` "a failed landmark asset…" intermittent | open, pre-existing, unresolved | **fixed locally (test synchronisation)** | The notice appears when L03's third attempt fails (about 2 s after load), while the other far files, loaded two at a time, may still be arriving. The test read the ready count once at the notice. A probe measured 15 and 11 of 19 ready at the notice in 2 of 8 runs, and 19 about 105 ms later; L03 was requested exactly 3 times every run. The fallback itself works | `tests/e2e/world-protection.spec.ts`: after the notice, wait (bounded, up to 60 s) for exactly 19 ready landmarks; L03 not ready; L03 requested exactly 3 times; Start exploring works and L03 stays failed | Whole file 15/15. With a product mutation in which a failed landmark stops the rest loading, the test fails ("Expected 19, Received 3"). Detail: [06-032](evidence/06-032-retest-2026-11-08-world-protection.txt) |

**Gate on the final tree (2026-11-08).** `pnpm typecheck` passed; `pnpm test:unit` 609/609; `pnpm check` 54/54;
`pnpm check:evidence` passed; `pnpm test:integration` 13/13; `pnpm test:e2e` **90 passed, 0 failed; no top-level
test skipped or left unrun**. Inside the reconnect test F3 (passed), method A was omitted on the host network by
design, with its reason recorded; it passed in a loopback-only namespace
([06-023](evidence/06-023-retest-2026-11-07-reconnect-netns.json)). Details are in
[06-033](evidence/06-033-retest-2026-11-08-gate.txt). An additional full browser run for whole-suite ordering
is recorded in the same file.

**Still open.** Everything listed under "Not shown by this retest" in the 2026-11-07 addendum, and the desktop "View
player works" scroll. Deployment of the README change, and every live check, are still pending.

**Desktop "View player works" (reconciled 2026-11-08).** The author manually tested the current local build on
2026-11-08 and found that clicking it on desktop scrolls to the exhibition section. That is local manual
verification, not a deployed test; the browser, sign-in state and exact working tree were not reported. The same
product source, checked automatically in headless Chromium at 1366 × 768 and 1920 × 1080, signed out (idle and
exploring) and signed in, with and without reduced motion, still ended at the top of the page in all 12 conditions.
The call log shows why: the link scrolls to the heading and, in the same click, the app's router calls
`window.scrollTo(0, 0)`; headless Chromium applies the later call. Status: **verified working in the author's
manual check; still not working under automated headless Chromium**. Reduced-motion users are expected to be
affected in any browser, since both scrolls are then instant (inferred, not tested). No code was changed, and no
fix is claimed ([06-034](evidence/06-034-retest-2026-11-08-view-player-works.txt)).

**Desktop "View player works" fixed (2026-11-08, later the same day).** A narrowly scoped behaviour correction was
authorised. The app router (`src/client/router.ts`, `navigate`) now owns the scroll for every in-app navigation: a
hash on the current page scrolls its target into view (instantly with reduced motion), any other page starts at the
top, and a link to the URL that is already current replaces the history entry instead of adding one. The desktop
and touch links no longer scroll by themselves. A new test, `world-interaction.spec.ts` "L", covers both desktop
sizes, signed out and in, and reduced motion on and off. It checks where the heading actually ends up, a repeat
click, Back, Forward and a link to another page. It passes on this build and fails on the `fa23e6a` build. The touch
Menu's link (T8) still reaches the exhibition, and the desktop screenshots and HUD geometry are byte-identical to the
baseline. Final gate on the final tree (`2f2efa861930ee27`): unit 609/609, `pnpm check` 54/54, integration 13/13,
browser **94 passed, 0 failed, no top-level test skipped or left unrun** (reconnect method A omitted on the host
network by design). While verifying, the access "keyboard only" test was found focusing Add a stick before it was
enabled, and was fixed to wait for it. Details are appended to
[06-034](evidence/06-034-retest-2026-11-08-view-player-works.txt). Local only; not deployed.
