"use server";

/**
 * Server Actions — 価格表 (sales.price_list_entries + variants + tiers +
 * discounts).
 *
 * Entries are keyed (year_month, seq) — 価格表番号 PRC-YYYYMM-NNNNN はキーから
 * 導出され URL id にも使う。自然キー（顧客, 製品）は UNIQUE として保持し、
 * 識別（重複防止）にのみ使う。注文種別ごとの価格は price_list_variants で、
 * tiers/discounts は variant_id でぶら下がる。
 *
 * 作成は顧客×製品から行い、製品にリンクされた確定済み試算をバリアントの
 * 基準単価ソースに選択できる（初回使用時に試算を REGISTERED へロック）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requiresEndDate } from "@/components/sales/price-lists/model";
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
import { type EstimateSource, fetchEstimateSourcesForProduct } from "./data";

const BASE_PATH = "/sales/price-lists";
const SCOPE_DENIED = "この操作の権限がありません（対象範囲外）";

/**
 * 対象エントリ（複数可）がスコープ内か（OWN 行チェック）。ALL は素通し。
 * 不存在キーは true — 既存の not-found 系エラー処理に委ねる。
 */
async function entriesInScope(
  access: Access,
  userId: string,
  keys: DocKey[],
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const rows = await prisma.priceListEntry.findMany({
    where: { OR: keys.map((k) => ({ yearMonth: k.yearMonth, seq: k.seq })) },
    select: { createdBy: true },
  });
  return rows.every((r) =>
    rowInScope(access, { createdBy: r.createdBy }, userId),
  );
}

const orderTypeSchema = z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]);

// 自然キー（新規作成・コピー先の識別に使用）
const identitySchema = z.object({
  customerBpId: z.string().min(1, "顧客を選択してください"),
  // UI からは文字列（Select 値）で届く — DB は内部 id（int）
  productId: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1)),
});

const tierSchema = z.object({
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().nullable(),
  multiplier: z.number().min(0.01),
  priceOverride: z.number().min(0).nullable(),
});

const variantSchema = z.object({
  /** price_list_variants.id — null = 新規バリアント。 */
  id: z.string().nullable(),
  orderType: orderTypeSchema,
  baseUnitPrice: z.number().min(0),
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
  /** 基準単価ソースの試算番号 EST-…（手動設定は null。新規バリアントのみ有効）。 */
  estimateNumber: z.string().nullable(),
  tiers: z.array(tierSchema).min(1, "段階を1件以上追加してください"),
});

export type PriceVariantInput = z.input<typeof variantSchema>;

/** クライアントから受け取る自然キー（productId は文字列でも可）。 */
export type EntryIdentityPayload = z.input<typeof identitySchema>;

function keyOf(entryNumber: string): DocKey | null {
  return parseDocKey(entryNumber, "PRC");
}

function whereKey(key: DocKey) {
  return { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } };
}

function variantWhere(key: DocKey) {
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

/** バリアント配列の共通検証（種別重複・TEST/SAMPLE の終了日必須）。 */
function validateVariants(
  variants: z.infer<typeof variantSchema>[],
): string | null {
  const seen = new Set<string>();
  for (const v of variants) {
    if (seen.has(v.orderType)) return "同じ注文種別が重複しています";
    seen.add(v.orderType);
    if (requiresEndDate(v.orderType) && !v.validUntil) {
      return "テスト・サンプルの価格は有効終了日が必要です";
    }
  }
  return null;
}

/**
 * 基準単価ソースの試算を解決 — CONFIRMED / REGISTERED のみ許可。
 * 返り値の needsLock = 初回使用（CONFIRMED → REGISTERED へのロックが必要）。
 */
async function resolveEstimateSource(
  estimateNumber: string,
): Promise<
  { ok: true; key: DocKey; needsLock: boolean } | { ok: false; error: string }
> {
  const key = parseDocKey(estimateNumber, "EST");
  if (!key) return { ok: false, error: "試算番号が不正です" };
  const estimate = await prisma.estimate.findUnique({
    where: whereKey(key),
    select: { status: true },
  });
  if (!estimate) return { ok: false, error: "試算が見つかりません" };
  if (estimate.status === "DRAFT") {
    return { ok: false, error: "確定済みの試算のみ価格表に使用できます" };
  }
  return { ok: true, key, needsLock: estimate.status === "CONFIRMED" };
}

function tierCreates(tiers: z.infer<typeof tierSchema>[]) {
  return tiers.map((t, i) => ({
    minQuantity: t.minQuantity,
    maxQuantity: t.maxQuantity,
    multiplier: t.multiplier,
    priceOverride: t.priceOverride,
    sortOrder: i,
  }));
}

/** 価格表作成フォーム用 — 製品にリンクされた試算（基準単価ソース候補）。 */
export async function fetchEstimateSources(
  productId: string | number,
): Promise<ActionResult<EstimateSource[]>> {
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return actionError(authz.error);
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) return actionOk([]);
  try {
    return actionOk(await fetchEstimateSourcesForProduct(id));
  } catch (e) {
    return actionError(prismaErrorMessage(e, "試算の取得に失敗しました"));
  }
}

