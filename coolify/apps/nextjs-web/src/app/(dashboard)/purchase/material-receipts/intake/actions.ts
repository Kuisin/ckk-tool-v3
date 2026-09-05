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
import { onMaterialReceipt } from "@/lib/inventory";
import { decodeInventoryNote } from "@/lib/inventory-note-core";
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
    materialId: z
      .string()
      .min(1, tr("purchase.materialReceipts.selectAMaterial")),
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
  });

  return z.object({
    supplierBpId: z.string().nullable(),
    /** 学習用 — 抽出された仕入先名（印字されたまま）。 */
    extractedSupplierName: z.string().nullable(),
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
    // 単位は素材マスタの単位で固定 — 「本」の台帳へ「kg」を足させない。
    // 行ごとに引かず 1 回でまとめて読む。
    const materialIds = [...new Set(v.lines.map((l) => Number(l.materialId)))];
    if (materialIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return actionError(tr("common.targetRecordNotFound"));
    }
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, unit: true },
    });
    const unitById = new Map(materials.map((m) => [m.id, m.unit]));
    if (unitById.size !== materialIds.length) {
      return actionError(tr("common.targetRecordNotFound"));
    }

    const actor = await getCurrentActorId();
    // **1 トランザクション**: 全行の作成 + 在庫計上。1 行でも落ちれば全部戻る。
    const created = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const line of v.lines) {
        const materialId = Number(line.materialId);
        const row = await tx.materialReceipt.create({
          data: {
            materialId,
            supplierBpId: v.supplierBpId,
            // 納品書からの取込は発注明細に紐付けない（どの明細の分納かは
            // 紙からは決まらない — 発注入荷は PU02 の「入荷完了」が作る）。
            purchaseOrderItemId: null,
            plantId: line.plantId ? Number(line.plantId) : null,
            quantity: line.quantity,
            unit: unitById.get(materialId) as string,
            receivedAt: new Date(line.receivedAt),
            notes: line.notes.trim() || null,
            createdBy: actor,
          },
          select: { id: true },
        });
        await onMaterialReceipt(row.id, tx);
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
          materialId: Number(line.materialId),
          supplierBpId: v.supplierBpId,
          plantId: line.plantId ? Number(line.plantId) : null,
          quantity: line.quantity,
          unit: unitById.get(Number(line.materialId)),
          receivedAt: line.receivedAt,
          source: "delivery-note-intake",
        },
      });
    }

    // 「この表記はこの素材・この仕入先のことだ」を貯める（best-effort）。
    await learnPurchaseAliases({
      extractedSupplierName: v.extractedSupplierName,
      supplierBpId: v.supplierBpId,
      lines: v.lines.map((l) => ({
        materialText: l.materialText,
        materialCode: l.materialCode,
        materialId: l.materialId,
      })),
      actorId: actor,
    });

    revalidatePath(BASE_PATH);
    revalidatePath("/production/inventory");
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
