# ロジック・UI/UX 診断レポート（2026-09-09）

対象: `origin/dev` @ `9825f547`（PR #839 まで。前回点検 `ea20a749` から 35 PR 先）。
Web アプリ（nextjs-web）と共有端末アプリ（nextjs-kiosk）の両方。

前回（`system-inspection-2026-09-04.md`）は業務ロジックと権限の点検で、指摘は #804–#827 で
全部片付いた。今回はその**修正が正しく入ったかの再点検**（回帰・片側だけの修正）と、前回ほとんど
見ていなかった **UI/UX（設計規約への適合・アクセシビリティ・実機での崩れ）** を主題にした。

## 1. 結論（要約）

- **自動検査はすべて緑。** web 2,071 テスト / kiosk 523 / authz-core 51、Biome、`tsc --noEmit`（両アプリ）、
  i18n 鍵の 3 言語一致、用語集の整合、`prisma validate`。
- **実機巡回で UI の欠陥が見つかった。** 使い捨て DB + 本番ビルドで web 260 画面（静的 106 + 詳細/編集 154）を
  デスクトップ幅とスマホ幅（375px）で、共有端末 18 画面を横・縦で巡回した結果:
  - 共有端末の全画面で React #418（ハイドレーション不一致）— **巡回環境の不備**だった（§3.2）。
  - **スマホ幅で 20 画面が横スクロール** — 原因は 1 つで、畳んだ `AppTabs` が測るために残している
    タブ列（絶対配置・`width: max-content`）がページの横幅を押し広げていた（§3.1）。
  - `/sales/price-lists/new` の有効開始日に **「Invalid Date」** が描かれる（§3.1）。
  - 読み上げ環境向けの欠陥が体系的に残っている: 絞り込み欄（検索・状態）の **120 個が名前なし**、
    ページネーションの矢印 4 個が名前なし、SY02 参照表の入力セルが数千個名前なし、ホームと SY02 の
    詳細（スマホ）に見出しが無い。
- **ロジックの再点検では、前回の修正が「片側だけ」だった箇所が 8 つ**（§4.3 の表）。重大なのは
  (a) 締日処理を締日より前に処理できるため、締日までの出荷が**どの窓にも入らず永久に未請求**になる、
  (b) 受入数の権威（サーバ導出）を web には入れたが**共有端末の書き込み経路に入れていない**、の 2 つ。
- **設計規約からの逸脱**は少ない（生の `Button`/`Tabs`/`Stepper` は 5 か所、いずれもポータルか SY0G）。
  残っている最大の規約違反は **日本語の直書き**（生産の工程カード・工程実行・指示書詳細・SY0G・
  価格表コピー・フロアマップなど 15 ファイル）と、`openConfirm()` を `locale` 無しで呼んで
  **英語/中国語利用者にも「戻る」が日本語で出る**箇所（10 か所）。
- **用語集違反**: `messages/ja.json` に「出荷済み / 納品済み」（正: 出荷済 / 納品済）が 19 件、
  「キオスク」（正: 共有端末、決定 13）が 11 件、共有端末の「承認待ち」（正: 承認依頼中、決定 6）。

## 2. 方法

1. 静的検査: 両アプリの lint / typecheck / vitest、`i18n:keys` / `i18n:glossary`、authz-core、
   twin ファイル（`twin-files.test.ts`）。
2. 規約の機械検査（grep）: 生の Mantine `Button` / `Tabs` / `Stepper` / `Avatar`、`ActionIcon` の
   `aria-label`、固定 px 幅、`useColorScheme`、`Popover` の `trapFocus`、用語集の禁止語。
3. **実機巡回**: `tools/docs-screenshots/audit-crawl.ts`（今回追加・コミット済み）。使い捨て DB
   （`pnpm docs:seed` + `e2e-kiosk-fixtures.sql`）に本番ビルドを載せ、画面ごとに
   HTTP 状態 / `pageerror` / `console.error` / 横スクロール / 「undefined・NaN・Invalid Date」の混入 /
   名前の無いボタン / ラベルの無い入力欄 / 見出しの有無 / 44px 未満の押す的（共有端末と工程実行）を集める。
   web は 1280px と 375px、共有端末は横 1280 と縦 800 で回した。
