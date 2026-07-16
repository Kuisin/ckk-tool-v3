/**
 * model.ts — 購買依頼 (PU04) view-model types + pure helpers.
 *
 * Model (app.purchase_requests — uuid PK + request_number 文字列 unique):
 *   依頼番号 PRQ-YYYYMM-NNNNN は nextDocumentNumber("PURCHASE_REQUEST") で
 *   採番して文字列保存する。URL id = request_number。
 *   承認フロー DRAFT→REQUESTED→APPROVED→ORDERED（+REJECTED / CANCELLED）は
 *   遷移列（requestedAt/By …）+ history Json で記録する（素材発注書と同型）。
 *   APPROVED から「発注書へ変換」で material_purchase_orders の DRAFT を生成し
 *   purchase_order_id で紐付ける（単価・仕入先は発注側で確定）。
 *
 * Decimal 列（quantity）はサーバー境界で Number() 済み。
 * ここは pure / client-safe のみ。
 */

export type PurchaseRequestStatus =
  | "DRAFT"
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "ORDERED"
  | "CANCELLED";

/** 一覧 (PU04) の1行。 */
export interface PurchaseRequestRow {
  requestNumber: string;
  requesterName: string;
  /** 先頭明細の素材コード（他 N 件表示用）。 */
  primaryMaterial: string | null;
  itemCount: number;
  status: string;
  /** 明細の希望納期の最小値（yyyy-MM-dd）。 */
  desiredAt: string | null;
  updatedAt: string;
}

/** 依頼明細（purchase_request_items）。 */
export interface PurchaseRequestItemView {
  id: string;
  /** 素材の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  materialId: string;
  materialCode: string;
  materialName: string;
  factoryId: string | null;
  factoryName: string | null;
  quantity: number;
  unit: string;
  desiredAt: string | null;
  notes: string | null;
  sortOrder: number;
}

/** history Json の表示用エントリ（user は displayName 解決済み）。 */
export interface PurchaseRequestHistoryView {
  action: string;
  user: string;
  at: string;
  notes: string | null;
}

/** 詳細 (PU24) view model。 */
export interface PurchaseRequestView {
  /** DB uuid — 内部参照用。 */
  id: string;
  requestNumber: string;
  status: PurchaseRequestStatus;
  purpose: string | null;
  requesterName: string;
  requestedAt: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** 変換で生成した発注書番号（ORDERED 時のみ）。 */
  purchaseOrderNumber: string | null;
  notes: string | null;
  items: PurchaseRequestItemView[];
  history: PurchaseRequestHistoryView[];
  createdAt: string;
  updatedAt: string;
}

/** history Json の action → 日本語ラベル。 */
export const PURCHASE_REQUEST_HISTORY_ACTION_LABEL: Record<string, string> = {
  CREATE: "作成",
  UPDATE: "更新",
  REQUEST_APPROVAL: "承認依頼",
  APPROVE: "承認",
  REJECT: "差し戻し",
  CONVERT: "発注書へ変換",
  CANCEL: "キャンセル",
};

/** 編集可能か — 作成中（DRAFT）/ 差し戻し（REJECTED）のみ。 */
export function isEditable(r: Pick<PurchaseRequestView, "status">) {
  return r.status === "DRAFT" || r.status === "REJECTED";
}

/** 承認依頼可能か — 編集可能な状態と同じ（DRAFT / REJECTED）。 */
export function canRequestApproval(r: Pick<PurchaseRequestView, "status">) {
  return isEditable(r);
}

/** キャンセル可能か — 変換前（DRAFT / REQUESTED / APPROVED / REJECTED）のみ。 */
export function isCancellable(r: Pick<PurchaseRequestView, "status">) {
  return (
    r.status === "DRAFT" ||
    r.status === "REQUESTED" ||
    r.status === "APPROVED" ||
    r.status === "REJECTED"
  );
}
