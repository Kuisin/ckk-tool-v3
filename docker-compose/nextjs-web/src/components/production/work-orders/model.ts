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
  APPROVE_STEP: "承認",
  APPROVE_FINAL: "最終承認",
  // 2 段固定だった頃の履歴行。過去データを読むために残す。
  APPROVE_1ST: "第一承認",
  APPROVE_2ND: "第二承認",
  REJECT: "差し戻し",
  CANCEL: "キャンセル",
};

// ── 一覧行 ───────────────────────────────────────────────────────────────────

export interface WorkOrderRow {
  workOrderNumber: number;
  /** 書類番号 WO-YYYYMM-NNNNN（一覧・リンクの表示identity）。 */
  docNumber: string;
  createdAt: string;
  /**
   * 割当明細の表示ラベル（複数は「ORD-… ほか n 件」）。
   * null = 在庫向けの独立指示書（注文明細なし）。
   */
  orderLineNumber: string | null;
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

/** 工程ステップ間の分岐・合流エッジ（work_order_step_links）。 */
export interface StepLinkView {
  sourceStepId: string;
  targetStepId: string;
  routedQuantity: number;
}

/** 工程の担当者（作業計画 work_order_step_plans の割当ユーザー）。 */
export interface StepAssigneeView {
  userId: string;
  name: string;
  /** プロフィール写真（小）の URL。無ければ null → イニシャル表示。 */
  avatarUrl: string | null;
}

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
  /** 数量管理モード（NONE = 記録なしパススルー / FLOW / INSPECTION）。 */
  quantityTracking: "NONE" | "FLOW" | "INSPECTION";
  sortOrder: number;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  plantId: number | null;
  plantName: string | null;
  supplierBpId: string | null;
  supplierName: string | null;
  /** 予定作業時間 (h) — 任意。 */
  plannedWorkHours: number | null;
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
  /** 作業計画 / 実績の件数（工程実行ページで記録）。 */
  planCount: number;
  actualCount: number;
  /**
   * 分岐系列の終端処理（§7）。値があれば「この工程で系列が終わり、良品は
   * この在庫へ入る」。null = 合流する / 分岐系列ではない。
   */
  branchStockDisposition: "SEMI_FINISHED" | "PRODUCT" | null;
  /** 作業計画で割り当てられた担当者（重複排除・計画日順）。 */
  assignees: StepAssigneeView[];
  /** 実働時間 (h) — 実績の開始〜終了の累計。null = 数えられる実績なし。 */
  actualWorkHours: number | null;
  /** サーバーで canStartStep により算出（PENDING で依存充足なら true）。 */
  canStart: boolean;
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
  /** 書類番号 WO-YYYYMM-NNNNN。 */
  docNumber: string;
  status: string;
  createdAt: string;
}

/** 指示書に割り当てられた注文明細（work_order_order_lines 1 行）。 */
export interface WorkOrderLineAllocView {
  orderLineId: string;
  number: string;
  /** この指示書がこの明細のために充当する数量。 */
  allocatedQuantity: number;
  /** 明細の受注数量。 */
  lineQuantity: number;
  customerName: string | null;
  status: string;
  lotNumber: number | null;
}

export interface WorkOrderView {
  id: string; // uuid（内部）— アクションは workOrderNumber を使う
  workOrderNumber: number;
  /** 書類番号 WO-YYYYMM-NNNNN（ヘッダ・リンクの表示identity）。 */
  docNumber: string;
  status: string;
  approvalStatus: string;
  type: string;
  plannedQuantity: number;
  notes: string | null;
  /**
   * 割当明細（sortOrder 順）。空 = 在庫向けの独立指示書（製品直接指定）。
   * 分割（1 明細 → 複数指示書）・統合（複数明細 → 1 指示書）の両対応。
   */
  orderLines: WorkOrderLineAllocView[];
  /** 作成者の表示名（システム作成は null）。 */
  createdByName: string | null;
  productName: string;
  materialId: number | null;
  materialCode: string | null;
  materialName: string | null;
  /** 完成品の保管場所（保管場所マスタ MS0E。null = 未指定）。 */
  storageLocationId: number | null;
  storageLocationName: string | null;
  /** 注文明細の対象製品（工程ルートのリンク先）。 */
  productId: number;
  /** 工程ルート出所（未使用 = null）。 */
  routeVersionId: string | null;
  routeId: number | null;
  routeName: string | null;
  routeVersion: number | null;
  /** ロット番号 = 指示書番号（注文明細側の lot_number）。 */
  lotNumber: number | null;
  sourceWorkOrderNumber: number | null;
  sourceWorkOrderDocNumber: string | null;
  copies: WorkOrderCopyRef[];
  inspectionTemplates: { id: number; code: string; name: string }[];
  steps: WorkOrderStepView[];
  stepLinks: StepLinkView[];
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
