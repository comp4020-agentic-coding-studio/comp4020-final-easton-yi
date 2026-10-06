# Building Together: Product Brief

Version: 1.3 · 2026-10-06 (Australia/Sydney); see DOC-05 for what changed from 1.1 and 1.2  
Purpose: product rules and acceptance criteria for the COMP4020 final project; use with `INITIAL_PROMP.md` in the same directory.  
Status: an implementation-ready design baseline, not an implemented or tested application and not evidence of any grade. The working name is **Stillwood**. Naming may change without changing the core experience.

## 0. How to use this specification

**DOC-01 — Responsibilities.** This file defines what to build, why, behavioral boundaries and acceptance criteria. `INITIAL_PROMP.md` defines the technical mapping, implementation order and verification methods. Official course pages and repository-supplied contracts remain authoritative for assessment requirements; this document cannot replace or weaken them.

**DOC-02 — Requirement levels.** Numbered rules are acceptance requirements. “Initial parameters” are concrete starting values, not supposedly measured optima. The implementation agent may tune them through documented experiments; it must not independently remove core capabilities, change permission semantics or weaken durability promises. Incompatible requirements require a precise issue, evidence and proposed alternatives.

**DOC-03 — Decision provenance.** The user's core concept comprises realistic wood, independent orbiting observation, precise whole-stick and endpoint adjustment, gravity and collisions after release, visible partner-held ghosts, simultaneous building, accounts and author permissions, saved work that can be continued, deliberate collapse, exhibitions and favorites. Membership rules, storage mechanisms, interaction constraints and capacities added here are design decisions developed for this specification; they are not presented as verbatim user instructions.

**DOC-04 — Scope.** All mandatory rules in this document define the first complete version. Development stages are not a reason to permanently remove features. A Crit 8 vertical slice may ship first, followed by the remaining stages. An intermediate build must not be presented as satisfying the entire specification.

**DOC-05 — Change record.** Rules change only through a recorded, dated decision; earlier text is corrected in place rather than left contradicting the new rule.

- **2026-10-06, user-directed: owner-controlled work deletion** (`docs/OWNER_WORK_DELETION_PROMPT.md`). Version 1.1 excluded permanent work deletion (SAVE-08) and the directive said “Do not permanently delete works”. The user reversed that for **whole works only**: the owner may move a work to the trash, restore it, and delete it permanently (SAVE-10..SAVE-12, AT-17..AT-19). Corrected in place: GOOD-02's trade-offs, NAV-01, NAV-04, WORLD-04, PLACE-10, PHYS-06, AUTH-02, AUTH-03, AUTH-05, SAVE-06, SAVE-07, SAVE-08 and OPS-03. Unchanged and still excluded: deleting individual placed sticks, per-person undo of shared contributions, changing other people's accounts, majority or all-member approval, and automatic time-based purging. Deletion was not part of the original plan; it was added after the P0–P6 implementation.
- **2026-10-06, user-directed follow-up before shipping.** (a) WORLD-04's “30 exhibits per work” is a persistent-resource limit, so it counts every retained exhibit, public or withdrawn; the implementation had counted only public ones, so withdraw-and-publish cycles grew storage without bound. The limit applies to creating exhibits; republishing an existing exhibit reuses its slot and is always allowed. Corrected in WORLD-04 and SAVE-06. (b) SAVE-11 and AUTH-05 now say where an editor leaves a trashed collaboration. Acceptance: AT-18 extended, AT-20 added.
- **2026-10-06, user-directed: selectable graphics quality** (`docs/GRAPHICS_QUALITY_PROMPT.md`, version 1.3). Version 1.2 only had OPS-02's degradation order, implemented as a one-way client downgrade (a leaky counter of frame intervals above 34 ms that, past 90, turned shadows off and later set pixel ratio 1, and never recovered). It is replaced by a player-visible **Graphics quality** setting with a bounded, reversible Auto mode (LOOK-04) and an idle/hidden rendering rule (OPS-05). Corrected in place: OPS-02. Acceptance: AT-21, AT-22 added. The High tier is the version 1.2 renderer unchanged. *Same-day revision after review:* the first Auto rule needed 15 s of one uninterrupted animated run to recover, which ordinary building (short orbits, button presses, drags and placements) never provides; simulated, ten minutes of it at a steady 60 Hz never left Low. Windows of measured time may now span interactions, bounded by a 10 s staleness gap, and repeated failed upgrades back off and then stop (LOOK-04, measurement M-008).

## 1. Product position and the meaning of good

**GOOD-01 — In one sentence.** A few friends use one kind of wooden stick on a quiet tabletop to build something fragile, worth continuing and worth keeping.

The target setting is 2–4 people creating together on their own devices; the complete experience also works alone. Building higher is a natural challenge, but bridges, pavilions, leaning towers and low sculptures are equally valid. There is no opponent whom users must defeat.

**GOOD-02 — Four promises.**

