# Implementation directive — Stillwood

Version 1.1 · 2026-10-06. Companion product contract: `brief.md`.

> **Change of 2026-10-06 (user-directed).** `OWNER_WORK_DELETION_PROMPT.md` reversed this directive's rule “Do not permanently delete works” for whole works only. It adds owner-only trash, restore and permanent deletion (brief SAVE-10..SAVE-12, AT-17..AT-19); §4.2, §4.4, §4.5, §5.1, §5.2, §5.4, §7, §8 (P7) and §9.1 are corrected to match the implementation. Stick deletion, per-person undo and voting remain out of scope. A same-day follow-up made the exhibit limit count retained exhibits (§5.4) and added the editor's leave entry (§4.5, §5.1). Sections below that describe P0–P6 are kept as the original plan.

You are implementing a deployed COMP4020 final project in the user's existing course repository. This is an execution directive, not a request to produce another proposal. Read this entire file and `brief.md` before changing code. Implement, run, inspect and correct the application in gated increments. Product-facing language is English. Keep the original wood-building concept intact.

## 1. Authority, scope and working discipline

1. Read applicable `AGENTS.md`, `CLAUDE.md`, repository instructions, course-provided configuration and test contracts. Preserve user work and existing history. Never expose tokens while inspecting configuration.
2. `brief.md` owns product behavior. This file owns the selected technical design and execution. Real repository constraints take precedence over assumed file paths. If a material conflict exists, describe its precise effect; do not secretly weaken a product rule or course check.
3. This directive authorizes necessary local implementation, ordinary reversible fixes, testing, documentation and incremental local commits where repository instructions allow. Do not fabricate old commits, reviews, human feedback or reflections. Pushing, publishing, visibility changes and deployment follow the user's existing authorization and actual environment permissions; perform all safe preparation first if an external action is blocked. Do not request approval again for an already authorized action.
4. Do not stop after scaffolding, a plan, a static mockup, or the Crit 8 subset. Continue through the complete brief unless the user sets a stopping point or a concrete blocker prevents progress. A failed gate means repair that stage, not abandon the task or label it complete.
5. Do not use client-only persistence, localStorage identities as server authentication, independent client physics as authority, permanent fixed sticks, turn-taking, fake multiplayer, fake gallery activity or automatic page reloads as shortcuts.
6. Do not replace the required Fly deployment with another hosting product. Do not add external databases, Redis, paid auth, external asset/CDN dependencies or extra machines to avoid the one-machine/one-volume constraint without an explicit revised requirement.
7. Keep `docs/implementation-status.md` with current stage, rule IDs, evidence paths, exact commands/results, real limitations and next action. Update it at each gate. Resume from this record after interruption; do not restart from scratch.
8. Keep brief changes separate from implementation fixes. Tunable constants can change with before/after evidence; changing core behavior requires a reasoned proposed amendment. A failing test is not permission to weaken the contract or supplied invariants.

## 2. Preflight and selected stack

### 2.1 Inspect before installing

Inspect git status, package manager/lockfile, mise/runtime pins, existing routes, `fly.toml`, `Dockerfile`, CI, `spec/README.md`, `invariants.test.ts`, scripts and any existing implementation. Run the existing checks against the currently running app where possible. Determine the required HTTP port, persistent volume mount, memory allocation, health checks, actual marking viewports and deploy procedure. Do not infer them from this document. Record a concise baseline, including checks that could not run and why.

The codebase has not been inspected while authoring this directive. The following is a **chosen default for a placeholder repository**, not a claim about existing files. If a working equivalent stack already exists, retain it when it meets the same contracts; record the mapping and avoid a gratuitous rewrite. Any different physics authority or durability design needs explicit technical justification and the same acceptance tests.

### 2.2 Default architecture

| Layer | Decision | Reason / boundary |
| --- | --- | --- |
| Language/runtime | TypeScript; Node version pinned by the course repo; pnpm | Shared validated types; preserve course toolchain |
| UI | React + Vite; small semantic DOM component set; CSS variables | DOM accessibility around a controlled 3D viewport; no dashboard template |
| Rendering | Three.js, direct scene ownership in a viewport controller; OrbitControls | Explicit control over picking, camera and render loop; no second rendering abstraction required |
| Physics | `@dimforge/rapier3d-compat`, exact compatible version pinned | Server WASM world, cuboid rigid bodies, contacts, sleeping and snapshots |
| HTTP | Fastify, compatible cookie/static integration; sanitized Markdown renderer | One origin for pages/API/WebSocket; README rendered on server |
| Transport | `ws` on the same HTTP server; native browser WebSocket | Distinct ephemeral presence and durable commands |
| Persistence | `better-sqlite3`, explicit SQL migrations, SQLite on existing Fly volume | One transactional source of truth without another service |
| Validation | Shared Zod schemas or existing equivalent | All inputs treated as untrusted; finite bounded numeric values |
| Tests | Preserve shipped harness; add contract tests, focused domain tests and Playwright interactions | Verify observed behavior, not mock success |

Use dependency versions that are actually compatible with the repository's pinned Node and Docker environment. Consult the installed version's official API, install exact versions, commit the lockfile and record versions. Do not assume the documentation's latest examples exactly match the installed Rapier release.

Use one Node process with **one coordinator worker thread** owning SQLite and all active Rapier worlds. The main thread handles HTTP, WebSockets, static assets and async password hashing; it calls the coordinator through typed request/reply messages. A single bounded coordinator is adequate as the baseline for three small rooms; validate this rather than inventing an elaborate distributed architecture. No per-viewer worlds, unbounded worker creation or network requests inside database transactions.

All room changes and physics ticks execute in coordinator order. Transactions and snapshot capture do not interleave with a tick in that room. Synchronous SQLite can briefly delay simulation, which must be measured. Network responses remain asynchronous on the main thread. Worker failure disables editing and readiness, then uses a supervised restart with backoff or lets the process restart; never keep accepting mutations against a dead authority.

### 2.3 Suggested responsibilities, not mandatory filenames

```text
src/shared/       schemas, protocol, geometry types, versioned config, error codes
src/client/       pages, semantic controls, session/room stores
src/client/scene/ renderer, camera, picking, placement math, interpolation, audio
src/server/       HTTP, auth, WS gateway, logging, coordinator RPC
src/server/core/  room lifecycle, physics, persistence, commands, permissions
src/server/db/    migrations and prepared queries
spec/            running-app course/product HTTP contracts
tests/           focused physics/domain tests and browser/restart scenarios
docs/            ADRs, implementation status, acceptance evidence and source notes
```

The UI may consume network/render buffers without putting every 60 Hz transform in React state. Dispose Three.js objects, WebSocket listeners, animation loops and audio nodes on route changes. React development remounting must not create duplicate worlds, listeners or commands.

## 3. Configuration, physics and placement mathematics

### 3.1 Versioned initial constants

Create a validated config object with a `physicsConfigVersion` and separate transport/UI config. The table contains implementable starting values, **not measured results**. The brief determines which changes need review.

