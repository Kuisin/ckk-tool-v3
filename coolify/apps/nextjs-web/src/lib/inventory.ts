/**
 * inventory.ts — 在庫引当・予約ロジック（§4・§5・§7）。server-only.
 *
 * 増減は必ず applyTransaction 経由（inventory_transactions が唯一の記録、
 * キャッシュ数量を同一 tx で更新）。実在庫は全工程完了時にのみ動く:
 * - onWorkOrderCompleted: 完成品をロット入庫 + 半製品バケットを入庫、
 *   予約 RESERVED → CONFIRMED。
 * - onDeliveryOrderShipped: DISPATCH は出庫 + 予約 RELEASE。STOCK_STORAGE は
 *   保管拠点へ入庫（請求フロー外）。
 * - reserveProductStock: §4 二段照合 → 引当予約（不足分は指示書分割の材料）。
 */

import type { Prisma as PrismaNS } from "../../generated/client/client";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import { encodeInventoryNote } from "./inventory-note-core";
import {
  computeBranchSemiFinishedQuantity,
  computeFinishedQuantity,
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  toStepState,
} from "./workflow-core";

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
    // 呼び出し側（onDeliveryOrderShippedTx の catch）が message を
    // decodeInventoryNote() で判別して表示用に翻訳する — 生の日本語を
    // messageに残すと string.startsWith() の判定が壊れる。
    throw new Error(
      encodeInventoryNote("insufficientStock", {
        transactionType: input.transactionType,
        quantity: input.quantity,
      }),
    );
  }
}

/**
 * 製品在庫行の取得 or 作成（productId×plantId×lot×半製品フラグ）。
 * 保管場所×棚は「未割当」（null）バケット固定 — システム入庫は必ず未割当へ
 * 入り、場所への配置は在庫移動（PD04 在庫管理）で行う。
 */
async function ensureProductInventory(
  tx: Tx,
  data: {
    productId: number;
    plantId: number | null;
    lotNumber: number | null;
    isSemiFinished: boolean;
    sourceStepId?: string | null;
  },
): Promise<string> {
  const bucket = {
    productId: data.productId,
    plantId: data.plantId,
    lotNumber: data.lotNumber,
    isSemiFinished: data.isSemiFinished,
    storageLocationId: null,
    shelfId: null,
  };
  const existing = await tx.productInventory.findFirst({
    where: bucket,
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
        where: bucket,
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw e;
  }
}

/**
 * 素材在庫行の取得 or 作成（保管場所×棚は未割当バケット固定 — 同上）。
 *
 * 既存バケットの単位と入庫の単位が違うときは**足さずに失敗する** — 「本」の
 * 台帳に「kg」を足すと数量の意味が消える。message は構造化ノート
 * （unitMismatch）で、呼び出し側が自分の言語に翻訳する。
 */
export async function ensureMaterialInventory(
  tx: Tx,
  data: { materialId: number; plantId: number | null; unit: string },
): Promise<string> {
  const bucket = {
    materialId: data.materialId,
    plantId: data.plantId,
    storageLocationId: null,
    shelfId: null,
  };
  const assertUnit = (row: { id: string; unit: string }): string => {
    if (row.unit !== data.unit) {
      throw new Error(
        encodeInventoryNote("unitMismatch", {
          expected: row.unit,
          actual: data.unit,
        }),
      );
    }
    return row.id;
  };
  const existing = await tx.materialInventory.findFirst({
    where: bucket,
    select: { id: true, unit: true },
  });
  if (existing) return assertUnit(existing);
  try {
    const row = await tx.materialInventory.create({
      data: { ...data },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await tx.materialInventory.findFirst({
        where: bucket,
        select: { id: true, unit: true },
      });
      if (again) return assertUnit(again);
    }
    throw e;
  }
}

/**
 * 全工程完了フック: 最終工程の良品をロット入庫、半製品バケット合計を半製品
 * 入庫。completeStepExecution から呼ぶ。
 * - MANUFACTURE: **この WO の**製品予約を CONFIRMED に（割当明細の予約には
 *   触らない — それは姉妹の在庫分指示書が消費する。割当なしは入庫のみ）。
 * - FROM_STOCK（在庫分）: 受注へ引当済みの在庫ロットを消費（RELEASE + OUT）
 *   して自ロットの IN と相殺する（付け替え — 二重計上を防ぐ）。
 *   在庫分は割当 1 件のみ（work-order-alloc-core の不変条件）。
 */
export async function onWorkOrderCompleted(workOrderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await onWorkOrderCompletedTx(tx, workOrderId);
  });
}