1. **Considerate placement:** users can express where a stick should go without continually fighting tiny hand movements to keep it stable.
2. **Legible collaboration:** people can see another person's intention and distinguish it from something that has actually happened.
3. **Credible consequences:** imbalance and collisions may surprise, but hidden arbitrary rules do not decide failure.
4. **Work that lasts:** acknowledged contributions are saved reliably, valued stages can be retained, and collapse cannot silently rewrite an exhibit.

**GOOD-03 — Evaluation.** Permissions, persistence, fixed length, synchronization and version isolation can be checked automatically. Placement feel, material quality and coordination without words require human observation. Ask at least two people uninvolved in implementation to try an initial bridge and shared building; record difficulties and changes. This participant count is neither a statistical-validity claim nor a course requirement.

**GOOD-04 — Exclusions.** The first version does not include global leaderboards, currency, a skin shop, chat, social feeds, a complex material library, arbitrary model imports, certified engineering simulation, worldwide regional servers or unlimited room sizes. These cannot substitute for the core experience. One fixed primitive does not restrict the kinds of structures people can make.

**Position on trade-offs:** placement assistance reduces manipulation effort while retaining structural judgment. Simultaneous building retains shared consequences at the cost of isolated per-person undo. Immutable exhibits make continued experimentation safer, at the cost of clearly distinguishing the working structure from its exhibited version. Height provides a challenge without ranking the value of every creation. One owner with final authority over a work's lifecycle, including permanent deletion, keeps decisions simple and avoids votes, at the cost of collaborators being unable to keep a shared work the owner deletes; the invitation states this before anyone joins (AUTH-03). Test these choices through actual use rather than treating them as promotional claims.

## 2. Pages and first use

**NAV-01 — Pages.** `/` is the public exhibition and starting point; `/works/` lists works created or joined; `/works/:id/` is the private workshop; `/exhibits/:id/` is the public frozen exhibit; `/favorites/` contains the user's favorites; `/readme/` serves the complete README. The owner's Trash is a view of the work list (`/works/?view=trash`), not a separate administrative screen (SAVE-11). Account, invitation, missing-page and access-denied flows must be usable.

**NAV-02 — Newcomers.** Viewing public exhibits does not require login. Creating, joining as an editor and favoriting require an account. Explain “Create an account to save and come back”; do not pretend work has been saved and only then require registration. Successful registration returns to the original creation or invitation task. Creating a work requires only a name, with an editable default allowed.

**NAV-03 — Introduction.** First use offers a short, skippable introduction: orbit the view → add a stick → adjust height/direction → place → inspect save status. These actions occur in the real work, not a disposable fake scene replacing persistence. Help can be reopened.

**NAV-04 — Examples and empty states.** Examples use the same geometry, rules and rendering path and are labeled as examples. Never fabricate online players or community activity. Empty exhibits, works, favorites and trash offer a next step or a plain statement; Trash stays reachable when the owner has no active works. Loading failures offer retry rather than an endless spinner.

## 3. World, material and bounds

**WORLD-01 — Coordinates.** Use right-handed coordinates, Y up, tabletop at y=0. The unit u is the stick width and is not claimed to represent physical meters. The stick's local long axis is X, its center is the origin and its endpoints are ±L/2. Initial dimensions are L=8u with a 1u×1u cross-section. All sticks have equal dimensions, mass and friction properties.

**WORLD-02 — Table.** The circular table initially has radius 18u, thickness 2u and top y=0. Its cylindrical collider matches the visible table. Initial creation bounds require every stick corner to lie within y∈[0,80u] and XZ radius≤22u. Edge overhang and unsupported release are allowed. Creation inside the tabletop or another solid stick is not allowed.

**WORLD-03 — Cleanup.** When a stick's entire bounding volume lies below y=-20u or wholly outside the radius-60u retention region, the server removes it and saves the result. The current stick count decreases; historic contribution records remain. Creation bounds and post-motion cleanup bounds are different.

**WORLD-04 — Capacity.** Initial targets are 200 retained sticks per work, four simultaneous editor seats per room and three active rooms. Existing members beyond the editor-seat limit may observe the room. If no active-room slot is available, show the last saved state and clearly state that live building has not started. Do not simulate a false live status. Public exhibits do not activate physics rooms. Measure capacity on the target Fly machine; changes require recorded evidence and matching UI, configuration and test updates. Never reduce collaboration below two simultaneous editors.

Initial persistent-resource limits are 20 owned works and 100 favorites per account, and 30 exhibits per work; version limits are defined in SAVE-08. The exhibit limit counts every retained exhibit of the work, public or withdrawn, because a withdrawn exhibit keeps its frozen geometry. Withdrawing doesn't free a slot. Creating an exhibit at the limit is refused. Republishing a withdrawn exhibit reuses its own slot, ID and frozen geometry, so it is allowed even where older data already exceeds the limit. Archived works and works in the trash still count toward the owned-works limit and keep their storage; only permanent deletion (SAVE-12) frees a slot, so the trash cannot be used to bypass limits. At a limit, retain entered input and explain the issue rather than deleting old work. When server storage is insufficient, clearly stop new writes while retaining access to existing readable content. Do not promise unlimited storage.

