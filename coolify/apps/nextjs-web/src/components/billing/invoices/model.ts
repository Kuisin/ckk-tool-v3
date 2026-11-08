/**
 * model.ts — 請求書 (BL01) view-model types + pure helpers.
 *
 * Model (app.invoices — 複合キー (year_month, seq)):
 *   表示番号 INV-YYYYMM-NNNNN はキーから導出（保存しない）。URL id も導出番号。
 *   請求書は締日処理 (BL02, closingKind=SCHEDULED) の締めか、手動請求
 *   (BL11, closingKind=MANUAL) から作成される。明細は出荷書（DISPATCH ×
 *   SHIPPED）由来のほか、**下書きの間だけ**料金マスタから手動で足せる
 *   （§9 更新 — isManualCharge が立つ行）。
 *
 * ステータス遷移: DRAFT →(発行)→ ISSUED →(送付)→ SENT →(入金)→ PAID。
 * **承認は 2 か所** — 追加費用ありの発行前（DRAFT, approvalStatus）と、
 * 入金前（SENT, 同じ approvalStatus 列）。2 つの関門は同時に開かないので
 * （invoice.status が「いまどちらの関門か」を語る）、列は 1 組で足りる。
 * 承認設定 (MS0B) に段が 1 つも無ければ、どちらも素通し（従来どおり）。
 *
 * Decimal 列はサーバー境界で Number() 済み。日付は ISO 文字列。
 * ここは pure / client-safe のみ。
 */

import type { Tr } from "@/lib/i18n";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "SENT" | "PAID";
export type InvoiceApprovalStatus =
  | "NONE"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";
/** 締日行の実行区分の写し（billing_closings.kind）。旧データは null。 */
export type ClosingKind = "SCHEDULED" | "MANUAL";

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
  /**
   * 手動で足した追加費用の行か（料金マスタ MS0G 由来・出荷書に紐づかない）。
   * この行が 1 つでもある請求書は発行に承認が要る（§9）。
   */
  isManualCharge: boolean;
  /** 由来の料金マスタ項目 id（手動費用のときだけ）。 */
  chargeItemId: number | null;
  /** 料金マスタの**現在の**表示名（手動費用のときだけ。編集モーダルの選択肢用）。 */
  chargeItemLabel: string | null;
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
  accountingExportedAt: string | null;
  notes: string | null;
  items: InvoiceItem[];
  totalQuantity: number;
  /** 実行区分（締日処理か手動請求か）。承認導入以前の請求書は null。 */
  closingKind: ClosingKind | null;
  /** 発行前承認 / 入金前承認の状態（§9）。どちらの関門かは status から読む。 */
  approvalStatus: InvoiceApprovalStatus;
  requestedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 手動で足した追加費用が 1 行でもあるか。 */
export function hasManualCharge(
  items: readonly Pick<InvoiceItem, "isManualCharge">[],
): boolean {
  return items.some((it) => it.isManualCharge);
}

/**
 * 発行ボタンを出してよいか — 下書きで、発行前承認の依頼中でないこと。
 *
 * 承認依頼ボタンは無く、「発行」を押した時点でサーバー（issueInvoice の
 * guardIssueApproval）が「段が無ければ素通し / 有れば依頼を起こす / 承認済みなら
 * 発行」を決める。だからここで「追加費用ありは承認済みまで出さない」と絞ると、
 * 承認フロー未設定の環境では**発行を始める口が詳細画面から消える**
 * （一覧の一括発行だけが通る、という状態が実際に起きた）。押せない状態は
 * 依頼中だけで、その間は InvoiceApprovalCard が承認 / 差し戻しを出す。
 * 承認が要るかどうかの判定自体は needsIssueApproval が持つ。
 */
export function canIssue(
  inv: Pick<Invoice, "status" | "items" | "approvalStatus">,
): boolean {
  if (inv.status !== "DRAFT") return false;
  if (!hasManualCharge(inv.items)) return true;
  return inv.approvalStatus !== "PENDING";
}

/** 発行前承認が要る状態か（DRAFT かつ追加費用あり）。 */
export function needsIssueApproval(
  inv: Pick<Invoice, "status" | "items">,
): boolean {
  return inv.status === "DRAFT" && hasManualCharge(inv.items);
}

/** 送付済みにできるか — 発行済みのみ。 */
export function canMarkSent(inv: Pick<Invoice, "status">) {
  return inv.status === "ISSUED";
}

/**
 * 「入金」ボタンを出せるか — 送付済みのみ。実際に入金済みになるか
 * 承認依頼が立つだけかは、承認設定 (MS0B) の入金前承認フローの有無で
 * サーバーが決める（未設定 = 即・入金済み）。
 */
export function canMarkPaid(inv: Pick<Invoice, "status">) {
  return inv.status === "SENT";
}

/** 承認 / 差し戻しの対象にできるか — 依頼中（発行前・入金前のどちらか）。 */
export function canActOnApproval(inv: Pick<Invoice, "approvalStatus">) {
  return inv.approvalStatus === "PENDING";
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
  // ── 会計連携（仕訳 CSV）用のコード ────────────────────────────────────────
  // 税区分マスタ由来。**画面では使わない** — 出力にだけ効く。null = 設定の既定。
  /** 消費税コード。 */
  taxCode?: string | null;
  /** 売上高の科目コード（貸方・売上行）。 */
  salesAccountCode?: string | null;
  /** 仮受消費税の科目コード（貸方・消費税行）。 */
  taxAccountCode?: string | null;
  /**
   * 束の税区分が一意に定まらず、明細の区分がコードで**食い違っている**。
   * 会計連携のエクスポートはこれが立っている請求書を拒否する
   * （違う科目へ計上された仕訳を出すより、出さないほうが安い）。
   */
  codeConflict?: boolean;
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
 * 前後で古い請求書の画面・PDF・会計連携 CSV が 1 文字も変わらない。
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
