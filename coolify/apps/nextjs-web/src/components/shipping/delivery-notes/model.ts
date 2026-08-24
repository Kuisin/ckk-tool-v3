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
  /** 明細金額の合計 — 価格記載なしの納品書では null。 */
  totalAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 編集可能か — 下書きの納品書のみ。 */
export function isEditable(n: Pick<DeliveryNote, "status">) {
  return n.status === "DRAFT";
}

/** 納品書フォームの出荷書候補 — 注文明細由来の既定値（納品先・単価）込み。 */
export interface DeliveryOrderCandidate {
  /** 導出番号 DOR-YYYYMM-NNNNN（Select の値）。 */
  number: string;
  label: string;
  /** 納品先 = 出荷書の顧客（営業担当の候補を引くキー）。 */
  customerBpId: string;
  customerName: string;
  customerBranchName: string | null;
  /** 出荷書の営業担当（納品書の既定値）。 */
  salesRepId: string | null;
  /**
   * 納品方法の既定値 — 注文請書ヘッダの配送方法（出荷書の全明細で 1 つに
   * 定まるときのみ。旧データ混在や注文明細なしは null = 既定を変えない）。
   */
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER" | null;
  /** 最終需要家（ユーザー直送時の届け先既定値 — 明細行 → 注文請書ヘッダ）。 */
  endUserBpId: string | null;
  endUserName: string | null;
  /** 出荷書明細 → 納品書明細の既定行（単価は注文明細の単価）。 */
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
}