**WORLD-05 — Shape.** Sticks do not stretch, bend or break. Small bevels are visual and must not create an obvious mismatch between visible contact and collider geometry. Texture may vary; physical properties must not secretly vary.

## 4. Camera

**CAM-01 — Independence.** Each person controls their own camera. Another person's movement, placement or arrival, and network state updates, cannot move it. Camera state is a local preference, not shared work state.

**CAM-02 — Orbit.** Background dragging controls horizontal orbit and elevation; zoom gestures/buttons change distance. The default target is the table center. Provide target-height adjustment and focus on a selected stick, allowing orbit around local detail. “Fit all” restores framing of the entire work.

**CAM-03 — Bounds.** The camera cannot flip beneath the table. Near a vertical overhead view, preserve a stable direction without sudden pole rotation. Zoom has bounds and near-object protection so users cannot accidentally enter a stick and lose orientation. Explicit controls provide top, side and default views, zoom and target height.

**CAM-04 — Continuity.** Window resize and phone rotation retain focus and the held draft rather than resetting the view. View transitions respect reduced-motion preferences.

## 5. Holding, precise placement and input

**PLACE-01 — One per person.** The right-side “+” creates one held ghost. It initially lies horizontally near the current focus, slightly above a selected support surface, or relative to the table when none is selected. Find a legal initial space without overwriting the structure. If none is found, retain an adjustable ghost and explain the intersection.

**PLACE-02 — Center movement.** Dragging the middle translates the whole stick on the XZ work plane at its current center height, preserving rotation. Lock the plane and grab offset at drag start so the stick does not jump to the pointer center. A separate height handle changes the whole stick's Y position.

**PLACE-03 — Endpoints.** Both ends have accessible picking handles. Moving one end keeps the opposite endpoint and total length fixed. Default endpoint dragging changes horizontal orientation; an adjacent elevation handle changes pitch. Recompute the center from the fixed pivot and new direction. Near vertical, retain the last valid azimuth and provide direction controls without singularity-induced jumps.

**PLACE-04 — Presets and fine control.** “Horizontal” and “Vertical” preserve the center in center mode and the fixed pivot in endpoint mode. Focusable controls provide orientation, pitch, long-axis roll and height; default roll is zero. Continuous dragging does not force a grid. Fine adjustment uses separately configured increments; a fine-adjustment key reduces the step, and mobile provides a corresponding toggle.

**PLACE-05 — Gesture ownership.** Handles take priority over sticks, and sticks over background. A drag captures the pointer and suspends camera rotation; release, cancellation and blur restore control reliably. Trackpad scrolling over the canvas zooms rather than scrolling the entire page; forms and scrollable panels still scroll normally. Core interaction cannot depend on right-click.

**PLACE-06 — Near-parallel views.** When the screen ray is nearly parallel to the work plane, tiny gestures must not create huge world movement. Use bounded screen-projection increments with a suggestion to switch to top view, or explicit step controls. Fallback preserves the original grab point without sudden jumps.

**PLACE-07 — Assistance.** Gentle horizontal/vertical angle snapping, edge/center guides and an explicit downward “Snap to support” action assist placement. Contact snapping moves only downward along Y, has a maximum distance, cannot pass through the first collision and cannot move real sticks. Users can disable snapping. Assistance changes only the pre-submission pose; it does not guarantee eventual stability.

**PLACE-08 — Validity.** Intersection, non-finite coordinates, out-of-bounds placement and insufficient capacity block submission with an explanation. Being unsupported does not block it. Distinguish at least “Ready to place,” “Unsupported; will fall,” “Intersecting; adjust position” and “Waiting for server.” Use text/icons as well as color. Contact-coverage hints cannot claim that half-width overlap guarantees stability.

**PLACE-09 — Release.** “Place” submits the current pose with zero initial linear/angular velocity; dragging speed is not a throw. Retain a pending ghost and prevent repeated clicks until confirmation. Only server-confirmed sticks enter physics as real objects. Rejection preserves the draft. Cancel applies only to an unsubmitted ghost; an unknown submitted result must be queried rather than pretending to undo it.

**PLACE-10 — Placed objects.** Users may select, focus and inspect authorship, but cannot directly drag/delete placed sticks in the first version. Owner deletion of a whole work (SAVE-10..SAVE-12) does not change this. Ordinary mistakes are handled through further building or restoring a version. Do not offer global undo that silently removes a partner's work. Targeted pushing is a separate explicit operation.

## 6. Understandable physics

**PHYS-01 — One authority.** Each active work has one server physics world. Browsers render its results and local ghosts; they do not independently decide collapse or scores.

**PHYS-02 — Easy upright placement.** A precisely vertical, isolated stick on a sufficiently contacting flat surface, without off-center loading or impact, should be easy to stand and should not continually jitter. First use geometric alignment, friction, solver settings and normal sleeping. Do not permanently lock rotation, convert it to a fixed body, add invisible glue or force it upright every frame. If additional assistance is necessary, first record failure evidence and gameplay effects and propose a rule change; do not add it secretly.

