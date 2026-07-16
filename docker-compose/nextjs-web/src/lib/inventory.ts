/**
 * inventory.ts — 在庫引当・予約ロジック（§4・§5・§7）。server-only.
 *
 * 増減は必ず applyTransaction 経由（inventory_transactions が唯一の記録、
 * キャッシュ数量を同一 tx で更新）。実在庫は全工程完了時にのみ動く:
 * - onWorkOrderCompleted: 完成品をロット入庫 + 半製品バケットを入庫、
 *   予約 RESERVED → CONFIRMED。
 * - onShippingShipped: DISPATCH は出庫 + 予約 RELEASE。STOCK_STORAGE は
 *   保管工場へ入庫（請求フロー外）。
 * - reserveProductStock: §4 二段照合 → 引当予約（不足分は指示書分割の材料）。
 */

import type { Prisma as PrismaNS } from "../../generated/client/client";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";

type Tx = PrismaNS.TransactionClient;

export interface ApplyTransactionInput {
  inventoryType: "PRODUCT" | "MATERIAL";
  inventoryId: string;
  transactionType: "IN" | "OUT" | "RESERVE" | "RELEASE" | "ADJUST";
  quantity: number; // 正の数（方向は type が決める）
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}

/**
 * 在庫取引の適用: 台帳行 + キャッシュ数量/予約数量の更新を同一 tx で行う。
 * IN/OUT → quantity、RESERVE/RELEASE → reserved_quantity、ADJUST → quantity 直加算。
 */
export async function applyTransaction(
  tx: Tx,
  input: ApplyTransactionInput,
): Promise<void> {
  const actor = await getCurrentActorId();
  await tx.inventoryTransaction.create({
    data: {
      inventoryType: input.inventoryType,
      inventoryId: input.inventoryId,
      transactionType: input.transactionType,
      quantity: input.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      notes: input.notes,
      createdBy: actor,
    },
  });

  const deltaQty =
    input.transactionType === "IN"
      ? input.quantity
      : input.transactionType === "OUT"
        ? -input.quantity
        : input.transactionType === "ADJUST"
          ? input.quantity
          : 0;
  const deltaReserved =
    input.transactionType === "RESERVE"
      ? input.quantity
      : input.transactionType === "RELEASE"
        ? -input.quantity
        : 0;

  // 減算（OUT / RELEASE / 負の ADJUST）は残量ガード付き条件更新 —
  // 同時実行でも負在庫にならない（DB の CHECK 制約より手前で明確に失敗）。
  const data = {
    ...(deltaQty !== 0 ? { quantity: { increment: deltaQty } } : {}),
    ...(deltaReserved !== 0
      ? { reservedQuantity: { increment: deltaReserved } }
      : {}),
  };
  const guard = {
    ...(deltaQty < 0 ? { quantity: { gte: -deltaQty } } : {}),
    ...(deltaReserved < 0 ? { reservedQuantity: { gte: -deltaReserved } } : {}),
  };
  const updated =
    input.inventoryType === "PRODUCT"
      ? await tx.productInventory.updateMany({
          where: { id: input.inventoryId, ...guard },
          data,
        })
      : await tx.materialInventory.updateMany({
          where: { id: input.inventoryId, ...guard },
          data,
        });
  if (updated.count !== 1) {
    throw new Error(
      `在庫が不足しています（${input.transactionType} ${input.quantity}）`,
    );
  }
}

