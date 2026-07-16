"use server";

/**
 * Server Actions — 価格表 (sales.price_list_entries + tiers + discounts).
 *
 * Entries are keyed (year_month, seq) — 価格表番号 PRC-YYYYMM-NNNNN はキーから
 * 導出され URL id にも使う。自然キー（顧客, 製品, 注文種別）は UNIQUE として
 * 保持し、識別（重複防止）にのみ使う。tiers/discounts は (entry_year_month,
 * entry_seq) でぶら下がる。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatPriceListNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/sales/price-lists";

const orderTypeSchema = z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]);

// 自然キー（新規作成・コピー先の識別に使用）
const identitySchema = z.object({
  customerBpId: z.string().min(1),
  // UI からは文字列（Select 値）で届く — DB は内部 id（int）
  productId: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1)),
  orderType: orderTypeSchema,
});

const tierSchema = z.object({
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().nullable(),
  multiplier: z.number().min(0.01),
  priceOverride: z.number().min(0).nullable(),
});

const periodSchema = z.object({
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
});

/** クライアントから受け取る自然キー（productId は文字列でも可）。 */
export type EntryIdentityPayload = z.input<typeof identitySchema>;

function keyOf(entryNumber: string): DocKey | null {
  return parseDocKey(entryNumber, "PRC");
}

function whereKey(key: DocKey) {
  return { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } };
}

function tierWhere(key: DocKey) {
  return { entryYearMonth: key.yearMonth, entrySeq: key.seq };
}

function revalidate(entryNumber?: string) {
  revalidatePath(BASE_PATH);
  if (entryNumber) {
    revalidatePath(`${BASE_PATH}/${entryNumber}`);
    revalidatePath(`${BASE_PATH}/${entryNumber}/edit`);
  }
}

function parseNumbers(entryNumbers: string[]): DocKey[] | null {
  const keys: DocKey[] = [];
  for (const n of entryNumbers) {
    const key = keyOf(n);
    if (!key) return null;
    keys.push(key);
  }
  return keys;
}

// ── entry update (基準単価 / 期間 / 状態 / tiers) ────────────────────────────

const updateInput = z.object({
  entryNumber: z.string().min(1),
  baseUnitPrice: z.number().min(0),
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
  tiers: z.array(tierSchema).min(1, "段階を1件以上追加してください"),
});

export type PriceEntryUpdateInput = z.input<typeof updateInput>;