**PHYS-03 — Consequences.** A bridge with sufficient contact can settle. Overhang and accumulated off-center loading can topple a structure. Falling sticks collide with others, and changes to support reawaken what rests above. All sticks retain dynamic-body properties. A side scrape does not necessarily carry load.

**PHYS-04 — Sleeping.** Slow bodies may sleep under engine rules but must wake on contact impact, applied force or loss of support. An unsupported object at height cannot freeze merely because its instantaneous speed is low. Never leave invalid structures permanently floating for visual stability.

**PHYS-05 — Motion quality.** Low restitution and moderate friction/damping convey wood. Do not suppress all motion into a slow, glue-like response. Check thin sticks and fast falling bodies for tunneling. CCD is a safeguard, not an exemption from verification. Animation cannot change the final physical position.

**PHYS-06 — Prototype gate.** Verify an isolated pillar, two pillars and a beam, progressive off-center loading, collision cascades, falling after removal of a test support, and continued motion after restoring the same save. Test tools may remove supports without adding a product stick-deletion feature.

## 7. Shared intentions, submission and connections

**SYNC-01 — Ghosts.** Partners see a translucent stick, thin personal-color outline and nickname; real sticks remain wood-colored. Ghosts have no collision, support, score or persistence. Send throttled poses during dragging and a final pose when it stops. Distinguish people with names/shapes as well as color.

**SYNC-02 — Simultaneous building.** No turn-taking and no global table lock during ordinary building. All editors can prepare and submit simultaneously; the server orders durable changes. Another person's ghost does not reserve space. When real placements conflict, reject the later invalid placement and retain its draft. Nonintersecting placements enter physics normally.

**SYNC-03 — Current state.** Revalidate against the current world at submission. Do not reject every general version change, which would make collaborators block each other. Reject a clearly stale view, an old request after restore, expired editing authority or solid intersection. Do not silently move a submitted stick elsewhere. Support may change after release; that is a consequence of a shared world.

**SYNC-04 — Timeliness.** Under normal network conditions and declared load, durable changes should appear in other sessions within about one second, as required by the course. Continuous ghosts and timely placement confirmation are design targets; measurements are specified in `INITIAL_PROMP.md`. Reloading does not count as synchronization.

**SYNC-05 — Disconnection.** A disconnected user may inspect the scene and adjust a local draft, but submission is disabled with a clear explanation. Reconnect obtains complete authoritative state and revalidates the draft. Do not automatically release sticks prepared offline. Query an unknown submitted outcome using its original ID rather than resending with a new one.

**SYNC-06 — Presence.** Initially, an account has one active editing window per work. Another window may observe and explicitly take over. Takeover removes the old window's submission authority but not its camera controls. Departure/timeouts clear remote ghosts; regular heartbeat keeps a stationary held ghost present rather than removing it after a few idle seconds.

**SYNC-07 — Session changes.** Logout, member removal and session expiry immediately stop modification authority and explain why. Do not continue pushing private-room data. After a backgrounded browser returns, confirm fresh state before allowing placement.

## 8. Accounts, membership and permissions

**AUTH-01 — Accounts.** The first version uses a unique handle, display name and password, without requiring email or third-party login. Provide a one-use account recovery code users can retain and rotate after recovery. Do not promise recovery without either password or code. Public identity consists of nicknames and contribution attribution, never login credentials.

**AUTH-02 — Roles.** The creator is the owner; a person accepting an editing invitation is an editor; a public exhibit viewer is a visitor. Editors can build, name saved versions and read work history. Owners additionally manage members, invitations, work title, publication/withdrawal, restore, push and archive, and have final authority over the work's lifecycle: they alone move it to the trash, restore it from the trash and delete it permanently (SAVE-10..SAVE-12). Editors cannot do any of those; they can leave. There is no majority vote or all-member approval for any lifecycle action. Every server mutation rechecks authority; hidden frontend buttons are not a security boundary.

**AUTH-03 — Invitations.** Only owners create editing invitations. Links expire, are revocable, last seven days by default and allow at most three distinct accounts to accept. Acceptance requires login and explicit confirmation. Before confirming, the invitation states who owns the work and that the owner decides publication and can archive, trash and permanently delete it for everyone; existing members see the same explanation in the work's information. Repeated acceptance does not duplicate membership or consume another use. Editing invitations are distinct from public viewing links; preview does not grant authority. A nickname cannot be used to impersonate an author.

Keep one active invitation per work. Creating a replacement revokes the old link, explained in advance beside the control. Revoking a link does not remove members who already joined; member removal is a separate action.

**AUTH-04 — Attribution.** Record who placed each stick. An exhibit records contributors to sticks in that snapshot. Membership is not proof of contribution. Removing an editor neither erases historic attribution nor lets them continue editing. Ownership transfer is outside the first version.

**AUTH-05 — Privacy.** Current works and saved versions are readable only by members. Public exhibits expose only selected frozen geometry, title, attribution and display information—not private membership lists, invitations, account data or internal physics snapshots. Editors may leave a collaboration and revoke their own membership, including while the work is in the trash, from their own work list; owners close a work through archiving or the trash. While a work is in the trash, its scene, versions, members and exhibits list are readable by nobody through the API: editors get an explanation that the owner moved it to the trash, strangers get the same answer as for any private work, and the owner must restore it first.

