# Crit 10 reflection

> Draft written by the coding agent from this crit's verification record
> (`docs/evidence/crit-10-verification.md`). Revise it into my own words
> before the cutoff; the live crit with classmates hasn't happened yet.

## What was the breakthrough that moved the work forward?

The breakthrough was reading the logs as the tutor will, instead of reading
the code. Every permission check already passed: an editor who called the
owner-only endpoints directly was refused, and a stranger got the same "not
found" as for a work that doesn't exist. But when a script played two
classmates against the deployed app, the logs showed only some of it. A
refused placement and a refused restore each had a line. An editor's attempts
to rename, trash or take over the work, and a stranger's attempt to join it,
had none.

So the app enforced the rule, but nobody narrating from the logs could see
that anyone had tried to break it. That is exactly the crit's finding: "one of
them can change what should belong to the other". The fix was small, one log
line per refusal, with the actor, the action and the work. It came with a test
that failed before the change.

## What did this work change about who I want to be as a software developer?

I want to define what "done" means before I ask for work, and then let the
agent do the checking it can do itself. This time I gave a list of acceptance
checks, the limits of what it could change, and the rule that every failure is
classified before anything is fixed.

That rule mattered twice. One of the agent's own probes placed two sticks on
top of each other; the server's rejection was right and the probe was wrong.
An older reconnect test failed because the browser behaved differently outside
an isolated network, not because the app did. Neither became a product change.
What I still have to do myself is the part no script covers: watching two
classmates use it.
