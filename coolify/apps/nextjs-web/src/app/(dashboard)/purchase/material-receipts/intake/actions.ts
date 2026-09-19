"use server";

/**
 * Server Actions — 納品書からの一括入荷登録 (PU03 の取込口)。
 *
 * 納品書は 1 枚に何行も載るが `material_receipts` は **1 行 = 1 素材**。
 * だから 1 回の登録で N 行を作ることになり、**まとめて 1 トランザクション**で
 * 通す — 途中で落ちて「3 行は入荷済み・2 行は無い」状態になると、紙と DB の
 * どちらが正しいのか誰にも分からなくなる。
 *
 * 在庫への計上も同じ tx の中（`onMaterialReceipt`）。既存の 1 件登録
 * （../actions.ts）と同じ道を通す — 入荷はあるのに在庫が動いていない、を
 * 作らないため。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission, targetPlantsInScope } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { movementOpener, onMaterialReceipt } from "@/lib/inventory";
import { decodeInventoryNote } from "@/lib/inventory-note-core";
import { legacyMaterialIdsForItems } from "@/lib/item-legacy-material";
import { allocateDocumentKey } from "@/lib/numbering";
import { learnPurchaseAliases } from "@/lib/purchase-intake";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/purchase/material-receipts";

/** 1 回で登録できる行数の上限（抽出側の明細上限と同じ考え方）。 */
const MAX_LINES = 200;

function intakeInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  const line = z.object({
    /** 選んだ素材の品目 id（items.id）を文字列で受ける。 */
    itemId: z.string().min(1, tr("purchase.materialReceipts.selectAMaterial")),
    plantId: z.string().nullable(),
    quantity: z
      .number()
      .positive(tr("purchase.materialReceipts.mustBeGreaterThanZero")),
    receivedAt: z
      .string()
      .min(1, tr("purchase.materialReceipts.enterAReceivedDate")),
    notes: z.string(),
    /** 学習用 — 書類に印字されていた表記（そのまま）。 */
    materialText: z.string().nullable(),
    materialCode: z.string().nullable(),
    /** 学習用 — 突合が入れていた品目 id（人の訂正だけを覚えるための比較元）。 */
    draftItemId: z.string().nullable().optional(),
  });

  return z.object({
    supplierBpId: z.string().nullable(),
    /** 学習用 — 抽出された仕入先名（印字されたまま）。 */
    extractedSupplierName: z.string().nullable(),
    /** 学習用 — 突合が入れていた仕入先 id。 */
    draftSupplierBpId: z.string().nullable().optional(),
    lines: z
      .array(line)
      .min(1, tr("purchase.intake.selectAtLeastOneLine"))
      .max(MAX_LINES, tr("purchase.intake.tooManyLines")),
  });
}

export type DeliveryIntakeInput = z.infer<ReturnType<typeof intakeInputSchema>>;

/**
 * 納品書 1 枚ぶんの入荷をまとめて登録する。
 * 戻り値の id は**渡した行の順**（画面が原本を各入荷へ添付するために使う）。
 */