## 9. Persistence, versions, exhibition and favorites

**SAVE-01 — Three objects.** The current work changes and autosaves; saved versions are immutable and restorable; public exhibits reference immutable saved versions. A favorite references an exhibit ID, not the changing current world.

**SAVE-02 — Meaning of confirmation.** Successful placement means “this placement was durably committed on the server,” not “this object will never fall.” Before acknowledging, atomically save the complete post-change physics state, stick metadata and command result. A persistence failure cannot produce success or allow the uncommitted mutation to continue simulating.

**SAVE-03 — Saving motion.** Checkpoint during motion and save immediately on settling. Distinguish “Placement saved; structure moving” from “Structure saved.” After an unexpected exit during motion, continue from the latest reliable physics frame; the final part of motion may briefly replay. Acknowledged placements cannot disappear or duplicate. Normal shutdown/redeployment should save the latest frame first.

**SAVE-04 — Manual versions.** Creating a named version, a new exhibit version from the current scene, or a pre-push snapshot requires a stable scene. Publishing an already stable saved version does not depend on whether the current work is moving. If saving is requested during motion, explain and offer cancel or “Save when settled.” Waiting tasks belong to the current world epoch and are canceled by restore, logout or permission revocation. Do not treat a moving pose as a permanently standing exhibit.

**SAVE-05 — Restore.** Before restoring, the owner confirms the action with visibility of affected present members, and the server first saves current state as a recovery point. This protection snapshot may contain motion, is for recovery only and cannot be published. If saving fails, do not restore. Restore increments world epoch, makes old drafts require review and invalidates old submissions. All clients receive full new state. Membership, favorites and existing exhibits do not roll back with physics.

**SAVE-06 — Exhibits.** The owner selects a stable version, sets a title, optional short description and framing, then publishes. Exhibits allow independent orbiting but no physics or editing. Continuing the work does not change older exhibits; publishing a new version creates a new exhibit ID. The owner may republish a withdrawn exhibit under the same ID and unchanged snapshot; it uses no additional exhibit slot (WORLD-04). A new title or text never rewrites its frozen geometry. Exhibits withdrawn by moving the work to the trash stay withdrawn after restoring it until the owner republishes each one. Descriptions accept text, not arbitrary HTML.

**SAVE-07 — Gallery and favorites.** The gallery defaults to newest publication and offers name search, without popularity ranking. Favorites are private lists and do not change exhibit permissions. Withdrawal immediately stops public access, including the thumbnail; favorites show “Withdrawn” and allow removal without exposing private content. After permanent deletion (SAVE-12) a favorite remains only as an exhibit ID shown as “No longer available”, which the user can remove; no title, geometry or attribution is kept for it. Content already downloaded by a visitor cannot be promised to be recalled.

**SAVE-08 — Lifecycle.** Owners may archive a work, ending live editing and hiding it from the default list; unarchiving permits continuation. Archive, withdrawal, trash and permanent deletion are distinct operations: archive is reversible and leaves exhibits public; withdrawal stops one exhibit; moving to the trash (SAVE-10) withdraws every exhibit and closes the work for all members; permanent deletion (SAVE-12) is available only from the trash. Initially allow 30 named versions and retain the latest 10 ordinary automatic recovery points. Versions referenced by exhibits or active push recovery must not be automatically pruned. At a limit, let users select unreferenced manual versions to remove rather than silently deleting treasured work.

Archiving does not automatically withdraw published exhibits. Explain the distinction before archiving and provide a separate withdrawal action. Editors cannot use favorites or known version IDs to access private snapshots after losing permission.

**SAVE-09 — Nobody present.** After the last member leaves, simulate until settled and save. If the scene has not settled within ten seconds, snapshot velocities and suspend; clearly resume motion on return. Do not change gravity or force moving sticks upright. Suspended works do not consume continuous physics computation.

**SAVE-10 — Move to trash.** The owner can move an active or archived work to the trash; the action is labelled “Move to trash”, never as deletion. The confirmation states the actual number of collaborators and public exhibits affected (never invented presence), that every collaborator loses access to the workshop, that live building stops, that every public exhibit of the work is withdrawn, and that the building content stays recoverable until the owner deletes it permanently. Collaborators do not have to approve. The server authorizes the owner itself and performs one coherent transition serialized with room commands: save the latest live state (moving or not; no stable pose is needed) together with the trashed state, withdraw all exhibits and revoke editing invitations in the same transaction; then cancel waiting saves, end leases and drafts, close the room and tell every connected window why. A delayed command, checkpoint, version or exhibit can neither revive nor change a trashed work. If saving fails, report the failure and leave the work active and unchanged. Protection snapshots that contain motion still cannot be published.

