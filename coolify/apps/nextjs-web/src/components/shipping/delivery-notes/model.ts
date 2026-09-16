/**
 * model.ts — 納品書 (SH02) view-model types + pure helpers.
 *
 * Model (app.delivery_notes — 複合キー (year_month, seq)):
 *   表示番号 DRN-YYYYMM-NNNNN はキーから導出（保存しない）。URL id も導出番号。
 *   出荷書 1 : N 納品書（通常は 1:1）。納品方法が DIRECT_TO_USER（ユーザー直送）
 *   のときは最終需要家が必須で、価格記載（include_price）は既定 OFF。
 *
 * Decimal 列（unitPrice / amount）はサーバー境界で Number() 済み。
 * ここは pure / client-safe のみ。
 */

import { type TaxBucket, totalsByRateYen } from "@/lib/money";
import { taxRateFor } from "@/lib/tax-rate";

export type DeliveryNoteStatus = "DRAFT" | "ISSUED" | "DELIVERED";

/** DELIVERY_METHOD — NORMAL=通常納品 / DIRECT_TO_USER=ユーザー直送。 */
export type DeliveryMethod = "NORMAL" | "DIRECT_TO_USER";

export interface DeliveryNoteItem {
  id: string;
  /** 製品の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  productId: string;
  productName: string;
  quantity: number;
  /** 価格記載なし（includePrice=false）の納品書では null。 */
  unitPrice: number | null;
  amount: number | null;
  /**
   * その行に当たった税率（0.1 = 10%）。**出荷書の確定時**に請求単価と一緒に
   * 焼き込んだスナップショット。価格記載なしの納品書と、税区分マスタ以前の
   * 行は null（その場合は顧客の課税区分から起こす — `deliveryNoteTotals`）。
   */
  taxRate: number | null;
  notes: string | null;
}

export interface DeliveryNote {
  /** 導出文書番号 DRN-YYYYMM-NNNNN — URL id と同一。 */
  id: string;
  deliveryNumber: string;
  /** 導出番号 DOR-YYYYMM-NNNNN。 */
  deliveryOrderNumber: string;
  /** 出荷書経由の注文明細番号（参考表示）。 */
  /** 束ねている注文明細の番号（1 出荷書は複数の注文明細を持てる）。 */
  orderLineNumbers: string[];
  deliveryMethod: DeliveryMethod;
  recipientId: string;
  recipientName: string;
  recipientBranchId: string | null;
  recipientBranchName: string | null;
  /**
   * PDF の言語 — 支店の設定があればそれ、無ければ納品先本体の設定、どちらも
   * 未設定なら null（既定言語 ja）。_specs/i18n-glossary.md §2.7・決定 10。
   */
  recipientDocumentLocale: string | null;
  /** ユーザー直送時の届け先（最終需要家）。 */
  endUserId: string | null;
  endUserName: string | null;
  /** 営業担当（作成時に納品先の主担当を複写したスナップショット）。 */
  salesRepId: string | null;
  salesRepName: string | null;
  /** 作成者の表示名。 */
  createdByName: string | null;
  includePrice: boolean;
  status: DeliveryNoteStatus;
  deliveredAt: string | null;
  notes: string | null;
  items: DeliveryNoteItem[];
  totalQuantity: number;
  /** 明細金額の合計（税抜）— 価格記載なしの納品書では null。 */
  totalAmount: number | null;
  /**
   * 受取先の課税区分。税率スナップショットを持たない旧データの行だけが使う
   * （請求書・見積書と同じフォールバック）。
   */
  customerTaxType: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 小計 / 税率ごとの内訳 / 合計(税込)。価格記載なしの納品書では null を返す。 */
export interface DeliveryNoteTotals {
  subtotal: number;
  taxAmount: number;
  totalAmountInclTax: number;
  /** 率の降順。0% の束も落とさない（請求書と同じ形）。 */
  buckets: TaxBucket[];
}

/**
 * 納品書の税。**請求書とまったく同じ数え方**（`totalsByRateYen`）を通す —
 * 納品書に刷った金額と、後で届く請求書の金額が食い違ってはいけない。
 *
 * 率は行に凍結されたものが正。無い（税区分マスタ以前の）行だけ受取先の課税区分から
 * 起こすので、移行の前後で発行済みの納品書は動かない。
 *
 * 価格記載なし（includePrice=false）の納品書は金額そのものを出さないので null。
 */
export function deliveryNoteTotals(note: {
  includePrice: boolean;
  customerTaxType: string | null;
  /** 必要なのは金額と率だけ（取引先ポータルなど、view model を組み立てない
      呼び出し元からも使えるように構造だけで受ける）。 */
  items: readonly { amount: number | null; taxRate: number | null }[];
}): DeliveryNoteTotals | null {
  if (!note.includePrice) return null;
  const fallbackRate = taxRateFor(note.customerTaxType);
  const { subtotal, taxAmount, totalAmount, buckets } = totalsByRateYen(
    note.items.map((it) => ({
      amount: it.amount ?? 0,
      taxRate: it.taxRate ?? fallbackRate,
    })),
  );
  return { subtotal, taxAmount, totalAmountInclTax: totalAmount, buckets };
}

/**
 * 編集可能か — 下書きの納品書のみ。
 * 出荷書の確定で自動作成される納品書は最初から ISSUED なので、アプリ内で
 * 作られた納品書はここが true になることはない（DRAFT は SQL 由来の行だけ）。
 */
export function isEditable(n: Pick<DeliveryNote, "status">) {
  return n.status === "DRAFT";
}
