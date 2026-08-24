/**
 * model.ts — 未処理指示書 (PD05) の view-model 型。pure / client-safe のみ。
 *
 * 「未処理」は 2 段構えで見る:
 *   1. 未手配 (queue)   — 指示書がまだ足りていない**確定済み注文明細**。
 *                          = 前工程の書類が「指示書にする準備ができている」状態。
 *   2. 進行中 (in-flight) — 作られたが完了していない指示書（PD02 の部分集合）。
 */

/** 未手配タブの 1 行 — 指示書がまだ足りていない注文明細。 */
export interface UnplannedOrderLineRow {
  /** 行 id = 注文明細番号 ORD-YYYYMM-NNNNN-NN（URL id も同じ）。 */
  id: string;
  orderLineNumber: string;
  /** 内部 uuid — 指示書作成リンク `?orderLine=` に渡す。 */
  uuid: string;
  customerName: string;
  productName: string;
  /** 受注数量。 */
  quantity: number;
  /** 既存指示書の予定数量の合計（キャンセル済みは除く）。 */
  plannedQuantity: number;
  /** 未手配数量 = quantity - plannedQuantity（この一覧は常に > 0）。 */
  unplannedQuantity: number;
  /** 引当済みの製品在庫（在庫分の指示書に回せる数）。 */
  reservedStockQuantity: number;
  /** 既存指示書の件数（0 = まだ 1 件も無い）。 */
  workOrderCount: number;
  deliveryDate: string | null;
  /** ORDER_LINE_STATUS。 */
  status: string;
  /** 注文明細の確定日時（古い順に並べて滞留を見る）。 */
  confirmedAt: string | null;
  updatedAt: string;
}
