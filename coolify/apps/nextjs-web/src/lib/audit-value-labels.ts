/**
 * audit-value-labels.ts — 履歴の enum 値を、既にある訳の資産（状態バッジの
 * ラベル・enum のラベル）から引く。
 *
 * `audit-field-labels.ts` の `formatAuditValue` は列名 → 値の整形を持つが、
 * enum の**値そのもの**（`REQUESTED` / `INTERNAL` …）は今まで生のまま出て
 * いた — 状態は `status-map.ts` の `STATUS_MAPS`、その他の enum は
 * `enum-labels.ts` の `xxxLabel()` がどちらも既に訳を持っているのに、
 * ここからは呼ばれていなかった。
 *
 * **`STATUS_MAPS` / `enum-labels.ts` の値を手でコピーしない** — この
 * ファイルは「どの列がどの enum か」を組み立てるだけで、訳文そのものは
 * 常に `messages/<locale>.json` から引く。
 *
 * ★ このファイルは client-safe（`src/lib/client-boundary.test.ts` が見張る）。
 *   `status-map.ts` から import してよいのは値がそれ自体 client-safe だから
 *   （`"use client"` の `components/ui/StatusBadge.tsx` からは絶対に
 *   import しないこと — サーバー側で呼ぶと本番だけ落ちる）。
 */

import type { Locale } from "./i18n";
import { label } from "./messages";
import { STATUS_MAPS, type StatusEntity, statusLabel } from "./status-map";

/** next-intl に存在しない鍵と区別するための番兵。 */
const NOT_FOUND = " __audit_value_labels_not_found__ ";

/**
 * `table_name` → 状態の書類種別。leaf が **"status" のときだけ**引く
 * （"status" は表ごとに意味が違うので、列名だけでは判定できない）。
 * `STATUS_MAPS`（status-map.ts）に実在するキーだけを登録する。
 */
const STATUS_ENTITY_BY_TABLE: Partial<Record<string, StatusEntity>> = {
  quotes: "Quote",
  estimates: "Estimate",
  order_acceptances: "OrderAcceptance",
  order_lines: "OrderLine",
  work_orders: "WorkOrder",
  delivery_orders: "DeliveryOrder",
  delivery_notes: "DeliveryNote",
  invoices: "Invoice",
  purchase_requests: "PurchaseRequest",
  material_purchase_orders: "MaterialPurchaseOrder",
  forms: "Form",
  form_responses: "FormResponse",
  internal_pages: "InternalPage",
  design_requests: "DesignRequest",
  billing_closings: "BillingClosing",
  kiosk_cards: "KioskCard",
  kiosk_devices: "KioskDevice",
  display_devices: "DisplayDevice",
  approval_requests: "ApprovalRequest",
};

/**
 * `<table>.<leaf>` または `<leaf>` → enum-labels.ts の map 名
 * （`messages/<locale>.json` の `enum.<map名>.<値>` を引く）。
 *
 * **表を跨いで意味が変わる列名は必ず `<table>.<leaf>` で登録する** — 例えば
 * `deliveryMethod` は `order_acceptances`（ACCEPTANCE_DELIVERY_METHOD_LABEL:
 * 通常配送/ユーザー直送）と `delivery_notes`（DELIVERY_METHOD_LABEL: 通常納品/…）
 * で別の enum。`executionLocation` も同様に `process_step_catalog`
 * （ProcessExecution: INTERNAL/INTERNAL_OR_OUTSOURCE）と
 * `work_order_steps` / `product_process_route_version_steps`
 * （StepExecution: INTERNAL/OUTSOURCE）で別の enum — 後者の訳
 * （STEP_EXECUTION_LABEL）は用意したが、`recordAudit` がこの列名を
 * 監査ペイロードへそのまま書いている箇所が現状無い（work_order_steps 自体を
 * 監査する呼び出しが無く、変更は親の work_orders 側へまとめて記録される）ので
 * 未配線のまま — 実在しない対応を推測で足すより、確認できたら足す。
 *
 * `kind` も表を跨いで 3 通りに意味が変わる: `design_requests`
 * （DesignKind: 新規/改訂）・`forms`（FormKind: アンケート/申請・報告）・
 * `user_change_requests`（UserChangeKind: 利用停止/復帰/…）。すべて
 * `<table>.kind` で登録し、bare `kind` は登録しない。
 *
 * `type` / `mode` / `role` のような 1 語の列名は対象の表を確認できない
 * ぶんは登録しない（`relation` は `process_step_use_dependencies` /
 * `process_step_exec_dependencies` の 2 表でしか使われておらず、どちらも
 * 同じ DependencyRelation（AND/OR）なので衝突が無い — bare で登録できる）。
 */
const ENUM_MAP_BY_FIELD: Record<string, string> = {
  taxType: "TAX_TYPE_LABEL",
  invoiceMethod: "INVOICE_METHOD_LABEL",
  vendorType: "VENDOR_TYPE_LABEL",
  quantityTracking: "QUANTITY_TRACKING_LABEL",
  lotInputMode: "LOT_INPUT_MODE_LABEL",
  orderType: "ORDER_TYPE_LABEL",
  relation: "DEPENDENCY_RELATION_LABEL",
  "order_acceptances.deliveryMethod": "ACCEPTANCE_DELIVERY_METHOD_LABEL",
  "delivery_notes.deliveryMethod": "DELIVERY_METHOD_LABEL",
  "process_step_catalog.executionLocation": "PROCESS_EXECUTION_LABEL",
  "process_step_catalog.category": "PROCESS_CATEGORY_LABEL",
  "work_orders.type": "WORK_ORDER_TYPE_LABEL",
  "delivery_orders.type": "DELIVERY_ORDER_TYPE_LABEL",
  "design_requests.trigger": "DESIGN_TRIGGER_LABEL",
  "design_requests.kind": "DESIGN_KIND_LABEL",
  "design_requests.priority": "DESIGN_PRIORITY_LABEL",
  "forms.kind": "FORM_KIND_LABEL",
  "user_change_requests.kind": "USER_CHANGE_KIND_LABEL",
};

/**
 * 履歴の値 1 つを、表・列名から分かる範囲で訳す。
 *
 * 解決順:
 *  1. `audit.valueLabels.<leaf>.<value>`（既存の手書き上書き — UI 専用の
 *     少数の値はここに残る。`audit-field-labels.ts` 側で先に引かれる）
 *  2. leaf が "status" かつ表が分かれば `STATUS_MAPS` の状態ラベル
 *  3. `ENUM_MAP_BY_FIELD` に登録された enum のラベル
 *  4. `undefined`（呼び出し側は生の値を出す — 知らない値を推測しない）
 */
export function auditValueLabel(
  key: string,
  value: string,
  tableName: string | undefined,
  locale: Locale,
): string | undefined {
  const leaf = key.includes(".") ? (key.split(".").pop() ?? key) : key;

  if (leaf === "status" && tableName) {
    const entity = STATUS_ENTITY_BY_TABLE[tableName];
    // statusLabel は未知の値を素通しするので、実在するキーだけを引く
    // （でないと「ラベルが無い」と「ラベル＝値と同じ文字列」を区別できない）。
    if (entity && value in STATUS_MAPS[entity]) {
      return statusLabel(entity, value, locale);
    }
  }

  const map =
    (tableName && ENUM_MAP_BY_FIELD[`${tableName}.${leaf}`]) ??
    ENUM_MAP_BY_FIELD[leaf];
  if (map) {
    const hit = label(`enum.${map}.${value}`, locale, NOT_FOUND);
    if (hit !== NOT_FOUND) return hit;
  }

  return undefined;
}
