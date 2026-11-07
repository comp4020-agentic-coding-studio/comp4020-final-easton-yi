# Crit 9 Local Multiplayer Testing Agent Prompt

Run a thorough, bounded local test of this project's multiplayer collaboration and produce evidence I can use when writing my Crit 9 reflection.

The goal is to verify behavior, identify defects, and explain the evidence. This is a testing task, not a feature-development task. You may add isolated test fixtures, scripts, test-only hooks, and a factual report. Do not change product behavior to make tests pass, rewrite existing assertions to hide defects, fabricate results, or write my personal reflection. Report product defects with reproducible steps and proposed fixes.

All tests must use a disposable local environment. Do not connect to, register users on, write to, migrate, reset, or delete anything in the real deployed application or its database. Do not deploy or push changes.

## 1. Inspect the repository and establish expectations

Read AGENTS.md, package scripts, configuration loading, database setup, authentication, room lifecycle, WebSocket handling, existing tests, PROCESS.md, and relevant ADRs. Inspect ADR-0002 and ADR-0006 if present, including the documented simultaneous-placement policy; inspect ADR-0007 and docs/04-accounts/04-02-account-spec.md if account deletion is present. Also read docs/90-reference/90-05-acceptance-report.md, docs/90-reference/90-02-measurements.md, and the existing organization under docs/evidence/ before writing reports. Look for existing collaboration tests such as spec/collaboration.test.ts and tests/e2e/together.spec.ts, but verify actual paths.

Determine from the repository:

- Framework, database, server entry points, build/test commands, and local startup procedure.
- Effective database and resource paths, runtime environment precedence, API/WebSocket origins, external services, and background workers.
- How invitations, owner/editor permissions, room capacity, queues, ghosts, placements, persistence, versions, recovery points, exhibits, Archive, Trash, and permanent deletion actually work.
- The actual concurrency rule and its alternatives. Do not invent a rule such as “both placements must always succeed.”
- Whether account deletion and graphics modes have been implemented. Test them conditionally; do not build missing features.
- Relevant limits from actual configuration. Do not assume previously discussed numerical limits are still current.

Use the supplied Crit 9 criteria as context: visible updates across open sessions in approximately one second without reloading; one justified multiplayer/concurrency decision; repository evidence of process; and the ability to explain direction, correction, and a rejected alternative. This local task cannot certify deployment behavior or submission compliance.

## 2. Mandatory isolation gate before any application startup or mutation

A localhost browser URL alone does not prove isolation. Verify all of the following before running migrations, fixtures, authentication tests, or mutation scripts.

1. Create a unique disposable test directory and run identifier. Never reuse the user's normal development database, uploaded files, browser profile, or existing accounts.
2. Use a fresh local database initialized from repository migrations. For SQLite, resolve the absolute real path, ensure it is inside the disposable directory, and reject symlink/path escapes. For a database server, use a dedicated local instance/container and a fresh test database with credentials scoped to it. Never use a production database dump.
3. Start the app with explicit test configuration. Inspect framework dotenv precedence and subprocess inheritance so production values cannot override it. Supply only necessary environment values, including fresh test secrets. Do not print environment dumps, connection passwords, production secrets, or tokens.
4. Identify effective API, WebSocket, session-store, object-store, file-output, queue, telemetry, email, and worker targets. Point them to the dedicated local services/directories or disable irrelevant external integrations through existing test configuration.
5. Check for database proxies, SSH/Fly tunnels, shared volumes, remote service defaults, and host mounts. Loopback is not safe if it forwards to a remote database. Verify the ownership and origin of the local service rather than trusting its hostname.
6. Do not run deployment commands, production migrations, Fly SSH/database commands, cloud admin commands, or scripts whose destinations have not been inspected. Never use a production URL as a fallback when the local server fails.
7. Use fresh browser contexts with local base URLs and no imported cookies/storage. Assert that invitations, redirects, fetches, and WebSocket connections stay within the approved local endpoints.
8. Apply fail-closed network restrictions to the test runtime where supported: allow only the explicitly identified local test services, and deny other application HTTP/WebSocket traffic. Browser HTTP routing alone is not enough to isolate server-side connections or WebSockets. Inspect and guard backend targets as well. If required assets are external, use existing local assets or report the resulting limitation; do not enable access to the deployed app.
9. Give test scripts explicit database/base-URL arguments and checks that reject non-test paths or origins before destructive setup/cleanup. Do not make checks depend only on NODE_ENV or a variable named TEST.
10. Record a sanitized isolation manifest: local origin and ports, resolved test database location/name, temporary resource directory, environment mode, test server PID/container, and network safeguards. Do not include credentials.

