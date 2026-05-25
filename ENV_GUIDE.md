# Undead Multi-Bot Platform Configuration

## Required Secrets

### Discord Bots
- Create one env var set per bot folder under `bot/`
- Example: `BOT_BOT1_TOKEN` for `bot/bot1/`
- Example: `BOT_BOT2_TOKEN` for `bot/bot2/`
- `BOT_STARTUP_DELAY_MS`: Sequential connect delay in milliseconds. Recommended `5000`
- `BOT_AUTOSAVE_MS`: Per-bot checkpoint interval in milliseconds. Recommended `60000`

Per-bot optional env vars:

- `BOT_<BOT_NAME>_TOKEN`
- `BOT_<BOT_NAME>_PREFIX`
- `BOT_<BOT_NAME>_ENABLED`
- `BOT_<BOT_NAME>_DISPLAY_NAME`
- `BOT_<BOT_NAME>_HELLO_MESSAGE`
- `BOT_<BOT_NAME>_STARTUP_DELAY_MS`
- `BOT_<BOT_NAME>_ACCENT`

### Cloudflare R2
- `R2_ENDPOINT`: S3 endpoint, for example `https://<account_id>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY_ID`: R2 access key
- `R2_SECRET_ACCESS_KEY`: R2 secret key
- `R2_BUCKET`: Shared bucket for per-bot checkpoints

### Cloudflare D1
- `D1_DATABASE_ID`: Cloudflare D1 Database ID
- `D1_API_TOKEN`: Cloudflare API Token (with D1 edit permissions)
- `D1_ACCOUNT_ID`: Cloudflare Account ID

Optional legacy migration:

- `D1_LEGACY_BOT_ID`: Bot id to use when migrating old `user_levels` tables that lack `bot_id`.

Run [`cloudflare/d1-schema.sql`](cloudflare/d1-schema.sql) before first launch.

### GitHub
- `GITHUB_PAT`: Personal access token with `workflow` permission. Used by the Fly.io reviver.
- `GITHUB_OWNER`: GitHub username or organization
- `GITHUB_REPO`: Repository name
- `GITHUB_WORKFLOW`: Workflow filename, for example `bot.yml`
- `GITHUB_REF`: Branch ref to dispatch, usually `main`

### Reviver
- `REVIVER_SECRET`: Shared secret between bot and reviver
- `REVIVER_URL`: URL of the Fly.io reviver service
- `PORT`: Reviver port on Fly.io, default `8080`

## GitHub Actions Secrets

Add all Discord, R2, D1, and reviver variables above to repository secrets so the manager can run on the ephemeral runner.

## Fly.io Secrets

Set these on the Fly.io reviver app:

- `D1_DATABASE_ID`
- `D1_API_TOKEN`
- `D1_ACCOUNT_ID`
- `GITHUB_PAT`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_WORKFLOW`
- `GITHUB_REF`
- `REVIVER_SECRET`

## R2 Layout

The runtime writes independent Brotli-compressed checkpoints:

- `checkpoints/bot1/latest.br`
- `checkpoints/bot2/latest.br`
- `checkpoints/alpha/latest.br`
- `checkpoints/beta/latest.br`
- `checkpoints/gamma/latest.br`

## Bot Folder Layout

The runtime discovers bots from folders like these:

- `bot/bot1/commands/*.ts`
- `bot/bot2/commands/*.ts`

Each bot can also have its own code in:

- `bot/bot1/commands/*.ts`
- `bot/bot2/commands/*.ts`

Those commands are isolated per bot. Adding `bot/bot2/commands/echo.ts` does not affect `bot1`.

## Deployment Order

1. Create the D1 database and run the schema.
2. Create the R2 bucket.
3. Deploy the Fly.io reviver from `reviver/`.
4. Add repository and Fly secrets.
5. Manually dispatch the workflow once to bootstrap the runtime.