4. コード監査（3 本）: web UI/UX 全域、業務ロジック（販売・出荷・請求・生産・購買の修正 PR 12 本）、
   システム・認証・共有端末（修正 PR 14 本 + 共有端末アプリ全体）。各指摘は該当行を読んで確認した。

## 3. 実機巡回の所見

### 3.1 web（260 画面 × 2 幅）

| 種別 | 件数 | 内容 | 状態 |
|---|---|---|---|
| 横スクロール（375px） | 20 画面 | **全部 `AppTabs` の測定用タブ列が原因**（`/general/tasks` は 787px、価格試算詳細 552px、採番構成 562px、注文明細詳細 497px …）。例外は価格表の新規（明細表）と承認フロー画面の `SegmentedControl` | 修正済み（`.app-tabs-bar-collapsed { overflow: clip }`、`ApplyModeControl` はモバイル縦並び） |
| 本文に "Invalid Date" | 1 画面 | `/sales/price-lists/new` — `emptyVariant()` が `validFrom: ""` を `DatePickerInput` に渡す | 修正済み（`null` に。zod は `nullable().refine`） |
| 見出し（h1–h3）無し | 66 | ホーム（利用者名が `Text`）、SY02 の計算基準・参照表・工具種の詳細（スマホでは `MasterDetailShell` が見出しを落とす）、`/settings` `/admin`（リダイレクト） | 修正済み（ホームは `Title order={2}`、`MasterDetailShell` はスマホの詳細でも見出しを出す） |
| 名前の無いボタン | 458 | Mantine の `Pagination` 矢印（first/prev/next/last）、`NumberInput` の増減ボタン、`Combobox` の ▾ — いずれもライブラリ既定 | ページネーションは修正済み（`getControlProps` で 4 語）。`NumberInput` / `Combobox` は Mantine 側（props が無い）— 保留 |
| ラベルの無い入力欄 | 22,894 | 内訳: SY02 参照表の入力セル（`ld_tip_outer` だけで 3,242）/ 一覧の検索欄と絞り込み `Select`（placeholder のみ、56 ファイル 120 個）/ 一覧に埋め込んだ表の入力 | 修正済み（参照表は「N 行目のキー列 M / 値」、絞り込みは placeholder を `aria-label` に） |
| console 502 / 404 | 16 | Gotenberg / SeaweedFS がローカルに無い（PDF プレビュー・図面サムネイル）— 環境 | 対象外 |

`redirected-to-login` の 4 件は `/settings/login-history` の URL に "login" が含まれる誤検知。

### 3.2 共有端末（18 画面 × 2 向き）

| 種別 | 件数 | 内容 | 状態 |
|---|---|---|---|
| `pageerror` React #418 | 18/18 | **全画面**（未登録端末の `/setup` `/login` も）。`next dev` では出ない。原因は巡回側: kiosk を `NEXT_PUBLIC_APP_VERSION` 無しでビルドし、起動時だけ渡していたため、フッターのバージョン文字列がサーバー（実行時 env）とクライアント（ビルド時に埋め込み）で食い違った。env を揃えると消える。実機は Dockerfile の `ARG` で揃うので出ない | 対象外（README に注意書き） |
| 44px 未満の押す的 | 34 | 「作業場所を読み取り」ボタン 36px（工程実行）、ヘッダーの利用者メニュー 26px、「承認済み・対象外（N 件）」42px、フッターの「CKK 専用端末」18px（5 タップの隠し操作。意図的に目立たせない） | 前 3 つは修正済み（`size="lg"` / `mih={44}`） |
| ラベルの無い入力欄 | 1 | `/wo-scan` の指示書番号（placeholder のみ） | 修正済み |
| 404 | 2 | `/settings` `/profile` — 巡回側の推測 URL。共有端末には無い | 対象外 |

## 4. コード監査の所見

凡例: **H** = 業務データが壊れる / 作業を完了できない / 数字が違う、**M** = 端で誤動作・回避可、**L** = 品質・規約。
「→」は本 PR での扱い。

### 4.1 web の UI/UX

