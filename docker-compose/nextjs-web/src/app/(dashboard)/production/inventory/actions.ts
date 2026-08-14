"use server";

/**
 * Server Actions — 在庫管理 (PD04) の在庫移動。
 *
 * 在庫移動 = 同一品目の在庫を 工場 × 保管場所 × 棚 の別バケットへ動かす。
 * 記録は inventory_transactions の OUT / IN ペア（referenceType
 * "stock_transfer"、referenceId = 共通 uuid）— 専用テーブルは持たない
 * （取引台帳が唯一の増減記録という既存方針のまま）。
 * 予約分は動かせない（移動可能数 = quantity − reserved_quantity）。
 */

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { applyTransaction } from "@/lib/inventory";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const transferInput = z.object({
  inventoryType: z.enum(["PRODUCT", "MATERIAL"]),
  inventoryId: z.string().uuid(),
  quantity: z.number().positive("数量を入力してください"),
  targetFactoryId: z.number().int().positive("移動先の工場を選択してください"),
  targetStorageLocationId: z.number().int().positive().nullable(),
  targetShelfId: z.number().int().positive().nullable(),
  notes: z.string().optional(),
});

export type StockTransferInput = z.infer<typeof transferInput>;

/** 保管先の表示ラベル（工場 / 保管場所 / 棚）。 */
function targetLabel(
  factory: { name: unknown },
  location: { name: unknown } | null,
  shelf: { code: string } | null,
): string {
  const parts = [localized(factory.name as LocalizedText | null)];
  if (location) parts.push(localized(location.name as LocalizedText | null));
  if (shelf) parts.push(shelf.code);
  return parts.join(" / ");
}

