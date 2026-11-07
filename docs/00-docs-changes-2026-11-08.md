# Documentation changes, 2026-11-08

A separately dated record of the documentation changed by the 2026-11-08 retest (multiplayer M02 and
world-protection). It follows [the 2026-11-07 record](00-docs-changes-2026-11-07.md), which is unchanged and describes
the earlier state; the original restructuring records ([`00-package-checks.md`](00-package-checks.md),
[`00-path-map.json`](00-path-map.json), [`00-file-index.md`](00-file-index.md)) are unchanged too. "Before" hashes
below are the files as left by the 2026-11-07 retest.

**Counts.** Before: 337 docs files. After: 343: 5 evidence files and this record added;
4 files updated by dated additions only; nothing renamed, moved or removed. `PROCESS.md` and `reflections/`
are outside `docs/` and unchanged.

**State recorded.** Base `fa23e6a` plus an uncommitted working tree, identity `bffd3efde05750d7` for the M02 and world-protection retests, and
`2f2efa861930ee27` for the gated final tree after the "View player works" fix (06-034); afterwards only
documentation and `spec/README.md` text changed (final identity `9ae5d87cc502a971`)
([06-033](06-verification/evidence/06-033-retest-2026-11-08-gate.txt)). Earlier evidence (06-020 to 06-029) describes
the 2026-11-07 tree and is kept as it was.

| File | Change | SHA-256 before | SHA-256 after | Reason |
| --- | --- | --- | --- | --- |
| `docs/06-verification/06-02-audit-report.md` | updated | `04f4fd809f5981659f6cbae962f42e2d454d34b63da1038b03a72f861530eb88` | `3aa02bd85c81460ae1eea28c82d9a17f457c45389389f9bc4f34657996bb96d6` | Appended the dated 2026-11-08 addendum (M02, the five tests it blocked, world-protection, gate, "View player works" reconciliation and later fix); dated notes on the 2026-11-07 "View player works" row. Earlier text unchanged. |
| `docs/05-multiplayer/05-02-test-report.md` | updated | `c15dee5f3d072dd8216cfd2bf4d34dc6e0d2920bed32ceff55aca6fd08a124e4` | `2d3bcbc5817db46963cb903110951a8cdec3bd874ed4fb4cb46c7e989b9d3bad` | Dated 2026-11-08 notes on finding F2 and its row in the follow-up table. |
| `docs/90-reference/90-04-world-status.md` | updated | `7f26fc48381f441e49a25abe667d9b933f0f6782eae00980256dd0a9155f0c93` | `8e2ccc64c9ac638c7fe9877ea28ae1d56d34dd27133f0cd953f5cf8a9223de89` | Dated 2026-11-08 notes on the §11 fallback row and the "View player works" row (reconciliation, then the fix). |
| `docs/08-world-build/08-07-protection-matrix.md` | updated | `98b0fff8df611607ef071e47828b5a6d1d59da8e3f61d081fa1cbe247b0ea36b` | `206c9b91f372d1dbd5a923b30eaea3cc2cb9d83ac57579a9812621a0b2fe72b9` | Dated 2026-11-08 note on the 'Invitation, joining, collaboration' row. |
| `docs/06-verification/evidence/06-030-retest-2026-11-08-m02-diagnosis.txt` | added | — | `6b1cc0a401e00dacdf1569d5d85d21b0133ac2716eb0a15f8bea2620ee769926` | Curated 2026-11-08 retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-031-retest-2026-11-08-m02-place-transitions.json` | added | — | `d0730bdd995ce40db7d0fd78e0c71e32ac5678e09343cb081fd81415b5a73b6d` | Curated 2026-11-08 retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-032-retest-2026-11-08-world-protection.txt` | added | — | `ddf001738afaaeb1c24a5a00ef4db8f259e1a741ebd00feacd79109786801a48` | Curated 2026-11-08 retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-033-retest-2026-11-08-gate.txt` | added | — | `725bfc7287a16d85d6e50b27cb30d1b37b29bda6cb250051e8f499ca76abf5ad` | Curated 2026-11-08 retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-034-retest-2026-11-08-view-player-works.txt` | added | — | `84d331c241ab7f6b4c1897f49ca6eaef9a4a133476b55ed9cf9ebe9b8b998023` | Curated 2026-11-08 retest evidence, linked from the 06-02 addendum. |
