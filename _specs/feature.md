# Feature Plan

製造業務管理システムの機能実装計画。`_docs/business_flow.md` と `_docs/manufacturing_details.md` に記載の業務フロー、`_specs/tables.md` のデータモデル、`_specs/techstack.md` の技術スタックに基づく。

## 技術スタック概要

| 領域 | 採用技術 |
|------|----------|
| フレームワーク | Next.js 16.x (App Router, Turbopack) |
| UI | Mantine v9 + mantine-datatable + Tabler Icons |
| DB | PostgreSQL 17 + PGroonga / Prisma ORM v7 |
| キャッシュ/Pub-Sub | Valkey 8.1 |
| PDF 生成 | Gotenberg 8.17 |
| ファイル | SeaweedFS |
| リアルタイム | SSE (Next.js Route Handler) |
| 認証 | Auth.js v5 (Samba AD LDAP) |
| バックグラウンドジョブ | BullMQ |
| 国際化 | next-intl + messages/ JSON |
| 会計連携 | 弥生会計 Next (CSV エクスポート) |

---

## §1 価格・見積

### 機能概要

価格表マスタ管理と見積書発行。フロー起点。

### 画面

| パス | 内容 |
|------|------|
| `/sales/price-lists` | 価格表一覧（顧客・製品・有効日フィルタ） |
| `/sales/price-lists/new` | 価格表新規作成 |
| `/sales/price-lists/[id]` | 価格表詳細 |
| `/sales/price-lists/[id]/edit` | 価格表編集 |
| `/sales/quotes` | 見積書一覧（ステータス・顧客フィルタ、PGroonga 全文検索） |
| `/sales/quotes/new` | 見積書新規作成 |
| `/sales/quotes/[id]` | 見積書詳細 |
| `/sales/quotes/[id]/edit` | 見積書編集 |

### 主要機能

- 価格表: 顧客＋製品コード＋注文種別（本番/テスト/サンプル/その他）＋本数範囲 = 単価、有効日管理
- 価格表の自動参照: 見積作成時に顧客・製品・本数から最適な単価を自動提案
- 見積書採番: `QOT-YYYYMM-NNNNN`（`lib/numbering.ts`）
- 見積書 PDF 生成: `app/api/pdf/quote/route.ts` → Gotenberg
- 見積書ステータス管理: `DRAFT → ISSUED → ACCEPTED / REJECTED / EXPIRED`
- 設計依頼書への分岐: 設計図なしの場合 §10 へ起票リンク

### 業務ルール

- 注文種別: 本番 / テスト / サンプル（金額 0）/ その他
- 価格表は有効日範囲で管理（重複・空白は検証で防止）
- 見積書から受注書への転記時のコピー対象を制御（新規品は除外）

---

## §2 注文受付・価格差異

### 機能概要

顧客注文書受領から注文受諾書作成、価格差異照合。

### 画面

| パス | 内容 |
|------|------|
| `/sales/order-acceptances` | 注文受諾書一覧（ステータス・顧客フィルタ） |
| `/sales/order-acceptances/new` | 注文受諾書新規作成 |
| `/sales/order-acceptances/[id]` | 注文受諾書詳細（注文書 PDF 表示含む） |
| `/sales/order-acceptances/[id]/edit` | 注文受諾書編集 |

### 主要機能

- 注文受諾書採番: `ORD-YYYYMM-NNNNN`
- 注文書 PDF アップロード・添付（SeaweedFS）
- 合計金額の自動計算: 受注書の製品・本数・単価から自動集計（手動編集不可）
- 価格差異自動照合: 注文価格と見積価格の比較、差異時は担当者へ通知（SSE / メール）
- ステータス管理: `PENDING → PRICE_DIFF / CONFIRMED`

### 業務ルール

- 顧客は企業・支店の 2 階層
- 合計金額は受注書から自動計算
- 価格差異あり時: 営業担当者に通知し見積を再調整後 §3 へ

---

## §3 受注書・指示書

### 機能概要

受注書と指示書（製造ワークフロー）の作成。

### 画面

