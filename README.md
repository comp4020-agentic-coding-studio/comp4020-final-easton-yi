# Stillwood

A few friends use one kind of wooden stick on a quiet tabletop to build
something fragile, worth continuing and worth keeping.

Every stick is the same: 8 units long, 1 × 1 in section, the same weight and
friction. You hold one as a ghost, adjust it until it's where you mean it, and
place it. From then on the server's physics decides what happens. A bridge
can settle; a lopsided tower can fall. Two to four people can build at once
on their own devices, each with their own view, and everyone sees the same
result.

> **Draft for revision.** The coding agent drafted the "what good means"
> section below from the project's design brief. The author still has to
> revise it against their own reading; it isn't yet their position.

## What good means

A good session leaves a small group feeling they made something together that
they'd want to come back to. For this app, that rests on four promises:

1. **Considerate placement.** You can say exactly where a stick goes (slide
   it, raise it, swing one end around the other, or type values) without
   fighting your own hand to hold it still. Assistance helps the pose only;
   whether it stands is still your judgement.
2. **Legible collaboration.** You can see what a partner *intends* (their
   translucent, outlined, named ghost) and tell it apart from what has
   actually *happened* (real wood). Nobody takes turns and nobody locks the
   table.
3. **Credible consequences.** Imbalance and collisions can surprise you, but
   no hidden rule decides failure. There's no invisible glue and no "stand
   upright" force.
4. **Work that lasts.** "Placed" means saved on the server, not "will never
   fall". Named versions are immutable, exhibits are frozen copies, and a
   collapse can't silently rewrite what you exhibited.

Height is a natural challenge, but bridges, pavilions and low sculptures are
equally good outcomes. There are no leaderboards, chat, shop or feeds, and
nothing about other people's activity is ever invented.

Sources behind this position: *to be added by the author* (the Crit 8 brief
points at the small web, games for a handful of friends, and tools built for
one workshop).

## Using it

The **exhibition** (`/`, below the island) shows public frozen exhibits without an account. In **My works**
(`/works/`) you create or open a work; in its workshop, **Add** holds a ghost stick, **Place** submits it, **Versions**
saves settled structures to restore or exhibit, and **People** manages invitations. Accounts use a handle, a password
and a one-time recovery code, and can be deleted with everything they own.

## How it's built

One Node process and one SQLite volume on one 256 MB Fly machine, deployed at
`comp4020-final-easton-yi.fly.dev`. A worker thread owns the database and every live Rapier world, and each accepted
placement is saved in one transaction before anyone is told it succeeded. Decisions: [`docs/adr/`](docs/adr/0001-stack.md);
measurements: [`docs/measurements.md`](docs/measurements.md).

## The island (local, not yet deployed)

In the working tree, the home page opens on an explorable island of 20 generated timber landmarks, with the header,
gallery and works pages unchanged ([protection matrix](docs/evidence/world/protection-matrix.md)). Status and
evidence: [requirements-status.md](docs/evidence/world/requirements-status.md). Frame rate on a real GPU is unverified.

## Running and testing

`pnpm install`, `pnpm build && pnpm start` (http://localhost:8080), then `APP_URL=http://localhost:8080 pnpm check`.
The full set of suites, and the supervised commands for the island, are in [docs/running.md](docs/running.md).

## Known limits

Capacity (3 live rooms, 4 editors each, 200 sticks per work) hasn't been measured on the Fly machine, and placement
feel still needs people who didn't build it to try it.
