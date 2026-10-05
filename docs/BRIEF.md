# Building Together: Product Brief

Version: 1.1 · 2026-10-05 (Australia/Sydney)  
Purpose: product rules and acceptance criteria for the COMP4020 final project; use with `INITIAL_PROMP.md` in the same directory.  
Status: an implementation-ready design baseline, not an implemented or tested application and not evidence of any grade. The working name is **Stillwood**. Naming may change without changing the core experience.

## 0. How to use this specification

**DOC-01 — Responsibilities.** This file defines what to build, why, behavioral boundaries and acceptance criteria. `INITIAL_PROMP.md` defines the technical mapping, implementation order and verification methods. Official course pages and repository-supplied contracts remain authoritative for assessment requirements; this document cannot replace or weaken them.

**DOC-02 — Requirement levels.** Numbered rules are acceptance requirements. “Initial parameters” are concrete starting values, not supposedly measured optima. The implementation agent may tune them through documented experiments; it must not independently remove core capabilities, change permission semantics or weaken durability promises. Incompatible requirements require a precise issue, evidence and proposed alternatives.

**DOC-03 — Decision provenance.** The user's core concept comprises realistic wood, independent orbiting observation, precise whole-stick and endpoint adjustment, gravity and collisions after release, visible partner-held ghosts, simultaneous building, accounts and author permissions, saved work that can be continued, deliberate collapse, exhibitions and favorites. Membership rules, storage mechanisms, interaction constraints and capacities added here are design decisions developed for this specification; they are not presented as verbatim user instructions.

**DOC-04 — Scope.** All mandatory rules in this document define the first complete version. Development stages are not a reason to permanently remove features. A Crit 8 vertical slice may ship first, followed by the remaining stages. An intermediate build must not be presented as satisfying the entire specification.

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

**Position on trade-offs:** placement assistance reduces manipulation effort while retaining structural judgment. Simultaneous building retains shared consequences at the cost of isolated per-person undo. Immutable exhibits make continued experimentation safer, at the cost of clearly distinguishing the working structure from its exhibited version. Height provides a challenge without ranking the value of every creation. Test these choices through actual use rather than treating them as promotional claims.

## 2. Pages and first use

**NAV-01 — Pages.** `/` is the public exhibition and starting point; `/works/` lists works created or joined; `/works/:id/` is the private workshop; `/exhibits/:id/` is the public frozen exhibit; `/favorites/` contains the user's favorites; `/readme/` serves the complete README. Account, invitation, missing-page and access-denied flows must be usable.

**NAV-02 — Newcomers.** Viewing public exhibits does not require login. Creating, joining as an editor and favoriting require an account. Explain “Create an account to save and come back”; do not pretend work has been saved and only then require registration. Successful registration returns to the original creation or invitation task. Creating a work requires only a name, with an editable default allowed.

**NAV-03 — Introduction.** First use offers a short, skippable introduction: orbit the view → add a stick → adjust height/direction → place → inspect save status. These actions occur in the real work, not a disposable fake scene replacing persistence. Help can be reopened.

**NAV-04 — Examples and empty states.** Examples use the same geometry, rules and rendering path and are labeled as examples. Never fabricate online players or community activity. Empty exhibits, works and favorites offer a next step. Loading failures offer retry rather than an endless spinner.

## 3. World, material and bounds

**WORLD-01 — Coordinates.** Use right-handed coordinates, Y up, tabletop at y=0. The unit u is the stick width and is not claimed to represent physical meters. The stick's local long axis is X, its center is the origin and its endpoints are ±L/2. Initial dimensions are L=8u with a 1u×1u cross-section. All sticks have equal dimensions, mass and friction properties.

**WORLD-02 — Table.** The circular table initially has radius 18u, thickness 2u and top y=0. Its cylindrical collider matches the visible table. Initial creation bounds require every stick corner to lie within y∈[0,80u] and XZ radius≤22u. Edge overhang and unsupported release are allowed. Creation inside the tabletop or another solid stick is not allowed.