| パス | 内容 |
|------|------|
| `/production/sales-orders` | 受注書一覧 |
| `/production/sales-orders/new` | 受注書新規作成 |
| `/production/sales-orders/[id]` | 受注書詳細（注文書 PDF サイドパネル表示） |
| `/production/sales-orders/[id]/edit` | 受注書編集 |
| `/production/work-orders` | 指示書一覧（ステータス・日付フィルタ） |
| `/production/work-orders/new` | 指示書新規作成（工程ワークフロービルダー） |
| `/production/work-orders/[id]` | 指示書詳細（工程ワークフロー表示） |
| `/production/work-orders/[id]/edit` | 指示書編集 |

### 主要機能

- 受注書採番: `ORD-YYYYMM-NNNNN-NN`（注文受諾書コード + 連番）
- 受注書 PDF 生成: `app/api/pdf/sales-order/route.ts`
- ロット番号割当: 通し連番（指示書番号と共用）
- 指示書ワークフロービルダー: 工程マスタから工程を選択し順序・同期設定
- 指示書コピー機能: 同一受注元・製品の最新指示書からのコピー（バージョン変更時は警告）
- 計画本数入力: ワークフロー作成時に入力
- 外注・社内の実施場所設定: 工程ごとに社内 / 外注（企業選択）を指定
- 指示書タイプ: `FROM_STOCK`（在庫分）/ `MANUFACTURE`（製造分）
- 使用依存・実行依存バリデーション: `lib/workflow.ts` で依存関係を検証
- 検査表テンプレートを指示書に複数紐付け: `work_order_inspection_templates`

### 業務ルール

- 製品ごとに受注書 1 行
- ロット番号・本数は必須（定尺材は伝票コード入力）
- 半製品（外部調達）には指示書不要 — 素材受入のみ

---

## §4 製品在庫照合

### 機能概要

受注書に対する製品在庫の 2 段階照合（有無 → 数量）。在庫分は §8 へ直行。

### 画面

| パス | 内容 |
|------|------|
| `/production/inventory/products` | 製品在庫台帳一覧 |
| `/production/inventory/products/[id]` | 製品在庫詳細（引当履歴含む） |

### 主要機能

- 在庫照合 ①: 製品在庫レコードの有無判定（`lib/inventory.ts`）
- 在庫照合 ②: 在庫数量 vs 受注数量の比較
- 在庫引当予約: `inventory_reservations` テーブルへ記録（重複割当防止）
- 分割指示書作成: 在庫不足時に在庫分＋製造分を自動分割
- 在庫分の指示書は §8 出荷フローへ直結

### 業務ルール

- 製品在庫は `product_inventory`（ロット番号付き）
- 引当予約により他受注との重複割当を防止
- 予約解除: 出荷またはキャンセル時

---

## §5 素材判断・素材在庫

### 機能概要

使用素材の決定、素材在庫照合、リブ母材の先行製作判定。

### 画面

| パス | 内容 |
|------|------|
| `/production/inventory/materials` | 素材在庫台帳一覧 |
| `/production/inventory/materials/[id]` | 素材在庫詳細 |
| `/purchase/material-receipts` | 素材入荷一覧 |
| `/purchase/material-receipts/new` | 素材入荷登録 |
| `/purchase/material-receipts/[id]` | 素材入荷詳細 |

### 主要機能

- 素材在庫照合: `material_inventory` テーブルを確認
- リブ母材（半製品）在庫チェックと先行製作指示
- 素材入荷登録: `material_receipts` テーブル、仕入先・入荷日管理
- 素材在庫引当予約

### 業務ルール

- 素材の形態: `POLISHED`（研磨）/ `STANDARD_LENGTH`（定尺）/ `SEMI_FINISHED`（半製品）/ `OTHER`
- 素材が研磨・定尺の場合: 全長合わせが不要なケースあり（工程依存設定で制御）
- 半製品（外部調達）は指示書なし・素材受入のみ

---

## §6 生産判断・部門承認

### 機能概要

2 段階承認（工場長 → 部長）。承認依頼中は受注数量・製品品目をロック。

### 画面

