#!/usr/bin/env bash

set -euo pipefail

ENV_FILE=".env"
GH_REPO=""
FLY_APP=""
DO_GITHUB=true
DO_FLY=true
DRY_RUN=false

GH_SECRET_KEYS=(
  BOT_TOKEN
  CLIENT_ID
  GUILD_ID
  R2_ENDPOINT
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  D1_DATABASE_ID
  D1_API_TOKEN
  D1_ACCOUNT_ID
  REVIVER_SECRET
  REVIVER_URL
)

FLY_SECRET_KEYS=(
  GITHUB_PAT
  GITHUB_OWNER
  GITHUB_REPO
  GITHUB_WORKFLOW
  REVIVER_SECRET
)

usage() {
  cat <<'EOF'
Sync secrets from a .env file to GitHub Actions and Fly.io.

Usage:
  scripts/sync-secrets.sh [options]

Options:
  --env-file <path>    Path to .env file (default: .env)
  --repo <owner/repo>  GitHub repo for Actions secrets (default: inferred via gh)
  --fly-app <name>     Fly app name (default: from reviver/fly.toml)
  --github-only        Sync only GitHub secrets
  --fly-only           Sync only Fly secrets
  --dry-run            Print what would be synced without sending secrets
  -h, --help           Show this help

Requirements:
  - gh authenticated (`gh auth status`)
  - flyctl authenticated (`flyctl auth whoami`) when syncing Fly

Note:
  This script sources your .env file in a shell context.
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

infer_repo() {
  if [[ -n "$GH_REPO" ]]; then
    return
  fi

  GH_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [[ -z "$GH_REPO" ]]; then
    echo "Error: could not infer GitHub repo. Use --repo owner/repo." >&2
    exit 1
  fi
}

infer_fly_app() {
  if [[ -n "$FLY_APP" ]]; then
    return
  fi

  if [[ -f "reviver/fly.toml" ]]; then
    FLY_APP="$(sed -n "s/^app = '\(.*\)'/\1/p" reviver/fly.toml | head -n 1)"
  fi

  if [[ -z "$FLY_APP" ]]; then
    echo "Error: could not infer Fly app. Use --fly-app <name>." >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --repo)
      GH_REPO="${2:-}"
      shift 2
      ;;
    --fly-app)
      FLY_APP="${2:-}"
      shift 2
      ;;
    --github-only)
      DO_GITHUB=true
      DO_FLY=false
      shift
      ;;
    --fly-only)
      DO_GITHUB=false
      DO_FLY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! $DO_GITHUB && ! $DO_FLY; then
  echo "Error: both sync targets are disabled." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if $DO_GITHUB; then
  if ! $DRY_RUN; then
    require_cmd gh
  fi
  infer_repo
  echo "Syncing GitHub Actions secrets to $GH_REPO"

  gh_synced=0
  gh_missing=()
  for key in "${GH_SECRET_KEYS[@]}"; do
    value="${!key-}"
    if [[ -z "${value}" ]]; then
      gh_missing+=("$key")
      continue
    fi

    if $DRY_RUN; then
      echo "  [dry-run] gh secret set $key --repo $GH_REPO"
    else
      printf '%s' "$value" | gh secret set "$key" --repo "$GH_REPO" >/dev/null
      echo "  set $key"
    fi
    gh_synced=$((gh_synced + 1))
  done

  echo "GitHub sync complete: $gh_synced secrets synced."
  if [[ ${#gh_missing[@]} -gt 0 ]]; then
    echo "GitHub skipped missing keys: ${gh_missing[*]}"
  fi
fi

if $DO_FLY; then
  if ! $DRY_RUN; then
    require_cmd flyctl
  fi
  infer_fly_app
  echo "Syncing Fly secrets to app $FLY_APP"

  fly_pairs=()
  fly_missing=()
  for key in "${FLY_SECRET_KEYS[@]}"; do
    value="${!key-}"
    if [[ -z "${value}" ]]; then
      fly_missing+=("$key")
      continue
    fi
    fly_pairs+=("$key=$value")
  done

  if [[ ${#fly_pairs[@]} -eq 0 ]]; then
    echo "Fly sync skipped: no Fly keys found in env file."
  else
    if $DRY_RUN; then
      for pair in "${fly_pairs[@]}"; do
        echo "  [dry-run] flyctl secrets set --app $FLY_APP ${pair%%=*}=***"
      done
    else
      flyctl secrets set --app "$FLY_APP" "${fly_pairs[@]}" >/dev/null
      echo "Fly sync complete: ${#fly_pairs[@]} secrets synced."
    fi
  fi

  if [[ ${#fly_missing[@]} -gt 0 ]]; then
    echo "Fly skipped missing keys: ${fly_missing[*]}"
  fi
fi

echo "Done."