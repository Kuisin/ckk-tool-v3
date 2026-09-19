"use server";

/**
 * Server Actions — 製品マスタ (MS04).
 *
 * 製品コードは PRD-YYYYMM-NNNN の自動採番（lib/numbering.ts →
 * app.numbering_sequences）。spec はキー/値ペアの自由構造 JSON。
 *
 * ## 品目統合 第 3 段 — 本体は app.items
 *
 * 画面・URL・この Server Action の `itemId` は **items.id**（`itemType:
 * "PRODUCT"`）。旧 `products` 行はまだ落としていない参照先なので、同じ内容を
 * `lib/item-legacy-product.ts` の橋で写し続ける（書く順は必ず items → products
 * — 理由はその節のコメント）。**products.id は items.id と一致しない**ので、
 * 引数名は必ず `itemId` にしておくこと（どちらも number で型では止まらない）。
 *
 * 監査（audit_logs）は `tableName: "products"` / `recordId = products.id` の
 * まま。既に積まれた履歴と同じ鍵でないと、履歴タブと SY07 が分断される。
 * 旧マスタを落とす PR が、この鍵の移行を履歴そのものと一緒に決める。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import {
  createLegacyProductForItem,
  legacyProductIdsForItems,
  updateLegacyProductForItem,
} from "@/lib/item-legacy-product";
import { normalizeKeywords } from "@/lib/master-keywords";
import { countMasterReferences } from "@/lib/master-refs";
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

function productInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
    .object({
      nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
      nameTranslations: z.record(z.string(), z.string()).optional(),
      /**
       * 製品が要求する素材の指定 = 材種 + 直径 + 全長。特定 materials 行には
       * 紐付けない（同一材種・直径の複数素材が cut-to-length で充当可能）。
       * materialTypeId は材種の内部 id（文字列 — UI の値）。空/null = 未設定。
       */
      materialTypeId: z.string().nullable(),
      diameterMm: z.number().nullable(),
      lengthMm: z.number().nullable(),
      unit: z.string().min(1, tr("master.productForm.selectUnit")),
      /**
       * 課税区分（tax_categories.id を文字列で。UI の Select 値）。
       * 空 = 税区分マスタの既定に従う。取引先側の課税区分が入っていれば
       * そちらが勝つ（判定は lib/tax-rate.ts resolveLineTax）。
       */
      taxCategoryId: z.string().nullable().default(null),
      /** 検索・AI 突合用のキーワード（match_names）。保存時に整形する。 */
      matchNames: z.array(z.string()).default([]),
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
          message: tr("master.productsActions.diameterRange", {
            min: DIAMETER_MIN,
            max: DIAMETER_MAX,
          }),
        });
      }
      const l = v.lengthMm;
      if (l == null || l < LENGTH_MIN || l > LENGTH_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lengthMm"],
          message: tr("master.productsActions.lengthRange", {
            min: LENGTH_MIN,
            max: LENGTH_MAX,
          }),
        });
      }
    });
}

export type ProductInput = z.infer<ReturnType<typeof productInputSchema>>;

/** `itemId` は items.id（URL の id）。products.id を渡さないこと。 */
function revalidate(itemId?: number) {
  revalidatePath(BASE_PATH);
  if (itemId != null) revalidatePath(`${BASE_PATH}/${itemId}`);
}

function intIdNum(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 材種を外したら直径/全長も無効化して保存する（トリオで揃える）。 */
/** UI の Select 値（文字列 id / null）→ tax_categories.id。空 = 既定に従う。 */
function taxCategoryIdOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
  tr: Awaited<ReturnType<typeof getTranslations>>,
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
    const msg = validateItemValue(it, byKey.get(it.key), tr);
    if (msg) return msg;
  }
  // 追加項目（種別外だが定義済みの項目）も型で検証。
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  for (const [key, value] of byKey) {
    if (key === PRODUCT_TYPE_SPEC_KEY || typeKeys.has(key)) continue;
    const def = defByKey.get(key);
    if (def) {
      const msg = validateItemValue(def, value, tr);
      if (msg) return msg;
    }
  }
  return null;
}

export async function createProduct(
  input: ProductInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = productInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const typeError = await validateProductTypeSpec(v.spec, tr);
  if (typeError) return actionError(typeError);
  try {
    const { yearMonth, seq } = await allocateDocumentKey("PRODUCT");
    const spec = materialSpec(v);
    const code = formatProductNumber(yearMonth, seq) ?? "";
    const name = localizedInput(v.nameJa, undefined, v.nameTranslations);
    const specValue = specJson(v.spec);
    // items → products の順（`lib/item-legacy-product.ts` の書き戻し節）。
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          itemType: "PRODUCT",
          // items.code は DB 側のトリガーが (year_month, seq) から組み立てる
          // 値と同じ形でなければならない（PRD-YYYYMM-NNNN）。
          code: code || null,
          yearMonth,
          seq,
          name,
          requiresMaterialTypeId: spec.materialTypeId,
          requiresDiameterMm: spec.diameterMm,
          requiresLengthMm: spec.lengthMm,
          unit: v.unit,
          taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
          matchNames: normalizeKeywords(v.matchNames),
          spec: specValue ?? undefined,
          isActive: v.isActive,
          notes: v.notes?.trim() || null,
        },
        select: { id: true },
      });
      const legacyId = await createLegacyProductForItem(tx, item.id, {
        yearMonth,
        seq,
        name,
        requiresMaterialTypeId: spec.materialTypeId,
        requiresDiameterMm: spec.diameterMm,
        requiresLengthMm: spec.lengthMm,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        spec: specValue ?? Prisma.DbNull,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      });
      return { id: item.id, legacyId };
    });
    await recordAudit({
      action: "CREATE",
      tableName: "products",
      recordId: String(created.legacyId),
      after: {
        code,
        nameJa: v.nameJa,
        materialTypeId: spec.materialTypeId,
        diameterMm: spec.diameterMm,
        lengthMm: spec.lengthMm,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id, code });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.productsActions.createFailed"), tr),
    );
  }
}