If a dependency or destination cannot be proven local and disposable, stop the affected execution and report the concrete blocker. Continue safe inspection and test preparation. Do not proceed on the assumption that an environment file is safe.

Do not query production “to verify that it was unchanged.” The evidence is the isolated configuration and restricted execution, not a production database read.

## 3. Local setup and test identities

Prefer existing project test tooling and real local application services. Use protocol-level integration tests for controlled races and browser E2E for visible behavior. Mock unrelated external integrations only; do not mock away the collaboration path being evaluated.

- Record the commit SHA, branch, whether the working tree was already dirty, relevant local changes, runtime versions, and startup mode. Do not reset or overwrite user changes.
- Prefer a production build served locally when supported. If a development server is required, identify it in the report.
- Start a new known local server on an unused port. Do not reuse an unidentified server.
- Create synthetic users A (owner), B (editor), C (second editor), and D (outsider), subject to actual capacity. Open independent browser contexts so cookies are isolated.
- Create work W owned by A and invite B and C through the real local invitation flow.
- Create work X owned by B, with A participating if supported, to test isolation and ownership boundaries.
- Include a second session for A when checking session revocation.
- Use unique synthetic names prefixed with the run identifier. Never send real email or messages.
- Keep destructive scenarios in separate fixtures/databases where practical so one deletion does not invalidate subsequent tests.

Run core tests first. Keep testing bounded and within configured limits. Use controlled barriers rather than arbitrary sleeps for concurrency.

## 4. Required multiplayer test cases

For every case, record preconditions, actions, expected behavior derived from the code/ADR, observed result, and evidence. Mark PASS, FAIL, BLOCKED, NOT RUN, or NOT APPLICABLE, using the definitions in Section 7. Do not count skipped tests as passed.

### M01 Independent identities and invitation joining

- Register/log in A and B in different contexts and verify that they have different server-side identities.
- A creates W and generates an invitation; B follows the local invitation and joins the same work.
- Repeat with C if capacity permits.
- Verify roles, shared work identity, participant display, and initial scene agreement.
- Refresh B once to verify membership persists. This refresh is setup/persistence verification, not evidence of live synchronization.
- Verify an outsider cannot acquire editor access merely by guessing the work ID.

### M02 Bidirectional visible synchronization without reload

- Keep A, B, and C open on W.
- A places a valid stick; B and C must see the committed stick without refresh or navigation.
- Repeat from B and then C. Ensure every other open session receives the update.
- Compare accepted object IDs, transforms, counts, and authoritative revisions/order where exposed. Scene counts alone are not sufficient.
- Distinguish transient ghost previews from committed sticks. Receiving a network event is not sufficient evidence that the scene rendered it.
- Verify no duplicate sticks, unexplained disappearance, or stale scene state.

### M03 Ghosts and participant awareness

- Move/rotate a placement preview in A and observe the intended remote preview in B/C.
- Verify it is distinguishable from a committed stick and corresponds to the correct participant.
- Place, cancel, leave, and disconnect according to supported actions. Confirm stale ghosts and presence entries are cleared within the documented policy.
- Do not require ghost state to persist in the database.
- Check an initial ghost snapshot does not become a duplicate real stick when a commit arrives.

### M04 Simultaneous valid placements at independent locations

- Use a barrier to submit A and B's valid placements nearly simultaneously against a shared starting state. Repeat a small deterministic set of interleavings.
- Check outcomes against the documented concurrency policy. If non-conflicting placements are intended to be accepted, ensure neither is lost because of a stale global revision.
- Every accepted command must have exactly one persisted effect; all clients must converge on the same accepted state.
- Verify a losing/rejected request, if allowed by policy, receives explicit feedback and does not leave a phantom local stick.
- Capture command outcomes and ordering rather than inferring success from screenshots alone.

### M05 Conflicting or stale simultaneous operations

