/**
 * model.ts — 未処理出荷書 (SH03) の view-model 型。pure / client-safe のみ。
 *
 * 「未処理」は 2 段構えで見る:
 *   1. 未手配 (queue)     — 完成したのに出荷書に載っていない注文明細。
 *                            = 前工程の書類（完了指示書）が「出荷書にする準備が
 *                              できている」状態。
 *   2. 出荷準備中 (in-flight) — 作られたが SHIPPED になっていない出荷書。
 */

/** 未手配タブの 1 行 — 完成分が出荷書に載っていない注文明細。 */
export interface UnshippedOrderLineRow {
  /** 行 id = 注文明細番号 ORD-YYYYMM-NNNNN-NN（URL id も同じ）。 */
  id: string;
  orderLineNumber: string;
  /** 内部 uuid — 出荷書作成リンク `?orderLine=` に渡す。 */
  uuid: string;
  customerName: string;
  productName: string;
  /** 受注数量。 */
  quantity: number;
  /**
   * 完成数 = 完了指示書の出来高（グラフ終端集計）の合計。
   * 分岐・合流のある DAG でも「もう次工程へ流れない良品」だけを数える。
   */
  finishedQuantity: number;
  /** 出荷書に載っている数量の合計（下書き・確定・出荷済みすべて）。 */
  shippedQuantity: number;
  /** 未手配数量 = finishedQuantity - shippedQuantity（この一覧は常に > 0）。 */
  unshippedQuantity: number;
  /** 完了している指示書番号（= ロット番号）。 */
  completedLots: number[];
  deliveryDate: string | null;
  /** ORDER_LINE_STATUS。 */
  status: string;
  updatedAt: string;
}
