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

## What's verified and what isn't

The app is deployed to `comp4020-final-easton-yi.fly.dev` and serves its
pages and assets. Against a local production build: 56 unit and restart
tests, 39 HTTP and WebSocket checks (`pnpm check`) and 8 browser tests pass.
Not yet done: re-running the latency and capacity measurements on the Fly
machine, and any session with people who didn't build it. The protocol for
those sessions is in [`acceptance-report.md`](docs/acceptance-report.md). The
README's "what good means" section is still a draft awaiting the author's own
reading and position.
