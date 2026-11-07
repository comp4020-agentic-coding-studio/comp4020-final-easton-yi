# Permanent Account Deletion Implementation Prompt

Implement the following feature directly in the current project repository, including the necessary tests and documentation. First read AGENTS.md, the current code, database schema and migrations, authentication and account recovery flows, room lifecycle, and existing permanent work deletion logic. Ground the implementation in the actual code. Do not assume the framework, database, table names, or deployment topology. Do not stop at suggestions or a plan.

This feature permanently deletes an account. It is not signing out, deactivating an account, or moving it to Trash. Implementation and local or isolated testing are authorized for this task. Do not test deletion against real user data, or deploy, push, or modify production data without separate authorization.

## 1. UI and confirmation flow

- On the personal account screen opened by clicking the user's name, add a “Delete account” section immediately after the existing account recovery section. Use a heading at the same level, followed by a destructive “Delete account” button. Match the existing heading hierarchy, spacing, components, and language style.
- Briefly explain that this permanently deletes the account, sign-in and recovery credentials, and all works and exhibits the user owns. Collaborators will also lose access to those works. The action cannot be undone.
- The first click must open a cancellable confirmation dialog, not execute deletion.
- The dialog must explicitly cover owned works in active, archived, and trashed states, all exhibits, saved versions, and recovery points. Explain that works the user collaborates on but does not own will remain, while their membership and identity associations will be removed.
- Require the current password and verify it again on the server. Users who have forgotten their password must use the existing recovery flow; do not add a deletion shortcut that bypasses verification. If the actual system supports passwordless identities, use an equivalent reauthentication mechanism supported by the existing identity system instead of requiring a nonexistent password.
- Use the final action label “Permanently delete account.” Prevent duplicate submissions and show progress. Do not add multiple redundant confirmation rituals such as also typing DELETE and the username.
- Support keyboard interaction, focus management, and accessible error messages. Clear the password when the dialog closes. Never put the password in logs, URLs, persistent browser storage, or telemetry.
- On success, clear the current client's account state and return to the existing unauthenticated initial screen. Replace the history entry to avoid navigating directly back to the old account page. Protected pages must still independently validate authentication.

## 2. Establish the actual deletion inventory first

Trace account and work relationships through the schema, foreign keys, SQL/ORM calls, JSON fields, snapshots, stored objects/files, caches, and background jobs. Produce an inventory of “data / actual location / treatment,” then implement against it. Mark nonexistent features as not applicable; do not introduce unrelated systems.

| Data category | Required treatment |
| --- | --- |
| Account and authentication | Hard-delete the profile, password hash, recovery codes/tokens and their hashes, all server-side sessions, relevant refresh tokens, and any other authentication credentials that actually exist. |
| Owned works | Hard-delete works in every state, including active, archived, and trashed. Do not require users to move each work to Trash first. |
| Data belonging to owned works | Delete scene content, command history, versions, recovery points, published and withdrawn exhibits, invitations, memberships, related thumbnails/export files, and other existing dependent data. |
| Other users' references to those works | Remove favorites and other relationships pointing to deleted works/exhibits. Update relevant counts and prevent dangling references. |
| The user's favorites, preferences, and invitation relationships | Delete private account relationships. Handle invitations created by or associated with the user so no valid credential can restore their access. |
| Other users' works where this user is an editor | Preserve the work and other members. Remove this user's membership, presence, ghosts, and queued entries. Preserve sticks and contributions that have become part of someone else's work, but remove identifiable author associations with the deleted account. |
| Historical identity information in other users' works | Inspect createdBy, updatedBy, author display names, snapshots, versions, and event payloads. Clear identity fields or render a non-identifying “Deleted user” label. Do not retain a reversible mapping to the old account or create a permanent placeholder user account instead of hard deletion. |

Do not broadly cascade-delete everything with created_by = userId: this could delete someone else's work or damage shared scenes. Anonymization must not be presentation-only; address nested identity fields in the live database.

If an immutable event store exists, explicitly identify the conflict with complete identity removal and implement a compatible de-identification or reconstruction approach. Do not silently retain personal information while claiming everything has been erased.

Do not promise to automatically identify every name in arbitrary free text or user-authored work content. This feature removes structured account identity and its copies; it must not indiscriminately rewrite other users' content.

## 3. Backend authentication and request security

- Derive the deletion target exclusively from the authenticated server-side session. Do not authorize deletion using an arbitrary userId/ownerId supplied by the client.
- Use an appropriate POST action or DELETE endpoint for the framework. Never allow GET to perform deletion.
- Reuse existing CSRF and Origin protections. A confirmation dialog or SameSite cookie is not a substitute for required server-side checks.
- Reuse the existing secure password verification, input limits, rate limits, and password-hashing concurrency queue. Verification failure, queue saturation, or inability to acquire the required database access must not proceed into deletion.
- Perform expensive password verification outside the transaction where practical. Before committing, revalidate the account, session, and credential version under the relevant transaction/lock protection. Prevent deletion from proceeding after a concurrent password reset or session revocation.
- Do not log passwords, tokens, or complete account details. Do not introduce permanent audit records containing the deleted identity.
- Repeated requests, double-clicks, and retries of old requests must cause no additional damage. Re-registering the same username must never expose the new account to deletion by an old request. Use non-reused internal identity identifiers, not usernames, to identify a retry target.

