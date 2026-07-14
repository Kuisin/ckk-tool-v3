/**
 * data.ts — 指示書 (app.work_orders) の server-side fetch/mapping.
 *
 * URL id = work_order_number（通し連番 int = ロット番号）。表示は生 int（mono）。
 * 承認履歴は history Json（{action,user,at,notes}）を displayName 解決して返す。
 */

import type {
  WorkOrderRow,
  WorkOrderView,
} from "@/components/production/work-orders/model";
import type { HistoryEntry } from "@/lib/approvals";
import { prisma } from "@/lib/db";
import { formatSalesOrderNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

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

/** 承認待ち一覧 (PD03) — PENDING_1ST / PENDING_2ND のみ。 */
export async function fetchPendingApprovals(): Promise<WorkOrderRow[]> {
  const rows = await prisma.workOrder.findMany({
    where: { approvalStatus: { in: ["PENDING_1ST", "PENDING_2ND"] } },
    include: { salesOrder: { include: { product: true } } },
    orderBy: [{ requested1stAt: "asc" }, { workOrderNumber: "asc" }],
  });
  return rows.map(mapRow);
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

// ── ビルダー用 options ───────────────────────────────────────────────────────

export interface Option {
  value: string;
  label: string;
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

// ── 受注書参照（?salesOrder= プリセレクト・ビルダーの選択情報） ────────────────

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