| Item | Initial value |
| --- | --- |
| Stick full dimensions, local X/Y/Z | 8 / 1 / 1 u |
| Table radius/thickness/top | 18 / 2 / y=0 u |
| New placement bounds | All OBB corners: y in [0,80], XZ radius <=22 u |
| Removal bounds | Whole AABB below -20 u or wholly beyond radius 60 u |
| Stick mass | 1 in game mass units, uniform |
| Gravity | (0,-30,0) u/s²; explicitly game units |
| Fixed step | 1/60 s, maximum 4 catch-up steps per scheduler pass |
| Starting friction/restitution | 0.8 / 0.02; documented consistent combine rule |
| Starting linear/angular damping | 0.05 / 0.15 |
| Starting solver iterations | 8, mapped to actual installed API |
| CCD | Enabled on moving stick bodies; maximum substeps initially 2 |
| Stable UI/height threshold | All relevant linear speed <0.03 u/s and angular speed <0.02 rad/s for 1.5 s |
| Contact placement gap / penetration tolerance | 0.005 u / 0.002 u |
| Contact snap search | Downward only, maximum 0.2 u |
| Angular snap acquire/release | 3° / 5° hysteresis |
| Keyboard translation / fine | 0.1 / 0.02 u |
| Keyboard angular step / fine | 5° / 1° |
| Standard push | Magnitude mass × 3 u/s; applied at validated selected surface point |
| Active limits | 200 sticks/work, 4 editor leases/room, 3 live rooms |
| Client preview / world frames | Up to 15 Hz / up to 20 Hz while changing |
| Motion checkpoint | Every 500 ms while dirty; immediately upon stable transition |
| Empty room settle budget | 10 s, then snapshot velocities and suspend |

Use ordinary dynamic bodies, uniform cuboid colliders and a cylinder collider matching the table. Visual bevel <=0.03u initially. No joints, upright torques, locked axes or kinematic conversion in the accepted baseline. Do not manually sleep unsupported bodies. On explicit impulses or support removal in tests, request wake-up. Validate CCD with high-drop cases; it does not guarantee every contact under all configurations.

Pin the exact Rapier version and store it plus config/version hashes with every state. Store body-ID/handle associations and app metadata alongside native snapshots. Never assume native handles are user-facing stable IDs. Avoid non-finite quaternions, enormous positions or zero-length quaternion normalization.

Persist the actual immutable physical configuration values as well as their version/hash, or retain an immutable version registry covering every existing work. A version label pointing to newly edited constants is not versioning. New works may adopt a tuned configuration; existing works retain theirs unless explicitly migrated. Compare physical behavior at the same fixed timestep when tuning.

### 3.2 Placement controller

Use a state machine: `idle`, `draft`, `dragging`, `submitting`, `unknown-result`, `needs-review`, `disabled`. Keep camera mode orthogonal. All rendering derives from this state; buttons cannot create an untracked second draft.

- A draft contains position, normalized quaternion, fixed dimensions, selected handle, last valid yaw, mode and monotonic draft sequence. It is not a Rapier dynamic body.
- Pointer-down picking uses handle > draft > real object > background priority, with an enlarged pixel-space handle target. Preserve pointer-to-grab offset. Real objects can be selected/focused but never grabbed as movable bodies.
- Center drag intersects the pointer ray with y=the draft center's starting height. Preserve rotation. When `abs(ray.direction.y)` is too small (initial threshold 0.08), use bounded screen-projection deltas along XZ based on the camera Jacobian; clamp to a per-event world increment. Do not intersect a nearly parallel ray at infinity. Verify continuity at the fallback threshold.
- Height drag projects onto a vertical axis using screen displacement and world-units-per-pixel at the draft depth. Buttons/numeric increments remain available if the projection is degenerate.
- Endpoint yaw: lock the opposite endpoint `p`; retain current elevation `theta`; infer horizontal azimuth `phi` from a ray intersection on the moved endpoint's horizontal plane. Let `d=(cos(theta)*cos(phi), sin(theta), cos(theta)*sin(phi))`. New moving endpoint is `p + L*d`; new center is `p + (L/2)*d`. Account for which endpoint is selected so the local X direction and material orientation stay consistent.
- Endpoint pitch uses a separate elevation handle/control in the vertical plane spanned by last valid horizontal direction and Y. Map a bounded screen angle or signed screen displacement to `theta`, clamped to [-90°,90°]. Near vertical, retain `phi`; do not derive yaw from a nearly zero horizontal vector.
- Derive a quaternion mapping local X to the required signed direction, then apply roll around local X. Preserve the pinned endpoint in all presets; center-mode presets preserve center. Keep a canonical sign for quaternions before serialization for consistent comparison.
- Roll is available in the compact adjustment panel even though not a prominent default gesture. No scaling tool.
- During pointer capture disable competing OrbitControls interactions; on `pointerup`, `pointercancel`, lost capture, blur and component disposal restore a coherent input state. Never submit automatically on blur.

Contact assistance uses an OBB downward sweep against the table and existing cuboids, stopping at the **first** contact, leaving the configured gap. Use shape casting via a read-only query helper or a verified swept-OBB implementation, never a ray through only the center of a long beam. A browser query world, if used, contains kinematic query geometry only and is never the authoritative simulation. Run the same geometric validation on the server. If an existing piece moved since preview, the server validates the submitted pose and may reject it; it must not secretly re-snap it.

Use Rapier signed contact/shape-distance queries or a verified OBB SAT narrow phase to separate touching from meaningful penetration. An overlap query alone rejects legitimate contact and is insufficient. Broad-phase AABBs may find candidates but cannot be the final rule. Test face contact, edge contact, gap, shallow tolerated overlap and deep intersection for rotated sticks. Client preview remains advisory.

### 3.3 Camera, rendering and physical feedback

Perspective camera, initial FOV approximately 35°, warm neutral table, no automatic orbit in the workshop. Orbit target starts near the table center and can be raised, lowered or focused on a selected piece. Use bounded polar angle approximately [0.025,1.50] radians and appropriate near/far planes for configured world bounds. Protect zoom into geometry with a target-to-camera cast and a small distance margin. Offer an explicit wide view if focus lies inside a crowded structure.

Reuse geometry/materials and use instancing for settled sticks where it helps; maintain `instanceId -> stickId` picking mapping. Separate draft/selection overlays. Bound device pixel ratio (initial desktop max 2, mobile max 1.5); reduce shadows before compromising input correctness. Target stable 55+ FPS desktop and 30+ FPS representative mobile at the declared scene capacity; record actual device/browser/results rather than asserting those targets are achieved.

Use procedural/local wood textures, longitudinal grain and distinct end grain. Document provenance for any external assets. Contact shadows must make a small gap visible. Use deterministic per-stick grain seed with no change to physical properties. Interpolate network transforms using position lerp and quaternion slerp; render about 100 ms behind server time. If updates stop, hold the last state and show connection status rather than freely extrapolating a collapse. A newly accepted body may fade from its ghost to the first authoritative transform, but cannot be animated into a different physical result.

