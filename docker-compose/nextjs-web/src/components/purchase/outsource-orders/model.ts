/**
 * model.ts — 外注依頼 (PU02) view-model types。
 *
 * 外注依頼は独立テーブルを持たない — 指示書の外注工程
 * （work_order_steps.execution_location = OUTSOURCE）の読み取り専用ビュー。
 * pure / client-safe のみ。
 */

/** 一覧 (PU02) の1行 = 指示書の外注工程。 */
export interface OutsourceStepRow {
  /** 工程ステップ uuid — 行クリックで工程実行画面へ。 */
  stepId: string;
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
