"use server";

/**
 * Server Actions — 税区分マスタ (MS0F)。
 *
 * 単一管理画面（MS0D 作業場所と同型 — list コードのみ）: 税区分カードに率の履歴を
 * テーブル表示し、すべてモーダルで CRUD する。
 *
 * 守っていること:
 *   - 参照されている区分は消せない（FK が RESTRICT。先に画面で止めて理由を出す）
 *   - 既定の区分は消せない・必ず 1 つ（部分 unique index と二重に守る）
 *   - 率が 1 行も無い区分を作らない（率が無いと請求の計算ができない）
 *
 * 率そのものの解決は lib/tax-rate.ts、区間の組み立ては
 * components/master/tax-categories/model.ts（どちらも純ロジック）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  localizedInputOrNull,
  prismaErrorMessage,
} from "@/lib/server-action";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

const BASE_PATH = "/master/tax-categories";

function revalidate() {
  revalidatePath(BASE_PATH);
}

const codePattern = /^[A-Za-z0-9_-]+$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function categoryInputSchema(tr: Tr) {
  return z.object({
    code: z
      .string()
      .min(1, tr("common.codeRequired"))
      .regex(codePattern, tr("master.taxCategories.codePatternHint")),
    nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    shortLabelJa: z.string().optional(),
    shortLabelTranslations: z.record(z.string(), z.string()).optional(),
    isDefault: z.boolean(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

/**
 * 率は画面では **%**（10 = 10%）で扱い、DB には小数（0.1000）で入れる。
 * Decimal(5,4) なので 0〜100% を 4 桁までしか持てない — 画面側でも同じ範囲に閉じる。
 */
function rateInputSchema(tr: Tr) {
  return z.object({
    categoryId: z.number().int().positive(),
    effectiveFrom: z
      .string()
      .regex(isoDatePattern, tr("master.taxCategories.selectEffectiveFrom")),
    ratePercent: z
      .number()
      .min(0, tr("master.taxCategories.rateRange"))
      .max(100, tr("master.taxCategories.rateRange")),
    notes: z.string().optional(),
  });
}

export type TaxCategoryInput = z.infer<ReturnType<typeof categoryInputSchema>>;
export type TaxRateInput = z.infer<ReturnType<typeof rateInputSchema>>;

/** % → DB の小数。Decimal(5,4) に収まるよう 4 桁で切る。 */
function toRateDecimal(ratePercent: number): number {
  return Number((ratePercent / 100).toFixed(4));
}

/**
 * 既定を 1 つに保つ。部分 unique index が最後の砦だが、そこに当てると利用者には
 * ただの DB エラーに見えるので、同じトランザクションで先に他を降ろす。
 */
async function clearOtherDefaults(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  keepId: number | null,
) {
  await tx.taxCategory.updateMany({
    where: {
      isDefault: true,
      ...(keepId == null ? {} : { id: { not: keepId } }),
    },
    data: { isDefault: false },
  });
}

// ── 税区分 ───────────────────────────────────────────────────────────────────