## 4. Database transactions and concurrency: define and justify the deletion boundary

Core invariant: after the deletion transaction commits, the old account cannot perform authorized operations, and no connection, queue, or autosave can write deleted owned works back into existence.

- Account, credential, owned-work, and relationship cleanup in the live database must occur in one atomic transaction. Roll back the whole transaction on failure. Never return success after partial deletion.
- Inspect actual foreign-key constraints and their runtime enforcement. Use correct ON DELETE CASCADE behavior for data wholly owned by a work, and explicit nulling/anonymization for retained shared content. Deleting only the users row is not sufficient.
- Serialize deletion against work creation, placement, version/recovery-point creation, exhibit publication, room joining, invitation acceptance, account recovery, and login/session creation, or provide equivalent guarantees through database constraints and revalidation.
- Reuse existing room command queues and lifecycle locks. When multiple rooms are involved, acquire locks in a stable order and document that order to avoid deadlocks.
- Choose short transactions, row locks, controlled write transactions, conditional updates, foreign keys, or revision/epoch checks as appropriate for the actual database. Do not copy database-specific syntax that the project cannot use.
- At the final write boundary, check that the account/session and work/membership remain valid. Authorization only at WebSocket handshake or task enqueue time is insufficient.
- Prevent stale in-memory snapshots from recreating deleted works through UPSERT, scheduled saves, retry queues, or reconnection recovery. Ordinary update paths must not accidentally recreate missing works.
- An in-memory mutex may be sufficient only under an actual single-process writer architecture. If multiple processes or instances can write, use shared durable state and database protection. Verify the real topology; do not introduce Redis or distributed frameworks for hypothetical scale.
- Do not broadcast a definitive “work deleted” event before commit. If rooms are temporarily frozen, restore them on rollback; failed deletion must not leave a valid account permanently unusable.
- Document concrete interleavings: placement commits first, deletion commits first, a queued task executes late, and login/recovery runs concurrently with deletion. Explain how each preserves the invariant.

## 5. WebSockets, rooms, and other sessions

- After the database transaction commits, actively invalidate this account's connections and server-side authentication caches. Clear presence, ghosts, room queue entries, and automatic reconnect state. Clearing only the current browser cookie is insufficient.
- Send a clear work-unavailable/deleted event to collaborators connected to deleted owned works. Close those rooms and cancel related pending tasks. Clients should show a concise message and return to the works list, without exposing the owner's reason for deleting their account or other personal information.
- In rooms owned by someone else, remove only the deleted account. Other members must continue collaborating.
- All authoritative reads and writes must reject the deleted identity/work immediately after commit. Target approximately one second for online UI notifications, but authorization must not depend on notification delivery.
- Lost events, broadcast failures, and a process crash after commit must not restore access. Reconnection, subsequent commands, reads, and background persistence must still reject access based on authoritative state. Runtime caches need an invalidation fallback.
- Do not report a post-commit notification failure as a failed database deletion or mislead the user into repeating deletion. Distinguish the database result from notification and resource-cleanup results.
- Clear account/work caches and relevant localStorage/IndexedDB entries held by the current application. BroadcastChannel may improve same-origin tab behavior, but server-side revocation must cover other browsers and devices.
- Do not indiscriminately clear unrelated preferences or another account's data across the origin. Do not claim the application can remotely erase data already downloaded to an offline device.

## 6. Non-database resources and failure recovery

- If all persistent content resides in the database, use the simplest complete implementation supported by the current architecture. Do not add a task system unnecessarily.
- If object storage, thumbnail files, or external persistent caches exist, record the minimum required cleanup resource keys in the main transaction. Perform idempotent cleanup after commit, with retries that survive process restarts. A small database outbox/task table is sufficient; an external message queue is not required.
- Account removal and revocation of public access must not wait for file-cleanup jobs. Protected resource requests must be rejected immediately. Inspect the actual deletion/invalidation strategy for public caches and static URLs.
- Cleanup jobs must not contain names, passwords, or other unnecessary personal details. Delete jobs after completion. Failures must be observable rather than silently leaking resources.
- If external cleanup remains pending, UI wording and completion status must not claim every copy has already been permanently erased. Report actual guarantees and any temporary delay.
- Backups, database WAL/free pages, and hosting-platform logs cannot all be synchronously erased by an ordinary SQL DELETE. Inspect existing retention and recovery behavior. Document known boundaries and unknowns without inventing retention periods. Do not delete entire backups or run expensive database maintenance after every account deletion.
- If backup restoration is supported, explain how deleted accounts are handled before reopening service so restoring an old backup cannot resurrect accounts and works. If minimal de-identified deletion records are necessary, disclose this retention exception rather than promising zero residual records.