**SAVE-11 — Trash and restoration.** Trash is a view of the owner's own work list that lists only their trashed works and works even when they have no active ones. Trashed works are hidden from everyone's normal list. Connected editors are told the owner moved the work to the trash and are offered a way back to their works; they never see a silently dead or falsely live workshop. An editor's own work list shows each trashed collaboration as its title and a status only, with “Leave this collaboration”; it never opens the owner's Trash, the scene, versions or the member list. “Restore work” is owner-only, keeps the work ID, geometry, saved versions and current membership, and returns the work to its previous active or archived state. It does not re-add editors who were removed or left, restore revoked invitations, reopen a room, reuse old leases, drafts or requests, or republish exhibits; the next join loads fresh authoritative state. There is no automatic purge: a trashed work stays until its owner restores it or deletes it permanently, and it counts toward the owner's limits (WORLD-04).

**SAVE-12 — Permanent deletion.** “Delete permanently” is available only for a work in the trash, only to its owner, behind a separate confirmation that requires typing the work's current title exactly. The confirmation states that the work's building state, saved versions and exhibits are removed, that this affects every collaborator, and that it cannot be restored from the trash. The server rechecks ownership, title and trashed state; knowing the work ID or passing a client-side check is not enough. Deletion is one transaction over the work's state, recovery state, versions, exhibits, memberships, invitations and their acceptances, and its command receipts. Contributor accounts, their other works, unrelated memberships and other favorites are never touched; favorites of its exhibits follow SAVE-07. Public exhibit, thumbnail and private endpoints for the work stop answering with content. A repeated request by the owner succeeds without effect; nobody else learns anything; nothing can recreate the work. Content someone already downloaded cannot be recalled, and this removes active application data only, not independent backups or platform logs.

## 10. Deliberate pushing and height

**PUSH-01 — Entry.** The owner enters push mode from a stable scene. The server checks conditions and creates a protection version before blocking new placement. Other members see a clear notice. Any save failure prevents the destructive action. Finish submissions already being processed before entering; do not interrupt a half-committed mutation.

**PUSH-02 — Action.** The owner selects a real stick, contact point and horizontal direction, displayed as an arrow. Confirmation applies one fixed, bounded server impulse—not arbitrary mouse speed. Users choose where and which way to push, not unlimited force. The contact point must lie near the selected stick's surface. Others may continue observing.

**PUSH-03 — Completion.** After motion, the owner chooses keep or restore. If the owner disconnects, clear the operation lock after ten seconds while retaining the scene and recovery point so members can continue. Do not automatically restore after other people have made new changes. Restart also clears transient locks while retaining recovery points. Push-generated height does not update the historic building record.

**HEIGHT-01 — Definition.** Show “Stable structure height” in stick-width units u. Count the highest point of stationary structure connected to the table through upward supporting contacts. Exclude ghosts, flying objects and fragments below the table. The contact criterion is a game height estimate, not an engineering load analysis.

**HEIGHT-02 — Updates.** Confirm new height only after qualifying structure remains stable for 1.5 seconds. During motion, show “Measuring” and the previous stable value rather than misrepresenting it as current. Historic best comes from ordinary building; restoring a version does not erase it. Height is not the sole measure of a work's value.

## 11. Visuals, sound and accessible interaction

**LOOK-01 — Material.** Use longitudinal wood grain, subtle bevels, warm restrained variation, soft contact shadows and a neutral background. End grain has a distinct orientation; do not stretch one texture over every face. Materials and lighting must not obscure joints. Preserve actual geometry and scale; images cannot substitute for an interactive 3D work.

**LOOK-02 — Interface.** The table is primary. Keep add and place/cancel on the right, with compact adjustment controls below or beside the scene. Members, save status and height are visible but restrained. No full-screen dashboard, floating implementation data or development debug lines. Icons have textual explanations/accessible names.

**LOOK-04 — Graphics quality.** A compact **Graphics quality** control in the view controls of every 3D view (workshop and exhibit) offers **Auto (recommended), High, Medium, Low**, with the help text “Auto balances detail and smoothness. This setting only affects this device.” The *selected mode* is separate from the *effective tier*. Manual modes always use their tier. Auto starts at High in every fresh 3D view, shows “Currently: …” (the tier actually applied) in the control, and never announces its changes. Only the selected mode is stored, browser-locally under a versioned key; it is never part of an account, work, exhibit or server configuration. A missing, invalid or blocked stored value means Auto and never stops rendering. Presets (pixel-ratio caps are ceilings, never supersampling):

| Tier | Pixel ratio | Real-time shadows | Everything else |
| --- | --- | --- | --- |
| High | min(devicePixelRatio, 2; 1.5 on a coarse pointer) | the existing shadow map (2048², same type, bias, radius and light frustum) | the version 1.2 renderer exactly |
| Medium | min(devicePixelRatio, 1.5) | same shadows at 1024² | same materials, lights, geometry, color pipeline and cues |
| Low | min(devicePixelRatio, 1) | off | same wood, geometry, lights, color pipeline, outlines and placement cues |