- **H** `components/sales/price-lists/PriceListTypeForm.tsx:164` — 上記「Invalid Date」。→ 修正。
- **M** `components/ui/shells.tsx:334,339` — `DetailShell` の脚注「作成: / 更新:」が直書き。**全詳細画面**に効く。→ 修正（`ui.detailShell.*`）。
- **M** `components/ui/modals.tsx` の `openConfirm()` を `locale` 無しで直接呼ぶ 10 か所（`MemoPanel` / `PriceListTable` / `FormDetail`×2 / `CriterionEditForm` / `LookupTableEditor` / `ToolTypeEditForm` / `SettingsReorderableList` / `LinkAdminPanel` / `RespondForm`）— 英語/中国語の利用者にもキャンセルが「戻る」。実際には `locale` を渡していない直接呼び出しが約 45 か所。→ 呼び出し側は触らず、`openConfirm` の既定言語を `ConfirmLocaleSync`（AppShell）で利用者の言語に写す。
- **M** 日本語の直書き（next-intl を通らない）: `production/StepCard.tsx`（依頼 / 入荷予定 / 完了 / ロット / 半製品 / 廃棄 / 工程分岐 / ほか N 名 / 計画 N 件）、`production/step-execution/StepExecutionView.tsx`（指示書 / 実施先 / 予定数量 / 開始 / 完了、**ロック文の連結** `{name}がこの工程を操作しています`）、`production/work-orders/WorkOrderDetail.tsx`（割当 / 受注 / （最新） / 新しい版の警告）、`settings/privileged/PrivilegedAccessView.tsx`（承認する（N）/ 理由:）、`sales/price-lists/CopyPriceListModal.tsx`（Alert と検証文 4 つ）、`home/HomeSettingsForm.tsx`、`settings/kiosk/KioskFloorMapView.tsx`（ツールチップの連結 / N 台 / このフロア）、`master/inspection-templates/*`、`production/inventory/products/ProductInventoryDetail.tsx`（単位「本」と `toLocaleString("ja-JP")`）、`ui/AttachmentsPanel.tsx`、`forms/ShareGrantsPanel.tsx`（モバイル側のラベル）。→ 修正（ICU 変数の鍵を 3 言語に追加）。
- **M** `components/profile/ProfileView.tsx:450` — 通知端末の「解除」が確認モーダル無し・`loading` 無し（§16.2）。→ 修正。
- **M** `components/settings/privileged/PrivilegedAccessView.tsx:278` — 生の `<Tabs>`（§10.11）。→ `AppTabs`。
- **M** `components/settings/displays/DisplaysTable.tsx:142` — 絞り込みが `useState`（§8.1 は URL）。戻ると消える。→ 修正。
- **L** `components/production/work-orders/WorkflowBuilder.tsx:340` — 計画日の既定が端末ローカル時刻（表示設定のタイムゾーンを見ない）。→ 修正。
- **L** `¥{n.toLocaleString("ja-JP")}` が 13 ファイル（`formatMoney`/`MoneyText` を通らない）。→ 主要 2 か所のみ修正、残りは §6。
- **L** ポータル（`components/portal/*`）の生 `Button` / `Stepper`、`layout/VersionSkewBanner.tsx` の生 `Button` — ポータルは `PreferencesProvider` の外で `buttons.tsx` が使えない構造。→ 保留（§6）。
- **L** `billing/closings/ClosingDetail.tsx` — 概要は DB の `totalAmount`、出荷タブの脚注はクライアント集計。処理後に出荷額が変わると食い違う。→ §6。
- **L** `layout/AppHeader.tsx:168,174` / `notifications/NotificationListView.tsx` — 既読化の結果を捨てている（失敗しても未読数が戻らない）。→ §6。
- 確認できたこと: 保存後の詳細遷移（全フォーム）、Server Action の失敗通知、`loading={isPending}`、`validateInputOnChange` ゼロ、`Popover` の `trapFocus`+`withinPortal`、`revalidatePath`、詳細画面の `EditablePanel` 経由（16 パネル）、固定 px 幅は絞り込み `Select` と数値欄だけ、日付書式は `fmt.*` 経由。

### 4.2 共有端末（nextjs-kiosk）

