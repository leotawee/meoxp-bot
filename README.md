# MeoXP Bot

MeoXP Bot is a TypeScript Discord bot built around three main pieces:

- a Lavalink-backed music and TTS bot
- reaction roles, auto roles, and SpamGuard moderation for server setup workflows
- a public read-only dashboard for status and queue visibility

The repository contains the Discord bot, the HTTP and Socket.IO API used by the dashboard, the Next.js dashboard itself, and the Docker and deployment files used to run both services in production.

If you contribute to this repository, use feature branches and pull requests. After `pnpm install`, the repo configures a local `pre-push` hook that blocks direct pushes to `main` and `master` and blocks non-fast-forward pushes by default. This reduces accidental destructive pushes in a prepared clone, but GitHub rulesets or branch protection remain the authoritative enforcement. See `CONTRIBUTING.md`.

## What the project currently includes

- Music playback through Discord voice channels using `discord.js`, `moodenglink`, and an external Lavalink node
- YouTube search-based playback and direct URL playback through Lavalink
- Queue management with loop modes, shuffle, clear, and interactive control panels
- Persistent join mode with automatic voice-channel cleanup when the bot is left alone
- Thai and English text-to-speech commands
- Reaction Role mappings stored on disk with automatic role assignment on reaction add
- SpamGuard: times out accounts that look hacked (the same multi-image post blasted across channels)
- Selected prefix commands delete themselves and the bot's replies after a delay to keep chat clean
- A public Next.js dashboard that shows bot status, Lavalink state, high-level usage metrics, and active queues
- A small public API and Socket.IO feed for dashboard data
- Dockerfiles for the bot and dashboard, plus a Compose file for running both together
- GitHub Actions deployment that builds on push and deploys through Tailscale and SSH

## Feature notes

### Music and voice

- Prefix is fixed to `!!`
- The bot requires an external Lavalink server
- Non-URL searches are sent as `ytsearch:` queries, so text search is YouTube-based
- Direct URLs are resolved by Lavalink and depend on the sources enabled on the Lavalink side
- Queue state is in memory only and is cleared on restart
- `!!join` enables persistent voice mode for that guild until `!!leave` is used
- Without persistent mode, the bot leaves after 5 seconds if no non-bot users remain in the voice channel

### Reaction Role

- Managed by `!!rr`
- Mappings are persisted in `data/reactionRoles.db`
- Role assignment happens on reaction add
- Role removal on unreact is intentionally not implemented
- Custom emoji are stored by ID; Unicode emoji are stored as text

### SpamGuard

- Lives in `src/lib/SpamGuard.ts`, hooked from `src/events/messageCreate.ts`
- Flags a user who posts 4 or more images in 2 or more channels within 60 seconds. The window is tracked per user across all guilds the bot is in
- Deletes the flagged messages and times the user out for 1 hour in every guild the bot shares with them
- Skips members with `Manage Messages` and members the bot cannot moderate
- `SPAM_GUARD_DRY_RUN=1` only logs, and `SPAM_LOG_CHANNEL_ID` posts each result to a mod channel
- The window is in memory and resets on restart

### Command cleanup

- A command with `cleanup: <seconds>` deletes its own message and the bot's replies to it that many seconds after it finishes
- Set on `help`, `server`, `shell`, `setup`, `reactionrole`, `setupgold`, and `tts` (60s), and on `queue` and `nowplaying` (120s, matching their button lifetime)
- Deleting the user's command message needs `Manage Messages`. Without it only the bot's replies are removed

### Dashboard

- Public and read-only
- No login or OAuth flow
- Reads the bot API from `BOT_API_URL` on the server side
- Uses `NEXT_PUBLIC_BOT_API_URL` for browser polling and Socket.IO updates
- Shows bot online status, Lavalink status, uptime, ping, guild count, user reach, and active queue summaries

## Prerequisites