// ── 新規作成（顧客×製品 + バリアント一式） ───────────────────────────────────

const createInput = z.object({
  identity: identitySchema,
  variants: z
    .array(variantSchema)
    .min(1, "注文種別の価格を1件以上追加してください"),
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
  const variantError = validateVariants(v.variants);
  if (variantError) return actionError(variantError);
  try {
    // 試算ソースを検証（初回使用の試算はロック対象として控える）。
    const locks: { number: string; key: DocKey }[] = [];
    const estimateKeys = new Map<string, DocKey>();
    for (const variant of v.variants) {
      if (!variant.estimateNumber) continue;
      const source = await resolveEstimateSource(variant.estimateNumber);
      if (!source.ok) return actionError(source.error);
      estimateKeys.set(variant.estimateNumber, source.key);
      if (source.needsLock) {
        locks.push({ number: variant.estimateNumber, key: source.key });
      }
    }
    const key = await allocateDocumentKey("PRICE_LIST");
    await prisma.$transaction([
      prisma.priceListEntry.create({
        data: {
          yearMonth: key.yearMonth,
          seq: key.seq,
          ...v.identity,
          createdBy: authz.userId,
          variants: {
            create: v.variants.map((variant) => {
              const estKey = variant.estimateNumber
                ? estimateKeys.get(variant.estimateNumber)
                : undefined;
              return {
                orderType: variant.orderType,
                baseUnitPrice: variant.baseUnitPrice,
                validFrom: new Date(variant.validFrom),
                validUntil: variant.validUntil
                  ? new Date(variant.validUntil)
                  : null,
                isActive: variant.isActive,
                estimateYearMonth: estKey?.yearMonth ?? null,
                estimateSeq: estKey?.seq ?? null,
                tiers: { create: tierCreates(variant.tiers) },
              };
            }),
          },
        },
      }),
      ...locks.map((l) =>
        prisma.estimate.update({
          where: whereKey(l.key),
          data: { status: "REGISTERED", registeredAt: new Date() },
        }),
      ),
    ]);
    const entryId = formatPriceListNumber(key);
    await recordAudit({
      action: "CREATE",
      tableName: "price_list_entries",
      recordId: entryId,
      after: {
        customerBpId: v.identity.customerBpId,
        productId: v.identity.productId,
        orderTypes: v.variants.map((x) => x.orderType),
        estimateSources: v.variants
          .map((x) => x.estimateNumber)
          .filter(Boolean),
      },
    });
    for (const l of locks) {
      await recordAudit({
        action: "UPDATE",
        tableName: "estimates",
        recordId: l.number,
        before: { status: "CONFIRMED" },
        after: { status: "REGISTERED", priceListEntry: entryId },
      });
      revalidatePath(`/sales/trial-estimates/${l.number}`);
    }
    revalidatePath("/sales/trial-estimates");
    revalidate(entryId);
    return actionOk({ entryId });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    if (code === "P2002") {
      return actionError(
        "同一の顧客・製品の価格表が既に存在します。既存の価格表を編集してください。",
      );
    }
    return actionError(prismaErrorMessage(e, "価格表の作成に失敗しました"));
  }
}

// ── entry update（状態 + バリアント一式の追加・変更・削除） ──────────────────

const updateInput = z.object({
  entryNumber: z.string().min(1),
  isActive: z.boolean(),
  variants: z
    .array(variantSchema)
    .min(1, "注文種別の価格を1件以上追加してください"),
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
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(SCOPE_DENIED);
  }
  const variantError = validateVariants(v.variants);
  if (variantError) return actionError(variantError);
  try {
    const existing = await prisma.priceListVariant.findMany({
      where: variantWhere(key),
      select: { id: true, orderType: true },
    });
    const existingIds = new Set(existing.map((x) => x.id));
    const keptIds = new Set(
      v.variants.map((x) => x.id).filter((id): id is string => !!id),
    );
    for (const id of keptIds) {
      if (!existingIds.has(id)) return actionError("バリアントが不正です");
    }
    const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

    // 新規バリアントの試算ソースを検証（既存バリアントのリンクは不変）。
    const locks: { number: string; key: DocKey }[] = [];
    const estimateKeys = new Map<string, DocKey>();
    for (const variant of v.variants) {
      if (variant.id || !variant.estimateNumber) continue;
      const source = await resolveEstimateSource(variant.estimateNumber);
      if (!source.ok) return actionError(source.error);
      estimateKeys.set(variant.estimateNumber, source.key);
      if (source.needsLock) {
        locks.push({ number: variant.estimateNumber, key: source.key });
      }
    }

    await prisma.$transaction([
      prisma.priceListEntry.update({
        where: whereKey(key),
        data: { isActive: v.isActive },
      }),
      // 削除されたバリアント（値引き → tier → 本体の順）。
      ...(removedIds.length
        ? [
            prisma.priceListDiscount.deleteMany({
              where: { variantId: { in: removedIds } },
            }),
            prisma.priceListTier.deleteMany({
              where: { variantId: { in: removedIds } },
            }),
            prisma.priceListVariant.deleteMany({
              where: { id: { in: removedIds } },
            }),
          ]
        : []),
      // 既存バリアント: 値のみ更新 + tier セット差し替え
      // (quote_items keep history via ON DELETE SET NULL).
      ...v.variants
        .filter((x): x is typeof x & { id: string } => !!x.id)
        .flatMap((variant) => [
          prisma.priceListTier.deleteMany({
            where: { variantId: variant.id },
          }),
          prisma.priceListVariant.update({
            where: { id: variant.id },
            data: {
              baseUnitPrice: variant.baseUnitPrice,
              validFrom: new Date(variant.validFrom),
              validUntil: variant.validUntil
                ? new Date(variant.validUntil)
                : null,
              isActive: variant.isActive,
              tiers: { create: tierCreates(variant.tiers) },
            },
          }),
        ]),
      // 新規バリアント
      ...v.variants
        .filter((x) => !x.id)
        .map((variant) => {
          const estKey = variant.estimateNumber
            ? estimateKeys.get(variant.estimateNumber)
            : undefined;
          return prisma.priceListVariant.create({
            data: {
              ...variantWhere(key),
              orderType: variant.orderType,
              baseUnitPrice: variant.baseUnitPrice,
              validFrom: new Date(variant.validFrom),
              validUntil: variant.validUntil
                ? new Date(variant.validUntil)
                : null,
              isActive: variant.isActive,
              estimateYearMonth: estKey?.yearMonth ?? null,
              estimateSeq: estKey?.seq ?? null,
              tiers: { create: tierCreates(variant.tiers) },
            },
          });
        }),
      ...locks.map((l) =>
        prisma.estimate.update({
          where: whereKey(l.key),
          data: { status: "REGISTERED", registeredAt: new Date() },
        }),
      ),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: v.entryNumber,
      after: {
        isActive: v.isActive,
        orderTypes: v.variants.map((x) => x.orderType),
        removedVariants: removedIds.length,
      },
    });
    for (const l of locks) {
      await recordAudit({
        action: "UPDATE",
        tableName: "estimates",
        recordId: l.number,
        before: { status: "CONFIRMED" },
        after: { status: "REGISTERED", priceListEntry: v.entryNumber },
      });
      revalidatePath(`/sales/trial-estimates/${l.number}`);
    }
    revalidate(v.entryNumber);
    return actionOk({ entryId: v.entryNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "価格表の更新に失敗しました"));
  }
}

// ── 別の顧客・製品へコピー（新規エントリ作成） ───────────────────────────────

/**
 * 別の顧客・製品へコピー — source の全バリアント（基準単価・tiers）を新エントリ
 * へ複製する。試算リンクは引き継がない（手動エントリとして作成）。指定した
 * 有効期間を全バリアントに適用する。
 */
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
  if (!(await entriesInScope(authz.access, authz.userId, [sourceKey]))) {
    return actionError(SCOPE_DENIED);
  }
  const source = await prisma.priceListEntry.findUnique({
    where: whereKey(sourceKey),
    include: { variants: { include: { tiers: true } } },
  });
  if (!source) return actionError("コピー元の価格表が見つかりません");
  return createPriceEntry({
    identity: payload.targetIdentity,
    variants: source.variants.map((variant) => ({
      id: null,
      orderType: variant.orderType,
      baseUnitPrice: Number(variant.baseUnitPrice),
      validFrom: payload.validFrom,
      validUntil: payload.validUntil,
      isActive: true,
      estimateNumber: null,
      tiers: variant.tiers
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({
          minQuantity: t.minQuantity,
          maxQuantity: t.maxQuantity,
          multiplier: Number(t.multiplier),
          priceOverride:
            t.priceOverride != null ? Number(t.priceOverride) : null,
        })),
    })),
  });
}

