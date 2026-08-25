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
# ⚠️ **マイグレーションを手で当てるのには使わないこと。** それは Coolify の
# db-migrate-dev / db-migrate-main の仕事で、merge が唯一の引き金
# （CLAUDE.md「The DB is Coolify's」）。ここは読み取りとデータ投入の口。
#
# Usage (from shared-db/):
#   ./scripts/remote-db.sh pnpm prisma migrate status
#   ./scripts/remote-db.sh psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/grants.sql
#   ./scripts/remote-db.sh sh -c 'gunzip -c ../tools/data-migration/imports/010_bp.sql.gz | psql "$DATABASE_URL"'
#
# Env overrides: DB_SSH_HOST (192.168.50.15),
#                DB_ALIAS (ckk-db-dev — 環境を切り替えるならここ。ckk-db-main),
#                DB_CONTAINER (コンテナ名を直に指定して別名解決を飛ばす),
#                DB_TUNNEL_PORT (25432).
set -euo pipefail

SERVER="${DB_SSH_HOST:-192.168.50.15}"
# DB を Coolify へ移してからコンテナ**名**はハッシュになった（デプロイのたびに
# 変わる）。名前で docker inspect すると `no such object: ckk-db-dev` で落ちる。
# 安定しているのは **ネットワーク別名** のほうなので、既定ではそれで引く。
ALIAS="${DB_ALIAS:-ckk-db-dev}"
CONTAINER="${DB_CONTAINER:-}"
LOCAL_PORT="${DB_TUNNEL_PORT:-25432}"

cd "$(dirname "$0")/.."   # shared-db root
[ -f .env ] || { echo "remote-db: shared-db/.env not found" >&2; exit 1; }
# 明示的に渡された DATABASE_URL は .env より優先する。
# `. ./.env` は無条件に代入するので、退避しておかないと
#   DB_ALIAS=ckk-db-main DATABASE_URL="$MAIN_DATABASE_URL" ./scripts/remote-db.sh …
# が「main のトンネルに dev のパスワード」という最悪の組み合わせになる
# （繋がらないので実害は出ないが、原因が分かりにくい）。
PRESET_DATABASE_URL="${DATABASE_URL:-}"
# shellcheck disable=SC1091
. ./.env
[ -n "$PRESET_DATABASE_URL" ] && DATABASE_URL="$PRESET_DATABASE_URL"
[ -n "${DATABASE_URL:-}" ] || { echo "remote-db: DATABASE_URL not set in .env" >&2; exit 1; }

# The host:port in .env is the (unpublished) LAN endpoint; we swap it for the tunnel.
REMOTE_HOSTPORT="$(printf '%s' "$DATABASE_URL" | sed -n 's#.*@\([^/?]*\).*#\1#p')"
[ -n "$REMOTE_HOSTPORT" ] || { echo "remote-db: could not parse host from DATABASE_URL" >&2; exit 1; }

# Resolve the container's Docker IP (reachable from the server host).
# コンテナ名が明示されていればそれを、無ければネットワーク別名から引く。
if [ -n "$CONTAINER" ]; then
  TARGET_DESC="container $CONTAINER"
  CIP="$(ssh -o ConnectTimeout=10 "$SERVER" \
    "docker inspect '$CONTAINER' --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'" \
    2>/dev/null | awk '{print $1}')"
else
  TARGET_DESC="alias $ALIAS"
  # 稼働中コンテナを走査し、ネットワーク別名が一致するものの IP を返す。
  CIP="$(ssh -o ConnectTimeout=10 "$SERVER" "
    for c in \$(docker ps --format '{{.Names}}'); do
      docker inspect \"\$c\" --format '{{range \$n, \$v := .NetworkSettings.Networks}}{{range \$v.Aliases}}{{.}} {{end}}{{end}}|{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null |
        awk -v want='$ALIAS' -F'|' '{
          n = split(\$1, a, \" \");
          for (i = 1; i <= n; i++) if (a[i] == want) { split(\$2, ip, \" \"); print ip[1]; exit }
        }'
    done" | head -1)"
fi
[ -n "$CIP" ] || {
  echo "remote-db: could not resolve $TARGET_DESC on $SERVER" >&2
  echo "  ヒント: Coolify のコンテナ名はハッシュなので、名前ではなく別名で引く。" >&2
  echo "  一覧: ssh $SERVER 'docker ps --format \"{{.Names}}\"'" >&2
  exit 1
}

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

echo "remote-db: tunnel 127.0.0.1:${LOCAL_PORT} -> ${TARGET_DESC}(${CIP}):5432 on ${SERVER}" >&2
"$@"