**WORLD-03 — Cleanup.** When a stick's entire bounding volume lies below y=-20u or wholly outside the radius-60u retention region, the server removes it and saves the result. The current stick count decreases; historic contribution records remain. Creation bounds and post-motion cleanup bounds are different.

**WORLD-04 — Capacity.** Initial targets are 200 retained sticks per work, four simultaneous editor seats per room and three active rooms. Existing members beyond the editor-seat limit may observe the room. If no active-room slot is available, show the last saved state and clearly state that live building has not started. Do not simulate a false live status. Public exhibits do not activate physics rooms. Measure capacity on the target Fly machine; changes require recorded evidence and matching UI, configuration and test updates. Never reduce collaboration below two simultaneous editors.

Initial persistent-resource limits are 20 owned works and 100 favorites per account, and 30 exhibits per work; version limits are defined in SAVE-08. At a limit, retain entered input and explain the issue rather than deleting old work. When server storage is insufficient, clearly stop new writes while retaining access to existing readable content. Do not promise unlimited storage.

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

**PLACE-10 — Placed objects.** Users may select, focus and inspect authorship, but cannot directly drag/delete placed sticks in the first version. Ordinary mistakes are handled through further building or restoring a version. Do not offer global undo that silently removes a partner's work. Targeted pushing is a separate explicit operation.

## 6. Understandable physics

**PHYS-01 — One authority.** Each active work has one server physics world. Browsers render its results and local ghosts; they do not independently decide collapse or scores.

**PHYS-02 — Easy upright placement.** A precisely vertical, isolated stick on a sufficiently contacting flat surface, without off-center loading or impact, should be easy to stand and should not continually jitter. First use geometric alignment, friction, solver settings and normal sleeping. Do not permanently lock rotation, convert it to a fixed body, add invisible glue or force it upright every frame. If additional assistance is necessary, first record failure evidence and gameplay effects and propose a rule change; do not add it secretly.

**PHYS-03 — Consequences.** A bridge with sufficient contact can settle. Overhang and accumulated off-center loading can topple a structure. Falling sticks collide with others, and changes to support reawaken what rests above. All sticks retain dynamic-body properties. A side scrape does not necessarily carry load.

**PHYS-04 — Sleeping.** Slow bodies may sleep under engine rules but must wake on contact impact, applied force or loss of support. An unsupported object at height cannot freeze merely because its instantaneous speed is low. Never leave invalid structures permanently floating for visual stability.

**PHYS-05 — Motion quality.** Low restitution and moderate friction/damping convey wood. Do not suppress all motion into a slow, glue-like response. Check thin sticks and fast falling bodies for tunneling. CCD is a safeguard, not an exemption from verification. Animation cannot change the final physical position.

**PHYS-06 — Prototype gate.** Verify an isolated pillar, two pillars and a beam, progressive off-center loading, collision cascades, falling after removal of a test support, and continued motion after restoring the same save. Test tools may remove supports without adding a product deletion feature.

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

**AUTH-02 — Roles.** The creator is the owner; a person accepting an editing invitation is an editor; a public exhibit viewer is a visitor. Editors can build, name saved versions and read work history. Owners additionally manage members, invitations, work title, publication/withdrawal, restore, push and archive. Every server mutation rechecks authority; hidden frontend buttons are not a security boundary.

**AUTH-03 — Invitations.** Only owners create editing invitations. Links expire, are revocable, last seven days by default and allow at most three distinct accounts to accept. Acceptance requires login and explicit confirmation. Repeated acceptance does not duplicate membership or consume another use. Editing invitations are distinct from public viewing links; preview does not grant authority. A nickname cannot be used to impersonate an author.

Keep one active invitation per work. Creating a replacement revokes the old link, explained in advance beside the control. Revoking a link does not remove members who already joined; member removal is a separate action.

**AUTH-04 — Attribution.** Record who placed each stick. An exhibit records contributors to sticks in that snapshot. Membership is not proof of contribution. Removing an editor neither erases historic attribution nor lets them continue editing. Ownership transfer is outside the first version.

