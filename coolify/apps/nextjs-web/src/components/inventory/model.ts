/**
 * model.ts — 在庫 (PD04/PD05) 共通の view-model types + pure ラベル定義。
 *
 * Decimal 列（素材数量・取引数量）はサーバー境界で Number() 済み。
 * ここは pure / client-safe のみ。
 */

/** 在庫取引 1 行（取引履歴タブ）。 */
export interface InventoryTransactionRow {
  id: string;
  createdAt: string;
  /** IN / OUT / RESERVE / RELEASE / ADJUST。 */
  transactionType: string;
  quantity: number;
  /** work_order / delivery_order / order_line / material_receipt …（null = なし）。 */
  referenceType: string | null;
  /** 解決済み参照ラベル（指示書 #N・ORD-…・DOR-… 等、mono 表示）。 */
  referenceLabel: string | null;
  notes: string | null;
}

/** 引当予約 1 行（予約タブ）。 */
export interface InventoryReservationRow {
  id: string;
  quantity: number;
  /** RESERVED / CONFIRMED / RELEASED。 */
  status: string;
  /** 関連注文明細番号（ORD-… 導出番号、リンク用）。 */
  orderLineNumber: string | null;
  /** 関連指示書番号（リンク用）。 */
  workOrderNumber: number | null;
  reservedAt: string | null;
  confirmedAt: string | null;
  releasedAt: string | null;
}

/** 取引種別 → バッジ色。ラベルは transactionTypeLabel()（i18n）。 */
export const TRANSACTION_TYPE_COLOR: Record<string, string> = {
  IN: "green",
  OUT: "red",
  RESERVE: "orange",
  RELEASE: "gray",
  ADJUST: "violet",
};

/** 取引種別 → 表示ラベル。呼び出し側の `tr`（next-intl）を渡す。 */
export function transactionTypeLabel(
  tr: (key: string) => string,
  type: string,
): string {
  switch (type) {
    case "IN":
      return tr("production.inventoryModel.in");
    case "OUT":
      return tr("production.inventoryModel.out");
    case "RESERVE":
      return tr("production.inventoryModel.reserve");
    case "RELEASE":
      return tr("common.release");
    case "ADJUST":
      return tr("production.inventoryModel.adjust");
    default:
      return type;
  }
}

/** 予約状態 → バッジ色。ラベルは reservationStatusLabel()（i18n）。 */
export const RESERVATION_STATUS_COLOR: Record<string, string> = {
  RESERVED: "orange",
  CONFIRMED: "blue",
  RELEASED: "gray",
};

/** 予約状態 → 表示ラベル。呼び出し側の `tr`（next-intl）を渡す。 */
export function reservationStatusLabel(
  tr: (key: string) => string,
  status: string,
): string {
  switch (status) {
    case "RESERVED":
      return tr("sales.orderLines.reserved");
    case "CONFIRMED":
      return tr("common.confirmed");
    case "RELEASED":
      return tr("common.release");
    default:
      return status;
  }
}
