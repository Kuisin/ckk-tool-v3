/**
 * model.ts — 指示書 (work_orders) の view model 型。
 *
 * server (app/(dashboard)/production/work-orders/data.ts) がこの形へマップし、
 * client components (WorkOrderTable / WorkOrderDetail / WorkflowBuilder /
 * ApprovalStatusPanel / WorkOrderStepsPanel) が表示する。純型 + 純関数のみ
 * （Prisma import なし — client-safe）。
 */

import type { CatalogStep, CompositionIssue } from "@/lib/workflow-core";

/** history Json の action → 日本語ラベル（承認記録・履歴表示用）。 */
export const WORK_ORDER_HISTORY_ACTION_LABEL: Record<string, string> = {
  CREATE: "作成",
  COPY: "コピー作成",
  UPDATE: "更新",
  REQUEST_APPROVAL: "承認依頼",
  APPROVE_1ST: "第一承認",
  APPROVE_2ND: "第二承認",
  REJECT: "差し戻し",
  CANCEL: "キャンセル",
};

// ── 一覧行 ───────────────────────────────────────────────────────────────────

export interface WorkOrderRow {
  workOrderNumber: number;
  salesOrderNumber: string;
  productName: string;
  type: string; // WORK_ORDER_TYPE
  plannedQuantity: number;
  approvalStatus: string; // WORK_ORDER_APPROVAL_STATUS
  status: string; // WORK_ORDER_STATUS
  /** 承認依頼日（承認管理 PD03 の列）。 */
  requestedAt: string | null;
  updatedAt: string;
}

// ── 詳細 ─────────────────────────────────────────────────────────────────────

export interface WorkOrderStepView {
  id: string;
  processStepId: number;
  code: string;
  name: string;
  category: string; // PROCESS_CATEGORY
  /** カタログ側の実施可能場所（INTERNAL | INTERNAL_OR_OUTSOURCE）。 */
  catalogExecution: string;
  isInspection: boolean;
  isApprovalStep: boolean;
  isSyncCapable: boolean;
  sortOrder: number;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  factoryId: number | null;
  factoryName: string | null;
  supplierBpId: string | null;
  supplierName: string | null;
  status: string; // STEP_STATUS
  inputQuantity: number | null;
  outputSuccessQuantity: number | null;
  outputDefectSemiFinished: number | null;
  outputDefectScrap: number | null;
  outputDefectRework: number | null;
  outsourceRequestedAt: string | null;
  outsourceExpectedAt: string | null;
  completedAt: string | null;
  completedByName: string | null;
}

/** history Json の 1 エントリ（表示用 — user は displayName 解決済み）。 */
export interface WorkOrderHistoryView {
  action: string;
  user: string;
  at: string;
  notes: string | null;
}

export interface WorkOrderCopyRef {
  workOrderNumber: number;
  status: string;
  createdAt: string;
}

export interface WorkOrderView {
  id: string; // uuid（内部）— アクションは workOrderNumber を使う
  workOrderNumber: number;
  status: string;
  approvalStatus: string;
  type: string;
  plannedQuantity: number;
  notes: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  salesOrderQuantity: number;
  customerName: string;
  productName: string;
  materialId: number | null;
  materialCode: string | null;
  materialName: string | null;
  /** ロット番号 = 指示書番号（受注書側の lot_number）。 */
  lotNumber: number | null;
  sourceWorkOrderNumber: number | null;
  copies: WorkOrderCopyRef[];
  inspectionTemplates: { id: number; code: string; name: string }[];
  steps: WorkOrderStepView[];
  rejectReason: string | null;
  history: WorkOrderHistoryView[];
  createdAt: string;
  updatedAt: string;
}

// ── 構成検証メッセージ ───────────────────────────────────────────────────────

/**
 * CompositionIssue → 日本語メッセージ（「円筒加工には円筒加工検査が必要です」）。
 * ビルダー（ライブ表示）とサーバー（保存時ブロック）で共用する。
 */
export function describeIssue(
  issue: CompositionIssue,
  steps: readonly CatalogStep[],
): string {
  const nameOf = (id: number) =>
    steps.find((s) => s.id === id)?.nameJa ?? `工程#${id}`;
  const step = nameOf(issue.stepId);
  const related = issue.relatedStepIds.map(nameOf);
  switch (issue.kind) {
    case "MISSING_AND":
      return `${step}には${related[0]}が必要です`;
    case "EXCLUSION":
      return `${step}と${related[0]}は同時に選択できません`;
    case "MISSING_OR_GROUP":
      return `${step}には${related.join("・")}のいずれかが必要です（素材条件で充足される場合があります）`;
  }
}