- 全画面のハイドレーション不一致（React #418）は巡回環境の不備（§3.2）。アプリ側の欠陥ではない。ただし「バージョン文字列はビルド時とサーバー実行時の env が一致している前提」で成り立っているので、Coolify の env を変えたときはビルドし直すこと。
- **H** `lib/step-execution.ts:674` — 受入数の権威（前工程の完了時点の値をサーバが導く。web は #821 で `expectedInput(stepId, ctxAtCompletion)`）が**共有端末に無い**。同期可の工程を前工程より先に始めて端末で完了すると、**端末が送った受入数がそのまま良品数 → 最終工程なら製品在庫**になる。→ 修正（web と同じ導出を移植 + テスト）。
- **M** `lib/workflow.ts:600` / kiosk `step-execution.ts:766` — 工程の COMPLETED クレームと、指示書の完了 + 在庫計上の tx が別。計上が落ちると工程だけ完了して `stepAlreadyCompleted`（巻き戻して再完了で回復できる）。→ §6。
- **M** 押す的の大きさ（§3.2）。→ 修正。
- **L** 「承認待ち {n} 件」→「承認依頼中 {n} 件」（決定 6）。→ 修正（e2e の期待文言も）。

### 4.3 業務ロジック（前回修正の再点検）

| 修正（PR） | 入っている所 | **入っていない所** | 扱い |
|---|---|---|---|
| 承認フロー開始 → 状態変更 の順序（#809/#812） | 注文請書・設計依頼書・PO・購買依頼・社内文書 | **`requestWorkOrderApproval`**（`work-orders/actions.ts:1180`）— フロー開始が失敗すると PENDING_APPROVAL + 明細ロックのまま依頼行が無い | 修正 |
| 受入数の権威 = 完了時点の `expectedInput`（#821） | web `workflow.ts:511` | **kiosk `step-execution.ts:674`** | 修正 |
| 出荷書 SHIPPED を要求（#810） | `markDelivered` | **`issueDeliveryNote`**（出荷競合に負けた出荷書の納品書が発行できる） | 修正 |
| 遷移の tx 内再検査（#812） | PO / 購買依頼の全遷移 | **`receivePurchaseOrderItems`** の tx（`prior` でしか ORDERED を見ない — #826 の短納クローズと競合すると COMPLETED の PO に入荷・在庫計上） | 修正 |
| APPROVED 指示書のキャンセルで予約・ロット解放（#821） | 予約・`lot_number`・`isLocked`・承認行 | **注文明細の IN_PRODUCTION → CONFIRMED 戻し**（未手配なのに在庫照合できない） | 修正 |
| 締日の窓 (前回, 今回]（#810） | 窓の計算・月初の前月オートラン | **「締日に達した」ゲートが無い**（月半ばに処理すると残りの出荷が永久に未請求）／ 期間の始点が顧客の**現在の**締日から計算される（締日を変えると前月末までの出荷が落ちる） | 修正 |
| 別名学習は人の訂正だけ（販売側） | `aliasLearnings` | **購買側（#828）は機械の一致もそのまま学習**（誤一致が次回から自動確定） | 修正 |
| 円未満の丸め `lib/money.ts`（#825） | 請求書・CSV・締め | **見積明細**（`amount` と AMOUNT 値引き） | 修正 |

- **L** `delivery-orders/actions.ts:1111` — 明細の `FOR UPDATE` を並べ替えずに取る（A,B / B,A でデッドロック → 片方 abort）。→ 修正。
- **L** `quotes/actions.ts:343` — `validUntil` の検証が `checkPermission` より前。→ 修正。
- **L** #809 の順序変更後、状態更新が失敗すると DRAFT のまま PENDING 依頼行が残り、再依頼が古い `flow_snapshot` で通る。→ §6。
- 確認できたこと: 価格の有効性は `resolvePriceFromEntries` 1 本（見積・注文請書・価格差異・クライアント）、tier の差分更新、取込の数量検証、出荷 3 ガード + `FOR UPDATE` 後の再読、弥生 CSV の状態/二重ガード、税区分スナップショット、`onWorkOrderCompletedTx` の単発性、完了/中断クレームのロック述語（web/kiosk 同一）、`copyWorkOrder` の分岐除外、購買の行スコープと同一 tx 計上、PU02/PU03 のゲート・未解決行の拒否・単一 tx、通知の表示番号とバックフィルの冪等性。