- Node.js 24 or newer
- pnpm
- A Discord bot application and token
- A reachable Lavalink server
- Docker and Docker Compose if you want to run the provided container flow

## Environment and configuration

The bot reads its runtime configuration from environment variables. There is no root `.env.example` file in the repository at the moment, so create a root `.env` manually.

### Bot environment

Required:

```env
TOKEN=your_discord_bot_token
OWNER_ID=your_discord_user_id
LAVALINK_URL=your-lavalink-host:2333
LAVALINK_PASSWORD=your_lavalink_password
```

Optional, used by `wait-for-lavalink.js` in the bot container:

```env
LAVALINK_HOST=lavalink
LAVALINK_PORT=2333
```

Lavalink-side (set in the Lavalink server's environment, not the bot's), used by the provided `lavalink/application.yml`:

```env
# Required — must match the bot's LAVALINK_PASSWORD
LAVALINK_SERVER_PASSWORD=your_lavalink_password
# Required for YouTube playback via OAuth. The config uses a `${VAR:}` empty
# fallback, so if this is unset Lavalink still starts and looks healthy but
# YouTube playback fails at runtime.
YOUTUBE_OAUTH_REFRESH_TOKEN=your_youtube_oauth_refresh_token
```

Required only for the `/posttrack` slash command:

```env
THAILAND_POST_TOKEN=your_thailand_post_track_api_token
```

Notes:

- `TOKEN` is required by `src/index.ts`
- `OWNER_ID` is used by the owner-only commands: `!!status`, `!!purge`, and `!!shell`
- `LAVALINK_URL` and `LAVALINK_PASSWORD` are required by `src/lib/MoodenglinkManager.ts`
- `SPAM_GUARD_DRY_RUN` and `SPAM_LOG_CHANNEL_ID` are optional SpamGuard settings
- `THAILAND_POST_TOKEN` must be created in the Thailand Post developer portal and must never be committed
- If you use the provided `lavalink/application.yml`, its `LAVALINK_SERVER_PASSWORD` must match the bot's `LAVALINK_PASSWORD`

### Dashboard environment

The dashboard package includes `dashboard/.env.example`:

```env
BOT_API_URL=http://localhost:4000
NEXT_PUBLIC_BOT_API_URL=http://localhost:4000
```

Use:

- `BOT_API_URL` for server-side data fetching in Next.js
- `NEXT_PUBLIC_BOT_API_URL` for browser-side polling and Socket.IO connections

In production, `NEXT_PUBLIC_BOT_API_URL` must be reachable from the user's browser, not just from the container network.

## Installation and local development

### Bot

Install dependencies:

```bash
pnpm install
```

Run in development mode:

```bash
pnpm dev
```

Build and run the compiled bot:

```bash
pnpm build
pnpm start
```

The bot also starts an HTTP and Socket.IO API on port `4000`.

### Dashboard

The dashboard is a separate Next.js app under `dashboard/`.

Install dependencies:

```bash
cd dashboard
pnpm install
```

Run in development mode:

```bash
BOT_API_URL=http://localhost:4000 \
NEXT_PUBLIC_BOT_API_URL=http://localhost:4000 \
pnpm dev
```

Build locally:

```bash
pnpm build
```

The repository's dashboard Docker image uses Next.js standalone output. The local `pnpm start` script still runs `next start`, which is fine for simple local checks, but the container image runs `node server.js` from the standalone build.

## Docker and Compose

### Bot image

The root `Dockerfile`:

- installs dependencies
- builds the TypeScript bot
- prunes dev dependencies
- waits for Lavalink with `wait-for-lavalink.js`
- starts `dist/index.js`

### Dashboard image

`dashboard/Dockerfile`:

- installs dashboard dependencies
- builds a standalone Next.js app
- runs the generated standalone server on port `3000`

### Compose flow

The provided `docker-compose.yml` starts:

- `discord-bot`
- `dashboard`

Important behavior:

