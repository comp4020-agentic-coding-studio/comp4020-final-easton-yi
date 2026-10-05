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

- **Exhibition** (`/`): public frozen exhibits, newest first. No account needed.
- **My works** (`/works/`): create a work, or open one you were invited to.
- **Workshop** (`/works/<id>/`): **Add** holds a ghost; drag its middle, the
  height arrows, an end ball (swing) or an end cone (tilt), or use the panel
  and keys (arrows, PgUp/PgDn, Q/E, R/F, H, V, G, Enter, Esc). **Place**
  submits it. The status line reads "Placement saved; structure moving" and
  then "Structure saved".
- **Versions** saves settled structures; the owner can restore one (a recovery
  point is saved first) or exhibit it. **People** manages invitation links.
  **Push** lets the owner give one bounded push.

Accounts use a handle and password. There's no email: the recovery code you're
shown once is the only way back if you forget your password.

## How it's built

One Node process on one Fly machine (256 MB) with one volume. A coordinator
worker thread owns SQLite and every live Rapier physics world. Each accepted
placement commits a full world snapshot and its receipt in one transaction
before anyone is told it succeeded. Decisions and their costs are recorded in
[`docs/adr/`](docs/adr/0001-stack.md); measurements are in
[`docs/measurements.md`](docs/measurements.md); rule-by-rule progress is in
[`docs/implementation-status.md`](docs/implementation-status.md).

## Running and testing

```sh
pnpm install
pnpm build && pnpm start           # http://localhost:8080, data in ./.data
APP_URL=http://localhost:8080 pnpm check   # course invariants + HTTP/WebSocket contract specs
pnpm test:unit                     # physics fixtures, placement maths, kill/restart tests
pnpm test:e2e                      # Playwright, against APP_URL
```

## Known limits

Capacity (3 live rooms, 4 editors per room, 200 sticks per work) is a
starting design and has not yet been measured on the Fly machine. Placement
feel and the look of the wood still need people who didn't build it to try it.