Collision audio derives from authoritative contact-strength events with event IDs; cap polyphony (initially 6 voices) and rate. No audio before user activation; mute persists locally. Reduced-motion disables decorative easing, not necessary state changes. The keyboard control panel mirrors every placement/camera action; expose current draft pose and meaningful errors as DOM text without announcing every animation frame.

Visual starting tokens: warm background `#F4F1EA`, near-black text `#252B26`, pale panel `#FCFAF5`, restrained green accent `#476451`, natural wood around `#BC9167`. Check contrast rather than assuming these tokens meet every use. Use a locally available/system sans-serif, tabular numerals for height, generous whitespace and minimal borders. Desktop: unobstructed canvas, compact top status, right action rail, collapsible adjustment panel no wider than 280 px. Mobile: compact top bar and bottom adjustment sheet, keeping at least 55% of viewport height for the scene where practical. Visible labels must survive narrow layouts and text zoom. These are layout defaults; inspect real rendered views and improve without turning the app into a generic card dashboard.

### 3.4 Height and stability

Use a documented **game support approximation**, not a structural safety claim. From contact manifolds, add a directed support edge from lower to upper body only when the normal on the upper body has y>=0.5, the supporting body's center is lower (table is the root), and a contact lies below the upper center within tolerance. Orient normals correctly for collider ordering. Flood from the table; count only reachable bodies continuously below the stable velocity thresholds. Side-to-side contacts do not count. Height is max world-space top vertex among the qualifying component, minus table y=0.

Update the visible stable result after 1.5 s of qualifying stability. While the component changes show measuring and last result. Explicitly test leaning/side-contact false positives, free-falling bodies and an isolated stable pillar. Refine this approximation if tests reveal misclassification; do not imply it proves load-bearing correctness. The physics simulation alone determines motion. Record best height only in normal building mode; never restore the previous `bestHeight` over a newer record.

## 4. State model and database

### 4.1 Identity and ordering

Use UUIDs for users, works, sticks, snapshots, exhibits and command IDs. Distinguish:

- `worldEpoch`: durable integer, incremented on restore/reset of world content; never copied backwards from a snapshot.
- `commandSeq`: durable monotonic work mutation sequence; never reset on restore.
- `physicsTick`: fixed-step count within the current world; may revert only when loading a saved world, accompanied by a new epoch or stream.
- `streamId`: random room activation/process-stream identifier; frames from a previous stream are discarded even if their ticks look newer.
- `leaseId`: transient editor-window capability issued after authentication; replaced on takeover, never used as sole proof of identity.
- `physicsConfigVersion`, `engineVersion`, `snapshotSchemaVersion`: determine how a state can be read and stepped.

The distinction is essential: a physics frame is not a durable user command, and reviving an old native snapshot must not revive revoked membership or accepted command IDs.

### 4.2 Minimal relational model

Create tables only when the stage needs them. Use foreign keys, unique constraints, indices for membership/lookups and explicit migrations. The following fields define semantics; choose concrete SQL names consistently.

| Table | Essential data |
| --- | --- |
| users | id, canonical unique handle, display name, password salt/hash/parameters, recovery digest, created time |
| sessions | token digest, user id, CSRF secret/digest, expiry, last-seen, revoked time |
| works | id, owner id, title, archived flag, **trashed time (null unless in the trash; independent of archived, so restore returns to the previous state)**, world epoch, command sequence, best height, creation/update time |
| memberships | work id + user id unique, owner/editor role, joined time; owner membership protected |
| invites / invite_acceptances | token digest, work, issuer, expiry, revoked time, maximum uses; unique invite+user acceptance |
| work_states | work id, native world blob, app metadata JSON, tick, engine/config/schema versions, checksum, saved time |
| previous_work_states | at most one last valid predecessor per work, same envelope, for diagnostics/recovery |
| command_receipts | actor id + command id unique, work id, request digest, outcome, seq/epoch, response JSON, committed time |
| snapshots | id, work, creator, kind, immutable world envelope, title, height, source epoch/seq, stable flag, creation time |
| exhibits | id, work, snapshot id, title/description, server-generated public geometry, framing, attribution, published/withdrawn time |
| favorites | user id + exhibit id unique, creation time. **No foreign key to exhibits** (migration 2): a favorite of a permanently deleted exhibit stays as an id-only row rendered “No longer available”; adding a favorite still checks the exhibit is public |
| work_tombstones | work id, owner id, deletion time only; makes a repeated permanent delete idempotent for the owner and a 404 for everyone else. No title, geometry or membership |

Store the <=200 stick records (IDs, authors, created command, texture seed and native handle association) inside the same world envelope as the native snapshot. This prevents a per-frame SQL row per transform and prevents mixed-time metadata. Persist removed-stick contribution/audit facts in command receipts; do not accidentally put 60 Hz frames in an append-only event table. Snapshot blobs and public geometry are distinct representations.

World-changing operations require a complete state transaction. Metadata-only operations such as favorites use ordinary smaller transactions. Every externally retryable mutation uses an idempotency key or a naturally idempotent method. For the same key and same normalized request digest return the original result; a different payload with the same key is a conflict. Do not auto-expire accepted world-command receipts during the project lifetime. Re-check the current actor's permission before returning private result details.

### 4.3 Transactional save design — implement this, not vague autosave

The chosen design is **full authoritative snapshot on every accepted world mutation**, plus coalesced checkpoints while physics moves. This deliberately avoids requiring command-log deterministic replay for correctness at the proposed scale.

For placement or impulse:

1. Authenticate from the session; validate current membership, lease, mode, epoch, fresh stream/tick and payload; resolve existing receipt before any mutation.
2. Inside coordinator serialization, record the current in-memory native snapshot and app envelope as rollback state; do not advance a physics tick until the mutation finishes.
3. Validate current collision geometry/bounds. Construct the new dynamic body, or apply the validated impulse, without stepping physics. Assign stable application IDs server-side.
4. Take the resulting full native snapshot and app envelope. Atomically commit `work_states`, monotonic counters, relevant height/mode metadata and command receipt in one SQLite transaction. Keep the previous reliable state using the same transaction where appropriate.
5. Only after commit, send `command.result: accepted` and broadcast the accepted state. The actual gravity simulation begins/continues in subsequent ticks.
6. On failure, restore the pre-command in-memory snapshot/envelope, free the discarded world, return no success, and disable writes if the storage fault persists. If rollback cannot be trusted, suspend the room and reload the last valid durable state. Do not keep simulating an uncommitted body.

Crash before commit: no acknowledged change. Crash after commit but before reply: reconnect/query by the same command ID returns the saved result. Crash after reply: state includes the change. Check all three using real process termination tests.

Checkpoints capture the native world **and** metadata at the same tick, with full velocities/sleeping information. They update current state only; receipts remain. Save every 500 ms of dirty motion and on stable transition. A checkpoint failure suspends further mutations and prevents a false saved indicator. After unexpected termination, up to the latest uncheckpointed movement may replay; no acknowledged placement is lost. Do not claim zero loss of every animation frame or hardware-destruction resilience.

