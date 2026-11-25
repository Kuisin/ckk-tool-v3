# Cross-Cutting Features and Appendix

## 横断的機能

### 認証・RBAC

- Auth.js v5 によるログイン（Samba AD LDAP/OAuth）
- DB セッション + Short JWT
- `user_permissions` ビューで権限照合（raw テーブル直参照禁止）
- RBAC スコープ: `ALL / REGION / COUNTRY / PLANT / DEPARTMENT / TEAM / SUB / OWN`
- Middleware でルート保護

### 採番

書類番号は **DB が INSERT 時に払い出す**（トリガー `app.assign_document_number`。
マイグレーション `20261126230000_document_numbering`）。形は `PREFIX-FFFF-NNNNN`、
連番は **自社法人 × 会計年度** ごと。アプリは番号を作らない・渡さない — 行を作って
`doc_ref` を読み戻す。詳細は下の「採番ルール」。

`lib/numbering.ts`（`numbering_sequences` テーブル・月次リセット）に残るのは
書類ではないものだけ: `PRODUCT`（製品コード）/ `REGRIND_ITEM`（再研磨品目コード）/
`FORM_RESPONSE`（フォーム回答）/ `INTERNAL_PAGE`（社内文書）。ロット番号
（= `work_orders.work_order_number`）は通し連番。

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
| 再研磨品目コード | `RGD-YYYYMM-NNNN` | `RGD-2601-0001` |
| フォーム回答 | `FRM-YYYYMM-NNNNN`（月次リセット） | `FRM-202607-00001` |
| 社内文書 | `DOC-YYYYMM-NNNNN`（月次リセット） | `DOC-202607-00001` |
| ロット番号（= 指示書番号 `work_order_number`） | 通し連番（法人をまたいで一意） | `1031` |
| 価格試算 | `EST-FFFF-NNNNN` | `EST-2026-00001` |
| 価格表 | `PRC-FFFF-NNNNN` | `PRC-2026-00001` |
| 見積書 | `QOT-FFFF-NNNNN` | `QOT-2026-00001` |
| 注文請書 | `ORD-FFFF-NNNNN` | `ORD-2026-00001` |
| 注文明細 | `[注文請書の番号]-NN`（確定時に枝番） | `ORD-2026-00001-01` |
| 設計依頼書 | `DSG-FFFF-NNNNN` | `DSG-2026-00001` |
| 購買依頼 | `PRQ-FFFF-NNNNN` | `PRQ-2026-00001` |
| 素材発注書 | `PO-FFFF-NNNNN` | `PO-2026-00001` |
| 外注依頼 | `OUT-FFFF-NNNNN`（外注工程に依頼日が入った時点で採番） | `OUT-2026-00001` |
| 指示書（書類番号 — 表示用） | `WOR-FFFF-NNNNN` | `WOR-2026-00001` |
| 出荷書 | `DOR-FFFF-NNNNN` | `DOR-2026-00001` |
| 納品書 | `DRN-FFFF-NNNNN` | `DRN-2026-00001` |
| 請求書 | `INV-FFFF-NNNNN` | `INV-2026-00001` |
| 入出庫伝票 | `MOV-FFFF-NNNNN` | `MOV-2026-00001` |
| 棚卸 | `STK-FFFF-NNNNN` | `STK-2026-00001` |
| 会計文書 | `ACC-FFFF-NNNNN`（起票日は `posted_at`） | `ACC-2026-00001` |

### 書類番号（`PREFIX-FFFF-NNNNN`）の決まり

- **`FFFF` = 会計年度**。年度が始まる暦年で表す（4 月始まりなら 2026-04〜2027-03 が
  `2026`）。年度開始月は自社法人が持つ。
- **連番は 自社法人 × 会計年度 ごと**に `00001` から。月次リセットは無い。
- **年度を決めるのは起票日 = 作成日時の日本時間の暦日**（`app.jst_date(created_at)`）。
  出荷日・締日などの業務日付には依らない。
- **DB が作成時に払い出す**。保存が巻き戻れば番号も戻る（欠番なし）。払い出した番号は
  変えない・使い回さない（キャンセルしても番号は残る）。対象の表に
  `INSERT … ON CONFLICT DO NOTHING` を使わない（入らなかった行のぶん番号が欠ける）。
- **法人は番号の文字列に入らない** → 同じ番号が 2 つの法人に存在し得る。
  「どの書類か」の 3 つの姿（`lib/doc-number.ts` が契約）:

  | 姿 | 例 | 使う場所 |
  |---|---|---|
  | 番号 | `QOT-2026-00001` | 人が読むもの（画面の表示・PDF・メール・CSV・`/api/v1` の `number`） |
  | ref | `CKK/QOT-2026-00001` | DB の `doc_ref`（表ごとに UNIQUE）・多態参照（承認・メモ・添付・監査） |
  | id | `CKK~QOT-2026-00001` | URL・Server Action の引数・画面 DTO |

- **旧番号**（`PREFIX-YYYYMM-NNNNN`）: 既存の書類は全部振り直し、旧番号は
  `legacy_number` に残す。詳細画面に「旧番号」として出し、一覧の検索に掛かり、
  旧番号の URL は新しい URL へ転送する（`lib/doc-ref.ts` `resolveDocId` /
  `lib/doc-param.ts`）。番号だけで複数の法人に当たるときは黙って選ばず、
  発行会社の選択画面（`/doc/choose`）へ送る。
- 利用者向けの説明はマニュアル「スタートマニュアル → 6. 書類番号のルール」
  （`content/manual/start.md#doc-number`）が正。

---

## 実装優先順位

| 優先度 | セクション | 理由 |
|--------|-----------|------|
| 1 | マスタ管理（拠点・顧客・製品・材種・素材・外注・工程・検査表・不良種類） | 全機能の前提データ |
| 2 | 認証・RBAC | 全画面に必要 |
| 3 | §1 価格・見積 | フロー起点 |
| 4 | §2 注文受付 | §1 の続き |
| 5 | §3 注文明細・指示書 | 製造の入口 |
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
