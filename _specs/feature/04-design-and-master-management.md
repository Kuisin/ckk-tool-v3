# Design Requests and Master Data

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

- 設計依頼書起票: 見積時（§1）または受注時（§3）。導線は 見積書詳細 /
  注文明細詳細 / 見積明細の単価未解決（`?quote=` `?orderLine=` `?product=`）
- 担当者指定: `design_requests.assignee_id` — 図面をつくる製造担当を 1 名。
  §10 の「依頼通知を製造担当へ」はこの列で宛先が定まる
- **依頼区分 `kind`（新規 / 改訂）— 自動判定して保存する。** 規則は「その製品に
  `design_files` の行があるか」。**製品は必須**（判定に要るため。名称と単位だけで
  製品は登録できるので、新規品でも「先に登録する」で回る）。導出値にしないのは、
  区分が承認ルートを決めるから — 別の依頼が先に完了した瞬間に値が動くと、
  承認済みのルートと食い違う（`flow_snapshot` と同じ理由）。人が上書きしたら
  `kind_overridden` を立てて尊重し、画面には判定の根拠を出す
- 改訂の付随項目: `base_design_file_id`（元図面。既定 = 判定時点の最新版）と
  `change_reason`（必須）。**完了時に元図面が最新でなくなっていれば履歴と監査に
  残す** — 依頼中に別の改訂が先に完了した、を黙って上書きさせない
- `desired_at`（希望納期）/ `priority`（NORMAL / HIGH）
- 承認フロー: `approval_flows.target_type = 'design_requests'`（段構成は承認設定
  MS0B。条件は **トリガー / 依頼区分 / 優先度** — 「新規は部長承認・改訂は係長」
  「急ぎは 1 段」といった分岐が組める）。承認が通ってはじめて着手できる
- 設計図アップロード: SeaweedFS に保存（`design_files` テーブル）。添付できるのは
  **承認済〜完了前**（`PENDING` / `IN_PROGRESS`）だけ
- バージョン管理: `version` + `is_latest` フラグ。**1 回の完了 = 1 版**で、
  その版は「主図面 1 枚 + 参考資料 0..N 枚」（`design_files.role`）。同時に出した
  ファイルは同じ `version` を共有する — `version` は改訂世代であってファイルの
  通し番号ではないため。製品の最新図面 = `is_latest` かつ `role = PRIMARY`
- 添付の受付形式は**制限しない**（図面・3D・仕様書と何が来るか決められないため）。
  代わりに**ブラウザ内で開くのを PDF / 画像 / 3D だけに絞る**
  （`lib/attachments.ts` `isInlineSafe` が唯一の判定元。SVG / HTML を inline で
  返すと保存 XSS になる）。それ以外は必ずダウンロード扱い + `nosniff` + CSP sandbox
- 通知: 起票・担当変更 → 担当者 / 承認完了 → 担当者（着手の合図）/
  着手 → 依頼者 / 完了 → 依頼者 + 見積の営業担当（`notifications` type `DESIGN`）
- 帳票: `/api/pdf/design-request`（承認済み以降のみ。`isIssuedDesign`）
- ステータス: `DRAFT → REQUESTED → PENDING → IN_PROGRESS → COMPLETED`
  （+ `REJECTED` / `CANCELLED`）

### 業務ルール

- 起票トリガ: `DESIGN_TRIGGER.QUOTE`（見積時）/ `DESIGN_TRIGGER.SALES_ORDER`（受注時）/
  `DESIGN_TRIGGER.STANDALONE`（単独 — 見積にも受注にも紐づかない。新製品の検討・
  客先からの事前相談・社内改善。参照元は両方 null）
- 設計依頼書は任意（設計図がある場合は不要）
- 編集できるのは `DRAFT` / `REJECTED` のみ。ただし **担当者の付け替えは承認後
  （`PENDING` / `IN_PROGRESS`）でもできる** — 承認の対象は「何を設計するか」で
  あって「誰がつくるか」ではないため、専用のアクションに割ってある。
  製品は必須かつ承認前にしか変えられない（変えると区分が動くため）
- `COMPLETED → IN_PROGRESS` の差し戻しは**作業の巻き戻し**で、承認軸の
  `REJECTED` とは別物。承認記録には触らず、承認は取りなおさない
