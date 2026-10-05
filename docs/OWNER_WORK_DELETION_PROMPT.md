# Change directive: Owner-controlled work deletion

Implement owner-controlled deletion in the existing Stillwood project. Complete the feature, verify its actual behaviour, and reconcile the repository's product brief and implementation directive with the resulting contract.

This is an intentional change to the original specification. The original brief excludes permanent work deletion, and INITIAL_PROMP.md explicitly says not to permanently delete works. This directive supersedes those exclusions for deleting an entire work only. It does not authorize direct deletion of individual placed sticks, per-person undo of shared contributions, or changing other users' accounts.

## 1. Inspect the existing system first

Read AGENTS.md, brief.md, INITIAL_PROMP.md, the current lifecycle/permission code, database schema and migrations, room coordinator, gallery/favorites code, and relevant tests. Locate the actual files if documentation is stored under docs/ rather than the repository root. Work with the existing stack, authentication, transaction conventions and UI components.

Inspect what is implemented rather than assuming the initial directive describes the current code perfectly. Give a brief account of the current archive, withdrawal and ownership behaviour, then proceed with implementation. Do not stop at a proposal or rewrite the application.

## 2. Product contract and authority

A work is one shared persistent object with one owner and zero or more editors. The owner has final authority over its lifecycle. Editors may leave a work but cannot delete it, restore it from trash, or permanently delete it. Do not introduce majority voting or an all-members approval requirement.

Explain the owner's publication and deletion authority before a person confirms an editing invitation. Make this visible to existing members in work information as well. Notify connected collaborators when a work is moved to trash; do not leave them in a room that appears editable.

Keep these operations distinct:

- Archive: retain the existing reversible archive semantics. Archiving does not automatically withdraw exhibits.
- Withdraw exhibit: stop public access to a selected exhibit while retaining the work.
- Move to trash: remove the entire work from ordinary use and withdraw every associated exhibit.
- Restore from trash: recover the private work, with exhibits still withdrawn.
- Delete permanently: irreversibly remove the work's stored building content and its dependent versions and exhibits from the application's active datastore.

Do not label moving to trash as permanent deletion. Use “Move to trash”, “Restore work” and “Delete permanently” as the action labels.

## 3. Move to trash

Owners can move active or archived works to trash. Show a confirmation explaining that:

- all collaborators will lose access to the workshop while it is in trash;
- live building will stop;
- all public exhibits belonging to the work will be withdrawn;
- its building content remains recoverable until the owner deletes it permanently.

Show the actual number of affected collaborators and published exhibits. Do not invent presence or member activity. Confirmation does not require collaborators to approve.

The server must authorize the owner independently of the UI and perform a coherent lifecycle transition:

1. Serialize the transition with authoritative room commands.
2. Retain the latest valid durable scene and existing saved versions. If current state must be checkpointed, make the lifecycle transition and that checkpoint coherent; do not report success after losing acknowledged contributions.
3. Persist the trashed state, withdraw all dependent exhibits and revoke editing invitations.
4. Invalidate drafts, waiting tasks, editor leases and obsolete room commands; close the simulation room after the durable transition.
5. Notify connected clients and make public gallery, exhibit and thumbnail access reflect withdrawal.

Use the existing epoch/generation mechanism or an equivalent durable guard. A delayed command or worker checkpoint must not resurrect or mutate a trashed work. If persistence fails, return an honest failure and keep the work in a coherent recoverable state.

Trashing must work while physics is moving. Do not require a stable publishable pose to stop or recover a work. Recovery snapshots containing motion must retain their existing prohibition on publication.

## 4. Trash management and restoration

Add an owner-only Trash view within the existing work-management interface. It must remain usable if an owner has no active works. List only that owner's trashed works and provide restore and permanent-delete actions.

Hide trashed works from normal work lists for owners and editors. Editors and strangers must not browse the owner's trash or retrieve private scene/version data through known IDs. Give previously connected editors an understandable explanation rather than a silent disconnect.

Restore is owner-only and preserves the work ID, geometry, retained versions and existing membership. Return the work to its previous active/archived state. Editors explicitly removed or who left must not be re-added by restoration.

Restoration must not reopen a room automatically, restore revoked invitations, reuse stale leases/drafts, or republish exhibits. Require a fresh room join and a fresh authoritative state. Owners can subsequently publish/republish eligible exhibits through the existing publication workflow.

There is no automatic time-based purge in this change. State clearly that trashed work remains until the owner restores or permanently deletes it. Retained trashed works continue to count toward the owner's work/storage limits; trash must not bypass resource limits.

## 5. Permanent deletion

Permit permanent deletion only from trash, only by the owner, with a separate confirmation. Require the owner to enter the current work title exactly. Display that the action removes this work's building state, saved versions and associated exhibits, affects all collaborators, and cannot be restored from the application's trash.

The server must recheck ownership, current title and trashed state. A client-side confirmation or knowledge of a work ID is insufficient.