export async function updatePriceEntry(
  payload: PriceEntryUpdateInput,
): Promise<ActionResult<{ entryId: string }>> {
  const parsed = updateInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const key = keyOf(v.entryNumber);
  if (!key) return actionError("価格表番号が不正です");
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.priceListEntry.findUnique({
      where: whereKey(key),
      select: {
        baseUnitPrice: true,
        validFrom: true,
        validUntil: true,
        isActive: true,
      },
    });
    await prisma.$transaction([
      // Replace the tier set (quote_items keep history via ON DELETE SET NULL).
      prisma.priceListTier.deleteMany({ where: tierWhere(key) }),
      prisma.priceListEntry.update({
        where: whereKey(key),
        data: {
          baseUnitPrice: v.baseUnitPrice,
          validFrom: new Date(v.validFrom),
          validUntil: v.validUntil ? new Date(v.validUntil) : null,
          isActive: v.isActive,
          tiers: {
            create: v.tiers.map((t, i) => ({
              minQuantity: t.minQuantity,
              maxQuantity: t.maxQuantity,
              multiplier: t.multiplier,
              priceOverride: t.priceOverride,
              sortOrder: i,
            })),
          },
        },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: v.entryNumber,
      before: prior
        ? {
            baseUnitPrice: Number(prior.baseUnitPrice),
            validFrom: prior.validFrom.toISOString().slice(0, 10),
            validUntil: prior.validUntil
              ? prior.validUntil.toISOString().slice(0, 10)
              : null,
            isActive: prior.isActive,
          }
        : undefined,
      after: {
        baseUnitPrice: v.baseUnitPrice,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        isActive: v.isActive,
      },
    });
    revalidate(v.entryNumber);
    return actionOk({ entryId: v.entryNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "価格表の更新に失敗しました"));
  }
}

// ── 種別追加 / 別の顧客・製品へコピー（新規エントリ作成） ────────────────────

const createInput = z.object({
  identity: identitySchema,
  baseUnitPrice: z.number().min(0),
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
  tiers: z.array(tierSchema).min(1, "段階を1件以上追加してください"),
  /** コピー元の試算リンクは引き継がない（手動エントリとして作成）。 */
});

export type PriceEntryCreateInput = z.input<typeof createInput>;

export async function createPriceEntry(
  payload: PriceEntryCreateInput,
): Promise<ActionResult<{ entryId: string }>> {
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const authz = await checkPermission("price_list", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const key = await allocateDocumentKey("PRICE_LIST");
    await prisma.priceListEntry.create({
      data: {
        yearMonth: key.yearMonth,
        seq: key.seq,
        ...v.identity,
        baseUnitPrice: v.baseUnitPrice,
        validFrom: new Date(v.validFrom),
        validUntil: v.validUntil ? new Date(v.validUntil) : null,
        isActive: v.isActive,
        tiers: {
          create: v.tiers.map((t, i) => ({
            minQuantity: t.minQuantity,
            maxQuantity: t.maxQuantity,
            multiplier: t.multiplier,
            priceOverride: t.priceOverride,
            sortOrder: i,
          })),
        },
      },
    });
    const entryId = formatPriceListNumber(key);
    await recordAudit({
      action: "CREATE",
      tableName: "price_list_entries",
      recordId: entryId,
      after: {
        customerBpId: v.identity.customerBpId,
        productId: v.identity.productId,
        orderType: v.identity.orderType,
        baseUnitPrice: v.baseUnitPrice,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        isActive: v.isActive,
        tierCount: v.tiers.length,
      },
    });
    revalidate(entryId);
    return actionOk({ entryId });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    if (code === "P2002") {
      return actionError(
        "同一の顧客・製品・注文種別の価格表が既に存在します。既存の価格表を編集してください。",
      );
    }
    return actionError(prismaErrorMessage(e, "価格表の作成に失敗しました"));
  }
}

/** 別の顧客・製品へコピー — source の基準単価・tiers を新エントリへ複製。 */
export async function copyPriceEntry(payload: {
  sourceEntryNumber: string;
  targetIdentity: EntryIdentityPayload;
  validFrom: string;
  validUntil: string | null;
}): Promise<ActionResult<{ entryId: string }>> {
  const authz = await checkPermission("price_list", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const sourceKey = keyOf(payload.sourceEntryNumber);
  if (!sourceKey) return actionError("コピー元の価格表番号が不正です");
  const source = await prisma.priceListEntry.findUnique({
    where: whereKey(sourceKey),
    include: { tiers: true },
  });
  if (!source) return actionError("コピー元の価格表が見つかりません");
  return createPriceEntry({
    identity: payload.targetIdentity,
    baseUnitPrice: Number(source.baseUnitPrice),
    validFrom: payload.validFrom,
    validUntil: payload.validUntil,
    isActive: true,
    tiers: source.tiers
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({
        minQuantity: t.minQuantity,
        maxQuantity: t.maxQuantity,
        multiplier: Number(t.multiplier),
        priceOverride: t.priceOverride != null ? Number(t.priceOverride) : null,
      })),
  });
}

/** 有効期間の変更（自然キーは不変 — 期間を付け替える）。 */
export async function changePriceEntryPeriod(payload: {
  entryNumber: string;
  validFrom: string;
  validUntil: string | null;
}): Promise<ActionResult> {
  const period = periodSchema.safeParse(payload);
  if (!period.success) {
    return actionError(period.error.issues[0]?.message ?? "入力が不正です");
  }
  const key = keyOf(payload.entryNumber);
  if (!key) return actionError("価格表番号が不正です");
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.priceListEntry.update({
      where: whereKey(key),
      data: {
        validFrom: new Date(payload.validFrom),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: payload.entryNumber,
      after: { validFrom: payload.validFrom, validUntil: payload.validUntil },
    });
    revalidate(payload.entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "有効期間の変更に失敗しました"));
  }
}

