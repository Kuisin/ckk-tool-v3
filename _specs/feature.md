# Feature Plan

製造業務管理システムの機能実装計画。`_docs/business_flow.md` と `_docs/manufacturing_details.md` に記載の業務フロー、`_specs/tables.md` のデータモデル、`_specs/techstack.md` の技術スタックに基づく。

このファイルは詳細な仕様を整理し、以下のセクションごとのファイルに分割しています。

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

## 詳細セクション

- `_specs/feature/01-sales.md` — §1 価格・見積、§2 注文受付・価格差異、§3 受注書・指示書
- `_specs/feature/02-production.md` — §4 製品在庫照合、§5 素材判断・素材在庫、§6 生産判断・部門承認、§7 製造ワークフロー実行
- `_specs/feature/03-shipping-billing.md` — §8 出荷・納品、§9 会計・請求
- `_specs/feature/04-design-and-master-management.md` — §10 設計依頼、マスタ管理
- `_specs/feature/05-cross-cutting-and-appendix.md` — 横断的機能、採番ルール、実装優先順位、関連ドキュメント、Side Systems

## Side Systems

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

## 参考ドキュメント

- `_docs/business_flow.md`
- `_docs/manufacturing_details.md`
- `_specs/tables.md`
- `_specs/techstack.md`
- `_specs/structure.md`
