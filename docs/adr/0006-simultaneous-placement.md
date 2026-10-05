# ADR-0006 · Simultaneous building: no turns, no locks; the server orders real changes

Status: accepted (P3). This is the multiplayer decision for Crit 9.

**Context.** GOOD-02 "legible collaboration" and SYNC-02/03: two to four
people build at once and must be able to tell intention (ghosts) from fact
(wood).

**Decision.** Anyone holding an editor lease can prepare and place at any
time. Ghosts stream at ≤15 Hz with names, colours and shapes, but reserve no
space. The coordinator applies placements one at a time in arrival order,
each validated against the world as it is at that moment. If two people aim
at the same spot, the first is accepted and the second is rejected with
`COLLISION`; its ghost stays where it was so the person can adjust. A
placement isn't rejected merely because others changed the world. It's
rejected only for a different epoch (a restore), a different stream (a server
restart), a view more than 120 ticks behind *while the world is moving*, a
stale lease, or a real intersection. The server never moves a submitted stick
somewhere else.

**Rejected.** Turn-taking or a table lock: safe, but it turns building
together into waiting. Optimistic global revision checks: any partner's
change would reject everyone else's work in progress. Ghost reservations:
they'd let one person block space indefinitely.

**Cost.** The second of two simultaneous placements in the same spot gets a
rejection. Restores are shared: a restore resets everyone's world, and their
held ghosts need a second look (SAVE-05). There's no per-person undo, because
undo would silently remove a partner's work.

**Evidence.** `spec/collaboration.test.ts` (identical concurrent placements:
exactly one wins, both sessions agree; disjoint placements both succeed);
`tests/e2e/together.spec.ts` (two browsers). Local visibility p95 25 ms
under 3 rooms × 4 sessions (M-006); Fly not yet measured.
