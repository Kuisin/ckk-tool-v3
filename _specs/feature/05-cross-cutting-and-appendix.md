# Cross-Cutting Features and Appendix

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
| `PURCHASE_ORDER` | `PO` | `PO-YYYYMM-NNNNN` |
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
| 材種コード | `[A-Z][0-9]{2}[ABC-Z][0-9]{4}` | `B01B0001` |
| 素材コード | `[材種コード]-[A-C][0-9]{3}-[0-9]{3}` | `B01B0001-A083-330` |
| 製品コード | `PRD-YYYYMM-NNNN` | `PRD-2601-0001` |
| 見積書 | `QOT-YYYYMM-NNNNN` | `QOT-2601-00001` |
| 注文受取書 | `ORD-YYYYMM-NNNNN` | `ORD-2601-00001` |
| 受注書 | `[注文受取書コード]-NN` | `ORD-2601-00001-01` |
| 素材発注書 | `PO-YYYYMM-NNNNN` | `PO-2601-00001` |
| 指示書番号 | 通し連番 | `1031` |
| ロット番号 | 通し連番（指示書番号と共用） | `1031` |
| 納品書 | `DRN-YYYYMM-NNNNN` | `DRN-2601-00001` |
| 請求書 | `INV-YYYYMM-NNNNN` | `INV-2601-00001` |

---

## 実装優先順位

| 優先度 | セクション | 理由 |
|--------|-----------|------|
| 1 | マスタ管理（工場・顧客・製品・材種・素材・外注・工程・検査表・不良種類） | 全機能の前提データ |
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

# Side Systems

Applications deployed alongside the main system.

### Login Portal (Custom or OSS)

Path for users to log in to internal applications.

### Sync Automation (Custom)

Syncs employee data from Samba AD to PostgreSQL.

### Project JSON Management Scripts

Simple scripts to manage JSON data on a local device. Edits project JSON files via a browser table view for the following files.

#### Translation JSON (`messages/`)

- Merge multiple locale JSON files into a single table view where each locale is a column and keys are flattened (dot notation).
- Allow inline editing, searching, filtering by prefix (e.g. `common`, `nav`), and detecting missing translations.
- Save edited data back into individual locale JSON files while preserving the original nested structure.

#### Permission Default JSON (`db_template/permission`)

- Provide a table editor to manage permission records including code, category, and localized fields.
- Support create, update, delete operations with filtering by category and search by code or name.
- Save updates back to `permissions.json` in a clean, structured format suitable for DB seeding.

#### Role Permission Default JSON (`db_template/role_permission`)

- Provide a role-based editor with tabs to manage roles and their metadata (name, display_name, description, system flag).
- Display a permission × action matrix where each cell maps to a scope via dropdown selection.
- Support bulk operations (grant/revoke), role CRUD, and save mappings back to JSON for seeding.
