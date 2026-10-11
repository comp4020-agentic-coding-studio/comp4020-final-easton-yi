# ADR-0007 · Permanent account deletion: one transaction, then memory catches up

Status: accepted (2026-10-12, user-directed: [`docs/ACCOUNT_DELETION.md`](../ACCOUNT_DELETION.md)).
Brief: AUTH-06, DOC-05.

## Context

An owner could delete one trashed work (SAVE-12), but nothing could delete an
account. The directive asks for permanent deletion of the account, its
credentials and everything it owns. Works it only collaborated on must
survive, without its identity. The architecture decides how (ADR-0001). There
is one process on one machine. One coordinator worker owns the only SQLite
connection and every live room. Foreign keys are enforced, and moving rooms
checkpoint every 500 ms.

## Decision

**Request.** On the account page, "Delete account" opens a dialog. It names
what goes and asks for the current password. The client then sends
`POST /api/account/delete`. The target is the session's account; an ID in the
body is ignored. The existing hook checks Origin and CSRF. The main thread
verifies the password through the existing scrypt queue (a full queue
answers BUSY and deletes nothing) and the existing rate limiter (new key
`deleteAccountPerUser`; a wrong password also counts toward
`failedLoginPerIp`). Forgotten passwords go through recovery first; there is
no passwordless identity in this system.

**Revalidation, then one transaction.** The coordinator's `account.delete` runs
in order with every other mutation. It first rechecks that the account exists,
that the session is still valid, and that the stored hash is the one just
verified (a fingerprint). A recovery or sign-out that committed during the slow
check stops it. Then one transaction:

1. deletes other people's favorites of the account's exhibits;
2. purges every owned work, whether active, archived or trashed, with
   `purgeWorkRows`. This transaction-scoped function is now shared with SAVE-12,
   whose own transaction and tombstone are unchanged;
3. deletes the account's memberships, invitation acceptances, issued
   invitations, favorites, command receipts and earlier work tombstones;
4. de-identifies other people's works (inventory below);
5. deletes its sessions, writes one deletion record and deletes the users row.

Children go first and the users row last. If the code misses a reference, the
final delete fails its foreign key and the whole transaction rolls back, so the
database itself checks that every foreign-key-linked table is covered. The
transaction runs with `secure_delete` on, and the WAL is truncated afterwards.

**After commit**, still in the same synchronous call (so no tick or command
can run in between), memory catches up:

- The account's windows get `access.ended: ACCOUNT_DELETED` and are dropped.
- Rooms of deleted works are discarded without a save. Their windows get
  `WORK_DELETED`, with no reason given.
- Live rooms of other works rewrite their in-memory stick authors exactly as
  the rows were rewritten. They drop the account's leases, ghosts and pending
  saves, and resend state, so the name disappears from open screens.

Nothing in memory changes before the commit, so a rollback has nothing to
restore.

### Inventory

| Data | Where | Treatment |
| --- | --- | --- |
| Profile, password hash, recovery-code digest | `users` | deleted |
| Sessions (token digests, CSRF tokens), every device | `sessions` | deleted |
| Refresh tokens, OAuth links, email | none | not applicable |
| Owned works (active, archived, trashed) | `works` | deleted; no trash step needed |
| Their scene and recovery state | `work_states`, `previous_work_states` | deleted |
| Their saved versions and recovery points | `snapshots` | deleted |
| Their exhibits, published or withdrawn | `exhibits` | deleted. Thumbnails are drawn per request from the row (`thumbnail.ts`), so they stop at commit |
| Their invitations, acceptances, memberships, command history | `invites`, `invite_acceptances`, `memberships`, `command_receipts` | deleted |
| Other people's favorites of those exhibits | `favorites` | deleted (not left as id-only rows) |
| The account's favorites, memberships elsewhere, acceptances, issued invitations, receipts | same tables, by user | deleted. An invitation it accepted has one more use free |
| Tombstones of works it purged before | `work_tombstones.owner_id` | deleted |
| Stick authors in other works | `authorId` in JSON: `work_states.meta`, `previous_work_states.meta`, `snapshots.meta` and `.geometry` | set to `deleted-user`; envelope checksums recomputed. The native physics blob holds no identity |
| Version creator in other works | `snapshots.creator_id` | set to NULL, shown as "Deleted user" (migration 3 made it nullable) |
| Frozen exhibit attribution in other works | `exhibits.attribution` | the account's name replaced with "Deleted user", found by each public stick's attribution index |
| Presence, ghosts, leases, pending saves, command rate bucket | coordinator memory | cleared after commit |
| Live stick authors in other rooms | room memory | rewritten after commit |
| Login and recovery rate buckets keyed by handle | main-thread memory | cleared |
| Files, object storage, external caches, background jobs | none | not applicable: everything durable is in SQLite, so no cleanup outbox |
| Free text (titles, descriptions, version titles) | various | not rewritten |
| **Deletion record** (retained) | `account_deletions` | SHA-256 of a fixed prefix plus the account's random ID, and the time. No name or handle. Kept so a restored backup can be re-deleted |
| Platform logs | Fly | Lines written before the deletion keep `actorId`, and some keep the display name (`actorName`), until Fly's retention ends (unknown). The deletion's own log line has neither |
| Backups and volume snapshots | manual backups; Fly daily snapshots (5-day retention, runbook) | not rewritten; re-deleted on restore (below) |

