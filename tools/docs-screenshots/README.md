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
  --skip-seed production-demo-seed.sql
```

> スキーマやテーブル名が変わったら、**シードとマニフェストの両方**が置き去りに
> なる。シードは psql のエラーですぐ分かるが、マニフェストの `steps`（ラベル待ち・
> クエリパラメータ）は 60 秒タイムアウトで初めて気づくので、UI 文言を変えたら
> `pnpm docs:shots` を通しておくこと。過去に order_lines 統合と承認フロー刷新で
> 両方が同時に腐り、しばらく撮影自体ができなくなっていた。

PNG は `coolify/apps/nextjs-web/content/manual/assets/screenshots/<id>.png` に
出力され、**マニュアルと一緒にコミットする**。

## 通し確認（smoke-flows.ts）

撮影とは別に、**画面を実際に操作して通しで確かめる**ための使い捨てスクリプト。
この仕組み（一時 DB + 本番ビルド + Playwright）がそのまま使えるので同居させている。
CI では動かさない — 実行するのは人が「今の変更を通しで見たい」ときだけ。

```bash
pnpm docs:seed                      # 一時 DB を起動したまま残す
cd ../../coolify/apps/nextjs-web && pnpm build
DATABASE_URL="postgresql://postgres:shots@127.0.0.1:55432/ckk" \
  AUTH_SECRET="docs-screenshots-fixed-secret-not-production" \
  AUTH_URL="http://localhost:3100" NODE_ENV=production \
  pnpm exec next start -p 3100 &
cd - && pnpm exec tsx smoke-flows.ts   # PASS/FAIL を並べて表示
docker rm -f ckk-shots-db              # 後始末
```

いま見ているもの:

- タブ（`AppTabs`）が幅に収まらないときだけドロップダウンへ畳み、広げると戻る
- 承認・予定 (CM01) のタブ表示設定が保存され、隠したタブの URL でも空にならない
- 申請・報告フォームの完了通知 — 共有設定で「完了通知」を付ける → 別の人が提出 →
  CM01「完了した申請」に未読で出る → 開くと既読になる
- 多言語の名称欄（`LocalizedTextInput`）— 打った文字がそのまま欄に入り、日本語も
  他言語も保存される（MS0D 作業場所・地域）。`jaProps.onChange` は**値ではなく
  イベント**を受け取るので、`onChange: setNameJa` と書くと欄が `[object Object]`
  になり保存が落ちる（実際に起きた）
- MS0D 作業場所が携帯幅（390px）で読める — 6 列の表は 1 行 = 1 件へ、4 つのボタン列は
  「⋯」へ畳み、広げれば表に戻る（判断は端末ではなく**幅**）

**書き足すときの約束**: 落ちたときに何が起きたかが分かるよう、`check()` の第 3 引数に
実測値（URL・幅・ラベル）を渡すこと。合否だけだと原因を追えない。

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
