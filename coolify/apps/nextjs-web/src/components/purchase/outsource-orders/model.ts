/**
 * model.ts — 外注依頼 (PU04) view-model types。
 *
 * 外注依頼は指示書の外注工程（work_order_steps.execution_location = OUTSOURCE）
 * の読み取り専用ビュー。依頼番号（OUT-…）だけを表 outsource_orders が持つ。
 * pure / client-safe のみ。
 */

/** 一覧 (PU04) の1行 = 指示書の外注工程。 */
export interface OutsourceStepRow {
  /** 工程ステップ uuid — 行クリックで工程実行画面へ。 */
  stepId: string;
  /**
   * 依頼番号（`OUT-2026-00001` — 番号だけ。表示専用）。依頼日が入ると DB が
   * 払い出す。まだ依頼していない工程は null。
   */
  outsourceNumber: string | null;
  /** 指示書番号（通し連番 int）。 */
  workOrderNumber: number;
  productName: string;
  processName: string;
  supplierBpId: string | null;
  supplierName: string | null;
  /** 外注依頼日。 */
  requestedAt: string | null;
  /** 入荷予定日。 */
  expectedAt: string | null;
  /** 入荷日。 */
  receivedAt: string | null;
  /** STEP_STATUS（PENDING / IN_PROGRESS / COMPLETED / CANCELLED）。 */
  status: string;
}