// ── 状態・削除（一覧の一括操作にも使用） ─────────────────────────────────────

export async function setPriceEntriesActive(
  entryNumbers: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (entryNumbers.length === 0) return actionError("対象が選択されていません");
  const keys = parseNumbers(entryNumbers);
  if (!keys) return actionError("価格表番号が不正です");
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.$transaction(
      keys.map((key) =>
        prisma.priceListEntry.update({
          where: whereKey(key),
          data: { isActive },
        }),
      ),
    );
    revalidate();
    for (const n of entryNumbers) {
      revalidate(n);
      await recordAudit({
        action: "UPDATE",
        tableName: "price_list_entries",
        recordId: n,
        after: { isActive },
      });
    }
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deletePriceEntries(
  entryNumbers: string[],
): Promise<ActionResult> {
  if (entryNumbers.length === 0) return actionError("対象が選択されていません");
  const keys = parseNumbers(entryNumbers);
  if (!keys) return actionError("価格表番号が不正です");
  const authz = await checkPermission("price_list", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.$transaction(
      keys.flatMap((key) => [
        prisma.priceListDiscount.deleteMany({ where: tierWhere(key) }),
        prisma.priceListTier.deleteMany({ where: tierWhere(key) }),
        prisma.priceListEntry.delete({ where: whereKey(key) }),
      ]),
    );
    revalidate();
    for (const n of entryNumbers) {
      await recordAudit({
        action: "DELETE",
        tableName: "price_list_entries",
        recordId: n,
      });
    }
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "価格表の削除に失敗しました"));
  }
}

// ── 値引きルール ─────────────────────────────────────────────────────────────

const discountInput = z.object({
  entryNumber: z.string().min(1),
  id: z.string().nullable(),
  label: z.string().min(1, "名称を入力してください"),
  discountType: z.enum(["RATE", "AMOUNT"]),
  value: z.number().gt(0, "1以上を入力してください"),
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().nullable(),
  validFrom: z.string().min(1, "開始日を選択してください"),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
});

export type DiscountRuleInput = z.input<typeof discountInput>;

export async function saveDiscountRule(
  payload: DiscountRuleInput,
): Promise<ActionResult> {
  const parsed = discountInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const key = keyOf(v.entryNumber);
  if (!key) return actionError("価格表番号が不正です");
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const data = {
    label: v.label,
    discountType: v.discountType,
    value: v.value,
    minQuantity: v.minQuantity,
    maxQuantity: v.maxQuantity,
    validFrom: new Date(v.validFrom),
    validUntil: v.validUntil ? new Date(v.validUntil) : null,
    isActive: v.isActive,
  };
  try {
    if (v.id) {
      await prisma.priceListDiscount.update({ where: { id: v.id }, data });
    } else {
      await prisma.priceListDiscount.create({
        data: { ...tierWhere(key), ...data },
      });
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: v.entryNumber,
      after: {
        discountRule: v.label,
        discountType: v.discountType,
        value: v.value,
        isActive: v.isActive,
      },
    });
    revalidate(v.entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "値引きルールの保存に失敗しました"),
    );
  }
}

export async function deleteDiscountRule(
  entryNumber: string,
  id: string,
): Promise<ActionResult> {
  const key = keyOf(entryNumber);
  if (!key) return actionError("価格表番号が不正です");
  const authz = await checkPermission("price_list", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.priceListDiscount.delete({ where: { id } });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: entryNumber,
      after: { discountRuleDeleted: true },
    });
    revalidate(entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "値引きルールの削除に失敗しました"),
    );
  }
}