- the bot service expects a root `.env`
- the dashboard service points `BOT_API_URL` to `http://discord-bot:4000`
- the dashboard build arg currently sets `NEXT_PUBLIC_BOT_API_URL` to `https://botapi.meo.in.th`
- the Compose file expects an external Docker network named `lavalink_lavalink-net`
- the bot service exposes port `4000` for the API
- the dashboard service exposes port `3001` on the host

Start both services:

```bash
docker compose up -d --build
```

Operational note:

- the Compose file also includes a `4444:80` mapping on the bot container, but the current bot code itself serves its API on port `4000`

## Commands

Prefix: `!!`

### Slash commands

| Command | Access | What it does |
| --- | --- | --- |
| `/posttrack tracking:<number>` | Everyone | Shows the latest Thailand Post status and five recent events ephemerally |

### General

| Command | Aliases | Access | What it does |
| --- | --- | --- | --- |
| `!!help` | `h`, `?` | Everyone | Opens the category-based help menu |

### Music and playback

| Command | Aliases | Access | What it does |
| --- | --- | --- | --- |
| `!!play <query-or-url>` | `p` | Everyone | Searches YouTube or resolves a direct URL and adds it to the queue |
| `!!nowplaying` | `np` | Everyone | Shows the current track with interactive controls |
| `!!queue` | `q` | Everyone | Shows the queue with pagination and queue buttons |
| `!!panel` | `control`, `c` | Everyone | Opens a compact music control panel |
| `!!skip` | `s`, `next` | Everyone | Skips the current track |
| `!!stop` | `pause` | Everyone | Pauses playback |
| `!!resume` | `unpause`, `r` | Everyone | Resumes playback |
| `!!loop` | `l` | Everyone | Cycles loop mode: off, song, queue |
| `!!shuffle` | `random`, `mix` | Everyone | Shuffles queued tracks |
| `!!clear` | `clearqueue`, `cq`, `cls` | Everyone | Clears queued tracks |
| `!!join` | `j`, `connect` | Everyone | Joins the caller's voice channel and stays there until `!!leave` |
| `!!leave` | `disconnect`, `dc` | Everyone | Leaves voice and destroys the guild queue |

Music notes:

- `!!play` requires the user to already be in a voice channel
- Text search uses YouTube search
- Playlist import is capped in code at 500 tracks, but actual playlist size can also be limited by the Lavalink configuration
- `!!nowplaying`, `!!queue`, and `!!panel` expose button-based controls

Examples:

```text
!!play never gonna give you up
!!play https://www.youtube.com/watch?v=dQw4w9WgXcQ
!!queue
!!panel
!!join
!!leave
```

### Text-to-speech

| Command | Aliases | Access | What it does |
| --- | --- | --- | --- |
| `!!say <text>` | `tts`, `speak` | Everyone | Plays Thai TTS in the caller's voice channel |
| `!!saye <text>` | `ttse`, `speake` | Everyone | Plays English TTS in the caller's voice channel |

TTS notes:

- The caller must already be in a voice channel
- Text is limited to 200 characters
- Lavalink must be connected

Examples:

```text
!!say <thai-text>
!!saye Hello everyone
```

### Reaction Role

Primary command: `!!rr`

| Command | Access | What it does |
| --- | --- | --- |
| `!!rr add <messageId> <emoji> <@role>` | Administrator | Maps an emoji on a message to a Discord role |
| `!!rr remove <messageId> <emoji>` | Administrator | Removes a stored role mapping |
| `!!rr list` | Administrator | Lists stored role mappings for the guild |

Behavior:

- Run the command in the same text channel as the watched message
- The bot attempts to react to the watched message during setup to validate the emoji
- The bot must have `Manage Roles`, and its highest role must be above the target role
- Unreacting does not remove the role

Examples:

```text
!!rr add 123456789012345678 <emoji> @Members
!!rr remove 123456789012345678 <emoji>
!!rr list
```

### Owner-only administration

