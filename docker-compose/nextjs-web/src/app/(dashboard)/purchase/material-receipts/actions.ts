"use server";

/**
 * Server Actions — 素材入荷 (app.material_receipts, PU01)。
 *
 * PU01 の新規登録は「直接調達の入荷」（発注明細に紐付かない入荷）。
 * 作成後は必ず lib/inventory の onMaterialReceipt を呼び、入荷先工場の
 * 素材在庫へ入庫する（inventory_transactions + キャッシュ数量）。
 * 発注入荷は素材発注書 (PU03) の入荷完了アクションが自動作成する。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { onMaterialReceipt } from "@/lib/inventory";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/purchase/material-receipts";

const receiptInput = z.object({
  materialId: z.string().min(1, "素材を選択してください"),
  supplierBpId: z.string().nullable(),
  factoryId: z.string().nullable(),
  quantity: z.number().positive("数量は0より大きい値"),
  unit: z.string().min(1, "単位を入力してください"),
  receivedAt: z.string().min(1, "入荷日を入力してください"),
  notes: z.string(),
});

export type MaterialReceiptInput = z.infer<typeof receiptInput>;

/** 直接調達の入荷登録 — 作成 + 在庫入庫 + 監査。 */
export async function createMaterialReceipt(
  payload: MaterialReceiptInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = receiptInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
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
        factoryId: v.factoryId ? Number(v.factoryId) : null,
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
        factoryId: v.factoryId ? Number(v.factoryId) : null,
        quantity: v.quantity,
        unit: v.unit,
        receivedAt: v.receivedAt,
        source: "direct",
      },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${receipt.id}`);
    // 在庫台帳（数量）が動くため在庫ページも再検証する。
    revalidatePath("/production/inventory/materials");
    return actionOk({ id: receipt.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "素材入荷の登録に失敗しました"));
  }
}
