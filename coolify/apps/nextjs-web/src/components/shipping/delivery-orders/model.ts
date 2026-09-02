/**
 * model.ts — 出荷書 (SH01) view-model types + pure helpers.
 *
 * Model (app.delivery_orders — 複合キー (year_month, seq)):
 *   表示番号 DOR-YYYYMM-NNNNN はキーから導出（保存しない）。URL id も導出番号。
 *   ヘッダは**顧客**（必須）+ 任意で指示書・出荷元拠点を持ち、注文明細への
 *   紐付けは**明細行**にある — 1 出荷書に複数の注文明細を全量・部分数量で
 *   載せられる。明細は 注文明細 × 製品 × ロット（= 指示書番号）× 数量。
 *   不変条件: 1 出荷書の明細はすべて同一顧客の注文明細であること。
 *
 * Decimal 列はサーバー境界で Number() 済み。ここは pure / client-safe のみ。
 */

import type { Tr } from "@/lib/i18n";

export type DeliveryOrderStatus = "DRAFT" | "CONFIRMED" | "SHIPPED";

/** DELIVERY_ORDER_TYPE — DISPATCH=発送（請求対象）/ STOCK_STORAGE=在庫保管（請求外）。 */
export type DeliveryOrderType = "DISPATCH" | "STOCK_STORAGE";

export interface DeliveryOrderItem {
  id: string;
  /** 出荷元の注文明細（DISPATCH では必須、在庫保管では null）。 */
  orderLineId: string | null;
  /** 導出番号 ORD-YYYYMM-NNNNN-NN。 */
  orderLineNumber: string | null;
  /** 製品の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  productId: string;
  productName: string;
  /** ロット番号 = 指示書番号（任意）。 */
  lotNumber: number | null;
  quantity: number;
  notes: string | null;
}

/** 詳細「納品書」タブの1行（delivery_notes の抜粋）。 */
export interface DeliveryOrderDeliveryNoteRef {
  /** 導出番号 DRN-YYYYMM-NNNNN。 */
  deliveryNumber: string;
  /** DELIVERY_METHOD。 */
  deliveryMethod: string;
  recipientName: string;
  /** DELIVERY_STATUS。 */
  status: string;
  deliveredAt: string | null;
}

export interface DeliveryOrder {
  /** 導出文書番号 DOR-YYYYMM-NNNNN — URL id と同一。 */
  id: string;
  deliveryOrderNumber: string;
  /** 顧客（ヘッダが権威 — 1 出荷書 = 1 顧客）。 */
  customerId: string;
  customerName: string;
  customerBranchName: string | null;
  /**
   * 営業担当（表示専用の導出値 — 明細の注文明細 → 注文請書ヘッダの担当。
   * 出荷書には保存しない。複数の注文請書を束ねたときは複数になり得る）。
   */
  salesRepNames: string[];
  /** 作成者の表示名。 */
  createdByName: string | null;
  /** 束ねている注文明細の番号（重複なし）。 */
  orderLineNumbers: string[];
  /** ヘッダ紐付けの指示書番号（任意）。 */
  workOrderNumber: number | null;
  fromPlantId: string | null;
  fromPlantName: string | null;
  type: DeliveryOrderType;
  status: DeliveryOrderStatus;
  shippedAt: string | null;
  notes: string | null;
  items: DeliveryOrderItem[];
  /** 明細数量の合計。 */
  totalQuantity: number;
  deliveryNotes: DeliveryOrderDeliveryNoteRef[];
  createdAt: string;
  updatedAt: string;
}

/** 編集可能か — 下書きの出荷書のみ。 */
export function isEditable(o: Pick<DeliveryOrder, "status">) {
  return o.status === "DRAFT";
}

/** 納品書を作成できるか — 確定済み・出荷済みの出荷書のみ。 */
export function canCreateDeliveryNote(o: Pick<DeliveryOrder, "status">) {
  return o.status === "CONFIRMED" || o.status === "SHIPPED";
}

// ── 束ね可否（1 出荷書に載せられる注文明細の条件） ──────────────────────────

/** 束ね可否の判定に使う注文明細の属性（注文請書ヘッダ由来）。 */
export interface CombinableLineRef {
  customerBpId: string | null;
  /** 出荷先（null = 顧客へ）。 */
  shipToBpId: string | null;
  /** 配送方法（通常配送 / ユーザー直送）。 */
  deliveryMethod: string;
}

/**
 * 1 出荷書に束ねられるのは **同一顧客 × 同一出荷先 × 同一配送方法** の
 * 注文明細だけ。顧客が違うと請求の顧客判定と納品書の宛先が壊れ、出荷先・
 * 配送方法が違うと物理的に 1 つの荷物にならない。クライアント
 * （グループ追加時の通知）とサーバー（作成・更新の検証）が同じ判定を使う。
 * 違反していれば人が読むエラー文、問題なければ null。
 */
export function combinabilityError(
  refs: CombinableLineRef[],
  tr: Tr,
  headerCustomerBpId?: string,
): string | null {
  if (refs.length === 0) return null;
  const first = refs[0];
  if (
    headerCustomerBpId &&
    refs.some((r) => r.customerBpId !== headerCustomerBpId)
  ) {
    return tr("shipping.deliveryOrders.onlySameCustomerCanBeCombined");
  }
  if (refs.some((r) => r.customerBpId !== first.customerBpId)) {
    return tr("shipping.deliveryOrders.onlySameCustomerCanBeCombined");
  }
  if (refs.some((r) => (r.shipToBpId ?? null) !== (first.shipToBpId ?? null))) {
    return tr("shipping.deliveryOrders.onlySameShipToCanBeCombined");
  }
  if (refs.some((r) => r.deliveryMethod !== first.deliveryMethod)) {
    return tr("shipping.deliveryOrders.onlySameDeliveryMethodCanBeCombined");
  }
  return null;
}

// ── 出荷数量の自動割付（フォームの既定行） ──────────────────────────────────

/** 割付元ロット = 注文明細に紐づく完了指示書 1 件。 */
export interface UsageSourceLot {
  /** ロット番号 = 指示書番号。 */
  lotNumber: number;
  /**
   * この注文明細の取り分（グラフ終端集計の残良品を割当順に配分した値）。
   * 統合ロット（1 指示書に複数明細）では指示書全体の出来高ではなく自明細ぶん。
   */
  outputQuantity: number;
  /** ロットの現物在庫（非半製品バケット合計）。 */
  stockQuantity: number;
}

/**
 * 注文明細の未出荷数量を関連ロットへ割り付ける（出荷書フォームの既定行）。
 *
 * 指示書番号順に、各ロットから min(自明細の取り分, 現物在庫) まで取り、
 * 残数（受注数 − 出荷済）に達したら止める。ロットの出来高が必要数より
 * 多くても必要なぶんしか載せない（統合ロットで他明細の取り分を食わない）。
 * 残数ゼロ・充当できるロットなしは空配列。
 */
export function allocateLotUsage(
  remaining: number,
  lots: UsageSourceLot[],
): { lotNumber: number; quantity: number }[] {
  const filled: { lotNumber: number; quantity: number }[] = [];
  let rest = Math.max(0, Math.floor(remaining));
  const sorted = [...lots].sort((a, b) => a.lotNumber - b.lotNumber);
  for (const lot of sorted) {
    if (rest <= 0) break;
    const available = Math.min(lot.outputQuantity, lot.stockQuantity);
    const take = Math.min(available, rest);
    if (take <= 0) continue;
    filled.push({ lotNumber: lot.lotNumber, quantity: take });
    rest -= take;
  }
  return filled;
}