| パス | 内容 |
|------|------|
| `/production/approvals` | 承認待ち一覧（自分が承認者のもの） |
| `/production/approvals/[id]` | 承認詳細・承認操作 |
| `/master/approval-groups` | 承認グループ一覧 |
| `/master/approval-groups/new` | 承認グループ新規作成 |
| `/master/approval-groups/[id]` | 承認グループ詳細 |
| `/master/approval-groups/[id]/edit` | 承認グループ編集（代理設定含む） |

### 主要機能

- 第一承認: 工場長・部長クラス（負荷・日程・設備の判断）
- 第二承認: 部長クラス（コスト・優先度の判断）
- 期間限定代理設定: `approval_delegates` テーブル
- 承認依頼中のロック: 受注数量・製品品目を変更不可にする
- リアルタイム通知: SSE + Valkey Pub/Sub（`app/api/sse/approvals/route.ts`）
- 承認ログ記録: `approval_records` テーブル（承認者・日時・コメント）
- 進行中の製造ワークフロー変更承認: 専用承認グループ（`WORKFLOW_CHANGE`）

### 業務ルール

- 承認グループタイプ: `FIRST`（第一）/ `SECOND`（第二）/ `WORKFLOW_CHANGE`（製造変更）
- 承認ステータス遷移: `NONE → PENDING_1ST → APPROVED_1ST → PENDING_2ND → APPROVED / REJECTED`
- 承認階層参考: 主任 → 係長 → 課長（工場長）→ 部長 → 社長
- 製造ワークフロー変更は即時反映＋変更専用グループ承認が必要

---

## §7 製造ワークフロー実行

### 機能概要

現場での工程実行・記録。SSE によるリアルタイム進捗表示。

### 画面

| パス | 内容 |
|------|------|
| `/production/work-orders/[id]` | 指示書詳細（工程ワークフロー表示） |
| `/production/work-orders/[id]/steps/[stepId]` | 工程実行画面（現場操作） |

### 主要機能

- 工程実行制御: 実行依存（前工程完了）を満たした工程のみ開始可能（`lib/workflow.ts`）
- セッションロック: 同一工程の同時セッション防止（`session_locked_by` / `session_locked_at`）
- 工程ステータス管理: `PENDING → IN_PROGRESS → COMPLETED / CANCELLED`
- 不良記録: 種類（ドロップダウン: `defect_types`）＋詳細テキスト（任意）
- 検査表記録: テンプレートに基づく計測値入力・許容値照合（`inspection_records`）
- 検査承認: 係長以上によるステップ承認（`is_approval_step`）
- 外注工程管理: 依頼日・入荷予定日・入荷日を記録（`work_order_steps`）
- 工程取消・巻き戻し: 実行済み工程の取消（監査ログに理由・操作者を記録）
- 在庫予約維持: 全工程完了まで実在庫は移動しない
- 実在庫移動: 全工程完了後に自動実行（`lib/inventory.ts`）
- リアルタイム進捗: SSE（`app/api/sse/work-orders/[id]/route.ts`）

### 工程マスタ機能

| パス | 内容 |
|------|------|
| `/master/process-steps` | 工程マスタ一覧 |
| `/master/process-steps/new` | 工程マスタ新規作成 |
| `/master/process-steps/[id]` | 工程マスタ詳細 |
| `/master/process-steps/[id]/edit` | 工程マスタ編集（使用依存・実行依存設定含む） |

### 工程一覧（`_docs/manufacturing_details.md` 参照）

#### 材料準備（`MATERIAL_PREP`）

| 工程 | 実施場所 | 同期 | 備考 |
|------|----------|------|------|
| 素材出し（在庫） | 社内 | なし | 在庫の移動 |
| 半製品出し（在庫） | 社内 | なし | リブ母材含む |
| 素材受渡し（受注先） | 社内 | なし | — |
| 製品受渡し（受注先） | 社内 | なし | — |
| 切断 | 社内 | なし | 複数回あり |
| センタレス | 社内・外注 | なし | 外注時: 依頼日・入荷予定日・入荷日管理 |
| 円筒加工 | 社内 | なし | 使用依存: 円筒加工検査・検査承認を含むこと |
| 円筒加工検査 | 社内 | なし | 実行依存: 円筒加工完了 |
| 円筒加工検査承認 | 社内 | なし | 係長以上が承認 |
| 全長合わせ | 社内 | なし | 実行依存: センタレス or 円筒加工検査承認 or 素材が研磨 |
| C 面 | 社内 | なし | 実行依存: 全長合わせ完了 |

