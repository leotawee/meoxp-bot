# SpamGuard — timeout hacked accounts posting image spam

## [01:37] Design + TDD + implement

- **Action:** read messageCreate.ts, tests/messageCreate.test.ts, .env.example; wrote tests/SpamGuard.test.ts (red), src/lib/SpamGuard.ts (green 7/7); hooked src/events/messageCreate.ts; updated messageCreate test fake (id, channel, attachments); appended .env.example.
- **Why:** bot cannot know an account is hacked, only behavior: >=4 images in >=2 channels within 60s, window keyed by userId across guilds. Staff with ManageMessages exempt. Timeout 1h.
- **Rejected:** face recognition of MrBeast (heavy, unreliable, new dependency); image hashing via CDN download (outbound request, Hard Stop, not needed for v1); per-guild nedb config (extra files).
- **Result:** typecheck 0 errors; lint clean on touched files; tests 31 pass / 1 fail.
- **Lesson:** detect behavior, not identity; test fakes must mirror the real object when handler starts reading new fields.

## Dead ends / findings

- messageCreate handler read message.channel.id before guard -> existing fake had no channel -> fixed the fake, not prod code.
- 1 failing test is tests/TtsManager.test.ts (nedb ENOENT rename ttsSettings.db~). Reproduced with tracked changes stashed -> pre-existing, not touched.
- scripts/smoke.ts is untracked and not created by this task (mtime 01:35); left alone.

## Summary

- Changed: src/lib/SpamGuard.ts (new), src/events/messageCreate.ts, tests/SpamGuard.test.ts (new), tests/messageCreate.test.ts, .env.example.
- Remaining: run with SPAM_GUARD_DRY_RUN=1 first; grant bot ModerateMembers + ManageMessages and a role above members; no test for punish() (Discord API calls).

## [01:55] Smoke test + commit

- **Action:** ran `node --import tsx scripts/smoke.ts` (user's untracked script; read first, local-only 127.0.0.1:4599).
- **Result:** 48 passed, 0 failed. Unit tests still 31 pass / 1 fail (pre-existing TtsManager nedb race, unrelated).
- **Decision:** on main, repo history is PR-based -> branch feat/spam-guard, commit only task files (scripts/smoke.ts and user's other working-tree edits left out), push the branch, no push to main.
- **Lesson:** stage by explicit path when the tree holds unrelated edits.
