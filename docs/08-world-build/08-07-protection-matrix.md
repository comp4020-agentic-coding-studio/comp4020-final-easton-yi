# Existing-feature protection matrix (brief §2)

Baseline: commit `b13ecae` (HEAD; the island work is uncommitted on top of
it). I built the matrix from the baseline source
(`git show HEAD:src/client/main.tsx`, `…/pages/Gallery.tsx`) rather than from
memory, and checked each row against the build that includes the island. "Verified by" names
the test that exercises the row through the real UI. All runs were local,
headless Chromium on SwiftShader, one Playwright worker, under
`scripts/world/supervise.ts`.

## Home page (`/`), signed out and signed in

| Control (baseline) | Label, order, destination, visibility | With the island | Verified by |
| --- | --- | --- | --- |
| Skip link | "Skip to content" → `#main`, outside the header | unchanged | `world-protection.spec.ts` (signed out) |
| Header brand | "Stillwood" → `/` | unchanged, clickable over the world | same |
| Header nav, signed out | Exhibition `/` · About `/readme/` · Sign in `/login/?next=<path>` | same labels, order and hrefs; each is the topmost element at its centre | same |
| Header nav, signed in | Exhibition · My works `/works/` · Favorites `/favorites/` · About · *display name* `/account/` · Sign out (button) | same order, labels, hrefs; Sign out still a button | `world-protection.spec.ts` (signed in) |
| Primary action, signed out | "Start building" → `/register/?next=%2Fworks%2F%3Fnew%3D1` + hint text | same href and hint, clickable | signed out |
| Primary action, signed in | "Go to my works" → `/works/` | same | signed in |
| Exhibit search | labelled search field + "Search" submit; empty-result text | same; a search runs and shows the baseline empty text | signed out |
| Empty state | "Start a work" → works or register (by session) | same | signed out |
| Exhibit cards | `/exhibits/<id>/` with thumbnail, title, attribution | unchanged (page below the island) | `exhibit.spec.ts` (publish → card → exhibit page) |
| Load errors / "Try again", "Show more" | baseline handlers | unchanged code path | code diff: `Gallery.tsx` only wraps the page in a fragment with the island above it |

## Island additions (new controls, not renames)

| Control | Destination | Rule from the brief | Verified by |
| --- | --- | --- | --- |
| "Start exploring" | captures control only on a gesture; no gate before the scene shows | §0.1, §3.1 | signed out (visible), `tour.ts --stage fly` |
| Portal links: Explore the World · My Works · Build Together · View player works | stay in the island · `/works/` (existing sign-in redirect when signed out) · `/works/?new=1` (focused name field) or register with that return-to · `#exhibits-h` | §0.3, §3.1, §3.3 | both home tests (labels, order, hrefs, clickability); signed-in test follows Build Together into a real new work |
| Spatial portals | the same `portalTarget()` mapping (`src/client/world/bridge.ts`); one crossing, one transition (lock + cooldown + re-arm) | §3.1 | `tour.ts --stage context` walked into a portal once and landed on `/register/` (observed; not an assertion) |
| Pause menu: Return to nearest safe point · Return home · Go to a landmark | local exploration state only | §5.2, §6 | `tour.ts --stage fly` (both viewports) |

## Other protected rows

| Protected feature | Required outcome | Status | Evidence |
| --- | --- | --- | --- |
| Login, registration, logout, return-to | existing flows reused; exploring presets needs no account | kept | signed-out island needs no account; header Sign in keeps `next`; `access.spec.ts`, `account-deletion.spec.ts` pass |
| My Works and the workbench | create, resume, edit, camera, controls unchanged | kept | `solo.spec.ts`, `access.spec.ts`, `graphics.spec.ts` pass; the workbench files changed only in `viewport.ts` disposal (leak fix, §8 of the incident report) |
| Invitation, joining, collaboration | protocol, sync, rejection reasons unchanged | kept | `together.spec.ts`, `crit9-multiplayer.spec.ts` M01–M10 (two or three independent identities) pass |
| Saving and recovery | server confirmation; refresh recovery | kept | `solo.spec.ts` (survive refresh and logout), `lifecycle.spec.ts` |
| Gallery, exhibits, sharing, deep links | pages and bookmarks still work; nothing redirected to the world | kept | `exhibit.spec.ts`; `world-protection.spec.ts` (deep links: workshop, works, favorites, account, unknown exhibit) |
| Publish / withdraw / archive / trash / restore / delete | no semantic change | kept | `exhibit.spec.ts`, `lifecycle.spec.ts`; no server or schema change |
| Quality, sound, help, `/readme/` | controls preserved; world follows the same quality preference | kept | the island reads `stillwood.graphicsQuality.v1` through the existing `graphics-setting.ts`; `graphics.spec.ts` passes; `/readme/` returns 200 and renders |
| No-WebGL access | flat lists and workflows remain, with an explanation | kept | `WorldStage` renders a flat section with the existing links when WebGL is unavailable (`world-fallback`); `graphics.spec.ts` covers blocked storage; context loss: `tour.ts --stage context` |
| Server physics, protocol, schema, limits | unchanged | kept | `git diff HEAD -- src/server src/shared`: only `src/server/main.ts` (static `/world-data/` route and the `/world/` page path); no protocol, schema, room-capacity or physics change |

## Pre-existing failure (not a regression)

`crit9-reconnect.spec.ts` F3 ("the indicator follows a lost socket") failed
the same assertion before any island work ("an open socket existed",
expected 1, received 0) and still does. It is a timing measurement of the
socket close, unrelated to the island.