/**
 * onWorkOrderCompleted の tx コア — 指示書の COMPLETED 遷移と**同一**
 * トランザクションで呼ぶ（completeStepExecution / kiosk step-execution）。
 * 計上が失敗すれば遷移ごと巻き戻るので、「COMPLETED なのに在庫が無く、
 * 巻き戻しも拒否される」状態を作らない。
 */
export async function onWorkOrderCompletedTx(
  tx: Tx,
  workOrderId: string,
): Promise<void> {
  const wo = await tx.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    // 工程はエンジンが読む列 + 入庫先の解決に使う plantId だけ
    // （STEP_STATE_SELECT — workflow-core 参照）。全列 SELECT は列追加のたび
    // migration 前の DB で P2022 に落ちる。
    include: {
      steps: {
        select: { ...STEP_STATE_SELECT, plantId: true },
        orderBy: { sortOrder: "asc" },
      },
      stepLinks: { select: STEP_LINK_STATE_SELECT },
      orderLineLinks: {
        select: { orderLineId: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  const linkedLineIds = wo.orderLineLinks.map((l) => l.orderLineId);
  // 完成数 = 良品がどこにも流れない COMPLETED 工程の残良品合計。
  // sortOrder 最大では分岐合流 DAG（合流先が手前に並ぶ場合）で誤るため、
  // グラフ集計の純関数（workflow-core computeFinishedQuantity）で判定する
  // （監査 #15。終端工程から分岐した場合の残良品もここで拾う）。
  const engineSteps = wo.steps.map(toStepState);
  const engineLinks = wo.stepLinks;
  const finishedQty = computeFinishedQuantity(engineSteps, engineLinks);
  // 半製品 = 全工程の半製品バケット合計 + 「半製品在庫で終わる分岐」の終端良品。
  // 後者は完成数に入らない（computeFinishedQuantity が除外している）ので、
  // ここで拾わないと行き場を失う。
  const semiTotal =
    wo.steps.reduce((sum, s) => sum + (s.outputDefectSemiFinished ?? 0), 0) +
    computeBranchSemiFinishedQuantity(engineSteps, engineLinks);
  const plantId = wo.steps.find((s) => s.plantId != null)?.plantId ?? null;

  if (finishedQty > 0) {
    const invId = await ensureProductInventory(tx, {
      productId: wo.productId,
      plantId,
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
      notes: encodeInventoryNote("workOrderCompletedFinished", {
        workOrderNumber: wo.workOrderNumber,
      }),
    });
  }
  if (semiTotal > 0) {
    const semiStep =
      wo.steps.find((s) => (s.outputDefectSemiFinished ?? 0) > 0) ??
      wo.steps.find((s) => s.branchStockDisposition === "SEMI_FINISHED");
    const invId = await ensureProductInventory(tx, {
      productId: wo.productId,
      plantId,
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
      notes: encodeInventoryNote("workOrderCompletedSemiFinished", {
        workOrderNumber: wo.workOrderNumber,
      }),
    });
  }
  // 素材予約の消費（監査 P2-1）: この WO の MATERIAL 予約を RELEASE +
  // OUT（実消費）。台帳が実態より少ない場合は OUT をスキップして警告
  // （完了を止めない — 素材台帳は運用中に追いつく）。
  const materialReservations = await tx.inventoryReservation.findMany({
    where: {
      workOrderId: wo.id,
      inventoryType: "MATERIAL",
      status: "RESERVED",
    },
  });
  for (const r of materialReservations) {
    await applyTransaction(tx, {
      inventoryType: "MATERIAL",
      inventoryId: r.inventoryId,
      transactionType: "RELEASE",
      quantity: Number(r.quantity),
      referenceType: "work_order",
      referenceId: wo.id,
      notes: encodeInventoryNote(
        "workOrderCompletedMaterialReservationReleased",
        {
          workOrderNumber: wo.workOrderNumber,
        },
      ),
    });
    // PG は tx 内エラー後の継続が不可のため、残量を事前確認してから OUT。
    // 台帳が実態より少なければ残量分だけ消費（不足分は警告のみ — 完了を
    // 止めない。素材台帳は運用で追いつく）。
    const inv = await tx.materialInventory.findUnique({
      where: { id: r.inventoryId },
      select: { quantity: true },
    });
    const consume = Math.min(Number(inv?.quantity ?? 0), Number(r.quantity));
    if (consume > 0) {
      await applyTransaction(tx, {
        inventoryType: "MATERIAL",
        inventoryId: r.inventoryId,
        transactionType: "OUT",
        quantity: consume,
        referenceType: "work_order",
        referenceId: wo.id,
        notes: encodeInventoryNote("workOrderMaterialConsumed", {
          workOrderNumber: wo.workOrderNumber,
        }),
      });
    }
    if (consume < Number(r.quantity)) {
      console.warn(
        // i18n-ignore — サーバーログのみ（画面には出ない）
        `[inventory] 素材消費を一部スキップ（台帳残不足 ${consume}/${Number(r.quantity)}）: WO #${wo.workOrderNumber}`,
      );
    }
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }

  if (wo.type === "FROM_STOCK" && linkedLineIds.length > 0) {
    // 在庫分（FROM_STOCK）: 受注へ引当済みの在庫ロットから受入数分を消費
    // （RELEASE + OUT）— 上の自ロット IN との付け替えで二重計上を防ぐ。
    // 引当/台帳が不足しても完了は止めない（警告のみ — 素材消費と同方針）。
    // 在庫分は割当 1 件のみなので linkedLineIds[0] がその明細。
    const head = wo.steps.find((s) => s.status !== "CANCELLED");
    let needed = head?.inputQuantity ?? wo.plannedQuantity;
    // 旧バグ（製造分の完了が姉妹の在庫分予約まで CONFIRMED に倒していた）
    // で残った行も消費対象に含める — RESERVED | CONFIRMED の両方を読む。
    const productReservations = await tx.inventoryReservation.findMany({
      where: {
        orderLineId: linkedLineIds[0],
        inventoryType: "PRODUCT",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      orderBy: { reservedAt: "asc" },
    });
    for (const r of productReservations) {
      if (needed <= 0) break;
      const inv = await tx.productInventory.findUnique({
        where: { id: r.inventoryId },
        select: { quantity: true },
      });
      const take = Math.min(needed, Number(r.quantity), inv?.quantity ?? 0);
      if (take > 0) {
        await applyTransaction(tx, {
          inventoryType: "PRODUCT",
          inventoryId: r.inventoryId,
          transactionType: "RELEASE",
          quantity: take,
          referenceType: "work_order",
          referenceId: wo.id,
          notes: encodeInventoryNote("fromStockConsumedReleased", {
            workOrderNumber: wo.workOrderNumber,
          }),
        });
        await applyTransaction(tx, {
          inventoryType: "PRODUCT",
          inventoryId: r.inventoryId,
          transactionType: "OUT",
          quantity: take,
          referenceType: "work_order",
          referenceId: wo.id,
          notes: encodeInventoryNote("fromStockConsumedReassigned", {
            workOrderNumber: wo.workOrderNumber,
          }),
        });
      }
      if (take >= Number(r.quantity)) {
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      } else if (take > 0) {
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { quantity: Number(r.quantity) - take },
        });
      }
      needed -= take;
    }
    if (needed > 0) {
      console.warn(
        // i18n-ignore — サーバーログのみ（画面には出ない）
        `[inventory] 在庫分消費を一部スキップ（引当/台帳不足 残 ${needed}）: WO #${wo.workOrderNumber}`,
      );
    }
  } else {
    // 予約 → 確定（§7: 全工程完了時）。**この指示書の予約だけ**を確定する。
    // 割当明細（orderLineId）で広げてはいけない — 明細の製品在庫予約
    // （reserveProductStock）は姉妹の在庫分（FROM_STOCK）指示書が消費する
    // もので、製造分がそれを CONFIRMED に倒すと在庫分の完了時に RESERVED
    // 行が見つからず、付け替えできずにロットを二重計上していた。
    await tx.inventoryReservation.updateMany({
      where: {
        workOrderId: wo.id,
        inventoryType: "PRODUCT",
        status: "RESERVED",
      },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  }
}

/**
 * 出荷フック: DISPATCH は SO ロット在庫から出庫 + 予約解除。STOCK_STORAGE は
 * 保管入庫（予備製作分）。shipDeliveryOrder から呼ぶ。
 */
export async function onDeliveryOrderShipped(key: {
  yearMonth: string;
  seq: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await onDeliveryOrderShippedTx(tx, key);
  });
}

/**
 * onDeliveryOrderShipped の tx コア — 出荷アクションの状態遷移と同一
 * トランザクションで呼べる（在庫不足時に SHIPPED だけ立つ非整合を防ぐ）。
 */
export async function onDeliveryOrderShippedTx(
  tx: Tx,
  key: { yearMonth: string; seq: number },
): Promise<void> {
  const so = await tx.deliveryOrder.findUniqueOrThrow({
    where: { yearMonth_seq: key },
    include: { items: true },
  });
  const ref = `DOR-${key.yearMonth}-${String(key.seq).padStart(5, "0")}`;
  for (const item of so.items) {
    if (so.type === "DISPATCH") {
      // ロット在庫から出庫。行が無ければ失敗させる（黙ってスキップすると
      // 台帳と実出荷が乖離する — 監査 P0-4）。ロットは保管場所×棚で複数
      // バケットに分かれ得るため、残量のある行から順に消費する。
      const invRows = await tx.productInventory.findMany({
        where: {
          productId: item.productId,
          lotNumber: item.lotNumber,
          isSemiFinished: false,
        },
        select: { id: true, quantity: true },
        orderBy: { quantity: "desc" },
      });
      if (invRows.length === 0) {
        throw new Error(
          encodeInventoryNote("lotInventoryMissing", {
            lotNumber: item.lotNumber ?? "-",
            productId: item.productId,
          }),
        );
      }
      let remaining = item.quantity;
      for (const inv of invRows) {
        if (remaining <= 0) break;
        const take = Math.min(inv.quantity, remaining);
        if (take <= 0) continue;
        await applyTransaction(tx, {
          inventoryType: "PRODUCT",
          inventoryId: inv.id,
          transactionType: "OUT",
          quantity: take,
          referenceType: "delivery_order",
          referenceId: ref,
          notes: encodeInventoryNote("shipped", { ref }),
        });
        remaining -= take;
      }
      if (remaining > 0) {
        throw new Error(
          encodeInventoryNote("outOfStockOnShip", {
            quantity: item.quantity,
            lotNumber: item.lotNumber ?? "-",
          }),
        );
      }
    } else {
      // STOCK_STORAGE: 保管拠点へ入庫（請求フロー外の予備分）
      const invId = await ensureProductInventory(tx, {
        productId: item.productId,
        plantId: so.fromPlantId,
        lotNumber: item.lotNumber,
        isSemiFinished: false,
      });
      await applyTransaction(tx, {
        inventoryType: "PRODUCT",
        inventoryId: invId,
        transactionType: "IN",
        quantity: item.quantity,
        referenceType: "delivery_order",
        referenceId: ref,
        notes: encodeInventoryNote("stockStorage", { ref }),
      });
    }
  }
  // 出荷で注文明細の予約を解除（§4 予約 → 出荷 RELEASE）。
  // 部分出荷では出荷数分だけ按分して解放する（全量解放すると未出荷分の
  // 引当が他受注に奪われる — 監査 P1-2/P1-7）。RELEASE 取引を積んで
  // キャッシュ reserved_quantity も戻す。
  //
  // 1 出荷書は複数の注文明細を束ねられるので、**明細行ごと**に集計して
  // その明細の予約だけを解放する。出荷書単位で合算すると、他の注文明細の
  // 引当まで巻き込んで解放してしまう。
  if (so.type === "DISPATCH") {
    const shippedByLine = new Map<string, number>();
    for (const item of so.items) {
      if (!item.orderLineId) continue;
      shippedByLine.set(
        item.orderLineId,
        (shippedByLine.get(item.orderLineId) ?? 0) + item.quantity,
      );
    }
    for (const [orderLineId, shipped] of shippedByLine) {
      let remainingToRelease = shipped;
      const reservations = await tx.inventoryReservation.findMany({
        where: {
          orderLineId,
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
          referenceType: "delivery_order",
          referenceId: ref,
          notes: encodeInventoryNote("shippedReservationReleased", { ref }),
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
}

/**
 * 受注キャンセル時の予約解放（監査 P1-1）: SO の生きている予約を全量
 * RELEASE し、reserved_quantity キャッシュも戻す。tx 内で呼ぶ。
 */
export async function releaseOrderLineReservations(
  tx: Tx,
  orderLineId: string,
  reason: string,
): Promise<number> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderLineId, status: { in: ["RESERVED", "CONFIRMED"] } },
  });
  for (const r of reservations) {
    await applyTransaction(tx, {
      inventoryType: r.inventoryType,
      inventoryId: r.inventoryId,
      transactionType: "RELEASE",
      quantity: Number(r.quantity),
      referenceType: "order_line",
      referenceId: orderLineId,
      notes: reason,
    });
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }
  return reservations.length;
}

/**
 * 指示書キャンセル時の予約解放: この指示書（work_order_id）が持つ生きている
 * 予約（承認時の素材予約など）を全量 RELEASE し、reserved_quantity キャッシュも
 * 戻す。CONFIRMED は全工程完了時にしか付かず、完了済みはキャンセルできないので
 * RESERVED だけを見る。tx 内で呼ぶ。
 */
export async function releaseWorkOrderReservations(
  tx: Tx,
  workOrderId: string,
  reason: string,
): Promise<number> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { workOrderId, status: "RESERVED" },
  });
  for (const r of reservations) {
    await applyTransaction(tx, {
      inventoryType: r.inventoryType,
      inventoryId: r.inventoryId,
      transactionType: "RELEASE",
      quantity: Number(r.quantity),
      referenceType: "work_order",
      referenceId: workOrderId,
      notes: reason,
    });
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }
  return reservations.length;
}

/**
 * 素材入荷フック: 入荷拠点の素材在庫へ入庫。
 *
 * `tx` を渡すと**その同じトランザクションで**計上する — 入荷行の作成と在庫の
 * 計上が別 tx だと、間で落ちたときに「入荷はあるのに在庫が無い」が残る
 * （onWorkOrderCompletedTx と同じ理由）。省略時は自前の tx を開く（後追いの
 * 再計上用）。
 *
 * 冪等: 同じ入荷（referenceType material_receipt / referenceId = 入荷 id）の
 * IN が既に台帳にあれば何もしない — 再実行やリトライで二重計上しない。
 */
export async function onMaterialReceipt(
  receiptId: string,
  tx?: Tx,
): Promise<void> {
  if (tx) return onMaterialReceiptTx(tx, receiptId);
  await prisma.$transaction(async (t) => {
    await onMaterialReceiptTx(t, receiptId);
  });
}

async function onMaterialReceiptTx(tx: Tx, receiptId: string): Promise<void> {
  const r = await tx.materialReceipt.findUniqueOrThrow({
    where: { id: receiptId },
  });
  const posted = await tx.inventoryTransaction.findFirst({
    where: {
      inventoryType: "MATERIAL",
      transactionType: "IN",
      referenceType: "material_receipt",
      referenceId: r.id,
    },
    select: { id: true },
  });
  if (posted) return;
  const invId = await ensureMaterialInventory(tx, {
    materialId: r.materialId,
    plantId: r.plantId,
    unit: r.unit,
  });
  await applyTransaction(tx, {
    inventoryType: "MATERIAL",
    inventoryId: invId,
    transactionType: "IN",
    quantity: Number(r.quantity),
    referenceType: "material_receipt",
    referenceId: r.id,
    notes: encodeInventoryNote("materialReceived"),
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
  orderLineId: string,
): Promise<StockCheckResult> {
  const so = await prisma.orderLine.findUniqueOrThrow({
    where: { id: orderLineId },
  });
  // 確定前（枝番なし・製品未特定）の明細は引当対象にならない。
  if (so.branch == null || so.productId == null) {
    throw new Error(encodeInventoryNote("onlyConfirmedLinesCanBeStockChecked"));
  }
  const productId = so.productId;

  return prisma.$transaction(async (tx) => {
    // 対象行をロック（FOR UPDATE）— 同時照合による二重引当を防ぐ（監査 P1-3）。
    // ロック取得後に読む値が確定値になる。
    await tx.$queryRaw`
      SELECT id FROM app.product_inventory
      WHERE product_id = ${productId} AND is_semi_finished = false
      FOR UPDATE`;
    const rows = await tx.productInventory.findMany({
      where: { productId, isSemiFinished: false },
      orderBy: { lotNumber: "asc" },
    });
    const hasRecord = rows.length > 0;
    const available = rows.reduce(
      (sum, r) => sum + Math.max(0, r.quantity - r.reservedQuantity),
      0,
    );
    // 冪等: 同じ明細に生きている予約（RESERVED | CONFIRMED）があれば、その分は
    // もう引当済みなので差し引く — 二重呼び出し（再照合・二重送信）で
    // 受注数量を超えて予約しない。
    const existing = await tx.inventoryReservation.aggregate({
      where: {
        orderLineId,
        inventoryType: "PRODUCT",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      _sum: { quantity: true },
    });
    const alreadyReserved = Number(existing._sum.quantity ?? 0);
    let remaining = Math.max(0, so.quantity - alreadyReserved);
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
        referenceType: "order_line",
        referenceId: orderLineId,
        notes: encodeInventoryNote("reservedByStockCheck"),
      });
      await tx.inventoryReservation.create({
        data: {
          inventoryType: "PRODUCT",
          inventoryId: row.id,
          orderLineId,
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
      tableName: "order_lines",
      recordId: `ORD-${so.acceptanceYearMonth}-${String(so.acceptanceSeq).padStart(5, "0")}-${String(so.branch).padStart(2, "0")}`,
      after: {
        note: encodeInventoryNote("stockCheckReservedAndShortage", {
          reservedNow,
          shortage: remaining,
        }),
        available,
      },
    });

    return { hasRecord, available, reservedNow, shortage: remaining };
  });
}
