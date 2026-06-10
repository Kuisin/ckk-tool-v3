# Cross-Cutting Features and Appendix

## 横断的機能

### 認証・RBAC

- Auth.js v5 によるログイン（Samba AD LDAP/OAuth）
- DB セッション + Short JWT
- `user_permissions` ビューで権限照合（raw テーブル直参照禁止）
- RBAC スコープ: `ALL / REGION / COUNTRY / FACTORY / DEPARTMENT / TEAM / SUB / OWN`
- スコープ解決: `org_units`（REGION > COUNTRY > FACTORY > DEPARTMENT > TEAM 階層）×
  `user_org_assignments`（主所属 1 件 + 兼務）で判定。
  業務ドキュメントは `org_unit_id`（起票拠点）を保持し、スコープに応じて
  「ユーザー所属ノードの配下にある拠点のレコード」のみ可視にする。`OWN` は `created_by` 一致。
- Middleware でルート保護

### 多拠点・多通貨・税・タイムゾーン（多国対応の確定ポリシー）

**組織（org_units）**

- 拠点（`FACTORY`）が業務ドキュメントの起票単位。全ドキュメント（見積〜請求・在庫）は `org_unit_id` 必須
- 在庫（製品・素材）は拠点ごとに保持。拠点間移動は出庫＋入庫の 2 トランザクションで記録
- マスタ（製品・素材・材種・工程・BP）は全拠点共通（グローバルマスタ）

**通貨**

- 1 ドキュメント 1 通貨。明細はヘッダ通貨を継承し、通貨の混在は禁止
- 見積通貨は顧客の取引通貨（`bp_customer_attrs.currency`）をデフォルトとし、価格表解決は
  ドキュメント通貨と一致する `price_lists` 行のみ対象
- 通貨は見積 → 注文受諾書 → 受注書 → 納品書 → 請求書へ継承し、途中で変更不可
- グループ機能通貨は JPY。請求書発行時に `exchange_rates` から対 JPY レートをスナップショット
  （`invoices.exchange_rate` / `base_total_amount`）。レート未登録時は発行をブロック

**税**

- 税率は `tax_rates`（国 × 税区分 × 適用開始日）で管理。請求書発行日時点の税率を解決し
  `invoices.tax_rate` にスナップショット
- 課税国は原則として請求元拠点の国。顧客の `tax_type`（課税 / 非課税 / 軽減税率）で行を選択
- 端数処理: 税額は請求書単位で計算し、切り捨て（拠点国の法令で異なる場合は `org_units` 単位で設定拡張）

**タイムゾーン**

- DB の `timestamp` は全て `timestamptz`（UTC）。表示はユーザー tz（未設定時は主所属拠点 tz）で変換
- `date` 型の業務日付（締日・納期・有効日・YYYYMM 採番）は起票拠点のローカル日付で解釈
- 締日処理・月次バッチは拠点タイムゾーン基準でスケジュール（BullMQ ジョブを拠点ごとに登録）

**会計連携**

- 会計エクスポートはアダプタ方式（`lib/journal.ts` が共通仕訳を生成し、拠点の
  `org_units.accounting_system` に応じたアダプタが出力形式へ変換）
- JP 拠点: 弥生会計 Next CSV（`lib/csv-export.ts`）。他国拠点は汎用仕訳 CSV を既定とし、必要時にアダプタ追加
- エクスポート済み管理は `invoices.accounting_exported_at`（二重エクスポート防止）

### 採番（`lib/numbering.ts`）

| キー | プレフィックス | 形式 |
|------|--------------|------|
| `QUOTE` | `QOT` | `QOT-YYYYMM-NNNNN` |
| `ORDER_ACCEPT` | `ORD` | `ORD-YYYYMM-NNNNN` |
| `DELIVERY` | `DRN` | `DRN-YYYYMM-NNNNN` |
| `INVOICE` | `INV` | `INV-YYYYMM-NNNNN` |

月次リセット付き（`numbering_sequences` テーブル）。指示書・ロット番号は通し連番。

多拠点ポリシー: シーケンスは全拠点共通のグローバル採番（単一 DB・`SELECT ... FOR UPDATE` 行ロック）。
番号から拠点は判別せず、拠点はドキュメントの `org_unit_id` で管理。`YYYYMM` は起票拠点 tz の年月。

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
| 締日処理 | 月次の請求データ生成（拠点タイムゾーン基準で拠点ごとに登録） |
| 為替レート取得 | `exchange_rates` の日次更新（手動登録のフォールバックあり） |

### ファイルストレージ（SeaweedFS S3 API）

- 設計図、注文書 PDF、生成 PDF（見積書・納品書・請求書等）を保存
- `files` テーブルで `storage_key` + `filename` + `mime_type` を管理

---

## 採番ルール

| ドキュメント | 形式 | 例 |
|--------------|------|----|
| 材種コード | `[A-Z][0-9]{2}[A-Z][0-9]{4}` | `A01A0001` |
| 素材コード | `[材種コード]-[A-C][0-9]{3}-[0-9]{3}` | `A01A0001-A001-001` |
| 製品コード | `PRD-YYYYMM-NNNN` | `PRD-202601-0001` |
| 見積書 | `QOT-YYYYMM-NNNNN` | `QOT-202601-00001` |
| 注文受取書 | `ORD-YYYYMM-NNNNN` | `ORD-202601-00001` |
| 受注書 | `[注文受取書コード]-NN` | `ORD-202601-00001-01` |
| 指示書番号 | 通し連番 | `1031` |
| ロット番号 | 通し連番（指示書番号と共用） | `1031` |
| 納品書 | `DRN-YYYYMM-NNNNN` | `DRN-202601-00001` |
| 請求書 | `INV-YYYYMM-NNNNN` | `INV-202601-00001` |

`YYYYMM` は西暦 4 桁 + 月 2 桁（例: `202601` = 2026年1月）。

---

## 実装優先順位

| 優先度 | セクション | 理由 |
|--------|-----------|------|
| 1 | マスタ管理（組織・顧客・製品・材種・素材・外注・工程・検査表・不良種類・税率/為替） | 全機能の前提データ |
| 2 | 認証・RBAC | 全画面に必要（スコープ解決は組織マスタに依存） |
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
