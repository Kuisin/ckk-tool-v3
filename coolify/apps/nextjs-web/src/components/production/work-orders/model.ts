/**
 * model.ts — 指示書 (work_orders) の view model 型。
 *
 * server (app/(dashboard)/production/work-orders/data.ts) がこの形へマップし、
 * client components (WorkOrderTable / WorkOrderDetail / WorkflowBuilder /
 * ApprovalStatusPanel / WorkOrderStepsPanel) が表示する。純型 + 純関数のみ
 * （Prisma import なし — client-safe）。
 */

import type { Tr } from "@/lib/i18n";
import type { CatalogStep, CompositionIssue } from "@/lib/workflow-core";

// history Json の action → 表示ラベルは lib/enum-labels.ts
// workOrderHistoryActionLabel(value, locale) が持つ（enum.WORK_ORDER_HISTORY_
// ACTION_LABEL.* — 承認記録・履歴表示用）。

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
  /** 最終検査・出荷前確認をこの工程で記録する（カタログの印）。 */
  isFinalInspection: boolean;
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
  /** ロット入力の上書き（null = 工程マスタの既定を継承）— ビルダー編集用。 */
  lotInputMode: "REQUIRED" | "OPTIONAL" | "NONE" | null;
  /** 開始時に記録したロット/伝票コード。 */
  lotText: string | null;
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
  /** この検査工程で使う検査表テンプレート（検査工程以外は空）。 */
  inspectionTemplates: { id: number; code: string; name: string }[];
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

/** 指示書→指示書リンク（work_order_links）の相手方 1 件。 */
export interface WoLinkView {
  id: string;
  workOrderNumber: number;
  docNumber: string;
  status: string;
  /** 受け渡し数量（null = 完了時の完成数全量）。 */
  quantity: number | null;
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

/** この指示書のロットが載った出荷書（手続き状況の「次の書類へ」）。 */
export interface WorkOrderShipmentView {
  /** 書類番号 DOR-YYYYMM-NNNNN。 */
  number: string;
  type: string; // DELIVERY_ORDER_TYPE
  status: string; // DELIVERY_ORDER_STATUS
  /** この指示書ロットぶんの数量。 */
  quantity: number;
}

/**
 * 最終検査・出荷前確認（旧帳票「■最終検査」欄 — 指示書 1 件に 1 行）。
 * null = まだ一度も操作されていない（初回の操作で行が作られる）。
 */
export interface WorkOrderFinalInspectionView {
  drawingLabelOk: boolean | null;
  drawingLabelCheckedByName: string | null;
  drawingLabelCheckedAt: string | null;
  protectiveCapOk: boolean | null;
  protectiveCapCheckedByName: string | null;
  protectiveCapCheckedAt: string | null;
  finishedQuantityOk: boolean | null;
  finishedQuantityCheckedByName: string | null;
  finishedQuantityCheckedAt: string | null;
  spareStockUsed: boolean;
  spareStockReceived: boolean;
  shelvedByName: string | null;
  shelvedAt: string | null;
  deliveryNoteIssuedByName: string | null;
  deliveryNoteIssuedAt: string | null;
  shipmentAuthorizedByName: string | null;
  shipmentAuthorizedAt: string | null;
  shipDefectReviewedByName: string | null;
  shipDefectReviewedAt: string | null;
  shipDefectNotes: string | null;
}

export interface WorkOrderView {
  id: string; // uuid（内部）— アクションは workOrderNumber を使う
  workOrderNumber: number;
  /** 書類番号 WO-YYYYMM-NNNNN（ヘッダ・リンクの表示identity）。 */
  docNumber: string;
  status: string;
  approvalStatus: string;
  /** 手続き状況（作成 → 承認 → 製造 → 完了）の日時。 */
  requestedAt: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** この指示書のロットが載った出荷書（次の書類への受け渡し状況）。 */
  shipments: WorkOrderShipmentView[];
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
  /** 使用する図面の版（任意のピン留め）。null = そのつど最新を引く。 */
  designFileId: string | null;
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
  /** 先行指示書（この指示書へ数量を渡す — 完了まで先頭工程は開始不可）。 */
  woLinksIncoming: WoLinkView[];
  /** 後続指示書（この指示書の完成数を受け取る）。 */
  woLinksOutgoing: WoLinkView[];
  steps: WorkOrderStepView[];
  stepLinks: StepLinkView[];
  rejectReason: string | null;
  history: WorkOrderHistoryView[];
  createdAt: string;
  updatedAt: string;
}

// ── 構成検証メッセージ ───────────────────────────────────────────────────────

/**
 * CompositionIssue → 表示メッセージ（「円筒加工には円筒加工検査が必要です」）。
 * ビルダー（ライブ表示）とサーバー（保存時ブロック）で共用する。
 */
export function describeIssue(
  issue: CompositionIssue,
  steps: readonly CatalogStep[],
  tr: Tr,
): string {
  const nameOf = (id: number) =>
    steps.find((s) => s.id === id)?.nameJa ??
    tr("production.workflowIssues.stepFallback", { id });
  const step = nameOf(issue.stepId);
  const related = issue.relatedStepIds.map(nameOf);
  switch (issue.kind) {
    case "MISSING_AND":
      return tr("production.workflowIssues.missingAnd", {
        step,
        related: related[0] ?? "",
      });
    case "EXCLUSION":
      return tr("production.workflowIssues.exclusion", {
        step,
        related: related[0] ?? "",
      });
    case "MISSING_OR_GROUP":
      return tr("production.workflowIssues.missingOrGroup", {
        step,
        related: related.join(tr("common.s1")),
      });
    case "MISSING_START":
      return tr("production.workflowIssues.missingStart", {
        related: related.join(tr("common.s1")),
      });
    case "MULTIPLE_START":
      return tr("production.workflowIssues.multipleStart", {
        related: related.join(tr("common.s1")),
      });
  }
}
