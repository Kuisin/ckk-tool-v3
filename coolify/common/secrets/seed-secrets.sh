#!/usr/bin/env bash
# seed-secrets.sh — 既存の bind mount から Docker ボリューム `ckk-secrets` へ
# 機微ファイルを写す（冪等・上書きしない）。
#
# Run ON docker-mac-pro:  bash ~/stacks/coolify/seed-secrets.sh
#
# なぜ要るか: Coolify は git からアプリを建てるので、git に無いファイル
# （TLS 証明書 / acme の更新状態 / OpenVPN 設定）は移行時に消える。秘密を git へ
# 入れる訳にはいかないため、ホスト側の 1 か所（このボリューム）へ集約する。
set -euo pipefail

VOL=ckk-secrets
SRC_NGINX="$HOME/stacks/nginx-proxy"
SRC_VPN="$HOME/stacks/vpn-ldap"
SRC_SEARX="$HOME/stacks/ai-stack/searxng"

docker volume inspect "$VOL" >/dev/null 2>&1 || {
  docker volume create "$VOL" >/dev/null
  echo "created volume $VOL"
}

# 既に入っていれば触らない（再実行で古い値に戻さない）。
have() { docker run --rm -v "$VOL":/s alpine test -e "/s/$1"; }

copy_dir() { # src, dest-in-volume
  local src=$1 dest=$2
  if have "$dest"; then
    echo "  $dest: 既にある — 飛ばす"
    return
  fi
  [ -d "$src" ] || { echo "  !! $src が無い"; return 1; }
  docker run --rm -v "$VOL":/s -v "$src":/src:ro alpine \
    sh -c "mkdir -p /s/$(dirname "$dest") && cp -a /src /s/$dest"
  echo "  $dest ← $src"
}

echo "== 投入 =="
copy_dir "$SRC_NGINX/certs" nginx/certs
copy_dir "$SRC_NGINX/acme"  nginx/acme
copy_dir "$SRC_VPN/vpn"     vpn
# searxng の settings.yml はインスタンス固有の secret_key を含む（README で
# 「実鍵は commit しない」と明記されている）。
copy_dir "$SRC_SEARX"       searxng

echo
echo "== 確認 =="
docker run --rm -v "$VOL":/s alpine sh -c '
  echo "  certs: $(ls /s/nginx/certs 2>/dev/null | wc -l) files"
  echo "  acme : $(ls -A /s/nginx/acme 2>/dev/null | wc -l) entries"
  echo "  vpn  : $(ls /s/vpn 2>/dev/null | tr "\n" " ")"
  echo "  searx: $(ls /s/searxng 2>/dev/null | tr "\n" " ")"
  echo "  size : $(du -sh /s | cut -f1)"
  # 社内 CA の秘密鍵は再生成不能 — 入っているか名指しで確認する。
  test -f /s/nginx/certs/ckk-internal-ca.key \
    && echo "  内部 CA 秘密鍵: あり" || echo "  !! 内部 CA 秘密鍵が無い"'
