# Acceptance report

Scenario status against `docs/BRIEF.md` §13, as of 2026-10-05. **A** = automated
check, **B** = browser interaction (Playwright, headless Chromium 153 with
SwiftShader WebGL), **H** = human judgement. Nothing below claims a human
judgement that hasn't happened. All automated and browser evidence ran against
a **local** production-mode server (`NODE_ENV=production node
dist/server/main.js`), **not** the Fly deployment. See "Not yet verified".

Latest full run (2026-10-06, after the graphics-quality change): `pnpm typecheck` clean · `pnpm test:unit` 88 passed ·
`APP_URL=… pnpm check` 49 passed (2 shipped invariants + 47 product specs) in 6 of 9 runs; the other 3 had 1–4 failures in `spec/versions.test.ts` (see implementation-status, known limitations) ·
`pnpm test:e2e` 18 passed (local server with test hooks).

| Scenario | A | B | H | Evidence |
| --- | --- | --- | --- | --- |
| AT-01 New user creates and places; survives refresh, logout, login | pass | pass | — | `spec/placement.test.ts` "a new user creates a work…", `tests/e2e/solo.spec.ts` |
| AT-02 Two pillars and a beam | pass (fixture) | partial (pillar via presets) | **pending** | `tests/physics.test.ts` "two pillars and a beam" |
| AT-03 Partner actions don't steal the camera; close views show contact | — | pass (camera unchanged while partner places) | **pending** | `tests/e2e/together.spec.ts` |
| AT-04 Off-centre loading, impacts, lost support have consequences | pass | — | **pending** | `physics.test.ts` imbalance/cascade/support-removal fixtures; `spec/versions.test.ts` push topples a pillar |
| AT-05 Concurrent actions agree; conflict keeps the draft | pass | pass | — | `spec/collaboration.test.ts` (identical: one wins; disjoint: both succeed); `together.spec.ts` |
| AT-06 Server rejects non-members, removed members, expired/logged-out sessions | pass | — | — | `placement.test.ts` authority, `collaboration.test.ts` losing authority, `accounts.test.ts` |
| AT-07 Draft survives disconnect; unknown outcome queryable; no duplicates | pass | pass | — | `restart.test.ts` after-commit kill + same-ID replay; `placement.test.ts` replay/conflict; `together.spec.ts` offline; `access.spec.ts` slow connection double-click |
| AT-08 Abrupt restart keeps acknowledged work; motion resumes | pass | — | — | `tests/restart.test.ts` (6 real process kills/terminations) |
| AT-09 Redeployment keeps works and sessions on the same volume | partial | — | — | Same data dir across process restarts passes locally. **Fly redeploy not run** |
| AT-10 Frozen exhibits; withdrawal | pass | pass | — | `versions.test.ts`, `tests/e2e/exhibit.spec.ts` |
| AT-11 Push and restore: save first, old requests fail, no permanent lock | pass | — | — | `versions.test.ts` restore + push-mode owner disconnect |
| AT-12 Keyboard and mobile complete a real placement | — | pass | **pending** | `access.spec.ts` keyboard-only; 390×844 touch; 1920×1080 resize |
| AT-13 Limits explicit, status timely, worlds intact under load/slow network | pass (local load) | pass (throttled) | — | `scripts/measure/capacity.ts` (M-006), `access.spec.ts` slow connection, room limit exercised in specs |
| AT-14 Wood quality: detail, contact, sound, animation | — | screenshots only | **pending** | `docs/evidence/*.png` (agent inspection is not H) |
| AT-15 Shipped checks + evidence checks pass; README at `/readme/` | **partial** | — | — | `pnpm check` passes; `pnpm check:evidence` **fails** until `PROCESS.md` and a reflection exist (student-authored) |
| AT-16 Logs alone explain activity across sessions | pass (local) | — | **pending** | `docs/logs-demo.md`, `docs/evidence/demo-server-log.jsonl` |
| AT-17 Move to trash while collaborating (added 2026-10-06) | pass | pass | — | `spec/lifecycle.test.ts` (two connected members, moving structure, late WS/HTTP commands, invites, exhibits/thumbnails/favorites, racing command), `tests/lifecycle-restart.test.ts` failed write, `tests/e2e/lifecycle.spec.ts`, `docs/evidence/lifecycle-editor-trashed.png` |
| AT-18 Trash and restore (added 2026-10-06) | pass | pass | — | `spec/lifecycle.test.ts` (owner-only, editor leaves a trashed work from their own list, known-ID reads, restore keeps sticks/members, exhibits withdrawn, fresh stream/epoch), `tests/lifecycle-restart.test.ts` SIGKILL, `tests/e2e/lifecycle.spec.ts`, `docs/evidence/lifecycle-trash.png` |
| AT-19 Permanent deletion (added 2026-10-06) | pass | pass | — | `spec/lifecycle.test.ts` (refusals, success keeps accounts/unrelated work, repeats, stale command), `tests/lifecycle-restart.test.ts` (failed transaction, direct SQLite read, restart), `tests/e2e/lifecycle.spec.ts` |
| AT-20 Exhibit limit counts withdrawn exhibits; republish uses no slot (added 2026-10-06) | pass | — | — | `spec/lifecycle.test.ts` "exhibit limit" (boundary, 3 concurrent publishes, concurrent republish), `tests/lifecycle-restart.test.ts` (over the limit from older data: republish keeps ID and geometry; creating another is refused) |
| AT-21 Graphics quality (added 2026-10-06) | pass | pass | **pending** | `tests/graphics-quality.test.ts` (Auto with injected time, incl. ordinary use and no oscillation), `tests/e2e/graphics.spec.ts` (presets, antialiasing, reload, bad storage, preservation, Low placement after resize/DPR, switching with a partner active, exhibit, phone), M-007/M-008 pixel-identical High (fresh and after Low/Medium), `scripts/measure/graphics-auto.ts` real-browser recovery; whether Medium/Low look acceptable to a person is H |
| AT-22 Idle and hidden rendering (added 2026-10-06) | — | pass | — | `tests/e2e/graphics.spec.ts` (idle partner: ghost move/release, placement, collapse and dropped partner to the final pose, own reconnect; zero renders while hidden, simulated, see INITIAL_PROMPT §9.4; remounts), M-007 idle counts |

