"use server";

/**
 * Server Actions — 素材入荷 (app.material_receipts, PU03)。
 *
 * PU03 の新規登録は「直接調達の入荷」（発注明細に紐付かない入荷）。
 * 作成後は必ず lib/inventory の onMaterialReceipt を呼び、入荷先拠点の
 * 素材在庫へ入庫する（inventory_transactions + キャッシュ数量）。
 * 発注入荷は素材発注書 (PU02) の入荷完了アクションが自動作成する。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { onMaterialReceipt } from "@/lib/inventory";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/purchase/material-receipts";

function receiptInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    materialId: z
      .string()
      .min(1, tr("purchase.materialReceipts.selectAMaterial")),
    supplierBpId: z.string().nullable(),
    plantId: z.string().nullable(),
    quantity: z
      .number()
      .positive(tr("purchase.materialReceipts.mustBeGreaterThanZero")),
    unit: z.string().min(1, tr("purchase.materialReceipts.enterAUnit")),
    receivedAt: z
      .string()
      .min(1, tr("purchase.materialReceipts.enterAReceivedDate")),
    notes: z.string(),
  });
}

export type MaterialReceiptInput = z.infer<
  ReturnType<typeof receiptInputSchema>
>;

/** 直接調達の入荷登録 — 作成 + 在庫入庫 + 監査。 */
export async function createMaterialReceipt(
  payload: MaterialReceiptInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("material_receipt", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = receiptInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const actor = await getCurrentActorId();
    const receipt = await prisma.materialReceipt.create({
      data: {
        materialId: Number(v.materialId),
        supplierBpId: v.supplierBpId,
        // 直接調達 — 発注明細には紐付けない。
        purchaseOrderItemId: null,
        plantId: v.plantId ? Number(v.plantId) : null,
        quantity: v.quantity,
        unit: v.unit,
        receivedAt: new Date(v.receivedAt),
        notes: v.notes.trim() || null,
        createdBy: actor,
      },
      select: { id: true },
    });

    // 素材在庫への入庫（在庫台帳 + キャッシュ数量）。
    await onMaterialReceipt(receipt.id);

    await recordAudit({
      action: "CREATE",
      tableName: "material_receipts",
      recordId: receipt.id,
      after: {
        materialId: Number(v.materialId),
        supplierBpId: v.supplierBpId,
        plantId: v.plantId ? Number(v.plantId) : null,
        quantity: v.quantity,
        unit: v.unit,
        receivedAt: v.receivedAt,
        source: "direct",
      },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${receipt.id}`);
    // 在庫台帳（数量）が動くため在庫ページも再検証する。
    revalidatePath("/production/inventory");
    return actionOk({ id: receipt.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("purchase.materialReceipts.registrationFailed"),
        tr,
      ),
    );
  }
}
