# manual-videos — マニュアルの動画をデプロイ時に録る

マニュアルのプロセス編（販売 / 購買 / 生産 / 出荷 / 請求）に載せる、業務の通し操作の
動画を録画するだけのアプリ。**動画は git にもアプリのイメージにも入れない** —
リポジトリにあるのはスクリプト（`tools/docs-screenshots/walkthroughs/`）で、この
コンテナが起動時にそれを走らせる。

| Coolify アプリ | ブランチ | 書き出し先（ホスト） | 読む側 |
|---|---|---|---|
| `manual-videos-dev` | `dev` | `~/manual-videos/dev` | `nextjs-web-dev`（`/data/manual-videos` に読み取りで mount） |
| `manual-videos-main` | `main` | `~/manual-videos/main` | `nextjs-web-main` |

## いつ動くか

**通し操作のスクリプトか、このディレクトリを変えたときだけ**（watch_paths）。
`db-migrate` が `shared-db/**` でだけ動くのと同じ考え方で、ふだんのアプリの push では
動かない — Next のビルドがもう 1 本走ることも、録画が走ることも無い。

画面の見た目が変わって撮り直したいときは手で流す:

```bash
coolify/platform/deploy.sh manual-videos-dev    # 本番は manual-videos-main
```

つまり動画は「最後に録ったときの画面」で、アプリより古いことがある。手順そのものが
壊れた場合は CI の `walkthroughs` ジョブ（昇格 PR で必ず回る）が同じスクリプトで
止めるので、遅れうるのは見た目だけ。プレーヤーの下に録画日が出る。

## 何をするか（`entrypoint.sh`）

1. コンテナの中に**使い捨ての Postgres**（PGroonga）を立てる
2. デモシードを入れ、ビルド済みの nextjs-web を起動し、通し操作を Playwright で録画する
3. **全部通ったときだけ** `/out` の動画を入れ替える（`manifest.json` を最後に書く）
4. `/tmp/videos-ok` を置いて待機する（= healthy = デプロイ成功）

**業務 DB（`ckk-db-*`）にはつながない。** 接続先を 1 つも渡しておらず、env も要らない。
写るのは固定のデモデータ（デモ商事・デモ精密材料 …）だけ。

## 失敗したらどうなるか

通し操作が 1 本でも落ちると、コンテナは非 0 で終了して healthy にならず、**Coolify が
デプロイを失敗として記録する**。`/out` は前回のまま — 壊れた手順の動画で上書きしない。
デプロイログに「どの動画の・どの手順で・何を待って落ちたか」がそのまま出る。

同じコンテナが再起動されても録り直さない（`/tmp/videos-attempted`）。失敗を 10 分
かけて延々くり返さないため。直して push するか、`deploy.sh` で流し直す。

## ビルドについて

build context はリポジトリルート（`base_directory: "/"`、
`dockerfile_location: "/coolify/apps/manual-videos/Dockerfile"`）。ルートの
`.dockerignore` は deny-all + allowlist なので、`!coolify/apps/manual-videos/` /
`!tools/docs-screenshots/` / `!tools/data-migration/imports/` が入っている。

層は変わりにくい順: Chromium と OS の依存 → shared-db / workspace の依存 →
アプリのビルド → 通し操作のスクリプト。スクリプトだけ直したデプロイでは、
アプリのビルドまでキャッシュに当たる。

ベースは `groonga/pgroonga:4.0.6-debian-17`（CI・撮影と同じ版の Debian 版）。
Alpine 版は使えない — Playwright の Chromium は musl で動かない。日本語フォント
（`fonts-noto-cjk`）を入れてある。入れないと録画の文字が豆腐になる。

## 手元で確かめる

> ⚠️ **Mac の Docker Desktop でこのイメージをビルドしない。** 中で `next build` が走り、
> VM の CPU とメモリを使い切って Docker のデーモンごと応答しなくなった（同じ VM に
> 居る他のコンテナも巻き添えになる）。ビルドは Linux のサーバー（Coolify）に任せ、
> 手元では下の「Docker を介さずに録る」を使う。

サーバーや十分に大きい Linux で試すなら:

```bash
docker build -f coolify/apps/manual-videos/Dockerfile -t ckk-manual-videos:test .
mkdir -p /tmp/manual-videos
docker run --rm -v /tmp/manual-videos:/out ckk-manual-videos:test   # healthy になったら Ctrl-C
ls /tmp/manual-videos                                                # manifest.json + 5 本
```

Docker を介さずに録るだけなら `cd tools/docs-screenshots && pnpm docs:videos --out /tmp/manual-videos`。
読む側は `MANUAL_VIDEO_DIR=/tmp/manual-videos` を付けて nextjs-web を起動する。

## 登録

サーバーで `coolify/platform/add-manual-video-apps.sh`（冪等）。2 つのアプリを作り、
bind mount を付け、`nextjs-web-*` 側の mount と `MANUAL_VIDEO_DIR` も入れる。