/** 有効期間の変更 — バリアント単位（自然キーは不変 — 期間を付け替える）。 */
export async function changePriceEntryPeriod(payload: {
  entryNumber: string;
  variantId: string;
  validFrom: string;
  validUntil: string | null;
}): Promise<ActionResult> {
  const period = z
    .object({
      variantId: z.string().min(1, "注文種別を選択してください"),
      validFrom: z.string().min(1, "有効開始日を選択してください"),
      validUntil: z.string().nullable(),
    })
    .safeParse(payload);
  if (!period.success) {
    return actionError(period.error.issues[0]?.message ?? "入力が不正です");
  }
  const key = keyOf(payload.entryNumber);
  if (!key) return actionError("価格表番号が不正です");
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const variant = await prisma.priceListVariant.findUnique({
      where: { id: payload.variantId },
      select: { entryYearMonth: true, entrySeq: true, orderType: true },
    });
    if (
      !variant ||
      variant.entryYearMonth !== key.yearMonth ||
      variant.entrySeq !== key.seq
    ) {
      return actionError("バリアントが不正です");
    }
    if (requiresEndDate(variant.orderType) && !payload.validUntil) {
      return actionError("テスト・サンプルの価格は有効終了日が必要です");
    }
    await prisma.priceListVariant.update({
      where: { id: payload.variantId },
      data: {
        validFrom: new Date(payload.validFrom),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: payload.entryNumber,
      after: {
        orderType: variant.orderType,
        validFrom: payload.validFrom,
        validUntil: payload.validUntil,
      },
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
  if (!(await entriesInScope(authz.access, authz.userId, keys))) {
    return actionError(SCOPE_DENIED);
  }
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
  if (!(await entriesInScope(authz.access, authz.userId, keys))) {
    return actionError(SCOPE_DENIED);
  }
  try {
    await prisma.$transaction(
      keys.flatMap((key) => [
        prisma.priceListDiscount.deleteMany({
          where: { variant: variantWhere(key) },
        }),
        prisma.priceListTier.deleteMany({
          where: { variant: variantWhere(key) },
        }),
        prisma.priceListVariant.deleteMany({ where: variantWhere(key) }),
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

// ── 値引きルール（バリアント単位） ───────────────────────────────────────────

const discountInput = z.object({
  entryNumber: z.string().min(1),
  variantId: z.string().min(1, "注文種別を選択してください"),
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
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(SCOPE_DENIED);
  }
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
    const variant = await prisma.priceListVariant.findUnique({
      where: { id: v.variantId },
      select: { entryYearMonth: true, entrySeq: true },
    });
    if (
      !variant ||
      variant.entryYearMonth !== key.yearMonth ||
      variant.entrySeq !== key.seq
    ) {
      return actionError("バリアントが不正です");
    }
    if (v.id) {
      await prisma.priceListDiscount.update({ where: { id: v.id }, data });
    } else {
      await prisma.priceListDiscount.create({
        data: { variantId: v.variantId, ...data },
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
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(SCOPE_DENIED);
  }
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