#### 加工・コーティング（`MACHINING` / `COATING` / `INSPECTION` / `APPROVAL`）

| 工程 | 実施場所 | 同期 | 備考 |
|------|----------|------|------|
| マーキング | 社内 | なし | 実行依存: 素材準備済み and 円筒検査承認 |
| 段加工 | 社内 | あり | 他工程と同時実施可。使用依存: 段加工検査・検査承認を含むこと |
| 段加工検査 | 社内 | なし | 実行依存: 段加工完了 |
| 段加工検査承認 | 社内 | なし | 係長以上が承認 |
| タング | 社内 | なし | 実行依存: 素材準備済み |
| 油溝 | 社内 | なし | 実行依存: 素材準備済み |
| 溝（製作） | 社内 | あり | 排他: 刃裏（製作）と共存不可。使用依存: 製作検査・検査承認を含むこと |
| 刃裏（製作） | 社内 | あり | 排他: 溝（製作）と共存不可 |
| 外周（製作） | 社内 | あり | 実行依存: 素材準備済み and 溝完了 and 円筒検査承認 |
| 先端（製作） | 社内 | あり | 実行依存: 素材準備済み and 溝完了 and 円筒検査承認 |
| ホーニング | 社内 | なし | 実行依存: 先端完了 |
| 製作検査 | 社内 | なし | 実行依存: 製作完了 |
| 製作検査承認 | 社内 | なし | 係長以上が承認 |
| 首逃し | 社内 | あり | 段加工と同時実施・記録する場合あり |
| 首逃し検査 | 社内 | なし | 実行依存: 首逃し完了 |
| 首逃し検査承認 | 社内 | なし | 係長以上が承認 |
| LD | 社内 | なし | 実行依存: 製作検査承認完了 |
| LD 検査 | 社内 | なし | 写真撮影の有無を確認 |
| SMAP | 社内 | なし | 実行依存: 製作検査承認・コーティング・LD すべて完了。複数回あり |
| コーティング | 社内・外注 | なし | 実行依存: 製作検査承認完了 |
| 後 SMAP | 社内 | なし | 実行依存: 製作検査承認 and（コーティング or LD）完了 |
| 客先向け検査 1（加工後） | 社内 | なし | 実行依存: 製作検査承認完了 |
| 客先向け検査 1 承認（加工後） | 社内 | なし | 係長以上が承認 |
| 客先向け検査 2（コーティング後） | 社内 | なし | 実行依存: コーティング完了 |
| 客先向け検査 2 承認（コーティング後） | 社内 | なし | 係長以上が承認 |
| 出荷前検査 | 社内 | — | 全工程完了後。再研磨・在庫済み検査の場合は省略可 |
| 出荷 | 社内 | — | 梱包・納品書作成・送り状 |

### 業務ルール

- **ステップ順序**: 実行依存（前工程完了）に基づく動的順序制御。設備故障等で順序変更可能
- **同時実行制限**: 同一工程で同時セッション不可
- **検査必須ルール**: 円筒加工・段加工・製作・首逃し等を含む場合、対応する「〇〇検査」「〇〇検査承認」が必須（省略不可）
- **同期工程**: 段加工・溝・外周・先端・首逃し等は `is_sync_capable = true` で同時実施・記録可
- 開始担当者と完了担当者が異なる場合あり（`started_by` / `completed_by` を別記録）
- 順序変更は監査ログに記録（理由・判断者）

---

## §8 出荷・納品

### 機能概要

出荷書・納品書の作成。在庫保管 or 発送の分岐。ユーザー直送 or 通常納品。

### 画面

