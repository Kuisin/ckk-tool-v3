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
  /** work_order / shipping_order / sales_order / material_receipt …（null = なし）。 */
  referenceType: string | null;
  /** 解決済み参照ラベル（指示書 #N・ORD-…・SHP-… 等、mono 表示）。 */
  referenceLabel: string | null;
  notes: string | null;
}

/** 引当予約 1 行（予約タブ）。 */
export interface InventoryReservationRow {
  id: string;
  quantity: number;
  /** RESERVED / CONFIRMED / RELEASED。 */
  status: string;
  /** 関連注文請書番号（ORD-… 導出番号、リンク用）。 */
  salesOrderNumber: string | null;
  /** 関連指示書番号（リンク用）。 */
  workOrderNumber: number | null;
  reservedAt: string | null;
  confirmedAt: string | null;
  releasedAt: string | null;
}

/** 取引種別 → バッジ色・ラベル。 */
export const TRANSACTION_TYPE_BADGE: Record<
  string,
  { label: string; color: string }
> = {
  IN: { label: "入庫", color: "green" },
  OUT: { label: "出庫", color: "red" },
  RESERVE: { label: "予約", color: "orange" },
  RELEASE: { label: "解除", color: "gray" },
  ADJUST: { label: "調整", color: "violet" },
};

/** 予約状態 → バッジ色・ラベル。 */
export const RESERVATION_STATUS_BADGE: Record<
  string,
  { label: string; color: string }
> = {
  RESERVED: { label: "予約中", color: "orange" },
  CONFIRMED: { label: "確定", color: "blue" },
  RELEASED: { label: "解除", color: "gray" },
};
