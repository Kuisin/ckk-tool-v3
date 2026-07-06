"use server";

/**
 * Server Actions — 価格表 (sales.price_list_entries + tiers + discounts).
 *
 * Entries are keyed by the natural composite (顧客, 製品, 注文種別) — the key
 * is the identity and is never updated; tiers/discounts hang off it. 有効期間
 * の変更は同一エントリの期間更新（複合キーでは同一キーの複製は存在できない）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { parsePriceEntryKey, priceEntryKey } from "@/lib/doc-number";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/sales/price-lists";

const orderTypeSchema = z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]);

const keySchema = z.object({
  customerBpId: z.string().min(1),
  productId: z.string().min(1),
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

type EntryKeyInput = z.infer<typeof keySchema>;

function whereKey(key: EntryKeyInput) {
  return {
    customerBpId_productId_orderType: {
      customerBpId: key.customerBpId,
      productId: key.productId,
      orderType: key.orderType,
    },
  };
}

function revalidate(key?: EntryKeyInput) {
  revalidatePath(BASE_PATH);
  if (key) {
    const id = priceEntryKey(key.customerBpId, key.productId, key.orderType);
    revalidatePath(`${BASE_PATH}/${id}`);
    revalidatePath(`${BASE_PATH}/${id}/edit`);
  }
}

/** Parse a URL entry id back to its key parts (with order-type check). */
export async function resolveEntryKey(
  id: string,
): Promise<EntryKeyInput | null> {
  const parts = parsePriceEntryKey(id);
  if (!parts) return null;
  const parsed = keySchema.safeParse(parts);
  return parsed.success ? parsed.data : null;
}

// ── entry update (基準単価 / 期間 / 状態 / tiers) ────────────────────────────

const updateInput = z.object({
  key: keySchema,
  baseUnitPrice: z.number().min(0),
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
  tiers: z.array(tierSchema).min(1, "段階を1件以上追加してください"),
});

export type PriceEntryUpdateInput = z.infer<typeof updateInput>;