/** `itemId` は items.id（URL の id）— products.id ではない。 */
export async function updateProduct(
  itemId: number,
  input: ProductInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = productInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const typeError = await validateProductTypeSpec(v.spec, tr);
  if (typeError) return actionError(typeError);
  try {
    const prior = await prisma.item.findFirst({
      where: { id: itemId, itemType: "PRODUCT" },
      select: {
        requiresMaterialTypeId: true,
        requiresDiameterMm: true,
        requiresLengthMm: true,
        unit: true,
        taxCategoryId: true,
        matchNames: true,
        isActive: true,
        notes: true,
      },
    });
    if (!prior) return actionError(tr("common.targetProductNotFound"));
    const spec = materialSpec(v);
    const name = localizedInput(v.nameJa, undefined, v.nameTranslations);
    const specValue = specJson(v.spec) ?? Prisma.DbNull;
    // items → products の順（`lib/item-legacy-product.ts` の書き戻し節）。
    const legacyId = await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id: itemId },
        data: {
          name,
          requiresMaterialTypeId: spec.materialTypeId,
          requiresDiameterMm: spec.diameterMm,
          requiresLengthMm: spec.lengthMm,
          unit: v.unit,
          taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
          matchNames: normalizeKeywords(v.matchNames),
          spec: specValue,
          isActive: v.isActive,
          notes: v.notes?.trim() || null,
        },
      });
      return updateLegacyProductForItem(tx, itemId, {
        name,
        requiresMaterialTypeId: spec.materialTypeId,
        requiresDiameterMm: spec.diameterMm,
        requiresLengthMm: spec.lengthMm,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        spec: specValue,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "products",
      recordId: String(legacyId ?? itemId),
      before: {
        materialTypeId: prior.requiresMaterialTypeId,
        diameterMm: prior.requiresDiameterMm
          ? Number(prior.requiresDiameterMm)
          : null,
        lengthMm: prior.requiresLengthMm
          ? Number(prior.requiresLengthMm)
          : null,
        unit: prior.unit,
        taxCategoryId: prior.taxCategoryId,
        matchNames: prior.matchNames,
        isActive: prior.isActive,
        notes: prior.notes,
      },
      after: {
        nameJa: v.nameJa,
        materialTypeId: spec.materialTypeId,
        diameterMm: spec.diameterMm,
        lengthMm: spec.lengthMm,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(itemId);
    return actionOk({ id: itemId });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.productsActions.updateFailed"), tr),
    );
  }
}

/** `itemIds` は items.id（一覧の行 id）— products.id ではない。 */
export async function setProductsActive(
  itemIds: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (itemIds.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    const legacyIds = await legacyProductIdsForItems(itemIds);
    // items → products の順（`lib/item-legacy-product.ts` の書き戻し節）。
    await prisma.$transaction(async (tx) => {
      await tx.item.updateMany({
        where: { id: { in: itemIds }, itemType: "PRODUCT" },
        data: { isActive },
      });
      await tx.product.updateMany({
        where: { itemId: { in: itemIds } },
        data: { isActive },
      });
    });
    for (const itemId of itemIds) {
      await recordAudit({
        action: "UPDATE",
        tableName: "products",
        recordId: String(legacyIds.get(itemId) ?? itemId),
        after: { isActive },
      });
    }
    revalidate();
    for (const itemId of itemIds) revalidatePath(`${BASE_PATH}/${itemId}`);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}

/** `itemIds` は items.id（一覧の行 id）— products.id ではない。 */
export async function deleteProducts(itemIds: number[]): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (itemIds.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    const legacyIds = await legacyProductIdsForItems(itemIds);
    // Guard: 参照があれば消させない。省略可能な関連（注文明細・設計・価格試算・
    // 検査表）は ON DELETE SET NULL なので DB は止めない — lib/master-refs で数える。
    //
    // ★ 数えるのは**旧 products.id の参照**のまま。第 2 段 B/C/D は品目参照を
    //   足すとき旧列も必ず書き続けているので、どちらを数えても同じ集合になる。
    //   `MASTER_REFERENCES` を品目側へ移すのは、旧列を落とす PR の仕事。
    const refs = await countMasterReferences("product", [
      ...legacyIds.values(),
    ]);
    if (refs.total > 0) {
      return actionError(tr("master.productsActions.referencedCannotDelete"));
    }
    await prisma.$transaction(async (tx) => {
      // 顧客品番は (製品, 顧客) の組についての対応表で、片側が消えれば意味を
      // 失う（旧 products 側は CASCADE。lib/master-refs.ts IGNORED_REFERENCES）。
      // items 側の FK は Restrict なので、明示的に先に落とす — 意図は同じで、
      // 「顧客品番を 1 件登録した製品はもう消せない」にしない。
      await tx.customerProductCode.deleteMany({
        where: { itemId: { in: itemIds } },
      });
      await tx.item.deleteMany({
        where: { id: { in: itemIds }, itemType: "PRODUCT" },
      });
      await tx.product.deleteMany({ where: { itemId: { in: itemIds } } });
    });
    for (const itemId of itemIds) {
      await recordAudit({
        action: "DELETE",
        tableName: "products",
        recordId: String(legacyIds.get(itemId) ?? itemId),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.productsActions.deleteFailed"), tr),
    );
  }
}
