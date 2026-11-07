# ADR-0004 · Placement assistance changes the pose, never the outcome

Status: accepted (P1).

**Context.** GOOD-02 "considerate placement": people should say where a
stick goes without fighting their hand, while whether it stands stays their
judgement (PLACE-07, PHYS-02).

**Decision.** The held ghost is a centre plus yaw/pitch/roll, and the
quaternion is derived, so vertical sticks have no singularity. The tools are
centre drag on a locked plane with the grab offset kept; a height handle;
endpoint swing and tilt about the fixed opposite end; presets about the centre
or an end; DOM steppers and keys with fine steps; angle snapping with 3°/5°
hysteresis; and a downward "Snap to support" sweep. The sweep stops at the
first contact, keeps the 0.005 u gap and reaches at most 0.2 u. Placement
always starts at zero velocity. Validity text distinguishes ready (with the
drop distance when it's short), unsupported, intersecting and out of bounds;
only the last two block. Nothing helps after release: no glue, no upright
torque, no hidden re-snap on the server.

**Rejected.** Grid placement: it restricts what can be built. Auto-settling a
stick onto the surface below on release: that hides the judgement the game is
about, and would make server results differ from what was submitted.

**Cost.** Precise building takes more controls than a single gesture. The
0.2 u snap reach is short: it only fine-tunes a ghost already near its
support. Whether that's right is a question for the human sessions.
