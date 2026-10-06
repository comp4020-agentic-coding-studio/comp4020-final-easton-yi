# Stillwood: selectable graphics quality and conservative automatic adaptation

## Task and intended outcome

Implement a small, reliable client-side graphics-quality system in the existing Stillwood project. Add **Auto / High / Medium / Low**. Auto is the default and improves the existing automatic downgrade mechanism. **High must preserve the project's current maximum visual quality**, including its wood materials, lighting, shadows and antialiasing. The purpose is to give players control and let Auto recover gracefully after temporary slowdowns while avoiding repeated quality oscillation.

Work in the actual repository. Inspect its current implementation before editing. Complete the implementation, relevant verification and documentation reconciliation. Do not stop after a plan. This task authorizes local code and documentation changes; it does not request a push, deployment, production load test or movement of a crit tag. Respect any separate, explicit authorization already provided in this session.

All product UI, code comments and project documentation must be in English.

## 1. Ground the change in the current repository

Read applicable repository instructions, the installed Three.js version and relevant code. Start with the actual canonical documents, expected to be `docs/BRIEF.md` and `docs/INITIAL_PROMPT.md`; confirm the paths rather than creating duplicate specifications. Inspect `src/client/scene/viewport.ts`, `src/client/scene/wood.ts`, the camera/input controls, view lifecycle, settings UI, and the visibility/reconnection handling in `connection.ts`. Check every route using the shared renderer, including workshop and public exhibit views.

The following is a previously reported baseline, not an instruction to overwrite newer code:

- `WebGLRenderer({ antialias: true, powerPreference: "high-performance" })`.
- Pixel ratio is `min(devicePixelRatio, coarsePointer ? 1.5 : 2)`.
- `PCFSoftShadowMap`, one shadow-casting directional light, a 2048 by 2048 shadow map, plus hemisphere fill.
- Procedural wood shaders injected through `MeshStandardMaterial.onBeforeCompile`, instanced sticks, ACES filmic tone mapping, exposure 1.05 and sRGB output.
- No bloom, SSAO, depth of field or other post-processing stack.
- An internal quality counter currently downgrades after 90 consecutive frame intervals above 34 ms: first disable shadows, then reduce pixel ratio to 1. It never recovers.
- Network visibility handling independently rejoins the room after a sufficiently long background interval.

Record the actual baseline commit and visual settings before editing. If the audit differs, retain the current intended maximum appearance and explain the difference. Use the installed Three.js source/types to settle version-dependent behavior; do not assume the latest online documentation matches the lockfile.

Do not describe client rendering load as consumption of the Fly machine's RAM or CPU. Client frame intervals measure delivered responsiveness, not isolated GPU execution time. Server physics and authoritative state continue independently of local graphics quality.

## 2. Product behavior and quality presets

Separate the **selected mode** (`auto`, `high`, `medium`, `low`) from the **effective tier** (`high`, `medium`, `low`). Auto initially uses High. Manual modes always use the selected tier and are never silently downgraded or upgraded.

Use these initial presets:

| Tier | Effective pixel ratio | Real-time shadows | Other appearance |
| --- | --- | --- | --- |
| High | Preserve current baseline: `min(devicePixelRatio, coarsePointer ? 1.5 : 2)` | Preserve current shadow type and 2048 by 2048 resolution | Preserve the complete existing maximum visual appearance |
| Medium | `min(devicePixelRatio, 1.5)` | Same shadow type, 1024 by 1024 resolution | Same materials, lighting, geometry, color pipeline and interaction cues |
| Low | `min(devicePixelRatio, 1)` | Disabled | Same wood materials, geometry, lighting/color pipeline, outlines and placement cues |

If the actual baseline differs, document the adjustment to this table. In particular, High must not increase the existing coarse-pointer cap from 1.5 to 2. The caps are ceilings, not forced supersampling on lower-DPR screens.

Preserve antialiasing and the existing renderer context options in every tier for this change. Do not recreate the WebGL context to toggle antialiasing or power preference. Do not reduce wood-shader detail, replace materials, remove visible sticks, change geometry, add post-processing, or change physics accuracy as a quality optimization. Preserve current light placement, intensity, shadow bias/frustum, tone mapping and exposure in High.

