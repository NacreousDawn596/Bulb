# 👻 Bulb

A production-grade, self-resurrecting Discord bot system designed to run on ephemeral compute (GitHub Actions) while maintaining persistent state and "immortal" uptime.

## 🚀 Architecture

1.  **Discord Bot (GitHub Actions)**: The brain. Runs in a GitHub Action workflow. It saves checkpoints to Cloudflare R2 and relational data to Cloudflare D1.
2.  **Persistence Layers**: 
    *   **Cloudflare R2**: Stores `checkpoint/latest.json` for rapid state recovery.
    *   **Cloudflare D1**: Stores long-term relational stats (lifetime usage, etc.).
3.  **Reviver Service (Fly.io)**: A tiny "daemon" that waits for a signal from the bot (just before GitHub kills the runner) to trigger a new `workflow_dispatch` via the GitHub API.

---

## 🛠️ Setup Instructions

### 1. Cloudflare Setup

#### R2 (S3-compatible storage)
- Create an R2 bucket named `undead-bot-state`.
- Generate an **API Token** with `Edit` permissions.
- Note your **Account ID** and **S3 Endpoint**.

#### D1 (SQL Database)
- Create a D1 database named `undead-bot-db`.
- Note your **Database ID**.
- Generate an **API Token** with `D1 Edit` permissions.

### 2. GitHub Setup
- Create a **Personal Access Token (PAT)** with `workflow` scope.
- `GITHUB_PAT` is used by the Fly.io reviver service and should stay out of GitHub repo secrets because GitHub forbids secret names that start with `GITHUB_`.
- You can sync secrets automatically from `.env`:
  ```bash
  chmod +x scripts/sync-secrets.sh
  ./scripts/sync-secrets.sh --github-only
  ```

### 3. Fly.io Setup (Reviver Service)
- Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
- Navigate to `/reviver`:
  ```bash
  cd reviver
  fly launch # Follow prompts, name it undead-bot-reviver
  ```
- Sync required secrets from `.env`:
  ```bash
  ./scripts/sync-secrets.sh --fly-only
  ```
- This pushes `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WORKFLOW`, and `REVIVER_SECRET` to Fly.
- Deploy: `fly deploy`

### 3.1 One-shot sync (GitHub + Fly)
From repo root:

```bash
chmod +x scripts/sync-secrets.sh
./scripts/sync-secrets.sh
```

Optional flags:
- `--env-file path/to/.env`
- `--repo owner/repo`
- `--fly-app app-name`
- `--dry-run`

The GitHub sync only uploads valid repository secrets; `GITHUB_PAT` stays reserved for Fly.io.

### 4. Bot Registration
- Locally, set up a `.env` in the `/bot` folder.
- Run `npm install` and then `npm run register` to register slash commands.
- In GitHub Actions, the bot workflow now runs command registration automatically before startup.

---

## 📈 Features

- **Self-Resurrection**: Automatically restarts itself when the GH Action environment terminates.
- **State Recovery**: Restores guilds, session IDs, and command usage counts seamlessly.
- **Autosave**: Periodically checkpoints state every 60 seconds.
- **Graceful Shutdown**: Traps `SIGTERM`/`SIGINT` to save state and trigger the reviver.
- **Crash Recovery**: Handles uncaught exceptions by saving the error and triggering a restart.
- **Relational Stats**: Tracks lifetime metrics in Cloudflare D1.

## 📂 File Structure

- `/bot`: Node.js discord.js application.
  - `index.js`: Core logic & lifecycle management.
  - `checkpoint.js`: R2 integration.
  - `d1.js`: D1 integration.
  - `register.js`: Slash command registration.
  - `/commands`: Command handlers.
  - `/utils`: Helper utilities (resurrection trigger).
- `/reviver`: Fly.io Express service.
- `.github/workflows/bot.yml`: The "undead" runner.

---

## 📜 License
MIT
