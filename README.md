# Undead Bot Platform

This repository now runs multiple Discord bots inside one Bun runtime and one GitHub Actions runner. Each bot has its own mini codebase under `bot/<name>/`, and the runtime config comes entirely from environment variables:

- one Bun process manages all bots
- each bot keeps isolated runtime state
- all bots share one D1 database and one reviver
- each bot saves its own compressed checkpoint into R2
- the Fly.io reviver restarts the GitHub Actions workflow after the runner dies

## Architecture

```text
Manager Runtime
├── Bot Alpha
├── Bot Beta
├── Bot Gamma
└── N Bots
```

Manager responsibilities:

- dynamic bot loading with `Promise.allSettled()`
- bot discovery from `bot/*/commands`
- staggered Eris startup to avoid identify bursts
- per-bot autosave and checkpoint restore
- shared D1 bookkeeping
- health monitoring and structured logs
- graceful shutdown and resurrection signalling

## Runtime Layout

```text
src/
├── manager/
├── bots/
├── services/
├── state/
├── utils/
├── config/
└── index.ts
```

## Quick Start

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and fill in every value.
   Add one token env var per bot folder, like `BOT_BOT1_TOKEN`.
3. Create the Cloudflare D1 database and run [`cloudflare/d1-schema.sql`](cloudflare/d1-schema.sql).
4. Create the Cloudflare R2 bucket referenced by `R2_BUCKET`.
5. Deploy the Fly.io reviver from `reviver/`.
6. Add the GitHub Actions secrets listed in [`ENV_GUIDE.md`](ENV_GUIDE.md).
7. Start the manager locally:

```bash
bun run start
```

8. Start the reviver locally:

```bash
bun run start:reviver
```

## D1 Setup

Use the schema in [`cloudflare/d1-schema.sql`](cloudflare/d1-schema.sql). Every shared table includes `bot_id`, and the reviver also stores D1-backed backoff state in `reviver_backoff`.

Example with Wrangler:

```bash
wrangler d1 create undead-bot-platform
wrangler d1 execute undead-bot-platform --file=cloudflare/d1-schema.sql
```

## R2 Setup

Create one bucket and keep all checkpoints inside it:

```text
checkpoints/bot1/latest.br
checkpoints/bot2/latest.br
checkpoints/alpha/latest.br
checkpoints/beta/latest.br
checkpoints/gamma/latest.br
```

## Bot Folders

Each bot lives in its own folder under `bot/` and keeps its code in `commands/`.

Example:

```text
bot/
├── bot1/
│   ├── commands/
│   │   ├── hello.ts
│   │   └── ping.ts
└── bot2/
    ├── commands/
    │   ├── echo.ts
    │   └── hello.ts
```

Minimal runtime env:

```bash
BOT_BOT1_TOKEN=your_bot1_token
BOT_BOT1_PREFIX=!
BOT_BOT1_ENABLED=true
```

Command modules are local to that bot and loaded only from its own `commands/` folder.

Example:

```text
bot/bot1/commands/ping.ts
bot/bot2/commands/echo.ts
```

Required bucket permissions:

- `GetObject`
- `PutObject`
- `ListBucket` optional but useful for inspection

## GitHub Actions

The workflow in [`.github/workflows/bot.yml`](.github/workflows/bot.yml) runs one Bun process. It does not use shell loops. Resurrection is externalized to the Fly.io service.

## Fly.io Reviver

The reviver is an Elysia app in `reviver/src/server.ts`. It:

- validates the shared secret
- reads and updates D1 backoff state
- enforces cooldowns
- triggers `workflow_dispatch`
- prevents revival storms

## Verification

Run:

```bash
bun run typecheck
```

Then dispatch the workflow once manually and verify:

- each enabled bot connects in order
- `!hello` returns the correct bot identity
- `checkpoints/<bot>/latest.br` appears in R2
- `runtime_events` and `bots` rows update in D1
- `/health` and `/revive` work on Fly.io