Delete work-scoped state transactionally, accounting for the actual schema: sticks or physics snapshots, named/recovery versions, exhibit geometry and thumbnails, memberships, invitations, pending tasks, and work-scoped command receipts as appropriate. Never delete contributor accounts, their other works, unrelated memberships or unrelated favorites.

Handle favorites referencing removed exhibits deliberately. Keep a minimal unavailable-item placeholder, or otherwise provide the existing explicit unavailable state, so users can remove it. Do not retain private geometry, private titles or contributor details merely to render that placeholder. Adjust foreign keys intentionally; do not disable integrity checks globally.

Stop stale work-related public responses and derived thumbnail serving. Already downloaded content cannot be recalled. Do not claim immediate destruction of independent backups or operational records when the implementation only removes the active application data.

Make duplicate requests and stale clients safe: no recreation of the work, inconsistent partial cascade, or unrelated deletion. Follow the project's existing request-id/idempotency conventions without retaining deleted geometry inside receipts. Log the lifecycle outcome using minimal identifiers, not passwords, invitation tokens or full snapshots.

## 6. UI and collaboration behaviour

Integrate controls into existing work management rather than adding a disconnected administrative screen. Owner controls must be discoverable; editor controls must remain limited to their existing rights, including leaving the collaboration.

Keep labels and consequences consistent across My works, workshop controls, work information, Trash, public gallery and Favorites. Disable duplicate submissions while pending, show actionable errors, and update displayed lists only after server confirmation.

On trash/deletion notification, cancel local drafts and disable placement immediately. Explain what happened and offer a route back to the user's work list. A remaining browser tab must not continue showing a successful live connection to a deleted work.

## 7. Verify contracts and remaining risks

Add focused tests using the existing harness. Preserve the shipped invariants and meaningful existing tests.

Cover at least:

- An editor, unrelated logged-in user and anonymous visitor cannot trash, restore or permanently delete another person's work through direct server requests.
- Trashing a work with two members closes live editing, revokes invitations, rejects late commands and withdraws all associated exhibits.
- Public exhibit/thumbnail endpoints and favorites do not expose withdrawn/deleted geometry.
- Trash is owner-only and persists across reload and server restart.
- Restoration preserves acknowledged scene data and permitted membership, keeps exhibits withdrawn, and requires fresh room state.
- Permanent deletion fails outside trash, with a mismatched title, or without ownership.
- Successful permanent deletion removes dependent building content while preserving both collaborators' accounts and unrelated work.
- Repeated requests, a racing room command and a failed transaction do not produce partial deletion or resurrect the work.

Use HTTP/WS behaviour and genuine datastore/restart checks where appropriate; do not substitute assertions that simply mirror implementation details. Reuse existing test setup and isolate test fixtures. Do not test permanent deletion on real user works.

Run the relevant checks and a targeted two-account browser walkthrough on the test instance: build together, publish, trash while another client is connected, inspect gallery/favorites, restore, then trash and permanently delete the disposable work. Report which checks actually ran and any concrete limitations.

## 8. Reconcile the original documents

After implementing and verifying, audit both brief.md and INITIAL_PROMP.md for affected statements. Do not merely append this directive while leaving contradictory rules in place.

Known affected areas in the supplied documents include:

- brief.md AUTH-02 (owner powers), AUTH-03 (invitation acceptance), AUTH-05 (privacy), SAVE-06/SAVE-07 (exhibits/favorites), and SAVE-08 (lifecycle and the old permanent-deletion exclusion).
- Navigation, empty states, resource limits, lifecycle acceptance scenarios and relevant success/failure rules.
- INITIAL_PROMP.md's works schema, archive section containing “Do not permanently delete works”, API capability table, lifecycle validation, storage limits, event logging, implementation stages and required HTTP cases.
- The original directive already permits republishing a withdrawn exhibit under the same unchanged snapshot. Ensure the brief explains that consistently, including the requirement for explicit owner action after restoring a work.

Preserve existing rule IDs. Add new IDs and acceptance cases using the project's numbering convention. Record this as a dated user-directed specification change; retain accurate historical process rather than pretending deletion was always planned.

Update technical mappings to the implementation's actual schema, lifecycle states, authority checks, room shutdown and dependent-data handling. Use whichever migration representation fits the existing code; do not prescribe a new stack or unnecessary tables.

Do not weaken unrelated product rules or course requirements. Individual-stick deletion remains outside this change. Archive semantics, frozen exhibit geometry and historic contribution attribution outside the deleted work remain intact.

Update user-facing help and README only where lifecycle explanations now require correction. If process documentation needs a factual change record, add it accurately. Do not fabricate personal reflections or rewrite the student's account in their voice.

Finish with a concise report covering implemented behaviour, verification, changed files, and the specific original rules corrected or clarified. Identify any remaining mismatch honestly. Follow repository instructions and existing authorization for commits or shipping; do not claim that deployment happened unless it did.

Begin by inspecting the repository, then complete the implementation and documentation reconciliation.

