# Package verification: preserved-master reconstruction

Prepared on 7 November 2026. The author's pasted PROCESS and uploaded reading map are the master versions. The reading map is byte-identical to its uploaded file. PROCESS retains the supplied wording, sections and citations, with pasted Markdown escaping and malformed nested link syntax normalized only.

## Inventory and coverage

| Category | Files | Check |
| --- | ---: | --- |
| Original docs.zip files | 298 | One numbered destination per original; unique paths; all source/target hashes recorded |
| Recovered/derived material plus reading map | 13 | Listed with hashes in `00-path-map.json` |
| File index, path map and this verification | 3 | `00-file-index.md`, `00-path-map.json`, `00-package-checks.md` |
| English compatibility pointers | 12 | Exactly the audited old Markdown references outside replaced PROCESS |
| **Total docs files** | **326** | No original omitted; no padding files |
| Root PROCESS | 1 | Outside docs count; author-selected version |

Of the original files, 273 preserve their bytes and 25 change: 24 Markdown files receive path/filename corrections, and one component ZIP receives translations. The separate handoff `00-content-changes.md` contains exact original/replacement text. It is not part of the 326-file docs tree.

Locked reading-map SHA-256: `a97b79932d671e7cb999ec234cb66121f6cf7a1ae5ef84028791e0aa7b6aab4e`.

Locked PROCESS SHA-256: `9e5bb4321ea760dee1c681f0396833afe176fe050b2c7d95a0e2fa88e591c4b0`.

The complete earlier ZIP was not recovered. This edition reconstructs its documented structure from the two saved masters, the original ZIP and recovered sources. A matching count does not prove byte identity with that lost archive. Names explicitly stated in the masters are followed exactly; remaining numbered evidence names and compatibility-file prose are reconstructed and disclosed in the complete index.

## Link and source audit

The generated-tree scan resolved **246 local Markdown link occurrences** in existing files, with **zero missing internal targets** and **zero unresolved scanned Markdown anchors**. Historical browser error snapshots are retained as raw evidence and excluded from live-link interpretation. Code strings, inline file mentions and raw logs are not counted as Markdown links. This report contains no additional local Markdown links, so its final write does not alter that count.

A further **14 occurrences** point outside docs to repository source, tests, reflections or assets; all target paths exist in the pinned `be91ad1` repository tree. No external website availability check or fresh test run is implied.

A read-only reference audit fetched **173 non-docs text files** at `be91ad112666a641bacc70221b312b0079010dde`, covering source, scripts, tests, root documentation, reflections and relevant configuration. Excluding the replaced root PROCESS, the twelve unique concrete Markdown references under docs exactly match the compatibility entries below. Runtime evidence outputs are intentionally left at their original paths; their future output is distinct from the numbered historical snapshots.

| Retained old path | Numbered target |
| --- | --- |
| `docs/adr/0001-stack.md` | `docs/01-foundation/01-04-adr-0001-stack.md` |
| `docs/measurements.md` | `docs/90-reference/90-02-measurements.md` |
| `docs/evidence/world/protection-matrix.md` | `docs/08-world-build/08-07-protection-matrix.md` |
| `docs/evidence/world/requirements-status.md` | `docs/90-reference/90-04-world-status.md` |
| `docs/running.md` | `docs/90-reference/90-06-running.md` |
| `docs/evidence/crit-10-verification.md` | `docs/06-verification/06-02-audit-report.md` |
| `docs/evidence/world/memory-incident.md` | `docs/08-world-build/08-04-memory-report.md` |
| `docs/evidence/world/triangles.md` | `docs/08-world-build/08-06-render-budget-report.md` |
| `docs/runbook.md` | `docs/90-reference/90-07-runbook.md` |
| `docs/evidence/world/candles.md` | `docs/10-day-night/10-03-candle-report.md` |
| `docs/evidence/world/courtyard.md` | `docs/10-day-night/10-02-courtyard-report.md` |
| `docs/evidence/crit-9-local-multiplayer-report.md` | `docs/05-multiplayer/05-02-test-report.md` |

No application-code, README, reflection, test or generator edits are required for those existing document references. Newer local references must still be checked by the user's agent; the audit is pinned to one commit, not a guarantee about a later working tree.

## Translation and source integrity

The complete world-design plan retains all nineteen sections and all source Markdown link destinations in their original order. It is translated, not summarized. No Chinese remains in the delivered narrative/text files or decoded text members of the translated component archive.

The component archive retains all 71 member names and their ordering. Only `VALIDATION.md`, `finish_lab.py` and `review.html` change for English prose/labels; the other 68 entries have identical uncompressed bytes. Geometry, measurements and physics results were not regenerated. The standalone component study reproduces the translated VALIDATION for convenient reading.

All four recovered `.txt` execution transcripts are byte-identical to the saved originals. Their clipped/repeated lines and old paths are historical evidence and remain unchanged. Source identities and version records are in `99-history/99-02-recovered-sources.md`.

## Preserved-master caveats

- The reading map calls the repository account-deletion file an implementation-adapted version. The accessible recovered English directive and original ZIP file differ only in their first heading; substantive implementation-specific differences were not established. Both files are retained as the master requires.
- The map's `in_progress` workflow observation is its historical check, not a new statement of current CI state. The commit itself was confirmed read-only; deployment was not checked.
- Earlier reports' uncommitted/undeployed wording is preserved as historical text. The author's PROCESS identifies the later `be91ad1` commit; committing, deploying and independently evaluating are different claims.
- The map's retrospective editorial judgements remain the supplied author's account. They are not expanded into new participant evidence or acceptance of every view/device.
- Root PROCESS and the reading map were not rewritten to conceal these distinctions. This verification records the current reconstruction's evidence and limits separately.

No application tests, browser tours, physics experiments, builds or deployment were run for this reconstruction. No GitHub writes, commits or pushes were performed. The local agent should validate its actual resulting tree and any merge exceptions before producing the review ZIP.