SQLite starts with `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=FULL`, bounded busy timeout and prepared statements. Put DB and its WAL/SHM in the existing writable persistent mount. Use one connection owned by the coordinator. Profile transaction/snapshot cost. Do not switch to weaker durability just to hit a latency number. Native snapshots plus app envelope checksums must be validated before use. A corrupt newest state must be reported; falling back to older data cannot silently erase acknowledged contributions.

Store old engine/config identifiers and reject unsupported state versions with a recoverable diagnostic. No opportunistic physics package upgrades after real saved works exist. For an intentional upgrade, back up, migrate on copies using a supported native format or documented canonical export, prove restore behavior, and retain rollback. Frozen public geometry must remain viewable independently of native snapshot compatibility.

### 4.4 Snapshots, restore, push and lifecycle

Normal named snapshots/publication require stable state and are immutable. Queue at most one pending 'save when stable' per user/work; cancel on epoch change, logout, removal or explicit cancel. Public exhibit creation references an existing stable snapshot and extracts only public data. Sanitize text and limit lengths.

An awaiting-stability request returns a visible `pending` operation, not a false successful snapshot. It resolves to a durable receipt only when the snapshot exists; cancellation has a distinct terminal result. Querying a pending request returns pending, never unknown. If the worker restarts before the snapshot was created, report the task interrupted and require explicit resubmission; do not claim a version was saved. A plain immediate snapshot request against moving state returns `NOT_STABLE` instead of silently queuing.

Keep waiting tasks outside the mutation queue so they do not stop physics or other users. The browser retains the pending operation ID, kind and stream while the task exists. After a changed stream, query for a committed receipt first; if none exists, interpret a formerly pending save as interrupted rather than silently re-enqueueing it. Publishing an already stable saved version need not wait for the current working world to settle.

Restore is one coordinator transaction: check owner, expected current epoch and target compatibility; capture a pre-restore recovery snapshot (may be moving); load target into a candidate world; increment current epoch and sequence without reverting membership/best height/receipts; store replacement world and receipt atomically. Only then free the old world and broadcast a full resync. Current drafts become `needs-review`; no auto-submit.

Push preparation is owner-only and serialized after earlier submitted commands. Revalidate stability, store the protected version, then enter `push-selecting`. Placement is blocked with a reason; cameras stay independent. `push-confirm` accepts one body ID, validated surface contact and normalized horizontal direction, and applies the fixed impulse with wake-up. Use `push-running`, then `push-review`, followed by keep or restore. Allow cancel before impulse. Give `push-selecting` a 60 s idle timeout. Any owner disconnect starts the brief's 10 s recovery policy, which clears the lock and keeps current state/checkpoint. Restart clears transient push locks and announces recovery. Mark motion originating from an interrupted push in the persisted envelope so best-height updates remain suppressed until that motion settles, even after a restart.

Archive serializes with room operations, captures current state, marks read-only and closes editor leases. Unarchive is owner-only. Archive never deletes anything; whole-work deletion goes through the trash (§4.5). Unpublishing immediately removes public geometry access, invalidates cached thumbnail responses and turns favorites into withdrawn placeholders. A withdrawn exhibit may be republished by the owner under the same unchanged snapshot; it reuses its row and uses no additional slot (§5.4). Title/text changes must not rewrite the frozen geometry.

Archiving does not withdraw existing exhibits; make that explicit in the confirmation UI. Published attribution is a frozen public projection, not a live query that exposes new private members. Changing a display name later does not change the historic exhibit attribution automatically.

Cap snapshots as specified by the brief. Protect references with foreign keys; automatic cleanup cannot delete published or active recovery targets. Unreferenced manual versions may be explicitly deleted by owner after confirmation. Use a bounded recovery ring for automatically created protection states. Avoid duplicating hundreds of checkpoints as named snapshots.

### 4.5 Trash, restore and permanent deletion (added 2026-10-06)

All three run as one coordinator call each, so no room command, tick or checkpoint interleaves. Authority: `requireOwner(..., { allowTrashed: true })`; editors get `NOT_OWNER` (403), non-members `NOT_FOUND` (404), anonymous `UNAUTHENTICATED` (401). Every other member path treats a trashed work as `TRASHED` (410, with an explanation and no data) for members and `NOT_FOUND` for strangers; only `members.leave` also accepts a trashed work.

- **Trash** (`works.trash`). In one `durable()` transaction: write the live room's current envelope if the room isn't paused (a paused room's memory isn't trusted; the last durable state already holds every acknowledged placement), set `withdrawn_at` on every public exhibit, revoke active invites, set `trashed_at` and increment `world_epoch`. On failure: `SAVE_FAILED`, nothing changed, room still live. After commit: cancel waiting saves, send `access.ended {reason: "TRASHED", message}` to every window in the room and every read-only window viewing the work, drop leases and drafts, free the world and remove the room without another save. Already trashed: success with `alreadyTrashed`. Works in any room mode, including `push-running` and moving.
- **Durable guard.** SQLite triggers (migration 2) abort any insert/update of `work_states`, or insert of `snapshots` or `exhibits`, for a trashed work, so no late writer can revive or change it. `activate()` refuses trashed works; the epoch increment makes pre-trash commands `STALE_WORLD` after a restore.
- **Editor's view** (`works.unavailable`, `GET /api/collaborations/unavailable`). For the signed-in editor only: `{id, title, status: "trashed-by-owner"}` for each trashed work they still belong to, so My works can offer “Leave this collaboration” (`members.leave`). No scene, versions, members or trash access.
- **Restore** (`works.untrash`). Clear `trashed_at` only. Memberships, revoked invites and withdrawn exhibits stay as they are; no room opens; the next join activates a fresh stream from the durable state. Already active: success with `alreadyRestored`.
- **Permanent delete** (`works.purge`). Tombstone first (owner: `alreadyDeleted`, others: 404); then owner, `trashed_at` set (`NOT_TRASHED` 409) and exact stored title (`TITLE_MISMATCH` 422). One transaction deletes invite acceptances, invites, exhibits, snapshots, command receipts, previous and current work state, memberships and the work row, and inserts the tombstone. Foreign keys stay on throughout. Users, other works and favorites rows are untouched. A failed write deletes nothing.
- **Logs.** `work.trash` (exhibits withdrawn, invites revoked, windows notified, live/moving), `work.untrash`, `work.purge` (counts of versions, exhibits, members). IDs and counts only.

## 5. HTTP, WebSocket and reconnect contracts

### 5.1 HTTP surface

Use `/api/` for JSON and the brief's paths for pages. Implement these capabilities with typed schemas; consistent REST naming matters more than reproducing a particular framework layout:

