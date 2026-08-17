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
  出荷元（`shipping_orders.from_plant_id`）・入荷先（`material_receipts.plant_id`）から参照

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
