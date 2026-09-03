/**
 * status-map.ts — 書類の状態 → **色**（_specs/design.md §9）。
 *
 * **文言はここに持たない。** 状態のラベルは `messages/<locale>.json` の
 * `status.STATUS_MAPS.<書類>.<状態>.label` にあり、`statusLabel()` が引く。
 * 色は言語ではなく設計の取り決めなので、値の隣（ここ）に残す。
 *
 * 表示は `<StatusBadge>` を使うこと。`statusLabel()` はラベルだけ欲しいとき
 * （手続き状況の補足文など）向け。
 *
 * このファイルは**クライアントからも import される**ので、サーバー専用の
 * モジュールを持ち込まないこと（`lib/client-boundary.test.ts` が見張っている）。
 */

import type { Locale } from "@/lib/i18n";
import { label as messageLabel } from "@/lib/messages";

/** 状態 → 色。**ラベルは JSON 側**（`status.STATUS_MAPS.*.label`）。 */
export type StatusMap = Record<string, string>;

/** 書類ごとの 状態 → 色。キーは DB の enum 値と同じ。 */
export const STATUS_MAPS = {
  Estimate: {
    DRAFT: "gray",
    CONFIRMED: "blue",
    REGISTERED: "green",
  },
  // EXPIRED は保存しない派生状態（発行済み × 有効期限超過。
  // components/sales/quotes/model.ts quoteDisplayStatus）— 色だけここに置く。
  Quote: {
    DRAFT: "gray",
    ISSUED: "blue",
    EXPIRED: "orange",
  },
  OrderAcceptance: {
    PENDING: "yellow",
    PRICE_DIFF: "orange",
    CONFIRMED: "green",
  },
  OrderAcceptanceIntake: {
    IMPORT: "gray",
    DRAFT: "blue",
    REQUESTED: "yellow",
    APPROVED: "green",
    COMPLETED: "teal",
    ARCHIVED: "dark",
    CANCELLED: "red",
  },
  MaterialPurchaseOrder: {
    DRAFT: "gray",
    REQUESTED: "yellow",
    APPROVED: "blue",
    ORDERED: "violet",
    COMPLETED: "green",
    CANCELLED: "red",
  },
  Form: {
    DRAFT: "gray",
    PUBLISHED: "blue",
    ARCHIVED: "dark",
  },
  InternalPage: {
    DRAFT: "gray",
    PENDING: "yellow",
    PUBLISHED: "green",
    ARCHIVED: "dark",
  },
  FormResponse: {
    DRAFT: "gray",
    SUBMITTED: "blue",
    REQUESTED: "yellow",
    APPROVED: "green",
    REJECTED: "red",
  },
  PurchaseRequest: {
    DRAFT: "gray",
    REQUESTED: "yellow",
    APPROVED: "blue",
    REJECTED: "red",
    ORDERED: "violet",
    CANCELLED: "red",
  },
  OrderLine: {
    DRAFT: "gray",
    CONFIRMED: "blue",
    IN_PRODUCTION: "violet",
    PARTIAL_SHIPPED: "orange",
    SHIPPED: "green",
    CANCELLED: "red",
  },
  WorkOrder: {
    DRAFT: "gray",
    PENDING_APPROVAL: "yellow",
    APPROVED: "blue",
    IN_PROGRESS: "violet",
    COMPLETED: "green",
    CANCELLED: "red",
  },
  WorkOrderApproval: {
    NONE: "gray",
    PENDING: "yellow",
    APPROVED: "green",
    REJECTED: "red",
  },
  Step: {
    PENDING: "gray",
    IN_PROGRESS: "blue",
    COMPLETED: "green",
    CANCELLED: "red",
  },
  DeliveryOrder: {
    DRAFT: "gray",
    CONFIRMED: "blue",
    SHIPPED: "green",
  },
  DeliveryNote: {
    DRAFT: "gray",
    ISSUED: "blue",
    DELIVERED: "green",
  },
  Invoice: {
    DRAFT: "gray",
    ISSUED: "blue",
    SENT: "violet",
    PAID: "green",
  },
  InspectionRecord: {
    PENDING: "gray",
    PASS: "green",
    FAIL: "red",
    APPROVED: "teal",
  },
  DesignRequest: {
    DRAFT: "gray",
    REQUESTED: "yellow",
    PENDING: "blue",
    IN_PROGRESS: "violet",
    COMPLETED: "green",
    REJECTED: "red",
    CANCELLED: "red",
  },
  BillingClosing: {
    PENDING: "gray",
    PROCESSED: "blue",
    EXPORTED: "green",
  },
  ApprovalRequest: {
    PENDING: "yellow",
    APPROVED: "green",
    REJECTED: "red",
  },
  KioskCard: {
    UNASSIGNED: "gray",
    ASSIGNED: "green",
    SUSPENDED: "orange",
    REVOKED: "red",
  },
  KioskDevice: {
    PENDING: "gray",
    LINKED: "yellow",
    ACTIVE: "green",
    DISABLED: "gray",
    REVOKED: "red",
  },
  DisplayDevice: {
    PENDING: "gray",
    LINKED: "yellow",
    ACTIVE: "green",
    DISABLED: "gray",
    REVOKED: "red",
  },
} as const;

export type StatusEntity = keyof typeof STATUS_MAPS;

/** その状態の色。未知の値は gray。 */
export function statusColor(entity: StatusEntity, status: string): string {
  return (STATUS_MAPS[entity] as StatusMap)[status] ?? "gray";
}

/**
 * 状態のラベル。未知の値は値そのものを返す。
 * `locale` を渡さない呼び出しは日本語のまま。
 */
export function statusLabel(
  entity: StatusEntity,
  status: string,
  locale: Locale = "ja",
): string {
  return messageLabel(
    `status.STATUS_MAPS.${entity}.${status}.label`,
    locale,
    status,
  );
}

/** 絞り込みバー用の Select 選択肢。 */
export function statusOptions(
  entity: StatusEntity,
  locale: Locale = "ja",
): { value: string; label: string }[] {
  return (
    Object.keys(STATUS_MAPS[entity] as StatusMap)
      // 「—」は状態が無いことを表す表示上の穴なので選択肢に出さない
      .filter((value) => statusLabel(entity, value, "ja") !== "—")
      .map((value) => ({ value, label: statusLabel(entity, value, locale) }))
  );
}
