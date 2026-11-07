# Documentation changes, 2026-11-07

A separately dated record of the documentation changed by the 2026-11-07 final-fixes retest. It sits beside the
earlier records and does not replace them. [`00-package-checks.md`](00-package-checks.md),
[`00-path-map.json`](00-path-map.json) and [`00-file-index.md`](00-file-index.md) are unchanged: they describe the
documentation as it was restructured, not as it is now. Where a file below is marked "updated", its earlier hash in
those records is historical.

**Counts.** Before this retest: 326 files under `docs/` (the earlier inventory's 326, including its 17
logs). After: 337 files: 10 retest evidence files and this record added; 7 files updated by
dated additions; nothing renamed, moved or removed. `PROCESS.md` and `reflections/` are outside `docs/` and were not
changed.

**How the changes were made.** Every update appends dated text that names the retest and links its record; no earlier
wording, result or log was edited or removed. Ordinary test runs no longer write into `docs/`: the hashes of all docs
files were identical before and after the full test gate, and these changes were made deliberately afterwards. The
tested code is uncommitted on top of `fa23e6a`; its identity is in
[06-020](06-verification/evidence/06-020-retest-2026-11-07-gate.txt).

| File | Change | SHA-256 before | SHA-256 after | Reason |
| --- | --- | --- | --- | --- |
| `docs/05-multiplayer/05-02-test-report.md` | updated | `099178973e1df87fc4480c7bef6ff1bd46fbad7e4a698ed8c00527e3e4144a00` | `c15dee5f3d072dd8216cfd2bf4d34dc6e0d2920bed32ceff55aca6fd08a124e4` | Dated note after the §H reproduction commands, because `scripts/crit9/run.sh` now writes to `test-results/` by default; the commands as run are kept. |
| `docs/06-verification/06-02-audit-report.md` | updated | `c6db84d07ed41a6938711f3bf875ef696d64a8067e4cb4c36950041274e861b0` | `04f4fd809f5981659f6cbae962f42e2d454d34b63da1038b03a72f861530eb88` | Appended the dated retest addendum (52 lines added, none changed): the README's entry point for verification records. |
| `docs/08-world-build/08-07-protection-matrix.md` | updated | `59ee6faed3f8dcf084485fde5177411a52356c4de73ac915aa64f1ebf3c491f6` | `98b0fff8df611607ef071e47828b5a6d1d59da8e3f61d081fa1cbe247b0ea36b` | Dated note appended to the 'Spatial portals' row; dated retest note after 'Pre-existing failure'. |
| `docs/10-day-night/10-02-courtyard-report.md` | updated | `cb00913876b3c93250924f2b06cd04ad9e5b1ef2bfaf2ebcd1881e25504efe04` | `d74c5eeede0cdd9d8f21217cf151afc62dee9f55367ee2441633f6cf63a5ebef` | Dated retest note appended to 'Found and not fixed (pre-existing)'; the original table is unchanged. |
| `docs/90-reference/90-01-implementation-status.md` | updated | `018f53e685f9208f65f412bb26b7b191ad2884892429bbb27185fe579cc797b2` | `130343442593e147bb0a7740082d39f749255316e3f46f92d929bb587ade63f9` | Dated retest pointer after 'Next action'; dated notes appended to the WORLD-04 row and the `pnpm check` instability bullet. No earlier text removed. |
| `docs/90-reference/90-04-world-status.md` | updated | `5f53503a89599c1d584bbe60ef24f1f23c2fe34b65674ad1607f6bb3f392646a` | `7f26fc48381f441e49a25abe667d9b933f0f6782eae00980256dd0a9155f0c93` | Dated notes appended to the portal (§3.1) and safe-point (§6) rows and the 'Pre-existing, found here and not fixed' paragraph; a dated deployment clarification after the header; a dated retest section at the end. No earlier text removed. |
| `docs/90-reference/90-06-running.md` | updated | `25201d80055870efb3f66309600dbf17f5d998ee84acf2f02c8981ef333d0703` | `89bbd8914f2e879183ba594f5111ac6cd5a58520070265f64959d4d1cbfaae0f` | Dated test-running notes (scratch data, `test-results/`, reconnect method A, link to spec/README.md) after the command block. |
| `docs/06-verification/evidence/06-020-retest-2026-11-07-gate.txt` | added | — | `4618223d165088b57f1c58241dce8251ec00bd1564cee7db6737f1617a83f034` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-021-retest-2026-11-07-versions-rate-limit.txt` | added | — | `23904e191478717c65beff03f2628d6bf85a206921924060c1439baf28e7516d` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-022-retest-2026-11-07-reconnect-host.json` | added | — | `733c10fca4464a7e57eb6007cf69e3f77ee11551e13c73b21459d0aceae6a514` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-023-retest-2026-11-07-reconnect-netns.json` | added | — | `38652988bd88048c8e23ace427be43978d74923420a01689f713fe3495e1b38b` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-024-retest-2026-11-07-world-flows-and-limits.txt` | added | — | `fe0de9d0d594a19ac24556458034a502a175f025327358b532e56fde6cb03dfa` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-025-retest-2026-11-07-phone-390x844-touch.png` | added | — | `9286a2399fca9b69d9f417d51738264c644f43fc829bc8c5933f36eeecb0ffc8` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-026-retest-2026-11-07-phone-390x844-menu-signed-in.png` | added | — | `5441b4030545a6e08d0b941229c421b88cb99a899f81a26aadede7fefba22288` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-027-retest-2026-11-07-tablet-1024x768-touch.png` | added | — | `d504566ab50122341218afd88d4992bfba4d3e88f47af765ce0f05321a62f3da` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-028-retest-2026-11-07-laptop-1024x768-mouse.png` | added | — | `0f0fa070735214d236f5883543e44e04b13c76c4fb153ef3260c3af21f0cb27f` | Curated retest evidence, linked from the 06-02 addendum. |
| `docs/06-verification/evidence/06-029-retest-2026-11-07-matrix-and-desktop.txt` | added | — | `f13a6e76a71b83dd67087f46895a90318149c32e5b7dd2500f599473cb80f73e` | Curated retest evidence, linked from the 06-02 addendum. |