export async function createTaxCategory(
  input: TaxCategoryInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = categoryInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (v.isDefault) await clearOtherDefaults(tx, null);
      return tx.taxCategory.create({
        data: {
          code: v.code.trim(),
          name: localizedInput(v.nameJa, undefined, v.nameTranslations),
          // 空欄は JSON の null（Prisma.DbNull）にする — 率から組み立てる、の意味。
          shortLabel:
            localizedInputOrNull(
              v.shortLabelJa,
              undefined,
              v.shortLabelTranslations,
            ) ?? Prisma.DbNull,
          isDefault: v.isDefault,
          sortOrder: v.sortOrder,
          isActive: v.isActive,
          notes: v.notes?.trim() || null,
        },
        select: { id: true },
      });
    });
    await recordAudit({
      action: "CREATE",
      tableName: "tax_categories",
      recordId: String(created.id),
      after: {
        code: v.code.trim(),
        nameJa: v.nameJa,
        isDefault: v.isDefault,
        isActive: v.isActive,
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

export async function updateTaxCategory(
  id: number,
  input: TaxCategoryInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = categoryInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const prior = await prisma.taxCategory.findUnique({
    where: { id },
    select: { code: true, name: true, isDefault: true, isActive: true },
  });
  if (prior == null) return actionError(tr("common.targetRecordNotFound"));
  try {
    await prisma.$transaction(async (tx) => {
      if (v.isDefault) await clearOtherDefaults(tx, id);
      await tx.taxCategory.update({
        where: { id },
        data: {
          code: v.code.trim(),
          name: localizedInput(v.nameJa, undefined, v.nameTranslations),
          // 空欄は JSON の null（Prisma.DbNull）にする — 率から組み立てる、の意味。
          shortLabel:
            localizedInputOrNull(
              v.shortLabelJa,
              undefined,
              v.shortLabelTranslations,
            ) ?? Prisma.DbNull,
          isDefault: v.isDefault,
          sortOrder: v.sortOrder,
          isActive: v.isActive,
          notes: v.notes?.trim() || null,
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "tax_categories",
      recordId: String(id),
      before: {
        code: prior.code,
        isDefault: prior.isDefault,
        isActive: prior.isActive,
      },
      after: {
        code: v.code.trim(),
        isDefault: v.isDefault,
        isActive: v.isActive,
      },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

export async function deleteTaxCategory(
  id: number,
): Promise<ActionResult<undefined>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);

  const category = await prisma.taxCategory.findUnique({
    where: { id },
    select: {
      isDefault: true,
      code: true,
      _count: {
        select: {
          products: true,
          customerAttrs: true,
          invoiceItems: true,
          quoteItems: true,
          invoiceTaxLines: true,
        },
      },
    },
  });
  if (category == null) return actionError(tr("common.targetRecordNotFound"));

  // 既定を消すと「どの区分にも当たらない」行が生まれる。先に別の区分を既定にしてもらう。
  if (category.isDefault) {
    return actionError(tr("master.taxCategories.cannotDeleteDefault"));
  }

  // FK は RESTRICT なので DB でも止まるが、それだと利用者にはただのエラーに見える。
  // **どこから参照されているか**を数えて文章にする。
  const c = category._count;
  const usage: string[] = [];
  if (c.products > 0) {
    usage.push(
      tr("master.taxCategories.usedByProducts", { count: c.products }),
    );
  }
  if (c.customerAttrs > 0) {
    usage.push(
      tr("master.taxCategories.usedByCustomers", { count: c.customerAttrs }),
    );
  }
  const docs = c.invoiceItems + c.quoteItems + c.invoiceTaxLines;
  if (docs > 0) {
    usage.push(tr("master.taxCategories.usedByDocuments", { count: docs }));
  }
  if (usage.length > 0) {
    return actionError(
      tr("master.taxCategories.cannotDeleteInUse", {
        usage: usage.join(" / "),
      }),
    );
  }

  try {
    // 率は onDelete: Cascade なので一緒に消える。
    await prisma.taxCategory.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "tax_categories",
      recordId: String(id),
      before: { code: category.code },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.deleteFailed"), tr));
  }
}

// ── 税率 ─────────────────────────────────────────────────────────────────────

export async function createTaxRate(
  input: TaxRateInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = rateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const created = await prisma.taxCategoryRate.create({
      data: {
        categoryId: v.categoryId,
        effectiveFrom: new Date(`${v.effectiveFrom}T00:00:00Z`),
        rate: toRateDecimal(v.ratePercent),
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "tax_category_rates",
      recordId: String(created.id),
      after: {
        categoryId: v.categoryId,
        effectiveFrom: v.effectiveFrom,
        ratePercent: v.ratePercent,
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    // (category_id, effective_from) の unique 違反はこの文言のほうが分かる。
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.taxCategories.duplicateEffectiveFrom"),
        tr,
      ),
    );
  }
}

export async function updateTaxRate(
  id: number,
  input: TaxRateInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = rateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const prior = await prisma.taxCategoryRate.findUnique({
    where: { id },
    select: { effectiveFrom: true, rate: true },
  });
  if (prior == null) return actionError(tr("common.targetRecordNotFound"));
  try {
    await prisma.taxCategoryRate.update({
      where: { id },
      data: {
        effectiveFrom: new Date(`${v.effectiveFrom}T00:00:00Z`),
        rate: toRateDecimal(v.ratePercent),
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "tax_category_rates",
      recordId: String(id),
      before: {
        effectiveFrom: prior.effectiveFrom.toISOString().slice(0, 10),
        rate: Number(prior.rate),
      },
      after: { effectiveFrom: v.effectiveFrom, ratePercent: v.ratePercent },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.taxCategories.duplicateEffectiveFrom"),
        tr,
      ),
    );
  }
}

export async function deleteTaxRate(
  id: number,
): Promise<ActionResult<undefined>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  const rate = await prisma.taxCategoryRate.findUnique({
    where: { id },
    select: {
      categoryId: true,
      effectiveFrom: true,
      rate: true,
      category: { select: { _count: { select: { rates: true } } } },
    },
  });
  if (rate == null) return actionError(tr("common.targetRecordNotFound"));

  // 率が 1 行も無い区分を作らない — その区分に当たった明細の税額が計算できなくなる。
  if (rate.category._count.rates <= 1) {
    return actionError(tr("master.taxCategories.cannotDeleteLastRate"));
  }

  try {
    await prisma.taxCategoryRate.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "tax_category_rates",
      recordId: String(id),
      before: {
        categoryId: rate.categoryId,
        effectiveFrom: rate.effectiveFrom.toISOString().slice(0, 10),
        rate: Number(rate.rate),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.deleteFailed"), tr));
  }
}
