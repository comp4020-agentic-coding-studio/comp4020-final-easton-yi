# Process overview

> Drafted by the coding agent (Claude) at the author's request, from the
> session record, the test and measurement logs and the commit history. It
> states what happened, not how anyone felt about it. The author should revise
> it into their own account before the final submission.

## From brief to harness

Before any code was written, the repository gained two documents in `docs/`.
[`BRIEF.md`](docs/BRIEF.md) is the product contract: numbered rules (NAV,
WORLD, CAM, PLACE, PHYS, SYNC, AUTH, SAVE, PUSH, HEIGHT, LOOK, ACCESS, OPS) and
sixteen acceptance scenarios. [`INITIAL_PROMPT.md`](docs/INITIAL_PROMPT.md) is
an implementation directive: a default stack, a database model, a
transactional save design and seven gated stages (P0–P6). Each stage had to end
with a running slice, evidence and a status update before the next began. Both
were committed unchanged as the first piece of work
([`a46e7ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a46e7ed)),
on top of the course template
([`02d15eb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/02d15eb)).

The working harness for the agent was the directive itself, not `CLAUDE.md`,
which is still empty. Its rules were concrete: read the brief, the course
configuration and the shipped tests in full first; don't weaken a rule or edit
the shipped invariants; no client-only persistence, fake multiplayer or fake
physics; tune parameters only with recorded measurements; keep
[`docs/implementation-status.md`](docs/implementation-status.md) as the resume
record, with a status for every rule; and never invent user feedback,
deployment results or reflections.

## Stack, and why

The full decision record is [ADR-0001](docs/adr/0001-stack.md). In short: one
Node 24 process (the course pin) on the course's single 256 MB Fly machine. The
main thread handles HTTP, WebSockets and password hashing. One worker thread
owns SQLite on the `/data` volume and every live Rapier physics world, so every
command, physics step and save runs in a single order. The client is React
for the controls around a Three.js scene the app owns directly. The
alternatives considered and rejected were client-side physics (two people
would see different collapses), an external database (outside the course's
one-machine setup) and deterministic replay as the source of truth (fragile
across engine versions). Five more ADRs record the other load-bearing
decisions: [server physics authority](docs/adr/0002-server-physics-authority.md),
[transactional snapshots](docs/adr/0003-transactional-snapshots.md),
[placement assistance](docs/adr/0004-placement-assistance.md),
[identity and permissions](docs/adr/0005-identity-and-permissions.md) and
[simultaneous placement](docs/adr/0006-simultaneous-placement.md), the
multiplayer trade-off for Crit 9.

The stack held up, but one dependency didn't. The directive's default physics
release, Rapier 0.21.0, pushed one process to 261 MiB with a single world: over
the machine's whole budget. Measuring three releases side by side
([M-001](docs/measurements.md)) led to pinning 0.19.3, about 100 MiB lower.

## How the work was run

Each stage was implemented, run, inspected and corrected before moving on,
and committed when its gate passed:

- **P0–P1, server core**
  ([`7a66c19`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7a66c19)):
  physics fixtures on the real engine, transactional placement, accounts, HTTP
  and WebSocket contract specs, and tests that kill the server at each point of
  the save transaction.
- **P1–P2, client**
  ([`7b5d645`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7b5d645)):
  the workshop, placement maths with unit tests, the production Dockerfile and
  the first browser test.
- **P3, collaboration**
  ([`7f223c3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7f223c3)):
  two real sessions, invitations, leases, ghosts and reconnects.
- **P4–P5, versions and capacity**
  ([`49f2ef6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/49f2ef6)).
- **P5–P6, accessibility and docs**
  ([`e3afd00`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/e3afd00)):
  browser tests at both marking viewports, the log demo and the acceptance report.

Every check runs against a running server, as the shipped harness does. The
contract specs run against the production build.

## Where it was corrected

Most of the value came from tests and measurements contradicting a first
attempt. The ones that changed the design:

- **Same-tick placements.** Rapier's spatial index only refreshes when the
  world steps, so two placements in one tick couldn't see each other. The
  placement check now compares directly against every stick, with a
  regression test.
- **Motion was never checkpointed.** The kill-mid-fall test found that two
  clocks were being compared, so the 500 ms checkpoint never fired. Fixed
  before any user could lose motion.
- **A misleading message.** In the first browser test, "Vertical" about the
  centre sank half the stick into the table, and the UI said "move it closer
  to the table". Out-of-bounds now names below, above or too far.
- **Offline detection.** The two-browser test showed a dead connection can
  stay "open". The client now reacts to the browser going offline and to a
  silent server.
- **Memory.** The capacity profile (3 rooms × 4 sessions × 200 sticks) peaked
  at 278 MiB. Heap caps and a lower-memory OWASP-listed password hash brought
  it down ([M-004](docs/measurements.md)).
