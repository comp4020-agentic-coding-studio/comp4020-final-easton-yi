# ADR-0003 · Full snapshot plus receipt in one transaction per accepted change

Status: accepted (P1).

**Context.** SAVE-02: "placed" must mean durably committed, and an
acknowledged placement may never disappear or duplicate, even after a crash
(AT-07, AT-08).

**Decision.** For a placement, push or restore, the coordinator validates
against the current world, applies the change without stepping, takes the
full native Rapier snapshot plus the app envelope (stick IDs, authors, seeds,
handles, tick, flags), and commits `work_states`, the work's counters and the
command receipt in one SQLite transaction (WAL, `synchronous=FULL`). Only
then is the result sent. On failure the in-memory world is restored from the
pre-change snapshot and the room pauses. Motion is checkpointed every 500 ms
and on settling. Receipts are keyed by (actor, command ID) with a request
digest, so a retry returns the original result and a changed payload is a
conflict. The snapshot envelope carries a checksum, engine and config
versions.

**Rejected.** A command log with deterministic replay as the source of truth:
replay is fragile across engine versions and needs every intermediate frame
to agree. Saving only on settle: a crash mid-motion would lose acknowledged
work.

**Cost.** ~0.5 MB written per accepted change at 200 sticks (M-002), plus
coordinator time. Measured locally: command ack p95 22–40 ms under the 3-room
workload (M-006). Up to 500 ms of motion can replay after a hard kill; this
is tested (`tests/restart.test.ts`).