### 4.4 システム・認証・インフラ

**未実施。** 前回修正（#804/#806/#811/#813–#817/#819/#820/#827）と監査ログの可読化（#836–#839）の
再点検は、監査エージェントが 2 度とも API の利用上限で途中終了し、本レポートの範囲では読めていない。
静的検査（テスト・lint・型・i18n・twin・Server Action ゲートの CI スクリプト）は通っている。
次回の点検の先頭に置く（§6.1）。

## 5. 修正の実施（本 PR）

| 領域 | 直したもの | 場所 |
|---|---|---|
| UI 共通 | 畳んだ AppTabs が横幅を押し広げる（20 画面の横スクロール） | `components/ui/AppTabs.tsx` + `app/globals.css`（`.app-tabs-bar-collapsed { overflow: clip }`）、`_specs/design.md` §10.11 |
| UI 共通 | `DetailShell` 脚注の直書き（作成 / 更新） | `components/ui/shells.tsx`、`ui.detailShell.*` |
| UI 共通 | `openConfirm()` の既定言語が ja 固定（直接呼ぶ約 45 か所で英語/中国語にも「戻る」） | `components/ui/modals.tsx` `ConfirmLocaleSync`（AppShell に 1 つ）— 呼び出し側は無変更で利用者の言語になる |
| UI 共通 | `DataTable` ページネーション矢印の名前 | `getControlProps` + `ui.dataTable.{first,previous,next,last}Page` |
| UI 共通 | 絞り込み欄（検索 `TextInput` / `Select` / `MultiSelect`）120 個の名前 | 56 ファイルに `aria-label={placeholder}` |
| UI 共通 | SY02 参照表の入力セルの名前、SY02 詳細（スマホ）とホームの見出し | `LookupTableEditor`、`MasterDetailShell`、`HomeApps` |
| 販売 | 価格表の新規で「Invalid Date」 | `PriceListTypeForm`（`validFrom: null` + zod `nullable().refine`） |
| 販売 | 価格表コピーの直書き 6 か所 | `CopyPriceListModal` |
| 生産 | 工程カード / 工程実行 / 指示書詳細の直書き（ロック文の連結を含む） | `StepCard` / `StepExecutionView` / `WorkOrderDetail`、`production.*` に鍵 25 個 |
| 生産 | 計画日の既定が端末ローカル時刻 | `WorkflowBuilder`（表示設定のタイムゾーン） |
| システム | SY0G の生 `Tabs`、承認タブ・理由の直書き | `PrivilegedAccessView` → `AppTabs` |
| システム | フロアマップ / ディスプレイ一覧の直書きと `useState` 絞り込み | `KioskFloorMapView`、`DisplaysTable`（URL 検索パラメータ） |
| その他 | 検査表テンプレート / 製品在庫 / 添付 / 共有先 / プロフィール（通知端末の解除に確認と loading） | 各コンポーネント |
| 用語集 | 出荷済み → 出荷済 / 納品済み → 納品済 / キオスク → 共有端末 / 承認待ち → 承認依頼中 | `messages/ja.json`、共有端末 `ja.json`、e2e の期待文言 |
| 共有端末 | 受入数の権威（web #821 と同じ規則）— `resolveReceivedQuantity` を twin の `workflow-core.ts` に切り出して両アプリで共有、試験あり | `lib/step-execution.ts`、`lib/workflow.ts`、`workflow-core.ts`（両アプリ） |
| 共有端末 | 押す的（作業場所の読み取り・利用者メニュー・承認済み折りたたみ）、指示書番号欄の名前 | `StepExecutionView` / `UserMenu` / `StepInspectionApprovalPanel` / `WoScanView` |
| 請求 | 締日を過ぎるまで処理できない（画面と Server Action の両方） | `closings/model.ts` `isProcessable(c, todayIso)` + `closingDateReached`、`actions.ts`、`billing.closingActions.closingDateNotReached` |
| 請求 | 請求期間の始点 = 前回**処理した**締日の翌日 | `model.ts` `billingPeriodStartFrom`、`data.ts` `resolveBillingPeriodStart`（候補の収集と請求書の期間が同じ関数を通る）、試験 |
| 生産 | 指示書の承認依頼: フロー開始 → 状態変更の順に、遷移を条件付きに | `work-orders/actions.ts` `requestWorkOrderApproval` |
| 生産 | APPROVED 指示書のキャンセルで明細を IN_PRODUCTION → CONFIRMED に戻す（他の生きた指示書が無い明細だけ） | `cancelWorkOrder` |
| 購買 | 入荷の tx 内で ORDERED を再確認（短納クローズとの競合） | `receivePurchaseOrderItems` |
| 購買 | 別名学習は**人の訂正だけ**（PU02 は保存された発注書の明細と下書きを並び順で突合、行数が違えば覚えない。PU03 は下書きの自動一致 id を送る） | `lib/purchase-intake.ts`、`purchase-orders/actions.ts` `learnMaterialOrderAliases(poNumber…)`、`material-receipts/intake/actions.ts`、`MaterialReceiptIntake`、`PurchaseOrderNew` |
| 出荷 | 納品書の発行に出荷書 SHIPPED を要求、明細ロックを id 順に | `delivery-notes/actions.ts`、`delivery-orders/actions.ts` |
| 販売 | 見積明細の円未満丸め（`lib/money.ts`）、`issueQuote` の権限→検証の順 | `quotes/actions.ts` |
| ツール | 実機巡回スクリプト | `tools/docs-screenshots/audit-crawl.ts` + README |

