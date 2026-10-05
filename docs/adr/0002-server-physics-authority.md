# ADR-0002 · One server physics world per active work

Status: accepted (P0).

**Context.** PHYS-01 and GOOD-02 ("credible consequences") need everyone to
see the same collapse, and no client may decide what falls or what height
counts.

**Decision.** The coordinator worker steps one Rapier world per live work at
a fixed 60 Hz from a monotonic accumulator (at most 4 catch-up steps per pass;
beyond that the backlog is dropped and `room.overload` is logged). Browsers
render authoritative transforms interpolated ~100 ms behind arrival and never
extrapolate. Ghosts are client-only previews with no collision, support or
persistence. The client has its own advisory overlap check (shared SAT); the
server decides with Rapier's signed contact distance.

**Rejected.** Client-side simulation with reconciliation: two people would
see different collapses until corrected, and the brief forbids independent
client authority. Lockstep deterministic clients: fragile across browsers and
WASM builds.

**Cost.** All physics CPU is on one shared-cpu-1x machine, which caps live
rooms (WORLD-04) and needs measuring on Fly. Each viewer sees motion
~100 ms + network late. The physics config is frozen per work (v1, v2;
`docs/measurements.md` M-005), so tuning can't retroactively topple saved
towers, at the cost of carrying old configs forever.
