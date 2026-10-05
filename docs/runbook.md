# Runbook

## Local

```sh
pnpm install
pnpm build && pnpm start            # http://localhost:8080; data in ./.data (DATA_DIR overrides)
pnpm dev                            # same server from TypeScript, after `pnpm build` for the client
APP_URL=http://localhost:8080 pnpm check     # shipped invariants + product specs (needs a running server)
pnpm test:unit                      # physics fixtures, placement maths, kill/restart tests (spawn their own servers)
APP_URL=http://localhost:8080 pnpm test:e2e  # Playwright through the real UI
```

Test hooks (`/api/test/*`, crash points) exist only when `ENABLE_TEST_HOOKS=1`
and `NODE_ENV` isn't `production`.

Production-like run: `NODE_ENV=production DATA_DIR=/some/dir node
--max-old-space-size=64 --max-semi-space-size=2 dist/server/main.js`. In
production the data directory must already exist and be writable, or the
process exits.

## Deploy (Fly)

`fly.toml` is unchanged from the course template: one shared-cpu-1x 256 MB
machine, volume `data` at `/data`, `PORT=8080`.

```sh
flyctl deploy --remote-only --ha=false -a comp4020-final-easton-yi   # by hand while the repo is private
```

Once the repo is public, CI (`.github/workflows/checks.yml`) builds the
image, runs `pnpm check` against it, runs `pnpm check:evidence`, and deploys
on every push to `main`.

After a deploy: `curl https://comp4020-final-easton-yi.fly.dev/readyz` shows
coordinator status, RSS, pass cost and event-loop delay. Then run
`APP_URL=https://comp4020-final-easton-yi.fly.dev pnpm check`,
`scripts/measure/visibility.ts` and `scripts/measure/capacity.ts` against it
(the capacity script creates test accounts and works; it never deletes
anything).

## Logs

`flyctl logs -a comp4020-final-easton-yi`; filters and a narrated example
are in [`logs-demo.md`](logs-demo.md).

## Backup and restore

`scripts/backup.ts` uses SQLite's online backup API, so it's safe while the app
is writing:

```sh
flyctl ssh console -a comp4020-final-easton-yi -C "node /app/scripts/backup.ts /data /data/backup.db"
flyctl ssh sftp get /data/backup.db ./backup.db -a comp4020-final-easton-yi   # a copy on the same volume isn't protection
```

To restore: stop the app (`flyctl scale count 0`), put the file back as
`/data/stillwood.db`, remove `stillwood.db-wal` and `stillwood.db-shm`, then
scale back to 1. Try it on a copy first; the backup script reports
`integrity_check` and the work count.

### Before deploying a schema migration

Checked read-only on 2026-10-06: production is at schema `user_version` 1, with
the database at `/data/stillwood.db` (WAL mode, plus `-wal` and `-shm` files)
on volume `vol_v3g56pxy0l6qp7l4` (1 GB, encrypted, `syd`). It held 1 user, 1
work and 0 exhibits. Fly takes daily volume snapshots with 5-day retention.
The deletion change adds migration 2, which runs once at startup, inside a
transaction, before the server reports ready.

1. Wake the machine: `curl https://comp4020-final-easton-yi.fly.dev/healthz`.
2. Take an on-demand volume snapshot: `flyctl volumes snapshots create vol_v3g56pxy0l6qp7l4 -a comp4020-final-easton-yi`, then confirm it in `flyctl volumes snapshots list vol_v3g56pxy0l6qp7l4 -a comp4020-final-easton-yi`.
3. Take a consistent SQLite backup and copy it off the machine:
   `flyctl ssh console -a comp4020-final-easton-yi -C "node /app/scripts/backup.ts /data /data/pre-migration-2.db"` (prints `integrity_check` and the work count), then
   `flyctl ssh sftp get /data/pre-migration-2.db ./pre-migration-2.db -a comp4020-final-easton-yi`.
4. Rehearse locally: copy the downloaded file into an empty directory as `stillwood.db`, start `DATA_DIR=<dir> PORT=8095 node dist/server/main.js`, check `/readyz`, then confirm `user_version` is 2 and `PRAGMA foreign_key_check` is empty.
5. Deploy. Afterwards check `/readyz` and read `user_version` read-only (expect 2).

Rollback if the new version misbehaves: redeploy the previous image
(`flyctl releases -a comp4020-final-easton-yi`, then `flyctl deploy --image <previous image>`). The old code still starts on a version-2 database
(it skips migrations it doesn't know). But it doesn't know about the trash: it
would show trashed works as active, and the triggers would refuse their saves.
If any work has been trashed, also restore the pre-migration file as described
above (stop, replace `stillwood.db`, remove `-wal` and `-shm`, start). Alternatively, restore
a whole volume from the snapshot with `flyctl volumes create data --snapshot-id <id> -a comp4020-final-easton-yi` and attach it. Either way, anything written after the backup is lost. Never delete the
existing volume until the restored one has been verified.

## Shutdown and recovery

- SIGINT/SIGTERM: the server marks itself unready, closes sockets (clients
  reconnect), saves every live world, checkpoints the WAL and exits within
  ~4 s. A hard kill loses at most the last ≤500 ms of motion; acknowledged
  placements are never lost (`tests/restart.test.ts`).
- A room that paused (`world.save` with `outcome: failed`, or `room.fault`)
  stops accepting changes. Once storage is healthy, it reloads from its last
  durable state on the next activation (it unloads when empty).
- If the worker crashes, the process exits and Fly restarts it.

## Known capacity

Designed for 3 live rooms × 4 editors × 200 sticks. Measured on the
development machine only (`docs/measurements.md` M-006). Not yet measured on
Fly.

## Reproducing a reported error

Find the line in the logs by time, `actorId` and `workId`. The `code` field
is the stable error code (`COLLISION`, `STALE_VIEW`, `ROOM_LIMIT`, …), and
`commandId` lets you look up the receipt (`GET /api/commands/<id>` as that
user).