- **A table that wouldn't let piles settle.** In the same profile, a stick
  lying over the table's curved rim jittered indefinitely and kept whole piles
  awake. More solver iterations didn't fix it, a convex table sank sticks
  through it, and a full mesh table was 3.5× slower. The adopted fix is a
  centre cylinder with a mesh rim ring. It became physics configuration v2;
  works created earlier keep v1 ([M-005](docs/measurements.md)).

Test bugs were also found and fixed honestly, never by weakening a rule. One
test computed free fall wrongly; another expected the wrong error code. One
check depended on timing that shared rooms didn't guarantee, and one test
client didn't send heartbeats.

## A change after P6: owner-controlled deletion

On 2026-10-06 the author gave a new directive
([`docs/OWNER_WORK_DELETION_PROMPT.md`](docs/OWNER_WORK_DELETION_PROMPT.md))
reversing the brief's exclusion of permanent work deletion, for whole works
only. The agent added owner-only trash, restore and permanent deletion, then
corrected the brief and directive in place (brief DOC-05 lists every rule
touched). Two things were caught on the way: the brief already used SAVE-09,
so the new rules became SAVE-10 to SAVE-12; and the first version of the new
spec created so many accounts that a single `pnpm check` run would have hit the
registration rate limit, so it now shares accounts across tests. Before
shipping, the author asked for four gaps to be closed; that also corrected the
exhibit limit to count withdrawn exhibits, as the brief's storage limit
intends. Individual stick deletion stays out of scope.

## A second change: graphics quality

Also on 2026-10-06 the author gave
[`docs/GRAPHICS_QUALITY_PROMPT.md`](docs/GRAPHICS_QUALITY_PROMPT.md): replace
the renderer's one-way downgrade with an Auto/High/Medium/Low setting, keep
High exactly as it was, and stop drawing when nothing moves. The agent
captured High screenshots from the unchanged build first, then compared the
finished one against them under the same geometry, camera, viewport and DPR:
the 3D scene is pixel-identical. Brief rules LOOK-04 and OPS-05 and scenarios
AT-21 and AT-22 were added, OPS-02 was corrected in place, and
[M-007](docs/measurements.md) has the numbers. Two existing defects came to
light while testing it. On a phone, a long status line made the workshop wider
than the screen; the old phone screenshot showed it, but no test checked the
stage's width. And every workshop re-render created a throwaway WebGL context
until Chrome evicted the scene's own. The always-on render loop had hidden the
second one by redrawing after a restore. Both are fixed and tested. A review
pass then found that Auto's first recovery rule was practically unreachable:
it needed 15 s of one uninterrupted animation, and a simulated ten minutes of
ordinary building at a steady 60 Hz never left Low. Evidence may now build up
across interactions up to 10 s apart, and repeated failed upgrades back off
and then stop ([M-008](docs/measurements.md)). Only headless software
rendering was available, so nothing is claimed about frame rates on real
devices.

## A third change: permanent account deletion

On 2026-10-12 the author gave
[`docs/ACCOUNT_DELETION.md`](docs/ACCOUNT_DELETION.md): permanent deletion of
an account and everything it owns, while works it only helped build survive
without its identity. The decision and the full deletion inventory are in
[ADR-0007](docs/adr/0007-account-deletion.md); the brief gained AUTH-06 and
AT-23. Reading the schema before writing code turned up three things the
directive couldn't know:

- A version's creator was `NOT NULL` with a foreign key to the account, so it
  couldn't be cleared without a migration that rebuilds the table.
- The trash guard trigger would have refused the metadata rewrite in a
  collaborator's trashed work, which would have blocked every such deletion.
- Exhibits freeze contributors' names, not their IDs, so finding the deleted
  person's name needed each public stick's attribution index.

The foreign keys became the check on the inventory: the account row is deleted
last, so anything missed fails the transaction instead of being left behind.

One defect was caught by the new tests rather than by review. When notifying a
collaborator failed, the code had already cleared that window's work, so the
heartbeat fallback had nothing to check and the window would have stayed open,
dead, without being told. That window's work is now cleared only after the
notice is sent. Two test mistakes were fixed as well: a placement that collided
with an existing stick, and an HTTP command built from a work's state after
that state had stopped answering.

## Testing collaboration for Crit 9

On 2026-10-12 the author gave
[`docs/crit9-local-multiplayer-test-prompt.md`](docs/crit9-local-multiplayer-test-prompt.md):
a bounded local test of multiplayer behaviour, with no product changes. The
agent read ADR-0002, 0006 and 0007 and the configured limits first. It then
built a protocol suite and a browser suite and ran them, with the existing
collaboration, restart and lifecycle suites, four times in a disposable
environment. That environment had no network beyond loopback and an emptied
environment (the shell held a Fly token). Real-time sync, ordering, conflicts,
reconnects, restarts, permissions and lifecycle behaved as documented.

The runs also surfaced four open findings, none fixed:
- the reconnect indicator sometimes didn't appear within 5 s of a forced
  socket close;