- From the ADR and validation rules, choose an actual conflict, such as two placements invalidating the same constraint. Do not assume physical overlap is prohibited unless the application enforces it.
- If geometric overlap is valid, test a real stale-state/lifecycle conflict instead and explain the substitution.
- Trigger the race deterministically. Verify the documented resolution, clear rejection feedback, and eventual agreement across all clients.
- Confirm rejected input does not corrupt the scene, consume unintended persistent state, or silently overwrite accepted work.
- Explain which behavior demonstrates the selected alternative's tradeoff.

### M06 Rapid alternating operations and bounded limits

- Alternate a modest sequence of valid commands from A/B/C within the configured rate limits.
- Verify that every accepted command is accounted for exactly once and all clients converge.
- Separately exceed a configured command/room limit by a small controlled amount, if applicable. Verify explicit rejection/queue behavior and recovery afterward.
- Do not perform a load or denial-of-service test. Do not disable rate limits to obtain favorable timing results.

### M07 Join during active editing

- While A and B continue a controlled edit sequence, join C.
- Verify initial snapshot and live updates combine without a gap or duplication, including operations arriving during snapshot handoff.
- Compare C's final state with A/B and persisted state.
- Check ghost/presence initialization separately from durable scene initialization.

### M08 Disconnect and reconnect

- Disconnect B's actual WebSocket while leaving A connected. Use tooling verified to affect existing sockets; setting a browser “offline” flag is not sufficient unless socket closure is observed.
- Have A commit several valid edits, then reconnect B.
- B must recover authoritative state without losing accepted edits or duplicating sticks.
- Attempt a B-side edit during disconnection if the UI permits it. Verify the documented disabled/queued/rejected behavior and honest feedback; an unacknowledged optimistic change must not appear permanently saved.
- Check repeated reconnect attempts do not create duplicate memberships, listeners, sockets, ghosts, or commands.

### M09 Background tab and render wakeup

- Put B in a genuinely backgrounded tab/window or use a supported visibility-testing mechanism, recording which method is used. Headless automation alone does not prove actual browser background throttling.
- A commits edits while B is inactive. Return to B and verify the latest state becomes visible without reload or manual scene interaction.
- If demand-driven rendering or quality modes exist, repeat the relevant idle-to-update case in supported modes.
- Separate “network state received” from “render loop woke up.” If real background behavior cannot be exercised, mark that portion unverified.

### M10 Work and room isolation

- Keep A/B editing W and another context viewing/editing X.
- Confirm commands, ghosts, membership changes, and scene snapshots from W do not leak into X.
- Attempt a direct command with a mismatched work/room identifier using test credentials. Verify server-side authorization rather than relying on hidden UI controls.
- Ensure the rejection does not damage either room.

### M11 Permission changes and invitation lifecycle

- Verify editors can perform permitted collaboration actions and cannot invoke owner-only actions through direct HTTP/WebSocket requests.
- Exercise supported editor leave/removal behavior. A departed/revoked editor's existing socket must not retain write access.
- Revoke an invitation and confirm it no longer admits a new user. Do not assume invitation revocation removes already-established memberships unless documented.
- Test expired/exhausted invitations only if supported, using a controlled local clock or fixtures.
- Verify unauthorized responses do not disclose private scene content.

### M12 Save and server restart

- Make accepted collaborative edits and exercise supported save/version/recovery actions.
- Restart only the server process started for this run, keeping the same disposable database.
- Reconnect and verify accepted persisted content, membership, and relevant history remain consistent.
- Confirm ephemeral ghosts are not resurrected as durable content.
- If crash durability is explicitly claimed, add one controlled process-kill test and compare against the actual acknowledgement/persistence contract; report any accepted-but-lost edits.

## 5. Lifecycle scenarios that affect collaborators

Use fresh local fixtures. These supplement the core multiplayer evidence.

### L01 Archive and restore

If implemented, archive W while B is connected. Check the documented room closure/editing restriction, B's notification, and post-archive access. Verify public exhibits follow the repository's policy independently of room state. Restore and confirm valid access/state returns without duplicated content. Do not invent expected exhibit removal on archive.

### L02 Trash and permanent work deletion

If implemented, move W to Trash while B is connected. Verify room closure, invitation and exhibit behavior, editor visibility, and denial of stale commands. Restore in one fixture; permanently delete from Trash in another. Trigger a delayed autosave/queued command after permanent deletion and verify it cannot recreate W. Do not assume the account-deletion flow and work-deletion flow have identical preconditions.

### L03 Exhibits and ongoing editing

