/**
 * model.ts — 工程実行画面 (§7 / design.md §12.3) の view model 型。
 *
 * server (app/(dashboard)/production/work-orders/data.ts) がこの形へマップし、
 * client components (StepExecutionView / StepQuantityForm /
 * InspectionRecordForm / DefectRecordForm) が表示する。純型のみ
 * （Prisma import なし — client-safe）。
 */

import type { InspectionItemSpec } from "@/lib/inspection-core";

export interface SelectOption {
  value: string;
  label: string;
}

// ── 検査表 ───────────────────────────────────────────────────────────────────

/** 検査項目（inspection-core の判定 spec + 表示名。Decimal → Number 済み）。 */
export interface InspectionTemplateItemView extends InspectionItemSpec {
  name: string;
}

export interface InspectionTemplateView {
  id: number;
  code: string;
  version: number;
  name: string;
  /** 関連工程（null = どの検査工程でも使用）。 */
  relatedProcessStepId: number | null;
  items: InspectionTemplateItemView[];
}

export interface InspectionRecordItemView {
  templateItemId: number;
  itemName: string;
  /** 実測値の表示文字列（複数サンプルは " / " 連結。未入力は null）。 */
  valueLabel: string | null;
  isPass: boolean | null;
}

export interface InspectionRecordView {
  id: string;
  templateId: number;
  templateName: string;
  /** 承認工程での指示書横断表示用（記録元工程名）。 */
  stepName: string | null;
  status: string; // INSPECTION_STATUS
  recordedAt: string | null;
  recordedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  items: InspectionRecordItemView[];
}

// ── 不良記録 ─────────────────────────────────────────────────────────────────

export interface StepDefectRecordView {
  id: string;
  defectTypeName: string;
  description: string;
  recordedAt: string;
  recordedByName: string | null;
}

/** 完了時の不良の内訳（{種別, 理由, 数}）。work_order_steps.defect_reasons 由来。 */
export interface StepDefectReasonView {
  type: "SEMI" | "SCRAP" | "REWORK";
  reason: string;
  count: number;
}

// ── 作業計画 / 実績（分割記録・担当者・日付/時刻） ───────────────────────────

export interface StepPlanView {
  id: string;
  userId: string;
  userName: string;
  /** YYYY-MM-DD（JST）。 */
  date: string;
  /** HH:mm（JST）— 時刻指定なしは null。 */
  startTime: string | null;
  endTime: string | null;
  quantity: number | null;
  /** 作業場所（計画のみ・任意 — 実績は常に null）。 */
  workLocationId: number | null;
  workLocationName: string | null;
  notes: string | null;
}

export type StepActualView = StepPlanView;

// ── 工程実行ページ全体 ───────────────────────────────────────────────────────

export interface StepExecutionStepView {
  id: string;
  processStepId: number;
  code: string;
  name: string;
  category: string;
  isInspection: boolean;
  isApprovalStep: boolean;
  /** 数量管理モード（NONE = 記録なしパススルー / FLOW / INSPECTION）。 */
  quantityTracking: "NONE" | "FLOW" | "INSPECTION";
  sortOrder: number;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  factoryName: string | null;
  supplierName: string | null;
  /** 予定作業時間 (h) — 任意。 */
  plannedWorkHours: number | null;
  status: string; // STEP_STATUS
  inputQuantity: number | null;
  outputSuccessQuantity: number | null;
  outputDefectSemiFinished: number | null;
  outputDefectScrap: number | null;
  outputDefectRework: number | null;
  /** 完了時の不良の内訳（{種別, 理由, 数}）。 */
  defectReasons: StepDefectReasonView[];
  sessionLockedBy: string | null;
  sessionLockedByName: string | null;
  startedAt: string | null;
  startedByName: string | null;
  completedAt: string | null;
  completedByName: string | null;
  cancelReason: string | null;
  notes: string | null;
  outsourceRequestedAt: string | null; // YYYY-MM-DD
  outsourceExpectedAt: string | null;
  outsourceReceivedAt: string | null;
  outsourceCost: number | null;
}

export interface StepExecutionData {
  actorId: string | null;
  workOrderNumber: number;
  workOrderStatus: string; // WORK_ORDER_STATUS
  plannedQuantity: number;
  step: StepExecutionStepView;
  /** 開始可否（canStartStep の結果）。 */
  canStart: { ok: boolean; reasons: string[] };
  /** 想定受入数（前工程の良品 / Σ流入エッジ / 予定数量）。 */
  expectedInputQuantity: number | null;
  /** 指示書に紐付く検査表テンプレート（検査工程で使用）。 */
  templates: InspectionTemplateView[];
  /** この工程の検査記録。 */
  stepRecords: InspectionRecordView[];
  /** 指示書全体の検査記録（承認工程での承認対象）。 */
  workOrderRecords: InspectionRecordView[];
  /** この工程の不良記録。 */
  defectRecords: StepDefectRecordView[];
  defectTypeOptions: SelectOption[];
  /** この工程の作業計画（分割可・担当者付き）。 */
  plans: StepPlanView[];
  /** この工程の作業実績（分割可・担当者付き）。 */
  actuals: StepActualView[];
  /** 作業場所の選択肢（計画フォーム用 —「グループ / 場所」ラベル）。 */
  workLocationOptions: SelectOption[];
}
