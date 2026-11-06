# Process overview

> Drafted by the coding agent (Claude) at the author's request, from the
> session record, the test and measurement logs and the commit history. It
> states what happened, not how anyone felt about it. The author should revise
> it into their own account before the final submission.

## From brief to harness

Before any code, the repository gained two documents in `docs/`.
[`BRIEF.md`](docs/BRIEF.md) is the product contract: numbered rules and sixteen
acceptance scenarios. [`INITIAL_PROMPT.md`](docs/INITIAL_PROMPT.md) is an
implementation directive: a default stack, a database model, a transactional
save design and seven gated stages (P0–P6), each ending with a running slice,
evidence and a status update. Both were committed unchanged
([`a46e7ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a46e7ed)),
on top of the course template
([`02d15eb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/02d15eb)).

The agent's harness was the directive itself, not `CLAUDE.md`, which is still
empty. Its rules: read the brief and the shipped tests first; don't weaken a
rule or edit the shipped invariants; no client-only persistence, fake
multiplayer or fake physics; tune parameters only with recorded measurements;
keep [`docs/implementation-status.md`](docs/implementation-status.md) as the
resume record; never invent user feedback, deployment results or reflections.

## Stack, and why

The decision record is [ADR-0001](docs/adr/0001-stack.md): one Node 24 process
on the course's single 256 MB Fly machine. The main thread handles HTTP and
WebSockets; one worker thread owns SQLite and every live Rapier physics world,
so every command, physics step and save runs in a single order. The client is
React around a Three.js scene the app owns directly. Rejected: client-side
physics (two people would see different collapses), an external database, and
deterministic replay. Five more ADRs cover the other big decisions, from
[server physics authority](docs/adr/0002-server-physics-authority.md) to
[simultaneous placement](docs/adr/0006-simultaneous-placement.md).

One dependency didn't hold up: the default Rapier 0.21.0 pushed one process to
261 MiB, over the machine's whole budget. Measuring three releases
([M-001](docs/measurements.md)) led to pinning 0.19.3, about 100 MiB lower.

## How the work was run

Each stage was run, inspected and corrected before moving on, and committed
when its gate passed. Every check runs against a running server.

- **P0–P1, server core**
  ([`7a66c19`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7a66c19)):
  real-engine physics fixtures, transactional placement, accounts, and tests that
  kill the server at each point of the save transaction.
- **P1–P2, client**
  ([`7b5d645`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/7b5d645)):
  the workshop, placement maths, the production Dockerfile, the first browser test.
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
([details](docs/process-log.md#where-p0p6-were-corrected)): two placements in one physics tick couldn't see each
other; the kill-mid-fall test found a checkpoint that never fired, because two clocks were compared; the two-browser
test showed a dead connection staying "open"; and a stick on the table's curved rim kept whole piles awake
([M-005](docs/measurements.md)). Test bugs were fixed, never by weakening a rule.

## Later changes, each from a written directive

After P6 the author steered the work with bounded directives, each committed in `docs/` before the code changed; the
full account is in [`docs/process-log.md`](docs/process-log.md).

| Directive | What changed | What it caught |
| --- | --- | --- |
| Owner deletion (2026-10-06) | Trash, restore and permanent deletion of works ([`3a4a700`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/3a4a700)) | A rule-ID clash in the brief; a spec that would hit the registration rate limit |
| Graphics quality (2026-10-06) | Auto/High/Medium/Low; no drawing when idle ([`c363bcf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/c363bcf)) | A phone-width overflow; a throwaway WebGL context per re-render |
| Account deletion, Crit 9 tests (2026-10-12) | Permanent account deletion; a local multiplayer suite; table collider v3 ([`c384c02`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/c384c02)) | A window left open and dead; a cylinder that never let piles settle |
| Crit 10 verification (2026-10-21) | Refusals logged with actor and work ([`a9d4a97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/a9d4a97)) | 11 of 13 refusals left no log line on Fly |
| Island upgrade (2026-11-03/06, uncommitted) | A home island with 20 generated landmarks, then revised interaction and portal labels | A WSL out-of-memory crash from unpaced frames; listener leaks; inverted arches |

Crit 10 changed how the agent was directed more than what it built: the author set what counted as done and the
limits of autonomous work in advance, then reviewed one report. The island followed the same pattern, under memory
limits added after the crash: every heavy job runs one at a time in a capped cgroup
([`memory-incident.md`](docs/evidence/world/memory-incident.md)).

The island's design then changed because the author used it. Walking it, they found that automatic mouse-look hid the
cursor, so the page's own controls couldn't be clicked, and asked for a clear way back to the world, a switch between
embedded and fullscreen, and three traversal speeds. A written directive
([`docs/stillwood_island_gallery_world_interaction_fix_prompt.md`](docs/stillwood_island_gallery_world_interaction_fix_prompt.md))
turned that into a different model: a visible cursor, left-drag to look, an optional Look lock, Walk/Run/Fly and
Return to world. The agent built it and the checks went after what the first design had missed: the phone route
caught held movement being cleared by the new focus handling. A real mouse under Look lock is still a manual check.
Reviewing the revised scene, the author was happy with it overall and asked for one addition: each portal's
destination name inside its membrane. The agent checked the mapping against the layout and router rather than assuming
an order, then added frosted-glass lettering that brightens, with an entry hint, on approach. Measured, the pale
letters have low contrast against bright sky (about 1.2–1.4:1). They read by eye through their edge and shadow, but
the author hasn't yet confirmed that, so it stays open. Both rounds are local and uncommitted; detail and status are
in [`requirements-status.md`](docs/evidence/world/requirements-status.md).

## What's verified and what isn't

**Deployed.** `comp4020-final-easton-yi.fly.dev` runs
[`ffa5830`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-easton-yi/commit/ffa5830)
(Fly v9, CI green). On Fly, two identities, invitation, shared editing, sub-second propagation and server-side
refusals pass, and `flyctl logs` attributes every action and refusal. **The island, its revised interaction and the
portal labels are not deployed**: they exist only in the uncommitted working tree.

**Local only.** The unit, contract, integration and browser suites run against a local production build, under the
memory supervisor. One browser test, `crit9-reconnect` F3, fails outside the isolated network it was written for; no
assertion was weakened for it. The island's browser checks ran on software WebGL, so they cover behaviour, triangle
and draw-call counts and memory, not frame rate.

**Not done.** Frame rate on a real GPU and on a physical phone; latency and capacity on the Fly machine; any session
with people who didn't build it ([protocol](docs/acceptance-report.md)).

The README's "what good means" section is still a draft awaiting the author's own reading and position.