## Not yet verified

1. **Fly deployment.** Nothing has been deployed from this work. The sandbox
   used for implementation can't reach `api.fly.io`, and Docker isn't
   installed, so the image has never been built here. Unverified until a
   deploy runs: the image build (Rapier WASM, better-sqlite3 native addon),
   `/data` persistence across redeploys (AT-09), memory and CPU on the real
   shared-cpu-1x 256 MB machine, and network latency to `syd` (SYNC-04's
   ≤1 s p95 measured remotely).
2. **Capacity on Fly.** Locally, peak RSS reached 222 MiB (87%) during the
   drop-plus-login burst (M-006). The shared CPU may throttle sustained
   physics. Re-run `scripts/measure/capacity.ts` against the deployed URL
   before claiming WORLD-04's 3 rooms × 4 editors × 200 sticks. If it fails,
   lower the published caps with evidence, keeping at least 2 editors.
3. **Human judgements** (GOOD-03, AT-02/03/04/12/14/16 H): no person
   uninvolved in implementation has tried the app.
4. **Real touchpad and a real phone.** Only emulated touch has been tested.
5. **Sound.** Collision knocks are implemented but no person has listened.
6. **Graphics on real hardware.** Tier behaviour and idle rendering are verified
   in headless SwiftShader only; no real GPU, phone frame rate or battery
   effect has been measured, and a real hidden tab was checked only by
   simulation (manual check in INITIAL_PROMPT §9.4).

## Human session protocol (for the student to run)

Ask at least two people who didn't build it. Record what happens, not
quotes you'd like.

1. *Solo bridge, no spoken guidance (≈10 min).* Give them the URL and "make a
   bridge: two pillars and a beam". Note where they hesitate, any mistaken
   gestures (dragging the background when they meant the stick, missing the
   end handles), whether they find Snap to support, whether its 0.2 u reach
   is enough, and whether they understand "Placement saved; structure moving"
   vs "Structure saved".
2. *Partner extends it (≈10 min, two devices).* The first person invites the
   second through People → link. Both hold sticks at once. Note whether each
   can tell the partner's ghost from real wood, whether anyone reaches for a
   turn, whether a rejected collision is understood, and whether anyone feels
   their camera was moved.
3. *Collapse and trust (≈5 min).* Owner saves a version, pushes, then
   restores. Ask whether they'd trust the saved version and the exhibit.
4. *Phone (≈5 min).* One placement on a real phone using Observe/Adjust.

Write the observations, with dates, in this file, and mark the H column only
for what was actually observed.