export async function createReceiptsFromDelivery(
  payload: DeliveryIntakeInput,
): Promise<ActionResult<{ ids: string[] }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("material_receipt", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = intakeInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  // 入荷先拠点は自分の拠点集合の中（1 件登録と同じ PLANT ∪ OWN 規則）。
  const plantIds = v.lines.map((l) => (l.plantId ? Number(l.plantId) : null));
  if (!targetPlantsInScope(authz.access, authz.userId, plantIds)) {
    return actionError(tr("common.scopeDenied"));
  }

  try {
    // 単位は素材（品目）の単位で固定 — 「本」の台帳へ「kg」を足させない。
    // 行ごとに引かず 1 回でまとめて読む。
    const itemIds = [...new Set(v.lines.map((l) => Number(l.itemId)))];
    if (itemIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return actionError(tr("common.targetRecordNotFound"));
    }
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds }, itemType: "MATERIAL" },
      select: { id: true, unit: true },
    });
    const unitById = new Map(items.map((m) => [m.id, m.unit]));
    if (unitById.size !== itemIds.length) {
      return actionError(tr("common.targetRecordNotFound"));
    }
    // material_id 列はまだ NOT NULL（品目統合 第 2 段 B）なので、対応する
    // materials.id を一括で引いて一緒に埋める（item-legacy-material.ts —
    // 書き込みのためだけの橋）。
    const legacyIds = await legacyMaterialIdsForItems(itemIds);
    if (legacyIds.size !== itemIds.length) {
      return actionError(tr("common.targetRecordNotFound"));
    }

    const actor = await getCurrentActorId();
    // 入出庫伝票の番号は tx の外で採番する（全書類共通の作法）。
    // **納品書 1 枚 = 伝票 1 枚**（明細が N 行）— 取り込んでいる出来事は
    // 「この納品書が届いた」の 1 回で、入荷行が何行に割れるかは都合に過ぎない。
    const movementKey = await allocateDocumentKey("INVENTORY_MOVEMENT");
    // **1 トランザクション**: 全行の作成 + 在庫計上。1 行でも落ちれば全部戻る。
    const created = await prisma.$transaction(async (tx) => {
      const openMovement = movementOpener(tx, {
        key: movementKey,
        cause: "MATERIAL_RECEIPT",
        sourceType: "material_receipts",
      });
      const ids: string[] = [];
      for (const line of v.lines) {
        const itemId = Number(line.itemId);
        const row = await tx.materialReceipt.create({
          data: {
            materialId: legacyIds.get(itemId) ?? 0,
            itemId,
            supplierBpId: v.supplierBpId,
            // 納品書からの取込は発注明細に紐付けない（どの明細の分納かは
            // 紙からは決まらない — 発注入荷は PU02 の「入荷完了」が作る）。
            purchaseOrderItemId: null,
            plantId: line.plantId ? Number(line.plantId) : null,
            quantity: line.quantity,
            unit: unitById.get(itemId) as string,
            receivedAt: new Date(line.receivedAt),
            notes: line.notes.trim() || null,
            createdBy: actor,
          },
          select: { id: true },
        });
        await onMaterialReceipt(row.id, tx, openMovement);
        ids.push(row.id);
      }
      return ids;
    });

    // 監査は入荷 1 件ごとに残す（1 件登録と同じ形 — 後から同じ検索で引ける）。
    for (const [index, id] of created.entries()) {
      const line = v.lines[index];
      await recordAudit({
        action: "CREATE",
        tableName: "material_receipts",
        recordId: id,
        after: {
          itemId: Number(line.itemId),
          supplierBpId: v.supplierBpId,
          plantId: line.plantId ? Number(line.plantId) : null,
          quantity: line.quantity,
          unit: unitById.get(Number(line.itemId)),
          receivedAt: line.receivedAt,
          source: "delivery-note-intake",
        },
      });
    }

    // 「この表記はこの素材・この仕入先のことだ」を貯める（best-effort）。
    await learnPurchaseAliases({
      extractedSupplierName: v.extractedSupplierName,
      supplierBpId: v.supplierBpId,
      draftSupplierBpId: v.draftSupplierBpId,
      lines: v.lines.map((l) => ({
        materialText: l.materialText,
        materialCode: l.materialCode,
        itemId: l.itemId,
        draftItemId: l.draftItemId,
      })),
      actorId: actor,
    });

    revalidatePath(BASE_PATH);
    revalidatePath("/inventory");
    return actionOk({ ids: created });
  } catch (e) {
    // 在庫ガード（lib/inventory）の業務エラーは構造化ノートなので翻訳して返す。
    if (e instanceof Error) {
      const decoded = decodeInventoryNote(e.message);
      if (decoded) {
        return actionError(
          tr(`inventoryNote.${decoded.key}`, decoded.params ?? {}),
        );
      }
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("purchase.materialReceipts.registrationFailed"),
        tr,
      ),
    );
  }
}
