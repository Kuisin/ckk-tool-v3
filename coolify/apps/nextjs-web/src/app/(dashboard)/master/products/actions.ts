"use server";

/**
 * Server Actions — 製品マスタ (MS04).
 *
 * 製品コードは PRD-YYYYMM-NNNN の自動採番（lib/numbering.ts →
 * app.numbering_sequences）。
 *
 * **仕様（材種・直径・全長・製品項目）はここでは扱わない** — 設計図の版
 * (design_versions) が持つ（PD06 で入れて、確定した版の値が製品の仕様になる）。
 * items の requires_* / spec 列は移行のため残っているだけで、アプリは書かない。
 *
 * ## 品目統合 第 3 段 — 本体は app.items（旧 products は落とした）
 *
 * 画面・URL・この Server Action の `itemId` は **items.id**（`itemType:
 * "PRODUCT"`）。旧 `products` 行へ写していた橋は列と一緒に消えた。
 *
 * 監査（audit_logs）の `tableName` は **`"products"` のまま**で、`recordId` が
 * 品目 id になった。table_name は「そのとき何を書いたか」という history の事実
 * なので動かさない（動かすと過去の行と分断される）。ポインタだけは移行
 * 20261102090000 が旧 products.id → items.id へ読み替えてあるので、新旧の行が
 * 同じ鍵で並ぶ。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { normalizeKeywords } from "@/lib/master-keywords";
import { countMasterReferences } from "@/lib/master-refs";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/products";

function productInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    unit: z.string().min(1, tr("master.productForm.selectUnit")),
    /**
     * 課税区分（tax_categories.id を文字列で。UI の Select 値）。
     * 空 = 税区分マスタの既定に従う。取引先側の課税区分が入っていれば
     * そちらが勝つ（判定は lib/tax-rate.ts resolveLineTax）。
     */
    taxCategoryId: z.string().nullable().default(null),
    /** 検索・AI 突合用のキーワード（match_names）。保存時に整形する。 */
    matchNames: z.array(z.string()).default([]),
    /**
     * 他社製品（再研磨専用）。他社が作った工具を再研磨で預かるときの品目。
     * 製造工程リスト・製造分の指示書・本番/テスト/サンプルの明細では使えない。
     */
    isExternalProduct: z.boolean().default(false),
    /** 他社製品のメーカー名（自由記入。BP には紐づけない）。 */
    makerName: z.string().nullable().default(null),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

export type ProductInput = z.infer<ReturnType<typeof productInputSchema>>;

/** `itemId` は items.id（URL の id）。products.id を渡さないこと。 */
function revalidate(itemId?: number) {
  revalidatePath(BASE_PATH);
  if (itemId != null) revalidatePath(`${BASE_PATH}/${itemId}`);
}

/** UI の Select 値（文字列 id / null）→ tax_categories.id。空 = 既定に従う。 */
function taxCategoryIdOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
  try {
    const { yearMonth, seq } = await allocateDocumentKey("PRODUCT");
    const code = formatProductNumber(yearMonth, seq) ?? "";
    const name = localizedInput(v.nameJa, undefined, v.nameTranslations);
    const created = await prisma.item.create({
      data: {
        itemType: "PRODUCT",
        // items.code は DB 側のトリガーが (year_month, seq) から組み立てる
        // 値と同じ形でなければならない（PRD-YYYYMM-NNNN）。
        code: code || null,
        yearMonth,
        seq,
        name,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        isExternalProduct: v.isExternalProduct,
        makerName: v.isExternalProduct ? v.makerName?.trim() || null : null,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "products",
      recordId: String(created.id),
      after: {
        code,
        nameJa: v.nameJa,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        isExternalProduct: v.isExternalProduct,
        makerName: v.isExternalProduct ? v.makerName?.trim() || null : null,
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
  try {
    const prior = await prisma.item.findFirst({
      where: { id: itemId, itemType: "PRODUCT" },
      select: {
        unit: true,
        taxCategoryId: true,
        matchNames: true,
        isExternalProduct: true,
        makerName: true,
        isActive: true,
        notes: true,
        // 他社製品へ切り替えるとき、製造工程リストが残っていてはいけない。
        productprocessrouteitemRefs: {
          where: { kind: "MANUFACTURING" },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!prior) return actionError(tr("common.targetProductNotFound"));
    if (v.isExternalProduct && prior.productprocessrouteitemRefs.length > 0) {
      return actionError(
        tr("master.productRouteActions.externalProductNoRoute"),
      );
    }
    const name = localizedInput(v.nameJa, undefined, v.nameTranslations);
    await prisma.item.update({
      where: { id: itemId },
      data: {
        name,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        isExternalProduct: v.isExternalProduct,
        makerName: v.isExternalProduct ? v.makerName?.trim() || null : null,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "products",
      recordId: String(itemId),
      before: {
        unit: prior.unit,
        taxCategoryId: prior.taxCategoryId,
        matchNames: prior.matchNames,
        isExternalProduct: prior.isExternalProduct,
        makerName: prior.makerName,
        isActive: prior.isActive,
        notes: prior.notes,
      },
      after: {
        nameJa: v.nameJa,
        unit: v.unit,
        taxCategoryId: taxCategoryIdOf(v.taxCategoryId),
        matchNames: normalizeKeywords(v.matchNames),
        isExternalProduct: v.isExternalProduct,
        makerName: v.isExternalProduct ? v.makerName?.trim() || null : null,
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
    await prisma.item.updateMany({
      where: { id: { in: itemIds }, itemType: "PRODUCT" },
      data: { isActive },
    });
    for (const itemId of itemIds) {
      await recordAudit({
        action: "UPDATE",
        tableName: "products",
        recordId: String(itemId),
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
    // Guard: 参照があれば消させない。省略可能な関連（注文明細・設計・価格試算・
    // 検査表）は ON DELETE SET NULL なので DB は止めない — lib/master-refs で数える。
    const refs = await countMasterReferences("product", itemIds);
    if (refs.total > 0) {
      return actionError(tr("master.productsActions.referencedCannotDelete"));
    }
    // 顧客品番は (品目, 顧客) の組についての対応表で、片側が消えれば意味を失う
    // （FK は CASCADE。lib/master-refs.ts IGNORED_REFERENCES にその判断がある）。
    await prisma.item.deleteMany({
      where: { id: { in: itemIds }, itemType: "PRODUCT" },
    });
    for (const itemId of itemIds) {
      await recordAudit({
        action: "DELETE",
        tableName: "products",
        recordId: String(itemId),
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
