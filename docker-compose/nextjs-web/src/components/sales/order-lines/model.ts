/**
 * model.ts — 注文明細 (SA05) view-model types + pure helpers.
 *
 * Model (app.order_lines — 注文請書キー + 枝番):
 *   注文明細 = 注文請書の明細行そのもの。注文請書 1 行 = 注文明細 1 行で固定
 *   （分割も統合もしない）。確定時に sortOrder 順で branch = 1..N を採番し、
 *   表示番号 ORD-YYYYMM-NNNNN-NN をキーから導出する（保存しない）。
 *   URL id も導出番号を使う。この画面が扱うのは確定済み行のみ。
 *
 * Decimal 列（unitPrice / amount）はサーバー境界で Number() 済み。
 * 確定前は null を取り得るが、確定済み行では常に値がある。
 * ここは pure / client-safe のみ。
 */

export type OrderLineStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "PARTIAL_SHIPPED"
  | "SHIPPED"
  | "CANCELLED";

/** 詳細「指示書」タブの1行（work_order_order_lines 経由の抜粋）。 */
export interface OrderLineWorkOrderRef {
  /** 指示書番号 = ロット番号（通し連番 int）。 */
  workOrderNumber: number;
  /** WORK_ORDER_TYPE（在庫分 / 製造分）。 */
  type: string;
  plannedQuantity: number;
  /** この明細への割当数量（統合ロットでは予定数量より小さくなり得る）。 */
  allocatedQuantity: number;
  /** WORK_ORDER_APPROVAL_STATUS。 */
  approvalStatus: string;
  /** WORK_ORDER_STATUS。 */
  status: string;
}

export interface OrderLine {
  /** 導出文書番号 ORD-YYYYMM-NNNNN-NN — URL id と同一。 */
  id: string;
  orderNumber: string;
  /** DB uuid — 指示書作成リンク（?orderLine=…）等の内部参照用。 */
  uuid: string;
  /** 親の注文請書番号 ORD-YYYYMM-NNNNN。 */
  acceptanceNumber: string;
  customerId: string | null;
  customerName: string;
  customerBranchId: string | null;
  customerBranchName: string | null;
  /**
   * 営業担当・作成者は注文請書ヘッダの値（行に複写しない — 顧客と同じ扱い）。
   */
  salesRepName: string | null;
  createdByName: string | null;
  endUserName: string | null;
  /** 顧客注文書番号（FAX 等で受領した注文書の番号）。 */
  customerOrderRef: string | null;
  /** 見積書からの展開元（QOT-… 導出番号）。手動作成時は null。 */
  quoteNumber: string | null;
  /** 製品の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  productId: string | null;
  productName: string;
  orderType: string;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
  deliveryDate: string | null;
  /** ロット番号（指示書番号と共用）。指示書作成時に採番 — それまで null。 */
  lotNumber: number | null;
  status: OrderLineStatus;
  /** 承認依頼中ロック — true の間は編集不可。 */
  isLocked: boolean;
  /** §4 在庫照合で引当済み（RESERVED）の合計数量。 */
  reservedStockQuantity: number;
  notes: string | null;
  workOrders: OrderLineWorkOrderRef[];
  /** 出荷済み数量 = SHIPPED な発送出荷書の明細数量合計。 */
  shippedQuantity: number;
  shippingOrders: OrderLineShippingRef[];
  createdAt: string;
  updatedAt: string;
}

/** 注文明細配下の出荷書（出荷タブ・進捗表示用）。 */
export interface OrderLineShippingRef {
  /** SHP-YYYYMM-NNNNN（URL id と同一）。 */
  number: string;
  /** SHIPPING_TYPE（DISPATCH / STOCK_STORAGE）。 */
  type: string;
  /** SHIPPING_STATUS。 */
  status: string;
  /** この注文明細ぶんの出荷数量（出荷書全体ではない）。 */
  quantity: number;
  shippedAt: string | null;
}

/** キャンセル可能か — 出荷済・キャンセル済以降は不可。 */
export function isCancellable(o: Pick<OrderLine, "status">) {
  return o.status !== "SHIPPED" && o.status !== "CANCELLED";
}