| Group | Endpoints / purpose |
| --- | --- |
| Session | register, login, logout, current session+CSRF token, password recovery and recovery-code rotation |
| Works | list mine (trashed excluded), create, read member metadata/state, rename, archive/unarchive; owner-only `GET /api/trash`, `POST /api/works/:id/trash`, `POST /api/works/:id/trash/restore`, `POST /api/works/:id/delete-permanently {title}` (§4.5); editor-only `GET /api/collaborations/unavailable` |
| Members | list, invite creation/revocation, accept invitation, remove editor, leave collaboration |
| Commands | submit placement/push/restore using the same coordinator handler as WS; query own command result |
| Versions | list/create/delete unreferenced versions; save-when-stable uses the command lifecycle |
| Exhibits | public list/detail/geometry/thumbnail; owner publish/withdraw |
| Favorites | authenticated list, idempotent add/remove |
| Health | lightweight liveness; readiness includes coordinator and usable DB |
| README | server-rendered full Markdown content, ordered headings in initial HTML |

No mutation through GET. Private pages may deliver a generic shell, but private data endpoints must authenticate; unauthenticated requests never receive embedded private geometry. Use coherent 401/403/404/409/410/422/429/503 responses and stable error codes such as `STALE_WORLD`, `COLLISION`, `ROOM_FULL`, `NOT_EDITOR`, `SAVE_FAILED`, `TRASHED`, `NOT_TRASHED`, `TITLE_MISMATCH`. Avoid revealing whether another user's private work exists through detailed 403 messages.

The public exhibit response is an allowlisted projection, not serialization of a DB row or raw native snapshot. Cache immutable geometry only while still public: responses must require revalidation so withdrawal cannot be bypassed by a long-lived fresh cache. Do not use a service worker that serves private/public geometry indefinitely without checking permissions.

Generate gallery previews from the actual frozen geometry. Start with a server-generated isometric SVG using projected cuboid faces, consistent wood palette, depth ordering and safe numeric/text encoding. It is a thumbnail, not a substitute for the interactive Three.js exhibit viewer. Do not use invented stock towers. If thumbnail fidelity requires improvement, render a true thumbnail through the same scene renderer as a later enhancement; do not create one WebGL context per gallery card.

### 5.2 Protocol envelope

Use versioned JSON initially; at this scale a full bounded transform frame is simpler to verify than delta recovery. Encode only needed fields. Optimizing to binary is allowed after profiling, without changing semantics.

```ts
type Command = {
  v: 1;
  type: 'command';
  commandId: string;       // UUID generated once per user intention
  workId: string;
  worldEpoch: number;
  streamId: string;
  lastSeenTick: number;
  leaseId: string;
  kind: 'place' | 'push.prepare' | 'push.confirm' | 'push.cancel'
      | 'push.keep' | 'restore' | 'snapshot.create';
  payload: unknown;        // discriminated validated schema, never trusted
};
// Actor identity is derived from the authenticated socket/session, not this payload.
```

Client messages: authenticated `room.join`, `lease.takeover`, `draft.start`, `draft.pose`, `draft.end`, command, `command.query`, heartbeat and allowlisted semantic interaction-end telemetry. Server messages: `room.snapshot`, `presence`, `draft.pose`, `draft.removed`, `world.frame`, `command.result`, `save.status`, `lease.changed`, `room.mode`, `room.reset`, `access.ended` (logout, expiry, removal, leaving, archive, and `TRASHED` with an explanatory message), `error` and heartbeat response.

`room.snapshot` includes work/world IDs, role, lease status, active mode, current full public-to-member geometry/poses, relevant metadata, current heights, last persisted tick and server timestamps. It never includes secrets or native blobs. `world.frame` includes stream, epoch, command sequence, tick, server monotonic timestamp, full bounded poses/sleep state and compact authoritative collision events. Using full frames makes intentional dropping of obsolete frames safe. Stable rooms send no repeated 20 Hz full frames; they still send heartbeat/presence and immediate changes.

Before command execution, compare `worldEpoch` and `streamId` exactly. Treat older `commandSeq` as context, not a global compare-and-swap that prevents collaboration. Require `lastSeenTick` to be within 120 ticks of the current active simulation; stale clients receive `STALE_VIEW`, a current snapshot and a retained draft. Do not advance empty/stable worlds solely to expire tick freshness: a stable unchanged world can accept an older lastSeenTick. On return from background or lost heartbeat require fresh handshake regardless of tick.

Validate at submission: finite position, normalized quaternion within tolerance, current bounds/collision, current capacity, role, lease, mode, archive status, epoch and freshness. The server chooses mass/dimensions, IDs, initial zero velocities and config. Never accept client-provided body type, height, author or force magnitude.

Draft packets carry a monotonically increasing draft sequence and current epoch/stream. Ignore stale sequences. Keep one draft per lease. On restoring a world clear remote draft state and require fresh `draft.start`; local saved draft is visibly unconfirmed. Heartbeat every 5 s, stale after 15 s; heartbeat includes the current draft presence so a stationary held piece remains visible. Restrict ephemeral traffic to 20 messages/s per editor with a small burst allowance and coalesce poses.

### 5.3 Idempotency and reconnect

While `submitting`, disable new placement of that same draft and keep its `commandId`. After timeout show “Checking whether this was placed”, not an unconditional retry. Query the receipt on reconnect with the **original ID**. Accepted means remove the draft and render the authoritative body; rejected means retain it with explanation; unknown means fetch fresh state and require an explicit retry/confirmation using the same ID if payload is unchanged. A changed pose is a new intention and requires a new ID only after the previous intention is resolved. Never permit a delayed old submission and a newly named copy to both commit.

If a command can still be queued while HTTP query runs, coordinator ordering must distinguish `pending` from `unknown`; do not infer unknown merely because there is not yet a DB row. Use one in-flight command registry per actor/ID and serialize queries through the coordinator. HTTP and WS submission share this registry and the receipt table. Hash normalized payload plus work, actor and original command context; duplicate identity is checked before rejecting its old stream/epoch, but only a currently authorized actor may read private results.

Reconnect backoff: 0.5, 1, 2, 4, then max 8 s, with jitter; stop on deliberate logout. New join gets a full snapshot and lease decision. Discard previous stream's interpolation buffers. Preview can be adjusted offline, but no queued automatic placements. Membership revocation invalidates sockets/leases and clears private client stores; cached already-viewed content cannot be remotely erased, and the UI must not promise otherwise.

### 5.4 Backpressure and scheduler

Use per-user command limit initially 2 world mutations/s with burst 4, one pending placement per draft; cap each room's queued world commands at 16. Reject overload before taking an unbounded queue. Rate-limit code returns a retry time without losing drafts.

