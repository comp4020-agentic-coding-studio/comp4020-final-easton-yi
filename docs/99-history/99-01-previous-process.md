# Process overview

> Drafted by the coding agent (Claude) at the author's request, from the
> session record, the test and measurement logs and the commit history. It
> states what happened, not how anyone felt about it. The author should revise
> it into their own account before the final submission.

## From brief to harness

Before any code, the repository gained two documents in `docs/`.
[`docs/01-foundation/01-01-product-brief.md`](../01-foundation/01-01-product-brief.md) is the product contract: numbered rules and sixteen
acceptance scenarios. [`docs/01-foundation/01-02-build-prompt.md`](../01-foundation/01-02-build-prompt.md) is an
implementation directive: a default stack, a database model, a transactional
save design and seven gated stages (P0–P6), each ending with a running slice,
evidence and a status update. Both were committed unchanged
([`a46e7ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a46e7ed)),
on top of the course template
([`02d15eb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/02d15eb)).

The agent's harness was the directive itself, not `CLAUDE.md`, which is still empty. Its rules: read the brief and the shipped tests first; don't weaken a
rule or edit the shipped invariants; no client-only persistence, fake
multiplayer or fake physics; tune only with recorded measurements; keep
[`docs/90-reference/90-01-implementation-status.md`](../90-reference/90-01-implementation-status.md) as the resume
record; never invent user feedback, deployment results or reflections.

## Stack, and why

The decision record is [ADR-0001](../01-foundation/01-04-adr-0001-stack.md): one Node 24 process
on the course's single 256 MB Fly machine. The main thread handles HTTP and
WebSockets; one worker thread owns SQLite and every live Rapier physics world,
so every command, physics step and save runs in a single order. The client is
React around a Three.js scene. Rejected: client-side physics (two people would see different collapses), an external
database, and deterministic replay. Five more ADRs cover the other big decisions, from
[server physics authority](../01-foundation/01-05-adr-0002-server-physics-authority.md) to
[simultaneous placement](../01-foundation/01-09-adr-0006-simultaneous-placement.md).

The default Rapier 0.21.0 pushed a 200-stick test to 261 MiB, over the machine's whole budget; measuring three
releases ([M-001](../90-reference/90-02-measurements.md)) led to pinning 0.19.3, over 100 MiB lower in the isolated test.

## How the work was run

Each stage was run, inspected, corrected and committed when its gate passed.

- **P0–P1, server core**
  ([`7a66c19`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7a66c19)):
  real-engine physics fixtures, transactional placement, accounts, and tests that
  kill the server mid-save.
- **P1–P2, client**
  ([`7b5d645`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7b5d645)):
  the workshop, placement maths, the Dockerfile, the first browser test.
- **P3, collaboration**
  ([`7f223c3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7f223c3)):
  two real sessions, invitations, leases and reconnects.
- **P4–P5, versions and capacity**
  ([`49f2ef6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/49f2ef6)).
- **P5–P6, accessibility and docs**
  ([`e3afd00`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/e3afd00)):
  browser tests at both marking viewports and the acceptance report.

## Where it was corrected

Most of the value came from tests and measurements contradicting a first attempt
([details](../90-reference/90-03-process-record.md#where-p0p6-were-corrected)): two placements in one physics tick couldn't see each
other; the kill-mid-fall test found a checkpoint that never fired, because two clocks were compared; the two-browser
test showed a dead connection staying "open"; and a stick on the table's curved rim kept whole piles awake
([M-005](../90-reference/90-02-measurements.md)). Test bugs were fixed, not by weakening a rule.

## Later changes, each from a written directive

After P6 the author steered the work with bounded directives, each committed in `docs/` before the code changed
([account](../90-reference/90-03-process-record.md)).

| Directive | What changed | What it caught |
| --- | --- | --- |
| Owner deletion (2026-10-06) | Trash, restore and permanent deletion of works ([`3a4a700`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/3a4a700)) | A rule-ID clash in the brief; a spec that would hit the registration rate limit |
| Graphics quality (2026-10-06) | Auto/High/Medium/Low; no drawing when idle ([`c363bcf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/c363bcf)) | A phone-width overflow; a throwaway WebGL context per re-render |
| Account deletion, Crit 9 tests (2026-10-12) | Permanent account deletion; a local multiplayer suite; table collider v3 ([`c384c02`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/c384c02)) | A window left open and dead; a cylinder that never let piles settle |
| Crit 10 verification (2026-10-21) | Refusals logged with actor and work ([`a9d4a97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a9d4a97)) | 11 of 13 refusals left no log line on Fly |
| Island upgrade (2026-11-03/06) | A home island with 20 generated landmarks, then revised interaction and portal labels ([`b30a9bb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/b30a9bb)) | A WSL out-of-memory crash from unpaced frames; listener leaks; inverted arches |
| Courtyard and day/night (2026-11-06/07, uncommitted) | New introduction, stone gateways, candle pond and flowers, Auto/Day/Night with a moon, candles on all 20 landmarks | Candles over a river and off pad edges; cups overhanging stones |

Crit 10 changed how the agent was directed: the author set what counted as done, then reviewed one report. The island
kept that, with heavy jobs run one at a time in a capped cgroup after a crash
([`docs/08-world-build/08-04-memory-report.md`](../08-world-build/08-04-memory-report.md)).

Walking the island, the author found that automatic mouse-look hid the cursor. A
[directive](../09-world-controls/09-01-controls-prompt.md) replaced it with left-drag look, an optional
Look lock, Walk/Run/Fly and Return to world; the phone route caught held movement being cleared. The author then asked
for each portal's destination name in its membrane. The lettering measures only about 1.2–1.4:1 against bright sky, and
the author hasn't confirmed it reads, so that stays open.

The next directive ([`docs/10-day-night/10-01-day-night-prompt.md`](../10-day-night/10-01-day-night-prompt.md))
asked for a new introduction, stone gateways, a candle pond with white flowers, Auto/Day/Night with a moon, and candles
on all twenty landmarks. Decisions:

- The gates keep the timber frames' positions and passage.
- The pond is an explicit ground surface, since the terrain is too coarse to carve.
- One shadowed light: the sun by day, a fixed moon by night.
- Candles are resolved against each building's own pieces; no timber changed.

Checks caught candles over L16's river and off two pads, and cups overhanging stones; all were fixed.
Dimensions, counts and screenshots: [`docs/10-day-night/10-02-courtyard-report.md`](../10-day-night/10-02-courtyard-report.md).

## What's verified and what isn't

**Deployed.** CI deployed the island
([`b30a9bb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/b30a9bb)) on 2026-11-06.
Collaboration checks last passed on Fly at
[`ffa5830`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/ffa5830). **The courtyard
and day/night round is uncommitted and not deployed.**

**Local only.** Suites run on a local production build under the memory supervisor. `crit9-reconnect` F3 fails outside its
isolated network; no assertion was weakened. The courtyard round passed 591 of 591 unit tests, `pnpm check`
53 of 53 and 39 of 39 island browser tests on a page clock (the OS clock was untouched). All ran on software WebGL, so
they show behaviour, not frame rate; other browser suites weren't rerun. Per-requirement results:
[status table](../90-reference/90-04-world-status.md). The author hasn't reviewed the visuals.

**Not done.** Frame rate and night appearance on a real GPU; a physical phone; latency and capacity on Fly; any
session with people who didn't build it ([protocol](../90-reference/90-05-acceptance-report.md)). Known limits: L16's crest candles hover
by design, and recipe safe points off the terrain are recorded, not fixed.

The README's "what good means" section is still a draft awaiting the author's own position.

