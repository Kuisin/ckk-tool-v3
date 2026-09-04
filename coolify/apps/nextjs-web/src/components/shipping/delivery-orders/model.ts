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

// ── 束ね可否（1 出荷書に載せられる注文明細の条件） ──────────────────────────

/** 束ね可否の判定に使う注文明細の属性（注文請書ヘッダ由来）。 */
export interface CombinableLineRef {
  customerBpId: string | null;
  /** 出荷先（null = 顧客へ）。 */
  shipToBpId: string | null;
  /** 配送方法（通常配送 / ユーザー直送）。 */
  deliveryMethod: string;
  /**
   * 実効エンドユーザー（明細の行ごと指定 ?? 注文請書ヘッダの既定）。
   * 出荷書確定時の納品書自動作成（planAutoDeliveryNotes）が「届け先 1 件」を
   * 前提にするため、ユーザー直送の明細どうしはここも揃っている必要がある。
   * 通常配送では無視する（省略可）。
   */
  endUserBpId?: string | null;
}

/**
 * 1 出荷書に束ねられるのは **同一顧客 × 同一出荷先 × 同一配送方法** の
 * 注文明細だけ（ユーザー直送はさらに **同一エンドユーザー** も要る —
 * 納品書自動作成が届け先を 1 件に決め打つため）。顧客が違うと請求の顧客判定と
 * 納品書の宛先が壊れ、出荷先・配送方法が違うと物理的に 1 つの荷物にならない。
 * クライアント（グループ追加時の通知）とサーバー（作成・更新の検証）が同じ
 * 判定を使う。違反していれば人が読むエラー文、問題なければ null。
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
  if (
    first.deliveryMethod === "DIRECT_TO_USER" &&
    refs.some((r) => (r.endUserBpId ?? null) !== (first.endUserBpId ?? null))
  ) {
    return tr("shipping.deliveryOrders.onlySameEndUserCanBeCombined");
  }
  return null;
}

// ── 納品書の自動作成（出荷書確定時） ─────────────────────────────────────

/** 納品書 1 通ぶんの計画（出荷書確定時に自動作成する）。 */
export interface AutoDeliveryNotePlan {
  recipientBpId: string;
  recipientBranchBpId: string | null;
  /** DIRECT_TO_USER の「届け先」メタ欄（宛先そのものではない）。 */
  endUserBpId: string | null;
  includePrice: boolean;
}

export interface AutoDeliveryNotePlanInput {
  customerBpId: string;
  customerBranchBpId: string | null;
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
  /**
   * 実効エンドユーザー — combinabilityError が全明細で揃っていることを
   * 保証しているので、DIRECT_TO_USER では非 null が前提（呼び出し側は
   * 出荷書確定より前の注文請書側バリデーションで endUserBpId 必須を強制済み）。
   */
  endUserBpId: string | null;
}

/**
 * 出荷書確定 (DRAFT → CONFIRMED) 時に自動作成する納品書の内訳。
 *
 * 通常配送 = 1 通（顧客宛・価格記載あり、従来の手動作成の既定と同じ）。
 * ユーザー直送 = 2 通 — ①価格記載なしを最終需要家（現物に同梱して手渡す
 * 相手）へ、②価格記載ありを顧客（請求関係のある相手）へ。顧客に価格を、
 * 最終需要家に価格の付いた書類を渡してしまう事故を構造で防ぐ
 * （①の宛先を最終需要家そのものにすることで、価格記載ありの書類が
 * 最終需要家の手に渡る経路自体を作らない）。
 *
 * endUserBpId が解決できない（データ不整合）ときは ① を作らず ② のみ返す —
 * 呼び出し側はこの場合を検知して人に確認を促すこと。
 */
export function planAutoDeliveryNotes(
  input: AutoDeliveryNotePlanInput,
): AutoDeliveryNotePlan[] {
  if (input.deliveryMethod !== "DIRECT_TO_USER") {
    return [
      {
        recipientBpId: input.customerBpId,
        recipientBranchBpId: input.customerBranchBpId,
        endUserBpId: null,
        includePrice: true,
      },
    ];
  }
  const notes: AutoDeliveryNotePlan[] = [];
  if (input.endUserBpId) {
    notes.push({
      recipientBpId: input.endUserBpId,
      recipientBranchBpId: null,
      endUserBpId: null,
      includePrice: false,
    });
  }
  notes.push({
    recipientBpId: input.customerBpId,
    recipientBranchBpId: input.customerBranchBpId,
    endUserBpId: input.endUserBpId,
    includePrice: true,
  });
  return notes;
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
