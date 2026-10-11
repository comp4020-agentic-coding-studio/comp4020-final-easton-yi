# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was turning a vague "sometimes saving takes forever" into a
cause I could point to. Local multiplayer tests showed the same building
sequence settling in about two seconds in some runs and over ninety in
another, and while it moved, saving a version waited. Instead of raising a
timeout, I asked for a bounded diagnosis.

Rebuilding the construction with the server's own room code showed a single
stick vibrating, sunk into the table. A map of single resting sticks then
showed that the physics engine's cylinder only supports a box inside a square
on its top face. Replacing the centre of the table with flat boxes made every
case settle. A final coverage check then caught gaps that my first version of
that fix had left near the edge.

The same approach cleared the other open finding: the intermittent
"Reconnecting…" failure came from the test's offline sequence, not from the
app.

## What did this work change about who I want to be as a software developer?

I want to be a developer who treats a confident summary, including an
agent's, as a claim to check rather than a result. Twice in this crit, a
statement that sounded finished was wrong: a test failure that blamed the
product, and a collider described as matching the table when it left holes.

What helped was setting limits before the work started: a fixed number of
attempts, no rerunning until it turned green, every failure kept, and a clear
line between what was measured and what was assumed. I would rather report an
unresolved item honestly than a clean pass I can't defend.
