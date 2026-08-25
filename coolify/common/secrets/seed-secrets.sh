#!/usr/bin/env bash
# seed-secrets.sh — 機微ファイルをホストの単一ディレクトリ /data/ckk-secrets へ
# 集約する（冪等・既にあるものは上書きしない）。
#
# Run ON docker-mac-pro:  bash ~/stacks/coolify/seed-secrets.sh
#
# なぜホストのディレクトリで、Docker ボリュームではないのか:
#   Coolify は compose の名前付きボリュームを `external: true` と書いても
#   `<appUUID>_<name>` へ改名する。つまり**複数アプリで 1 本を共有できない**
#   （実際、空のボリュームを掴んで健全性チェックが全項目 MISSING になった）。
#   bind mount はそのまま渡るので、固定パスに置けば Coolify 管理でも直接
#   デプロイでも同じ場所を見られる。
#
# なぜ集約するのか:
#   Coolify は git からアプリを建てるので **git に無いファイルは存在しない**。
#   証明書・acme の state・OpenVPN 設定・searxng の secret_key は git に置けない。
set -euo pipefail

DEST=/data/ckk-secrets
SRC_NGINX="$HOME/stacks/nginx-proxy"
SRC_VPN="$HOME/stacks/vpn-ldap"
SRC_SEARX="$HOME/stacks/ai-stack/searxng"

sudo mkdir -p "$DEST"
echo "dest: $DEST"

copy_dir() { # src, dest-relative
  local src=$1 dest=$2
  if sudo test -e "$DEST/$dest"; then
    echo "  $dest: 既にある — 飛ばす"
    return
  fi
  [ -d "$src" ] || { echo "  !! $src が無い"; return 1; }
  sudo mkdir -p "$DEST/$(dirname "$dest")"
  sudo cp -a "$src" "$DEST/$dest"   # -a で所有者を保つ（searxng は uid 977）
  echo "  $dest ← $src"
}

echo "== 投入 =="
copy_dir "$SRC_NGINX/certs" nginx/certs
copy_dir "$SRC_NGINX/acme"  nginx/acme
copy_dir "$SRC_VPN/vpn"     vpn
# searxng の settings.yml はインスタンス固有の secret_key を含む
# （README に「実鍵は commit しない」と明記されている）。
copy_dir "$SRC_SEARX"       searxng

echo
echo "== 確認 =="
sudo sh -c '
  D=/data/ckk-secrets
  echo "  certs: $(ls "$D/nginx/certs" 2>/dev/null | wc -l) files"
  echo "  acme : $(ls -A "$D/nginx/acme" 2>/dev/null | wc -l) entries"
  echo "  vpn  : $(ls "$D/vpn" 2>/dev/null | tr "\n" " ")"
  echo "  searx: $(ls "$D/searxng" 2>/dev/null | tr "\n" " ")"
  echo "  size : $(du -sh "$D" | cut -f1)"
  # 社内 CA の秘密鍵は再生成すると全キオスク端末の信頼が切れる。名指しで確認する。
  test -f "$D/nginx/certs/ckk-internal-ca.key" \
    && echo "  内部 CA 秘密鍵: あり" || echo "  !! 内部 CA 秘密鍵が無い"
'