## 7. Success, failure, and retry semantics

- Distinguish authentication failure (nothing deleted), transaction rollback (nothing deleted), committed deletion, and an unknown client outcome caused by a lost response.
- A network timeout does not establish that the database operation failed. The frontend must not blindly claim either “your account is intact” or “your account was deleted.” It may say the result could not be confirmed and ask the user to reconnect and check. Clear the password field.
- An invalid old session only establishes that the user must authenticate again; it does not by itself prove account deletion. Do not expose account status through an unauthenticated username lookup endpoint.
- Repeated submissions may return an established safe success response or an unauthenticated response, but must not cause internal errors, affect a new account, or apply destructive side effects twice.
- If existing registration rules allow the same username to be registered again, the new account must receive a new identity and inherit no old works, invitations, favorites, sessions, recovery credentials, or permissions. Do not add a permanent old-username blacklist unnecessarily.

## 8. Required tests and acceptance criteria

Use isolated databases, temporary storage, and independent browser contexts. Test real risks; avoid excessive snapshots of UI wording.

1. **Complete data cleanup:** Create a test account with active, archived, and trashed works, published and withdrawn exhibits, versions, recovery points, invitations, favorites, and multiple sessions. After deletion, use independent queries to verify all required records and nested identity fields are removed and no dangling foreign keys remain.
2. **Ownership boundaries:** Delete A's owned works and B's memberships in them. Preserve B's own works where A participates, remove A's identity associations, and keep B and other members functional. Retained scenes/history must still load and restore correctly.
3. **Security:** Unauthenticated requests, incorrect passwords, invalid CSRF/Origin, forged target accounts, old sessions, and old recovery credentials must not authorize operations. Failed verification must delete no data.
4. **Atomic rollback:** Inject a failure midway through the transaction. Confirm the account, works, and permissions are not partially deleted and runtime state recovers.
5. **Deterministic concurrency:** Use barriers/latches or controllable hooks to cover interleavings involving deletion, placement, delayed autosave, invitation acceptance, work creation, and login/session creation. Prove that neither data nor credentials can be resurrected. Do not rely solely on sleeps and luck.
6. **Post-commit failures:** Simulate notification failure and process restart after commit. Confirm old permissions remain revoked and old snapshots cannot recreate works. If external cleanup jobs exist, verify they resume idempotently after restart.
7. **Multi-session E2E:** Use independent browser contexts for two owner sessions and one editor session. Delete from the owner's account page. The initiating session returns to the initial screen, the other owner session loses access, and the editor leaves the deleted work. Refreshing must not restore old data.
8. **Retries and identity reuse:** Cover duplicate clicks/requests, lost responses, registration with the same username, and retries of old requests. None may cause cross-account deletion or permission inheritance.
9. **Confirmation UI:** Verify cancellation, keyboard access, readable errors, duplicate-submission prevention, and password clearing on close.
10. **Regression checks:** Run relevant existing type checks, builds, and authentication/work-deletion/collaboration tests. Explicitly label checks that could not run as unverified. Do not invent production verification.

## 9. Documentation and delivery

- Write a concise ADR using the repository's actual numbering convention. Explain permanent deletion; rejection of deactivation-only, soft deletion, and automatic ownership transfer; retention and de-identification of contributions in other users' works; concurrency boundaries; transaction scope; post-commit cleanup; and backup limitations.
- Update the relevant implementation record in PROCESS.md concisely. Do not fabricate personal experiences or claims of independent work in reflections/crit-9.md on the user's behalf.
- Report actual changed files, migrations, the deletion inventory, concurrency guarantees, and test results. Identify remaining limitations explicitly.
- Provide post-deployment manual verification steps for Fly using dedicated test accounts. Do not operate on real accounts or publish automatically in this task. Follow the existing repository workflow and preserve the user's uncommitted changes.
- Prefer reusing the existing permanent work deletion service, but inspect whether it requires Trash, commits its own transaction, merely withdraws exhibits, or omits files. Extract composable transaction-scoped cleanup functions where necessary. Do not implement account deletion by looping over deletion APIs that commit independently and cannot be rolled back together.

Definition of done: a permanent account deletion flow with consistent UI, authentication, database state, multiplayer connections, and resource lifecycle. A visible button or a deleted account row alone is not completion.

## Security references

- [OWASP Authentication Cheat Sheet — Require Re-authentication for Sensitive Features](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP WebSocket Security Cheat Sheet — Authentication/Authorization and Session Management](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

These references support reauthentication and revocation of long-lived connections. Verify concrete schemas, database syntax, transaction mechanisms, and application behavior against the current repository.

