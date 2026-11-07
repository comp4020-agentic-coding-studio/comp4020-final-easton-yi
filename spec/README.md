# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## What this project's checks cover

The rules these checks protect are in
[`docs/01-foundation/01-01-product-brief.md`](../docs/01-foundation/01-01-product-brief.md)
(numbered IDs such as SAVE-02), which `CLAUDE.md` references. The table maps
the README's four promises, the permission rules and the persistence and
shared-state requirements to the tests that exercise them. A test listed here
shows what is *checked*, not that it passed today: current results are in the
dated records linked from the README.

Four kinds of check, and what each can and cannot show:

| Kind | Where | Runs against | Shows | Does not show |
| --- | --- | --- | --- | --- |
| HTTP spec | `spec/*.test.ts` | a running app over HTTP and WebSocket (`pnpm check`; CI's Docker image) | the server's contract: who may do what, what is saved, what every member receives | anything a browser renders; restart behaviour |
| Unit and integration | `tests/*.test.ts`, `tests/integration/` | the real physics engine, database and child processes | physics outcomes, crash and restart recovery, the production bundle under several clients | the browser UI |
| Browser | `tests/e2e/*.spec.ts` | headless Chromium (SwiftShader) against a local server | real controls, two or three independent sessions, emulated phone and tablet viewports | physical phones, real GPUs, frame rate, Fly |
| Human judgement | — | people | whether collaboration feels considerate, whether placement feels deliberate, whether the world inspires building | — |

| Promise or rule | HTTP spec (`spec/`) | Unit / integration (`tests/`) | Browser (`tests/e2e/`) |
| --- | --- | --- | --- |
| **Deliberate placement**: a pose is placed exactly, and a failed placement explains itself (PLACE-08/09) | `placement.test.ts`: "rejects an intersecting placement and keeps nothing of it", "rejects out-of-bounds and non-finite poses", "replaying the same command ID returns the original result without a duplicate" | `placement.test.ts` (bounds, rotations, edge contact); `placement-math.test.ts` (drag, snap, angle maths) | `access.spec.ts` (keyboard-only and pointer placement); `solo.spec.ts` |
| **Visible intentions**: named ghosts; no locks or turns (SYNC-01/02, ADR-0006) | `collaboration.test.ts`: "both editors see each other's ghosts with names, and a held ghost doesn't reserve space", "non-overlapping placements at once both succeed" | `integration/crit9-multiplayer.test.ts`: "ghosts carry the right person, never become sticks…" | `together.spec.ts`; `crit9-multiplayer.spec.ts` M03 |
| **Shared consequences**: one physical outcome for everyone; conflicts rejected (PHYS-01..06, SYNC-02) | `collaboration.test.ts`: "two identical placements at once: exactly one wins and both see the same result"; `placement.test.ts`: "an unsupported placement is accepted and falls" | `physics.test.ts` (pillar, bridge, topple, cascade, no tunnelling); `integration/crit9-multiplayer.test.ts` M04/M05 | `crit9-multiplayer.spec.ts` M02, M05 |
| **Preserved work**: saved before acknowledgement; versions, frozen exhibits (SAVE-01..12) | `placement.test.ts`: "a new user creates a work, places sticks, and finds them after logging back in"; `versions.test.ts`: versions, restore, "a frozen exhibit doesn't change when the work collapses…"; `lifecycle.test.ts` (trash, restore, permanent deletion) | `restart.test.ts` (SIGKILL before and after commit, mid-fall, SIGTERM, failed write); `lifecycle-restart.test.ts`; `trash-guard.test.ts` | `solo.spec.ts` (refresh and logout); `exhibit.spec.ts`; `lifecycle.spec.ts` |
| **Permissions**: server-side, not-found equals not-yours (AUTH-02..06, ADR-0005) | `placement.test.ts`: "non-members can't read or modify a private work", "anonymous requests get 401…", "a socket upgrade without a session or from another origin is refused"; `collaboration.test.ts`: "editors can't do owner things", "a removed editor is cut off immediately…"; `lifecycle.test.ts`: "trash is owner-only…"; `versions.test.ts`: "only settled named versions can be exhibited, and only by the owner"; `accounts.test.ts`: "requires same-origin and the CSRF token for mutations"; `account-deletion.test.ts` | `access-log.test.ts` (each refusal logged with actor, action and work); `account-deletion.test.ts` | `crit9-multiplayer.spec.ts` M01, M10; `account-deletion.spec.ts` |
| **Shared state over time**: late joiners and reconnects converge without duplicates (SYNC-04..07) | `collaboration.test.ts`: "a second window of the same account observes until it explicitly takes over", "heartbeats keep a stationary ghost; disconnect removes it" | `integration/crit9-multiplayer.test.ts`: "snapshot plus later events add up to the same set…", "repeated reconnects leave one membership…" | `crit9-multiplayer.spec.ts` M08; `crit9-reconnect.spec.ts` (method A needs a loopback-only network namespace; method B runs anywhere) |
| **Abuse limits**: the per-account command limit holds and tells the client when to retry (TRANSPORT.commandBurst/commandsPerSecond) | `versions.test.ts`: "allows a burst of commandBurst commands per account, refuses the next with RATE_LIMITED and a retry delay, and recovers after refill" | `integration/crit9-multiplayer.test.ts`: "round-robin within limits converges; a burst past the per-account limit is refused with a retry time…" | — |
| **Account limits**: owned works (20, archived and trashed included) and favorites (100) (WORLD-04, `LIMITS`) | — | `limits.test.ts` (own disposable servers): below, at and over each limit, the `LIMIT` message, two creates at once at the boundary, recovery after permanent deletion or unfavoriting | — |
| **The island**: portals, return to world, safe points, input model, phone and tablet layout | — | `world-*.test.ts` (collision, gateways, routes, input, landmarks, day/night, touch layout) | `world-route.spec.ts`; `world-interaction.spec.ts` (K, K2: one portal transition per crossing, re-arm, lock and cooldown; L: "View player works" reaches the exhibition, with history); `world-safe-points.spec.ts` (recovery lands on the loaded terrain, clear of colliders); `world-keyboard.spec.ts`, `world-protection.spec.ts`, `world-daynight.spec.ts`, `world-touch-layout.spec.ts` |

### Running them

All commands come from `package.json`; see
[`docs/90-reference/90-06-running.md`](../docs/90-reference/90-06-running.md)
for the full setup.

| Command | Needs | Runs |
| --- | --- | --- |
| `pnpm check` | a running app at `APP_URL` (default `http://localhost:8080`); use a scratch `DATA_DIR`, because the specs register accounts | `pnpm typecheck`, then every `spec/*.test.ts` (one file at a time) |
| `pnpm check:evidence` | nothing | the course's evidence check on `PROCESS.md` and `reflections/` |
| `pnpm test:unit` | nothing (runs real processes and the physics engine; two workers) | `tests/**/*.test.ts` except `tests/integration/` |
| `pnpm test:integration` | builds first (`pnpm build`) | `tests/integration/` against the production bundle |
| `pnpm test:e2e` | `pnpm build`, then a server with `ENABLE_TEST_HOOKS=1` at `APP_URL` (default `http://localhost:8099`) and a scratch `DATA_DIR` | `tests/e2e/*.spec.ts` in Chromium, one worker |

Routine screenshots from browser tests go to each test's own folder under
`test-results/`, which Git ignores. Ordinary runs never write into `docs/`;
curated evidence is copied there deliberately.

CI (`.github/workflows/checks.yml`) runs `pnpm check` and `pnpm check:evidence`
against the Docker image before deploying. It does not run `test:unit`,
`test:integration` or `test:e2e`; those run locally.
