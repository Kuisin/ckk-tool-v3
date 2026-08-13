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
  StepDefectReasonView,
  StepDefectRecordView,
  StepExecutionData,
  StepPlanView,
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
import {
  formatSampleValue,
  type InspectionItemRecord,
  itemSpecFromRow,
  parseStoredSamples,
} from "@/lib/inspection-core";
import { fetchWorkflowCtx, loadCatalog } from "@/lib/workflow";
import { canStartStep, expectedInput } from "@/lib/workflow-core";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

/** work_order_steps.defect_reasons（Json）→ 表示用の {種別, 理由, 数} 配列。 */
function parseDefectReasons(value: unknown): StepDefectReasonView[] {
  if (!Array.isArray(value)) return [];
  const out: StepDefectReasonView[] = [];
  for (const v of value) {
    if (v == null || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    if (
      (r.type === "SEMI" || r.type === "SCRAP" || r.type === "REWORK") &&
      typeof r.count === "number"
    ) {
      out.push({
        type: r.type,
        reason: typeof r.reason === "string" ? r.reason : "",
        count: r.count,
      });
    }
  }
  return out;
}

const WO_INCLUDE = {
  salesOrder: { include: { customerBp: true, product: true } },
  material: true,
  routeVersion: {
    select: {
      id: true,
      version: true,
      route: { select: { id: true, name: true, productId: true } },
    },
  },
  sourceWorkOrder: { select: { workOrderNumber: true } },
  copies: {
    select: { workOrderNumber: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
  },
  steps: {
    include: {
      processStep: true,
      factory: true,
      supplierBp: true,
      _count: { select: { plans: true, actuals: true } },
    },
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
    take: LIST_FETCH_CAP,
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
    productId: r.salesOrder.productId,
    routeVersionId: r.routeVersion?.id ?? null,
    routeId: r.routeVersion?.route.id ?? null,
    routeName: r.routeVersion
      ? localized(r.routeVersion.route.name as LocalizedText | null)
      : null,
    routeVersion: r.routeVersion?.version ?? null,
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
      quantityTracking: s.processStep.quantityTracking,
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
      planCount: s._count.plans,
      actualCount: s._count.actuals,
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

// ── 工程スプリットビュー（/[id]/steps レイアウトの左ペイン） ─────────────────

/** 工程ナビ 1 行分（スプリットペインの一覧項目）。 */
export interface StepNavItem {
  id: string;
  code: string;
  name: string;
  status: string;
  executionLocation: string;
  factoryName: string | null;
  supplierName: string | null;
  isInspection: boolean;
  isApprovalStep: boolean;
}

export interface WorkOrderStepNav {
  workOrderNumber: number;
  steps: StepNavItem[];
}

/**
 * 工程一覧ペイン用の軽量 fetch。fetchWorkOrder と違い実行可否（workflow ctx）
 * は計算しない — 工程間の遷移ごとにレイアウトで呼ばれるため。
 */
export async function fetchWorkOrderStepNav(
  workOrderNumber: number,
): Promise<WorkOrderStepNav | null> {
  const r = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: {
      workOrderNumber: true,
      steps: {
        select: {
          id: true,
          status: true,
          executionLocation: true,
          processStep: {
            select: {
              code: true,
              name: true,
              isInspection: true,
              isApprovalStep: true,
            },
          },
          factory: { select: { name: true } },
          supplierBp: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!r) return null;
  return {
    workOrderNumber: r.workOrderNumber,
    steps: r.steps.map((s) => ({
      id: s.id,
      code: s.processStep.code,
      name: localized(s.processStep.name as LocalizedText | null),
      status: s.status,
      executionLocation: s.executionLocation,
      factoryName: s.factory
        ? localized(s.factory.name as LocalizedText | null)
        : null,
      supplierName: s.supplierBp
        ? localized(s.supplierBp.name as LocalizedText | null)
        : null,
      isInspection: s.processStep.isInspection,
      isApprovalStep: s.processStep.isApprovalStep,
    })),
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
      plans: {
        include: { user: { select: { displayName: true } } },
        orderBy: [{ plannedDate: "asc" }, { plannedStartAt: "asc" }],
      },
      actuals: {
        include: { user: { select: { displayName: true } } },
        orderBy: [{ workedDate: "asc" }, { startedAt: "asc" }],
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

  // 実測値の表示（新形式 measured_values は型別フォーマット、旧形式は生値）
  const recordItemLabel = (it: {
    measuredValue: string | null;
    measuredValues: unknown;
    templateItem: InspectionItemRecord;
  }): string | null => {
    const samples = parseStoredSamples(it.measuredValues);
    if (samples.length === 0) return it.measuredValue;
    const spec = itemSpecFromRow(it.templateItem);
    return samples.map((s) => formatSampleValue(spec, s)).join(" / ");
  };

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
      valueLabel: recordItemLabel(it),
      isPass: it.isPass,
    })),
  });

  // 検査工程で出すテンプレート: 関連工程がこの工程 or 未設定（汎用）のもの
  const templates: InspectionTemplateView[] = templateLinks
    .filter(
      (t) =>
        t.inspectionTemplate.relatedProcessStepId == null ||
        t.inspectionTemplate.relatedProcessStepId === step.processStepId,
    )
    .map((t) => ({
      id: t.inspectionTemplate.id,
      code: t.inspectionTemplate.code,
      version: t.inspectionTemplate.version,
      name: localized(t.inspectionTemplate.name as LocalizedText | null),
      relatedProcessStepId: t.inspectionTemplate.relatedProcessStepId,
      items: t.inspectionTemplate.items.map((it) => ({
        name: localized(it.itemName as LocalizedText | null),
        ...itemSpecFromRow(it),
      })),
    }));

  const defectRecords: StepDefectRecordView[] = step.defectRecords.map((d) => ({
    id: d.id,
    defectTypeName: localized(d.defectType.name as LocalizedText | null),
    description: d.description,
    recordedAt: d.recordedAt.toISOString(),
    recordedByName: nameOf(d.recordedBy),
  }));

  // timestamptz → HH:mm（JST）。@db.Date 列は UTC 深夜の Date なので ISO 切り出し。
  const jstTime = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(d)
      : null;
  const mapPlanRow = (r: {
    id: string;
    userId: string;
    user: { displayName: string };
    date: Date;
    start: Date | null;
    end: Date | null;
    quantity: number | null;
    notes: string | null;
  }): StepPlanView => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.displayName,
    date: r.date.toISOString().slice(0, 10),
    startTime: jstTime(r.start),
    endTime: jstTime(r.end),
    quantity: r.quantity,
    notes: r.notes,
  });
  const plans = step.plans.map((p) =>
    mapPlanRow({
      ...p,
      date: p.plannedDate,
      start: p.plannedStartAt,
      end: p.plannedEndAt,
    }),
  );
  const actuals = step.actuals.map((a) =>
    mapPlanRow({
      ...a,
      date: a.workedDate,
      start: a.startedAt,
      end: a.endedAt,
    }),
  );

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
      quantityTracking: step.processStep.quantityTracking,
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
      defectReasons: parseDefectReasons(step.defectReasons),
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
      outsourceCost:
        step.outsourceCost != null ? Number(step.outsourceCost) : null,
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
    plans,
    actuals,
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

/** 検査表テンプレートの選択肢（関連工程の自動選択に使う）。 */
export interface InspectionTemplateOption {
  value: string; // String(内部 id)
  label: string;
  relatedProcessStepId: number | null;
}

/**
 * 検査表テンプレート（有効のみ・code ごとに最新バージョンのみ）— MultiSelect。
 * value = String(内部 id) = そのバージョンの行 id（指示書はバージョン固定）。
 */
export async function fetchInspectionTemplateOptions(): Promise<
  InspectionTemplateOption[]
> {
  const rows = await prisma.inspectionTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  return rows
    .filter((r, i) => i === 0 || rows[i - 1].code !== r.code)
    .map((r) => ({
      value: String(r.id),
      label: `${r.code} v${r.version} ${localized(r.name as LocalizedText | null)}`,
      relatedProcessStepId: r.relatedProcessStepId,
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
  productId: number;
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
    productId: r.productId,
    quantity: r.quantity,
    status: r.status,
  };
}