### Interleavings

The coordinator is the only writer: one process, one worker, one connection
and one machine in `fly.toml`. Serializing on it is enough, so there are no
room locks and no lock order to keep. Each case below has a test in
`tests/account-deletion.test.ts`, paused at a latch between the password check
and the commit.

- **Placement, work creation or invitation acceptance commits first.** The
  transaction reads the owned works and memberships when it runs, so it sweeps
  them up.
- **Deletion commits first.** Later commands find no membership (`NOT_FOUND`).
  Later HTTP calls find no account: the RPC dispatcher checks that the account
  still exists for every account-scoped method, so a request that raced the
  deletion gets `UNAUTHENTICATED`. A socket's open, its joins and its commands
  all read the database.
- **A queued task runs late.** The room was removed and freed at commit, and its
  pending saves were cleared. Even a stale write would fail, because
  `work_states.work_id` has no `works` row to reference.
- **Sign-in runs concurrently.** If it commits first, the transaction deletes
  the new session. If it runs after, `session.create` finds no account.
- **Recovery runs concurrently.** If it commits first, it revokes the session
  and changes the hash, so the deletion is refused and nothing is deleted. If
  it runs after, the handle no longer exists.
- **Retries and double submits.** The second request finds no session (401) and
  does nothing more. A re-registered handle gets a new random ID, while old
  cookies, receipts and requests carry the old ID and session digest.

### Outcomes the client can tell apart

- **Refused or rolled back:** nothing was deleted. This covers wrong password,
  signed out, CSRF, Origin, rate limited, busy, and `SAVE_FAILED`.
- **Committed:** `deleted: true`. Notification and storage results are reported
  separately (`notifications: {sent, failed}`, `storage.walTruncated`). A failed
  notification is never reported as a failed deletion.
- **No answer:** the client says it couldn't confirm the outcome, clears the
  password and offers "Check my account". A later "signed out" only means the
  user must sign in again.

On success the client forgets the session in this tab and, through
`BroadcastChannel`, in the same browser's other tabs. It then replaces the
history entry with `/`. Other browsers and devices learn from the server.
Device preferences in `localStorage` (sound, graphics) aren't account data and
stay.

### Failures after commit

- **Crash:** a restart reads only the database.
- **Lost notification:** commands and joins read membership. Each 5 s heartbeat
  ends a window whose membership or work is gone (`WORK_DELETED`), or whose
  session is gone. A window that wasn't told keeps its `workId` so the
  heartbeat can find it.

### Backups

On restore, the account is deleted again. The runbook's restore procedure runs
`scripts/carry-deletions.ts`, which copies the deletion records from the
database being replaced into the restored file. The server re-runs those
deletions at startup, before it reports ready. If a re-deletion fails, the
worker stops and the process exits: the service doesn't reopen with the account
back. If the live database is lost too, deletions made after the backup can't
be known. That is a stated limit, not a guarantee.

`secure_delete` zeroes the pages this transaction frees, and the WAL is
truncated. Neither reaches block-level remnants on the volume, Fly's volume
snapshots, or logs. No `VACUUM` is run.

## Rejected

- **Deactivation only:** credentials and data stay, which is not deletion.
- **Soft delete with a later purge:** needs a purge job and a filter on every
  query, and keeps everything in the meantime.
- **Automatic ownership transfer:** it picks an owner nobody chose (ownership
  transfer is outside the brief, AUTH-04) and keeps the deleted person's works
  alive.
- **A permanent "deleted user" account** to satisfy foreign keys: one row
  standing in for many people, and a mapping that never goes away.
- **Cascading on author or creator:** it would delete sticks from other
  people's works. Contributions stay; only their identity goes.

## Cost

- The account's name and history leave works it helped build. Their owners see
  "Deleted user" where a name was (AUTH-04 changed in place).
- Finding authorship scans the `meta` and `geometry` columns of every state and
  version. That is linear in stored data and took a few milliseconds on test
  data. It is bounded by the brief's per-work limits, but not measured at full
  capacity.
- The deletion record is a disclosed retention exception, kept so a restore
  can't resurrect the account.
- A collaborator's invitation slot frees up when the account's acceptance row
  goes.