Quality changes must retain the camera, selection, local held stick, remote previews, input ownership, room connection and work contents. They must not navigate, reload, rejoin a room, send a work mutation or create a saved version. Low must still allow a player to judge and place a stick using the existing placement cues. Check this visually rather than assuming shadows are dispensable to usability.

## 3. Minimal settings UI and persistence

Add one compact, accessible control in the existing settings/view controls rather than a new top-level panel. Label it **Graphics quality** with **Auto (recommended), High, Medium, Low**. Provide brief help: **Auto balances detail and smoothness. This setting only affects this device.**

When Auto is selected, show its current effective tier unobtrusively within the settings, for example **Currently: Medium**. Avoid recurring notifications while it adapts. The UI must reflect the applied tier, not just a queued request.

Persist only the user's selected mode in a versioned local-storage key, scoped to this browser. Do not put it in an account row, work, exhibit or server configuration. Validate stored values; missing, invalid or unavailable storage falls back to Auto without preventing rendering. Changing quality must work immediately in the current view and apply to later 3D views. A fresh viewport in Auto starts at High; transient adaptation state need not survive navigation or reload.

Keep mode state in the existing client settings architecture where possible. Do not install a new state-management dependency. Maintain keyboard access, readable labels and a layout that fits the current mobile controls.

## 4. Auto controller: bounded, measurable, and reversible

Implement a small controller separate from Three.js mutations so its decisions can be tested with injected timestamps. Remove or replace the old downgrade path so two controllers cannot fight over the renderer.

The following are **initial tuning constants**, not measured device-capacity claims. Centralize them and document any evidence-based changes:

1. Sample intervals only during visible, continuously animated rendering: camera motion/damping, local manipulation, moving/interpolating sticks or animated remote previews. Exclude deliberate idle gaps, hidden time and the first interval after restarting the animation loop. Reset the observation window when continuous rendering stops; do not combine unrelated short interactions into apparent sustained performance.
2. After entering Auto, resuming visibility or applying a tier, allow 2 seconds of eligible animated time for warm-up before decisions. Exclude this bounded transition period from decisions, including shader compilation attributable to the tier switch. Do not repeatedly reset warm-up on routine server packets, or adaptation could never run.
3. Evaluate non-overlapping 2-second windows of eligible continuous rendering. A bad window has at least 70% of measured frame intervals above 34 ms. Two consecutive bad windows trigger a one-tier downgrade. A non-bad window clears the consecutive-bad count. This replaces the requirement that every frame in a long sequence be slow.
4. Consider one-tier recovery only after at least 15 seconds of uninterrupted eligible rendering with a rolling 2-second p90 interval at or below 20 ms. A failed good-window condition resets recovery accumulation. Idle time is not evidence that the device can sustain a higher tier. This deliberately conservative initial recovery threshold may decline to upgrade a 30 Hz/capped browser; report that limitation rather than adding speculative refresh-rate detection.
5. Allow at least 30 seconds between upgrade attempts. After an upgrade that must be reversed by the normal downgrade rule, suppress further upgrade attempts for 60 seconds. Downgrades remain possible during upgrade cooldowns. Reset performance samples after every tier change. Bounds are always Low through High; one decision moves at most one tier.
6. Defer automatic upgrades during a local drag, camera gesture or active tower collapse. Keep any deferred upgrade bounded: re-evaluate recent eligible evidence when safe, discard stale evidence after an idle/hidden interval, and do not upgrade automatically merely because a deferred flag remains set. Downgrades may occur during sustained poor performance in those activities.
7. Entering a manual mode stops adaptation immediately. Re-entering Auto starts with High and fresh statistics. Rapid mode changes must apply the latest selection without stale asynchronous work overwriting it.

Use elapsed time rather than an assumption of 60 frames per second. Keep the sample buffer bounded. Do not discard real foreground stalls merely because they are large; distinguish explicitly known lifecycle/idle gaps from performance problems. Do not treat a low room-update rate or network latency as low rendering FPS.

