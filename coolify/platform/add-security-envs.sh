#!/usr/bin/env bash
# 認証イベント記録（app.login_attempts / SY0D ログイン履歴）の env を
# 4 アプリへ入れる（冪等）。
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-security-envs.sh
# (or from the workstation: ssh 192.168.50.15 'bash ~/stacks/coolify/add-security-envs.sh')
#
# 入れるもの:
#   LOGIN_ATTEMPT_PEPPER   相関キー（identifier_ref / card_ref）の pepper。
#                          **4 アプリすべてで同値**でないとアプリ間で相関しない
#                          ので、KIOSK_WS_SECRET と同じくファイルに 1 本だけ
#                          生成して配る。
#   DEVICE_SIGNALS_SECRET  端末シグネチャ Cookie（ckk_dev）の署名鍵。web のみ。
#                          未設定なら AUTH_SECRET を流用する実装だが、
#                          鍵の用途を分けたいので明示的に持たせる。
#   CORPORATE_CIDRS        社内ネットワークの範囲。所有区分の自動判定に使う。
#                          **「社内にいる」の証拠であって社給端末の証拠ではない**
#                          （UI にもそう出る）。未設定なら判定は UNKNOWN。
#   TRUSTED_PROXY_HOPS     x-forwarded-for で自分の前に居るプロキシの数。
#                          まず 0（右端＝最も近いプロキシが観測した値）で入れ、
#                          SY0D に溜まる ip_chain を見てから調整する。
#                          **左端は絶対に採らない** — クライアントが自由に書ける。
#
# どれも未設定でアプリが落ちることは無い（機能が劣化するだけ）。
# 反映には各アプリの再デプロイが要る。

set -euo pipefail

API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
PEPPER_FILE=/data/coolify/source/.login-attempt-pepper
SIGNALS_FILE=/data/coolify/source/.device-signals-secret

# 社内ネットワーク: 拠点 LAN + VPN。広げるとその分「社内NW」判定が増えるので、
# 実際に社内とみなす範囲だけを書くこと。
CORPORATE_CIDRS="${CORPORATE_CIDRS:-192.168.50.0/24,21.10.10.0/24}"
TRUSTED_PROXY_HOPS="${TRUSTED_PROXY_HOPS:-0}"

WEB_APPS="nextjs-web-dev nextjs-web-main"
KIOSK_APPS="nextjs-kiosk-dev nextjs-kiosk-main"

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

# 共有シークレット（4 アプリで同値）— 初回のみ生成
for f in "$PEPPER_FILE" "$SIGNALS_FILE"; do
  if [ ! -s "$f" ]; then
    openssl rand -hex 32 > "$f"
    chmod 600 "$f"
    echo "generated $f"
  fi
done
PEPPER=$(cat "$PEPPER_FILE")
SIGNALS_SECRET=$(cat "$SIGNALS_FILE")

# 既存値があれば上書きしない（pepper を変えると過去の相関キーが繋がらなくなる）。
add_env_if_missing() { # app_name key value
  local app=$1 key=$2 value=$3 uuid
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$app\") | .uuid" | head -1)
  [ -n "$uuid" ] || { echo "!! app not found: $app"; return 1; }
  if api GET "/applications/$uuid/envs" | jq -e ".[] | select(.key == \"$key\")" >/dev/null; then
    echo "$app: $key already set"
  else
    api POST "/applications/$uuid/envs" -d "{\"key\": \"$key\", \"value\": \"$value\"}" >/dev/null \
      && echo "$app: $key added (redeploy to apply)"
  fi
}

for app in $WEB_APPS $KIOSK_APPS; do
  add_env_if_missing "$app" LOGIN_ATTEMPT_PEPPER "$PEPPER"
  add_env_if_missing "$app" CORPORATE_CIDRS      "$CORPORATE_CIDRS"
  add_env_if_missing "$app" TRUSTED_PROXY_HOPS   "$TRUSTED_PROXY_HOPS"
done

# 端末シグネチャ Cookie は web だけが発行・検証する
for app in $WEB_APPS; do
  add_env_if_missing "$app" DEVICE_SIGNALS_SECRET "$SIGNALS_SECRET"
done

echo
echo "done. 反映するには再デプロイ:"
echo "  ./deploy.sh dev / ./deploy.sh main / ./deploy.sh kiosk-dev / ./deploy.sh kiosk-main"
echo
echo "入れたあと SY0D（ログイン履歴）で確認すること:"
echo "  - ip_chain を見て TRUSTED_PROXY_HOPS が妥当か（右端が本当のクライアントか）"
echo "  - 社内からのログインが「会社（社内NW）」になるか"