If publication is implemented, publish W locally and inspect it in a separate local visitor context. Continue editing W. Verify exhibit behavior matches the actual snapshot/live model and does not grant editing rights. Test withdrawal and related open-view behavior according to the documented policy. Do not modify that policy during testing.

### L04 Account deletion during collaboration

Only if the feature exists, use a dedicated disposable account A with two sessions, owned work W, and editor membership in B's work X.

- Cancel the deletion dialog once and submit an incorrect password once; neither should delete data.
- Then delete A through the real UI with valid test credentials.
- Verify A's initiating session returns to the unauthenticated screen, A's other session loses access, and B/C cannot keep editing W.
- Verify owned works and relevant dependent records are removed; old recovery/session credentials cannot authorize access.
- Verify X remains available to B, A's membership/identity associations are removed according to the deletion contract, and retained contributions load correctly.
- Use a barrier to race deletion with placement or delayed persistence; deleted works must not reappear.
- If deletion is absent or incomplete, record NOT APPLICABLE or FAIL as appropriate. Do not implement it as part of this testing task.

## 6. Measure latency honestly

Measure normal foreground local synchronization separately from offline recovery, deliberate throttling, rate-limit rejection, and browser background behavior.

- Define two measurements where feasible: sender action/submission to remote committed object rendered, and server acceptance to remote committed object rendered.
- Use a shared monotonic timing reference from the test controller or a clearly justified same-host time mapping. Do not subtract unrelated performance.now() values from different pages.
- Identify each accepted command/object across sender, server, and receiver.
- For a WebGL scene, inspect the actual scene state plus render completion using existing instrumentation or a minimal test-only hook; supplement with a visual check. A WebSocket receive timestamp or DOM counter alone is not proof of rendering. Explain that automation may observe a render frame rather than physical display scanout.
- If only receipt or state-application timing is accessible, report that metric accurately and mark visible-frame latency as unmeasured.
- Collect at least 20 accepted placements total, at least 10 in each direction between A and B, respecting configured rate limits. Observe C as an additional receiver if available.
- Report attempted, accepted, rejected, timed-out, and missing updates. Never discard slow/lost updates to improve statistics.
- Provide sample count, median, p95, maximum, and the number of samples exceeding approximately 1,000 ms, plus the percentile calculation method. Treat 1,000 ms as an operational test target for the supplied “approximately one second” criterion, not an invented official grading rule.
- Report startup/warm-up treatment, server mode, browser mode, and polling/instrumentation overhead. Label statistics from this small sample as descriptive.
- If timing cannot be measured reliably, provide an explicitly qualitative result rather than inventing numbers.
- State plainly: local timing does not establish Fly latency or behavior across different devices or networks.

## 7. Evidence and reporting for reflection

### Report locations and responsibilities

The supplied repository screenshot shows docs/evidence/, docs/01-foundation/, docs/90-reference/90-05-acceptance-report.md, docs/90-reference/90-02-measurements.md, docs/90-reference/90-01-implementation-status.md, and docs/runbook.md. Verify their current contents and preserve their existing roles.

- Main human-readable report and complete check matrix: docs/evidence/crit-9-local-multiplayer-report.md. Use docs/evidence/ rather than introducing a separate docs/testing/ hierarchy.
- Small sanitized supporting artifacts: docs/05-multiplayer/evidence/<run-id>/. Use this for raw timing CSV/JSON, a compact isolation manifest, and relevant result summaries. Reuse an equivalent established convention if one exists and explain the exact chosen paths.
- Reproducible automated tests: existing test directories, not the evidence directory.
- docs/90-reference/90-05-acceptance-report.md: add one concise local-verification summary and a relative link to the report if compatible with the file's existing structure. Preserve previous evidence, dates, and scope. Do not mark deployment acceptance as passed based on this local run.
- PROCESS.md: add a short factual process entry and report link, respecting existing length limits. State the testing direction, what was executed, and any actual correction or next step; do not invent one.
- docs/90-reference/90-02-measurements.md: only add a brief local measurement summary and report link if it is the established measurement index. Keep the full results and raw samples in one canonical location rather than copying entire tables into several documents.
- ADRs: read them to establish expectations and explain tradeoffs. Do not rewrite the selected decision or turn an ADR into the test log. Report any disagreement between the ADR and actual behavior explicitly.
- reflections/crit-9.md: do not write or alter it. The report supplies evidence for the user's reflection.
- Do not update implementation-status.md or runbook.md unless required to correct a specific factual claim or document the new safe rerun command; avoid unrelated documentation churn.

