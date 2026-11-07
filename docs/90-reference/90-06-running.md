# Running and testing Stillwood

Moved from the README on 2026-11-04 (the README keeps to the course's 400–600-word guidance).

## Commands

```sh
pnpm install
pnpm build && pnpm start           # http://localhost:8080, data in ./.data
APP_URL=http://localhost:8080 pnpm check   # course invariants + HTTP/WebSocket contract specs
pnpm test:unit                     # physics fixtures, placement maths, kill/restart tests (no build needed)
pnpm test:integration              # builds, then runs suites against the production bundle
pnpm test:e2e                      # Playwright, against APP_URL (some specs need ENABLE_TEST_HOOKS=1)
```


## The island (heavy jobs)

Run world generation, tours and browser suites one at a time under the memory supervisor
([memory-incident.md](../08-world-build/08-04-memory-report.md) §7):

```sh
pnpm build:world                   # regenerate the 20 landmarks, terrain and manifest (resumes from checkpoints)
node scripts/world/supervise.ts --stage tris --budget-mib 3072 --log /tmp/sw/tris.jsonl -- \
  node scripts/world/tour.ts --stage tris --quality high --only L03,L09 --kinds ground,interior,detail,high --out /tmp/sw
```

Triangle and draw-call accounting per view is in [triangles.md](../08-world-build/08-06-render-budget-report.md); the GPU-process memory
procedure is in [memory-incident.md](../08-world-build/08-04-memory-report.md) §9.
