/**
 * data.ts — 製品在庫 (PD04) のサーバーサイド取得・マッピング。
 *
 * - 一覧: product_inventory（完成品 + 半製品）。
 * - 仕掛品: 進行中（IN_PROGRESS）指示書ごとに WorkflowCtx を組み立てて
 *   computeWipByStep で工程別仕掛数を算出する（在庫レコードは作らない — §7
 *   実在庫は全工程完了時にのみ動く）。
 * - 詳細: 在庫行 + 引当予約 + 取引履歴（Decimal → Number 変換済み）。
 */

import { plantWhere, rowInScope } from "@ckk/authz-core";
import type { InventoryReservationRow } from "@/components/production/inventory/model";
import type {
  ProductInventoryDetailData,
  ProductInventoryRow,
  WipRow,
} from "@/components/production/inventory/products/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { formatProductNumber, orderLineNumberOf } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  computeWipByStep,
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  type StepLinkState,
  type StepState,
  toStepState,
  type WorkflowCtx,
} from "@/lib/workflow-core";
import { fetchInventoryTransactions } from "../shared";

const productName = (p: { name: unknown }) =>
  localized(p.name as LocalizedText | null);

const plantName = (f: { name: unknown } | null) =>
  f ? localized(f.name as LocalizedText | null) : null;

/** 保管場所 / 棚 の表示ラベル（例: 第一倉庫 / A-1）。未割当は null。 */
export function storageLabelOf(r: {
  storageLocation: { name: unknown } | null;
  shelf: { code: string } | null;
}): string | null {
  if (!r.storageLocation) return null;
  const loc = localized(r.storageLocation.name as LocalizedText | null);
  return r.shelf ? `${loc} / ${r.shelf.code}` : loc;
}

/** 製品在庫 一覧（更新日の新しい順）。 */
export async function fetchProductInventories(): Promise<
  ProductInventoryRow[]
> {
  // スコープ行フィルタ（PLANT = 保管拠点。ALL は {} で従来通り全件）。
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.productInventory.findMany({
    where: plantWhere(
      authz.access,
      "plantId",
    ) as Prisma.ProductInventoryWhereInput,
    include: {
      product: true,
      plant: true,
      storageLocation: true,
      shelf: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    productName: productName(r.product),
    productCode: formatProductNumber(r.product.yearMonth, r.product.seq),
    plantId: r.plantId,
    plantName: plantName(r.plant),
    storageLocationId: r.storageLocationId,
    storageLocationName: r.storageLocation
      ? localized(r.storageLocation.name as LocalizedText | null)
      : null,
    shelfId: r.shelfId,
    shelfCode: r.shelf?.code ?? null,
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
  // 仕掛品はスコープ拠点で工程が走る指示書に限定（ALL は追加条件なし）。
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return [];
  const plantFilter: Prisma.WorkOrderWhereInput =
    authz.access.kind === "ALL"
      ? {}
      : {
          steps: {
            some: { plantId: { in: [...authz.access.plantIds] } },
          },
        };
  const [workOrders, execDeps, catalogSteps] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: "IN_PROGRESS", ...plantFilter },
      include: {
        // エンジンが読む列だけ（STEP_STATE_SELECT — workflow-core 参照）。
        // 全列 SELECT は列追加のたび migration 前の DB で P2022 に落ちる。
        steps: { select: STEP_STATE_SELECT },
        stepLinks: { select: STEP_LINK_STATE_SELECT },
        product: true,
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
    const steps: StepState[] = wo.steps.map(toStepState);
    const links: StepLinkState[] = wo.stepLinks;
    const ctx: WorkflowCtx = {
      plannedQuantity: wo.plannedQuantity,
      steps,
      links,
      execDeps: deps,
    };
    for (const w of computeWipByStep(ctx)) {
      rows.push({
        stepId: w.stepId,
        productName: productName(wo.product),
        productCode: formatProductNumber(wo.product.yearMonth, wo.product.seq),
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
      orderLine: {
        select: {
          acceptanceYearMonth: true,
          acceptanceSeq: true,
          branch: true,
        },
      },
      workOrder: { select: { workOrderNumber: true } },
    },
    orderBy: { reservedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    quantity: Number(r.quantity),
    status: r.status,
    orderLineNumber: r.orderLine ? orderLineNumberOf(r.orderLine) : null,
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
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return null;
  const r = await prisma.productInventory.findUnique({
    where: { id },
    include: {
      product: true,
      plant: true,
      storageLocation: true,
      shelf: true,
    },
  });
  if (!r) return null;
  // スコープ外の行は不可視（null → 呼び出し側の notFound に乗せる）。
  if (!rowInScope(authz.access, { plantIds: [r.plantId] }, authz.userId)) {
    return null;
  }

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
    plantName: plantName(r.plant),
    lotNumber: r.lotNumber,
    quantity: r.quantity,
    reservedQuantity: r.reservedQuantity,
    available: r.quantity - r.reservedQuantity,
    isSemiFinished: r.isSemiFinished,
    storageLabel: storageLabelOf(r),
    location: r.location,
    sourceStepLabel,
    notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
    reservations,
    transactions,
  };
}
