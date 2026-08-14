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
pnpm docs:shots:one -- --only login-01   # 1 枚だけ撮り直し
pnpm docs:verify             # 決定性確認: 撮り直して pixelmatch (diff < 0.1%)
pnpm docs:lint               # マニュアル ↔ manifest ↔ PNG の整合性チェックのみ
pnpm docs:seed               # DB 起動 + シードだけして残す（手動確認用）
```

PNG は `docker-compose/nextjs-web/content/manual/assets/screenshots/<id>.png` に
出力され、**マニュアルと一緒にコミットする**。

## 撮影の追加手順

1. `manifest.ts` にエントリを足す（`id` / `docPage` / `path` / 必要なら `steps`）。
2. `pnpm docs:shots:one -- --only <id>` で撮影。
3. マニュアルページ（`content/manual/**.md`）に以下を書く:
   - frontmatter: `screenshots: [<id>]`
   - 本文: `![説明](./assets/screenshots/<id>.png)`（ページ位置に応じた相対パス）
4. `pnpm docs:lint` が通ることを確認してコミット。

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
