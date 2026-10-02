"use server";

/**
 * Server Actions — 手動入出庫 (ST06)。
 *
 * **人が在庫を動かす唯一の口。** 移動タイプを選び、from / to を記録して
 * 入出庫伝票を 1 枚起こす。数量そのものを動かすのは他と同じく applyTransaction
 * だけで、ここはその呼び出し側。
 *
 * 判定（どちら側が要るか・どの順で計上するか）は lib/movement-type-core.ts が
 * 唯一の定義で、画面も同じ関数を見る。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission, targetPlantsInScope } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatMovementNumber } from "@/lib/doc-number";
import {
  applyTransaction,
  createMovement,
  ensureItemInventory,
} from "@/lib/inventory";
import { inventoryTypeOf } from "@/lib/inventory-item-type";
import { decodeInventoryNote } from "@/lib/inventory-note-core";
import { inventoryNoteLabel } from "@/lib/inventory-note-labels";
import {
  MANUAL_CAUSE,
  type MovementDraft,
  postingsFor,
  validateMovement,
} from "@/lib/movement-type-core";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/inventory/goods-movement";

const endpointSchema = z.object({
  plantId: z.number().int().positive().nullable(),
  storageLocationId: z.number().int().positive().nullable(),
  shelfId: z.number().int().positive().nullable(),
});

function inputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    movementTypeId: z
      .number()
      .int()
      .positive(tr("inventory.goodsMovement.selectAType")),
    itemId: z
      .number()
      .int()
      .positive(tr("inventory.goodsMovement.selectAnItem")),
    quantity: z
      .number()
      .positive(tr("inventory.goodsMovement.quantityPositive")),
    lotNumber: z.number().int().nullable(),
    from: endpointSchema,
    to: endpointSchema,
    notes: z.string(),
  });
}

export type GoodsMovementInput = z.infer<ReturnType<typeof inputSchema>>;

/**
 * 手動で在庫を動かす。
 *
 * 伝票の番号は他の書類と同じくトランザクションの外で採番し、伝票そのものと
 * 計上は 1 トランザクションで書く（在庫だけ動いて伝票が無い、を作らない）。
 */
export async function postGoodsMovement(
  input: GoodsMovementInput,
): Promise<ActionResult<{ movementNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = inputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  try {
    const type = await prisma.movementType.findUnique({
      where: { id: v.movementTypeId },
      select: {
        id: true,
        code: true,
        direction: true,
        requiresFrom: true,
        requiresTo: true,
        isActive: true,
      },
    });
    if (!type) return actionError(tr("common.targetRecordNotFound"));
    if (!type.isActive) {
      return actionError(tr("inventory.goodsMovement.typeInactive"));
    }

    const draft: MovementDraft = {
      itemId: v.itemId,
      quantity: v.quantity,
      from: v.from,
      to: v.to,
    };
    // 画面と同じ関数で検査する（画面を迂回した呼び出しも同じ規則で弾く）。
    const problems = validateMovement(type, draft);
    if (problems.length > 0) {
      return actionError(
        tr(`inventory.goodsMovement.problem.${problems[0]}` as never),
      );
    }

    // 触る拠点はすべてスコープ内であること（出庫元・入庫先の両方）。
    const plantIds = [v.from.plantId, v.to.plantId].filter(
      (p): p is number => p != null,
    );
    if (!targetPlantsInScope(authz.access, authz.userId, plantIds)) {
      return actionError(tr("common.scopeDenied"));
    }

    const item = await prisma.item.findUnique({
      where: { id: v.itemId },
      select: { itemType: true },
    });
    if (!item) return actionError(tr("common.targetRecordNotFound"));
    // 在庫を持たない品目（再研磨の役務）はここで落ちる。
    const itemType = inventoryTypeOf(item.itemType);

    const postings = postingsFor(type, draft);
    // 伝票の拠点は「どちらか片方に決まるとき」だけ入れる。拠点をまたぐ移動では
    // null（inventory_movements.plant_id の約束）。
    const distinctPlants = [...new Set(plantIds)];
    const movementPlantId =
      distinctPlants.length === 1 ? distinctPlants[0] : null;

    const key = await allocateDocumentKey("INVENTORY_MOVEMENT");
    const note = v.notes.trim() || undefined;

    await prisma.$transaction(async (tx) => {
      const movementId = await createMovement(tx, {
        key,
        cause: MANUAL_CAUSE,
        movementTypeId: type.id,
        plantId: movementPlantId,
        notes: note,
      });

      for (const posting of postings) {
        const inventoryId = await ensureItemInventory(tx, {
          itemId: v.itemId,
          plantId: posting.endpoint.plantId,
          // **選ばれた場所へ入れる。** 落とすと未割当に積まれ、画面は成功と
          // 言うのに在庫は別の場所に出る（from/to を必ず記録する、が要件）。
          storageLocationId: posting.endpoint.storageLocationId,
          shelfId: posting.endpoint.shelfId,
          lotNumber: v.lotNumber,
        });
        await applyTransaction(tx, movementId, {
          // 台帳の区分。在庫は 1 表になったので書き込み先は選ばない。
          inventoryType: itemType,
          inventoryId,
          transactionType: posting.transactionType,
          quantity: v.quantity,
          referenceType: "movement_type",
          referenceId: type.code,
          notes: note,
        });
      }
    });

    const movementNumber = formatMovementNumber(key);
    await recordAudit({
      action: "CREATE",
      tableName: "inventory_movements",
      recordId: movementNumber,
      after: {
        movementType: type.code,
        itemId: v.itemId,
        quantity: v.quantity,
        fromPlantId: v.from.plantId,
        toPlantId: v.to.plantId,
      },
    });

    revalidatePath(BASE_PATH);
    revalidatePath("/inventory");
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/movements");
    return actionOk({ movementNumber });
  } catch (e) {
    // 在庫不足などは encodeInventoryNote 済みの message で飛んでくる。
    // 生のまま出すと構造化ノートがそのまま画面に出るので、必ず解いて訳す。
    if (e instanceof Error) {
      if (decodeInventoryNote(e.message)) {
        return actionError(inventoryNoteLabel(tr, e.message) ?? e.message);
      }
    }
    return actionError(
      prismaErrorMessage(e, tr("inventory.goodsMovement.postFailed"), tr),
    );
  }
}