**AUTH-05 — Privacy.** Current works and saved versions are readable only by members. Public exhibits expose only selected frozen geometry, title, attribution and display information—not private membership lists, invitations, account data or internal physics snapshots. Editors may leave a collaboration and revoke their own membership; owners close a work through archiving.

## 9. Persistence, versions, exhibition and favorites

**SAVE-01 — Three objects.** The current work changes and autosaves; saved versions are immutable and restorable; public exhibits reference immutable saved versions. A favorite references an exhibit ID, not the changing current world.

**SAVE-02 — Meaning of confirmation.** Successful placement means “this placement was durably committed on the server,” not “this object will never fall.” Before acknowledging, atomically save the complete post-change physics state, stick metadata and command result. A persistence failure cannot produce success or allow the uncommitted mutation to continue simulating.

**SAVE-03 — Saving motion.** Checkpoint during motion and save immediately on settling. Distinguish “Placement saved; structure moving” from “Structure saved.” After an unexpected exit during motion, continue from the latest reliable physics frame; the final part of motion may briefly replay. Acknowledged placements cannot disappear or duplicate. Normal shutdown/redeployment should save the latest frame first.

**SAVE-04 — Manual versions.** Creating a named version, a new exhibit version from the current scene, or a pre-push snapshot requires a stable scene. Publishing an already stable saved version does not depend on whether the current work is moving. If saving is requested during motion, explain and offer cancel or “Save when settled.” Waiting tasks belong to the current world epoch and are canceled by restore, logout or permission revocation. Do not treat a moving pose as a permanently standing exhibit.

**SAVE-05 — Restore.** Before restoring, the owner confirms the action with visibility of affected present members, and the server first saves current state as a recovery point. This protection snapshot may contain motion, is for recovery only and cannot be published. If saving fails, do not restore. Restore increments world epoch, makes old drafts require review and invalidates old submissions. All clients receive full new state. Membership, favorites and existing exhibits do not roll back with physics.

**SAVE-06 — Exhibits.** The owner selects a stable version, sets a title, optional short description and framing, then publishes. Exhibits allow independent orbiting but no physics or editing. Continuing the work does not change older exhibits; publishing a new version creates a new exhibit ID. Descriptions accept text, not arbitrary HTML.

**SAVE-07 — Gallery and favorites.** The gallery defaults to newest publication and offers name search, without popularity ranking. Favorites are private lists and do not change exhibit permissions. Withdrawal immediately stops public access; favorites show “Withdrawn” and allow removal without exposing private content. Content already downloaded by a visitor cannot be promised to be recalled.

**SAVE-08 — Lifecycle.** Owners may archive a work, ending live editing and hiding it from the default list; unarchiving permits continuation. Permanent work deletion is outside the first version. Initially allow 30 named versions and retain the latest 10 ordinary automatic recovery points. Versions referenced by exhibits or active push recovery must not be automatically pruned. At a limit, let users select unreferenced manual versions to remove rather than silently deleting treasured work.

Archiving does not automatically withdraw published exhibits. Explain the distinction before archiving and provide a separate withdrawal action. Editors cannot use favorites or known version IDs to access private snapshots after losing permission.

**SAVE-09 — Nobody present.** After the last member leaves, simulate until settled and save. If the scene has not settled within ten seconds, snapshot velocities and suspend; clearly resume motion on return. Do not change gravity or force moving sticks upright. Suspended works do not consume continuous physics computation.

## 10. Deliberate pushing and height

**PUSH-01 — Entry.** The owner enters push mode from a stable scene. The server checks conditions and creates a protection version before blocking new placement. Other members see a clear notice. Any save failure prevents the destructive action. Finish submissions already being processed before entering; do not interrupt a half-committed mutation.

**PUSH-02 — Action.** The owner selects a real stick, contact point and horizontal direction, displayed as an arrow. Confirmation applies one fixed, bounded server impulse—not arbitrary mouse speed. Users choose where and which way to push, not unlimited force. The contact point must lie near the selected stick's surface. Others may continue observing.

