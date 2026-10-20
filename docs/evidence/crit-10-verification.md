# Crit 10 verification report

Task: [`docs/CRIT10.md`](../CRIT10.md), a bounded verification-and-repair
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
| **pre-fix** | `4ee426f` | clean apart from the untracked `docs/CRIT10.md` and this report | local: production bundle (`NODE_ENV=production`, fresh `DATA_DIR`), WSL2, Node 24.21.0 | typecheck, build, unit, contract specs, probe |
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
- [`scripts/crit10/diag/`](../../scripts/crit10/diag/) holds one-off Playwright specs: the URL-alone
  walk-through and the D-2 ordering diagnostic.
- Log lines were matched to actions by `actorId`, `workId` and `commandId`
  from the probe's own records, never by line order.

## Acceptance matrix

Status is the final status. Earlier failures are kept in the "Fix / retest"
column and in the diagnoses below.

| ID | Requirement → expected observable result | Method · environment | Observation | Status | Evidence | Fix / retest |
|---|---|---|---|---|---|---|
| C10-01 | Two distinct authenticated identities: independent sessions get different account IDs, and each session reports only its own | Probe, three cookie jars · local pre-fix, Fly v8, Fly v9 | `/api/session` in each jar returned that jar's account ID; the 3 IDs differ. The same IDs appear as `actorId` on each person's own `account.create`, `session.login`, `room.join` and `command.place` lines | PASS | [probe-fly-postfix.json](crit-10/probe-fly-postfix.json) (`C10-01`), [fly-postfix-log-excerpt.tsv](crit-10/fly-postfix-log-excerpt.tsv) | — |
| C10-02 | Joining the same work: an anonymous preview names the inviter; accepting makes the second account an editor | Probe · Fly v8, Fly v9; browser · local fixed | Anonymous preview: `inviterName` = Avery. Accept returned the work ID. The member list read back as owner Avery + editor Blake. Log: `invite.create` by Avery, `invite.accept` by Blake, same `workId` | PASS | probe JSON `C10-02`; log excerpt | — |
| C10-03 | Both edit the same work: each placement is accepted, and a fresh state read shows both sticks with the right authors | Probe over two live sockets · Fly v8, Fly v9 | Both `command.result` accepted (seq 1, 2). A fresh `/state` read listed exactly those two `stickId`s, each with its placer's `authorId`. Log: two `command.place accepted` lines whose `commandId` and `actorId` match the probe's | PASS | probe JSON `placements`, `C10-03`; log excerpt | — |
| C10-04 | Real-time propagation: one person's placement arrives at the other's open socket within about 1 s, with no action by the viewer | Probe (send → other socket's `sticks.added`) · Fly v9; real UI in two contexts · local | Fly v9: 46 ms and 35 ms from send to the other socket receiving it (v8: 25 ms, 22 ms), with the right `authorId`. Browser: Bo's stick appeared in Ada's open stick list ("#1 · placed by Bo") about 35 ms after Bo's Place click returned | PASS | probe JSON `placements.sendToOtherMs`; [owner-sees-partner.png](crit-10/owner-sees-partner.png) | — |
| C10-05 | A non-member is refused by the server: the same 404 as for a missing work for reads, writes, commands and socket join; the work is unchanged | Probe, direct HTTP/WS · Fly v8, Fly v9 | All 7 attempts (state, get, rename, invite, place, WS join) answered `404 NOT_FOUND` / `error NOT_FOUND`, identical to a random missing ID. Stick count and title unchanged afterwards | PASS | probe JSON `stranger`, `C10-05` | — |
| C10-06 | Owner/editor permissions enforced by the server: an editor calling owner-only endpoints directly (not via the UI) is refused, and nothing changes | Probe, direct HTTP · Fly v8, Fly v9 | rename, invite create/revoke, remove owner, archive, trash, restore: all `403 NOT_OWNER`. Title, archived, trashed, members, active invite ID and stick count were all unchanged afterwards | PASS | probe JSON `editor`, `C10-06` | — |
| C10-07 | The logs tell who did what: every action in C10-01..06 is a server line whose actor, work and command IDs match the probe's own | `flyctl logs` correlated by IDs · Fly v8, Fly v9 | Every accepted action has its line, with the correct actor and work; placements match by `commandId` | PASS | [fly-baseline-log-excerpt.tsv](crit-10/fly-baseline-log-excerpt.tsv), [fly-postfix-log-excerpt.tsv](crit-10/fly-postfix-log-excerpt.tsv) | — |
| C10-08 | Refusals are attributable: each refused attempt in C10-05/06 leaves a line naming the actor and the work | `flyctl logs` · Fly v8 (baseline), local, Fly v9 (retest) | **v8: 2 of 14 refusals logged** (the stranger's `command.place`, the editor's `command.restore`). The other 12 left no line. **v9: 14 of 14 logged**: 12 `access.denied` lines plus the stranger's rejected `room.join` and `command.place`, each with the right `actorId` and code | **PASS after fix** (FAIL on v8) | baseline: [fly-baseline-log-excerpt.tsv](crit-10/fly-baseline-log-excerpt.tsv); retest: [fly-postfix-log-excerpt.tsv](crit-10/fly-postfix-log-excerpt.tsv) | D-1 → [`a9d4a97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a9d4a97); regression test fails before, passes after |
| C10-09 | Logging outlives the crit and excludes secrets: structured stdout, readable later with `flyctl logs`; no password, cookie, CSRF, recovery code or invite token | Scan of 1,944 lines from local and Fly (v8, v9) | Fly lines were read back with `flyctl logs` after the requests finished. Secret-named keys: 0. Probe password literal: 0. `sw_session`: 0. `token=`: 0. Refusal lines carry no titles or tokens (asserted by the regression test) | PASS | scan results in this report; [`src/server/log.ts`](../../src/server/log.ts) key filter | Retention length on Fly is unknown; not measured |
| C10-10 | Entry from the URL alone: `/` leads to registration, a work, an invitation link; an invitee at the link registers and comes back to confirm | Playwright walk-through, two fresh contexts, no test hooks or test flag · local fixed production build; route probe · Fly v9 | Ada: `/` → "Start building" → register → create work → People → invitation link. Bo (no cookies) → link → "Ada invited you to build" → Create an account → back to the invitation → "Join as Bo" → workshop. Fly v9: `/`, `/register/`, `/join/` answer 200 with the app shell | PASS (full flow local; Fly checked by route only) | [invite-landing.png](crit-10/invite-landing.png), [owner-sees-partner.png](crit-10/owner-sees-partner.png), [url-alone.spec.ts](../../scripts/crit10/diag/url-alone.spec.ts) | The full browser flow wasn't run on Fly: the diag spec refuses non-local URLs so it can't leave test accounts in production |
| C10-11 | Separate Chrome profiles share nothing, and each sees the other | Playwright, isolated browser contexts · local | URL-alone run: Bo's context had 0 cookies before the link, the two sessions reported different account IDs, and each saw the other in presence. `together.spec.ts` (ghosts, simultaneous placement, own cameras, reconnect) passed in the full suite | PASS (local) | [url-alone.spec.ts](../../scripts/crit10/diag/url-alone.spec.ts); suite result below | — |
| C10-12 | The permission decision is documented with reasons | Doc review | [ADR-0005](../adr/0005-identity-and-permissions.md): opaque server sessions, owner/editor roles re-checked in the coordinator, the same 404 for non-members, rejected alternatives and their costs. BRIEF AUTH-02 lists exactly what each role may do and states "hidden frontend buttons are not a security boundary". The new refusal logging is documented in [`logs-demo.md`](../logs-demo.md) | PASS | linked docs | — |
| C10-13 | `reflections/crit-10.md` present and answering both prompts | File check | Present; both prompts answered; 281 words in the body. Marked as an agent draft for the author to revise | PASS (draft) | [`reflections/crit-10.md`](../../reflections/crit-10.md) | Author must revise it into their own account |
| C10-14 | `PROCESS.md` describes this crit's working method and agrees with the verified state | Doc review + `pnpm check:evidence` | Crit 10 section added; "What's verified" updated to this run. `check:evidence` passes | PASS (draft) | [`PROCESS.md`](../../PROCESS.md) | It is still about 2,300 words against the final 900–1,100; the rewrite is the author's |
| C10-15 | Local checks | `pnpm` scripts · local | Pre-fix: typecheck 0, build 0, unit 123/123, contract 53/53. Fixed: typecheck 0, unit **124/124** (+1 regression), contract 53/53, integration 13/13, browser **28/29**: the only failure is F3 method A (D-2). F3 then passed 10/10 in a loopback-only namespace on the same build | PASS with one environment-dependent browser failure (D-2) | logs summarised in this report | D-2: test comment only, no assertion changed |
| C10-16 | Shipped checks against the deployed app | Read-only invariants against Fly v9; full spec in CI on the deployed image | `spec/invariants.test.ts` against Fly v9: 2/2. CI run 39513661519 ran all 53 specs against the Docker image Fly deployed: 53/53; `check:evidence` passed | PASS (invariants on Fly; contract specs in CI on the same image) | [CI run 39513661519](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/actions/runs/39513661519) | The full `pnpm check` was **deliberately not run against Fly**: the specs publish exhibits and create accounts they don't all remove, and those would appear in the public gallery classmates browse at the crit |
| C10-17 | Deployment: the deployed revision equals the tested commit; health answers; CI green | GitHub deployments API, `flyctl releases`, curl | Latest deployment record: `ffa5830`. Fly release v9 completed. CI check + deploy: success. `/healthz` `{"ok":true}`; `/readyz` 200, `rooms:0`, `rssMiB:105` | PASS | [fly-readyz-ffa5830.json](crit-10/fly-readyz-ffa5830.json) | Report/PROCESS/reflection commit after `ffa5830` is docs-only; its deploy is checked again by CI |
| C10-18 | Live crit: two classmates use the app from the URL in separate Chrome profiles while the author narrates from the logs | Human session · Fly | — | NOT RUN (human activity) | — | Not automatable; nothing here claims it happened |

## Diagnoses

### D-1 · C10-08: refusals invisible in the logs, a product defect

- **Symptom.** On Fly v8, the probe's editor made 7 owner-only attempts and
  its stranger made 7 attempts on the work. The server refused all 14
  correctly (C10-05, C10-06). Only 2 left a log line, both through the
  command pipeline, which logs every outcome.
- **Evidence.**
  - [fly-baseline-log-excerpt.tsv](crit-10/fly-baseline-log-excerpt.tsv)
    has no line for Blake's rename, invite, member removal, archive or
    trash, and none for Casey's rename, invite or socket join.
  - The same probe on the local production bundle gave the same result:
    [local-prefix-log-excerpt.tsv](crit-10/local-prefix-log-excerpt.tsv).
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
    [prefix output](crit-10/access-log-test-prefix.txt)) and passed after
    ([postfix](crit-10/access-log-test-postfix.txt)).
  - Probe re-run locally ([excerpt](crit-10/local-postfix-log-excerpt.tsv))
    and on Fly v9 ([excerpt](crit-10/fly-postfix-log-excerpt.tsv)): 14 of 14
    refusals logged with the correct actor.
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
    ([host](crit-10/d2-offline-order-host.json)). On this host,
    `setOffline(true)` fires the page's `offline` event within 1 ms. The
    client's `onOffline` calls `drop()`, which closes the socket (code 4000)
    before the test's own close. This happened in 3 of 3 attempts.
  - The same diagnostic inside `unshare --net` (loopback only, as Crit 9's
    `run.sh` used) got no `offline` event, and the socket was still open at
    the trigger in 3 of 3
    ([netns](crit-10/d2-offline-order-netns.json)).
  - F3 re-run inside the namespace on the same build passed 10 of 10, with
    the indicator 0.5–0.8 ms after the close
    ([netns attempts](crit-10/d2-f3-netns-attempts.json); failed host run
    kept as [host attempts](crit-10/d2-f3-host-attempts.json)).
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

### Not defects, recorded to avoid misreading

- On Fly the probe's own `ws.disconnect` lines are missing after cleanup.
  The account deletions ran before the socket closes arrived, and
  `afterAccountDeleted` removes those connections itself. Its
  `account.delete` line carries counts but no actor ID, by design
  ([ADR-0007](../adr/0007-account-deletion.md)), so that line alone can't be
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
- **Docs agree.** [`logs-demo.md`](../logs-demo.md)'s new section uses real
  post-fix lines. PROCESS.md's "What's verified" now matches this table.
  Implementation-status OPS-03 lists the new events.
- **Not verified by this run.**
  - Frame rates on real devices.
  - Latency for real users on other networks (the probe ran from this
    machine only).
  - Anything about whether classmates find the app usable.
