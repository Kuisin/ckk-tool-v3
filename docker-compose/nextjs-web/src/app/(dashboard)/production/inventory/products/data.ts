/**
 * data.ts — 製品在庫 (PD04) のサーバーサイド取得・マッピング。
 *
 * - 一覧: product_inventory（完成品 + 半製品）。
 * - 仕掛品: 進行中（IN_PROGRESS）指示書ごとに WorkflowCtx を組み立てて
 *   computeWipByStep で工程別仕掛数を算出する（在庫レコードは作らない — §7
 *   実在庫は全工程完了時にのみ動く）。
 * - 詳細: 在庫行 + 引当予約 + 取引履歴（Decimal → Number 変換済み）。
 */

import type { InventoryReservationRow } from "@/components/production/inventory/model";
import type {
  ProductInventoryDetailData,
  ProductInventoryRow,
  WipRow,
} from "@/components/production/inventory/products/model";
import { prisma } from "@/lib/db";
import { formatProductNumber, formatSalesOrderNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  computeWipByStep,
  type StepLinkState,
  type StepState,
  type WorkflowCtx,
} from "@/lib/workflow-core";
import { fetchInventoryTransactions } from "../shared";

const productName = (p: { name: unknown }) =>
  localized(p.name as LocalizedText | null);

const factoryName = (f: { name: unknown } | null) =>
  f ? localized(f.name as LocalizedText | null) : null;

/** 製品在庫 一覧（更新日の新しい順）。 */
export async function fetchProductInventories(): Promise<
  ProductInventoryRow[]
> {
  const rows = await prisma.productInventory.findMany({
    include: { product: true, factory: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    productName: productName(r.product),
    productCode: formatProductNumber(r.product.yearMonth, r.product.seq),
    factoryName: factoryName(r.factory),
    lotNumber: r.lotNumber,
    quantity: r.quantity,
    reservedQuantity: r.reservedQuantity,
    available: r.quantity - r.reservedQuantity,
    isSemiFinished: r.isSemiFinished,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * 仕掛品 一覧 — 進行中指示書 × 工程の仕掛数（製品順 → 指示書番号順）。
 * 実行依存・カタログは 1 回だけロードし、指示書ごとに ctx を組み立てる。
 */
export async function fetchWipRows(): Promise<WipRow[]> {
  const [workOrders, execDeps, catalogSteps] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: "IN_PROGRESS" },
      include: {
        steps: true,
        stepLinks: true,
        salesOrder: { include: { product: true } },
      },
      orderBy: { workOrderNumber: "asc" },
    }),
    prisma.processStepExecDependency.findMany(),
    prisma.processStepCatalog.findMany(),
  ]);

  const stepNameOf = new Map(
    catalogSteps.map((s) => [s.id, localized(s.name as LocalizedText | null)]),
  );
  const deps = execDeps.map((d) => ({
    stepId: d.stepId,
    dependsOnStepId: d.dependsOnStepId,
    relation: d.relation,
  }));

  const rows: WipRow[] = [];
  for (const wo of workOrders) {
    const steps: StepState[] = wo.steps.map((s) => ({
      id: s.id,
      processStepId: s.processStepId,
      status: s.status,
      sortOrder: s.sortOrder,
      inputQuantity: s.inputQuantity,
      outputSuccess: s.outputSuccessQuantity,
      defectSemiFinished: s.outputDefectSemiFinished,
      defectScrap: s.outputDefectScrap,
      defectRework: s.outputDefectRework,
      sessionLockedBy: s.sessionLockedBy,
    }));
    const links: StepLinkState[] = wo.stepLinks.map((l) => ({
      sourceStepId: l.sourceStepId,
      targetStepId: l.targetStepId,
      routedQuantity: l.routedQuantity,
    }));
    const ctx: WorkflowCtx = {
      plannedQuantity: wo.plannedQuantity,
      steps,
      links,
      execDeps: deps,
    };
    for (const w of computeWipByStep(ctx)) {
      rows.push({
        stepId: w.stepId,
        productName: productName(wo.salesOrder.product),
        productCode: formatProductNumber(
          wo.salesOrder.product.yearMonth,
          wo.salesOrder.product.seq,
        ),
        workOrderNumber: wo.workOrderNumber,
        stepName: stepNameOf.get(w.processStepId) ?? "—",
        wip: w.wip,
      });
    }
  }
  // 製品ごとにまとめて表示する（同一製品 → 指示書番号順）
  rows.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName, "ja") ||
      a.workOrderNumber - b.workOrderNumber,
  );
  return rows;
}

/** 引当予約（この在庫行に対するもの、予約日の新しい順）。 */
async function fetchReservations(
  inventoryId: string,
): Promise<InventoryReservationRow[]> {
  const rows = await prisma.inventoryReservation.findMany({
    where: { inventoryType: "PRODUCT", inventoryId },
    include: {
      salesOrder: { select: { yearMonth: true, seq: true, branch: true } },
      workOrder: { select: { workOrderNumber: true } },
    },
    orderBy: { reservedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    quantity: Number(r.quantity),
    status: r.status,
    salesOrderNumber: r.salesOrder
      ? formatSalesOrderNumber(r.salesOrder)
      : null,
    workOrderNumber: r.workOrder?.workOrderNumber ?? null,
    reservedAt: r.reservedAt?.toISOString() ?? null,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    releasedAt: r.releasedAt?.toISOString() ?? null,
  }));
}

/** 製品在庫 詳細（id = product_inventory.id uuid）。未存在は null。 */
export async function fetchProductInventoryDetail(
  id: string,
): Promise<ProductInventoryDetailData | null> {
  const r = await prisma.productInventory.findUnique({
    where: { id },
    include: { product: true, factory: true },
  });
  if (!r) return null;

  // 半製品の発生工程（source_step_id → 指示書 #N / 工程名）
  let sourceStepLabel: string | null = null;
  if (r.sourceStepId) {
    const step = await prisma.workOrderStep.findUnique({
      where: { id: r.sourceStepId },
      include: {
        processStep: { select: { name: true } },
        workOrder: { select: { workOrderNumber: true } },
      },
    });
    if (step) {
      sourceStepLabel = `指示書 #${step.workOrder.workOrderNumber} / ${localized(
        step.processStep.name as LocalizedText | null,
      )}`;
    }
  }

  const [reservations, transactions] = await Promise.all([
    fetchReservations(r.id),
    fetchInventoryTransactions("PRODUCT", r.id),
  ]);

  return {
    id: r.id,
    productName: productName(r.product),
    productCode: formatProductNumber(r.product.yearMonth, r.product.seq),
    factoryName: factoryName(r.factory),
    lotNumber: r.lotNumber,
    quantity: r.quantity,
    reservedQuantity: r.reservedQuantity,
    available: r.quantity - r.reservedQuantity,
    isSemiFinished: r.isSemiFinished,
    location: r.location,
    sourceStepLabel,
    notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
    reservations,
    transactions,
  };
}
