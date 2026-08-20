# docs-screenshots — マニュアル用スクリーンショット自動撮影

`/manual`（fumadocs）に載せるスクリーンショットを、**ローカル一時 DB + 固定シード
+ Playwright** で決定的に撮影するパイプライン。共有 dev DB には一切触れない。

## 前提

- Docker（一時 Postgres `groonga/pgroonga:4.0.6-alpine-17` を起動する）
- pnpm（このディレクトリは独立パッケージ — リポジトリの pnpm workspace 外）
- 初回のみ: `pnpm install && pnpm exec playwright install chromium`

## 使い方

```bash
cd tools/docs-screenshots
pnpm docs:shots              # 全撮影: DB 起動→シード→build→撮影→lint→破棄
pnpm docs:verify             # 決定性確認: 撮り直して pixelmatch (diff < 0.1%)
pnpm docs:lint               # マニュアル ↔ manifest ↔ PNG の整合性チェックのみ
pnpm docs:seed               # DB 起動 + シードだけして残す（手動確認用）

# 1 枚だけ撮り直す（ラッパ経由だと -- の扱いで引数がずれるので直に呼ぶ）
pnpm exec tsx scripts/orchestrate.ts --only login-01
```

### データモデルに追随していないシードがあるとき

`--skip-seed <file[,file]>` で特定のデモシードを飛ばせる（部分名一致）。
**既定では全部流す** — 飛ばしたシードに依存する画面は当然撮れないので、
それに依存しない画面を撮り直すときの逃げ道として使う。

```bash
pnpm exec tsx scripts/orchestrate.ts --only profile-preferences-01 \
  --skip-seed production-demo-seed.sql,shipping-billing-demo-seed.sql
```

> ⚠️ `shared-db/sql/production-demo-seed.sql` は **注文明細（order_lines）統合に
> 未追随**（ファイル冒頭に警告あり）。`app.sales_orders` を参照していて必ず落ちる。
> これに続く `shipping-billing-demo-seed.sql` も同じ前提なので道連れになる。
> 生産・出荷・請求まわりの撮り直しには、まずこのシードの書き換えが要る。

PNG は `docker-compose/nextjs-web/content/manual/assets/screenshots/<id>.png` に
出力され、**マニュアルと一緒にコミットする**。

## 撮影の追加手順

1. `manifest.ts` にエントリを足す（`id` / `docPage` / `path` / 必要なら `steps`）。
2. マニュアルページ（`content/manual/**.md`）に以下を書く:
   - frontmatter: `screenshots: [<id>]`
   - 本文: `![説明](./assets/screenshots/<id>.png)`（ページ位置に応じた相対パス）
3. `pnpm docs:shots:one -- --only <id>` で撮影。
4. `pnpm docs:lint` が通ることを確認してコミット。

> 本文の参照とマニフェスト登録はどちらが先でも構いません。撮影前でも
> `scripts/placeholders.ts` が未撮影 id に一時 PNG を置くため、ビルドは通ります
> （docs:shots がビルド前に自動実行）。プレースホルダは撮影で上書きされるので、
> **灰色一色の PNG が残っていたら、その id の撮影が失敗している** サインです。

## 決定性の設計

- **DB**: 毎回 tmpfs の使い捨て Postgres に `prisma migrate deploy` + シード SQL
  （`shared-db/sql/*-seed.sql` + `screenshot-user-seed.sql`）+ レガシー import
  （BP マスタ ~29KB）。データは毎回同一。
- **ユーザー**: `demo_shot` / `shot2026`（`screenshot-user-seed.sql`、固定 UUID、
  staff ロール = system/kiosk 以外の全 READ）。ログインは 1 回だけ行い
  storageState を再利用（アプリに 5 回失敗/15 分のレートリミットがあるため）。
- **描画**: viewport 1440×900 @2x / ja-JP / Asia/Tokyo / ライト固定 /
  `reducedMotion: reduce`（Mantine は theme.respectReducedMotion: true で対応）/
  `animations: "disabled"` / `caret: "hide"` / workers 1。
- **「今日」問題**: シードの日付は固定だが、日付ピッカー既定値・「今月」見出し
  などは実行日で変わる。そういう画面は `clip` で外すか `mask` に領域を入れる。
  `page.clock` はクライアント側の時計しか固定できない（SSR の日付には効かない）
  ことに注意。
- **検証**: `docs:verify` が撮り直し → コミット済み PNG と pixelmatch。
  1 枚でも diff ≥ 0.1% なら fail。

## 既知の制約

- 生 Markdown 配信（`/manual/<lang>/<slug>.md`）では画像が `__img0` プレース
  ホルダになる（fumadocs の processed markdown 仕様 — 画像はビルド時に静的
  import へ変換されるため）。LLM 用途ではテキストが主なので許容。
- en/zh のマニュアルページも同じ ja UI のスクリーンショットを参照する。
