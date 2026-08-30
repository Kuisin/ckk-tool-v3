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
  /** 由来の出荷書番号 DOR-YYYYMM-NNNNN（手動明細は null）。 */
  deliveryOrderNumber: string | null;
  /** 由来の納品書番号 DRN-YYYYMM-NNNNN（未発行時は null）。 */
  deliveryNoteNumber: string | null;
}

/**
 * 逆リンク 1 行 — 納品書詳細の「次の書類へ」に出す請求書の要約。
 * 取得は app/(dashboard)/billing/invoices/data.ts の
 * fetchInvoicesForDeliveryNote。
 */
export interface InvoiceLink {
  /** 表示番号 INV-YYYYMM-NNNNN（URL id も同じ）。 */
  number: string;
  status: InvoiceStatus;
  totalAmount: number;
  issuedAt: string | null;
}

export interface Invoice {
  /** 導出文書番号 INV-YYYYMM-NNNNN — URL id と同一。 */
  id: string;
  invoiceNumber: string;
  customerBpId: string;
  customerName: string;
  customerBranchName: string | null;
  /**
   * PDF の言語 — 支店の設定があればそれ、無ければ顧客本体の設定、どちらも
   * 未設定なら null（既定言語 ja）。_specs/i18n-glossary.md §2.7・決定 10。
   */
  recipientDocumentLocale: string | null;
  /** 営業担当（作成時に顧客の主担当を複写したスナップショット）。 */
  salesRepId: string | null;
  salesRepName: string | null;
  /** 作成者の表示名。 */
  createdByName: string | null;
  /** 請求期間（ISO date）。 */
  billingPeriodFrom: string;
  billingPeriodTo: string;
  subtotal: number;
  taxAmount: number;
  /** 顧客の課税区分（消費税ラベルの % 表示に使う）。未設定は課税扱い。 */
  taxType: "TAXABLE" | "REDUCED" | "EXEMPT" | null;
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

/**
 * 消費税の表示ラベル — 顧客の課税区分に応じて 10% / 8% / 非課税 を出す。
 * 税額は締日処理が同じ区分で計算しているので、ラベルと金額が一致する
 * （以前は区分によらず「消費税（10%）」固定で、8% 顧客と食い違っていた）。
 */
export function taxLabel(taxType: Invoice["taxType"]): string {
  switch (taxType) {
    case "REDUCED":
      return "消費税（8%）";
    case "EXEMPT":
      return "消費税（非課税）";
    default:
      return "消費税（10%）";
  }
}