export async function updatePriceEntry(
  payload: PriceEntryUpdateInput,
): Promise<ActionResult<{ entryId: string }>> {
  const parsed = updateInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const entryId = priceEntryKey(
    v.key.customerBpId,
    v.key.productId,
    v.key.orderType,
  );
  try {
    const prior = await prisma.priceListEntry.findUnique({
      where: whereKey(v.key),
      select: {
        baseUnitPrice: true,
        validFrom: true,
        validUntil: true,
        isActive: true,
      },
    });
    await prisma.$transaction([
      // Replace the tier set (quote_items keep history via ON DELETE SET NULL).
      prisma.priceListTier.deleteMany({ where: { ...v.key } }),
      prisma.priceListEntry.update({
        where: whereKey(v.key),
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
      recordId: entryId,
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
    revalidate(v.key);
    return actionOk({ entryId });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "価格表の更新に失敗しました"));
  }
}

// ── 種別追加 / 別の顧客・製品へコピー（新規エントリ作成） ────────────────────

const createInput = z.object({
  key: keySchema,
  baseUnitPrice: z.number().min(0),
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
  tiers: z.array(tierSchema).min(1, "段階を1件以上追加してください"),
  /** コピー元の試算リンクは引き継がない（手動エントリとして作成）。 */
});

export type PriceEntryCreateInput = z.infer<typeof createInput>;

export async function createPriceEntry(
  payload: PriceEntryCreateInput,
): Promise<ActionResult<{ entryId: string }>> {
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const entryId = priceEntryKey(
    v.key.customerBpId,
    v.key.productId,
    v.key.orderType,
  );
  try {
    await prisma.priceListEntry.create({
      data: {
        ...v.key,
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
    await recordAudit({
      action: "CREATE",
      tableName: "price_list_entries",
      recordId: entryId,
      after: {
        baseUnitPrice: v.baseUnitPrice,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        isActive: v.isActive,
        tierCount: v.tiers.length,
      },
    });
    revalidate(v.key);
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

/** 別の顧客・製品へコピー — source の基準単価・通貨・tiers を新キーへ複製。 */
export async function copyPriceEntry(payload: {
  sourceKey: EntryKeyInput;
  targetKey: EntryKeyInput;
  validFrom: string;
  validUntil: string | null;
}): Promise<ActionResult<{ entryId: string }>> {
  const source = await prisma.priceListEntry.findUnique({
    where: whereKey(payload.sourceKey),
    include: { tiers: true },
  });
  if (!source) return actionError("コピー元の価格表が見つかりません");
  return createPriceEntry({
    key: payload.targetKey,
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

/** 有効期間の変更（複合キーでは同一キーの複製は不可 — 期間を付け替える）。 */
export async function changePriceEntryPeriod(payload: {
  key: EntryKeyInput;
  validFrom: string;
  validUntil: string | null;
}): Promise<ActionResult> {
  const period = periodSchema.safeParse(payload);
  if (!period.success) {
    return actionError(period.error.issues[0]?.message ?? "入力が不正です");
  }
  try {
    await prisma.priceListEntry.update({
      where: whereKey(payload.key),
      data: {
        validFrom: new Date(payload.validFrom),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: priceEntryKey(
        payload.key.customerBpId,
        payload.key.productId,
        payload.key.orderType,
      ),
      after: { validFrom: payload.validFrom, validUntil: payload.validUntil },
    });
    revalidate(payload.key);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "有効期間の変更に失敗しました"));
  }
}

// ── 状態・削除（一覧の一括操作にも使用） ─────────────────────────────────────

export async function setPriceEntriesActive(
  keys: EntryKeyInput[],
  isActive: boolean,
): Promise<ActionResult> {
  if (keys.length === 0) return actionError("対象が選択されていません");
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
    for (const key of keys) {
      revalidate(key);
      await recordAudit({
        action: "UPDATE",
        tableName: "price_list_entries",
        recordId: priceEntryKey(key.customerBpId, key.productId, key.orderType),
        after: { isActive },
      });
    }
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deletePriceEntries(
  keys: EntryKeyInput[],
): Promise<ActionResult> {
  if (keys.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.$transaction(
      keys.flatMap((key) => [
        prisma.priceListDiscount.deleteMany({ where: { ...key } }),
        prisma.priceListTier.deleteMany({ where: { ...key } }),
        prisma.priceListEntry.delete({ where: whereKey(key) }),
      ]),
    );
    revalidate();
    for (const key of keys) {
      await recordAudit({
        action: "DELETE",
        tableName: "price_list_entries",
        recordId: priceEntryKey(key.customerBpId, key.productId, key.orderType),
      });
    }
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "価格表の削除に失敗しました"));
  }
}

// ── 値引きルール ─────────────────────────────────────────────────────────────

const discountInput = z.object({
  key: keySchema,
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

export type DiscountRuleInput = z.infer<typeof discountInput>;

export async function saveDiscountRule(
  payload: DiscountRuleInput,
): Promise<ActionResult> {
  const parsed = discountInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
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
      await prisma.priceListDiscount.create({ data: { ...v.key, ...data } });
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: priceEntryKey(
        v.key.customerBpId,
        v.key.productId,
        v.key.orderType,
      ),
      after: {
        discountRule: v.label,
        discountType: v.discountType,
        value: v.value,
        isActive: v.isActive,
      },
    });
    revalidate(v.key);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "値引きルールの保存に失敗しました"),
    );
  }
}

export async function deleteDiscountRule(
  key: EntryKeyInput,
  id: string,
): Promise<ActionResult> {
  try {
    await prisma.priceListDiscount.delete({ where: { id } });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: priceEntryKey(key.customerBpId, key.productId, key.orderType),
      after: { discountRuleDeleted: true },
    });
    revalidate(key);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "値引きルールの削除に失敗しました"),
    );
  }
}
