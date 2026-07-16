/**
 * model.ts — 工程実行画面 (§7 / design.md §12.3) の view model 型。
 *
 * server (app/(dashboard)/production/work-orders/data.ts) がこの形へマップし、
 * client components (StepExecutionView / StepQuantityForm /
 * InspectionRecordForm / DefectRecordForm) が表示する。純型のみ
 * （Prisma import なし — client-safe）。
 */

export interface SelectOption {
  value: string;
  label: string;
}

// ── 検査表 ───────────────────────────────────────────────────────────────────

export interface InspectionTemplateItemView {
  id: number;
  name: string;
  unit: string | null;
  toleranceMin: number | null; // Decimal → Number 済み
  toleranceMax: number | null;
  isRequired: boolean;
}

export interface InspectionTemplateView {
  id: number;
  code: string;
  name: string;
  items: InspectionTemplateItemView[];
}

export interface InspectionRecordItemView {
  templateItemId: number;
  itemName: string;
  measuredValue: string | null;
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

// ── 工程実行ページ全体 ───────────────────────────────────────────────────────

export interface StepExecutionStepView {
  id: string;
  processStepId: number;
  code: string;
  name: string;
  category: string;
  isInspection: boolean;
  isApprovalStep: boolean;
  sortOrder: number;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  factoryName: string | null;
  supplierName: string | null;
  status: string; // STEP_STATUS
  inputQuantity: number | null;
  outputSuccessQuantity: number | null;
  outputDefectSemiFinished: number | null;
  outputDefectScrap: number | null;
  outputDefectRework: number | null;
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
}
