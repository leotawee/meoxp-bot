# Land pending work: TS 6 / deps upgrade, reaction-tracker removal, status.ts

## [02:43] Review + verify before commit

- **Action:** read all uncommitted diffs (not written by this agent), ran typecheck/build/test/smoke, simulated both Dockerfiles in a scratch dir (frozen-lockfile install + next build for dashboard).
- **Why:** user pre-authorized landing everything and deploying to prod unattended; goal is "do not break prod". deploy.yml builds images BEFORE docker compose down, but dashboard/Dockerfile has no frozen-lockfile fallback, so both had to be proven.
- **Result:** typecheck 0, build 0, tests 31/31 (--test-concurrency=1 removes the TtsManager nedb race), smoke 48/0, dashboard frozen install + next build OK.
- **Lesson:** a deploy that aborts safely still fails the goal; reproduce the Docker build steps locally.

## [02:43] Bug found in pending code: cache sweepers (src/index.ts)

- **Finding:** sweeper filters return true for entries to REMOVE. `guildMembers: () => () => true` removed every member including the bot, `users` filter was inverted (swept only the bot). Verified in discord.js source: GuildMember.manageable throws GuildUncachedMe when guild.members.me is uncached; src uses members.me in 6 places (autorole, voiceStateUpdate, join, hierarchy checks); voiceStateUpdate derives channel.members from the members cache (auto-leave).
- **Impact if shipped:** about 1h after deploy autorole silently stops, voice auto-leave misjudges empty rooms, SpamGuard moderatable throws.
- **Fix:** keep the bot member and anyone in voice; users filter flipped to keep only the bot. No runtime test (config lives inside the Client constructor in index.ts). // TECH DEBT: extract the filters to src/lib to unit test.
- **Lesson:** 📌 GENERAL: read the callback contract of a "filter" API (true = keep or remove?) before trusting a config that looks right.

## Dead ends / mistakes

- Earlier claimed "typecheck broken at HEAD / CI will fail": wrong. My worktree reused node_modules with TS 6 from the user's pending upgrade; HEAD pins TS 5.9. CI later passed build-and-test.
- Two shell commands aborted because zsh treats a bare ====== as a command; avoid separators like that.

## Summary

- Changed: deps (root + dashboard), tsconfig moduleResolution bundler, scripts/smoke.ts + pnpm smoke, serialized tests, slashCommands return type, removal of reaction tracker (!!rrname, 4 files), status.ts (disk/net/swap/lavalink), index.ts sweepers fixed.
- Remaining: watch prod after deploy; runtime check of sweepers on the live bot.
