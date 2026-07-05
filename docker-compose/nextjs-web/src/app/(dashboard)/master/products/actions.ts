"use server";

/**
 * Server Actions — 製品マスタ (MS03).
 *
 * 製品コードは PRD-YYYYMM-NNNN の自動採番（lib/numbering.ts →
 * sys.numbering_sequences）。spec はキー/値ペアの自由構造 JSON。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/products";

const productInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  materialId: z.string().nullable(),
  unit: z.string().min(1, "単位を選択してください"),
  isActive: z.boolean(),
  notes: z.string().optional(),
  spec: z.array(z.object({ key: z.string(), value: z.string() })),
});

export type ProductInput = z.infer<typeof productInput>;

function revalidate(id?: string) {
  revalidatePath(BASE_PATH);
  if (id) revalidatePath(`${BASE_PATH}/${id}`);
}

/** Key/value rows → spec JSON object (empty keys dropped, null if none). */
function specJson(rows: { key: string; value: string }[]) {
  const entries = rows
    .map((r) => [r.key.trim(), r.value.trim()] as const)
    .filter(([k]) => k.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export async function createProduct(
  input: ProductInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const id = await nextDocumentNumber("PRODUCT");
    const created = await prisma.product.create({
      data: {
        id,
        name: localizedInput(v.nameJa, v.nameEn),
        materialId: v.materialId,
        unit: v.unit,
        spec: specJson(v.spec) ?? undefined,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "製品の作成に失敗しました"));
  }
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    await prisma.product.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
        materialId: v.materialId,
        unit: v.unit,
        spec: specJson(v.spec) ?? Prisma.DbNull,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "製品の更新に失敗しました"));
  }
}

export async function setProductsActive(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    revalidate();
    for (const id of ids) revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deleteProducts(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: refuse when sales documents still reference one of the products.
    const where = { productId: { in: ids } };
    const [estimates, priceListEntries, quoteItems] = await Promise.all([
      prisma.estimate.count({ where }),
      prisma.priceListEntry.count({ where }),
      prisma.quoteItem.count({ where }),
    ]);
    if (estimates + priceListEntries + quoteItems > 0) {
      return actionError(
        "この製品を参照するデータ（試算・価格表・見積書）が存在するため削除できません。無効化を検討してください。",
      );
    }
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "製品の削除に失敗しました"));
  }
}