/** 製品在庫行の取得 or 作成（productId×factoryId×lot×半製品フラグ）。 */
async function ensureProductInventory(
  tx: Tx,
  data: {
    productId: number;
    factoryId: number | null;
    lotNumber: number | null;
    isSemiFinished: boolean;
    sourceStepId?: string | null;
  },
): Promise<string> {
  const existing = await tx.productInventory.findFirst({
    where: {
      productId: data.productId,
      factoryId: data.factoryId,
      lotNumber: data.lotNumber,
      isSemiFinished: data.isSemiFinished,
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const row = await tx.productInventory.create({
      data: { ...data },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    // 同時 ensure の一意制約競合（NULLS NOT DISTINCT index）→ 再取得
    if ((e as { code?: string }).code === "P2002") {
      const again = await tx.productInventory.findFirst({
        where: {
          productId: data.productId,
          factoryId: data.factoryId,
          lotNumber: data.lotNumber,
          isSemiFinished: data.isSemiFinished,
        },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw e;
  }
}

/** 素材在庫行の取得 or 作成。 */
export async function ensureMaterialInventory(
  tx: Tx,
  data: { materialId: number; factoryId: number | null; unit: string },
): Promise<string> {
  const existing = await tx.materialInventory.findFirst({
    where: { materialId: data.materialId, factoryId: data.factoryId },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const row = await tx.materialInventory.create({
      data: { ...data },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await tx.materialInventory.findFirst({
        where: { materialId: data.materialId, factoryId: data.factoryId },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw e;
  }
}

/**
 * 全工程完了フック: 最終工程の良品をロット入庫、半製品バケット合計を半製品
 * 入庫、WO の予約を CONFIRMED に。completeStepExecution から呼ぶ。
 */
export async function onWorkOrderCompleted(workOrderId: string): Promise<void> {
  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: {
      salesOrder: true,
      steps: { orderBy: { sortOrder: "asc" } },
      stepLinks: { select: { sourceStepId: true } },
    },
  });
  // 完成数 = 終端工程（出力リンクを持たない COMPLETED 工程）の良品数合計。
  // sortOrder 最大では分岐合流 DAG（合流先が手前に並ぶ場合）で誤るため、
  // グラフの終端で判定する（監査 #15）。
  const sourceIds = new Set(wo.stepLinks.map((l) => l.sourceStepId));
  const terminal = wo.steps.filter(
    (s) => s.status === "COMPLETED" && !sourceIds.has(s.id),
  );
  const finishedQty = terminal.reduce(
    (sum, s) => sum + (s.outputSuccessQuantity ?? 0),
    0,
  );
  // 半製品 = 全工程の半製品バケット合計
  const semiTotal = wo.steps.reduce(
    (sum, s) => sum + (s.outputDefectSemiFinished ?? 0),
    0,
  );
  const factoryId =
    wo.steps.find((s) => s.factoryId != null)?.factoryId ?? null;

  await prisma.$transaction(async (tx) => {
    if (finishedQty > 0) {
      const invId = await ensureProductInventory(tx, {
        productId: wo.salesOrder.productId,
        factoryId,
        lotNumber: wo.workOrderNumber,
        isSemiFinished: false,
      });
      await applyTransaction(tx, {
        inventoryType: "PRODUCT",
        inventoryId: invId,
        transactionType: "IN",
        quantity: finishedQty,
        referenceType: "work_order",
        referenceId: wo.id,
        notes: `指示書 #${wo.workOrderNumber} 完了入庫`,
      });
    }
    if (semiTotal > 0) {
      const semiStep = wo.steps.find(
        (s) => (s.outputDefectSemiFinished ?? 0) > 0,
      );
      const invId = await ensureProductInventory(tx, {
        productId: wo.salesOrder.productId,
        factoryId,
        lotNumber: wo.workOrderNumber,
        isSemiFinished: true,
        sourceStepId: semiStep?.id ?? null,
      });
      await applyTransaction(tx, {
        inventoryType: "PRODUCT",
        inventoryId: invId,
        transactionType: "IN",
        quantity: semiTotal,
        referenceType: "work_order",
        referenceId: wo.id,
        notes: `指示書 #${wo.workOrderNumber} 半製品入庫`,
      });
    }
    // 予約 → 確定（§7: 全工程完了時）。予約は salesOrderId で作られる
    // （workOrderId は付かない）ため両方で照合 — 監査 P1-2 の修正。
    await tx.inventoryReservation.updateMany({
      where: {
        OR: [{ workOrderId: wo.id }, { salesOrderId: wo.salesOrderId }],
        status: "RESERVED",
      },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  });
}

/**
 * 出荷フック: DISPATCH は SO ロット在庫から出庫 + 予約解除。STOCK_STORAGE は
 * 保管入庫（予備製作分）。shipShippingOrder から呼ぶ。
 */
export async function onShippingShipped(key: {
  yearMonth: string;
  seq: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await onShippingShippedTx(tx, key);
  });
}

/**
 * onShippingShipped の tx コア — 出荷アクションの状態遷移と同一
 * トランザクションで呼べる（在庫不足時に SHIPPED だけ立つ非整合を防ぐ）。
 */
export async function onShippingShippedTx(
  tx: Tx,
  key: { yearMonth: string; seq: number },
): Promise<void> {
  const so = await tx.shippingOrder.findUniqueOrThrow({
    where: { yearMonth_seq: key },
    include: { items: true, salesOrder: true },
  });
  const ref = `SHP-${key.yearMonth}-${String(key.seq).padStart(5, "0")}`;
  for (const item of so.items) {
    if (so.type === "DISPATCH") {
      // ロット在庫から出庫。行が無ければ失敗させる（黙ってスキップすると
      // 台帳と実出荷が乖離する — 監査 P0-4）。
      const inv = await tx.productInventory.findFirst({
        where: {
          productId: item.productId,
          lotNumber: item.lotNumber,
          isSemiFinished: false,
        },
        select: { id: true },
      });
      if (!inv) {
        throw new Error(
          `ロット ${item.lotNumber ?? "-"} の在庫台帳がありません（製品 ${item.productId}）。指示書完了または棚卸調整で入庫してから出荷してください`,
        );
      }
      await applyTransaction(tx, {
        inventoryType: "PRODUCT",
        inventoryId: inv.id,
        transactionType: "OUT",
        quantity: item.quantity,
        referenceType: "shipping_order",
        referenceId: ref,
        notes: `出荷 ${ref}`,
      });
    } else {
      // STOCK_STORAGE: 保管工場へ入庫（請求フロー外の予備分）
      const invId = await ensureProductInventory(tx, {
        productId: item.productId,
        factoryId: so.fromFactoryId,
        lotNumber: item.lotNumber,
        isSemiFinished: false,
      });
      await applyTransaction(tx, {
        inventoryType: "PRODUCT",
        inventoryId: invId,
        transactionType: "IN",
        quantity: item.quantity,
        referenceType: "shipping_order",
        referenceId: ref,
        notes: `在庫保管 ${ref}`,
      });
    }
  }
  // 出荷で SO の予約を解除（§4 予約 → 出荷 RELEASE）。
  // 部分出荷では出荷数分だけ按分して解放する（全量解放すると未出荷分の
  // 引当が他受注に奪われる — 監査 P1-2/P1-7）。RELEASE 取引を積んで
  // キャッシュ reserved_quantity も戻す。
  if (so.type === "DISPATCH") {
    let remainingToRelease = so.items.reduce((sum, i) => sum + i.quantity, 0);
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        salesOrderId: so.salesOrderId,
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      orderBy: { reservedAt: "asc" },
    });
    for (const r of reservations) {
      if (remainingToRelease <= 0) break;
      const release = Math.min(Number(r.quantity), remainingToRelease);
      await applyTransaction(tx, {
        inventoryType: r.inventoryType,
        inventoryId: r.inventoryId,
        transactionType: "RELEASE",
        quantity: release,
        referenceType: "shipping_order",
        referenceId: ref,
        notes: `出荷による予約解除 ${ref}`,
      });
      if (release >= Number(r.quantity)) {
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      } else {
        // 部分解放: 残量を予約に残す
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { quantity: { decrement: release } },
        });
      }
      remainingToRelease -= release;
    }
  }
}

/**
 * 受注キャンセル時の予約解放（監査 P1-1）: SO の生きている予約を全量
 * RELEASE し、reserved_quantity キャッシュも戻す。tx 内で呼ぶ。
 */
export async function releaseSalesOrderReservations(
  tx: Tx,
  salesOrderId: string,
  reason: string,
): Promise<number> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { salesOrderId, status: { in: ["RESERVED", "CONFIRMED"] } },
  });
  for (const r of reservations) {
    await applyTransaction(tx, {
      inventoryType: r.inventoryType,
      inventoryId: r.inventoryId,
      transactionType: "RELEASE",
      quantity: Number(r.quantity),
      referenceType: "sales_order",
      referenceId: salesOrderId,
      notes: reason,
    });
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }
  return reservations.length;
}

/** 素材入荷フック: 入荷工場の素材在庫へ入庫。 */
export async function onMaterialReceipt(receiptId: string): Promise<void> {
  const r = await prisma.materialReceipt.findUniqueOrThrow({
    where: { id: receiptId },
  });
  await prisma.$transaction(async (tx) => {
    const invId = await ensureMaterialInventory(tx, {
      materialId: r.materialId,
      factoryId: r.factoryId,
      unit: r.unit,
    });
    await applyTransaction(tx, {
      inventoryType: "MATERIAL",
      inventoryId: invId,
      transactionType: "IN",
      quantity: Number(r.quantity),
      referenceType: "material_receipt",
      referenceId: r.id,
      notes: "素材入荷",
    });
  });
}

export interface StockCheckResult {
  /** 照合①: 在庫レコードの有無。 */
  hasRecord: boolean;
  /** 利用可能数（quantity − reserved の合計、完成品のみ）。 */
  available: number;
  /** 引当できた数量。 */
  reservedNow: number;
  /** 不足数（製造分）。 */
  shortage: number;
}

/**
 * §4 製品在庫照合 + 引当予約。受注数量に対し在庫を確認し、可能な分を
 * RESERVE（他受注との重複割当を防止）。不足分は呼び出し側で MANUFACTURE
 * 指示書を作る（FROM_STOCK/MANUFACTURE の分割は指示書作成 UI 側）。
 */
export async function reserveProductStock(
  salesOrderId: string,
): Promise<StockCheckResult> {
  const so = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: salesOrderId },
  });

  return prisma.$transaction(async (tx) => {
    // 対象行をロック（FOR UPDATE）— 同時照合による二重引当を防ぐ（監査 P1-3）。
    // ロック取得後に読む値が確定値になる。
    await tx.$queryRaw`
      SELECT id FROM app.product_inventory
      WHERE product_id = ${so.productId} AND is_semi_finished = false
      FOR UPDATE`;
    const rows = await tx.productInventory.findMany({
      where: { productId: so.productId, isSemiFinished: false },
      orderBy: { lotNumber: "asc" },
    });
    const hasRecord = rows.length > 0;
    const available = rows.reduce(
      (sum, r) => sum + Math.max(0, r.quantity - r.reservedQuantity),
      0,
    );
    let remaining = so.quantity;
    let reservedNow = 0;

    for (const row of rows) {
      if (remaining <= 0) break;
      const free = row.quantity - row.reservedQuantity;
      if (free <= 0) continue;
      const take = Math.min(free, remaining);
      await applyTransaction(tx, {
        inventoryType: "PRODUCT",
        inventoryId: row.id,
        transactionType: "RESERVE",
        quantity: take,
        referenceType: "sales_order",
        referenceId: salesOrderId,
        notes: "§4 在庫照合による引当予約",
      });
      await tx.inventoryReservation.create({
        data: {
          inventoryType: "PRODUCT",
          inventoryId: row.id,
          salesOrderId,
          quantity: take,
          status: "RESERVED",
          reservedAt: new Date(),
        },
      });
      remaining -= take;
      reservedNow += take;
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "sales_orders",
      recordId: `ORD-${so.yearMonth}-${String(so.seq).padStart(5, "0")}-${String(so.branch).padStart(2, "0")}`,
      after: {
        note: `在庫照合: 引当 ${reservedNow} / 不足 ${remaining}`,
        available,
      },
    });

    return { hasRecord, available, reservedNow, shortage: remaining };
  });
}