Bound ordinary storage admission too: initially 20 owned works/account, 30 retained exhibits/work (public or withdrawn; withdrawing frees no slot; creating an exhibit is checked inside its write transaction, so concurrent publishes can't overshoot; republish reuses the existing row and is not limited, even when older data exceeds 30), 100 favorites/account and at most one active invite/work (creating another revokes the prior token). These are transparent initial resource limits, not a billing system; surface limits before the user loses input. Match the brief's 30 named versions and 10 unreferenced recovery points, and keep referenced versions protected. Monitor the actual volume capacity; when the free-space reserve is reached, reject new durable mutations with a clear storage-full state while preserving readable data. Do not delete existing works automatically to make space. Archived and trashed works count toward the owned-works limit; only an owner's permanent deletion frees a slot. Record any adjusted limits consistently in user help, server config and tests.

Per socket, coalesce obsolete full frames and previews above 256 KiB buffered output. Do not silently discard command outcomes; if the client remains above 1 MiB, close with a reconnect/resync reason. Persisted outcomes remain queryable. Set an inbound message cap (initially 16 KiB), validate before forwarding to the worker, and disable unnecessary compression until memory/CPU are measured.

Use a monotonic accumulator for 60 Hz physics, never variable delta tied to rendering or network arrivals. Allow at most four catch-up steps per scheduler pass; sustained lag triggers overload mode/admission control and a log, not an unbounded spiral or one enormous physics step. Existing rooms retain authority. A paused overloaded room announces the pause; it does not keep pretending to run in real time.

Profile all three rooms together, including an all-awake collapse and saved commands. A source-level FPS claim is not evidence. Begin measuring p50/p95 command commit time, cross-session visibility latency, worker tick cost, event-loop delay, snapshot size/time, RSS and outbound bytes as soon as the vertical slice exists.

## 6. Authentication and server-side access control

For a placeholder repository, use Node's async `crypto.scrypt` and opaque server sessions. If a maintained, working auth implementation already exists, reuse it if it satisfies these contracts rather than replacing it gratuitously.

- User handle: canonical lowercase ASCII `[a-z0-9_]{3,24}`; display name: 1–40 Unicode characters. Escape all rendered names. Passwords: 12–128 characters, also cap encoded bytes at 1024; allow password managers and paste, no invented composition rules.
- Initial scrypt parameters: N=65536, r=8, p=2, random salt >=16 bytes, derived key 64 bytes, explicit maxmem >=96 MiB. Store algorithm/parameters with the hash; constant-time compare fixed-length decoded keys. Use a dummy hash path for unknown users to reduce obvious timing enumeration.
- Run at most one memory-heavy hash at once initially, bounded waiting queue of 8; return a retryable busy response instead of allocating unbounded memory. Registration/login/recovery have independent account/IP rate limits. Never block physics with synchronous hashing.
- Session token: 32 cryptographic random bytes. Store SHA-256 token digest, not plaintext; cookie `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`. Local development may use the documented non-Secure HTTP mode only. No JWT/localStorage token scheme is needed.
- Absolute session lifetime 30 days, idle expiry 7 days, last-seen writes coalesced to at most once per 15 minutes. Regenerate tokens at login/recovery, revoke on logout; password recovery revokes all previous sessions.
- Mutation HTTP requests require expected Origin and a per-session CSRF token; auth endpoints also enforce same-origin browser requests. WebSocket upgrade verifies exact allowed Origin and valid session; pass a short-lived authenticated join token or CSRF proof as the first message, never in logged query strings. Reject commands before handshake completes.
- Check revocation/membership in coordinator order on each privileged mutation; heartbeat also detects expiry. Do not trust user ID, role, work ownership or actor fields from the browser. Configure proxy trust only for the actual deployment boundary, not all spoofable forwarded headers.
- Recovery code: 32 random bytes encoded for copying, shown once; only SHA-256 digest persists. Handle+code+new password performs a rate-limited atomic one-time reset, rotates code and revokes sessions. Persisting a code is the user's choice; explain that there is no email recovery. Owner cannot read another member's recovery code.
- Invitations: 32 random bytes, hashed at rest, seven-day expiry, three distinct acceptances by default. Use URL fragment for the bearer secret (`/join/#token=...`) so it is not in server access logs; transfer in a same-origin POST after explicit accept. Never store raw invite secrets in analytics, logs or page metadata. Owner can create another link if the original is lost. Viewing an invite is not acceptance.
- Input limits: titles 80 characters, exhibit description 500, snapshot title 80. No arbitrary user HTML, URL fetches or model/asset uploads. Parameterize SQL. Content Security Policy and output sanitization should permit the app's own assets while preventing injected script execution; do not break WebSocket/WASM loading with an untested policy.

Editor lease is per account per work, separate from membership and session. One account can have more than one authenticated browser, but only one active editing lease per work. Explicit takeover revokes the old lease atomically, removes its ghost, then grants the new one. Never let two clients both believe a successful command proves that an old lease remains valid.

## 7. Logs, privacy and course integration

Use structured JSON to stdout, with a common schema:

```json
{"time":"ISO8601","level":"info","event":"stick.place","actorId":"opaque-id","workId":"opaque-id","commandId":"uuid","epoch":2,"seq":14,"outcome":"accepted","durationMs":18}
```

Log application events, not credentials or full request bodies. Include rejection reason codes, reconnects, member changes, snapshot/restore/publish/withdraw/favorite events, archive, trash/untrash/purge (IDs and counts, never titles, tokens or snapshots), physics/save faults, overload and mode transitions. Include IDs that let the student follow each room. Server-confirmed mutations and client-reported local interactions must be distinguishable: mark camera/adjustment summaries as `source: client-reported` with authenticated actor identity. At most one semantic summary per completed gesture, coalesced/rate-limited; no per-pixel tracking.

A real `flyctl logs` tail is sufficient for Crit 10. Provide a short log-only demo script and known event examples produced by actual test actions; do not invent log evidence. Preserve logging beyond that crit. No external tracking SDK. Avoid verbose geometry, IP addresses, auth URLs or secrets in normal app logs. Keep metric labels bounded; do not use every user/work ID as a long-lived histogram label.

Read the current course sources linked in `brief.md` and the repository's harness before final handoff. Preserve `/` success and the full README rendered at `/readme/` in initial HTML, not just after client hydration. Add product tests beside shipped tests; do not rewrite shipped invariants to pass a weaker app. Ensure `pnpm check` and the supplied `pnpm check:evidence` workflow run as actually specified. If a required script is missing, inspect course instructions before defining a meaningful one; never add a stub success script.

Write ADRs for server physics authority, transactional snapshots, placement assistance, identity/permissions and simultaneous-placement behavior. Include the rejected alternative, the product reason and the concrete cost. Keep PROCESS and reflections faithful to real work. Help the student structure or verify their own reading/argument; do not invent first-person experiences or claim they read sources they have not read. A detailed brief does not replace the course README.

The currently published final guidance gives README 400–600 words and PROCESS 900–1100 words; confirm current guidance when preparing submission. Keep detailed technical decisions in linked ADRs. Record genuine work as it happens, while leaving personal judgments for the student to write or revise; do not defer all process evidence until after implementation.

## 8. Stage gates and execution order

Each stage ends with a running slice, targeted evidence, status update and a truthful incremental commit where allowed. Continue automatically to the next stage after the gate passes. If a gate fails, diagnose and repair, then re-run the affected checks; do not repeatedly run unrelated broad suites.

### P0 — Repository, baseline and technical proof

Deliver the baseline inventory, a short stack ADR and a rule-to-test tracking table covering **every numbered brief rule**. Preserve existing source. Verify production build and unchanged course harness. Build a minimal, disposable-but-reusable scene/physics probe for a pillar, a bridge and a falling stick, plus native snapshot restore in the pinned runtime. Verify WASM and SQLite native dependencies inside the actual Docker image. Capture a real frame and fixture results. This is a technical spike, not the finished app.

Gate: Node/Docker build works; snapshot restore is proven; collision behavior is promising; no invented package APIs. If a chosen package is incompatible, document the actual error and choose a compatible release without weakening contracts.

### P1 — Solo product core with durable placement

Build real account creation/login/session, create/list works, server physics, exact full-snapshot transaction and same-origin API. Implement independent camera, center/height/endpoint controls, presets, snap/validation, submit/cancel and meaningful save states. Use the same server authority from day one; do not build a client-only toy that later needs replacement. Establish the DOM keyboard controls alongside pointer input.

Implement the minimal authenticated `room.join`, lease, snapshot/frame stream and command result path here even for one user; P3 extends it to presence, invitations, several editors and adverse connections. A solo browser still needs live authoritative falling-body frames. Work creation persists an empty world even if a room cannot currently be activated; admission failure cannot erase the new work.

Gate: a stranger can create a work, place several sticks, form a bridge, refresh and log back in; accepted commands survive actual process kill/restart. Real Docker HTTP checks pass. Camera changes are local. Record the touchpad usability questions still needing a human.

### P2 — Crit 8 deployable slice and visible product direction

Make the root inviting and useful, add initial accurate wood material/light, clear onboarding, proper error/empty states and the full README route. Record stack/process facts and student-authored argument/reflection work still outstanding. Validate persistent mounted data across container replacement. Prepare/deploy to the existing Fly app as authorized and verify actual URLs. Verify actual cutoff and required repo visibility; do not assume a usual Monday or change privacy without authorization.

Gate: the Crit 8 slice genuinely works on Fly when deployment access exists. If credentials/access are absent, complete local Docker evidence and report that deployment remains unverified; do not stop all local product work for that reason. Do not mark the full brief complete at P2.

### P3 — Real collaboration and adverse connections

Add invitations, membership controls, leases, presence, ghosts, authenticated WS, simultaneous commands, full-state interpolation, backpressure, reconnect/query handling and revocation. Build against the exact same placement handler used by HTTP; no second weaker path. Use at least two independent authenticated browser contexts.

Gate: two users prepare and release concurrently; current views converge; an overlap rejection retains draft; no camera stealing; old epochs/leases fail; an unknown response never duplicates a stick. On the normal-network workload, measure approximately-one-second visibility with p95 <=1000 ms across at least 30 accepted changes. Record client-visible timing and infrastructure, not just server handler duration. Use representative network delay as a separate robustness test, not a promise of subsecond delivery under arbitrarily bad links.

### P4 — Versions, gallery, favorites and deliberate collapse

Add stable manual versions, immutable public geometry, real geometry thumbnails, full 3D read-only exhibit viewer, favorites, withdraw, archive, member attribution, push modes and transactional restore. Add session/recovery edge flows if not already complete. Validate quota and retention rules, stable-save waiting cancellation and pre-restore protective snapshots.

Gate: an exhibit does not change when the working tower collapses; withdrawal blocks public API; reset invalidates stale requests; owner disconnect cannot leave a permanent lock; restored geometry and metadata match the selected version while membership/best height remain current.

### P5 — Interaction quality, accessibility and capacity

Tune physics with repeatable fixtures; polish contact hints/materials/audio and UI hierarchy. Check real touchpad operation, touch simulation plus an actual mobile device if available, keyboard-only building, both actual marking viewports, mid-use resize and reduced motion. Profile 3 rooms × 4 sessions with 200 sticks each, including simultaneous active collapse, ordinary placements, snapshots and concurrent login attempts. Verify saved/authenticated paths remain usable and RSS has headroom (target <=80% of configured container memory during the measured scenario).

If capacity targets are not met, optimize measured bottlenecks first. Any lower published cap requires recorded evidence, consistent UI/test/config changes and a note of the product trade-off; never claim the original workload passed. Preserve at least two simultaneous editors and the intended building experience. If this cannot be achieved, escalate the concrete limitation instead of silently turning the project into a different app.

Gate: AT-01 through AT-16 have evidence/status; no broken core keyboard/mobile path; core behavior passes under the declared load. Human judgments remain explicitly pending until a person has actually tried the app.

### P6 — Final contract audit and handoff

Run the complete required gates once the app is ready. Audit every brief ID, not only tests the agent happened to implement. Check live deployment, restart/redeploy persistence, `/readme/`, no debug UI, no leaking logs, assets/licenses and repo documents. Produce `docs/acceptance-report.md` with passed, failed, unverified and human-judgment items. Fix defects and update evidence. Do not equate a green unit suite with a complete product.

Do not claim HD, full marks, real user satisfaction or future crit completion. State what is implemented, what was actually observed, and what remains outside available access or requires the student's authorship.

### P7 — Owner-controlled work deletion (change of 2026-10-06)

Inspect the current archive, withdrawal and ownership code first; implement §4.5 within the existing coordinator, schema migrations and UI; then reconcile the brief.

Gate: the AT-17..AT-19 cases in §9.1 pass over HTTP/WebSocket; trash survives SIGKILL; a failed write leaves the work active (trash) or intact in the trash (delete); a direct read of the datastore after deletion finds no work-scoped rows and both accounts intact; a two-account browser walkthrough covers build, publish, trash while connected, gallery/favorites, restore, trash and permanent delete. Existing suites still pass.

## 9. Verification strategy and concrete fixtures

### 9.1 Product contracts over running HTTP

Keep the provided harness mechanics intact. Where shared code unit tests are valuable, run them in addition to—not instead of—real HTTP checks. Create isolated test accounts/works with unique names. Never wipe the production DB to get clean tests.

Required HTTP cases: authentication/session lifecycle; work privacy; invite expiry/reuse/revocation; contributor versus role; mutation without editor rights; idempotency replay and payload conflict; finite/bounded transform validation; snapshot immutability; exhibit/favorite withdrawal; archive; stale epoch; server-rendered README completeness. Since 2026-10-06 also: trash, restore and permanent delete refused for editors, strangers and anonymous callers; trash with two connected members closes the room, revokes invites, rejects late commands and withdraws every exhibit; trashed works unreadable by known ID; restore keeps acknowledged sticks and permitted members, keeps exhibits withdrawn and requires a fresh stream; permanent delete refused outside the trash or with a wrong title; successful deletion keeps both accounts and unrelated work; repeated requests and a racing command are safe; an editor can list and leave a trashed collaboration without private data and isn't re-added by restore; the exhibit limit at its boundary, with withdrawn exhibits counted and concurrent publishes; republish allowed with the same ID and geometry, including over the limit from older data. A direct database test covers the trash-guard triggers (`tests/trash-guard.test.ts`). Contract specs keep sign-up attempts under two thirds of the per-IP burst by reusing accounts within a file (`shared()` in `spec/helpers.ts`), and the test client refuses to exceed that budget; production limits are unchanged. Failed-transaction and restart cases use disposable data directories (`tests/lifecycle-restart.test.ts`). Course invariants must not be edited.

### 9.2 Physics fixtures

Use actual pinned Rapier stepping and observable geometry/velocities; do not mock the engine. Keep physics fixtures deterministic in initial conditions and step counts. Do not assert an exact collapse trajectory across an engine upgrade. Suggested fixtures with L=8, width=1 and gap g=0.005:

- Vertical single pillar centered near (0,4+g,0), local X aligned +Y, on the table; stable within a documented settle window and still upright after 600 ticks without hidden constraints.
- Bridge pillars at x=-3 and +3, with vertical centers y=4+g; horizontal beam centered x=0, y=8+2g+0.5. Verify actual support and settling rather than just checking initial poses.
- Unsupported beam above the table; it must descend under gravity. A high-drop beam must collide rather than tunnel in the tested range.
- Progressive cantilever/payload shifts: construct a fixture with a known far-out combined center of mass and demonstrate loss of support. Do not assert that every tiny offset must topple.
- Cascade: a bounded push to one pillar wakes and affects supported pieces; a comparable non-contact body is not magically displaced.
- Contact counterexamples: side-by-side static bodies cannot manufacture a tall supported height; a held ghost cannot support a beam or add score.
- Snapshot: save moving bodies, restore native state plus IDs, advance the same fixed steps and compare within the pinned engine's expected determinism. Preserve velocities and sleeping flags.

### 9.3 Concurrency and crash injection

Use two actual sessions. Submit equal-position placements concurrently: at most one of the mutually penetrating initial placements succeeds; both clients later have the same body IDs and authoritative transforms. Also submit nonoverlapping placements: both succeed without a global stale-revision rejection. Revoke an editor while a request is pending; only coordinator operations ordered before revocation may succeed. Restore while another client holds a ghost; its old-epoch submission fails.

Use a separate disposable data directory/container for kill tests. Add narrowly scoped, test-only failure hooks around transaction boundaries, unavailable in production. Kill before commit, after commit before reply and after reply; restart the real app against the same volume. Verify receipt/state agreement, no duplicates and no lost accepted bodies. Separately test graceful SIGTERM and replacement Docker image with the same mount. Test a simulated failed DB write: no success indication and no uncommitted body continuing to move.

### 9.4 Browser and human checks

Playwright must interact through controls rather than bypass the product by inserting DB rows for every test. Fixtures may seed complex scenes through test-only setup when that is not the behavior under test. Use separate browser contexts for different users. Capture representative desktop/mobile scenes and failure states; inspect them rather than merely saving screenshots.

Run at least one complete keyboard-only placement, including selecting a part of an existing structure to focus. Test endpoint drag at multiple camera angles, near-parallel views and near-vertical stick orientation. Resize during a held draft. Test tabs/session takeover, background return, delayed outcome, disconnect/reconnect and withdrawn exhibit access. Test reduced motion and mute. Include an empty gallery and a full crowded tower.

For a human session, ask a new person to make a bridge without spoken guidance, then have a partner extend it. Observe mistaken gestures, whether ghosts convey intention, surprises in collapse and whether they trust the saved result. Record what happened, not invented quotations. If no human is available, list these as unverified and provide the exact short protocol to the student.

## 10. Deployment and operational handoff

The Docker image builds client/server/worker code and includes the exact WASM/native dependencies. Serve static assets and API from the same production origin; bind the configured address/port. Do not run a Vite dev server as the production application. Migrations run before readiness and must preserve existing DB files.

Use the real Fly volume path from `fly.toml`; never silently fall back to `/tmp` in production. A missing/unwritable persistent mount is a startup/readiness error. Do not scale to multiple independent authorities. Keep application credentials out of images, git, logs and screenshots.

On SIGTERM: mark unready, stop accepting new mutations, notify clients, complete in-flight transactions, snapshot current worlds, checkpoint SQLite as appropriate, close worker/DB and exit within the actual platform grace period. Test forced termination too; graceful shutdown is not the only durability mechanism.

Use SQLite's backup API/consistent backup method for backups, not a naive copy of only the database file while WAL is active. Before schema/native snapshot migrations create a recoverable backup outside the modified file and verify a restore on a disposable copy. Retention must respect available disk; a backup on the same volume is not protection against losing that volume.

Prepare a runbook: local startup, tests, build, volume path, backup/restore, actual deploy command, log tail, known capacity, how to recover a suspended room, and how to reproduce reported errors. If secrets or external permissions are missing, name the exact blocked step without revealing credentials. Never report an unexecuted deployment as done.

## 11. Evidence and completion report format

Maintain one coverage table keyed by every bold rule ID in `brief.md`:

`rule | implementation location | verification scenario | evidence | status | remaining limitation`

Valid statuses: `not started`, `in progress`, `implemented / unverified`, `verified automatically`, `verified in browser`, `human reviewed`, `blocked`. Do not turn an opinion into an automated assertion. Additional screenshots or tests are justified by an uncovered risk, not by increasing the file count.

At the end of each stage report: what became usable; which gate passed/failed; evidence; next action. Final handoff lists live URL if verified, actual commands run, data persistence proof, key remaining limitations and student-only writing/review tasks. Do not create a wall of duplicate documentation; link ADRs and evidence from the concise status file.

## 12. Source grounding and limits

Official sources checked while writing on 2026-10-05; re-check the installed-version docs during P0. The architecture, numeric defaults, account flows and product behavior above are this project's design choices, not claims that these sources prescribe them.

- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html): orbit target, camera controls and bounds. Custom draft picking and gesture ownership still need implementation.
- [Rapier serialization](https://rapier.rs/docs/user_guides/javascript/serialization/): native `World` snapshot/restore exists. App metadata and durable transactions remain our responsibility.
- [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/): matching version, initialization, ordering and timestep matter. This design does not require clients to replay physics.
- [Rapier sleeping](https://rapier.rs/docs/user_guides/javascript/rigid_body_sleeping/): sleep is reversible and explicit changes may require wake-up.
- [Rapier CCD](https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/): continuous collision detection has costs and limits; test thin bodies and impacts.
- [SQLite WAL](https://sqlite.org/wal.html): single-host WAL and durability trade-offs. Use FULL synchronization for this design's acknowledged-write promise.
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [Fastify](https://fastify.dev/docs/latest/Reference/Server/), [ws](https://github.com/websockets/ws), [Vite](https://vite.dev/guide/): verify current compatible installation and deployment APIs.
- [Node crypto](https://nodejs.org/api/crypto.html) and [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): use the pinned Node version's async scrypt interface; the chosen 64 MiB configuration is an OWASP-listed scrypt trade-off. It still needs target-machine measurement and bounded concurrency.
- Course primary sources are linked in `brief.md`; those rules and the actual shipped harness govern assessment compliance. Technical references here are not substitutes for the student's readings about what makes this small collaborative experience worthwhile.

Begin with P0. Keep working through gates. Preserve the user's design, provide evidence, and make failures visible enough to correct.