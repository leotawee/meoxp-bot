# Relicense to plain MIT

## [14:23] LICENSE, README, package.json

- **Why:** the old LICENSE was "MIT with Additional Restrictions" (personal/non-commercial only, no modification, no derivative works, plus a Thai section repeating the restrictions). That forbids exactly what Leo wants: others lifting features into their own bots.
- **Action:** replaced LICENSE with the canonical MIT text (copyright VacTuzX 2026 kept); README License section rewritten (reuse explicitly allowed, condition = keep notice, feedback via GitHub Issues); added "license": "MIT" to package.json.
- **Rejected:** keeping a custom "MIT-like" text or a Thai summary inside LICENSE. A modified license is no longer recognized as MIT by GitHub, scanners or readers.
- **Result:** LICENSE body identical to a reference MIT file from node_modules (whitespace-normalized diff); package.json parses.
- **Lesson:** 📌 GENERAL: "MIT with restrictions" is not MIT. Use the SPDX text verbatim, or name the license as something else.

## Summary

- Changed: LICENSE, README.md (License section), package.json.
- Not changed: copies already distributed under the old terms stay under those terms; README sections that still describe the removed reaction tracker / ShoukakuManager are stale (separate fix).

## [14:28] README stale sections

- **Action:** removed the Reaction Tracker (!!rrname) docs, replaced shoukaku/ShoukakuManager.ts with moodenglink/MoodenglinkManager.ts, dropped test_tracker.ts, documented SpamGuard, command cleanup, pnpm test/smoke and the permissions they need.
- **Result:** grep finds no tracker/rrname/shoukaku/test_tracker mentions; every src/scripts/tests/dashboard path cited in README exists.
