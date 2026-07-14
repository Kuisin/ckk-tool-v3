/**
 * model.ts — 出荷書 (SH01) view-model types + pure helpers.
 *
 * Model (app.shipping_orders — 複合キー (year_month, seq)):
 *   表示番号 SHP-YYYYMM-NNNNN はキーから導出（保存しない）。URL id も導出番号。
 *   ヘッダは注文請書（必須）+ 任意で指示書・出荷元工場に紐付き、明細は
 *   製品 × ロット（= 指示書番号）× 数量 — 複数指示書の成果を 1 出荷書に束ねる。
 *
 * Decimal 列はサーバー境界で Number() 済み。ここは pure / client-safe のみ。
 */

export type ShippingOrderStatus = "DRAFT" | "CONFIRMED" | "SHIPPED";

/** SHIPPING_TYPE — DISPATCH=発送（請求対象）/ STOCK_STORAGE=在庫保管（請求外）。 */
export type ShippingType = "DISPATCH" | "STOCK_STORAGE";

export interface ShippingOrderItem {
  id: string;
  /** 製品の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  productId: string;
  productName: string;
  /** ロット番号 = 指示書番号（任意）。 */
  lotNumber: number | null;
  quantity: number;
  notes: string | null;
}

/** 詳細「納品書」タブの1行（delivery_notes の抜粋）。 */
export interface ShippingOrderDeliveryNoteRef {
  /** 導出番号 DRN-YYYYMM-NNNNN。 */
  deliveryNumber: string;
  /** DELIVERY_METHOD。 */
  deliveryMethod: string;
  recipientName: string;
  /** DELIVERY_STATUS。 */
  status: string;
  deliveredAt: string | null;
}

export interface ShippingOrder {
  /** 導出文書番号 SHP-YYYYMM-NNNNN — URL id と同一。 */
  id: string;
  shippingNumber: string;
  /** 注文請書の DB uuid（内部参照用）。 */
  salesOrderId: string;
  /** 導出番号 ORD-YYYYMM-NNNNN-NN。 */
  salesOrderNumber: string;
  customerName: string;
  customerBranchName: string | null;
  /** 注文請書の製品（明細の既定製品）。 */
  productName: string;
  /** 受注数量（出荷進捗の参考）。 */
  salesOrderQuantity: number;
  /** ヘッダ紐付けの指示書番号（任意）。 */
  workOrderNumber: number | null;
  fromFactoryId: string | null;
  fromFactoryName: string | null;
  type: ShippingType;
  status: ShippingOrderStatus;
  shippedAt: string | null;
  notes: string | null;
  items: ShippingOrderItem[];
  /** 明細数量の合計。 */
  totalQuantity: number;
  deliveryNotes: ShippingOrderDeliveryNoteRef[];
  createdAt: string;
  updatedAt: string;
}

/** 編集可能か — 下書きの出荷書のみ。 */
export function isEditable(o: Pick<ShippingOrder, "status">) {
  return o.status === "DRAFT";
}

/** 納品書を作成できるか — 確定済み・出荷済みの出荷書のみ。 */
export function canCreateDeliveryNote(o: Pick<ShippingOrder, "status">) {
  return o.status === "CONFIRMED" || o.status === "SHIPPED";
}
