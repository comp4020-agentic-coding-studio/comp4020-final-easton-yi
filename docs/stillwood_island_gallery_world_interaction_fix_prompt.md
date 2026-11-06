Implement the following complete interaction upgrade for the current
Stillwood world.

PRIMARY REFERENCES
- docs/stillwood_immersive_island_gallery_upgrade_prompt.md
- docs/stillwood_memory_recovery_constraints.md

This instruction supersedes conflicting interaction requirements in the
original brief. Continue from the current working tree and preserve the
world design, all 20 landmarks, existing business features and memory
safeguards.

PROBLEM

The current world captures mouse movement continuously and hides the
cursor, preventing users from clicking Start building and other controls.
The camera also responds while the embedded world is partly scrolled out
of view. Portal destinations lack a clear return path, fullscreen behavior
needs an explicit entry/exit flow, and traversal is too slow.

Implement the following as one coherent interaction system.

1. DEFAULT MODE: VISIBLE CURSOR + LEFT-DRAG TO LOOK

Keep the cursor visible by default.

- Ordinary mouse movement must never rotate the camera.
- Hold the LEFT mouse button and drag on the world canvas to look around.
- Begin rotation only after a small drag threshold, initially about
  5 CSS pixels, to distinguish clicking from dragging.
- Apply only movement beyond the threshold when rotation begins,
  avoiding an initial camera jump.
- Releasing the button stops rotation immediately.
- End the gesture cleanly on pointer cancellation, lost capture, window
  blur, navigation, pause or leaving the world viewport.
- Do not continue rotating after the pointer leaves the world viewport.
- A completed drag must not trigger a click on a world object.
- Preserve ordinary click interaction with world objects where present.
- Preserve the normal right-click context menu.

Buttons, links, menus, dropdowns and HUD overlays must receive their own
input without starting a camera gesture. Clicking Start building, speed
controls or any other UI must not move the camera or player.

Preserve arrow-key/WASD movement and I/J/K/L keyboard look controls.
Movement requires active world input focus. Do not intercept keys while
the user is typing or operating a button, dropdown, dialog or other form
control. Clear held movement keys whenever focus leaves world control.

2. OPTIONAL LOOK LOCK FOR CONTINUOUS EXPLORATION

Add an explicit optional mode for users who prefer moving the mouse
directly to look around without holding a button.

- Place a translucent “Look lock” control near the speed controls.
- In default mode, show the current state as “Free cursor”.
- Activate pointer lock only through a deliberate user action.
- When locked, show “Look locked · Esc to release cursor”.
- Pressing Escape releases the cursor and stops movement. It must not
  immediately re-lock.
- Never require the user to click a button with a hidden cursor to exit.
- After release, all HUD controls must be immediately clickable.
- Provide L as a toggle shortcut only while world controls are active.
- Move any existing L-to-look-right binding to avoid conflicting actions:
  preserve I/J/K/L looking and choose another unused shortcut instead
  if necessary. Document the final shortcut consistently in the UI.
- Opening a menu or dialog, pausing, navigating away, losing focus or
  hiding the tab releases capture and clears held input.
- If pointer lock fails or is unsupported, remain in free-cursor mode
  with left-drag and keyboard controls usable.

Keep the input mode separate from fullscreen state.

3. THREE SPEED MODES — REQUIRED

Add three compact, translucent glass-style speed buttons vertically
aligned at the right-center INSIDE the world viewport.

Display order:
- TOP: Fly — fastest.
- MIDDLE: Run — intermediate.
- BOTTOM: Walk — current slow traversal speed.

Each button must include:
- A recognizable icon.
- A short visible text label.
- A clear selected state using more than color alone.
- An accessible name and selected/pressed state.
- A sufficiently large click/touch target.

Use the current normal movement speed as the Walk baseline.
Initial tuning:
- Walk: 1x.
- Run: 3x.
- Fly: 7x.

