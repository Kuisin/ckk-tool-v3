#!/usr/bin/env bash
# CRED_ENCRYPTION_KEY — adminTools の「管理者ログイン」モーダル（メール /email・
# 勤怠 /kot）が保存する資格情報を暗号化する Fernet 鍵を、必要な 3 アプリへ
# **同じ値**で入れる（冪等）。
#
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-cred-encryption-key.sh
# (or from the workstation: ssh 192.168.50.15 'bash -s' < add-cred-encryption-key.sh)
#
# なぜ 3 つとも同じ値でなければならないか:
#   admintools-main が /kot のモーダルで保存した KOT_ID/PW は ckk-db-main の
#   kot スキーマ（kot_settings）に**暗号文で**入る。それを実際に使って King of
#   Time にログインするのは **別コンテナの kot-import** なので、そちらが同じ鍵を
#   持っていないと復号できない。鍵が違うと復号は例外ではなく空文字を返し、
#   黙って env の KOT_ID/KOT_PW にフォールバックする（＝モーダルで変えたのに
#   古い資格情報のまま動く、という一番気づきにくい壊れ方をする）。
#   admintools-dev / -main は **別の DB**（ckk-db-dev / ckk-db-main）なので
#   Sakura 側は本来環境ごとに独立でよいが、鍵を分けても得は無く、取り違えの
#   事故だけが増えるので 1 本に揃える。
#
# ⚠ 鍵は**作り直さない**。作り直すと、それまでモーダルで保存した資格情報が
#   すべて復号できなくなる（＝ env の SAKURA_ID/PW・KOT_ID/PW へ戻る。締め出し
#   にはならないが、保存した値は失われる）。だから既に**値の入っている**
#   CRED_ENCRYPTION_KEY は上書きしない。値が空のものだけ埋める
#   （Coolify が compose の ${CRED_ENCRYPTION_KEY:-} を読んで空で自動作成する）。
#
# 鍵の実体は /data/coolify/source/.cred-encryption-key に 1 つだけ置き、
# 以後はそれを使い回す（.metabase-embed-secret と同じ流儀）。
# 母艦の Keychain にも控えを置くこと:
#   security add-generic-password -s ckk-cred-encryption-key -a "$USER" -w '<key>'

set -euo pipefail

API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
KEY_FILE=/data/coolify/source/.cred-encryption-key
APPS=(admintools-dev admintools-main kot-import)

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

# Fernet 鍵 = urlsafe base64 の 32 バイト（44 文字・末尾 '='）。
# python/cryptography はサーバーに入っていないので openssl で作り、'+/' を
# urlsafe の '-_' に置き換える（Fernet は urlsafe 版しか受け付けない）。
if [ ! -s "$KEY_FILE" ]; then
  openssl rand -base64 32 | tr '+/' '-_' > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "鍵を生成: $KEY_FILE"
else
  echo "鍵は既にある: $KEY_FILE（作り直さない）"
fi
KEY=$(cat "$KEY_FILE")
case "$KEY" in
  ????????????????????????????????????????????) ;;   # 44 文字
  *) echo "!! $KEY_FILE の中身が Fernet 鍵の形（44文字）ではない"; exit 1 ;;
esac

# Coolify は env を production(is_preview=false) と preview(true) の 2 本持つ。
# 他の変数がどちらにも入っているので、これも両方に入れて食い違わせない。
set_key() { # app_name
  local app=$1 uuid cur
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$app\") | .uuid" | head -1)
  [ -n "$uuid" ] || { echo "!! app not found: $app"; return 1; }

  cur=$(api GET "/applications/$uuid/envs" \
        | jq -r "[.[] | select(.key == \"CRED_ENCRYPTION_KEY\") | .value] | map(select(. != null and . != \"\")) | first // \"\"")
  if [ -n "$cur" ]; then
    if [ "$cur" = "$KEY" ]; then
      echo "$app: CRED_ENCRYPTION_KEY 設定済み（同じ鍵）"
    else
      echo "$app: !! 既に**別の**鍵が入っている — 上書きしない（手で確認すること）"
    fi
    return 0
  fi

  api PATCH "/applications/$uuid/envs/bulk" -d "{\"data\": [
    {\"key\": \"CRED_ENCRYPTION_KEY\", \"value\": \"$KEY\", \"is_preview\": false},
    {\"key\": \"CRED_ENCRYPTION_KEY\", \"value\": \"$KEY\", \"is_preview\": true}
  ]}" >/dev/null && echo "$app: CRED_ENCRYPTION_KEY を設定（反映には再デプロイが要る）"
}

for app in "${APPS[@]}"; do set_key "$app"; done

echo
echo "done. 反映:"
echo "  ./deploy.sh admin-dev"
echo "  ./deploy.sh admin-main"
echo "  ./deploy.sh kot-import"
