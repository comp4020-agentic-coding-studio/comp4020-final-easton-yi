# Crit 8 — "It's alive!"

Source: [course website, C8 · Week 9](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/)

> Fetched: 2026-10-04. Re-check the live page before the crit in case it
> changes — do not silently reinterpret or weaken anything below to fit
> whatever gets implemented.

## 1. What this crit is

- **The final project starts here** — "the bar is proof of life."
- Timing: **Week 9**. Its cutoff shifts because of the week 9 public holiday
  adjustment — it moves with the rescheduled session rather than falling on
  the usual Monday. Check the actual rescheduled time/date.
- This week's crit mark evaluates **this exercise only** — it "passes no
  verdict" on the in-progress final project as a whole.

## 2. The brief (open-ended provocation)

Quoted brief: "it's alive! ship the first working version of your final
project, and a first go at saying what good means for it."

- "Proof of life" means: the app is deployed on Fly, does its **core thing**
  for a stranger, and leaves a **persistent trace**.
- Explicitly **not required yet**: the feature list, the real-time layer, and
  polish — all of that "can all wait."
- Scope guidance: start from **the smallest schema that can carry the core
  interaction** — don't over-build the data model up front.
- **Stack choice requires justification** in `PROCESS.md` — the page
  recommends a decision-record format (Cognitect's architecture decision
  records) to document the trade-offs. The stack is a reversible "first
  choice" — it can be revisited later with a new record if it's outgrown.

## 3. README requirement

The README is "the crit's real material":

- It should contain a **first version of what "good" means** for this app —
  informed by sources like "the small web, games for a handful of friends,
  and tools built for one workshop."
- Served at `/readme/` (via the shipped `invariants.test.ts` contract) so the
  pod can read it before using the app.
- Expected to be **rough initially** and evolve over the three crits; `/ship`
  tags preserve versions as process evidence.

## 4. The spec (fixed contract for grading)

Distinguish the **brief** (open-ended, above) from the **spec** (fixed,
below). Some items are mechanically checkable; others require human judgment
at the crit.

1. The app must be **deployed at its `*.fly.dev` URL** by the cutoff.
2. It must be **alive**: a stranger can visit, do the core thing, and find
   their trace still there when they come back.
3. **A first version of what good means** for this app is in `README.md` and
   published at `/readme/`, and the student can say what they read or looked
   at to get there.
4. The **repo goes public at the cutoff and stays public**. Work continues in
   this single repo for all three final-project crits.
5. The repo must **show process**:
   - Commits that grew incrementally with the work.
   - A process overview in `PROCESS.md` (including the stack-choice
     justification from §2).
   - The week's reflection in `reflections/crit-8.md`.
6. The student must be able to **account for how they directed, grounded, and
   corrected** the AI-assisted work.

No numeric deadline, rubric, or point weighting is published beyond "by the
cutoff" and the qualitative bullets above.

## 5. This repo's own check harness (from `spec/README.md`)

In addition to the published spec above, this repo's `pnpm check` runs:

- **Invariants** (`invariants.test.ts`, shipped, always on) — `/` answers
  200, and `/readme/` serves the full text of `README.md` (checked by
  heading, in order, against the rendered HTML).
- **Your spec tests** (`spec/*.test.ts`, yours to write) — turn the
  mechanically-checkable spec lines above (mainly §4.1–§4.4) into tests
  alongside the shipped ones. Test contracts (what the page must do), not
  implementation. Leave human-judgment items (§4.5, §4.6) to the crit.

Both run against the **running** app over HTTP; in CI that's the image the
`Dockerfile` builds, and a red run blocks the deploy.