The desired behavior is conservative recovery, not a promise of 60 FPS on every device. If testing shows these constants produce poor behavior, tune them with the observed scenario and reason recorded. Do not expand this task into hardware fingerprinting, GPU timers or a benchmark service.

## 5. Apply quality changes safely

Use one renderer-facing function to resolve and apply the effective tier. It should be idempotent: applying the same resolved settings must not resize buffers or allocate shadow maps again.

- Recalculate the effective pixel ratio when viewport dimensions or device pixel ratio changes. A resize must not accidentally overwrite Low or restore a stale High cap. Keep CSS size, drawing-buffer size, camera aspect and pointer-to-world calculations consistent.
- Verify the installed Three.js requirements for changing shadow-map dimensions at runtime. Dispose/recreate only the affected shadow target when required, preserve unrelated resources, and request a fresh shadow render. Ensure the first frame after re-enabling shadows uses valid, current geometry rather than a stale map.
- Check whether enabling/disabling shadows requires material invalidation for the installed version, especially for the custom `onBeforeCompile` wood material. Preserve shader injection and program-cache behavior.
- Keep repeated High/Low switching bounded in GPU resources. Do not leak render targets, listeners, timers, materials or animation callbacks.
- Dispose the controller and scheduled work when the viewport is destroyed. Settings changes must not call a disposed renderer.

## 6. Visibility and idle rendering without frozen collaboration

Explicitly suppress rendering and performance sampling while the document is hidden. On return, clear stale timing state, request a frame and resume animation as needed. Preserve the existing connection visibility/rejoin logic and its ordering. Never stop server physics, persistence, heartbeats or the room connection just because this client's renderer is idle or hidden.

Avoid repeated `renderer.render()` calls once the visible scene is fully stable. Maintain one scheduling mechanism. Prefer an existing invalidation mechanism if available. A small lightweight RAF coordinator that skips GPU rendering while idle is acceptable if fully stopping RAF would require a risky lifecycle rewrite; report which strategy was implemented. Either strategy must explicitly stop rendering while hidden and avoid sampling deliberate idle periods as slow frames.

Audit and wire the wake-up conditions before enabling idle rendering:

- Initial scene load, navigation to a different work/exhibit and full state replacement after restore or reconnect.
- Camera orbit, pan, zoom, damping and camera animations.
- Local held-stick movement, selection/hover/placement feedback and any time-dependent cue.
- Incoming remote held-stick poses, removal/expiry of previews and collaborator changes that affect the scene.
- Incoming authoritative geometry, removals, collapse/motion and all client interpolation until it actually finishes.
- Resize/DPR changes, quality changes, visibility return and completion of asynchronous resources.
- Trash/archive/permission/connection transitions that affect the displayed scene or input.

Coalesce simultaneous invalidations into one scheduled frame. An incoming transform must wake the renderer even when the viewer provides no input. A stable-state message must not cut off unfinished interpolation. Do not rely exclusively on a server “settled” flag to decide that every client animation has finished. Preserve timeouts such as remote ghost expiry when no RAF is running.

Treat shadow reuse as a separate optimization. If added, distinguish scene redraw from shadow invalidation. Recompute shadows after any relevant caster, light, shadow camera, map size or scene change, including interpolated transforms and shadow-casting ghosts. Camera changes can affect shadow rendering through culling/version-specific behavior: conservatively invalidate them unless reuse is proven correct. Set the appropriate renderer/light `autoUpdate` and `needsUpdate` flags for the installed Three.js version; do not mix independent update schemes that suppress required updates.

If safe shadow reuse requires an unrelated renderer rewrite, retain automatic shadow updates on actual rendered frames and document the remaining optimization. Idle scene rendering suppression already avoids those shadow passes. Visual correctness takes precedence over an additional cache.

## 7. Verification and acceptance

Use disposable local test data. Retain existing course invariants and product contracts. Run typechecking and the existing checks appropriate to the changed paths; do not weaken assertions to obtain green results.

