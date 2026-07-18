"use server";

/**
 * Server Actions — 製品マスタ (MS03).
 *
 * 製品コードは PRD-YYYYMM-NNNN の自動採番（lib/numbering.ts →
 * app.numbering_sequences）。spec はキー/値ペアの自由構造 JSON。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  getProductItemDefs,
  getResolvedProductTypes,
} from "@/lib/product-settings";
import { PRODUCT_TYPE_SPEC_KEY, validateItemValue } from "@/lib/product-types";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/products";

// 直径/全長の許容範囲（素材ビルダー material-code と同じ）。
const DIAMETER_MIN = 0.1;
const DIAMETER_MAX = 99.9;
const LENGTH_MIN = 1;
const LENGTH_MAX = 999;

const productInput = z
  .object({
    nameJa: z.string().min(1, "名称（日本語）を入力してください"),
    nameEn: z.string().optional(),
    /**
     * 製品が要求する素材の指定 = 材種 + 直径 + 全長。特定 materials 行には
     * 紐付けない（同一材種・直径の複数素材が cut-to-length で充当可能）。
     * materialTypeId は材種の内部 id（文字列 — UI の値）。空/null = 未設定。
     */
    materialTypeId: z.string().nullable(),
    diameterMm: z.number().nullable(),
    lengthMm: z.number().nullable(),
    unit: z.string().min(1, "単位を選択してください"),
    isActive: z.boolean(),
    notes: z.string().optional(),
    spec: z.array(z.object({ key: z.string(), value: z.string() })),
  })
  .superRefine((v, ctx) => {
    // 材種を指定したら直径・全長も必須（範囲チェック込み）。
    if (!v.materialTypeId) return;
    const d = v.diameterMm;
    if (d == null || d < DIAMETER_MIN || d > DIAMETER_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diameterMm"],
        message: `直径は ${DIAMETER_MIN}〜${DIAMETER_MAX}mm で入力してください`,
      });
    }
    const l = v.lengthMm;
    if (l == null || l < LENGTH_MIN || l > LENGTH_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lengthMm"],
        message: `全長は ${LENGTH_MIN}〜${LENGTH_MAX}mm で入力してください`,
      });
    }
  });

export type ProductInput = z.infer<typeof productInput>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

function intIdNum(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 材種を外したら直径/全長も無効化して保存する（トリオで揃える）。 */
function materialSpec(v: ProductInput) {
  const materialTypeId = intIdNum(v.materialTypeId);
  return {
    materialTypeId,
    diameterMm: materialTypeId != null ? v.diameterMm : null,
    lengthMm: materialTypeId != null ? v.lengthMm : null,
  };
}

/** Key/value rows → spec JSON object (empty keys dropped, null if none). */
function specJson(rows: { key: string; value: string }[]) {
  const entries = rows
    .map((r) => [r.key.trim(), r.value.trim()] as const)
    .filter(([k]) => k.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * 製品種別（SY04）で予め決めた項目の値を型で検証する（サーバー側の最終ガード）。
 * spec の予約キー `_product_type` から種別を特定し、各項目を検証。問題があれば
 * エラーメッセージ、無ければ null。
 */
async function validateProductTypeSpec(
  rows: { key: string; value: string }[],
): Promise<string | null> {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const typeId = rows.find((r) => r.key === PRODUCT_TYPE_SPEC_KEY)?.value;
  const [resolvedTypes, defs] = await Promise.all([
    getResolvedProductTypes(),
    getProductItemDefs(),
  ]);
  const type = typeId ? resolvedTypes.find((t) => t.id === typeId) : undefined;
  const typeKeys = new Set(type?.items.map((i) => i.key) ?? []);
  // 種別項目を検証。
  for (const it of type?.items ?? []) {
    const msg = validateItemValue(it, byKey.get(it.key));
    if (msg) return msg;
  }
  // 追加項目（種別外だが定義済みの項目）も型で検証。
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  for (const [key, value] of byKey) {
    if (key === PRODUCT_TYPE_SPEC_KEY || typeKeys.has(key)) continue;
    const def = defByKey.get(key);
    if (def) {
      const msg = validateItemValue(def, value);
      if (msg) return msg;
    }
  }
  return null;
}

export async function createProduct(
  input: ProductInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const typeError = await validateProductTypeSpec(v.spec);
  if (typeError) return actionError(typeError);
  try {
    const { yearMonth, seq } = await allocateDocumentKey("PRODUCT");
    const spec = materialSpec(v);
    const created = await prisma.product.create({
      data: {
        yearMonth,
        seq,
        name: localizedInput(v.nameJa, v.nameEn),
        materialTypeId: spec.materialTypeId,
        diameterMm: spec.diameterMm,
        lengthMm: spec.lengthMm,
        unit: v.unit,
        spec: specJson(v.spec) ?? undefined,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    const code = formatProductNumber(yearMonth, seq) ?? "";
    await recordAudit({
      action: "CREATE",
      tableName: "products",
      recordId: String(created.id),
      after: {
        code,
        nameJa: v.nameJa,
        materialTypeId: spec.materialTypeId,
        diameterMm: spec.diameterMm,
        lengthMm: spec.lengthMm,
        unit: v.unit,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id, code });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "製品の作成に失敗しました"));
  }
}

export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const typeError = await validateProductTypeSpec(v.spec);
  if (typeError) return actionError(typeError);
  try {
    const prior = await prisma.product.findUnique({
      where: { id },
      select: {
        materialTypeId: true,
        diameterMm: true,
        lengthMm: true,
        unit: true,
        isActive: true,
        notes: true,
      },
    });
    const spec = materialSpec(v);
    await prisma.product.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
        materialTypeId: spec.materialTypeId,
        diameterMm: spec.diameterMm,
        lengthMm: spec.lengthMm,
        unit: v.unit,
        spec: specJson(v.spec) ?? Prisma.DbNull,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "products",
      recordId: String(id),
      before: prior
        ? {
            materialTypeId: prior.materialTypeId,
            diameterMm: prior.diameterMm ? Number(prior.diameterMm) : null,
            lengthMm: prior.lengthMm ? Number(prior.lengthMm) : null,
            unit: prior.unit,
            isActive: prior.isActive,
            notes: prior.notes,
          }
        : undefined,
      after: {
        nameJa: v.nameJa,
        materialTypeId: spec.materialTypeId,
        diameterMm: spec.diameterMm,
        lengthMm: spec.lengthMm,
        unit: v.unit,
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
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "products",
        recordId: String(id),
        after: { isActive },
      });
    }
    revalidate();
    for (const id of ids) revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deleteProducts(ids: number[]): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: refuse when sales documents still reference one of the products.
    const where = { productId: { in: ids } };
    const [priceListEntries, quoteItems] = await Promise.all([
      prisma.priceListEntry.count({ where }),
      prisma.quoteItem.count({ where }),
    ]);
    if (priceListEntries + quoteItems > 0) {
      return actionError(
        "この製品を参照するデータ（価格表・見積書）が存在するため削除できません。無効化を検討してください。",
      );
    }
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "products",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "製品の削除に失敗しました"));
  }
}
