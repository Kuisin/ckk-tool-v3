/**
 * model.ts — 素材発注書 (PU03) view-model types + pure helpers.
 *
 * Model (app.material_purchase_orders — uuid PK + po_number 文字列 unique):
 *   発注番号 PO-YYYYMM-NNNNN は nextDocumentNumber("PURCHASE") で採番して
 *   文字列保存する。URL id = po_number。
 *   承認フロー DRAFT→REQUESTED→APPROVED→ORDERED→COMPLETED（+CANCELLED）は
 *   遷移列（requestedAt/By …）+ history Json で記録する（指示書と同型）。
 *
 * Decimal 列（totalAmount / quantity / unitPrice / amount）はサーバー境界で
 * Number() 済み。ここは pure / client-safe のみ。
 */

export type PurchaseStatus =
  | "DRAFT"
  | "REQUESTED"
  | "APPROVED"
  | "ORDERED"
  | "COMPLETED"
  | "CANCELLED";

/** 一覧 (PU03) の1行。 */
export interface PurchaseOrderRow {
  poNumber: string;
  supplierName: string;
  itemCount: number;
  totalAmount: number;
  status: string;
  purchaseDate: string | null;
  updatedAt: string;
}

/** 発注明細（material_purchase_order_items）。 */
export interface PurchaseOrderItemView {
  id: string;
  /** 素材の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  materialId: string;
  materialCode: string;
  materialName: string;
  factoryId: string | null;
  factoryName: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  expectedAt: string | null;
  notes: string | null;
  sortOrder: number;
}

/** history Json の表示用エントリ（user は displayName 解決済み）。 */
export interface PurchaseHistoryView {
  action: string;
  user: string;
  at: string;
  notes: string | null;
}

/** 詳細 (PU23) view model。 */
export interface PurchaseOrderView {
  /** DB uuid — 内部参照用。 */
  id: string;
  poNumber: string;
  supplierBpId: string;
  supplierName: string;
  status: PurchaseStatus;
  totalAmount: number;
  currency: string;
  purchaseDate: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  items: PurchaseOrderItemView[];
  history: PurchaseHistoryView[];
  createdAt: string;
  updatedAt: string;
}

/** history Json の action → 日本語ラベル。 */
export const PURCHASE_HISTORY_ACTION_LABEL: Record<string, string> = {
  CREATE: "作成",
  UPDATE: "更新",
  REQUEST_APPROVAL: "承認依頼",
  APPROVE: "承認",
  REJECT: "差し戻し",
  ORDER: "発注",
  COMPLETE: "入荷完了",
  CANCEL: "キャンセル",
};

/** 編集可能か — 作成中（DRAFT）のみ。 */
export function isEditable(o: Pick<PurchaseOrderView, "status">) {
  return o.status === "DRAFT";
}

/** キャンセル可能か — 発注前（DRAFT / REQUESTED / APPROVED）のみ。 */
export function isCancellable(o: Pick<PurchaseOrderView, "status">) {
  return (
    o.status === "DRAFT" || o.status === "REQUESTED" || o.status === "APPROVED"
  );
}
