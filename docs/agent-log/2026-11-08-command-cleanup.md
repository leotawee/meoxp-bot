# Prefix command cleanup (reduce chat clutter)

## [14:17] Design

- **Constraint:** Discord ephemeral only exists for interactions (slash/buttons). A prefix command reply can't be made visible only to the caller.
- **Chosen (A):** per-command `cleanup` seconds. After execute settles, delete the command message and the bot's replies whose `reference.messageId` is that message. Other bot messages (now-playing etc.) are never touched.
- **Rejected for now (C, slash ephemeral `/queue`):** ~200-line port of the pagination collector. queue/nowplaying get cleanup = 120s = their collector lifetime, so buttons die with the message anyway.
- **Rejected (B, DM replies):** fails for users with DMs closed and loses channel context.

## [14:17] TDD + implement

- **Action:** tests/messageCreate.test.ts (+2, mock.timers) red -> src/types/index.ts (`cleanup?: number`), src/events/messageCreate.ts (`cleanupCommand`) green; `cleanup` set on help, server, shell, setup(autorole), reactionrole, setupgold, tts (60s), queue, nowplaying (120s).
- **Not touched:** play/skip/stop/loop/shuffle/clear/join/leave/say*. People in voice should see who ran those.
- **Result:** typecheck 0, tests 33/33, smoke 48/0, lint: no new warnings (3 pre-existing in types/index.ts).
- **Lesson:** 📌 GENERAL: match an auto-delete timer to the lifetime of any interactive component on the message, or the UI breaks under the user.

## Summary

- Changed: types/index.ts, events/messageCreate.ts, 9 command files (+1 line each), tests/messageCreate.test.ts.
- Remaining: the bot needs ManageMessages to delete the user's command message (without it only the bot's replies are removed); not deployed yet.
