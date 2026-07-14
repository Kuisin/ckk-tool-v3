/**
 * model.ts — 受注書 (PD01) view-model types + pure helpers.
 *
 * Model (app.sales_orders — 複合キー (year_month, seq, branch)):
 *   受注書は「一括作成」— 1回の作成で (yearMonth, seq) を1つ採番し、明細行ごとに
 *   branch = 1..N の行を作る。表示番号 ORD-YYYYMM-NNNNN-NN はキーから導出
 *   （保存しない）。URL id も導出番号を使う。
 *
 * Decimal 列（unitPrice / amount）はサーバー境界で Number() 済み。
 * ここは pure / client-safe のみ。
 */

export type SalesOrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "PARTIAL_SHIPPED"
  | "SHIPPED"
  | "CANCELLED";

/** 詳細「指示書」タブの1行（work_orders の抜粋）。 */
export interface SalesOrderWorkOrderRef {
  /** 指示書番号 = ロット番号（通し連番 int）。 */
  workOrderNumber: number;
  /** WORK_ORDER_TYPE（在庫分 / 製造分）。 */
  type: string;
  plannedQuantity: number;
  /** WORK_ORDER_APPROVAL_STATUS。 */
  approvalStatus: string;
  /** WORK_ORDER_STATUS。 */
  status: string;
}

export interface SalesOrder {
  /** 導出文書番号 ORD-YYYYMM-NNNNN-NN — URL id と同一。 */
  id: string;
  orderNumber: string;
  /** DB uuid — 指示書作成リンク（?salesOrder=…）等の内部参照用。 */
  uuid: string;
  customerId: string;
  customerName: string;
  customerBranchId: string | null;
  customerBranchName: string | null;
  endUserName: string | null;
  /** 顧客注文書番号（FAX 等で受領した注文書の番号）。 */
  customerOrderRef: string | null;
  /** 見積書からの展開元（QOT-… 導出番号）。手動作成時は null。 */
  quoteNumber: string | null;
  /** 製品の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  productId: string;
  productName: string;
  orderType: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  deliveryDate: string | null;
  /** ロット番号（指示書番号と共用）。指示書作成時に採番 — それまで null。 */
  lotNumber: number | null;
  status: SalesOrderStatus;
  /** 承認依頼中ロック — true の間は編集不可。 */
  isLocked: boolean;
  notes: string | null;
  workOrders: SalesOrderWorkOrderRef[];
  createdAt: string;
  updatedAt: string;
}

/** 編集可能か — 下書きかつロックされていない受注書のみ。 */
export function isEditable(o: Pick<SalesOrder, "status" | "isLocked">) {
  return o.status === "DRAFT" && !o.isLocked;
}

/** キャンセル可能か — 出荷済・キャンセル済以降は不可。 */
export function isCancellable(o: Pick<SalesOrder, "status">) {
  return o.status !== "SHIPPED" && o.status !== "CANCELLED";
}
