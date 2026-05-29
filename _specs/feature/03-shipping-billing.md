# Shipping / Delivery / Billing

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