Keep large traces, browser profiles, database files, credentials, and runtime secrets out of version control. Retain only useful sanitized evidence. Use repository-relative links that resolve after temporary resources have been removed. Do not silently replace an earlier run: preserve its summary or give the new run a separate dated record, keeping the main report clear about which run it summarizes.

### A. Executive result and tested scope

Start with a short conclusion restricted to what actually ran. Identify the tested commit SHA, branch, dirty-tree status and relevant uncommitted product changes, run ID, date/time with timezone, runtime/browser versions, local server mode, and synthetic roles.

Report the number of leaf checks in each status: PASS, FAIL, BLOCKED, NOT RUN, and NOT APPLICABLE. State which core multiplayer checks remain unresolved. Do not present a single green badge or “all passed” when required checks were blocked or unexecuted.

Count only leaf checks, not both group headings and their children. If a pass rate is useful, define its denominator explicitly; do not hide unexecuted checks in a percentage.

### B. Isolation and teardown record

Provide a compact table with: safeguard, verified effective value or method, result, and evidence. Cover the local browser/API/WebSocket origins, disposable database, file stores/workers, environment precedence, network controls, independent browser contexts, and teardown.

Include sanitized paths and identities needed to reproduce the test; exclude passwords, cookies, recovery codes, invitation secrets, and sensitive connection strings. State that no production endpoint was intentionally accessed and list the actual controls supporting that conclusion. Do not claim a complete packet-level guarantee if no network-level enforcement or observation was available. If an unexpected external request was observed, disclose whether it was blocked and stop/reassess the affected test.

### C. Master check matrix

Place the large, readable checklist directly in the report body, not only in an attachment or terminal output. Cover every M01–M12 and L01–L04 group. Split independent assertions into stable subcase IDs, such as M02.1 for A-to-B rendering and M02.2 for B-to-A rendering, where this makes different outcomes visible. Never mark an entire group PASS when an important subcheck is unverified.

Use this schema. The row below is a template only, not a result:

| Check ID | Scenario and actors | Expected result | Observed behavior and measurements | Status | Evidence | Finding or next step |
| --- | --- | --- | --- | --- | --- | --- |
| <stable ID> | <specific action and roles> | <observable criterion and ADR reference if relevant> | <what actually happened, including timing/counts/feedback when observed> | <defined status> | <relative test/log/data link or exact automated test name> | <finding ID, verification gap, or None> |

Keep cells concise and link to detailed case records. Use multiple tables with the same columns under core collaboration, recovery/permissions, and lifecycle headings if one table becomes difficult to scan; together they must form one complete matrix.

Apply these definitions consistently:

- PASS: the check executed and its stated assertions were observed to hold.
- FAIL: the check executed and a required assertion was violated. For partial execution, separate independently verified assertions and identify the failure.
- BLOCKED: a specific prerequisite, environment limitation, or tool failure prevented meaningful execution. Include the blocker and what would unblock it.
- NOT RUN: the check applies but was not attempted. Explain why. Do not substitute NOT APPLICABLE.
- NOT APPLICABLE: the feature or scenario genuinely does not exist or apply, supported by repository inspection. A documented required feature that is missing is a finding, not an automatic exemption.

“Looks fine,” “works,” and “no issue” alone are not adequate observations. Describe results such as scene convergence, accepted/rejected counts, missing updates, visible feedback, or stale access rejection. Do not invent illustrative numeric results. If data was not measured, write “Not measured” with the reason.

### D. Detailed cases and defects

For any FAIL, BLOCKED, unexpected behavior, or substantive usability finding, provide:

- A stable finding ID and related check IDs.
- Category: product defect, usability observation, test/environment limitation, or documentation mismatch. A browser/tooling blocker is not automatically a product bug.
- Severity with a concrete rationale. Distinguish data loss/access-control failure, broken core collaboration, recoverable disruption, and minor presentation issues; avoid unsupported numerical quality scores.
- Preconditions, synthetic roles, exact reproducible steps, expected versus actual behavior, and the frequency across recorded attempts.
- Evidence links and the smallest relevant sanitized error/output.
- User-visible impact: what the owner/editor sees, whether the message explains the situation, and whether recovery is possible without refresh or lost work.
- Suggested next action, whether a product change is needed, and the regression check that should verify a later fix.