Default to Run on first entry. Remember the user's selected speed across
world/workbench navigation and reloads, validating stored values.

Allow switching through both:
- Clicking/tapping the three buttons.
- Keyboard shortcuts: 1 = Walk, 2 = Run, 3 = Fly.

Shortcuts apply only while world controls are active and must not
intercept typing or form interaction. Display the shortcuts in tooltips
or the controls help.

Behavior:
- Switch modes without pausing, resetting position or changing heading.
- Use smooth, responsive acceleration and deceleration.
- Make Run and Fly noticeably faster than the existing walking pace.
- Fly is the fastest traversal preset and supports deliberate ascent
  and descent using the existing vertical controls.
- Selecting Fly must not automatically ascend or rotate the camera.
- Walk and Run retain the existing movement/vertical-control behavior;
  do not introduce new gravity or ground-snapping rules in this task.
- Normalize diagonal input so it does not exceed the selected speed.
- Integrate the existing Shift boost deliberately. Do not blindly
  multiply Fly by the old boost into an uncontrolled speed.
  Document and enforce a sensible maximum.
- Collision, flight openings, terrain and world boundaries must remain
  reliable at maximum speed and during low-frame-rate conditions.
  Do not allow tunneling through walls or the island boundary.
- Camera sensitivity must not change simply because speed changes.

Place the Look lock control separately below the three speed buttons.
While locked, speed shortcuts remain usable. Show that Escape restores
the cursor for clicking controls.

4. EMBEDDED WORLD AND FULLSCREEN EXPLORATION

At initial entry, present:
- “Start exploring”: explore inside the embedded world viewport.
- “Explore fullscreen”: fullscreen the world container and begin exploring.

Fullscreen must include the world canvas, HUD, speed controls, help,
pause/menu controls and fullscreen exit control.

- Fullscreen and Look lock are independent.
- Entering fullscreen must not silently force pointer lock.
- Provide a visible exit-fullscreen button when the cursor is available.
- Handle browser/Escape-driven fullscreen exits coherently.
- If pointer lock is released first, leave the interface usable so the
  user can then exit fullscreen. Do not promise one Escape action always
  exits both browser states.
- Never automatically re-enter fullscreen or pointer lock.
- Exiting fullscreen restores the original embedded layout.
- Preserve position, orientation and selected speed.
- Restore a usable cursor and clear held movement input.
- The original homepage remains below the world and remains scrollable.
- If fullscreen is unavailable or rejected, keep embedded exploration usable.

Do not create a second renderer or duplicate scene merely to fullscreen
the existing world.

5. PAGE SCROLLING AND INPUT BOUNDARIES

The embedded world must behave correctly as part of a normal webpage.

- The mouse wheel and trackpad must scroll the surrounding page in
  free-cursor mode, including when the pointer is over the embedded canvas.
- Do not globally prevent page scrolling.
- Scrolling the surrounding page ends any camera drag and pauses world
  movement input.
- When the world is partly visible, ordinary mouse movement must still
  leave its camera unchanged.
- Moving the pointer outside the world ends drag-look. Keyboard input
  must stop when world focus is lost.
- Clicking or focusing the original homepage below must restore normal
  webpage interaction, with no hidden world movement.
- Re-entering the world requires deliberate interaction to resume controls;
  hovering alone must not capture input.
- Handle tab changes and focus restoration without stuck keys or a
  sudden jump in movement.

Keep rendering suspension and input suspension distinct where appropriate:
the world can remain visible without accepting movement commands.

6. RETURN TO WORLD FROM PORTAL DESTINATIONS

Provide a clear “Return to world” action on destinations opened from the
world, including My Works, exhibition/list/detail pages and the editor
where applicable.

- Make it discoverable and keyboard-accessible.
- Preserve the original navigation and business actions.
- Respect existing save, autosave and unsaved-change protections.
- Do not silently discard edits when returning.
- Remember the originating world route: embedded homepage or standalone
  /world/.