export async function transferStock(
  input: StockTransferInput,
): Promise<ActionResult<{ targetInventoryId: string }>> {
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = transferInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  try {
    // 移動先の整合性: 保管場所は移動先工場のもの、棚はその保管場所のもの
    const [factory, location, shelf] = await Promise.all([
      prisma.factory.findUnique({
        where: { id: v.targetFactoryId },
        select: { name: true, isActive: true },
      }),
      v.targetStorageLocationId
        ? prisma.storageLocation.findUnique({
            where: { id: v.targetStorageLocationId },
            select: { name: true, factoryId: true, isActive: true },
          })
        : null,
      v.targetShelfId
        ? prisma.storageShelf.findUnique({
            where: { id: v.targetShelfId },
            select: { code: true, locationId: true, isActive: true },
          })
        : null,
    ]);
    if (!factory || !factory.isActive) {
      return actionError("移動先の工場が見つかりません");
    }
    if (v.targetStorageLocationId) {
      if (!location || location.factoryId !== v.targetFactoryId) {
        return actionError("移動先の保管場所が移動先工場と一致しません");
      }
    }
    if (v.targetShelfId) {
      if (
        !v.targetStorageLocationId ||
        !shelf ||
        shelf.locationId !== v.targetStorageLocationId
      ) {
        return actionError("移動先の棚が保管場所と一致しません");
      }
    }
    const destLabel = targetLabel(factory, location, shelf);
    const transferId = randomUUID();

    const targetInventoryId = await prisma.$transaction(async (tx) => {
      if (v.inventoryType === "PRODUCT") {
        const src = await tx.productInventory.findUnique({
          where: { id: v.inventoryId },
          include: {
            product: { select: { name: true } },
            factory: { select: { name: true } },
            storageLocation: { select: { name: true } },
            shelf: { select: { code: true } },
          },
        });
        if (!src) throw new Error("移動元の在庫が見つかりません");
        const free = src.quantity - src.reservedQuantity;
        if (v.quantity > free) {
          throw new Error(
            `移動可能数を超えています（利用可能 ${free} — 予約分は移動できません）`,
          );
        }
        const bucket = {
          productId: src.productId,
          factoryId: v.targetFactoryId,
          lotNumber: src.lotNumber,
          isSemiFinished: src.isSemiFinished,
          storageLocationId: v.targetStorageLocationId,
          shelfId: v.targetShelfId,
        };
        let target = await tx.productInventory.findFirst({
          where: bucket,
          select: { id: true },
        });
        if (target?.id === src.id) {
          throw new Error("移動元と移動先が同じ場所です");
        }
        if (!target) {
          target = await tx.productInventory.create({
            data: { ...bucket, sourceStepId: src.sourceStepId },
            select: { id: true },
          });
        }
        const srcLabel = targetLabel(
          src.factory ?? { name: null },
          src.storageLocation,
          src.shelf,
        );
        const note = `在庫移動: ${srcLabel} → ${destLabel}${v.notes?.trim() ? `（${v.notes.trim()}）` : ""}`;
        await applyTransaction(tx, {
          inventoryType: "PRODUCT",
          inventoryId: src.id,
          transactionType: "OUT",
          quantity: v.quantity,
          referenceType: "stock_transfer",
          referenceId: transferId,
          notes: note,
        });
        await applyTransaction(tx, {
          inventoryType: "PRODUCT",
          inventoryId: target.id,
          transactionType: "IN",
          quantity: v.quantity,
          referenceType: "stock_transfer",
          referenceId: transferId,
          notes: note,
        });
        await recordAudit({
          action: "UPDATE",
          tableName: "product_inventory",
          recordId: src.id,
          after: {
            note: `在庫移動 ${v.quantity} → ${destLabel}`,
            product: localized(src.product.name as LocalizedText | null),
            lotNumber: src.lotNumber,
          },
        });
        return target.id;
      }

      const src = await tx.materialInventory.findUnique({
        where: { id: v.inventoryId },
        include: {
          material: { select: { code: true } },
          factory: { select: { name: true } },
          storageLocation: { select: { name: true } },
          shelf: { select: { code: true } },
        },
      });
      if (!src) throw new Error("移動元の在庫が見つかりません");
      const free = Number(src.quantity) - Number(src.reservedQuantity);
      if (v.quantity > free) {
        throw new Error(
          `移動可能数を超えています（利用可能 ${free} — 予約分は移動できません）`,
        );
      }
      const bucket = {
        materialId: src.materialId,
        factoryId: v.targetFactoryId,
        storageLocationId: v.targetStorageLocationId,
        shelfId: v.targetShelfId,
      };
      let target = await tx.materialInventory.findFirst({
        where: bucket,
        select: { id: true },
      });
      if (target?.id === src.id) {
        throw new Error("移動元と移動先が同じ場所です");
      }
      if (!target) {
        target = await tx.materialInventory.create({
          data: { ...bucket, unit: src.unit },
          select: { id: true },
        });
      }
      const srcLabel = targetLabel(
        src.factory ?? { name: null },
        src.storageLocation,
        src.shelf,
      );
      const note = `在庫移動: ${srcLabel} → ${destLabel}${v.notes?.trim() ? `（${v.notes.trim()}）` : ""}`;
      await applyTransaction(tx, {
        inventoryType: "MATERIAL",
        inventoryId: src.id,
        transactionType: "OUT",
        quantity: v.quantity,
        referenceType: "stock_transfer",
        referenceId: transferId,
        notes: note,
      });
      await applyTransaction(tx, {
        inventoryType: "MATERIAL",
        inventoryId: target.id,
        transactionType: "IN",
        quantity: v.quantity,
        referenceType: "stock_transfer",
        referenceId: transferId,
        notes: note,
      });
      await recordAudit({
        action: "UPDATE",
        tableName: "material_inventory",
        recordId: src.id,
        after: {
          note: `在庫移動 ${v.quantity} → ${destLabel}`,
          material: src.material.code,
        },
      });
      return target.id;
    });

    revalidatePath("/production/inventory");
    return actionOk({ targetInventoryId });
  } catch (e) {
    // tx 内の業務バリデーション（移動可能数超過など）はメッセージをそのまま返す
    if (e instanceof Error && !("code" in e) && e.message) {
      return actionError(e.message);
    }
    return actionError(prismaErrorMessage(e, "在庫移動に失敗しました"));
  }
}
