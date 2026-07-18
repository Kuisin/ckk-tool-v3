#!/usr/bin/env bash
# Deploy a non-Coolify Docker Compose stack to the server (rsync + rebuild).
#
# This is the manual flow for every stack that is NOT built by Coolify. The
# Coolify-managed apps — the nextjs-web app and admintools — deploy from GitHub
# via ./coolify/deploy.sh instead; do not use this script for those.
#
#   ./deploy-stack.sh <stack>            rsync source up, then docker compose up -d --build
#   ./deploy-stack.sh <stack> --dry-run  show what rsync would copy; no changes
#   ./deploy-stack.sh                    list deployable stacks
#
# Notes:
#   - The server .env holds secrets and lives only on the server — it is always
#     excluded so a deploy never overwrites or deletes it.
#   - No --delete: server-only files (certs, data dirs) are left untouched.
#   - Server host override: DEPLOY_HOST (default 192.168.50.15).

set -euo pipefail

HOST="${DEPLOY_HOST:-192.168.50.15}"
SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STACK="${1:-}"
DRY=""
[ "${2:-}" = "--dry-run" ] && DRY="--dry-run --verbose"

if [ -z "$STACK" ]; then
  echo "usage: deploy-stack.sh <stack> [--dry-run]"
  echo "deployable stacks:"
  for d in "$SRC_ROOT"/*/; do
    [ -f "${d}docker-compose.yml" ] && echo "  - $(basename "$d")"
  done
  exit 1
fi

SRC="$SRC_ROOT/$STACK"
[ -f "$SRC/docker-compose.yml" ] || { echo "error: no docker-compose.yml in $SRC"; exit 1; }

RSYNC_EXCLUDES=(
  --exclude .env --exclude .git --exclude .DS_Store --exclude .vscode
  --exclude node_modules --exclude .next --exclude '*.tsbuildinfo'
)

echo "→ rsync $STACK → $HOST:~/stacks/$STACK/ ${DRY:+(dry-run)}"
rsync -a $DRY "${RSYNC_EXCLUDES[@]}" "$SRC/" "$HOST:~/stacks/$STACK/"

if [ -n "$DRY" ]; then
  echo "dry-run only — nothing deployed. Re-run without --dry-run to apply."
  exit 0
fi

echo "→ docker compose up -d --build on $HOST"
ssh "$HOST" "cd ~/stacks/$STACK && docker compose up -d --build"
echo "✓ $STACK deployed"