**PUSH-03 — Completion.** After motion, the owner chooses keep or restore. If the owner disconnects, clear the operation lock after ten seconds while retaining the scene and recovery point so members can continue. Do not automatically restore after other people have made new changes. Restart also clears transient locks while retaining recovery points. Push-generated height does not update the historic building record.

**HEIGHT-01 — Definition.** Show “Stable structure height” in stick-width units u. Count the highest point of stationary structure connected to the table through upward supporting contacts. Exclude ghosts, flying objects and fragments below the table. The contact criterion is a game height estimate, not an engineering load analysis.

**HEIGHT-02 — Updates.** Confirm new height only after qualifying structure remains stable for 1.5 seconds. During motion, show “Measuring” and the previous stable value rather than misrepresenting it as current. Historic best comes from ordinary building; restoring a version does not erase it. Height is not the sole measure of a work's value.

## 11. Visuals, sound and accessible interaction

**LOOK-01 — Material.** Use longitudinal wood grain, subtle bevels, warm restrained variation, soft contact shadows and a neutral background. End grain has a distinct orientation; do not stretch one texture over every face. Materials and lighting must not obscure joints. Preserve actual geometry and scale; images cannot substitute for an interactive 3D work.

**LOOK-02 — Interface.** The table is primary. Keep add and place/cancel on the right, with compact adjustment controls below or beside the scene. Members, save status and height are visible but restrained. No full-screen dashboard, floating implementation data or development debug lines. Icons have textual explanations/accessible names.

**LOOK-03 — Feedback.** Sounds vary with collision strength and have a simultaneous-playback limit. No looping background music by default. Initialize audio only after the first user gesture. Provide mute and disable decorative camera transitions under reduced motion. Another person's placement must not force camera shake.

**ACCESS-01 — Keyboard.** Starting does not require clicking the canvas. DOM controls can create/select a draft, move X/Z, adjust height, yaw/pitch/roll, place and cancel. Users can change views and select existing sticks to focus. Provide a searchable/paginated stick list instead of 200 mandatory Tab stops. Game shortcuts must not fire inside text inputs.

**ACCESS-02 — Touch.** Mobile explicitly separates Observe and Adjust modes. Observe rotates the camera; Adjust drags the selected ghost. Pinch zoom, buttons and fine-adjustment controls are available. Main targets are at least 44 CSS px. Handle picking regions may exceed visible handles but cannot cover the entire stick and prevent center selection.

**ACCESS-03 — Interface resilience.** Verify the two viewports actually specified by the course, plus 390×844 and 1920×1080. Focus is visible, dialogs restore focus correctly, errors are readable and color is not the only state indicator. If WebGL is unavailable, show an explanation and readable work information rather than a blank page or a false claim that building is available. Read-only fallback does not count as passing the 3D core.

## 12. Failures, load and observability

**OPS-01 — Honest failure states.** Connection, permissions, persistence and resource shortage have distinct states and recovery paths. DB errors pause affected mutations; a broken empty world must not overwrite the latest reliable state. NaN or unbounded physics errors stop the room and retain evidence; recovery from a reliable snapshot is announced.

**OPS-02 — Degradation order.** First reduce shadows, pixel ratio and decorative effects, then ghost/motion-frame frequency. Never switch to independently authoritative clients or remove real collisions. Insufficient capacity rejects new rooms/objects while protecting ongoing work.

**OPS-03 — Behavior logs.** Record semantic starts/results: joining/leaving, draft start/end, adjustment-gesture end, camera-gesture end, placement accepted/rejected, versions, publishing, favorites, invitations, pushing, restore and reconnect. Each line has time, actor, work, action, outcome and correlation IDs. Do not log every high-frequency pointer update or physics frame as a user action. Browser assertions cannot establish server permission or successful mutation. Logs exclude passwords, cookies, recovery codes, raw invitations and private work content.

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