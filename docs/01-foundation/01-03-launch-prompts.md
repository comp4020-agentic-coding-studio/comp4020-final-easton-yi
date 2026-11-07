# Agent launch instructions

Place `docs/01-foundation/01-01-product-brief.md` and `docs/01-foundation/01-02-build-prompt.md` in the root of the existing final-project repository, then send the following prompt to the implementation agent:

```text
Implement the collaborative wooden-tower application defined in docs/01-foundation/01-01-product-brief.md in this COMP4020 final-project repository. First read docs/01-foundation/01-01-product-brief.md, docs/01-foundation/01-02-build-prompt.md, applicable repository instructions, and the actual course tests and deployment configuration in full. Then execute P0–P6 from docs/01-foundation/01-02-build-prompt.md: implement, run, inspect and correct each stage, automatically continuing after its gate passes. Do not stop at a plan or the Crit 8 minimum. Use the numbered brief rules for acceptance and maintain docs/90-reference/90-01-implementation-status.md with rule coverage and evidence. Do not weaken rules, edit shipped invariants, or substitute fake physics, fake multiplayer or browser-only persistence. Tune technical parameters using recorded measurements. If genuinely blocked, complete other available work and report the evidence and impact precisely. Preserve existing work and incremental history; never invent user feedback, tests, personal reflections or deployment results. Start P0 now.
```

## Resume after interruption

```text
Continue the current project. Re-read docs/01-foundation/01-01-product-brief.md, docs/01-foundation/01-02-build-prompt.md, applicable repository instructions and docs/implementation-status.md. Establish the current position from the actual code and latest verification evidence, then continue from the unfinished gate. Do not rebuild completed parts or treat unverified status notes as proof. Continue through the remaining stages.
```

## Stage or final audit

```text
Audit the current implementation against every numbered rule in docs/01-foundation/01-01-product-brief.md and the relevant gates in INITIAL_PROMP.md. Inspect actual code, the running application and existing evidence, then add verification for concrete remaining risks. Focus on real two-session concurrency, permission revocation, persistence after crash/restart, snapshot/exhibit isolation, 3D manipulation, keyboard and mobile use. Do not merely repeat the status file or equate green tests with product acceptance. Map omissions, deviations and unverified claims to rule IDs, fix them in impact order and recheck. Do not weaken the brief to fit the implementation. Clearly identify judgments still requiring real human use.
```