Every tier keeps antialiasing and the same WebGL context; a tier change never removes sticks, simplifies wood, adds post-processing or touches physics. Changing tier keeps the camera, selection, held stick, partners' ghosts, input ownership, room connection and work: it never navigates, reloads, rejoins, sends a mutation or saves a version. Auto's values (tunable with recorded evidence, not device-capacity claims; revised once, see DOC-05): only the interval between two frames of one continuous animated run is measured (camera motion and damping, drags, moving sticks, easing ghosts); idle time, hidden time and the first frame after either are never measured. Measured time forms non-overlapping 2 s windows, which may span separate short interactions; a pause of more than 10 s between measured frames, a hidden tab or a tier change discards all evidence, and 2 s of measured time is ignored after entering Auto, returning to the tab or changing tier. Two consecutive windows in which ≥70% of intervals exceed 34 ms drop one tier. Consecutive windows whose p90 is ≤20 ms, adding up to 15 s, raise one tier, at least 30 s after the last upgrade; any other window resets that count. Decisions are taken only on a measured frame, and upgrades wait during a drag, camera gesture or moving structure. When a downgrade reverses an upgrade, upgrades pause for 60 s, doubling each time, and after three reversed upgrades the view stops upgrading automatically. One decision moves one tier, within Low..High. Recovery is still conservative: a display or browser capped near 30 Hz never qualifies, and use with pauses longer than 10 s between animations gathers no evidence; the player can always choose a tier.

**LOOK-03 — Feedback.** Sounds vary with collision strength and have a simultaneous-playback limit. No looping background music by default. Initialize audio only after the first user gesture. Provide mute and disable decorative camera transitions under reduced motion. Another person's placement must not force camera shake.

**ACCESS-01 — Keyboard.** Starting does not require clicking the canvas. DOM controls can create/select a draft, move X/Z, adjust height, yaw/pitch/roll, place and cancel. Users can change views and select existing sticks to focus. Provide a searchable/paginated stick list instead of 200 mandatory Tab stops. Game shortcuts must not fire inside text inputs.

**ACCESS-02 — Touch.** Mobile explicitly separates Observe and Adjust modes. Observe rotates the camera; Adjust drags the selected ghost. Pinch zoom, buttons and fine-adjustment controls are available. Main targets are at least 44 CSS px. Handle picking regions may exceed visible handles but cannot cover the entire stick and prevent center selection.

**ACCESS-03 — Interface resilience.** Verify the two viewports actually specified by the course, plus 390×844 and 1920×1080. Focus is visible, dialogs restore focus correctly, errors are readable and color is not the only state indicator. If WebGL is unavailable, show an explanation and readable work information rather than a blank page or a false claim that building is available. Read-only fallback does not count as passing the 3D core.

## 12. Failures, load and observability

**OPS-01 — Honest failure states.** Connection, permissions, persistence and resource shortage have distinct states and recovery paths. DB errors pause affected mutations; a broken empty world must not overwrite the latest reliable state. NaN or unbounded physics errors stop the room and retain evidence; recovery from a reliable snapshot is announced.