再検証（修正後）: web lint / `tsc` / vitest 2,078 / `i18n:keys`（10,764 鍵）/ `i18n:glossary` / 動的鍵検査 /
Server Action ゲート検査、kiosk lint / `tsc` / vitest 525 — すべて緑。twin 12 本のバイト一致。
使い捨て DB + 本番ビルドの再巡回と通し確認の結果は末尾の「再巡回」を参照。

## 6. 改善計画（残り）

### 6.1 次に直す
- **§4.4 の再点検**（システム・認証・共有端末の修正 PR 14 本 + 監査ログ可読化）— 今回読めていない。
- **共有端末の完了クレームを指示書完了・在庫計上と同一 tx に**（web / kiosk 両方）。今は巻き戻しで回復できるが、現場が気づけない。
- `startApprovalFlow` の「既存 PENDING 行」分岐でフローを再解決し、`flow_snapshot` が違えば作り直す。
- Mantine 由来の名前無しボタン（`NumberInput` の増減、`Combobox` の ▾）: テーマの `defaultProps` では付けられない。`NumberInput` を包む共通部品を作るか、Mantine の更新（`getControlProps` 相当）を待つ。
- `¥{n.toLocaleString("ja-JP")}` の残り 11 ファイルを `MoneyText` へ。
- ポータル用の `buttons.tsx`（`useTranslations` を使わない版）を作り、ポータルの生 `Button` / `Stepper` を寄せる。
- 既読化（`markReadAction` / `markAllReadAction`）の失敗を通知し、未読数を `router.refresh()` で戻す。
- 締日処理の詳細（`ClosingDetail`）で処理後は DB の `totalAmount` を脚注にも出す。

### 6.2 仕組みとして残す
- **`audit-crawl.ts` を通し確認の 1 本にする**（`smoke-flows.ts` と同じ前提で動く）。横スクロール・
  Invalid Date・ハイドレーション不一致は単体テストでは捕まらず、今回も巡回でしか見つからなかった。
  CI に載せるなら `e2e-shipping-inspection.yml` と同じ足場（使い捨て DB + 本番ビルド）に相乗りできる。
- **twin の範囲を「ルール」まで広げる**: `step-execution.ts` は byte-identical ではないので
  `twin-files.test.ts` の対象外で、web 側の修正（#821）が届かなかった。完了時の数量導出を純関数に
  切り出して両アプリで同じテストを走らせる。
- **Server Action の状態機械テスト**（前回 §4.3 のまま未着手）: 今回の「片側だけ」8 件はすべて
  遷移表 × 同時実行のテストがあれば設計時に見えていた。