- Restore the previous position, orientation and speed.
- Restore in free-cursor mode with no held movement input.
- Do not automatically request fullscreen or pointer lock on return.
- Use a safe spawn fallback if the stored position is no longer valid.
- Keep browser Back/Forward behavior coherent.
- Preserve only lightweight navigation/camera state; do not keep an
  unused renderer alive just to remember where the user was.

7. HUD DESIGN AND ACCESSIBILITY

Use a restrained, consistent glass-style HUD that suits the island.

- Keep speed buttons at the right-center of the actual world viewport,
  not the browser page when the world scrolls.
- Keep essential buttons within the viewport in embedded and fullscreen
  layouts.
- Avoid overlapping Start building, portal labels, pause controls or
  existing navigation.
- Keep labels and icons readable against bright sky and dark buildings.
- Provide visible keyboard focus and accessible names.
- Update help text to match the implemented controls exactly:
  left-drag look, movement, ascent/descent, speed modes, Look lock,
  Escape and fullscreen.
- Keep touch controls usable without a mouse or right button.
- Preserve existing mobile controls and prevent HUD gestures from
  simultaneously steering the camera.
- Do not permanently cover a large part of the mobile world with help.

8. IMPLEMENTATION AND RESOURCE OWNERSHIP

Inspect the existing input, focus, navigation and lifecycle code before
editing. Extend the current architecture instead of adding competing
document-level input handlers.

Make the relevant states explicit:
- Embedded or fullscreen presentation.
- Free cursor or Look lock.
- Active exploration or paused input.
- Selected speed.
- Canvas focus versus UI/form focus.

Centralize cleanup for pointer capture, pointer lock, movement keys,
listeners and pending input.

Maintain the existing frame-pacing fix, bounded landmark residency,
resource disposal and one active render loop. Ensure entering/exiting
fullscreen and returning from other pages do not duplicate renderers,
listeners or RAF loops.

Use the existing memory supervisor for heavy validation. Do not overlap
browser tests, generation and builds. Regenerate landmark assets only
if this interaction work actually requires an asset change.

9. ACCEPTANCE CHECKS

Verify the following actual user journeys:

A. Open the homepage.
   Cursor is visible. Ordinary mouse movement does not turn the camera.
   Start building and all existing page controls remain clickable.

B. Start embedded exploration.
   Left-drag turns the camera. Release or leave the viewport and it stops.
   A short click remains a click. Dragging does not activate world objects.

C. Click every HUD control.
   No camera jump, unintended movement or click-through occurs.

D. Switch Walk → Run → Fly using buttons and keyboard shortcuts.
   Speed changes are clear and smooth; heading and position are preserved.
   Maximum-speed collision and boundaries remain reliable.

E. Enable Look lock, move and change speed using shortcuts.
   Escape restores the cursor and makes the HUD usable immediately.

F. Scroll until only half of the embedded world remains visible.
   Move the mouse and interact with the homepage.
   The world camera and player do not respond.

G. Enter and exit fullscreen through UI and browser/Escape behavior.
   Position and speed are preserved, layout restores, and no input is trapped.

H. Enter a portal, open its destination and use Return to world.
   The expected world route and camera state return.
   Existing editor save protections still work.

I. Switch tabs, blur the window and return.
   No stuck movement, unexpected capture or large movement jump occurs.

J. Check desktop and mobile layouts and affected existing workflows.
   Do not claim physical-phone validation from desktop viewport emulation.

Run focused tests for these changes and the necessary regressions under
the memory limits. Preserve unrelated work and pre-existing evidence.

10. HANDOFF

Complete the implementation, not just a design proposal.

Report:
- The final controls and actual speed values.
- Files changed and relevant validation results.
- Any remaining interaction issues or unavailable device checks.
- The exact local preview URL and which build it serves.

Start the updated local preview for my manual review.
Keep the server running and stop automated browser tests during my review.

Do not commit, push or deploy.
