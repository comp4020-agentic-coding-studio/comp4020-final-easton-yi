Additional execution requirement: complete this task as a bounded, autonomous verification-and-repair cycle.

I have limited time and do not want repeated rounds of “please test this and report back.” Own the verification work you can perform, investigate failures, make necessary minimal fixes, and return one consolidated, evidence-backed handover.

This supplements the task above. Keep its scope and safeguards.

**1. Establish an acceptance matrix before changing code**

Create one concise report at `docs/evidence/crit-10-verification.md`.

Translate the current Crit 10 requirements into individually identifiable checks, using IDs such as C10-01, C10-02, etc. Cover:

- Two distinct authenticated identities
- Joining and editing the same shared work
- Real-time propagation between independent browser sessions
- Server-enforced membership and owner/editor permissions
- Attribution and interpretation of server logs
- Entry and invitation flow from the deployed URL
- Required reflection and process documentation
- Relevant checks and deployment verification

For each check record:

- Requirement and expected observable result
- Verification method and environment
- Actual observation
- Status: NOT RUN, PASS, FAIL or BLOCKED
- Evidence reference
- Related fix and retest, if applicable

Keep actual observations empty until the check has run. Code inspection can establish that a mechanism exists, but cannot establish that a deployed interaction passed.

Proceed without waiting for my approval of the matrix.

**2. Verify outcomes through complementary evidence**

For important behaviour, use more than one observation where practical:

- Placement: command response, attributable server log, and resulting state received by the other client.
- Permission rejection: server response and confirmation that the protected state did not change.
- User attribution: independently authenticated session identities matched to actor IDs in the relevant events.
- Deployment: the deployed revision where verifiable, health response, and the relevant deployed behaviour.

Do not treat a log saying “accepted” as sufficient proof that persistence or propagation succeeded. Do not treat a hidden button as proof of server-side authorisation.

Correlate events using actor IDs, work IDs, command IDs or other stable identifiers. Do not match concurrent events merely by line order or assume timestamps establish causality.

Use existing tests and tooling wherever suitable. Add checks only to resolve a specific uncertainty or protect a confirmed fix.

**3. Diagnose failures before repairing them**

For every failed check, distinguish among:

- Product defect
- Test or automation defect
- Environment or access limitation
- Ambiguous requirement or insufficient evidence

Record the observed symptom, the evidence supporting the diagnosis, and the resulting action.

Do not modify product behaviour merely to satisfy a faulty test. Do not weaken a valid assertion to obtain a pass.

For a confirmed defect:
1. Make the smallest relevant correction.
2. Rerun the failed check.
3. Run the directly affected regression checks.
4. Retain the original failure and link the correction and passing retest.

If the result is intermittent, record the number of attempts and outcomes. One successful retry does not erase a failure. Investigate enough to support the conclusion, or report the uncertainty explicitly.

Avoid repeated attempts without a new diagnostic reason. If progress depends on unavailable access, a destructive operation outside the authorised scope, or a decision you cannot reasonably infer, mark that item BLOCKED and continue all independent work.

**4. Keep the evidence traceable and proportionate**

Record the tested commit, whether the working tree contained uncommitted changes, environment, commands and results. Distinguish local production-mode tests from tests on Fly.

Store concise, sanitised evidence under an appropriate Crit 10 evidence directory. The main report should link to the relevant excerpts or artifacts rather than duplicate large logs.

Never commit credentials, session material or unrelated personal data. Clearly label shortened or redacted excerpts.

Maintain the chain:

requirement → check → observation → diagnosis, if needed → change → retest → final conclusion

If code changes after a check, rerun affected checks or explicitly state which revision the earlier evidence covers. Do not present evidence from an earlier build as verification of changed behaviour.

**5. Finish with an evidence audit**

Before declaring completion, review the matrix against the underlying evidence:

- Does every PASS have a recorded observation and usable evidence reference?
- Was the expected outcome checked, rather than merely the absence of an exception?
- Are automated, local, deployed and human-session results clearly separated?
- Are unresolved failures and blocked checks visible?
- Do documentation claims agree with the verified state?
- Are commit links, file links and commands correct?
- Does the reflection describe work that actually occurred?

Use this audit to catch unsupported claims; do not merely repeat the completion summary.

Do not require me to repeat checks you successfully performed. The live crit with classmates remains a separate human activity and must not be claimed as completed by automation.

**6. Document the working method without overstating it**

If this workflow is actually used, briefly explain it in `PROCESS.md`, supported by the report and relevant commits:

- I defined acceptance criteria and the boundaries of autonomous work.
- The agent performed verification and classified failures before changing code.
- Changes were checked against observable outcomes.
- A final evidence audit separated verified results from remaining uncertainty.

Present this as a practical development in how the agent was directed and evaluated. Do not claim that self-checking guarantees correctness, removes the need for human judgement, or proved more efficient unless there is evidence for that comparison.

The reflection may draw on this experience where it fits the two required prompts, while remaining a draft of my personal interpretation.

**7. Give one consolidated handover**

Finish with a concise Chinese report containing:

1. Overall verdict: ready for the live Crit 10 demonstration, or not ready, with the specific reason.
2. The completed acceptance matrix, with evidence links.
3. Confirmed defects, minimal fixes and retest results.
4. Commit, push and deployment status.
5. The complete English reflection draft.
6. Only the remaining actions that genuinely require me.

Distinguish “all automatable checks completed” from “all checks passed.” Do not hide blockers behind an overall completion statement.

The goal is an auditable result I can review once, rather than a sequence of small iterations that depend on me manually checking each change.