**OPS-02 — Degradation order.** On a client, first reduce shadows, pixel ratio and decorative effects, through the LOOK-04 tiers (reversible, and never below Low's wood, geometry and placement cues), then ghost/motion-frame frequency. Never switch to independently authoritative clients or remove real collisions. Insufficient capacity rejects new rooms/objects while protecting ongoing work. Client rendering load is the player's device, not the server machine's memory or CPU.

**OPS-05 — Idle and hidden rendering.** A 3D view draws only while something visible changes: camera gestures, damping and transitions; the local held stick and its feedback; partners' ghosts until they have eased into place; authoritative motion until its interpolation has finished (not until a server “settled” flag); full state replacement; resize, DPR, quality and context-restore changes. Simultaneous changes coalesce into one frame; an incoming transform wakes a view whose viewer isn't touching anything. While the document is hidden the view draws nothing and takes no performance samples; on return it discards stale timing, draws current state, and the existing visibility resync (SYNC-07) runs unchanged. None of this affects the server: physics, persistence, heartbeats and the room connection continue regardless of a client's rendering.

**OPS-03 — Behavior logs.** Record semantic starts/results: joining/leaving, draft start/end, adjustment-gesture end, camera-gesture end, placement accepted/rejected, versions, publishing, favorites, invitations, pushing, restore, reconnect, and moving to the trash, restoring from it and permanent deletion (by ID and counts only). Each line has time, actor, work, action, outcome and correlation IDs. Do not log every high-frequency pointer update or physics frame as a user action. Browser assertions cannot establish server permission or successful mutation. Logs exclude passwords, cookies, recovery codes, raw invitations and private work content.

**OPS-04 — Instrument-only demonstration.** A live log tail is sufficient; a management dashboard is unnecessary. Structured logs should reveal who is building, whose placement failed, who saved/pushed, and why a room paused. Distinguish events from different rooms. Logs alone do not establish that collaboration is enjoyable; separate them from observation evidence.

## 13. Completion and acceptance

The following scenarios require implementation evidence. A=automated checks, B=browser interaction, H=human judgment. Agent self-assessment of screenshots cannot wholly replace H.

| Scenario | Required outcome | Method |
| --- | --- | --- |
| AT-01 New user creates and places | Work remains after save, refresh, logout and login | A+B |
| AT-02 Two pillars and a beam | Center/endpoint/height controls are understandable; stable placement is approachable | A+B+H |
| AT-03 Inspect detail | Partner actions do not steal the camera; close views reveal contact | B+H |
| AT-04 Real imbalance | Off-center loading, impacts and lost support have consequences | A+B+H |
| AT-05 Concurrent actions | Two sessions prepare together; results agree; conflict preserves the draft | A+B |
| AT-06 Unauthorized mutation | Server rejects nonmembers, removed members and expired sessions | A |
| AT-07 Disconnect and duplicates | Draft survives; unknown outcomes can be queried; no duplicate placement | A+B |
| AT-08 Abrupt restart | Acknowledged operations survive; motion resumes from a reliable frame | A |
| AT-09 Redeployment | Same persistent volume restores works and account/session data | A+deployment verification |
| AT-10 Exhibits and favorites | Frozen exhibits do not change with continued building; withdrawal works | A+B |
| AT-11 Push and restore | Save first; old requests fail; disconnection cannot permanently lock a room | A+B |
| AT-12 Keyboard and mobile | Complete a real placement without gesture conflicts or focus traps | B+H |
| AT-13 Capacity and slow network | Limits are explicit, status timely and existing worlds intact | A+B |
| AT-14 Wood quality | Detail, contact, sound and animation are coherent | B+H |
| AT-15 Course contracts | Shipped checks and evidence checks pass; complete README is accessible | A |
| AT-16 Log demonstration | Logs alone explain semantic activity across sessions | A+H |
| AT-17 Move to trash while collaborating | Only the owner can; connected editors are told and lose placement; invitations revoked; late commands rejected; every exhibit, thumbnail and favorite shows withdrawal; a failed save changes nothing | A+B |
| AT-18 Trash and restore | Trash is owner-only and survives reload and restart; an editor can leave a trashed work from their own list without reading private data; restore keeps acknowledged sticks, versions and permitted members (not anyone who left or was removed), keeps exhibits withdrawn and needs a fresh room | A+B |
| AT-19 Permanent deletion | Refused outside the trash, with a wrong title or without ownership; success removes the work's dependent data and keeps both accounts and unrelated work; repeats, racing commands and failed transactions cause no partial deletion or resurrection | A+B |
| AT-20 Exhibit limit | The 30-exhibit limit counts withdrawn exhibits; creating one at the limit is refused and concurrent publishes for the last slot let exactly one through; republishing keeps its ID and geometry and is allowed even over the limit | A |
| AT-21 Graphics quality | Each mode applies its preset and High equals the version 1.2 renderer; the choice survives reload and bad storage falls back to Auto; switching keeps camera, held stick and session and sends no mutation; placing works in Low and after resize/DPR changes; Auto's downgrade, recovery, backoff, warm-up and manual immunity behave as LOOK-04 says | A+B+H |
| AT-22 Idle and hidden rendering | A still scene stops drawing; a partner's ghost, placement and motion wake an idle viewer and finish at the authoritative pose; nothing is drawn while hidden; return resyncs without counting the gap; remounts and mode changes leave no extra loops, errors or growing GPU resources | B |

Final completion also requires a status for every rule in the tracking table, critical checks that do not merely mock success, no invented user feedback/performance/deployment evidence, and an explicit record of all known limitations.

## 14. Relationship to course documents

Course pages checked: 2026-10-05. Re-check before each cutoff. Determine the actual session and cutoff rather than assuming the usual Monday.

- [Crit 8](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/): ensure a stranger can act and leave a persistent trace on Fly, with README, public repository and weekly process requirements covered. Earlier completion of additional features is permitted by the published text; no feature ceiling is stated.
- [Crit 9](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/): alongside real-time use, explain a multiplayer behavior decision and its trade-offs.
- [Crit 10](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/): server-side behavior logging, a live view and a demonstration narrated from logs.
- [Final](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/): multi-user, real-time and persistent; the definition of good should connect README, CLAUDE.md, spec and the actual app. Unrelated features do not earn additional marks.

This design does not write the student's personal reading history or reflections. The student must actually read sources and revise the README's position. The agent may verify sources, identify gaps and connect accepted promises to implementation rules and checks. `brief.md` is a detailed product specification, not a wholesale replacement for the concise course README.

## 15. Initial parameters and change discipline

Centralize all initial parameters in versioned configuration, not scattered magic numbers: stick/table dimensions, capacities, gravity/friction/damping, stability thresholds, snap tolerances, input increments, impulse, update rates, checkpoint intervals and load thresholds.

Parameter changes must record “problem → change → before/after result in the same scenario.” Bind physics configuration affecting saves to each work's version, so global tuning cannot unexpectedly collapse an old tower on its next load. Do not update the physics engine and rewrite all saves without a migration strategy.

The only facts deliberately left unfrozen are measured capacity, best-feeling physics parameters, real user feedback, final branding and actual course cutoffs. Each has a verification task; none may be presented as already established.