- piles sometimes take over a minute to settle, delaying versions;
- a partner's commit can take a held stick's spot without saying so;
- a few automated clicks were dropped by a momentarily disabled button.

The run also caught the harness's own mistakes, chiefly matching server log
lines to placements by order. A clock step on WSL2 would have made those
server-side timings look meaningful. Report:
[`docs/evidence/crit-9-local-multiplayer-report.md`](docs/evidence/crit-9-local-multiplayer-report.md).

## Following up the Crit 9 findings

On 2026-10-12 the author asked for a bounded diagnosis of three items from
that report, with minimal fixes only for confirmed defects.

**Slow settling** was traced to the table, not the save logic or the test.
Rebuilding the browser's construction in-process with the server's own room
code showed a single stick vibrating at about 1 u/s, sunk 0.28 u into the
centre cylinder. A positional map then showed Rapier's cylinder only supports
a resting box inside the square |x|+|z| ≤ r; anywhere in its diagonal edge
zones a stick sinks and never settles, so versions wait forever. Physics
config v3 replaces the cylinder with eight flat square boxes, for new works
only. Its effect and cost are recorded in M-009b and the report.

**The reconnect-indicator failure** was the test's doing. Under Playwright's
offline emulation, a page-initiated close sometimes stalls with no close
event; it was reproduced once in five attempts while frames were streaming.
The app's indicator followed every real close within about 2 ms. The M08
check now closes before going offline, and asserts that a socket was really
closed.

**The build-dependent protocol suite** moved to a new `pnpm test:integration`.

Harness mistakes were found on the way and fixed:
- a mutation observer attached before `<html>` existed;
- a helper socket without heartbeats;
- a regression test whose rotation never reached the zones it was meant to
  test.

Report: [follow-up section](docs/evidence/crit-9-local-multiplayer-report.md#follow-up--2026-10-12-diagnosis-and-fixes).

A final verification pass the same day found a defect in that fix. The eight
squares leave notches between their corners, so 73 u² of the visible
tabletop near the edge had no collider. v3 was amended before any deployment:
its rim ring now starts at 14.5. A coverage scan then found no unsupported
point inside the rendered table and no supported point outside it. The same
pass scoped the test-only socket hook to the caller's own session, and
confirmed it doesn't exist in production builds.

## Verifying Crit 10 against the deployed app

On 2026-10-21 the author gave
[`docs/CRIT10.md`](docs/CRIT10.md): a bounded verification-and-repair cycle,
not new features. The author set the terms in advance:

- acceptance checks with IDs, written down before any code changed;
- every failure classified (product, test, environment or unclear evidence)
  before any fix;
- minimal fixes only, each with a retest, with original failures kept;
- local, deployed and human results kept apart;
- a closing audit of the evidence.

The agent wrote the matrix, then a probe that plays an owner, an invited
editor and a stranger against a URL and deletes its accounts afterwards. It
ran the probe against Fly while tailing `flyctl logs`, and matched log lines
to actions by actor, work and command IDs.

The server refused every attempt on someone else's work. But 12 of 14
refusals left no log line, so nobody narrating from the logs could see one
person trying to change another's work: the crit's own finding. The fix
logs each refusal with actor, action and work
([`a9d4a97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a9d4a97)),
with a test that failed before it. After CI deployed it, the same probe on
Fly showed 14 of 14.

Two other failures were not product defects, and the product was not changed
for them:

- the probe's own two sticks overlapped, so the server's rejection was
  correct;
- an older reconnect test assumes the browser never fires `offline`, which
  holds only inside the isolated network Crit 9 used. On a normal host the
  app closes its socket first, as designed. The assumption is now written in
  the test; no assertion changed.

The full contract suite was not run against Fly, because it would leave test
exhibits in the public gallery. CI runs it against the same image instead.
The record is
[`docs/evidence/crit-10-verification.md`](docs/evidence/crit-10-verification.md).

This changed how the agent was directed more than what it built: the author
set what counted as done and the limits of autonomous work, then reviewed one
report instead of rechecking each step. That doesn't make the result
correct by itself. The audit lists what stays unverified, and the live crit is
still the author's to run.

## What's verified and what isn't

The app is deployed to `comp4020-final-easton-yi.fly.dev` at
[`ffa5830`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/ffa5830)
(Fly v9, CI green). On Fly:

- two identities, invitation, shared editing, sub-second propagation and
  server-side refusals pass;
- `flyctl logs` attributes every action and refusal;
- the shipped invariants pass.

Locally:

- 124 unit and restart tests, 53 contract checks against a production build
  and 13 integration tests pass;
- 28 of 29 browser tests pass. The exception is the reconnect test above,
  which passes in its isolated network.

Not yet done:

- latency and capacity measurements on the Fly machine;
- any session with people who didn't build it, including the Crit 10 demo
  itself. The protocol is in [`acceptance-report.md`](docs/acceptance-report.md).

The README's "what good means" section is still a draft awaiting the author's
own reading and position.
