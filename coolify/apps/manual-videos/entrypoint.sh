#!/bin/bash
# マニュアルの動画を録画して /out へ書き出し、そのあと待機する。
#
#   1. このコンテナの中に使い捨ての Postgres を立てる
#   2. デモシードを入れ、ビルド済みの nextjs-web を起動し、通し操作を録画する
#      （tools/docs-screenshots/scripts/walkthroughs.ts --record）
#   3. **全部通ったときだけ** /out の動画を入れ替える
#   4. /tmp/videos-ok を置いて待機（healthy = デプロイ成功）
#
# 途中で 1 本でも落ちたら非 0 で終了する: /out は前回のまま（壊れた手順の動画で
# 上書きしない）、コンテナは healthy にならず、Coolify がデプロイを失敗として残す。
# 原因はデプロイログにそのまま出る（どの手順で・どの要素を待って落ちたか）。
set -euo pipefail

OUT_DIR=${MANUAL_VIDEO_OUT:-/out}

# 再起動で録り直さない。失敗したコンテナを Docker が再起動すると、同じ失敗を
# 10 分かけて延々くり返すことになる（コンテナのファイルは再起動をまたいで残るので、
# この印が効く）。次のデプロイは新しいコンテナなので、普通に録る。
if [ -f /tmp/videos-attempted ]; then
  echo "!! このコンテナでは既に録画を試みて失敗している。録り直さずに待機する。" >&2
  echo "!! 直して push するか、deploy.sh で流し直すこと（新しいコンテナで録る）。" >&2
  exec sleep infinity
fi
touch /tmp/videos-attempted

if [ ! -d "$OUT_DIR" ] || ! touch "$OUT_DIR/.write-test" 2>/dev/null; then
  echo "!! 出力先 $OUT_DIR に書けない。Coolify の Persistent Storage（bind mount）を確認すること。" >&2
  exit 1
fi
rm -f "$OUT_DIR/.write-test"

echo "==> 使い捨ての Postgres を起動（このコンテナの中だけ。業務 DB にはつながない）"
export PGDATA=/tmp/pgdata
export POSTGRES_PASSWORD=shots
export POSTGRES_DB=ckk
# ベースイメージの入口が initdb とユーザー切り替え（postgres）を行う。
docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1 >/tmp/postgres.log 2>&1 &

export SHOT_DATABASE_URL="postgresql://postgres:shots@127.0.0.1:5432/ckk"
# Coolify はデプロイしたコミットを SOURCE_COMMIT で渡す。manifest.json に残す。
export WALK_COMMIT=${WALK_COMMIT:-${SOURCE_COMMIT:-}}

cd /repo/tools/docs-screenshots
echo "==> 録画（シード → 起動 → 通し操作）"
if ! pnpm exec tsx scripts/walkthroughs.ts --record --no-build --out "$OUT_DIR"; then
  echo "!! 録画に失敗した。$OUT_DIR は前回のまま。" >&2
  echo "---- postgres.log（末尾）----" >&2
  tail -n 20 /tmp/postgres.log >&2 || true
  exit 1
fi

# nextjs-web は別の uid（1001）で読む。読めるようにしておく。
chmod -R a+rX "$OUT_DIR"

echo "==> 録画完了"
ls -la "$OUT_DIR"
touch /tmp/videos-ok

# 待機する（db-migrate と同じ: Coolify は動き続けるプロセスを期待する）。
# Postgres はもう要らないので止める — 待機中にメモリを持ち続けない。
pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 || pkill postgres || true
exec sleep infinity
