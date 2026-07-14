/**
 * model.ts — 請求書 (BL01) view-model types + pure helpers.
 *
 * Model (app.invoices — 複合キー (year_month, seq)):
 *   表示番号 INV-YYYYMM-NNNNN はキーから導出（保存しない）。URL id も導出番号。
 *   請求書は締日処理 (BL02) の「請求書を生成」から作成され、明細は出荷書
 *   （DISPATCH × SHIPPED）由来 — 明細に出荷書 / 納品書の複合キーを由来として持つ。
 *
 * ステータス遷移: DRAFT →(発行)→ ISSUED →(送付)→ SENT →(入金)→ PAID。
 * Decimal 列はサーバー境界で Number() 済み。日付は ISO 文字列。
 * ここは pure / client-safe のみ。
 */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "SENT" | "PAID";

export interface InvoiceItem {
  id: string;
  /** 摘要（ja）。 */
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** 由来の出荷書番号 SHP-YYYYMM-NNNNN（手動明細は null）。 */
  shippingOrderNumber: string | null;
  /** 由来の納品書番号 DRN-YYYYMM-NNNNN（未発行時は null）。 */
  deliveryNoteNumber: string | null;
}

export interface Invoice {
  /** 導出文書番号 INV-YYYYMM-NNNNN — URL id と同一。 */
  id: string;
  invoiceNumber: string;
  customerBpId: string;
  customerName: string;
  customerBranchName: string | null;
  /** 請求期間（ISO date）。 */
  billingPeriodFrom: string;
  billingPeriodTo: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueDate: string | null;
  sentAt: string | null;
  yayoiExportedAt: string | null;
  notes: string | null;
  items: InvoiceItem[];
  totalQuantity: number;
  createdAt: string;
  updatedAt: string;
}

/** 発行できるか — 下書きのみ。 */
export function canIssue(inv: Pick<Invoice, "status">) {
  return inv.status === "DRAFT";
}

/** 送付済みにできるか — 発行済みのみ。 */
export function canMarkSent(inv: Pick<Invoice, "status">) {
  return inv.status === "ISSUED";
}

/** 入金済みにできるか — 送付済みのみ。 */
export function canMarkPaid(inv: Pick<Invoice, "status">) {
  return inv.status === "SENT";
}
