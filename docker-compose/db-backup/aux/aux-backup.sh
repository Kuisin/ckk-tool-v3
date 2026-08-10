#!/bin/bash
# aux-backup.sh — 完全復旧（サーバー全損 → git repo + /backups だけで再構築）を成立
# させる補助バックアップ。毎日 03時台に /backups/aux/YYYY-MM-DD/ へ:
#
#   1) 周辺 PostgreSQL の論理 dump（docker exec pg_dump -Fc — パスワード/ネットワーク
#      配線不要）: authentik（SSO 設定・ユーザー）/ coolify（デプロイ定義）/
#      metabase（BI ダッシュボード）/ ckk-legacy（旧システム アーカイブ）
#   2) Grafana データ（ダッシュボード等; monitoring_grafana-data ボリューム）の tar
#   3) サーバー限定シークレットの暗号化 tar（~/stacks/*/.env・ldap.env・vpn 設定・
#      Coolify の .env / .api-token）。AES-256-CBC + PBKDF2。パスフレーズ
#      （ENV_SNAPSHOT_PASSPHRASE）は**サーバー外**（パスワードマネージャ等）にも必ず
#      保管する — サーバー全損時はそれが無いと復号できない。
#
# 保持: AUX_KEEP_DAYS 日（既定14）+ 月初スナップショットを aux-monthly/ に
# AUX_MONTHLY_KEEP ヶ月（既定12）。offsite-backup が /backups を監視しているため、
# 生成物はそのままオフサイトへも同期される。
#
# 引数 "now" で即時 1 回実行して常駐（初回検証用）。
set -u

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
AUX_KEEP_DAYS=${AUX_KEEP_DAYS:-14}
AUX_MONTHLY_KEEP=${AUX_MONTHLY_KEEP:-12}
RUN_HOUR=${AUX_RUN_HOUR:-03}

# 対象 DB（コンテナ名:ユーザー:DB名）。環境変数で上書き可。
AUX_DBS=${AUX_DBS:-"authentik-postgresql-1:authentik:authentik coolify-db:coolify:coolify metabase-db:metabase:metabase ckk-legacy-db:ckk_admin:ckk_system"}

log() { echo "[aux-backup] $*"; }

run_backup() {
  local day dir ts ok=0 fail=0
  day=$(date +%F)
  dir="$BACKUP_ROOT/aux/$day"
  mkdir -p "$dir"

  # 1) 周辺 DB dump（コンテナが無い/停止中はスキップして続行）
  for spec in $AUX_DBS; do
    local c u d out
    c=${spec%%:*}; u=$(echo "$spec" | cut -d: -f2); d=${spec##*:}
    out="$dir/${c}.dump"
    if docker exec "$c" pg_dump -U "$u" -Fc "$d" > "$out" 2>/tmp/aux-err; then
      log "dump ok: $c ($(du -h "$out" | cut -f1))"; ok=$((ok+1))
    else
      log "dump FAIL: $c — $(head -c 200 /tmp/aux-err)"; rm -f "$out"; fail=$((fail+1))
    fi
  done

  # 2) Grafana データ（ボリュームが無ければスキップ）
  if [ -d /grafana-data ]; then
    tar -czf "$dir/grafana-data.tar.gz" -C /grafana-data . 2>/dev/null \
      && log "grafana ok ($(du -h "$dir/grafana-data.tar.gz" | cut -f1))" || log "grafana FAIL"
  fi

  # 3) シークレット暗号化 tar（パスフレーズ未設定なら明示的に警告してスキップ）
  if [ -n "${ENV_SNAPSHOT_PASSPHRASE:-}" ]; then
    local tmp=/tmp/secrets.tar.gz
    {
      # ~/stacks 配下の .env / *.env と vpn-ldap の VPN 設定一式
      find /host-stacks -maxdepth 2 \( -name ".env" -o -name "*.env" \) -type f 2>/dev/null
      find /host-stacks/vpn-ldap/vpn -type f 2>/dev/null
      # Coolify のサーバー限定ファイル
      [ -f /coolify-source/.env ] && echo /coolify-source/.env
      [ -f /coolify-source/.api-token ] && echo /coolify-source/.api-token
    } | tar -czf "$tmp" -T - 2>/dev/null
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
      -pass env:ENV_SNAPSHOT_PASSPHRASE \
      -in "$tmp" -out "$dir/secrets.tar.gz.enc" \
      && log "secrets ok ($(du -h "$dir/secrets.tar.gz.enc" | cut -f1))" || log "secrets FAIL"
    rm -f "$tmp"
  else
    log "WARNING: ENV_SNAPSHOT_PASSPHRASE 未設定 — シークレット snapshot をスキップ（完全復旧が成立しない）"
  fi

  # 月次昇格（当月分が無ければ今日の分をコピー）
  local month="$BACKUP_ROOT/aux-monthly/$(date +%Y-%m)"
  if [ ! -d "$month" ]; then
    mkdir -p "$month" && cp -a "$dir/." "$month/" && log "monthly promoted: $(date +%Y-%m)"
  fi

  # 保持ポリシー
  find "$BACKUP_ROOT/aux" -mindepth 1 -maxdepth 1 -type d -mtime +"$AUX_KEEP_DAYS" -exec rm -rf {} + 2>/dev/null
  ls -1d "$BACKUP_ROOT"/aux-monthly/*/ 2>/dev/null | sort | head -n -"$AUX_MONTHLY_KEEP" | xargs -r rm -rf

  # ステータス（監視用）
  ts=$(date -Iseconds)
  mkdir -p "$BACKUP_ROOT/latest-status"
  printf '{"at":"%s","ok":%d,"fail":%d,"secrets":%s}\n' \
    "$ts" "$ok" "$fail" "$([ -n "${ENV_SNAPSHOT_PASSPHRASE:-}" ] && echo true || echo false)" \
    > "$BACKUP_ROOT/latest-status/aux.json"
  log "done: ok=$ok fail=$fail"
}

# ワンショット実行（初回検証用）: 実行して終了する（常駐しない）
if [ "${1:-}" = "now" ]; then
  run_backup
  exit 0
fi

log "scheduler up — daily at ${RUN_HOUR}:xx (keep ${AUX_KEEP_DAYS}d + ${AUX_MONTHLY_KEEP}mo)"
while true; do
  if [ "$(date +%H)" = "$RUN_HOUR" ] && [ ! -d "$BACKUP_ROOT/aux/$(date +%F)" ]; then
    run_backup
  fi
  sleep 600
done