| Command | Aliases | Access | What it does |
| --- | --- | --- | --- |
| `!!purge <1-100>` | `delete` | `OWNER_ID` only | Bulk deletes up to 100 recent messages |
| `!!status` | `server`, `sysinfo`, `sys` | `OWNER_ID` only | Shows host CPU, RAM, disk, uptime, and bot runtime stats |
| `!!shell <command>` | `exec`, `sh` | `OWNER_ID` only | Executes a shell command on the bot host |

Owner command notes:

- `!!purge` is limited by Discord bulk delete rules for old messages
- `!!shell` executes directly on the host process and should be treated as highly sensitive

Examples:

```text
!!purge 25
!!status
!!shell pm2 status
```

## Dashboard and API

The bot starts an Express and Socket.IO server on port `4000`.

Current public endpoints:

- `GET /api/health`
- `GET /api/status`
- `GET /api/stats`
- `GET /api/queues`
- `GET /api/queue/:guildId`

The current dashboard uses:

- `/api/status`
- `/api/stats`
- `/api/queues`
- Socket.IO `guildUpdate` events

The dashboard is intentionally public and read-only. It does not expose bot control actions, Discord login, or write endpoints.

## Configuration and customization

The following pieces are safe and expected to be customized:

- bot token and owner ID in the root `.env`
- Lavalink host, password, and startup wait host/port
- Lavalink server settings in `lavalink/application.yml`
- dashboard API URLs in `dashboard/.env.example` or real environment files
- emoji-to-role mappings configured at runtime with `!!rr`
- watched message IDs and target role IDs managed through Discord commands
- SpamGuard thresholds in `src/lib/SpamGuard.ts` (`createSpamGuard` options) and its env switches
- per-command `cleanup` delay in each file under `src/commands/`
- deployment host, SSH, and Tailscale secrets used by GitHub Actions
- Compose build arg `NEXT_PUBLIC_BOT_API_URL`

Current fixed values in code:

- command prefix is `!!`
- bot API port is `4000`
- dashboard container port is `3000`, mapped to host `3001` in Compose

## Deployment and operations

### GitHub Actions

The repository includes `.github/workflows/deploy.yml`.

Trigger:

- pull requests targeting `main` or `master`
- push to `main`
- manual `workflow_dispatch` from `main`

Current pipeline behavior:

1. `build-and-test`
   - checks out the repository
   - sets up Node.js 24 and pnpm
   - runs `pnpm install --no-frozen-lockfile`
   - runs `pnpm run build`
   - runs for pull requests into `main` or `master`, and for pushes to `main`

2. `deploy`
   - runs only for `push` to `main` or manual dispatch from `main`
   - connects to the Tailscale tailnet using `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`
   - SSHes to the deployment host
   - runs `git pull origin main`
   - exports a fixed image tag `TAG=meoxpbot`
   - runs `docker compose build`
   - stops and removes existing project containers by label
   - runs `docker compose up -d --force-recreate --build`
   - prunes dangling project images by label

Important limitation:

- the GitHub Actions build step currently validates the root bot build only
- the dashboard is built during Docker deployment rather than in the CI build job

### Tag and container strategy

The current Compose and workflow setup use:

- `meoxp-bot:${TAG:-meoxpbot}`
- `meoxp-dashboard:${TAG:-meoxpbot}`

The workflow fixes `TAG=meoxpbot` during deployment and relies on labels to stop and remove old containers safely.

## Project structure