Add focused deterministic controller tests covering sustained slow performance, a brief slowdown, recovery, failed-upgrade backoff, manual-mode immunity, warm-up/reset, hidden/idle exclusion and tier bounds. Use injected time; avoid tests that sleep for real cooldown periods.

Add or extend browser checks for these externally observable behaviors:

1. Selecting each mode applies the intended settings. High restores the recorded baseline after Low, including shadows. Selection survives reload; invalid/unavailable local storage does not break the scene.
2. Switching tiers preserves camera pose, a held stick and a connected collaboration session. A stick can still be placed correctly after repeated switching and resize/DPR changes.
3. With two clients, an idle viewer sees another client move a ghost, place a stick and trigger motion without touching its own camera. Ghost removal and interpolation completion are visible.
4. Returning from a background interval displays current state and preserves the existing resync behavior without using the background gap as a slow-frame sample. Test the actual visibility lifecycle where the browser runner supports it; mark unsupported automation explicitly and provide a concise manual check.
5. After a stable scene settles, repeated GPU scene renders cease; movement wakes them again. During hidden time, scene-render calls are zero. Measure render-call counts with bounded development/test instrumentation if needed, without shipping a public debug panel.
6. Repeated mode changes and mount/unmount cycles do not produce duplicate loops, WebGL errors or unbounded resource growth. Use sensible resource trends rather than requiring every legitimate cached program count to return immediately to zero.

Capture matching before/after High screenshots locally using the same saved geometry, camera, viewport, DPR and browser. Inspect wood grain, silhouette edges, lighting, shadow softness and placement cues. Small cross-run raster differences are possible; investigate visible differences rather than blindly accepting a broad screenshot tolerance. High should look like the original maximum-quality renderer, not a new art direction. Also inspect Medium and Low, especially close-up placement.

Where a real GPU/browser is available, compare the same representative stable tower, camera orbit, remote preview and collapse scenarios before/after. Record device/browser, viewport/DPR, stick count, mode/effective tier, frame-interval median/p95 and render counts during idle. Headless/software-rendered tests verify behavior but do not establish player-device FPS or battery savings. If hardware measurements are unavailable, state that precisely; do not invent gains or expand into production capacity testing.

## 8. Implementation order and documentation

Implement in reviewable stages: baseline capture; preset/settings and mode persistence; deterministic Auto controller; renderer integration; visibility and idle invalidation; verification and document reconciliation. Preserve unrelated local changes.

Update the current `docs/BRIEF.md` and `docs/INITIAL_PROMPT.md` wherever the old one-way downgrade behavior is specified. Assign unused rule/acceptance IDs after inspecting the existing numbering. Record:

- Selected mode versus effective tier, exact High preservation and preset values.
- Browser-local persistence and manual-mode behavior.
- Auto criteria/cooldowns as tunable initial values, including conservative recovery limitations.
- Visibility/idle behavior and the fact that authoritative simulation/network durability is unaffected.
- Acceptance evidence, measurements actually collected, and any optimization deliberately deferred.

Update in-app Help briefly if appropriate. Add a factual development note to the existing process/decision record if that is the project's convention. Do not invent a personal reflection, user study or measured improvement. Keep the README focused; do not append a graphics-engine manual merely to mention this change.

Finish with a concise report of files changed, final behavior, checks and visual comparisons performed, any measured results, remaining limitations, and commit/deployment status. Distinguish verified behavior from proposed tuning. Stop after completing this authorized scope rather than asking whether to begin implementation.

## Technical reference points

Consult these official references as needed, but resolve version-dependent details against the project's installed Three.js version:

- https://threejs.org/docs/pages/WebGLRenderer.html
- https://threejs.org/docs/pages/LightShadow.html
- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame

## Short launch instruction

Read `GRAPHICS_QUALITY_PROMPT.md` and implement it in the current repository. Preserve the existing maximum visual quality in High, complete the client-side settings and Auto behavior, verify collaboration wake-up and lifecycle correctness, and reconcile the canonical brief and implementation directive. Work through the stages autonomously and report actual checks and limitations. Follow the prompt's stated commit/deployment scope and any separate explicit authorization in this session.
