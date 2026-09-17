import "server-only";

/**
 * stock-take.ts — 棚卸のサーバー処理（取り込みと確定）。server-only.
 *
 * 判定そのものは `lib/stock-take-core.ts`（純ロジック・試験あり）が持つ。
 * ここは DB の読み書きと、確定時の入出庫伝票の発行だけ。
 */

import type { Prisma as PrismaNS } from "../../generated/client/client";
import { encodeInventoryNote } from "./inventory-note-core";
import { applyTransaction, movementOpener } from "./inventory";
import type { MovementKey } from "./inventory";
import { shouldPost, stockTakeDifference } from "./stock-take-core";

type Tx = PrismaNS.TransactionClient;

/**
 * 棚卸の対象バケットを取り込む。
 *
 * **1 行 = 1 在庫バケット**（拠点 × 保管場所 × 棚 × ロット × 半製品フラグ）。
 * 未割当（storage_location_id = null）のバケットも数える対象に入れる — そこに
 * 積まれている実物はあるので、外すと「数えたのに合わない」が必ず残る。
 *
 * 数量ゼロのバケットも落とさない。「あるはずが無い場所に実物があった」は
 * 棚卸でしか見つからないし、0 → 3 の調整はまさにその記録になる。
 */
export async function snapshotStockTakeLines(
  tx: Tx,
  stockTakeId: string,
  plantId: number,
  storageLocationId: number | null,
): Promise<number> {
  const locationFilter =
    storageLocationId == null ? {} : { storageLocationId };

  const products = await tx.productInventory.findMany({
    where: { plantId, ...locationFilter },
    select: { id: true, quantity: true },
    orderBy: { id: "asc" },
  });
  const materials = await tx.materialInventory.findMany({
    where: { plantId, ...locationFilter },
    select: { id: true, quantity: true },
    orderBy: { id: "asc" },
  });

  const data = [
    ...products.map((r, i) => ({
      stockTakeId,
      inventoryType: "PRODUCT" as const,
      inventoryId: r.id,
      bookQuantity: r.quantity,
      sortOrder: i,
    })),
    ...materials.map((r, i) => ({
      stockTakeId,
      inventoryType: "MATERIAL" as const,
      inventoryId: r.id,
      bookQuantity: r.quantity,
      sortOrder: products.length + i,
    })),
  ];
  if (data.length === 0) return 0;
  await tx.stockTakeLine.createMany({ data });
  return data.length;
}

export interface ConfirmResult {
  /** 実際に計上した行数（差異のあった行）。 */
  posted: number;
  /** 発行した入出庫伝票の id。差異ゼロなら null（伝票を起こさない）。 */
  movementId: string | null;
}

/**
 * 棚卸を確定し、差異ぶんの調整を計上する。**呼び出し側の tx の中で呼ぶこと。**
 *
 * ★ 実数はここで**読み直す**。取り込み時点の book_quantity は使わない —
 *   数え始めてから確定するまでの間に在庫は動く（出荷が通る・入荷が載る）ので、
 *   取り込み時点との差を当てると、その間の正しい動きまで打ち消してしまう。
 *   判定は stock-take-core の stockTakeDifference が唯一の定義。
 *
 * ★ 差異が 1 件も無ければ**伝票を起こさない**（movementOpener の遅延生成）。
 *   数えてぴったりだった、という確定は正常で、空の伝票を残す意味が無い。
 */
export async function confirmStockTakeTx(
  tx: Tx,
  stockTakeId: string,
  movementKey: MovementKey,
  actorId: string | null,
): Promise<ConfirmResult> {
  const take = await tx.stockTake.findUniqueOrThrow({
    where: { id: stockTakeId },
    select: {
      id: true,
      yearMonth: true,
      seq: true,
      plantId: true,
      lines: {
        select: {
          id: true,
          inventoryType: true,
          inventoryId: true,
          bookQuantity: true,
          countedQuantity: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  const number = `STK-${take.yearMonth}-${String(take.seq).padStart(5, "0")}`;

  const openMovement = movementOpener(tx, {
    key: movementKey,
    cause: "ADJUSTMENT",
    sourceType: "stock_takes",
    sourceId: number,
    plantId: take.plantId,
  });

  let posted = 0;
  let movementId: string | null = null;

  for (const line of take.lines) {
    if (line.countedQuantity == null) continue;

    // 実数を読み直す（この tx の中 = 確定と同じ瞬間の値）。
    const live =
      line.inventoryType === "PRODUCT"
        ? (
            await tx.productInventory.findUnique({
              where: { id: line.inventoryId },
              select: { quantity: true },
            })
          )?.quantity
        : Number(
            (
              await tx.materialInventory.findUnique({
                where: { id: line.inventoryId },
                select: { quantity: true },
              })
            )?.quantity ?? Number.NaN,
          );
    // バケットが消えていた（マスタ整理など）行は飛ばす — 存在しない在庫は
    // 数えようがない。落とさずに黙って飛ばすのは、他の行の調整を止めないため。
    if (live == null || Number.isNaN(live)) continue;

    const input = {
      bookQuantity: Number(line.bookQuantity),
      countedQuantity: Number(line.countedQuantity),
      liveQuantity: Number(live),
    };
    if (!shouldPost(input)) continue;

    const diff = stockTakeDifference(input);
    movementId = await openMovement();
    await applyTransaction(tx, movementId, {
      inventoryType: line.inventoryType,
      inventoryId: line.inventoryId,
      // ADJUST は符号付きで直接加算する（IN/OUT と違い向きを type で表さない）。
      transactionType: "ADJUST",
      quantity: diff,
      referenceType: "stock_take",
      referenceId: number,
      notes: encodeInventoryNote("stockTakeAdjusted", {
        counted: input.countedQuantity,
        book: input.liveQuantity,
      }),
    });
    posted += 1;
  }

  await tx.stockTake.update({
    where: { id: stockTakeId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedBy: actorId,
      movementId,
    },
  });

  return { posted, movementId };
}
