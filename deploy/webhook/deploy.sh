#!/usr/bin/env bash
#
# deploy.sh — pull + build + restart the nextjs-web compose service.
# Invoked by the webhook receiver (adnanh/webhook) with two arguments:
#   $1 = ref  (e.g. refs/heads/main)   $2 = commit sha
#
# Configure via environment (see webhook.service):
#   STACK_DIR      docker compose folder that contains the nextjs-web service
#                  (must be a git checkout of the repo the server deploys)
#   SERVICE        compose service name to rebuild            (default: nextjs-web)
#   DEPLOY_BRANCH  branch to deploy                           (default: main)
#   GIT_REMOTE     remote to pull from                        (default: origin)
#
# NOTE: this does `git reset --hard`, discarding any local edits in STACK_DIR.
# The deploy target is not for hand-editing — change code via git.

set -euo pipefail

REF="${1:-}"
SHA="${2:-}"

STACK_DIR="${STACK_DIR:-/opt/ckk/stack}"
SERVICE="${SERVICE:-nextjs-web}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
GIT_REMOTE="${GIT_REMOTE:-origin}"

log() { echo "[deploy $(date -Is)] $*"; }

# Only deploy the configured branch (defense-in-depth; the workflow only fires on main).
if [ -n "$REF" ] && [ "$REF" != "refs/heads/$DEPLOY_BRANCH" ]; then
  log "ignoring ref '$REF' (want refs/heads/$DEPLOY_BRANCH)"
  exit 0
fi

# Serialize deploys — a second webhook while one is running is dropped, not queued.
exec 9>"/tmp/ckk-deploy-${SERVICE}.lock"
if ! flock -n 9; then
  log "another deploy is already running; skipping"
  exit 0
fi

cd "$STACK_DIR"

log "fetching $GIT_REMOTE/$DEPLOY_BRANCH (target sha: ${SHA:-unknown})"
git fetch --prune "$GIT_REMOTE" "$DEPLOY_BRANCH"
git reset --hard "$GIT_REMOTE/$DEPLOY_BRANCH"

log "building service '$SERVICE'"
docker compose build "$SERVICE"

log "restarting service '$SERVICE'"
docker compose up -d "$SERVICE"

log "pruning dangling images"
docker image prune -f >/dev/null 2>&1 || true

log "deploy complete ($(git rev-parse --short HEAD))"
