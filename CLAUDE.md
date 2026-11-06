## Process-logging harness (Ass1 feedback: process 72/100, D-band)

The Assignment 1 marker wrote: “I would've liked to know more about the process that you used to get the agent to build your website.” The previous assignment's harness records this feedback and identifies `spec/improvement.png` in that repository as its source. Do not assume that the screenshot exists at the same path in this repository.

The artefact showed that a mature agentic workflow existed, but the repository did not make that workflow sufficiently visible or verifiable. The lesson is therefore: **capture the process while it happens, then curate the strongest evidence rather than reconstructing it at the end.**

### Working process log

Keep `PROCESS_LOG.md` as a gitignored, append-only working record. It is not part of the submitted process account. For every material workflow decision, implementation problem, agent correction, or verification finding, record the following in the same sitting:

1. **Problem:** what needed to be designed, implemented, or corrected.
2. **Directed via:** the actual instruction given to the agent, quoted or closely paraphrased.
3. **First result:** what the agent produced.
4. **Shortfall:** what was inaccurate, incomplete, weak, or inconsistent, if anything.
5. **Alternative considered:** another plausible response and why it was rejected.
6. **My decision:** which choice belonged to the project author and why it was preferred.
7. **Fix and verification:** what changed, how many iterations were required, and which test, rendered page, screenshot, viewport, or multi-user observation confirmed the result before acceptance.
8. **Evidence to preserve:** the resulting commit or range, relevant `CLAUDE.md` change, curated prompt excerpt, and any useful screenshot path.

Do not invent a failure or rejected alternative when the first result was acceptable. Record that it was accepted and why. A straightforward first-pass success may remain in the working log, but it is normally weaker evidence for the final account unless it demonstrates a deliberate workflow-level decision.

Memory reconstructed later is not contemporaneous evidence. If a past event must be described from commits or diffs, label it honestly as reconstruction rather than presenting it as a live log entry.

### Curated `PROCESS.md`

`PROCESS.md` is a **900–1,100-word curated distillation**, not a copy of `PROCESS_LOG.md` and not a command transcript. Preserve the structure required by the Assignment 3 repository template, then select only three or four pivotal episodes that best demonstrate the author's direction, evaluation, correction, and systemic improvement.

Rewrite and rebalance the account as the project develops, including at the weeks 9–11 crits, rather than continually appending new entries. It must describe the project as it currently stands. The append-only history belongs in the working log; earlier submitted accounts remain traceable through the repository history.

The selected episodes should collectively include:

* at least one **workflow-design episode** showing how the agent was prepared before implementation—for example, auditing the whole assignment, translating the project's definition of good into harness rules and checks, defining source priority, or dividing implementation into reviewable stages;
* at least one **correction episode** showing where an agent result fell short, how it was evaluated, what alternative was considered, and how the final implementation changed;
* at least one **systemic improvement** encoded in `CLAUDE.md` or `spec/` so that the same failure is less likely to recur; and
* one closing **project-level structural alternative**—a different mechanic, data source, workflow, or framing considered for the build as a whole and why it was not chosen.

Assignment 3 also requires a case for the **technology stack and agent workflow**. Explain the actual options considered, why the chosen approach suited this project, and the trade-offs accepted. Integrate this reasoning into the selected episodes where appropriate rather than adding an unsupported list of technologies. Cite the decisions like any other process claim. Detailed architecture decision records may sit outside the word count and be linked from `PROCESS.md`.

Where sources informed the project's definition of good, discuss how they affected the author's position and decisions. Keep this consistent with the argument in `README.md`, the rules in `CLAUDE.md`, and the checks in `spec/`.

Compress the relevant parts of the eight-field log into readable first-person prose. Do not create eight separately labelled paragraphs for every episode. If there is no honest evidence of judgement, correction, or deliberate workflow design, do not present an ordinary attempt–accept sequence as an HD-level process episode.

Preserve the author's own reasoning and reflections. Agent assistance with organisation or editing must not turn agent-generated explanations into purported personal experience.

### Evidence

Every material claim in `PROCESS.md` must be tied to repository evidence. An uncited claim is not evidence.

Use the shortest combination that proves the point:

* quote a **curated prompt excerpt** showing the instruction given to the agent;
* link a **commit** showing one resulting change;
* use a **compare range** when the important point is the evolution from an initial implementation to a corrected one;
* include a **relative-path screenshot** when a visual comparison communicates the issue better than prose; and
* cite a `CLAUDE.md` rule change separately from the immediate code fix when the harness itself changed.

When a bug leads to a new permanent rule, identify the failure mode that the rule now prevents. This makes the systemic improvement visible rather than allowing it to disappear inside the implementation commit.

For this multi-user, real-time, persistent application, match the evidence to the claim. A screenshot can support a visual observation but cannot by itself establish synchronisation, permission enforcement, or persistence across restarts. Cite the relevant behavioural checks or recorded observations for those claims.

Distinguish automated verification from author or participant judgement, and local implementation from deployed behaviour. Do not present unperformed checks, unavailable-device testing, or pending visual review as completed verification.

For changes that are still uncommitted, cite the available working-tree files and evidence and label their status honestly. Do not fabricate commit links or commit, push, or deploy merely to satisfy this evidence requirement. Follow the author's current instructions.

Before handoff, verify mechanically that `PROCESS.md` is between 900 and 1,100 words, contains real commit or compare links, retains the sections required by the Assignment 3 template, and ends with the project-level structural alternative. Report the word count and check that the evidence links resolve.

When making room, remove repetition and move detailed logs into linked supporting records. Do not silently remove the reasoning, correction, systemic lesson, or unresolved limitation that makes an episode meaningful.
