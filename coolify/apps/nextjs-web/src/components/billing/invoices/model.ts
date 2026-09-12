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

import type { Tr } from "@/lib/i18n";

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
  /**
   * 発行時の課税区分（消費税ラベルの % 表示に使う）。**税率が混在する請求書では
   * null** — ヘッダは 2 率を表せないため。内訳は `taxBuckets` を見ること。
   */
  taxType: "TAXABLE" | "REDUCED" | "EXEMPT" | null;
  /**
   * 発行時の税率（0.1 = 10%）。混在請求書では null。旧データ（税率スナップショット
   * 導入前）も null。
   */
  taxRate: number | null;
  /**
   * 税率ごとの区分記載（適格請求書）。率の降順・0% の束も落とさない。
   * 税区分マスタ以前に発行された請求書はヘッダから 1 本合成するので、
   * **必ず 1 件以上ある**（金額が 0 の請求書を除く）。
   */
  taxBuckets: InvoiceTaxBucket[];
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
 *
 * @deprecated 税率ごとの区分記載（`taxBucketLabel`）へ移行中。混在請求書では
 * `taxType` が null になるため、この関数は「標準」と嘘をつく。
 */
export function taxLabel(taxType: Invoice["taxType"], tr: Tr): string {
  switch (taxType) {
    case "REDUCED":
      return tr("billing.invoices.taxLabelReduced");
    case "EXEMPT":
      return tr("billing.invoices.taxLabelExempt");
    default:
      return tr("billing.invoices.taxLabelStandard");
  }
}

/** 税率ごとの区分記載 1 行。 */
export interface InvoiceTaxBucket {
  /** 0.1 = 10%。 */
  taxRate: number;
  /** この率の対象となる税抜金額。 */
  taxableBase: number;
  taxAmount: number;
  /** 区分の表示名（区分が 1 つに定まるときだけ）。 */
  categoryName: string | null;
}

/**
 * 束の見出し — 「消費税（10%）」。
 *
 * **率から組み立てる**（区分名ではなく）。区分名は「軽減税率」のように率を
 * 含まないことがあり、区分記載として読めないため。0% だけは「非課税」と出す
 * — 「消費税（0%）」は帳票の言い回しとして不自然。
 */
export function taxBucketLabel(bucket: InvoiceTaxBucket, tr: Tr): string {
  if (bucket.taxRate === 0) return tr("billing.invoices.taxLabelExempt");
  return tr("billing.invoices.taxLabelRate", {
    rate: formatRatePercent(bucket.taxRate),
  });
}

/** 0.08 → "8"、0.0825 → "8.25"（端数を落とさない）。 */
export function formatRatePercent(taxRate: number): string {
  return String(Number((taxRate * 100).toFixed(4)));
}

/**
 * 表示用の束を決める。
 *
 * 税区分マスタ以前に発行された請求書には `invoice_tax_summaries` の行が無いので、
 * **ヘッダ（小計・税額・税率）から 1 本合成する**。これがあるおかげで、移行の
 * 前後で古い請求書の画面・PDF・弥生 CSV が 1 文字も変わらない。
 */
export function resolveTaxBuckets(
  invoice: Pick<Invoice, "subtotal" | "taxAmount" | "taxRate" | "taxBuckets">,
): InvoiceTaxBucket[] {
  if (invoice.taxBuckets.length > 0) return invoice.taxBuckets;
  return [
    {
      // 率は**保存されている値が先**。無い（税率スナップショット導入以前の）行
      // だけ「税額 ÷ 小計」から起こす。割り算を先にすると、1005 円 × 10% = 101 の
      // ような端数で 0.1005 という有り得ない率が出る。
      taxRate:
        invoice.taxRate ?? derivedRate(invoice.subtotal, invoice.taxAmount),
      taxableBase: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      categoryName: null,
    },
  ];
}

/** 税額と小計から率を起こす（旧データのフォールバック）。 */
function derivedRate(subtotal: number, taxAmount: number): number {
  if (subtotal === 0) return 0;
  return Number((taxAmount / subtotal).toFixed(4));
}
