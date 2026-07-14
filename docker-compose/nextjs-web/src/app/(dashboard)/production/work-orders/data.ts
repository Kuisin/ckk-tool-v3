/**
 * data.ts — 指示書 (app.work_orders) の server-side fetch/mapping.
 *
 * URL id = work_order_number（通し連番 int = ロット番号）。表示は生 int（mono）。
 * 承認履歴は history Json（{action,user,at,notes}）を displayName 解決して返す。
 */

import type { ApprovalTrailView } from "@/components/production/ApprovalStatusPanel";
import type {
  InspectionRecordView,
  InspectionTemplateView,
  StepDefectRecordView,
  StepExecutionData,
} from "@/components/production/step-execution/model";
import type {
  WorkOrderRow,
  WorkOrderView,
} from "@/components/production/work-orders/model";
import { fetchApprovalTrail, type HistoryEntry } from "@/lib/approvals";
import { getCurrentActorId } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatSalesOrderNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchWorkflowCtx, loadCatalog } from "@/lib/workflow";
import { canStartStep, expectedInput } from "@/lib/workflow-core";

const WO_INCLUDE = {
  salesOrder: { include: { customerBp: true, product: true } },
  material: true,
  sourceWorkOrder: { select: { workOrderNumber: true } },
  copies: {
    select: { workOrderNumber: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
  },
  steps: {
    include: { processStep: true, factory: true, supplierBp: true },
    orderBy: { sortOrder: "asc" as const },
  },
  stepLinks: true,
  inspectionTemplates: { include: { inspectionTemplate: true } },
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function mapRow(r: {
  workOrderNumber: number;
  salesOrder: {
    yearMonth: string;
    seq: number;
    branch: number;
    product: { name: unknown };
  };
  type: string;
  plannedQuantity: number;
  approvalStatus: string;
  status: string;
  requested1stAt: Date | null;
  updatedAt: Date;
}): WorkOrderRow {
  return {
    workOrderNumber: r.workOrderNumber,
    salesOrderNumber: formatSalesOrderNumber(r.salesOrder),
    productName: localized(r.salesOrder.product.name as LocalizedText | null),
    type: r.type,
    plannedQuantity: r.plannedQuantity,
    approvalStatus: r.approvalStatus,
    status: r.status,
    requestedAt: iso(r.requested1stAt),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** 指示書一覧 (PD02)。 */
export async function fetchWorkOrders(): Promise<WorkOrderRow[]> {
  const rows = await prisma.workOrder.findMany({
    include: { salesOrder: { include: { product: true } } },
    orderBy: { workOrderNumber: "desc" },
  });
  return rows.map(mapRow);
}

/**
 * 指示書の承認記録（approval_requests / approval_records — 承認者名解決済み、
 * client-safe）。ApprovalStatusPanel の trail へ渡す。
 */
export async function fetchWorkOrderApprovalTrail(
  workOrderNumber: number,
): Promise<ApprovalTrailView[]> {
  return fetchApprovalTrail("work_orders", String(workOrderNumber));
}

/** 指示書 詳細 view model。id = work_order_number。 */
export async function fetchWorkOrder(
  workOrderNumber: number,
): Promise<WorkOrderView | null> {
  const r = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    include: WO_INCLUDE,
  });
  if (!r) return null;

  // 工程ごとの開始可否（実行依存 + 分岐流入 + ロック）をサーバーで算出
  const [{ ctx }, actorId] = await Promise.all([
    fetchWorkflowCtx(r.id),
    getCurrentActorId(),
  ]);

  // history Json + 工程 completedBy の uuid → displayName 解決
  const historyRaw: HistoryEntry[] = Array.isArray(r.history)
    ? (r.history as unknown as HistoryEntry[])
    : [];
  const userIds = new Set<string>();
  for (const h of historyRaw) if (h.user) userIds.add(h.user);
  for (const s of r.steps) if (s.completedBy) userIds.add(s.completedBy);
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null | undefined) =>
    (id && users.find((u) => u.id === id)?.displayName) || "システム";

  return {
    id: r.id,
    workOrderNumber: r.workOrderNumber,
    status: r.status,
    approvalStatus: r.approvalStatus,
    type: r.type,
    plannedQuantity: r.plannedQuantity,
    notes: r.notes,
    salesOrderId: r.salesOrderId,
    salesOrderNumber: formatSalesOrderNumber(r.salesOrder),
    salesOrderQuantity: r.salesOrder.quantity,
    customerName: localized(
      r.salesOrder.customerBp.name as LocalizedText | null,
    ),
    productName: localized(r.salesOrder.product.name as LocalizedText | null),
    materialId: r.materialId,
    materialCode: r.material?.code ?? null,
    materialName: r.material
      ? localized(r.material.name as LocalizedText | null)
      : null,
    lotNumber: r.salesOrder.lotNumber,
    sourceWorkOrderNumber: r.sourceWorkOrder?.workOrderNumber ?? null,
    copies: r.copies.map((c) => ({
      workOrderNumber: c.workOrderNumber,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
    inspectionTemplates: r.inspectionTemplates.map((t) => ({
      id: t.inspectionTemplate.id,
      code: t.inspectionTemplate.code,
      name: localized(t.inspectionTemplate.name as LocalizedText | null),
    })),
    steps: r.steps.map((s) => ({
      id: s.id,
      processStepId: s.processStepId,
      code: s.processStep.code,
      name: localized(s.processStep.name as LocalizedText | null),
      category: s.processStep.category,
      catalogExecution: s.processStep.executionLocation,
      isInspection: s.processStep.isInspection,
      isApprovalStep: s.processStep.isApprovalStep,
      isSyncCapable: s.processStep.isSyncCapable,
      sortOrder: s.sortOrder,
      executionLocation: s.executionLocation,
      factoryId: s.factoryId,
      factoryName: s.factory
        ? localized(s.factory.name as LocalizedText | null)
        : null,
      supplierBpId: s.supplierBpId,
      supplierName: s.supplierBp
        ? localized(s.supplierBp.name as LocalizedText | null)
        : null,
      status: s.status,
      inputQuantity: s.inputQuantity,
      outputSuccessQuantity: s.outputSuccessQuantity,
      outputDefectSemiFinished: s.outputDefectSemiFinished,
      outputDefectScrap: s.outputDefectScrap,
      outputDefectRework: s.outputDefectRework,
      outsourceRequestedAt: iso(s.outsourceRequestedAt),
      outsourceExpectedAt: iso(s.outsourceExpectedAt),
      completedAt: iso(s.completedAt),
      completedByName: s.completedBy ? nameOf(s.completedBy) : null,
      canStart: canStartStep(s.id, ctx, actorId).ok,
    })),
    stepLinks: r.stepLinks.map((l) => ({
      sourceStepId: l.sourceStepId,
      targetStepId: l.targetStepId,
      routedQuantity: l.routedQuantity,
    })),
    rejectReason: r.rejectReason,
    history: historyRaw.map((h) => ({
      action: h.action,
      user: nameOf(h.user),
      at: h.at,
      notes: h.notes ?? null,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── 工程実行 (§7 / design.md §12.3) ─────────────────────────────────────────

const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** 工程実行ページの view model。指示書に属さない stepId は null。 */
export async function fetchStepExecution(
  workOrderNumber: number,
  stepId: string,
): Promise<StepExecutionData | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: { id: true, status: true, plannedQuantity: true },
  });
  if (!wo) return null;

  const step = await prisma.workOrderStep.findFirst({
    where: { id: stepId, workOrderId: wo.id },
    include: {
      processStep: true,
      factory: true,
      supplierBp: true,
      inspectionRecords: {
        include: {
          template: true,
          items: { include: { templateItem: true } },
        },
        orderBy: { recordedAt: "desc" },
      },
      defectRecords: {
        include: { defectType: true },
        orderBy: { recordedAt: "desc" },
      },
    },
  });
  if (!step) return null;

  const [{ ctx }, actorId, templateLinks, defectTypes] = await Promise.all([
    fetchWorkflowCtx(wo.id),
    getCurrentActorId(),
    prisma.workOrderInspectionTemplate.findMany({
      where: { workOrderId: wo.id },
      include: {
        inspectionTemplate: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    prisma.defectType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  // 承認工程は指示書全体の検査記録を承認対象として表示する
  const woRecordsRaw = step.processStep.isApprovalStep
    ? await prisma.inspectionRecord.findMany({
        where: { step: { workOrderId: wo.id } },
        include: {
          template: true,
          step: { include: { processStep: true } },
          items: { include: { templateItem: true } },
        },
        orderBy: { recordedAt: "desc" },
      })
    : [];

  // user uuid → displayName 解決
  const userIds = new Set<string>();
  for (const id of [step.sessionLockedBy, step.startedBy, step.completedBy]) {
    if (id) userIds.add(id);
  }
  for (const rec of [...step.inspectionRecords, ...woRecordsRaw]) {
    if (rec.recordedBy) userIds.add(rec.recordedBy);
    if (rec.approvedBy) userIds.add(rec.approvedBy);
  }
  for (const d of step.defectRecords) {
    if (d.recordedBy) userIds.add(d.recordedBy);
  }
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null | undefined) =>
    id ? (users.find((u) => u.id === id)?.displayName ?? "システム") : null;

  type RecordRaw = (typeof step.inspectionRecords)[number];
  const mapRecord = (
    rec: RecordRaw,
    stepName: string | null,
  ): InspectionRecordView => ({
    id: rec.id,
    templateId: rec.templateId,
    templateName: localized(rec.template.name as LocalizedText | null),
    stepName,
    status: rec.status,
    recordedAt: iso(rec.recordedAt),
    recordedByName: nameOf(rec.recordedBy),
    approvedAt: iso(rec.approvedAt),
    approvedByName: nameOf(rec.approvedBy),
    items: rec.items.map((it) => ({
      templateItemId: it.templateItemId,
      itemName: localized(it.templateItem.itemName as LocalizedText | null),
      measuredValue: it.measuredValue,
      isPass: it.isPass,
    })),
  });

  const templates: InspectionTemplateView[] = templateLinks.map((t) => ({
    id: t.inspectionTemplate.id,
    code: t.inspectionTemplate.code,
    name: localized(t.inspectionTemplate.name as LocalizedText | null),
    items: t.inspectionTemplate.items.map((it) => ({
      id: it.id,
      name: localized(it.itemName as LocalizedText | null),
      unit: it.unit,
      // Decimal → Number（境界で変換）
      toleranceMin: it.toleranceMin == null ? null : Number(it.toleranceMin),
      toleranceMax: it.toleranceMax == null ? null : Number(it.toleranceMax),
      isRequired: it.isRequired,
    })),
  }));

  const defectRecords: StepDefectRecordView[] = step.defectRecords.map((d) => ({
    id: d.id,
    defectTypeName: localized(d.defectType.name as LocalizedText | null),
    description: d.description,
    recordedAt: d.recordedAt.toISOString(),
    recordedByName: nameOf(d.recordedBy),
  }));

  return {
    actorId,
    workOrderNumber,
    workOrderStatus: wo.status,
    plannedQuantity: wo.plannedQuantity,
    step: {
      id: step.id,
      processStepId: step.processStepId,
      code: step.processStep.code,
      name: localized(step.processStep.name as LocalizedText | null),
      category: step.processStep.category,
      isInspection: step.processStep.isInspection,
      isApprovalStep: step.processStep.isApprovalStep,
      sortOrder: step.sortOrder,
      executionLocation: step.executionLocation,
      factoryName: step.factory
        ? localized(step.factory.name as LocalizedText | null)
        : null,
      supplierName: step.supplierBp
        ? localized(step.supplierBp.name as LocalizedText | null)
        : null,
      status: step.status,
      inputQuantity: step.inputQuantity,
      outputSuccessQuantity: step.outputSuccessQuantity,
      outputDefectSemiFinished: step.outputDefectSemiFinished,
      outputDefectScrap: step.outputDefectScrap,
      outputDefectRework: step.outputDefectRework,
      sessionLockedBy: step.sessionLockedBy,
      sessionLockedByName: nameOf(step.sessionLockedBy),
      startedAt: iso(step.startedAt),
      startedByName: nameOf(step.startedBy),
      completedAt: iso(step.completedAt),
      completedByName: nameOf(step.completedBy),
      cancelReason: step.cancelReason,
      notes: step.notes,
      outsourceRequestedAt: dateOnly(step.outsourceRequestedAt),
      outsourceExpectedAt: dateOnly(step.outsourceExpectedAt),
      outsourceReceivedAt: dateOnly(step.outsourceReceivedAt),
    },
    canStart: canStartStep(step.id, ctx, actorId),
    expectedInputQuantity: expectedInput(step.id, ctx),
    templates,
    stepRecords: step.inspectionRecords.map((r) => mapRecord(r, null)),
    workOrderRecords: woRecordsRaw.map((r) =>
      mapRecord(r, localized(r.step.processStep.name as LocalizedText | null)),
    ),
    defectRecords,
    defectTypeOptions: defectTypes.map((d) => ({
      value: String(d.id),
      label: `${d.code} ${localized(d.name as LocalizedText | null)}`,
    })),
  };
}

// ── ビルダー用 options ───────────────────────────────────────────────────────

export interface Option {
  value: string;
  label: string;
}

/** 工程カタログ（有効のみ）— 分岐追加モーダルの MultiSelect。value = String(id)。 */
export async function fetchCatalogStepOptions(): Promise<Option[]> {
  const catalog = await loadCatalog();
  return catalog.steps.map((s) => ({
    value: String(s.id),
    label: `${s.code} ${s.nameJa}`,
  }));
}

/** 工場（有効のみ）— 社内工程の実施工場 Select。value = String(内部 id)。 */
export async function fetchFactoryOptions(): Promise<Option[]> {
  const rows = await prisma.factory.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}

/** 検査表テンプレート（有効のみ）— MultiSelect。value = String(内部 id)。 */
export async function fetchInspectionTemplateOptions(): Promise<Option[]> {
  const rows = await prisma.inspectionTemplate.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}

/**
 * 外注先（VENDOR ロールの有効 BP）— 外注工程の仕入先 Select。value = uuid。
 * option-search に VENDOR 検索が無いため、サーバーで全件ロードして渡す
 * （外注先は少数マスタの想定）。
 */
export async function fetchSupplierOptions(): Promise<Option[]> {
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      roleAssignments: { some: { role: "VENDOR" } },
    },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    value: r.id,
    label: `${r.bpCode ?? "—"} ${localized(r.name as LocalizedText | null)}`,
  }));
}

// ── 注文請書参照（?salesOrder= プリセレクト・ビルダーの選択情報） ────────────────

export interface SalesOrderRef {
  id: string;
  number: string;
  label: string;
  customerName: string;
  productName: string;
  quantity: number;
  status: string;
}

export async function fetchSalesOrderRef(
  salesOrderId: string,
): Promise<SalesOrderRef | null> {
  const r = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { customerBp: true, product: true },
  });
  if (!r) return null;
  const number = formatSalesOrderNumber(r);
  const productName = localized(r.product.name as LocalizedText | null);
  return {
    id: r.id,
    number,
    label: `${number} ${productName}（${r.quantity}）`,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    productName,
    quantity: r.quantity,
    status: r.status,
  };
}
