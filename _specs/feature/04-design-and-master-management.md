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

### 組織マスタ（多拠点）

| パス | 内容 |
|------|------|
| `/master/org-units` | 組織ツリー + 一覧 |
| `/master/org-units/new` | 組織ノード新規作成 |
| `/master/org-units/[id]` | 詳細（所属ユーザー・下位組織タブ） |
| `/master/org-units/[id]/edit` | 編集 |

- 階層: `REGION > COUNTRY > FACTORY > DEPARTMENT > TEAM`（`org_units`）
- `FACTORY` ノードは `timezone`（IANA）・`default_currency`（ISO 4217）・`accounting_system` が必須
- ユーザー所属は `user_org_assignments`（主所属 1 件 + 兼務複数可）— AD 同期で部門情報を自動割当、手動補正可
- RBAC スコープ（REGION/COUNTRY/FACTORY/DEPARTMENT/TEAM）の解決基盤。詳細は `05-cross-cutting-and-appendix.md` 参照