| パス | 内容 |
|------|------|
| `/shipping/shipping-orders` | 出荷書一覧 |
| `/shipping/shipping-orders/new` | 出荷書新規作成 |
| `/shipping/shipping-orders/[id]` | 出荷書詳細 |
| `/shipping/shipping-orders/[id]/edit` | 出荷書編集 |
| `/shipping/delivery-notes` | 納品書一覧 |
| `/shipping/delivery-notes/new` | 納品書新規作成 |
| `/shipping/delivery-notes/[id]` | 納品書詳細 |
| `/shipping/delivery-notes/[id]/edit` | 納品書編集 |

### 主要機能

- 出荷書作成: 在庫分・製造完了分の品目・数量・出荷先
- 出荷タイプ: `STOCK_STORAGE`（在庫保管）/ `DISPATCH`（発送）
- 在庫保管: 予備製作分。請求フロー外。在庫台帳を確定更新
- 発送記録: 会計連携（§9）のトリガ
- 納品書採番: `DRN-YYYYMM-NNNNN`（`lib/numbering.ts`）
- 納品書 PDF 生成: `app/api/pdf/delivery-note/route.ts` → Gotenberg
- 配送方法分岐:
  - `DIRECT_TO_USER`: 完了書に価格記載なし、納品書は受注先経由で別送
  - `NORMAL`: 受注先へ発送、納品書同梱
- `include_price` フラグ: 納品書に価格を記載するか制御
- 出荷書 PDF 生成: `app/api/pdf/shipping-order/route.ts`

### 業務ルール

- 出荷対象: §4 在庫分または §7 全工程完了分
- 在庫台帳の出荷確定更新は発送時（在庫保管は別処理）
- 在庫保管分は請求フロー（§9）の対象外

---

## §9 会計・請求

### 機能概要

締日処理、請求書生成、弥生会計 Next へのCSVエクスポート。

### 画面

| パス | 内容 |
|------|------|
| `/billing/invoices` | 請求書一覧 |
| `/billing/invoices/[id]` | 請求書詳細 |
| `/billing/closings` | 締日処理一覧 |
| `/billing/closings/[id]` | 締日処理詳細 |

### 主要機能

- 締日処理: 月次バッチで対象発送レコードを集計
- 請求書採番: `INV-YYYYMM-NNNNN`（`lib/numbering.ts`）
- 請求書 PDF 生成: `app/api/pdf/invoice/route.ts` → Gotenberg
- 弥生会計 Next CSV エクスポート: `app/api/export/yayoi/route.ts` → `lib/csv-export.ts`
- 仕訳生成: `lib/journal.ts`（弥生連携用）
- 請求書ステータス: `DRAFT → ISSUED → SENT → PAID`
- 締日処理ステータス: `PENDING → PROCESSED → EXPORTED`

### 業務ルール

- 締日処理トリガ: §8 の発送記録
- 弥生会計連携: 締日処理完了後に CSV エクスポート
- エクスポート済みフラグ: `yayoi_exported_at` で管理（二重エクスポート防止）

---

## §10 設計依頼（任意）

### 機能概要

設計図がない場合に §1 または §3 と並行して起票。

### 画面

| パス | 内容 |
|------|------|
| `/sales/design-requests` | 設計依頼書一覧 |
| `/sales/design-requests/new` | 設計依頼書新規作成 |
| `/sales/design-requests/[id]` | 設計依頼書詳細 |
| `/sales/design-requests/[id]/edit` | 設計依頼書編集 |

### 主要機能

- 設計依頼書起票: 見積時（§1）または受注時（§3）
- 設計図アップロード: SeaweedFS に保存（`design_files` テーブル）
- バージョン管理: `version` + `is_latest` フラグ
- 完了通知: 営業・営業補助へ SSE / メール通知
- 製品への反映: `products.design_file_id` を更新
- ステータス: `PENDING → IN_PROGRESS → COMPLETED`

### 業務ルール

- 起票トリガ: `DESIGN_TRIGGER.QUOTE`（見積時）/ `DESIGN_TRIGGER.SALES_ORDER`（受注時）
- 設計依頼書は任意（設計図がある場合は不要）

---

## マスタ管理

### 顧客マスタ