Preserve the original failed attempt and any rerun outcomes. Do not silently convert a flaky result into PASS. Keep deterministic failures separate from test harness mistakes. Repairing test harness mistakes is allowed, but record the mistake and the corrected rerun; changing product behavior requires a separate task.

For complex passing concurrency/recovery tests, retain enough setup and command ordering to make their evidence reproducible. Do not rely solely on a screenshot of a final scene.

### E. Timing table and measurement limits

Provide a table with metric definition, direction, attempted/accepted command counts, expected receiver observations, received/rendered observations, median, p95, maximum, observations over 1,000 ms, and missing/timed-out observations. Split counts and timing into adjacent tables if needed for readability.

Count accepted commands separately from deliveries: one command observed by B and C creates two expected receiver observations, not two accepted commands. Separate sender-to-render, server-to-render, and receipt-only measurements. Report excluded warm-up samples and the reason; never exclude losses or slow results without disclosure.

Link raw synthetic timing samples and the summarization script or exact calculation method. State whether visibility means a render callback, rendered-frame inspection, or only state receipt. For timeouts, report the observation deadline instead of replacing a missing observation with a fictitious latency.

### F. Concurrency decision and Crit 9 evidence mapping

Use a compact table mapping these areas to actual evidence and remaining limits:

- Local visible real-time synchronization.
- Simultaneous-command ordering and conflict resolution.
- Documented chosen concurrency policy and rejected alternative.
- Agent direction and grounding in existing code/ADRs.
- Any correction actually made during testing, or an explicit statement that none was needed/implemented.
- Deployment and personal reflection, identified as outside this local test's verification scope.

Explain how a tested scenario illustrates the chosen policy's benefit and cost. Discuss an unimplemented alternative as reasoning, not a measured experiment. Tests confirm behavior, not that one design is universally optimal.

### G. Factual material for the user's reflection

Provide a short table with: factual observation, supporting evidence, relevance to reflection, and limit/interpretation. Distinguish user instructions, agent execution, and measured observations.

Do not write first-person claims about what I learned, felt, personally tested, or corrected unless I supplied them. Keep the user's separately reported manual deployed collaboration check distinct from this local run; do not add unprovided browsers, devices, timings, or scenarios to that account.

If all executed tests pass, say “No defect was observed in the tested scope,” not “The system is bug-free.” Do not claim full Crit 9 completion: this report does not independently prove deployment status, cutoff compliance, growing commit history, or completion of the reflection.

### H. Reproduction and final handoff

Include the exact safe setup/test/teardown commands, fixture requirements, and what remains unverified. Refer to temporary credentials by configuration variable or fixture mechanism, not by printing secrets.

The final agent message must include all of the following, in this order:

1. One-sentence outcome explicitly scoped to local testing.
2. Status counts and any unresolved core multiplayer checks.
3. The report path and supporting evidence paths.
4. Actual timing results with their metric definition, sample size, and limits; or a clear statement that reliable timing was unavailable.
5. Important defects/blockers and recommended next actions; distinguish a product fix from a missing verification step.
6. Isolation and cleanup outcome, including any leftover disposable resource or unexpected outbound attempt.
7. Files changed, whether product behavior/code was changed, and whether any deployment or push occurred. Test-only instrumentation changes must be disclosed rather than described as “no source changes.”

The final message is a summary; the full matrix and evidence must be in the report. Do not return only “all tests passed” or a list of commands.

## 8. Completion and cleanup

- Run existing relevant collaboration checks after inspecting their destinations. Avoid unrelated broad test suites unless required by the repository or a concrete regression risk.
- Continue independent safe cases after a failure; do not repeatedly rerun a flaky case until it passes and discard earlier failures.
- Stop the test server, workers, and containers created by this run. Do not kill unrelated processes or use broad cleanup commands.
- Remove only disposable resources whose ownership and path were established by the isolation manifest. Preserve sanitized evidence and useful test code.
- Leave no test accounts in any non-test database and no active background test process.
- Report whether product code was untouched, which test/report files changed, the results, remaining blockers, and any steps requiring later user action.

Proceed autonomously once local isolation is established. If isolation cannot be established, report the precise blocker and leave production untouched. Deliver actual test results and evidence, not just a proposed checklist.

