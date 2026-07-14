#!/usr/bin/env bash
# remote-db.sh — run a command against the remote shared-db over an SSH tunnel.
#
# WHY: the dev DB (shared-db/ckk on 192.168.50.15) does NOT publish a host port —
# it is only reachable inside Docker on the server. So `prisma migrate deploy`
# from a workstation cannot connect to 192.168.50.15:15432 directly (connection
# refused). This script opens `ssh -L <local>:<container-ip>:5432` to the server,
# rewrites DATABASE_URL to the tunnel, runs the given command, then closes the
# tunnel. No server-side change, no DB restart, no exposed port.
#
# Usage (from shared-db/):
#   ./scripts/remote-db.sh pnpm prisma migrate deploy
#   ./scripts/remote-db.sh pnpm prisma migrate status
#   ./scripts/remote-db.sh psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/grants.sql
#   ./scripts/remote-db.sh sh -c 'gunzip -c ../data-migration/imports/010_bp.sql.gz | psql "$DATABASE_URL"'
#
# Env overrides: DB_SSH_HOST (192.168.50.15), DB_CONTAINER (shared-db),
#                DB_TUNNEL_PORT (25432).
set -euo pipefail

SERVER="${DB_SSH_HOST:-192.168.50.15}"
CONTAINER="${DB_CONTAINER:-shared-db}"
LOCAL_PORT="${DB_TUNNEL_PORT:-25432}"

cd "$(dirname "$0")/.."   # shared-db root
[ -f .env ] || { echo "remote-db: shared-db/.env not found" >&2; exit 1; }
# shellcheck disable=SC1091
. ./.env
[ -n "${DATABASE_URL:-}" ] || { echo "remote-db: DATABASE_URL not set in .env" >&2; exit 1; }

# The host:port in .env is the (unpublished) LAN endpoint; we swap it for the tunnel.
REMOTE_HOSTPORT="$(printf '%s' "$DATABASE_URL" | sed -n 's#.*@\([^/?]*\).*#\1#p')"
[ -n "$REMOTE_HOSTPORT" ] || { echo "remote-db: could not parse host from DATABASE_URL" >&2; exit 1; }

# Resolve the container's Docker IP (reachable from the server host).
CIP="$(ssh -o ConnectTimeout=10 "$SERVER" \
  "docker inspect $CONTAINER --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'" \
  | awk '{print $1}')"
[ -n "$CIP" ] || { echo "remote-db: could not resolve $CONTAINER IP on $SERVER" >&2; exit 1; }

# Open a tunnel via a control socket so we can close it cleanly on exit.
CTRL="$(mktemp -u "${TMPDIR:-/tmp}/remote-db-XXXXXX.sock")"
cleanup() { ssh -S "$CTRL" -O exit "$SERVER" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
ssh -f -N -o ExitOnForwardFailure=yes -M -S "$CTRL" \
  -L "${LOCAL_PORT}:${CIP}:5432" "$SERVER"

# Wait until the forwarded port accepts connections (bash /dev/tcp).
for _ in $(seq 1 40); do
  if (exec 3<>"/dev/tcp/127.0.0.1/${LOCAL_PORT}") 2>/dev/null; then exec 3>&- 3<&-; break; fi
  sleep 0.25
done

export DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed "s#@${REMOTE_HOSTPORT}#@127.0.0.1:${LOCAL_PORT}#")"
# Make Homebrew libpq's psql findable when a command uses it.
[ -d /opt/homebrew/opt/libpq/bin ] && export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

echo "remote-db: tunnel 127.0.0.1:${LOCAL_PORT} -> ${CONTAINER}(${CIP}):5432 on ${SERVER}" >&2
"$@"