- **製品への反映は `design_files.product_id` + `is_latest`**。
  `products.design_file_id` という列は存在しない（旧記述は誤り）。版採番と
  両側の `is_latest` クリアは `completeDesign` の 1 トランザクションが唯一の
  管理者で、マスタ側に第 2 の書き込み口は作らない（`is_latest` が 2 行に
  なるうえ、図面が変わった理由を追えなくなるため）

---

## マスタ管理

### 拠点マスタ

| パス | 内容 |
|------|------|
| `/master/plants` | 拠点一覧 |
| `/master/plants/new` | 拠点新規作成 |
| `/master/plants/[id]` | 拠点詳細 |
| `/master/plants/[id]/edit` | 拠点編集 |

- 拠点（`plants`）は製造・在庫・出荷の拠点。`SCOPE.PLANT` の実体
- `name` は `{ ja: '', en: '' }` JSON、`code` で一意
- 在庫（`product_inventory` / `material_inventory`）・工程実行（`work_order_steps.plant_id`）・
  出荷元（`delivery_orders.from_plant_id`）・入荷先（`material_receipts.plant_id`）から参照

### 取引先マスタ（顧客・最終需要家・仕入先/外注先を統合）

| パス | 内容 |
|------|------|
| `/master/business-partners` | 取引先一覧（ロール・状態でフィルタ） |
| `/master/business-partners/new` | 取引先新規作成 |
| `/master/business-partners/[id]` | 取引先詳細 |
| `/master/business-partners/[id]/edit` | 取引先編集（ロール付与もここ） |
| `/master/business-partners/[id]/branches/new` | 支店新規作成 |
| `/master/business-partners/[id]/branches/[branchId]` | 支店詳細 |
| `/master/business-partners/[id]/branches/[branchId]/edit` | 支店編集 |

- **1 法人 = `business_partners` 1 行**。まず取引先を登録し、そのあと
  `bp_role_assignments` に **ロール**（`CUSTOMER` / `END_USER` / `VENDOR`）を付与して
  使う。1 法人が複数ロールを兼ねられる（例: 顧客かつ最終需要家）
- ロール固有の属性はロールごとの表に持つ:
  `bp_customer_attrs`（締日・支払条件・請求先・課税区分・請求書送付方法・委託先）/
  `bp_end_user_attrs`（業種）/
  `bp_vendor_attrs`（外注種別 `SUPPLIER`/`OUTSOURCE`・支払条件・標準リードタイム・振込先）
- ロールを外すときは割当行を消さず `is_active=false` + `deactivated_at` に落とす
  （属性は残るので付け直せば復帰）。各書類のセレクトは
  `roleAssignments: { some: { role, isActive: true } }` で絞る
- 企業・支店の 2 階層（支店は `parent_id` 子行。BPコードは `親コード-NN`）
- `name` / `short_name` は `{ ja: '', en: '' }` JSON
- 旧 `/master/customers` `/master/end-users` `/master/suppliers`（MS01/MS02/MS03）は
  廃止し、この 1 アプリ（`MS01`）へ 308 リダイレクト。`MS02` / `MS03` は欠番

### 製品マスタ

| パス | 内容 |
|------|------|
| `/master/products` | 製品一覧（PGroonga 全文検索） |
| `/master/products/new` | 製品新規作成 |
| `/master/products/[id]` | 製品詳細 |
| `/master/products/[id]/edit` | 製品編集 |

- 製品コード: `PRD-YYYYMM-NNNN`
- 仕様は `spec` JSON フィールドに自由記述
- 最新設計図は `design_files`（`product_id` + `is_latest`）から引く
  — 製品側に `design_file_id` 列は持たない（差し替えは §10 の完了経由のみ）

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

- 材種コード: `[A-Z][0-9]{2}[ABC-Z][0-9]{4}`（例: `B01B0001`）= メーカー＋メーカー材種＋形状＋種類
  （構成マスタ: `material_manufacturers` / `material_manufacturer_grades` / `material_shapes` / `material_kinds`）
- 素材コード: `[材種コード]-[A-C][0-9]{3}-[0-9]{3}`（例: `B01B0001-A083-330`）= 材種＋黒皮研磨＋直径＋全長
  （構成マスタ: `material_surface_finishes` / `material_diameters` / `material_length_variants`。採番表 ver1.2 準拠）

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