| パス | 内容 |
|------|------|
| `/master/customers` | 顧客一覧 |
| `/master/customers/new` | 顧客新規作成 |
| `/master/customers/[id]` | 顧客詳細 |
| `/master/customers/[id]/edit` | 顧客編集 |
| `/master/customers/[id]/branches/new` | 支店新規作成 |
| `/master/customers/[id]/branches/[branchId]` | 支店詳細 |
| `/master/customers/[id]/branches/[branchId]/edit` | 支店編集 |

- 顧客は企業・支店の 2 階層（`business_partners` + `bp_customer_attrs`）
- `name` / `short_name` は `{ ja: '', en: '' }` JSON

### 最終需要家（エンドユーザー）マスタ

| パス | 内容 |
|------|------|
| `/master/end-users` | 最終需要家一覧 |
| `/master/end-users/new` | 最終需要家新規作成 |
| `/master/end-users/[id]` | 詳細 |
| `/master/end-users/[id]/edit` | 編集 |

- 大口ユーザーのみ任意登録（`bp_end_user_attrs`）

### 製品マスタ

| パス | 内容 |
|------|------|
| `/master/products` | 製品一覧（PGroonga 全文検索） |
| `/master/products/new` | 製品新規作成 |
| `/master/products/[id]` | 製品詳細 |
| `/master/products/[id]/edit` | 製品編集 |

- 製品コード: `PRD-YYYYMM-NNNN`
- 仕様は `spec` JSON フィールドに自由記述
- `design_file_id` で最新設計図を参照

### 材種・素材マスタ

| パス | 内容 |
|------|------|
| `/master/material-types` | 材種一覧 |
| `/master/material-types/new` | 材種新規作成 |
| `/master/material-types/[id]` | 材種詳細 |
| `/master/material-types/[id]/edit` | 材種編集 |
| `/master/materials` | 素材一覧 |
| `/master/materials/new` | 素材新規作成 |
| `/master/materials/[id]` | 素材詳細 |
| `/master/materials/[id]/edit` | 素材編集 |

- 材種コード: `[A-Z][0-9]{2}[A-Z][0-9]{4}`（例: `A01A0001`）
- 素材コード: `[材種コード]-[A-C][0-9]{3}-[0-9]{3}`（例: `A01A0001-A001-001`）

### 外注企業マスタ（仕入先）

| パス | 内容 |
|------|------|
| `/master/suppliers` | 外注企業一覧 |
| `/master/suppliers/new` | 外注企業新規作成 |
| `/master/suppliers/[id]` | 詳細 |
| `/master/suppliers/[id]/edit` | 編集 |

- `bp_vendor_attrs` で外注先（`OUTSOURCE`）/ 仕入先（`SUPPLIER`）を区別

### 検査表テンプレート

| パス | 内容 |
|------|------|
| `/master/inspection-templates` | 検査表テンプレート一覧 |
| `/master/inspection-templates/new` | 新規作成 |
| `/master/inspection-templates/[id]` | 詳細 |
| `/master/inspection-templates/[id]/edit` | 編集（テンプレート項目・許容値設定） |

- テンプレートは `inspection_template_items` で項目・許容値を管理
- 指示書には複数テンプレートを紐付け可能

### 不良種類マスタ

| パス | 内容 |
|------|------|
| `/master/defect-types` | 不良種類一覧 |
| `/master/defect-types/new` | 新規作成 |

---

## 横断的機能

### 認証・RBAC

- Auth.js v5 によるログイン（Samba AD LDAP/OAuth）
- DB セッション + Short JWT
- `user_permissions` ビューで権限照合（raw テーブル直参照禁止）
- RBAC スコープ: `ALL / REGION / COUNTRY / FACTORY / DEPARTMENT / TEAM / SUB / OWN`
- Middleware でルート保護

### 採番（`lib/numbering.ts`）

| キー | プレフィックス | 形式 |
|------|--------------|------|
| `QUOTE` | `QOT` | `QOT-YYYYMM-NNNNN` |
| `ORDER_ACCEPT` | `ORD` | `ORD-YYYYMM-NNNNN` |
| `DELIVERY` | `DRN` | `DRN-YYYYMM-NNNNN` |
| `INVOICE` | `INV` | `INV-YYYYMM-NNNNN` |

