# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was turning a vague "sometimes saving takes forever" into a
cause I could point to. Local multiplayer tests showed the same building
sequence settling in about two seconds in some runs and over ninety in
another. Instead of raising a timeout, I asked for a bounded diagnosis.

It showed a single stick vibrating, sunk into the table, because the physics
engine's cylinder only supports a box properly inside a square on its top
face. Replacing the table's centre with flat boxes made every case settle, and
a coverage check caught gaps in the first version of that fix.

After deploying, I tested two collaborators holding sticks at the same spot.
When one placed theirs first, the other's held stick immediately showed its
updated validity, without a refresh. That is our concurrency policy as a user
meets it. There are no locks or reservations, so an accepted placement changes
the shared scene and every pending check in it.

## What did this work change about who I want to be as a software developer?

I want to be a developer who treats a confident summary, including an
agent's, as a claim to check. Twice in this crit, a statement that sounded
finished was wrong: a test failure blamed on the product, and a collider
described as matching the table when it left holes.

What helped was setting limits up front: a fixed number of attempts, no
rerunning until green, every failure kept, and a clear line between what was
measured and what was assumed.