```text
.
+-- src/
|   +-- commands/                Discord text commands
|   +-- events/                  Discord event handlers
|   +-- lib/                     Lavalink, TTS, reaction/auto role, SpamGuard, and tracking logic
|   +-- types/                   Shared TypeScript types
|   +-- api.ts                   Public bot API and Socket.IO server
|   '-- index.ts                 Bot entry point
+-- dashboard/
|   +-- src/app/                 Next.js app routes and dashboard page
|   +-- src/components/ui/       Dashboard UI primitives
|   +-- Dockerfile               Dashboard production image
|   '-- .env.example             Dashboard environment template
+-- lavalink/
|   '-- application.yml          Example Lavalink configuration
+-- .githooks/
|   '-- pre-push                Local safeguard against direct protected-branch pushes and non-fast-forward updates
+-- Dockerfile                   Bot production image
+-- docker-compose.yml           Multi-service local and production Compose file
+-- scripts/
|   +-- install-git-hooks.mjs   Configures core.hooksPath for this clone
|   '-- smoke.ts                Imports every module and boots the API (`pnpm smoke`)
+-- tests/                       Unit tests (`pnpm test`)
+-- wait-for-lavalink.js         Container startup wait script for the bot
'-- .github/workflows/deploy.yml Deployment workflow
```

## Safety and operational notes

- The bot enables these Discord intents: `Guilds`, `GuildMembers`, `GuildMessages`, `GuildVoiceStates`, `MessageContent`, and `GuildMessageReactions`
- The bot also enables partials for channels, messages, reactions, users, and guild members
- Recommended Discord permissions:
  - View Channels
  - Send Messages
  - Embed Links
  - Read Message History
  - Add Reactions
  - Connect
  - Speak
  - Manage Roles if you use `!!rr` or auto roles
  - Manage Messages for `!!purge`, SpamGuard, and command cleanup
  - Moderate Members for SpamGuard timeouts
- Queue data is in memory and will not survive a restart
- Reaction role and auto role mappings are persisted on disk under `data/`
- The public API intentionally exposes only summary and queue data
- `!!shell` executes arbitrary shell commands and should remain restricted to a trusted owner ID

## Notes for contributors and maintainers

Read `CONTRIBUTING.md` before opening a pull request or pushing from a new clone.

Branch safety workflow:

- run `pnpm install` once after cloning so the repo can configure `core.hooksPath=.githooks`
- create feature branches from `main`
- push the feature branch and open a pull request instead of pushing to `main` or `master`
- expect the local `pre-push` hook to block direct pushes to `main` and `master`
- expect the local `pre-push` hook to block non-fast-forward pushes unless you intentionally bypass it
- treat the local hook as a safety net only; the real enforcement must live in GitHub rulesets or branch protection

If you are extending the project:

- add or modify Discord commands in `src/commands/`
- add or modify Discord event handlers in `src/events/`
- change Lavalink connection and queue behavior in `src/lib/MoodenglinkManager.ts`
- change Reaction Role persistence in `src/lib/ReactionRoleManager.ts`
- change SpamGuard detection and punishment in `src/lib/SpamGuard.ts`
- change command cleanup behavior in `src/events/messageCreate.ts`
- change dashboard data payloads in `src/api.ts`
- change dashboard UI in `dashboard/src/app/DashboardClient.tsx`
- change dashboard server-side data fetching in `dashboard/src/app/page.tsx`
- change deployment behavior in `.github/workflows/deploy.yml`, `docker-compose.yml`, `Dockerfile`, and `dashboard/Dockerfile`

Checks: `pnpm test` runs the unit tests in `tests/`, `pnpm smoke` imports every module and boots the API on a local port, and `pnpm run build` is the check CI runs on every pull request.

## License

MeoXP Bot is released under the [MIT License](LICENSE).

You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of this project, including for commercial use. That includes taking individual features (music, TTS, SpamGuard, reaction roles, auto roles, gold price alerts, parcel tracking, the dashboard) into your own bot and changing them however you like. Most features live in `src/lib/`, with their commands in `src/commands/` and their event wiring in `src/events/`.

The one condition: keep the copyright and permission notice from `LICENSE` in all copies or substantial portions of the code you take. The software comes with no warranty.

### Feedback

If you reuse something from this repository and find a bug or want a change, open an issue at <https://github.com/leotawee/meoxp-bot/issues>. I read the feedback and fix what I can. Pull requests are welcome too; see `CONTRIBUTING.md`.