月次リセット付き（`numbering_sequences` テーブル）。指示書・ロット番号は通し連番。

### PDF 生成

- Gotenberg コンテナへ HTML + vanilla CSS テンプレートを送信（ヘッドレスブラウザ不使用）
- 各ドキュメントに専用ルート（`app/api/pdf/`）
- 生成 PDF は SeaweedFS に保存し `files` テーブルで参照

### リアルタイム通知（SSE + Valkey）

| エンドポイント | 用途 |
|---------------|------|
| `app/api/sse/work-orders/[id]/route.ts` | 製造進捗のリアルタイム更新 |
| `app/api/sse/approvals/route.ts` | 承認通知 |

- Valkey Pub/Sub でサーバー間のイベント伝搬
- Valkey Presence: 指示書閲覧中ユーザーを TTL 付きキーで管理

### ロギング・監査

- アプリケーションログ: `pino` → Loki
- 行レベル監査: `audit_logs`（`before_data` / `after_data` JSON）
- システムログ: `system_logs`（ログイン・PDF生成・CSV出力等）
- Nginx アクセスログ → Loki（Alloy 経由）

### 国際化（`next-intl`）

- UI 文字列: `messages/` JSON（ja / en）
- DB の多言語フィールド: `{ ja: '', en: '' }` JSON — **必ず両ロケール記入**

### バックグラウンドジョブ（BullMQ + Valkey）

| ジョブ | 処理 |
|--------|------|
| AD 同期 | Samba AD → PostgreSQL 従業員同期（BullMQ repeatable job） |
| 締日処理 | 月次の請求データ生成 |

### ファイルストレージ（SeaweedFS S3 API）

- 設計図、注文書 PDF、生成 PDF（見積書・納品書・請求書等）を保存
- `files` テーブルで `storage_key` + `filename` + `mime_type` を管理

---

## 採番ルール

| ドキュメント | 形式 | 例 |
|--------------|------|----|
| 材種コード | `[A-Z][0-9]{2}[A-Z][0-9]{4}` | `A01A0001` |
| 素材コード | `[材種コード]-[A-C][0-9]{3}-[0-9]{3}` | `A01A0001-A001-001` |
| 製品コード | `PRD-YYYYMM-NNNN` | `PRD-2601-0001` |
| 見積書 | `QOT-YYYYMM-NNNNN` | `QOT-2601-00001` |
| 注文受取書 | `ORD-YYYYMM-NNNNN` | `ORD-2601-00001` |
| 受注書 | `[注文受取書コード]-NN` | `ORD-2601-00001-01` |
| 指示書番号 | 通し連番 | `1031` |
| ロット番号 | 通し連番（指示書番号と共用） | `1031` |
| 納品書 | `DRN-YYYYMM-NNNNN` | `DRN-2601-00001` |
| 請求書 | `INV-YYYYMM-NNNNN` | `INV-2601-00001` |

---

## 実装優先順位

| 優先度 | セクション | 理由 |
|--------|-----------|------|
| 1 | マスタ管理（顧客・製品・材種・素材・外注・工程・検査表・不良種類） | 全機能の前提データ |
| 2 | 認証・RBAC | 全画面に必要 |
| 3 | §1 価格・見積 | フロー起点 |
| 4 | §2 注文受付 | §1 の続き |
| 5 | §3 受注書・指示書 | 製造の入口 |
| 6 | §4・§5 在庫照合・素材判断 | §3 の続き |
| 7 | §6 承認 | §5 の続き |
| 8 | §7 製造ワークフロー | コア機能（SSE 含む） |
| 9 | §8 出荷・納品 | §7 の続き |
| 10 | §9 請求・会計連携 | フロー終端 |
| 11 | §10 設計依頼 | 任意フロー |

---

## 関連ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| `_docs/business_flow.md` | 業務フロー全体（Mermaid + kai-swimlane）|
| `_docs/manufacturing_details.md` | 製造工程一覧・使用依存・実行依存・同期設定 |
| `_specs/tables.md` | データベーステーブル定義 |
| `_specs/techstack.md` | 技術スタック詳細 |
| `_specs/structure.md` | ディレクトリ構成 |
