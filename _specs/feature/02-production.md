# Production / Inventory / Approvals

## §4 製品在庫照合

### 機能概要

注文請書に対する製品在庫の 2 段階照合（有無 → 数量）。在庫分は §8 へ直行。

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

- 製品在庫は `product_inventory`（ロット番号付き・`factory_id` で工場別保有）
- 引当予約により他受注との重複割当を防止
- 予約解除: 出荷またはキャンセル時

---

## §5 素材判断・素材在庫

### 機能概要

使用素材の決定、素材在庫照合、リブ母材の先行製作判定。

### 画面

| パス | 内容 |
|------|------|
| `/production/inventory/materials` | 素材在庫台帳一覧（工場別） |
| `/production/inventory/materials/[id]` | 素材在庫詳細 |
| `/purchase/purchase-orders` | 素材発注書一覧 |
| `/purchase/purchase-orders/new` | 素材発注書作成 |
| `/purchase/purchase-orders/[id]` | 素材発注書詳細（承認状況・明細・入荷状況） |
| `/purchase/purchase-orders/[id]/edit` | 素材発注書編集（DRAFT 時のみ） |
| `/purchase/material-receipts` | 素材入荷一覧 |
| `/purchase/material-receipts/new` | 素材入荷登録 |
| `/purchase/material-receipts/[id]` | 素材入荷詳細 |

### 主要機能

- 素材在庫照合: `material_inventory` テーブルを確認（`factory_id` で工場別に保有）
- リブ母材（半製品）在庫チェックと先行製作指示
- **素材発注書（承認フロー）**: `material_purchase_orders` + `material_purchase_order_items`（素材×工場×数量×単価）。
  承認者は `material_purchase_approvers`（承認グループ or 個人）。PDF: `app/api/pdf/purchase-order`
- 素材入荷登録: `material_receipts` テーブル、仕入先・入荷日・入荷工場（`factory_id`）管理。
  発注明細（`purchase_order_item_id`）と紐付け可能（発注経由の入荷）
- 素材在庫引当予約: 発注 `ORDERED` 時は入荷予定として在庫予約（`lib/purchasing.ts`）

### 業務ルール

- 発注ステータス遷移: `DRAFT → REQUESTED → APPROVED → ORDERED → COMPLETED`（任意で `CANCELLED`）。
  状態遷移は `history` JSON に記録（操作・操作者・日時）
- `DRAFT` のみ編集可。`REQUESTED` 以降は承認者の承認/差し戻しで進行
- `ORDERED` で入荷予定（在庫予約）追加、`COMPLETED` で実在庫増（入荷工場へ計上）
- 素材の形態は材種コード（黒皮/研磨 = `surface_finish_code`）・素材コードで表現（`tables.md` 参照）
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
- 実行工場: 社内工程は `work_order_steps.factory_id`、外注は `supplier_bp_id`
- セッションロック: 同一工程の同時セッション防止（`session_locked_by` / `session_locked_at`）
- 工程ステータス管理: `PENDING → IN_PROGRESS → COMPLETED / CANCELLED`
- **工程間数量伝播**: 各工程で受入数（`input_quantity`）→ 良品数（`output_success_quantity`）を記録。
  良品数が次工程の受入数になる
- **不良の振り分け**: 不良を `output_defect_semi_finished`（半製品在庫へ）/ `output_defect_scrap`（廃棄）/
  `output_defect_rework`（手直し・追加工程へ）に分類して数量記録
- **ワークフロー分岐・合流（DAG）**: `work_order_step_links`（`source_step_id` → `target_step_id` + `routed_quantity`）で
  ロットの分割・合流を表現。手直し分の再投入や半製品の別系列への流し込みに対応
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
- **数量整合**: 各工程の `output_success + output_defect_*` 合計は `input_quantity` と一致。
  分岐時は `work_order_step_links.routed_quantity` の合計が出力数量に一致
- **手直し（rework）**: `output_defect_rework` 分は分岐リンクで追加工程系列へ流し、完了後に合流可能
- 開始担当者と完了担当者が異なる場合あり（`started_by` / `completed_by` を別記録）
- 順序変更は監査ログに記録（理由・判断者）
